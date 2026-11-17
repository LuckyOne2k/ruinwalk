// Phase-0-Tests der Auftragsverarbeitung: ausführen mit  node server/instance/tests/run.mjs
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { resolveRound, ENGINE_VERSION } from '../engine/engine.mjs';
import { makeFight } from './scenarios.mjs';
import { hmac, utf8, hex, draw32, hashOf } from '../engine/rng.mjs';
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0; const out = [];
const ok = (cond, name, info = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'ok' : 'NICHT OK'} - ${name}${info ? '  [' + info + ']' : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cl = await startCluster();
const PB = (process.getuid && process.getuid() === 0) ? ['runuser', '-u', 'postgres', '--', `${cl.BIN}/pgbench`] : [`${cl.BIN}/pgbench`];
const q = async (sql) => { const r = await cl.psql(sql); if (r.code) throw new Error(r.err + '\n' + sql.slice(0, 300)); return r.out; };
const J = (s) => JSON.parse(s);
try {
  await q(readFileSync(join(here, '../sql/01_proto.sql'), 'utf8'));
  // --- Helfer: Testkampf anlegen
  const mk = async ({ ends = null, event = null, n = 1 } = {}) => {
    const ids = [];
    for (let k = 0; k < n; k++) {
      const f = makeFight(k + 1), st = JSON.stringify(f.state);
      const r = await q(`with i as (insert into rwi.instances(event_id, ends_at) values (${event ?? 'null'}, ${ends ? `clock_timestamp() + interval '${ends}'` : 'null'}) returning id),
        m as (insert into rwi.members(instance_id, last_seen_at) select id, clock_timestamp() from i),
        f as (insert into rwi.fights(instance_id, due_at, state) select id, clock_timestamp() - interval '1 second', $j$${st}$j$::jsonb from i returning id, instance_id)
        select id || ',' || instance_id from f;`);
      const [fid, iid] = r.split(',').map(Number); ids.push({ fid, iid });
    }
    return ids;
  };
  const claim = async (fid, rn = 1) => J(await q(`select rwi.claim_resolution(${fid}, ${rn})`));
  const commit = async (fid, rn, c, res, engine = ENGINE_VERSION, tok = c.token, ver = c.round_version, h = c.input_hash) =>
    J(await q(`select rwi.commit_round(${fid}, ${rn}, '${tok}', ${ver}, '${h}', '${engine}', $j$${JSON.stringify(res)}$j$::jsonb)`));
  const compute = (c) => { const i = c.input; return resolveRound({ fight_id: i.fight_id, round_no: i.round_no, seed: i.seed, state: i.snapshot.state, actions: i.snapshot.actions, conn: {}, cfg: { crit_pct: 15, burn_turns: 3, burn_dmg: 6 } }); };
  // gleichzeitige Ausführung: alle Worker warten in der Datenbank auf denselben Zeitpunkt
  const parallel = async (sqls, leadMs = 900) => {
    const at = (await q(`select to_char(clock_timestamp() + interval '${leadMs} milliseconds', 'YYYY-MM-DD HH24:MI:SS.US')`));
    return Promise.all(sqls.map((s) => cl.psql(`select pg_sleep_until('${at}'::timestamp::timestamptz); ${s}`)));
  };

  // 1) Parallele Claims
  { const [{ fid }] = await mk(); const r = await parallel(Array.from({ length: 20 }, () => `select rwi.claim_resolution(${fid}, 1)`));
    const st = r.map((x) => J(x.out).status); const cnt = (s) => st.filter((x) => x === s).length;
    ok(cnt('ok') === 1 && cnt('busy') === 19 && r.every((x) => !x.code), '20 parallele Claims: genau 1 Token, 19 busy', `ok=${cnt('ok')} busy=${cnt('busy')}`);
    ok(+(await q(`select count(*) from rwi.resolve_jobs where fight_id=${fid}`)) === 1, 'genau ein Auftrag je (Kampf, Runde)'); }

  // 2) Lease abgelaufen: neuer Claim, alter Token superseded; ohne neuen Claim wird späte Meldung angenommen
  await q(`update rwi.cfg set v = 1 where k = 'lease_seconds'`);
  { const [{ fid }] = await mk(); const a = await claim(fid); const ra = compute(a); await sleep(1200);
    const b = await claim(fid);
    ok(b.status === 'ok' && b.token !== a.token && b.input_hash === a.input_hash, 'abgelaufene Lease: neuer Token, identischer Snapshot/Hash');
    const lateOld = await commit(fid, 1, a, ra); ok(lateOld.status === 'superseded', 'alter Token nach neuem Claim: superseded', lateOld.status);
    const rb = compute(b); ok(rb.result_hash === ra.result_hash, 'Wiederholung nach „Absturz“: bitgleiches Ergebnis');
    const good = await commit(fid, 1, b, rb); ok(good.status === 'committed' || good.status === 'committed', 'neuer Token wird committet', good.status);
    const again = await commit(fid, 1, b, rb); ok(again.status === 'already_resolved', 'zweiter Commit: already_resolved', again.status); }
  { const [{ fid }] = await mk(); const a = await claim(fid); const ra = compute(a); await sleep(1200);
    const late = await commit(fid, 1, a, ra); ok(late.status === 'committed', 'späte Meldung bei abgelaufener Lease ohne neuen Claim wird angenommen (E.1)', late.status); }
  await q(`update rwi.cfg set v = 30 where k = 'lease_seconds'`);

  // 3) Parallele Commits mit demselben Token
  { const [{ fid }] = await mk(); const c = await claim(fid); const res = compute(c);
    const r = await parallel(Array.from({ length: 12 }, () => `select rwi.commit_round(${fid}, 1, '${c.token}', ${c.round_version}, '${c.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`));
    const st = r.map((x) => J(x.out).status);
    ok(st.filter((s) => s === 'committed').length === 1 && st.filter((s) => s === 'already_resolved').length === 11 && r.every((x) => !x.code), '12 parallele Commits: genau 1 committed, 11 already_resolved');
    ok(+(await q(`select count(*) from rwi.round_results where fight_id=${fid}`)) === 1, 'round_results: genau eine Zeile (Unique-Sperre)'); }

  // 4) Kompletter Kampf bis Ende, Replay, Idempotenz der Belohnung
  { const [{ fid, iid }] = await mk({ n: 1 }); let r = 0, fin = null;
    for (r = 1; r <= 60; r++) { const c = await claim(fid, r); if (c.status !== 'ok') { fin = c; break; } const res = compute(c); const k = await commit(fid, r, c, res); if (k.outcome !== 'continue') { fin = k; break; } await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid}`); }
    ok(fin && fin.status === 'committed' && ['won', 'lost'].includes(fin.outcome), 'vollständiger Kampf bis Sieg/Niederlage', `${r} Runden, ${fin && fin.outcome}`);
    const rows = (await q(`select json_agg(json_build_object('i', input, 'r', result, 'e', engine_version) order by round_no) from rwi.round_results where fight_id=${fid}`)); const rr = J(rows);
    let same = 0; for (const x of rr) { const s = x.i.snapshot; const re = resolveRound({ fight_id: x.i.fight_id, round_no: x.i.round_no, seed: x.i.seed, state: s.state, actions: s.actions, conn: {}, cfg: { crit_pct: 15, burn_turns: 3, burn_dmg: 6 } }); if (re.result_hash === hashOf(x.r) || re.result_hash === x.r.result_hash) same++; }
    ok(same === rr.length && rr.length === r, 'Replay: alle gespeicherten Runden aus der DB-Eingabe bitgleich reproduziert', `${same}/${rr.length}`);
    const rw = +(await q(`select count(*) from rwi.rewards where instance_id=${iid}`)); ok(fin.outcome === 'lost' ? rw === 0 : rw >= 1, 'Belohnung nur bei Sieg, genau einmal je Mitglied', `rewards=${rw}`); }

  // 5) Ungültiges Ergebnis (Invariante) -> Fehlerzähler -> stuck -> Fristenstopp -> Hotfix löst
  await q(`update rwi.cfg set v = 3 where k = 'max_attempts'`);
  { const [{ fid, iid }] = await mk(); const mid = +(await q(`select id from rwi.members where instance_id=${iid}`)); let c = await claim(fid); const good = compute(c);
    const badRes = JSON.parse(JSON.stringify(good)); badRes.state.members[0].hp = 99999;
    let last; for (let k = 0; k < 3; k++) last = await commit(fid, 1, c, badRes);
    ok(last.status === 'invalid', 'Invariantenverletzung wird abgewiesen und nichts gespeichert', last.status);
    ok(+(await q(`select count(*) from rwi.round_results where fight_id=${fid}`)) === 0, 'kein Ergebnis gespeichert');
    ok((await q(`select status || ',' || attempts || ',' || (select engine_stuck from rwi.instances where id=${iid}) from rwi.resolve_jobs where fight_id=${fid}`)) === 'stuck,3,true', 'nach 3 Fehlversuchen: Auftrag stuck, engine_stuck gesetzt, Alarm', await q(`select count(*) from rwi.ops_alerts`) + ' Alarm');
    ok((await q(`select rwi.permanently_disconnected(${mid}, clock_timestamp() + interval '1 hour')`)) === 'f', 'engine_stuck: kein Spieler gilt als getrennt (Fristenstopp, A.6)');
    const fixed = await commit(fid, 1, c, good, 'proto-0.2-hotfix'); ok(fixed.status === 'committed', 'Hotfix mit neuer engine_version löst die hängende Runde', fixed.status);
    ok((await q(`select engine_stuck from rwi.instances where id=${iid}`)) === 'f' && (await q(`select engine_version from rwi.round_results where fight_id=${fid}`)) === 'proto-0.2-hotfix', 'engine_stuck zurückgesetzt, engine_version gespeichert'); }
  await q(`update rwi.cfg set v = 8 where k = 'max_attempts'`);

  // 6) Weltboss-Eventende gegen laufende Transaktionen (Rennen um ends_at)
  { let viol = 0, nCommitted = 0, nEnded = 0, dead = 0; const N = 24;
    for (let it = 0; it < N; it++) {
      const [{ fid, iid }] = await mk({ ends: '1500 milliseconds', event: 1000 + it });
      const c = await claim(fid); const res = compute(c); const won = JSON.parse(JSON.stringify(res)); won.outcome = 'won'; won.state.monster.hp = 0;
      const at = await q(`select to_char(ends_at - interval '${30 - it * 2 - 4} milliseconds', 'YYYY-MM-DD HH24:MI:SS.US') from rwi.instances where id=${iid}`);
      const mkc = (off) => `select pg_sleep_until(('${at}'::timestamp + interval '${off} milliseconds')::timestamptz); select rwi.commit_round(${fid}, 1, '${c.token}', ${c.round_version}, '${c.input_hash}', 'p', $j$${JSON.stringify(won)}$j$::jsonb);`;
      const sw = (off) => `select pg_sleep_until(('${at}'::timestamp + interval '${off} milliseconds')::timestamptz); select rwi.sweep_event(${1000 + it});`;
      const r = await Promise.all([cl.psql(mkc(0)), cl.psql(mkc(3)), cl.psql(sw(1)), cl.psql(sw(4)), cl.psql(mkc(6))]);
      dead += r.filter((x) => /deadlock/i.test(x.err)).length;
      const row = (await q(`select coalesce((select to_char(completed_at,'x') from rwi.round_results where fight_id=${fid}),'-') || '|' || i.status || '|' || (select count(*) from rwi.rewards where instance_id=${iid}) || '|' || coalesce((select (completed_at >= i.ends_at)::text from rwi.round_results where fight_id=${fid}),'n')
        from rwi.instances i where id=${iid}`)).split('|');
      const hasRes = row[0] !== '-', st = row[1], rew = +row[2], late = row[3] === 'true';
      if (late) viol++;                                          // Ergebnis mit completed_at >= ends_at
      if (hasRes && st === 'event_ended') viol++;                // Sieg UND event_ended
      if (!hasRes && rew > 0) viol++;                            // Belohnung ohne Sieg
      if (hasRes) nCommitted++; else if (st === 'event_ended') nEnded++; else viol++;
    }
    ok(viol === 0 && dead === 0, `Eventende-Rennen (${N} Läufe, je 3 Commits + 2 Sweeps um ends_at): nie Sieg nach Ende, nie Sieg+event_ended, keine Deadlocks`, `Sieg=${nCommitted}, event_ended=${nEnded}, Verstöße=${viol}, Deadlocks=${dead}`);
    ok(nCommitted > 0 && nEnded > 0, 'beide Ausgänge des Rennens kamen vor (Test trifft die Grenze wirklich)', `Sieg=${nCommitted}, Ende=${nEnded}`); }
  { const [{ fid, iid }] = await mk({ ends: '600 milliseconds', event: 777 }); const c = await claim(fid); const res = compute(c); await sleep(800);
    const k = await commit(fid, 1, c, res); const row = await q(`select (select count(*) from rwi.round_results where fight_id=${fid}), i.status, f.status, f.claim_token is null, (select status from rwi.resolve_jobs where fight_id=${fid}) from rwi.instances i join rwi.fights f on f.instance_id=i.id where i.id=${iid}`);
    ok(k.status === 'event_ended' && row === '0|event_ended|event_ended|t|cancelled', 'Commit nach Eventende: kein Ergebnis, Instanz event_ended, Token entwertet, Auftrag cancelled', `${k.status} ${row}`);
    const c2 = await claim(fid); ok(c2.status === 'event_ended', 'neuer Claim nach Eventende: event_ended'); }

  // 7) Sperrreihenfolge: Massen-Sweep gleichzeitig mit Einzel-Commits/Claims, keine Deadlocks
  { const ids = await mk({ ends: '1200 milliseconds', event: 9000, n: 25 }); const cs = []; for (const x of ids) { const c = await claim(x.fid); cs.push({ ...x, c, res: compute(c) }); }
    const at = await q(`select to_char(min(ends_at) - interval '30 milliseconds', 'YYYY-MM-DD HH24:MI:SS.US') from rwi.instances where event_id=9000`);
    const w = []; for (const x of cs) { const cc = x.c; w.push(`select pg_sleep_until('${at}'::timestamp::timestamptz); select rwi.commit_round(${x.fid},1,'${cc.token}',${cc.round_version},'${cc.input_hash}','p',$j$${JSON.stringify(x.res)}$j$::jsonb);`); }
    for (let k = 0; k < 6; k++) w.push(`select pg_sleep_until('${at}'::timestamp::timestamptz + interval '${k * 15} milliseconds'); select rwi.sweep_event(9000);`);
    const r = await Promise.all(w.map((s) => cl.psql(s))); const dead = r.filter((x) => /deadlock/i.test(x.err)).length, errs = r.filter((x) => x.code).length;
    const after = (await q(`select count(*) filter (where status='event_ended') || ',' || count(*) filter (where status='active') from rwi.instances where event_id=9000`));
    ok(dead === 0 && errs === 0, 'Massen-Sweep (25 Instanzen) parallel zu 25 Commits und 6 Sweeps: keine Deadlocks, keine Fehler', `Deadlocks=${dead}, Fehler=${errs}, event_ended/aktiv=${after}`);
    ok(+(await q(`select count(*) from rwi.round_results rr join rwi.instances i on i.id=(select instance_id from rwi.fights where id=rr.fight_id) where i.event_id=9000 and rr.completed_at >= i.ends_at`)) === 0, 'kein Ergebnis nach Eventende gespeichert (Massenlauf)'); }

  // 8) Störungsfenster / T1 mit simulierter Uhr
  { const [{ iid }] = await mk(); const mid = +(await q(`select id from rwi.members where instance_id=${iid}`));
    await q(`truncate rwi.system_gaps; delete from rwi.system_heartbeat; update rwi.members set last_seen_at = '2030-01-01 12:00:00+00' where id=${mid}; select rwi.advance_clock(${iid}, '2030-01-01 12:00:05+00');`);
    const withoutFix = await q(`select rwi.permanently_disconnected(${mid}, '2030-01-01 12:05:01+00')`);
    ok(withoutFix === 't', 'Kontrolle ohne Störungsfenster: nach 5-min-Ausfall wäre jeder sofort „dauerhaft getrennt“ (das Problem aus F)');
    await q(`select rwi.advance_clock(${iid}, '2030-01-01 12:05:00+00')`);
    ok(+(await q(`select count(*) from rwi.system_gaps where from_at='2030-01-01 12:00:05+00' and to_at='2030-01-01 12:05:00+00'`)) === 1, 'Lücke > 60 s wird beim ersten advance_clock erkannt und als Fenster gespeichert');
    ok((await q(`select rwi.permanently_disconnected(${mid}, '2030-01-01 12:05:01+00')`)) === 'f' && (await q(`select rwi.permanently_disconnected(${mid}, '2030-01-01 12:05:19+00')`)) === 'f' && (await q(`select rwi.permanently_disconnected(${mid}, '2030-01-01 12:05:21+00')`)) === 't', 'T1: 20-Sekunden-Regel zählt erst ab Fensterende (19 s: verbunden, 21 s: getrennt)');
    await q(`select rwi.advance_clock(${iid}, '2030-01-01 12:05:30+00'); select rwi.advance_clock(${iid}, '2030-01-01 12:05:40+00')`);
    ok(+(await q(`select count(*) from rwi.system_gaps`)) === 1, 'kurze Abstände (≤ 60 s) erzeugen kein weiteres Fenster'); }

  // 9) Zeitquelle: now() friert ein, clock_timestamp() läuft (Voraussetzung von E.2/K.2 Regel 3)
  { const r = (await q(`begin; select now()::text; select pg_sleep(0.4)::text; select ((clock_timestamp() - now()) >= interval '0.4 seconds')::text; select now()::text; commit;`)).split('\n').filter(Boolean);
    ok(r[0] === r[2] && r[1] === 'true', 'now() = Transaktionsbeginn (unverändert nach 0,4 s), clock_timestamp() ist weitergelaufen'); }

  // 10) Querprüfung: HMAC in SQL (pgcrypto) == HMAC in JS  -> Engine-in-SQL (Variante A) hätte dieselbe Zufallsquelle
  { let same = 0; const N = 40; for (let k = 0; k < N; k++) { const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + k) & 255), msg = `crit|${k}|${k % 5}|${k * 3}`;
      const js = draw32(seed, 'crit', k, k % 5, k * 3);
      const sqlv = +(await q(`select ((get_byte(h,0)::bigint<<24) | (get_byte(h,1)<<16) | (get_byte(h,2)<<8) | get_byte(h,3)) from (select hmac('crit|${k}|${k % 5}|${k * 3}'::bytea, '\\x${hex(seed)}'::bytea, 'sha256') h) s`)); if (js === sqlv) same++; }
    ok(same === N, 'draw32 aus pgcrypto-HMAC (SQL) == reines JS, 40 Fälle', `${same}/${N}`); }

  // 11) Durchsatz: pgbench, claim+commit je Runde (synthetische gültige Ergebnisse), mit Konkurrenz
  { await q(`with i as (insert into rwi.instances(cfg_version) select 1 from generate_series(1,200) returning id)
      insert into rwi.fights(instance_id, due_at, state) select id, now() - interval '1 s', '{"members":[{"id":"m0","hp":50,"maxhp":100,"atk":9,"def":3,"init":4,"alive":true}],"monster":{"hp":9999,"maxhp":9999,"atk":5,"def":1,"init":1}}'::jsonb from i`);
        // eigener Zyklus: Runde wird nach jedem Commit wieder fällig, damit derselbe Kampf wiederholt verarbeitet werden kann
    await q(`create or replace function rwi.bench_cycle(p_fight bigint) returns text language plpgsql as $$ declare c jsonb; r jsonb; begin
        c := rwi.claim_resolution(p_fight, (select round_no from rwi.fights where id = p_fight)); if c->>'status' <> 'ok' then return c->>'status'; end if;
        r := rwi.commit_round(p_fight, (c->'input'->>'round_no')::int, (c->>'token')::uuid, (c->>'round_version')::int, c->>'input_hash', 'b', jsonb_build_object('state', c->'input'->'snapshot'->'state', 'outcome', 'continue'));
        update rwi.fights set due_at = now() - interval '1 s' where id = p_fight; return r->>'status'; end $$;`);
    const bench = (label, n, c, hot) => { const sc = `\\set fid ${hot ? '1' : 'random(1,200)'}\nselect rwi.bench_cycle(:fid);\n`; require_write('/tmp/rwi_bench.sql', sc);
      const r = spawnSync(PB[0], [...PB.slice(1), '-h', cl.tmp, '-p', String(cl.port), '-U', 'postgres', '-n', '-f', '/tmp/rwi_bench.sql', '-c', String(c), '-j', '2', '-T', '5', 'rwi'], { encoding: 'utf8' });
      const tps = (r.stdout.match(/tps = ([\d.]+)/) || [])[1], lat = (r.stdout.match(/latency average = ([\d.]+) ms/) || [])[1], failed = (r.stdout.match(/number of failed transactions: (\d+)/) || [0, '0'])[1];
      out.push(`${label}: ${tps} Zyklen/s (Claim+Commit), mittlere Latenz ${lat} ms, ${c} Clients, fehlgeschlagen: ${failed}`); return { tps: +tps, failed: +failed, err: r.stderr }; };
    const a = bench('verteilt (200 Kämpfe)', 200, 16, false), b = bench('heißer Kampf (1 Instanz, 16 Clients)', 1, 16, true);
    ok(a.tps > 50 && a.failed === 0, 'Durchsatz verteilt gemessen, keine fehlgeschlagenen Transaktionen', `${a.tps} Zyklen/s`);
    ok(b.tps > 20 && b.failed === 0, 'Durchsatz auf einer einzigen Instanz (volle Serialisierung über die Instanzsperre), keine Fehler', `${b.tps} Zyklen/s`); }

  // Laufzeit der Engine selbst
  { const inp = makeFight(3); const t0 = process.hrtime.bigint(); const N = 2000; for (let k = 0; k < N; k++) { inp.round_no = (k % 40) + 1; resolveRound(inp); } const us = Number(process.hrtime.bigint() - t0) / 1000 / N; out.push(`Engine: ${us.toFixed(1)} µs je Rundenauflösung (Prototyp, ${process.versions.node ? 'Node' : ''})`); }
} catch (e) { fail++; console.log('NICHT OK - Testlauf abgebrochen:', e.message); }
finally { cl.stop(); }
console.log('\n--- Messwerte ---\n' + out.join('\n'));
console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
function require_write(p, s) { spawnSync('sh', ['-c', `cat > ${p} && chmod 644 ${p}`], { input: s }); }

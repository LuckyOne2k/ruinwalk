// K.2 Regel 4a-4d: Watchdog-Sperrreihenfolge, interne Sweeps, Endzustand nach Eventende, keine Anlage nach Eventende, Rennen.
// Aufruf: node server/instance/tests/eventende.mjs   (temporäres lokales PostgreSQL, nur Testdaten)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { newFight, nextFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
import { resolveRound } from '../engine/engine.mjs';
import { makeFight } from './scenarios.mjs';
import { decideRevive } from '../sim/bots.mjs';
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const cl = await startCluster(54397);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 300)); return r.out; };
const J = (s) => JSON.parse(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CFG = { bossHp: 150, bossAtk: 8 };
// Wartet, bis eine Bedingung in der Datenbank wahr ist (statt auf feste Zeiten zu vertrauen; CI-Rechner sind langsamer)
const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await cl.psql(`select ${cond}`)).out === 't') return true; await sleep(40); } return false; };
const sleeping = (tag) => `exists (select 1 from pg_stat_activity where query like '%${tag}%' and query not like '%pg_stat_activity%' and state = 'active' and wait_event = 'PgSleep')`;
const blocked = (tag) => `exists (select 1 from pg_stat_activity where query like '%${tag}%' and query not like '%pg_stat_activity%' and wait_event_type = 'Lock')`;
try {
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe']) await q(readFileSync(join(here, `../sql/${f}.sql`), 'utf8'));
  const KL = [['krieger', 'ritter'], ['bogenschuetze', 'jaeger'], ['magier', 'feuer'], ['heiler', 'priester'], ['heiler', 'natur'], ['krieger', 'berserker'], ['magier', 'frost'], ['bogenschuetze', 'fallensteller']];
  for (let n = 1; n <= 24; n++) { const [g, p] = KL[n % KL.length]; await q(`insert into rwi.players values ('u${n}', 10, '${g}', '${p}', 3)`); }
  const U = (...n) => n.map((x) => 'u' + x);
  const ts = async (ms) => `'${await q(`select to_char(clock_timestamp() + interval '${ms} milliseconds', 'YYYY-MM-DD HH24:MI:SS.US')`)}'::timestamp::timestamptz`;   // absolute Zeit als Literal
  const createSql = (players, ev, ends, fights = 1, kind = 'weltboss') => `select rwi.create_group('${kind}', array[${players.map((p) => `'${p}'`).join(',')}]::text[], ${fights}, ${ev}, ${ends})`;
  const create = async (players, ev, ends) => J(await q(createSql(players, ev, ends)));
  const instOf = async (iid) => J(await q(`select row_to_json(i) from (select status, stage, outcome from rwi.instances where id=${iid}) i`));

  // ===== 4d) keine Anlage nach Eventende =====
  { const X = await ts(60000); const r = await create(U(1, 2, 3, 4, 5, 6), 4001, X);
    ok(r.status === 'ok' && (await q(`select created_at < ends_at from rwi.instances where id=${r.instance}`)) === 't', '4d: Event läuft noch: Gruppe wird angelegt, Prüfzeitpunkt liegt vor dem Eventende'); }
  { const X = await ts(250); await sleep(400); const r = await create(U(1, 2, 3, 4, 5, 6), 4002, X);
    ok(r.status === 'event_ended' && +(await q(`select count(*) from rwi.instances where event_id=4002`)) === 0, '4d: Event endet unmittelbar vor dem Versuch: abgelehnt, nichts angelegt'); }
  { const X = await ts(-5000); const r = await create(U(1, 2, 3, 4, 5, 6), 4003, X);
    ok(r.status === 'event_ended' && +(await q(`select count(*) from rwi.instances where event_id=4003`)) === 0, '4d: Event ist längst abgelaufen: abgelehnt, nichts angelegt'); }
  { const X = await ts(700); const a = await create(U(1, 2, 3, 4, 5, 6), 4004, X); await sleep(900); await q(`select rwi.sweep_events()`);
    const r1 = await create(U(7, 8, 9, 10, 11, 12), 4004, X), r2 = await create(U(7, 8, 9, 10, 11, 12), 4004, await ts(60000));
    ok(a.status === 'ok' && r1.status === 'event_ended' && r2.status === 'event_ended', '4d: Event ist festgehalten beendet: weder mit alter noch mit einer neuen Endzeit lässt sich eine Gruppe anlegen'); }
  { const X = await ts(60000), X2 = await ts(120000); const a = await create(U(1, 2, 3, 4, 5, 6), 4005, X), b = await create(U(7, 8, 9, 10, 11, 12), 4005, X2), c = await create(U(7, 8, 9, 10, 11, 12), 4005, X);
    ok(a.status === 'ok' && b.status === 'event_mismatch' && c.status === 'ok', '4d: die Endzeit eines Events ist unveränderlich: abweichende Endzeit abgelehnt, gleiche akzeptiert'); }
  { // Die Prüfzeit wird erst nach der Sperre genommen: wer auf die Anlagesperre wartet und danach das Ende überschritten hat, bekommt keine Gruppe
    const hold = cl.psql(`begin; select pg_advisory_xact_lock(7001, hashtext('4300')); select pg_sleep(2.0); commit;`); await until(sleeping('pg_sleep(2.0)'));
    const X = await ts(900); const rp = create(U(1, 2, 3, 4, 5, 6), 4300, X);
    const waited = await until(blocked('create_group'), 5000);                                    // die Anlage steckt nachweislich in der Sperrwarteschlange
    const r = await rp; await hold;
    ok(waited && r.status === 'event_ended' && +(await q(`select count(*) from rwi.instances where event_id=4300`)) === 0, '4d: Anlage, die auf die Sperre wartet und dabei das Eventende erreicht, wird abgelehnt (Zeit erst nach der Sperre)', `${r.status} gewartet=${waited}`); }
  { let bothOk = 0, ended = 0, bad = 0, oneOne = 0;
    for (let k = 0; k < 18; k++) {
      const ev = 4100 + k, X = await ts(1000), d = (k % 9 - 4) * 12;          // Frist −48 … +48 ms um den Aufrufzeitpunkt
      const at = await q(`select to_char('${X.slice(1, 27)}'::timestamp + interval '${d} milliseconds', 'YYYY-MM-DD HH24:MI:SS.US')`);
      const mkc = (pl) => `select pg_sleep_until('${at}'::timestamp::timestamptz); ${createSql(pl, ev, X)}`;
      const [r1, r2] = (await Promise.all([cl.psql(mkc(U(1, 2, 3, 4, 5, 6))), cl.psql(mkc(U(7, 8, 9, 10, 11, 12)))])).map((r) => (r.code ? { status: 'FEHLER ' + r.err } : J(r.out)));
      const rows = J(await q(`select coalesce(json_agg(row_to_json(i)), '[]') from (select id, created_at < ends_at as vor_ende from rwi.instances where event_id=${ev}) i`));
      const created = [r1, r2].filter((r) => r.status === 'ok').length;
      if (rows.length !== created || rows.some((x) => !x.vor_ende) || ![r1, r2].every((r) => ['ok', 'event_ended'].includes(r.status))) bad++;
      if (created === 2) bothOk++; if (created === 0) ended++; if (created === 1) oneOne++;
    }
    ok(bad === 0 && bothOk > 0 && ended > 0, '4d: zwei parallele Anlagen rund um das Eventende: jede angelegte Gruppe wurde vor dem Ende geprüft, jede abgelehnte hinterlässt nichts', `beide=${bothOk}, keine=${ended}, eine=${oneOne}, Fehler=${bad}`); }
  { let bad = 0;
    for (let k = 0; k < 6; k++) {
      const ev = 4200 + k, X1 = await ts(60000), X2 = await ts(120000), at = await q(`select to_char(clock_timestamp() + interval '600 milliseconds', 'YYYY-MM-DD HH24:MI:SS.US')`);
      const rs = (await Promise.all([[U(1, 2, 3, 4, 5, 6), X1], [U(7, 8, 9, 10, 11, 12), X2]].map(([pl, X]) => cl.psql(`select pg_sleep_until('${at}'::timestamp::timestamptz); ${createSql(pl, ev, X)}`)))).map((r) => J(r.out).status);
      if (!(rs.filter((s) => s === 'ok').length === 1 && rs.filter((s) => s === 'event_mismatch').length === 1) || +(await q(`select count(distinct ends_at) from rwi.instances where event_id=${ev}`)) !== 1) bad++;
    }
    ok(bad === 0, '4d: parallele Anlage mit verschiedenen Endzeiten desselben Events: genau eine gewinnt, ein Event hat nie zwei Endzeiten'); }

  // ===== 4a) Watchdog: Sperren global aufsteigend, wartet auf Blockierer, schließt ab, verarbeitet Abgeschlossenes nicht erneut =====
  { const ids = [];
    for (const ev of [5001, 5002, 5001, 5002]) ids.push(+(await q(`insert into rwi.instances(event_id, ends_at) values (${ev}, clock_timestamp() - interval '1 second') returning id`)));
    const [a, b, c, d] = ids;
    const hold = cl.psql(`begin; select 1 from rwi.instances where id=${c} for update; select pg_sleep(4.0); commit;`);          // Blockierer auf der dritten Instanz
    await until(sleeping('pg_sleep(4.0)'));
    const t0 = Date.now(); const wd = cl.psql(`select rwi.watchdog_tick()`);                                                   // der echte Watchdog-Einstieg
    const wblocked = await until(blocked('watchdog_tick'), 8000);                                                              // erst prüfen, wenn der Watchdog nachweislich auf c wartet
    const probe = async (x) => (await cl.psql(`select 1 from rwi.instances where id=${x} for update nowait`)).code;
    const pa = await probe(a), pb = await probe(b), pd = await probe(d);
    ok(wblocked && pa !== 0 && pb !== 0 && pd === 0, '4a: Sperren global aufsteigend über Events hinweg (a und b gehalten, c blockiert, d noch nicht berührt)', `blockiert=${wblocked} a=${pa} b=${pb} d=${pd}`);
    const r = await wd; const el = Date.now() - t0; await hold;
    ok(r.code === 0 && J(r.out).ended >= 4 && el > 500, '4a: Watchdog wartet auf den Blockierer und schließt danach alle vier ab', `${r.out} nach ${el} ms`);
    const st = J(await q(`select json_agg(row_to_json(i) order by id) from (select id, status, stage, outcome from rwi.instances where id in (${ids.join(',')})) i`));
    ok(st.every((x) => x.status === 'event_ended' && x.stage === 'done' && x.outcome === 'event_ended'), '4a/4c: alle vier im vollständigen Endzustand'); }
  { const c1 = +(await q(`insert into rwi.instances(event_id, ends_at, status, stage, outcome) values (5003, clock_timestamp() - interval '1 second', 'completed', 'done', 'won') returning id`));
    const c2 = +(await q(`insert into rwi.instances(event_id, ends_at, status, stage, outcome) values (5003, clock_timestamp() - interval '1 second', 'aborted', 'done', 'aborted') returning id`));
    const c3 = +(await q(`insert into rwi.instances(event_id, ends_at) values (5003, clock_timestamp() - interval '1 second') returning id`));
    await q(`insert into rwi.rewards(reward_id, instance_id, test_member, kind, payload) values ('final:alt:${c1}', ${c1}, 'x', 'final', '{}')`);
    const before = await q(`select md5(string_agg(i::text, '|' order by id)) from rwi.instances i where id in (${c1},${c2})`);
    const n1 = +(await q(`select rwi.sweep_events()`)), n2 = +(await q(`select rwi.sweep_events()`)), n3 = +(await q(`select rwi.sweep_event(5003)`));
    ok(n1 === 1 && n2 === 0 && n3 === 0 && before === await q(`select md5(string_agg(i::text, '|' order by id)) from rwi.instances i where id in (${c1},${c2})`) && +(await q(`select count(*) from rwi.rewards where instance_id=${c1}`)) === 1 && (await instOf(c3)).status === 'event_ended',
       '4a: bereits abgeschlossene (Sieg, Abbruch) werden nicht erneut verarbeitet, der Abschluss ist idempotent, Belohnungen bleiben'); }

  // ===== 4b) interne Sweeps: warten nie, Fremdinstanzen erzeugen nach ends_at nichts =====
  const mkPlain = async (ev, k) => {                                     // Instanz mit einem Kampf kurz vor der Auflösung (Muster wie k2-compare)
    const f = makeFight(k + 1);
    const fid = +(await q(`with i as (insert into rwi.instances(event_id, ends_at) values (${ev}, clock_timestamp() + interval '1 hour') returning id),
      m as (insert into rwi.members(instance_id, last_seen_at) select id, clock_timestamp() from i),
      f as (insert into rwi.fights(instance_id, due_at, state) select id, clock_timestamp() - interval '1 s', $j$${JSON.stringify(f.state)}$j$::jsonb from i returning id) select id from f`));
    const c = J(await q(`select rwi.claim_resolution(${fid},1)`)), inp = c.input;
    const res = resolveRound({ fight_id: inp.fight_id, round_no: 1, seed: inp.seed, state: inp.snapshot.state, actions: inp.snapshot.actions, conn: {}, cfg: { crit_pct: 15, burn_turns: 3, burn_dmg: 6 } });
    res.outcome = 'won'; res.state.monster.hp = 0;
    const iid = +(await q(`select instance_id from rwi.fights where id=${fid}`));
    return { fid, iid, c, res, commit: () => `select rwi.commit_round(${fid},1,'${c.token}',${c.round_version},'${c.input_hash}','p',$j$${JSON.stringify(res)}$j$::jsonb)` };
  };
  { const A = await mkPlain(6001, 1), B = await mkPlain(6001, 2);
    await q(`update rwi.instances set ends_at = clock_timestamp() + interval '300 milliseconds' where event_id=6001`); await sleep(450);
    const hold = cl.psql(`begin; select 1 from rwi.instances where id=${A.iid} for update; select pg_sleep(3.0); commit;`); await until(sleeping('pg_sleep(3.0)'));
    const t0 = Date.now(); const cB = J(await q(`select rwi.claim_resolution(${B.fid}, 1)`)); const el = Date.now() - t0;
    ok(cB.status === 'event_ended' && el < 1500, '4b: Claim auf B beendet die eigene Instanz sofort und wartet nicht auf die gesperrte Fremdinstanz A', `${cB.status} nach ${el} ms`);
    ok((await instOf(B.iid)).status === 'event_ended' && (await instOf(A.iid)).status === 'active', '4b: A bleibt vorübergehend „active“ (übersprungen), B ist beendet');
    await hold;
    const lateA = await q(A.commit()); const resA = +(await q(`select count(*) from rwi.round_results where fight_id=${A.fid}`)), rwA = +(await q(`select count(*) from rwi.rewards where instance_id=${A.iid}`));
    ok(!/committed/.test(lateA) && resA === 0 && rwA === 0, '4b: A (Status „active“, Ende überschritten) erzeugt beim Commit weder Ergebnis noch Sieg noch Belohnung', lateA.slice(0, 80));
    ok((await instOf(A.iid)).status === 'event_ended' && J(await q(`select rwi.claim_resolution(${A.fid},1)`)).status !== 'ok', '4b: A beendet sich selbst; weitere Claims werden verweigert'); }
  { // Fremdinstanz ohne Sperre: nach ends_at nichts, solange kein Watchdog lief
    const A = await mkPlain(6002, 3), B = await mkPlain(6002, 4);
    await q(`update rwi.instances set ends_at = clock_timestamp() + interval '300 milliseconds' where event_id=6002`); await sleep(450);
    const r = await q(B.commit()); const stA = (await instOf(A.iid)).status;
    ok(!/committed/.test(r) && +(await q(`select count(*) from rwi.round_results where fight_id in (${A.fid},${B.fid})`)) === 0 && ['active', 'event_ended'].includes(stA), '4b: Commit nach ends_at: kein Ergebnis, auch nicht für Instanzen, deren Status noch „active“ ist', `A=${stA}`);
    const rA = await q(A.commit()); ok(!/committed/.test(rA) && +(await q(`select count(*) from rwi.rewards where instance_id in (${A.iid},${B.iid})`)) === 0, '4b: auch die noch „aktive“ Fremdinstanz bleibt ohne Ergebnis und Belohnung'); }

  // Rennen: parallele Claims, Commits und Watchdogs rund um das Eventende, zwei Events mit verschränkten Instanz-IDs
  { let errs = 0, dead = 0, late = 0, bad = 0, wonN = 0, endedN = 0, activeBefore = 0;
    for (let it = 0; it < 14; it++) {
      const evs = [7000 + it * 2, 7001 + it * 2], cs = [];
      for (let k = 0; k < 8; k++) cs.push(await mkPlain(evs[k % 2], k));
      const X = await q(`update rwi.instances set ends_at = date_trunc('milliseconds', clock_timestamp()) + interval '1500 milliseconds' where event_id in (${evs.join(',')}) returning to_char(ends_at, 'YYYY-MM-DD HH24:MI:SS.US')`).then((o) => o.split('\n')[0]);
      const d = (it % 7 - 3) * 6;
      const at = await q(`select to_char('${X}'::timestamp + interval '${d} milliseconds', 'YYYY-MM-DD HH24:MI:SS.US')`);
      const w = cs.map((x) => `select pg_sleep_until('${at}'::timestamp::timestamptz); ${x.commit()}`);
      w.push(...cs.slice(0, 3).map((x) => `select pg_sleep_until('${at}'::timestamp::timestamptz + interval '2 milliseconds'); select rwi.claim_resolution(${x.fid}, 1)`));
      for (let k = 0; k < 3; k++) w.push(`select pg_sleep_until('${at}'::timestamp::timestamptz + interval '${k * 5} milliseconds'); select rwi.watchdog_tick()`);
      w.push(`select pg_sleep_until('${at}'::timestamp::timestamptz); select rwi.sweep_events()`, `select pg_sleep_until('${at}'::timestamp::timestamptz); select rwi.group_tick()`);
      const r = await Promise.all(w.map((s) => cl.psql(s)));
      dead += r.filter((x) => /deadlock/i.test(x.err)).length; errs += r.filter((x) => x.code).length;
      await sleep(1700);
      const ev = evs.join(',');
      activeBefore += +(await q(`select count(*) from rwi.instances where event_id in (${ev}) and status='active' and ends_at <= clock_timestamp()`));
      await q(`select rwi.watchdog_tick()`);
      late += +(await q(`select count(*) from rwi.round_results rr join rwi.fights f on f.id=rr.fight_id join rwi.instances i on i.id=f.instance_id where i.event_id in (${ev}) and rr.completed_at >= i.ends_at`));
      bad += +(await q(`select count(*) from rwi.instances i where i.event_id in (${ev}) and (status = 'active'
          or (status = 'event_ended' and (stage <> 'done' or outcome is distinct from 'event_ended' or exists (select 1 from rwi.fights f join rwi.round_results rr on rr.fight_id=f.id where f.instance_id=i.id) or exists (select 1 from rwi.rewards r where r.instance_id=i.id)))
          or (status = 'completed' and not exists (select 1 from rwi.fights f join rwi.round_results rr on rr.fight_id=f.id where f.instance_id=i.id)))`));
      wonN += +(await q(`select count(*) from rwi.instances where event_id in (${ev}) and status='completed'`)); endedN += +(await q(`select count(*) from rwi.instances where event_id in (${ev}) and status='event_ended'`));
    }
    ok(errs === 0 && dead === 0 && late === 0 && bad === 0 && wonN > 0 && endedN > 0, '4a/4b: parallele Claims, Commits, Watchdogs und Sweeps am Eventende: keine Deadlocks, kein Fehler, kein Ergebnis nach ends_at, Endzustände vollständig und widerspruchsfrei', `Siege=${wonN}, event_ended=${endedN}, vor Watchdog noch aktiv=${activeBefore}, Fehler=${errs}, Deadlocks=${dead}, spät=${late}, Verstöße=${bad}`); }

  // ===== 4c) Endzustand der Gruppeninstanz =====
  const fightsOf = async (iid) => J(await q(`select coalesce(json_agg(row_to_json(f) order by id), '[]') from (select id, status, round_no, state from rwi.fights where instance_id=${iid}) f`));
  const startWb = async (iid) => { const roster = J(await q(`select rwi.roster(${iid})`)), S = newFight(roster, CFG); return J(await q(`select rwi.start_fight(${iid}, $j$${JSON.stringify(S)}$j$::jsonb)`)); };
  const readyAll = async (iid, ps) => { for (const p of ps) await q(`select rwi.set_ready(${iid}, '${p}')`); };
  const as = async (p, sql) => J(await q(`set request.jwt.claim.sub = '${p}'; ${sql}`));
  { const P = U(1, 2, 3, 4, 5, 6), X = await ts(60000), g = await create(P, 8001, X); await readyAll(g.instance, P); const s = await startWb(g.instance);
    ok(s.status === 'ok', '4c: Weltboss-Kampf läuft');
    await q(`insert into rwi.waitlist(instance_id, player, status) values (${g.instance}, 'u9', 'waiting'), (${g.instance}, 'u10', 'waiting'), (${g.instance}, 'u11', 'admitted')`);
    await q(`insert into rwi.entitlements(instance_id, player, fight_no, kind) values (${g.instance}, 'u1', 0, 'kampf_ep')`);
    const mem0 = await q(`select md5(string_agg(m::text, '|' order by id)) from rwi.members m where instance_id=${g.instance}`);
    const e0 = await q(`select md5(string_agg(e::text, '|' order by player, kind)) from rwi.entitlements e where instance_id=${g.instance}`);
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${g.instance}`);
    const hb = await as('u1', `select rwi.heartbeat(${g.instance})`); const i = await instOf(g.instance);
    ok(hb.status === 'event_ended' && i.status === 'event_ended' && i.stage === 'done' && i.outcome === 'event_ended', '4c: Eventende erkannt: status, stage und outcome gemeinsam gesetzt', JSON.stringify(i));
    ok((await q(`select string_agg(player || ':' || status, ',' order by player) from rwi.waitlist where instance_id=${g.instance}`)) === 'u10:cancelled,u11:admitted,u9:cancelled', '4c: wartende Teilnehmer „cancelled“, bereits aufgenommene bleiben');
    ok((await fightsOf(g.instance)).every((f) => f.status === 'event_ended') && (await q(`select count(*) from rwi.resolve_jobs j join rwi.fights f on f.id=j.fight_id where f.instance_id=${g.instance} and j.status in ('pending','claimed')`)) === '0', '4c: Kampf beendet, offene Aufträge storniert');
    ok(mem0 === await q(`select md5(string_agg(m::text, '|' order by id)) from rwi.members m where instance_id=${g.instance}`) && e0 === await q(`select md5(string_agg(e::text, '|' order by player, kind)) from rwi.entitlements e where instance_id=${g.instance}`), '4c: Mitglieder und bereits gebuchte Ansprüche bleiben unverändert');
    // reguläre Instanzaktionen sind beendet
    await q(`update rwi.members set disc_since = clock_timestamp() - interval '900 seconds', connected = false, ready = false, ready_due = clock_timestamp() - interval '10 seconds' where instance_id=${g.instance} and player='u2'`);
    const verdict = await q(`select coalesce(rwi.deadline_verdict(${g.instance}, 'u2', clock_timestamp()), 'keine')`);          // vor Worker und Wiederverbindung: u2 hätte Abwesenheit UND abgelaufene Bereitschaft
    const t = J(await q(`select rwi.group_tick()`)); const rc = await q(`select rwi.set_connection(${g.instance}, 'u2', true)`);
    ok((await q(`select mstate from rwi.members where instance_id=${g.instance} and player='u2'`)) === 'active' && +(await q(`select count(*) from rwi.group_log where instance_id=${g.instance} and event='ausgeschieden'`)) === 0, '4c: nach dem Ende keine Fristen und keine automatischen Entfernungen mehr (Worker und Wiederverbindung)', rc.slice(0, 60));
    ok(verdict === 'keine', '4c: auch die Fristenentscheidung selbst liefert für beendete Instanzen nichts, obwohl Abwesenheit und Bereitschaftsfrist abgelaufen wären', verdict);
    const rj = J(await q(`select rwi.join(${g.instance}, 'u12')`)), lv = J(await q(`select rwi.leave(${g.instance}, 'u3')`)), sr = J(await q(`select rwi.set_ready(${g.instance}, 'u3')`));
    ok([rj.status, lv.status, sr.status].every((x) => x === 'event_ended'), '4c: Beitritt, Austritt und Bereitschaft werden mit „event_ended“ abgewiesen', [rj.status, lv.status, sr.status].join(','));
    await q(`insert into rwi.rewards(reward_id, instance_id, test_member, kind, payload) values ('final:x:1', ${g.instance}, 'u1', 'final', '{}'), ('coin:x:1', ${g.instance}, 'u1', 'coin', '{}')`);
    ok(+(await q(`select count(*) from rwi.rewards where instance_id=${g.instance}`)) === 0, '4c: nach festgehaltenem Eventende wird keine Belohnung mehr geschrieben (Absicherung im Schreibpfad)');
    const bad1 = await cl.psql(`update rwi.instances set outcome = null where id=${g.instance}`), bad2 = await cl.psql(`update rwi.instances set stage = 'ready' where id=${g.instance}`);
    const other = (await create(U(7, 8, 9, 10, 11, 12), 8002, await ts(60000))).instance; const bad3 = await cl.psql(`update rwi.instances set status = 'event_ended' where id=${other}`), bad4 = await cl.psql(`update rwi.instances set outcome = 'event_ended' where id=${other}`);
    ok([bad1, bad2, bad3, bad4].every((b) => b.code !== 0), '4c: Zwischenzustände sind per Tabellenregel unmöglich (status/stage/outcome nur gemeinsam)'); }
  { // Zweiter Weg: der Watchdog-Sweep (ohne vorherigen Eingriff durch eine Instanzaktion) setzt denselben Endzustand inklusive Warteliste
    const P = U(7, 8, 9, 10, 11, 12), g = (await create(P, 8003, await ts(60000))).instance; await readyAll(g, P); await startWb(g);
    await q(`insert into rwi.waitlist(instance_id, player, status) values (${g}, 'u13', 'waiting'), (${g}, 'u14', 'admitted')`);
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${g}`); await q(`select rwi.sweep_events()`);
    const i = await instOf(g);
    ok(i.status === 'event_ended' && i.stage === 'done' && i.outcome === 'event_ended' && (await q(`select string_agg(player || ':' || status, ',' order by player) from rwi.waitlist where instance_id=${g}`)) === 'u13:cancelled,u14:admitted' && (await fightsOf(g)).every((f) => f.status === 'event_ended'), '4c: Watchdog-Sweep setzt denselben vollständigen Endzustand (stage, outcome, Warteliste, Kampf)'); }
  { // Sieg vor dem Eventende bleibt unverändert
    const P = U(13, 14, 15, 16, 17, 18), X = await ts(60000), g = (await create(P, 8101, X)).instance; await readyAll(g, P); const s = await startWb(g);
    for (let r = 0; r < 60; r++) {
      const f = J(await q(`select row_to_json(f) from (select id, round_no, status, state from rwi.fights where id=${s.fight}) f`)); if (f.status !== 'active') break;
      for (const m of f.state.members) if (m.alive && !m.gone) await q(`select rwi.submit_action_for('${m.id}', ${s.fight}, ${f.round_no}, $j$${JSON.stringify(decideRevive(f.state, m))}$j$::jsonb)`);
      await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${s.fight} and phase='planning'`);
      const c = J(await q(`select rwi.claim_resolution(${s.fight}, ${f.round_no})`)); if (c.status !== 'ok') break;
      await q(`select rwi.commit_round(${s.fight}, ${c.input.round_no}, '${c.token}', ${c.round_version}, '${c.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(resolveClaim(c.input))}$j$::jsonb)`);
    }
    const snap = async () => q(`select md5(concat((select string_agg(i::text, '|') from (select status, stage, outcome, fight_no from rwi.instances where id=${g}) i), (select string_agg(r::text, '|' order by reward_id) from rwi.rewards r where instance_id=${g}), (select string_agg(e::text, '|' order by player, fight_no, kind) from rwi.entitlements e where instance_id=${g}), (select string_agg(x::text, '|' order by round_no) from rwi.round_results x where fight_id=${s.fight}), (select string_agg(w::text, '|' order by id) from rwi.waitlist w where instance_id=${g})))`);
    const i0 = await instOf(g), n0 = +(await q(`select count(*) from rwi.rewards where instance_id=${g}`)), h0 = await snap();
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${g}`); const h0b = await snap();
    await q(`select rwi.watchdog_tick()`); await q(`select rwi.sweep_events()`); await as('u13', `select rwi.heartbeat(${g})`); await q(`select rwi.group_tick()`);
    ok(i0.status === 'completed' && i0.outcome === 'won' && n0 > 0 && h0 === h0b && h0 === await snap() && (await instOf(g)).status === 'completed', '4c: ein vor dem Eventende gewonnener Weltboss bleibt gewonnen: Ergebnis, Belohnungen und Ansprüche unverändert', `${JSON.stringify(i0)} Belohnungen=${n0}`); }
  { // Gruppenpause verschiebt das Eventende nicht
    const P = U(19, 20, 21, 22, 23, 24), X = await ts(60000), g = (await create(P, 8201, X)).instance; await readyAll(g, P); await startWb(g);
    for (const p of P) await q(`select rwi.set_connection(${g}, '${p}', false)`);
    const paused = await q(`select (paused_at is not null) from rwi.instances where id=${g}`);
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${g}`); const n = +(await q(`select rwi.sweep_events()`));
    ok(paused === 't' && n >= 1 && (await instOf(g)).status === 'event_ended' && +(await q(`select count(*) from rwi.death_windows w join rwi.fights f on f.id=w.fight_id where f.instance_id=${g} and w.status='open'`)) === 0, '4c: Gruppenpause verschiebt das Eventende nicht; offene Fenster sind geschlossen'); }
} catch (e) { fail++; console.log('NICHT OK - Testlauf abgebrochen:', e.stack.split('\n').slice(0, 5).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);

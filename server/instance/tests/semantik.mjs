// Eventende-Semantik (Architekturentscheidung): node server/instance/tests/semantik.mjs
// Regel: Ein Weltboss-Sieg gilt, wenn completed_at < ends_at (completed_at = serverseitiger Zeitpunkt der Abschlussentscheidung unter der Instanzsperre). Der Commit darf später folgen.
// completed_at >= ends_at: kein Sieg, keine Abschlussbelohnung, event_ended.
// Die Uhr wird NUR in dieser Testdatenbank steuerbar gemacht: rwi.clock_timestamp() (Testtabelle) überschattet pg_catalog.clock_timestamp() über den search_path. Der Produktionscode bleibt unverändert.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { newFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const J = (s) => JSON.parse(s);
const CFG = { bossHp: 150, bossAtk: 8 };
const cl = await startCluster(54400, '-c track_commit_timestamp=on');
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 300)); return r.out; };
const until = async (f, what, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('Zeit überschritten: ' + what); await new Promise((r) => setTimeout(r, 25)); } };
// interaktive Sitzung: offene Transaktion, stufenweise Eingabe, Warten auf Ausgabemarken
function session() {
  const p = spawn(`${cl.BIN}/psql`, [...cl.base, '-d', 'rwi', '-At'], { stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = '';
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
  const closed = new Promise((res) => p.on('close', (code) => res({ code, out, err })));
  return { send: (s) => p.stdin.write(s + '\n'), wait: (m) => until(() => out.includes(m), 'Marke ' + m).catch((e) => { throw new Error(e.message + ' out=' + out.slice(-300) + ' err=' + err.slice(-500)); }), out: () => out, end: () => { p.stdin.end(); return closed; } };
}
const blocked = (tag) => async () => +(await q(`select count(*) from pg_stat_activity where state = 'active' and wait_event_type = 'Lock' and query like '%${tag}%' and pid <> pg_backend_pid()`)) > 0;
const E = '2030-06-01 12:00:00+00';
const at = (ms) => `(timestamptz '${E}' + interval '${ms} milliseconds')`;
const setClock = (ms) => q(`update rwi.testclock set v = ${at(ms)}`);
try {
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe']) await q(readFileSync(join(here, `../sql/${f}.sql`), 'utf8'));
  await q(`create table rwi.testclock(v timestamptz); insert into rwi.testclock values (null);
    create function rwi.clock_timestamp() returns timestamptz language sql volatile as $$ select coalesce((select v from rwi.testclock), pg_catalog.clock_timestamp()) $$;
    alter database rwi set search_path = rwi, pg_catalog, public;`);
  const KL = [['krieger', 'ritter'], ['bogenschuetze', 'jaeger'], ['magier', 'feuer'], ['heiler', 'priester'], ['heiler', 'natur'], ['krieger', 'berserker']];
  for (let n = 1; n <= 6; n++) await q(`insert into rwi.players values ('u${n}', 10, '${KL[n - 1][0]}', '${KL[n - 1][1]}', 3)`);
  ok((await q(`select 'clock_timestamp'::regproc::oid = 'rwi.clock_timestamp'::regproc::oid`)) === 't', 'Testuhr aktiv: clock_timestamp() löst in dieser Testdatenbank auf die steuerbare Uhr auf (Produktionscode unverändert)');

  let ev = 100;
  // Aufbau: Weltboss-Gruppe, Kampf läuft, Auftrag vor dem Ende übernommen (Claim), synthetischer Sieg als Ergebnis
  const setup = async () => {
    await setClock(-600000);                                                                                // 10 min vor dem Ende
    const g = J(await q(`select rwi.create_group('weltboss', array['u1','u2','u3','u4','u5','u6']::text[], 1, ${++ev}, timestamptz '${E}')`)); if (g.status !== 'ok') throw new Error('create_group ' + JSON.stringify(g));
    const I = g.instance; for (let n = 1; n <= 6; n++) await q(`select rwi.set_ready(${I}, 'u${n}')`);
    await q(`select rwi.start_fight(${I}, $j$${JSON.stringify(newFight(J(await q(`select rwi.roster(${I})`)), CFG))}$j$::jsonb)`);
    const fid = +(await q(`select max(id) from rwi.fights where instance_id=${I}`));
    await q(`update rwi.fights set due_at = ${at(-601000)} where id=${fid}`);
    await setClock(-60000);
    const c = J(await q(`select rwi.claim_resolution(${fid}, 1)`)); if (c.status !== 'ok') throw new Error('claim ' + JSON.stringify(c));
    const res = resolveClaim(c.input); res.outcome = 'won'; res.reason = 'boss_dead'; res.state.monster.hp = 0;
    const commit = `select 'R:' || ((rwi.commit_round(${fid}, 1, '${c.token}', ${c.round_version}, '${c.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb))->>'status');`;
    return { I, fid, commit };
  };
  const state = async (I) => J(await q(`select json_build_object('status', i.status, 'stage', i.stage, 'outcome', i.outcome, 'fights', (select coalesce(json_agg(status), '[]') from rwi.fights where instance_id = i.id),
      'rounds', (select count(*) from rwi.round_results rr join rwi.fights f on f.id = rr.fight_id where f.instance_id = i.id), 'rewards', (select count(*) from rwi.rewards where instance_id = i.id and reward_id like 'final:%'),
      'ents', (select count(*) from rwi.entitlements where instance_id = i.id)) from rwi.instances i where i.id = ${I}`));
  const view = async (I) => J(await q(`select rwi.instance_view(${I}, 'u1')`)).instance;
  const dump = (I) => q(`select md5((select i::text from rwi.instances i where id=${I}) || coalesce((select string_agg(f::text, ';' order by f.id) from rwi.fights f where instance_id=${I}), '') || coalesce((select string_agg(r::text, ';' order by r.reward_id) from rwi.rewards r where instance_id=${I}), '') || coalesce((select string_agg(rr::text, ';' order by rr.round_no) from rwi.round_results rr join rwi.fights f on f.id=rr.fight_id where f.instance_id=${I}), ''))`);

  // ---------- 1/5/6/7: Entscheidung 100 ms VOR dem Ende, Commit NACH dem Ende; Sweep, Watchdog und Ansicht treffen auf die offene Transaktion ----------
  {
    const { I, fid, commit } = await setup();
    await setClock(-100);                                                                                   // Abschlussentscheidung: 100 ms vor ends_at
    const X = session(); X.send('begin;'); X.send(commit); await X.wait('R:committed');
    const decidedAt = +(await q(`select extract(epoch from (select completed_at from rwi.round_results where fight_id=${fid})) * 1000`).catch(() => 0));   // ungesehen: Zeile ist noch nicht committet
    ok(decidedAt === 0, '1: die Abschlussentscheidung ist vor dem COMMIT für andere Sitzungen unsichtbar (kein Ergebnis in round_results)');
    await setClock(1000);                                                                                   // das Event ist jetzt (1 s) vorbei, die Transaktion noch offen
    const tAfterEnd = await q(`select pg_catalog.clock_timestamp()`);
    const pending = await state(I); const v = await view(I);
    ok(pending.status === 'active' && pending.rounds === 0, '1: andere Sitzungen sehen in der Tabelle noch den alten Stand (active, kein Ergebnis)');
    ok(v.status === 'ending' && v.outcome === null && v.status !== 'event_ended' && v.status !== 'completed', '6: instance_view während der offenen Entscheidung zeigt nur den vorläufigen Zustand „ending“, keinen endgültigen Endzustand', `${v.status}/${v.outcome}`);
    const sw = cl.psql(`select 'S:' || (rwi.sweep_events())::text`); await until(blocked('rwi.sweep_events()'), 'Sweep wartet auf die Sperre');
    const wd = cl.psql(`select 'W:' || (rwi.watchdog_tick()->>'ended')`); await until(blocked('rwi.watchdog_tick()'), 'Watchdog wartet auf die Sperre');
    ok(true, '5: Sweep und Watchdog warten auf die Instanzsperre der laufenden Abschlussentscheidung (sie überschreiben sie nicht)');
    const gt = await cl.psql(`select rwi.group_tick()`); ok(gt.code === 0 && (await state(I)).status === 'active', '5: group_tick (SKIP LOCKED) wartet nicht und ändert die gesperrte Instanz nicht');
    const dumpBefore = null; void dumpBefore;
    X.send('commit;'); X.send(`select 'C';`); await X.wait('C'); await X.end();
    const rs = await sw, rw = await wd;
    ok(rs.out === 'S:0' && rw.out === 'W:0', '5: Sweep und Watchdog finden nach dem Commit nichts mehr zu beenden (0 beendet)', `${rs.out} ${rw.out}`);
    const s = await state(I), vc = await view(I);
    const rr = J(await q(`select json_build_object('ca', extract(epoch from completed_at) * 1000, 'ends', extract(epoch from (select ends_at from rwi.instances where id=${I})) * 1000, 'cts', (select pg_xact_commit_timestamp(xmin) > '${tAfterEnd}'::timestamptz from rwi.round_results where fight_id=${fid})) from rwi.round_results where fight_id=${fid}`));
    ok(s.status === 'completed' && s.stage === 'done' && s.outcome === 'won' && s.rounds === 1, '1/7: der vor dem Ende entschiedene Sieg bleibt nach seinem Commit erhalten (completed, won, ein Ergebnis)', JSON.stringify(s));
    ok(Math.round(rr.ends - rr.ca) === 100, '1: completed_at ist der Entscheidungszeitpunkt: genau 100 ms vor ends_at (nicht die Uhrzeit des Commits)', String(rr.ends - rr.ca));
    ok(rr.cts === true, '1: der Datenbank-Commit lag nachweislich NACH dem Eventende (Commit-Zeitstempel > Zeitpunkt, an dem die Uhr hinter ends_at gestellt wurde)');
    ok(s.rewards === 6 && s.ents >= 0, '1: die sechs Abschlussbelohnungen sind entstanden', String(s.rewards));
    ok(vc.status === 'completed' && vc.outcome === 'won', '6: nach dem Commit zeigt die Ansicht den echten Endzustand „completed/won“ – nie „event_ended“ in der Folge', `${vc.status}/${vc.outcome}`);
    // 7: spätere Läufe ändern nichts
    const d0 = await dump(I); await setClock(3600000);
    await q(`select rwi.sweep_events()`); await q(`select rwi.watchdog_tick()`); await q(`select rwi.group_tick()`); await q(`select rwi.sweep_event(${ev}, false)`);
    ok((await dump(I)) === d0 && (await state(I)).status === 'completed', '7: Sweep, Watchdog und group_tick eine Stunde später ändern den gültigen Sieg nicht (Instanz, Kämpfe, Belohnungen, Ergebnis unverändert)');
    await q(`select rwi.end_instance(${I})`); ok((await dump(I)) === d0, '7: end_instance auf einer abgeschlossenen (completed) Instanz verändert nichts');
    const late = J(await q(`select rwi.commit_round(${fid}, 1, gen_random_uuid(), 1, 'x', '${ENGINE_VERSION}', '{}'::jsonb)`)); ok(late.status === 'already_resolved', '7: ein erneuter Commit nach dem Ende ändert den Sieg nicht', late.status);
  }
  // ---------- 2: Entscheidung EXAKT am Eventende ----------
  {
    const { I, fid, commit } = await setup(); await setClock(0);
    const r = await q(commit); const s = await state(I);
    ok(r === 'R:event_ended' && s.status === 'event_ended' && s.stage === 'done' && s.outcome === 'event_ended' && s.rounds === 0 && s.rewards === 0 && s.ents === 0, '2: Entscheidung exakt bei completed_at = ends_at: kein Sieg, kein Ergebnis, keine Belohnung, event_ended', `${r} ${JSON.stringify(s)}`);
    ok(s.fights.every((x) => x === 'event_ended'), '2: der Kampf endet mit event_ended');
  }
  // ---------- 2b: Entscheidung 1 ms vor dem Ende gilt (Gegenprobe zur Grenze) ----------
  {
    const { I, commit } = await setup(); await setClock(-1);
    const r = await q(commit); const s = await state(I);
    ok(r === 'R:committed' && s.status === 'completed' && s.outcome === 'won' && s.rewards === 6, '2: eine Millisekunde vor ends_at: Sieg gilt (Grenze ist strikt „kleiner“)', `${r} ${JSON.stringify(s)}`);
  }
  // ---------- 3/8: Entscheidung NACH dem Eventende (Auftrag wurde vor dem Ende übernommen) ----------
  {
    const { I, fid, commit } = await setup(); await setClock(1000);
    const r = await q(commit); const s = await state(I);
    ok(r === 'R:event_ended' && s.status === 'event_ended' && s.outcome === 'event_ended' && s.rounds === 0, '3: nach dem Eventende entschieden (Claim lag davor): kein Sieg, event_ended', `${r} ${JSON.stringify(s)}`);
    ok(s.rewards === 0 && s.ents === 0 && (await q(`select count(*) from rwi.rewards where instance_id=${I}`)) === '0', '8: ein nach dem Eventende entschiedener Kampf erzeugt keine Belohnung und keinen Anspruch');
    await q(`insert into rwi.rewards(reward_id, instance_id, test_member, kind, payload) values ('final:test:u1', ${I}, 'u1', 'coins', '{}'::jsonb)`);
    ok((await q(`select count(*) from rwi.rewards where instance_id=${I}`)) === '0', '8: selbst ein direkter Einfügeversuch einer Abschlussbelohnung für eine event_ended-Instanz wird verworfen (zweite Schicht)');
    const again = await q(commit); ok(again === 'R:event_ended' && (await state(I)).rewards === 0, '8: auch ein Wiederholungsversuch erzeugt keine Belohnung', again);
    const v = await view(I); ok(v.status === 'event_ended' && v.outcome === 'event_ended', '3: Ansicht nach dem festgehaltenen Ende: event_ended', v.status);
  }
  // ---------- 6b: ohne offene Entscheidung nach dem Ende: „ending“, nach dem Sweep „event_ended“ ----------
  {
    const { I } = await setup(); await setClock(500);
    const v1 = await view(I); await q(`select rwi.sweep_events()`); const v2 = await view(I);
    ok(v1.status === 'ending' && v2.status === 'event_ended' && v2.outcome === 'event_ended', '6: ohne Entscheidung: erst „ending“ (vorläufig), nach dem festgehaltenen Ende „event_ended“ – nie rückwärts', `${v1.status} -> ${v2.status}`);
  }
  // ---------- 4: zwei konkurrierende Transaktionen am Eventende ----------
  {   // 4a: Entscheidung (gültig) hält die Sperre, ein zweiter Commit nach dem Ende wartet und findet danach das Ergebnis vor
    const { I, fid, commit } = await setup(); await setClock(-1);
    const X1 = session(); X1.send('begin;'); X1.send(commit); await X1.wait('R:committed');
    await setClock(1);
    const second = cl.psql(commit); await until(blocked("commit_round"), 'zweiter Commit wartet');
    X1.send('commit;'); X1.send(`select 'C';`); await X1.wait('C'); await X1.end(); const r2 = await second;
    const s = await state(I);
    ok(r2.out === 'R:already_resolved' && s.status === 'completed' && s.rounds === 1 && s.rewards === 6, '4a: zweiter Commit nach dem Ende wartet auf den ersten und ändert nichts (ein Ergebnis, sechs Belohnungen, completed)', `${r2.out} ${JSON.stringify(s)}`);
  }
  {   // 4b: das Ende wird zuerst festgehalten (offene Sweep-Transaktion), der Commit mit Uhrzeit nach dem Ende wartet und bekommt event_ended
    const { I, commit } = await setup(); await setClock(1);
    const S = session(); S.send('begin;'); S.send(`select 'S:' || (rwi.sweep_events())::text;`); await S.wait('S:1');
    const c = cl.psql(commit); await until(blocked('commit_round'), 'Commit wartet auf die Sweep-Transaktion');
    S.send('commit;'); S.send(`select 'C';`); await S.wait('C'); await S.end(); const rc = await c; const s = await state(I);
    ok(rc.out === 'R:event_ended' && s.status === 'event_ended' && s.rounds === 0 && s.rewards === 0, '4b: wurde das Ende zuerst festgehalten, entsteht danach nie ein Sieg (event_ended, kein Ergebnis, keine Belohnung)', `${rc.out} ${JSON.stringify(s)}`);
  }
  {   // 4c: gleichzeitiger Start zweier Sitzungen am Ende: genau ein Ausgang, nie beides
    const { I, commit } = await setup(); await setClock(-1);
    const a = cl.psql(commit), b = cl.psql(commit); const [ra, rb] = await Promise.all([a, b]); const s = await state(I);
    ok([ra.out, rb.out].sort().join() === 'R:already_resolved,R:committed' && s.status === 'completed' && s.rounds === 1 && s.rewards === 6, '4c: zwei gleichzeitige Commits derselben Entscheidung: genau ein Ergebnis, genau ein Satz Belohnungen', `${ra.out} ${rb.out}`);
  }
} finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);

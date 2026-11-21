// Worker-Kern gegen die echte Auftragskette: node server/instance/tests/worker.mjs
// Temporäres lokales PostgreSQL, Schema rwi (01–04), Testdaten. Kein Netzwerk, keine Secrets, kein Supabase. Prüft Wiederholung, doppelte Aufrufe,
// parallele Worker, Absturz nach Claim, Absturz nach Commit, Engine-Fehler, Event-Ende. Zeit wird über die Datenbank (lease_until, due_at) gesteuert, nicht per sleep.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import * as engine from '../engine/v1.mjs';
import { runTick, processFight } from '../worker/core.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const SQL = (f) => readFileSync(join(here, '../sql', f + '.sql'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const J = (s) => JSON.parse(s);
const cl = await startCluster(54450);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 160)); return r.out; };
const mkdb = (over = {}) => ({
  watchdog: async () => J(await q('select rwi.watchdog_tick()')),
  rounds: async (ids) => J(await q(`select coalesce(json_agg(json_build_object('id', id, 'round_no', round_no) order by id), '[]') from rwi.fights where id = any(array[${ids.join(',')}]::bigint[])`)),
  claim: async (f, r) => J(await q(`select rwi.claim_resolution(${f}, ${r})`)),
  commit: async (f, r, t, v, h, ev, res) => J(await q(`select rwi.commit_round(${f}, ${r}, '${t}', ${v}, '${h}', '${ev}', $j$${JSON.stringify(res)}$j$::jsonb)`)),
  reportFailure: async (f, r, t, m) => J(await q(`select rwi.report_failure(${f}, ${r}, '${t}', $e$${m}$e$)`)),
  ...over });
let n = 0;
const newRunningFight = async () => {                        // frische Instanz mit laufendem Kampf, Runde 1 fällig
  const p = [`w${++n}a`, `w${n}b`]; for (const k of p) await q(`insert into rwi.players values ('${k}', 10, '${k.endsWith('a') ? 'krieger' : 'heiler'}', '${k.endsWith('a') ? 'ritter' : 'priester'}', 3)`);
  const g = J(await q(`select rwi.create_group('dungeon', array['${p[0]}','${p[1]}']::text[], 2)`));
  for (const k of p) await q(`select rwi.set_ready(${g.instance}, '${k}')`);
  const S = engine.newFight(J(await q(`select rwi.roster(${g.instance})`)), { bossHp: 400, bossAtk: 8 });
  await q(`select rwi.start_fight(${g.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${g.instance}`));
  return { inst: g.instance, fid, due: () => q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`) };
};
const rounds = (fid) => q(`select count(*) from rwi.round_results where fight_id=${fid}`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe']) await q(SQL(f));
  await q(`update rwi.cfg set v = 30 where k = 'lease_seconds'; update rwi.cfg set v = 3 where k = 'max_attempts'`);
  const db = mkdb();

  // W1 normaler Tick
  { const F = await newRunningFight(); let t = await runTick(db, engine); ok(!t.due.includes(F.fid), 'W1: Kampf vor Fälligkeit wird nicht angefasst');
    await F.due(); t = await runTick(db, engine);
    ok(t.results.some((r) => r.fight === F.fid && r.status === 'committed') && (await rounds(F.fid)) === '1', 'W1: fälliger Kampf wird einmal aufgelöst und committet', JSON.stringify(t.results.find((r) => r.fight === F.fid))); }

  // W2 viele parallele/doppelte Worker: genau ein Commit
  { const F = await newRunningFight(); await F.due();
    const all = await Promise.all(Array.from({ length: 6 }, () => runTick(db, engine, { concurrency: 2 })));
    const mine = all.flatMap((t) => t.results).filter((r) => r.fight === F.fid);
    ok((await rounds(F.fid)) === '1', 'W2: 6 gleichzeitige Worker erzeugen genau EIN Rundenergebnis', mine.map((r) => r.status).join(','));
    ok(mine.filter((r) => r.status === 'committed').length === 1, 'W2: genau ein Worker meldet committed; die übrigen sehen busy/already_resolved/not_due', mine.map((r) => r.status).join(','));
    ok(mine.every((r) => ['committed', 'busy', 'already_resolved', 'not_due'].includes(r.status)), 'W2: keine unerwarteten Zustände bei doppelten Aufrufen'); }

  // W3 Absturz nach Claim: Lease hält, nach Ablauf übernimmt der nächste Worker mit gespeichertem Snapshot
  { const F = await newRunningFight(); await F.due();
    const rn = +(await q(`select round_no from rwi.fights where id=${F.fid}`)); const c = await db.claim(F.fid, rn);          // „Worker A“ claimt und stirbt
    ok(c.status === 'ok', 'W3: Worker A hat geclaimt');
    let t = await runTick(db, engine); ok(!t.redispatch.includes(F.fid) && !t.results.some((r) => r.fight === F.fid), 'W3: solange die Lease gilt, fasst kein anderer Worker den Kampf an');
    const direct = await processFight(db, engine, F.fid, rn); ok(direct.status === 'busy', 'W3: direkter Zweitaufruf während der Lease: busy', direct.status);
    await q(`update rwi.fights set lease_until = clock_timestamp() - interval '1 second' where id=${F.fid}`);
    t = await runTick(db, engine); ok(t.redispatch.includes(F.fid), 'W3: nach Lease-Ablauf steht der Kampf in redispatch');
    ok(t.results.some((r) => r.fight === F.fid && r.status === 'committed') && (await rounds(F.fid)) === '1', 'W3: Worker B löst mit dem gespeicherten Snapshot auf, genau ein Ergebnis');
    ok((await q(`select input_hash from rwi.round_results where fight_id=${F.fid}`)) === c.input_hash, 'W3: Ergebnis gehört zum ursprünglich eingefrorenen Eingang (gleicher input_hash)');
    // Zombie: Worker A kommt zurück und committet mit altem Token
    const res = engine.resolveClaim(c.input); const late = await db.commit(F.fid, c.input.round_no, c.token, c.round_version, c.input_hash, engine.ENGINE_VERSION, res);
    ok(['superseded', 'already_resolved'].includes(late.status) && (await rounds(F.fid)) === '1', 'W3: später Commit des Zombie-Workers wird abgewiesen, kein zweites Ergebnis', late.status); }

  // W4 Absturz nach Commit (Antwort ging verloren): Wiederholung ist wirkungslos
  { const F = await newRunningFight(); await F.due();
    const rn = +(await q(`select round_no from rwi.fights where id=${F.fid}`)); const c = await db.claim(F.fid, rn); const res = engine.resolveClaim(c.input);
    const k1 = await db.commit(F.fid, rn, c.token, c.round_version, c.input_hash, engine.ENGINE_VERSION, res);
    const k2 = await db.commit(F.fid, rn, c.token, c.round_version, c.input_hash, engine.ENGINE_VERSION, res);
    ok(k1.status === 'committed' && ['already_resolved', 'superseded'].includes(k2.status) && (await rounds(F.fid)) === '1', 'W4: doppelter Commit mit gleichem Token ändert nichts', k1.status + ' / ' + k2.status);
    const again = await processFight(db, engine, F.fid, rn); ok(['already_resolved', 'not_due', 'busy'].includes(again.status), 'W4: erneute Verarbeitung derselben (alten) Runde: ' + again.status); }

  // W5 Fehlerisolation: ein Kampf scheitert, der andere wird trotzdem aufgelöst; Engine-Fehler führen nicht zum Commit
  { const A = await newRunningFight(), B = await newRunningFight(); await A.due(); await B.due();
    const flaky = mkdb({ claim: async (f, r) => { if (f === A.fid) throw new Error('Verbindung abgebrochen'); return db.claim(f, r); } });
    const t = await runTick(flaky, engine);
    ok(t.results.find((r) => r.fight === A.fid)?.status === 'db_error' && t.results.find((r) => r.fight === B.fid)?.status === 'committed', 'W5: Datenbankfehler bei Kampf A blockiert Kampf B nicht; kein Wurf nach außen');
    const bad = { ENGINE_VERSION: engine.ENGINE_VERSION, resolveClaim: () => { throw new Error('Engine kaputt'); } };
    const t2 = await runTick(db, bad); const ra = t2.results.find((r) => r.fight === A.fid);
    ok(ra && ra.status === 'engine_error' && (await rounds(A.fid)) === '0', 'W5: Engine-Fehler -> kein Commit, Runde bleibt offen', ra?.status);
    const w = await runTick(mkdb({ watchdog: async () => { throw new Error('weg'); } }), engine); ok(w.error && /watchdog/.test(w.error), 'W5: Ausfall des Watchdog-Aufrufs wird gemeldet, nicht geworfen'); }

  // W6 festhängender Kampf: Engine-Fehler -> Zähler, Wartezeit 5/10/20 s, ab max_attempts (3 im Test) stuck + Alarm + kein weiterer automatischer Versuch
  { const F = await newRunningFight(); await F.due(); const bad = { ENGINE_VERSION: engine.ENGINE_VERSION, resolveClaim: () => { throw new Error('Engine kaputt'); } };
    const expire = () => q(`update rwi.fights set lease_until = clock_timestamp() - interval '1 second' where id=${F.fid} and phase='resolving'`);
    const reps = []; for (let i = 0; i < 3; i++) { const t = await runTick(db, bad); reps.push(t.results.find((r) => r.fight === F.fid)?.report); await expire(); }
    ok(reps[0]?.status === 'recorded' && reps[0].attempts === 1 && reps[0].retry_in === 5 && reps[1].retry_in === 10, 'W6: 1. und 2. Fehler: gezählt, Wartezeit 5 s und 10 s', JSON.stringify(reps.map((r) => r && [r.status, r.attempts, r.retry_in])));
    ok(reps[2]?.status === 'stuck' && reps[2].attempts === 3, 'W6: 3. Fehler (max_attempts im Test = 3): stuck', JSON.stringify(reps[2]));
    ok((await q(`select engine_stuck from rwi.instances where id=${F.inst}`)) === 't' && (await q(`select count(*) from rwi.ops_alerts where what='stuck' and detail like 'fight ${F.fid} %'`)) === '1', 'W6: engine_stuck gesetzt und genau ein Alarm in ops_alerts');
    ok((await q(`select status || ':' || attempts || ':' || coalesce(last_error,'') from rwi.resolve_jobs where fight_id=${F.fid}`)) === 'stuck:3:Engine kaputt', 'W6: Auftrag steht auf stuck mit gespeichertem Fehlertext');
    const t = await runTick(db, engine); ok(!t.due.includes(F.fid) && !t.redispatch.includes(F.fid) && (await rounds(F.fid)) === '0', 'W6: stuck-Instanz wird nicht mehr automatisch verteilt, kein Ergebnis');
    ok((await db.reportFailure(F.fid, 1, '00000000-0000-4000-8000-000000000000', 'x')).status === 'ignored', 'W6: Fehlermeldung mit fremdem Token wird ignoriert'); }

  // W7 Event-Ende: nach ends_at kein Ergebnis
  { const F = await newRunningFight(); await F.due(); await q(`update rwi.instances set event_id = 77, ends_at = clock_timestamp() - interval '1 second' where id=${F.inst}`);
    const t = await runTick(db, engine); const r = t.results.find((x) => x.fight === F.fid);
    ok((await rounds(F.fid)) === '0' && !t.due.includes(F.fid), 'W7: nach ends_at wird keine Runde mehr aufgelöst', r ? r.status : 'nicht in due (Watchdog beendet die Instanz)');
    ok((await q(`select status from rwi.instances where id=${F.inst}`)) !== 'active', 'W7: der Watchdog beendet die Instanz'); }
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n').slice(0, 2).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);

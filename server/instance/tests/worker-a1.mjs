// Worker-Schnittstelle A1: node server/instance/tests/worker-a1.mjs
// Rechtematrix aus dem Systemkatalog, Ablehnung von anon/authenticated, Eingabeprüfung, Rückgabefelder, kompletter Worker-Lauf (core.mjs) NUR über die Wrapper.
// Lokal, ohne Netzwerk und ohne Secrets. NICHT ECHT: kein PostgREST – die Aufrufe laufen als Datenbankrolle service_role/anon/authenticated über psql (Rechte und Funktionen sind echt, der HTTP-Pfad nicht).
import { setup, counter, J } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { runTick } from '../worker/core.mjs';
import { a1Db, opsA1 } from '../worker/a1.mjs';
const { ok, done } = counter();
const E = await setup(54480); const { q, as, rpcAs } = E;
const svc = rpcAs('service_role');
const rejects = async (fn, re = /invalid_input/) => { try { await fn(); return false; } catch (e) { return re.test(e.err || e.message); } };
const W = ['rw_worker_tick', 'rw_worker_rounds', 'rw_worker_claim', 'rw_worker_commit', 'rw_worker_report_failure', 'rw_worker_roster', 'rw_worker_start_fight', 'rw_ops_stuck_list', 'rw_ops_resume', 'rw_ops_register_engine', 'rw_ops_terminate'];
const ARGS = { rw_worker_tick: {}, rw_worker_rounds: { p_fights: [1] }, rw_worker_claim: { p_fight: 1, p_round: 1 }, rw_worker_commit: { p_fight: 1, p_round: 1, p_token: '11111111-1111-4111-8111-111111111111', p_version: 1, p_input_hash: 'a'.repeat(64), p_engine: 'x', p_result: {} },
  rw_worker_report_failure: { p_fight: 1, p_round: 1, p_token: '11111111-1111-4111-8111-111111111111', p_error: 'x' }, rw_worker_roster: { p_instance: 1 }, rw_worker_start_fight: { p_instance: 1, p_state: {} }, rw_ops_stuck_list: {}, rw_ops_resume: { p_fight: 1, p_round: 1, p_operator: 'op', p_note: 'zehn zeichen' }, rw_ops_register_engine: { p_version: 'e-1', p_state_schema: 1 }, rw_ops_terminate: { p_fight: 1, p_operator: 'op', p_note: 'zehn zeichen' } };
try {
  console.log('PostgreSQL', await q('show server_version'));
  // ---- 1. Berechtigungsmatrix aus dem Katalog ----
  const rows = (await q(`select p.proname || '|' || has_function_privilege('anon', p.oid, 'execute') || '|' || has_function_privilege('authenticated', p.oid, 'execute') || '|' || has_function_privilege('service_role', p.oid, 'execute') || '|' || coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a), true)::text || '|' || p.prosecdef::text || '|' || coalesce(p.proconfig::text, '') || '|' || p.proowner::regrole::text || '|' || pg_get_function_identity_arguments(p.oid)
    from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'rw\\_%') order by 1`)).split('\n').map((l) => l.split('|'));
  ok(rows.map((r) => r[0]).join() === [...W].sort().join(), 'genau die elf A1-Wrapper existieren (rw_worker_*, rw_ops_*)', rows.map((r) => r[0]).join(','));
  ok(rows.every((r) => r[1] === 'false' && r[2] === 'false'), 'anon und authenticated dürfen KEINEN Wrapper ausführen (Katalog)');
  ok(rows.every((r) => r[4] === 'false'), 'kein PUBLIC-Recht (auch nicht das PostgreSQL-Standard-EXECUTE)');
  ok(rows.every((r) => r[3] === 'true'), 'service_role darf jeden Wrapper ausführen');
  ok(rows.every((r) => r[5] === 'false'), 'alle Wrapper sind SECURITY INVOKER (keine Rechteausweitung über den Besitzer)');
  ok(rows.every((r) => r[6] === '{"search_path=pg_catalog, pg_temp"}'), 'alle Wrapper haben den festen search_path pg_catalog, pg_temp', [...new Set(rows.map((r) => r[6]))].join(' / '));
  console.log('# Berechtigungsmatrix (Katalog): Wrapper | anon | authenticated | service_role | PUBLIC | SECURITY DEFINER | Argumente'); for (const r of rows) console.log(`#   ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[5]} | ${r[8]}`);
  const SCH = (await q(`select has_schema_privilege('anon','rwi','usage') || '|' || has_schema_privilege('authenticated','rwi','usage') || '|' || has_schema_privilege('service_role','rwi','usage')`));
  ok(SCH === 'false|false|true', 'Schema rwi: anon/authenticated ohne USAGE (nicht über die Data API erreichbar), service_role mit USAGE (für die INVOKER-Wrapper)', SCH);
  ok((await q(`select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'rw\\_%' and pg_get_functiondef(p.oid) ~ 'rwi\\.' and not (pg_get_functiondef(p.oid) ~ 'search_path')`)) === '0', 'jeder Wrapper, der rwi aufruft, hat eine feste search_path-Konfiguration');
  // je Wrapper genau eine rwi-Funktion
  const calls = {};
  for (const w of W) { const body = await q(`select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='${w}'`); calls[w] = [...new Set((body.match(/rwi\.[a-z_]+/g) || []))]; }
  ok(Object.values(calls).every((c) => c.length === 1), 'jeder Wrapper ruft genau eine rwi-Funktion auf', JSON.stringify(calls));
  console.log('# Wrapper -> rwi-Funktion: ' + Object.entries(calls).map(([k, v]) => `${k}=${v[0]}`).join(', '));

  // ---- 2. anon/authenticated werden abgewiesen (tatsächlicher Aufruf) ----
  const A = await E.account('A1a'), B = await E.account('A1b');
  for (const role of ['anon', 'authenticated']) {
    let all = true; const bad = [];
    for (const w of W) { try { await rpcAs(role, role === 'authenticated' ? A.id : null)(w, ARGS[w]); all = false; bad.push(w); } catch (e) { if (!/permission denied for function/.test(e.err || '')) { all = false; bad.push(w + ':' + e.message); } } }
    ok(all, `${role}: alle 11 Wrapper-Aufrufe scheitern mit „permission denied for function“`, bad.join(','));
  }
  ok((await as('authenticated', A.id, `select * from rwi.fights`)).err.includes('permission denied') && (await as('anon', null, `select rwi.claim_resolution(1,1)`)).err.includes('permission denied'), 'direkter Zugriff auf rwi bleibt für Clients gesperrt (Tabellen und Funktionen)');

  // ---- 3. Eingabeprüfung: ungültige Eingaben ändern nichts und werfen invalid_input ----
  const snap = () => q(`select (select count(*) from rwi.fights) || '/' || (select count(*) from rwi.resolve_jobs) || '/' || (select count(*) from rwi.ops_alerts) || '/' || (select count(*) from rwi.ops_log) || '/' || (select count(*) from rwi.round_results)`);
  const s0 = await snap();
  const G = ARGS;
  const bads = [['rw_worker_rounds', { p_fights: [] }], ['rw_worker_rounds', { p_fights: Array.from({ length: 101 }, (_, i) => i + 1) }], ['rw_worker_rounds', { p_fights: [0] }], ['rw_worker_rounds', { p_fights: null }],
    ['rw_worker_claim', { p_fight: 0, p_round: 1 }], ['rw_worker_claim', { p_fight: 1, p_round: 0 }], ['rw_worker_claim', { p_fight: null, p_round: 1 }], ['rw_worker_claim', { p_fight: 1, p_round: 100001 }],
    ['rw_worker_commit', { ...G.rw_worker_commit, p_input_hash: 'XYZ' }], ['rw_worker_commit', { ...G.rw_worker_commit, p_input_hash: 'A'.repeat(64) }], ['rw_worker_commit', { ...G.rw_worker_commit, p_engine: 'böse; drop table' }], ['rw_worker_commit', { ...G.rw_worker_commit, p_engine: 'x'.repeat(65) }],
    ['rw_worker_commit', { ...G.rw_worker_commit, p_result: null }], ['rw_worker_commit', { ...G.rw_worker_commit, p_result: ['x'] }], ['rw_worker_commit', { ...G.rw_worker_commit, p_result: { pad: 'x'.repeat(262200) } }], ['rw_worker_commit', { ...G.rw_worker_commit, p_token: null }], ['rw_worker_commit', { ...G.rw_worker_commit, p_version: -1 }],
    ['rw_worker_report_failure', { ...G.rw_worker_report_failure, p_error: 'x'.repeat(2001) }], ['rw_worker_report_failure', { ...G.rw_worker_report_failure, p_error: null }], ['rw_worker_report_failure', { ...G.rw_worker_report_failure, p_token: null }],
    ['rw_worker_roster', { p_instance: 0 }], ['rw_worker_roster', { p_instance: null }], ['rw_worker_start_fight', { p_instance: 1, p_state: ['x'] }], ['rw_worker_start_fight', { p_instance: 1, p_state: null }], ['rw_worker_start_fight', { p_instance: -3, p_state: {} }],
    ['rw_ops_resume', { ...G.rw_ops_resume, p_operator: null }], ['rw_ops_resume', { ...G.rw_ops_resume, p_note: 'x'.repeat(4001) }], ['rw_ops_resume', { ...G.rw_ops_resume, p_round: 0 }], ['rw_ops_terminate', { ...G.rw_ops_terminate, p_operator: 'x'.repeat(201) }], ['rw_ops_terminate', { ...G.rw_ops_terminate, p_fight: 0 }]];
  let nbad = 0; const miss = [];
  for (const [w, a] of bads) { if (!(await rejects(() => svc(w, a)))) { nbad++; miss.push(w + JSON.stringify(a).slice(0, 50)); } }
  ok(nbad === 0, `${bads.length} ungültige Eingaben werden mit invalid_input (PT400) abgewiesen`, miss.join(' ; '));
  ok((await snap()) === s0, 'abgewiesene Eingaben haben nichts in der Datenbank verändert');
  ok((await svc('rw_worker_claim', { p_fight: 999999, p_round: 1 })).status === 'unknown_fight', 'unbekannter Kampf: nur {status: unknown_fight}');
  ok(JSON.stringify(Object.keys(await svc('rw_worker_claim', { p_fight: 999999, p_round: 1 }))) === '["status"]', 'ohne Zuteilung enthält die Antwort ausschließlich das Feld status');
  ok((await svc('rw_ops_resume', { p_fight: 999999, p_round: 1, p_operator: 'op', p_note: 'zu kurz' })).status === 'invalid_input', 'Wiederaufnahme ohne ausreichende Begründung (<10 Zeichen): invalid_input, keine Wirkung');

  // ---- 4. kompletter Worker-Lauf nur über die Wrapper ----
  const X = await E.account('A1x'), Y = await E.account('A1y'), Z = await E.account('A1z');
  const g = await E.group([X.chars[0], Y.chars[0], Z.chars[0]]);
  const db = a1Db(svc); const ops = opsA1(svc);
  for (const c of [X, Y, Z]) await q(`select rwi.set_ready(${g.instance}, '${c.chars[0]}')`);
  const tk = await db.watchdog(); ok(JSON.stringify(Object.keys(tk).sort()) === '["due","redispatch","start","stuck_new","stuck_open"]', 'rw_worker_tick liefert nur due, redispatch, start, stuck_new, stuck_open', Object.keys(tk).join(','));
  const roster = await db.roster(g.instance);
  ok(Array.isArray(roster) && roster.length === 3 && JSON.stringify(Object.keys(roster[0]).sort()) === '["grundklasse","id","name","pfad","tier"]', 'rw_worker_roster: nur Kampfprofil-Felder (id, name, grundklasse, pfad, tier)', Object.keys(roster[0] || {}).join(','));
  const sf = await db.startFight(g.instance, engine.newFight(roster, { bossHp: 150, bossAtk: 8 }));
  ok(sf.status === 'ok' && JSON.stringify(Object.keys(sf).sort()) === '["fight","fight_no","status"]', 'rw_worker_start_fight: nur status, fight, fight_no', JSON.stringify(sf));
  const fid = sf.fight;
  await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid}`);
  const t = await runTick(db, engine);
  ok(t.results.some((r) => r.fight === fid && r.status === 'committed') && (await q(`select count(*) from rwi.round_results where fight_id=${fid}`)) === '1', 'Worker-Kern löst die fällige Runde ausschließlich über A1-Wrapper auf und committet genau einmal', JSON.stringify(t.results[0]));
  // Claim-Antwort: nur die nötigen Felder
  await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
  const c = await db.claim(fid, +(await q(`select round_no from rwi.fights where id=${fid}`)));
  ok(c.status === 'ok' && JSON.stringify(Object.keys(c).sort()) === '["input","input_hash","round_version","status","token"]', 'rw_worker_claim (Zuteilung): status, token, round_version, input, input_hash – nichts sonst', Object.keys(c).join(','));
  const cm = await db.commit(fid, c.input.round_no, c.token, c.round_version, c.input_hash, engine.ENGINE_VERSION, engine.resolveClaim(c.input));
  ok(cm.status === 'committed' && Object.keys(cm).every((k) => ['status', 'outcome', 'reason'].includes(k)), 'rw_worker_commit: nur status/outcome/reason', JSON.stringify(cm));
  ok((await db.commit(fid, c.input.round_no, c.token, c.round_version, c.input_hash, engine.ENGINE_VERSION, engine.resolveClaim(c.input))).status !== 'committed', 'zweiter Commit derselben Runde wird nicht erneut angewendet');
  // Fehlermeldung des Workers
  await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
  const c2 = await db.claim(fid, +(await q(`select round_no from rwi.fights where id=${fid}`)));
  const rf = await db.reportFailure(fid, c2.input.round_no, c2.token, 'Engine-Ausnahme (Test)');
  ok(rf.status === 'recorded' && rf.attempts === 1 && rf.retry_in === 5 && Object.keys(rf).length === 3, 'rw_worker_report_failure: status, attempts, retry_in (5 s beim ersten Fehler)', JSON.stringify(rf));
  ok(Array.isArray(await ops.stuckList()), 'rw_ops_stuck_list liefert eine Liste');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { E.stop(); }
process.exit(done());

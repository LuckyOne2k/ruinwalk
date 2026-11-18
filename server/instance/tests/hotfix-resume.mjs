// Hotfix und kontrollierte Wiederaufnahme von stuck-Instanzen (Beschluss 3): node server/instance/tests/hotfix-resume.mjs
// Geprüft: stuck bleibt gesperrt, Kompatibilitätsprüfung der neuen Engine-Version, Protokoll alt/neu, keine Doppelverarbeitung (Runden und Aktionen), teilweise verarbeiteter Job,
// späte Commits mit altem Token, Replay/Determinismus bleibt unberührt. Lokal; keine echte Edge Function.
import { setup, counter, J } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { hashOf } from '../engine/rng.mjs';
import { runTick } from '../worker/core.mjs';
import { a1Db, opsA1 } from '../worker/a1.mjs';
const { ok, done } = counter();
const E = await setup(54491); const { q, rpcAs } = E;
const svc = rpcAs('service_role'); const db = a1Db(svc), ops = opsA1(svc);
const broken = { ...engine, resolveClaim: () => { throw new Error('Engine kaputt (Test)'); } };
let n = 0;
const mkFight = async () => {
  const ps = []; for (let k = 0; k < 2; k++) ps.push(await E.account('H' + (++n) + 'x' + k));
  const g = await E.group(ps.map((p) => p.chars[0])); for (const p of ps) await q(`select rwi.set_ready(${g.instance}, '${p.chars[0]}')`);
  const S = engine.newFight(J(await q(`select rwi.roster(${g.instance})`)), { bossHp: 4000, bossAtk: 8 });
  await q(`select rwi.start_fight(${g.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${g.instance}`));
  const due = () => q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
  const expire = () => q(`update rwi.fights set lease_until = clock_timestamp() - interval '1 second' where id=${fid} and phase='resolving'`);
  await due();
  return { inst: g.instance, fid, due, expire, players: ps.map((p) => p.chars[0]) };
};
const goodRound = async (K, r, eng = engine.ENGINE_VERSION) => { const c = await db.claim(K.fid, r); const k = await db.commit(K.fid, r, c.token, c.round_version, c.input_hash, eng, engine.resolveClaim(c.input)); await K.due(); return { c, k }; };
const toStuck = async (K) => { for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await K.expire(); } };
const open = (fid) => q(`select count(*) from rwi.ops_alerts where what='stuck' and fight_id=${fid} and state='open'`);
const alerts = (fid) => q(`select count(*) from rwi.ops_alerts where what='stuck' and fight_id=${fid}`);
const results = (fid) => q(`select count(*) from rwi.round_results where fight_id=${fid}`);
const jobst = (fid, r) => q(`select status || '/' || attempts || '/' || resumes from rwi.resolve_jobs where fight_id=${fid} and round_no=${r}`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q(`update rwi.cfg set v = 6 where k = 'max_attempts'`);

  // ---- 1. Kompatibilitätsregister ----
  ok((await ops.registerEngine('v1-hotfix-1', 1, 'kompatibel')).status === 'registered', 'kompatible Engine-Version (Zustandsschema 1) registriert');
  ok((await ops.registerEngine('v2-neues-schema', 2, 'inkompatibel')).status === 'registered', 'Engine-Version mit anderem Zustandsschema (2) registriert');
  ok((await ops.registerEngine('v1-hotfix-1', 2, 'umschreiben')).status === 'exists' && (await q(`select state_schema from rwi.engine_versions where version='v1-hotfix-1'`)) === '1', 'eine registrierte Version wird nie umgeschrieben');

  // ---- 2. teilweise verarbeiteter Job: Runde 1 fertig, Runde 2 scheitert ----
  const K = await mkFight(); const r1 = await goodRound(K, 1);
  ok(r1.k.status === 'committed', 'Vorbereitung: Runde 1 ist abgeschlossen');
  const r1row = await q(`select md5(input::text || result::text) || ':' || engine_version from rwi.round_results where fight_id=${K.fid} and round_no=1`);
  const act = await q(`select md5(actions::text) from rwi.fights where id=${K.fid}`);
  const c2 = await db.claim(K.fid, 2); const good2 = engine.resolveClaim(c2.input);
  const bad = JSON.parse(JSON.stringify(good2)); bad.state.members[0].hp = 99999;                                // Engine hat „teilweise“ gerechnet und ein ungültiges Ergebnis geliefert
  const inv = []; for (let k = 0; k < 6; k++) inv.push((await db.commit(K.fid, 2, c2.token, c2.round_version, c2.input_hash, engine.ENGINE_VERSION, bad)).status);
  ok(inv.every((x) => x === 'invalid') && (await jobst(K.fid, 2)) === 'stuck/6/0' && (await open(K.fid)) === '1' && (await alerts(K.fid)) === '1', 'Runde 2: nach 6 ungültigen Ergebnissen stuck, ein Alarm; nichts gespeichert', (await jobst(K.fid, 2)));
  ok((await results(K.fid)) === '1', 'nur das Ergebnis von Runde 1 existiert');
  const late = await db.commit(K.fid, 2, c2.token, c2.round_version, c2.input_hash, engine.ENGINE_VERSION, good2);
  ok(late.status === 'stuck_locked' && (await results(K.fid)) === '1', 'selbst ein gültiges Ergebnis wird auf einem stuck-Auftrag nicht angenommen (gesperrt bis Operatorentscheidung)', late.status);
  const cl = await db.claim(K.fid, 2); ok(cl.status === 'stuck', 'Claim auf stuck-Runde: status stuck, keine neue Zuteilung', cl.status);

  // ---- 3. Ablehnungen bei der Wiederaufnahme ----
  const R = (eng, note = 'Fehlerursache untersucht, Hotfix vorbereitet') => ops.resume(K.fid, 2, 'pascal', note, eng);
  ok((await R('v9-unbekannt')).status === 'unknown_engine', 'nicht registrierte Engine-Version: unknown_engine');
  const inc = await R('v2-neues-schema'); ok(inc.status === 'incompatible_engine' && inc.engine_schema === 2 && inc.state_schema === 1, 'inkompatible Engine-Version (anderes Zustandsschema) wird abgelehnt', JSON.stringify(inc));
  ok((await R('v1-hotfix-1', 'kurz')).status === 'invalid_input', 'ohne ausreichende Begründung: invalid_input');
  ok((await ops.resume(K.fid, 2, 'p', 'Begründung ist lang genug', 'v1-hotfix-1')).status === 'invalid_input', 'ohne Betreiberkennung (zu kurz): invalid_input');
  ok((await ops.resume(K.fid, 1, 'pascal', 'Runde 1 ist längst abgeschlossen', 'v1-hotfix-1')).status === 'stale', 'bereits abgeschlossene Runde 1: stale, nichts wird erneut verarbeitet');
  ok((await jobst(K.fid, 2)) === 'stuck/6/0' && (await open(K.fid)) === '1' && (await q(`select count(*) from rwi.ops_log where fight_id=${K.fid}`)) === '0' && (await q(`select engine_stuck::text from rwi.instances where id=${K.inst}`)) === 'true', 'nach allen Ablehnungen: unverändert stuck, Alarm offen, kein Protokolleintrag, Instanz weiter gesperrt');

  // ---- 4. Wiederaufnahme mit kompatibler neuer Version ----
  const rs = await R('v1-hotfix-1');
  ok(rs.status === 'resumed' && rs.old_engine === engine.ENGINE_VERSION && rs.new_engine === 'v1-hotfix-1', 'Wiederaufnahme: alte und neue Engine-Version', JSON.stringify(rs));
  const lg = J(await q(`select row_to_json(l) from rwi.ops_log l where fight_id=${K.fid}`));
  ok(lg.kind === 'resume' && lg.operator === 'pascal' && lg.old_engine === engine.ENGINE_VERSION && lg.new_engine === 'v1-hotfix-1' && lg.note.length >= 10, 'Betriebsprotokoll: Art, Betreiber, Begründung, alte und neue Version');
  ok((await open(K.fid)) === '0' && (await alerts(K.fid)) === '1' && (await q(`select state || ':' || resolved_note from rwi.ops_alerts where fight_id=${K.fid}`)).startsWith('resolved:resume'), 'Alarm erledigt (Historie bleibt erhalten, kein neuer Alarm)');
  const stale = await db.commit(K.fid, 2, c2.token, c2.round_version, c2.input_hash, 'v1-hotfix-1', good2);
  ok(stale.status === 'superseded' && (await results(K.fid)) === '1', 'später Commit des ALTEN Workers (alter Token) nach der Wiederaufnahme wird abgewiesen', stale.status);
  const c3 = await db.claim(K.fid, 2);
  ok(c3.status === 'ok' && c3.input_hash === c2.input_hash && JSON.stringify(c3.input.snapshot) === JSON.stringify(c2.input.snapshot), 'neue Zuteilung nutzt EXAKT den gespeicherten Snapshot (gleicher input_hash): keine Aktion wird wiederholt, keine neu gelesen');
  ok((await q(`select md5(actions::text) from rwi.fights where id=${K.fid}`)) === act, 'gespeicherte Aktionen des Kampfes unverändert');
  const wrong = await db.commit(K.fid, 2, c3.token, c3.round_version, c3.input_hash, engine.ENGINE_VERSION, engine.resolveClaim(c3.input));
  ok(wrong.status === 'engine_mismatch' && (await results(K.fid)) === '1', 'Commit mit einer anderen als der freigegebenen Engine-Version: engine_mismatch', wrong.status);
  const fin = await db.commit(K.fid, 2, c3.token, c3.round_version, c3.input_hash, 'v1-hotfix-1', engine.resolveClaim(c3.input));
  ok(fin.status === 'committed' && (await results(K.fid)) === '2' && (await q(`select engine_version from rwi.round_results where fight_id=${K.fid} and round_no=2`)) === 'v1-hotfix-1', 'Runde 2 mit der freigegebenen Version genau einmal committet', fin.status);
  ok((await q(`select md5(input::text || result::text) || ':' || engine_version from rwi.round_results where fight_id=${K.fid} and round_no=1`)) === r1row, 'Ergebnis von Runde 1 byte-gleich (nicht erneut verarbeitet)');
  const again = await db.commit(K.fid, 2, c3.token, c3.round_version, c3.input_hash, 'v1-hotfix-1', engine.resolveClaim(c3.input));
  ok(again.status === 'already_resolved' && (await results(K.fid)) === '2', 'zweiter Commit derselben Runde: already_resolved');
  ok((await ops.resume(K.fid, 2, 'pascal', 'Zweite Wiederaufnahme darf nichts tun', 'v1-hotfix-1')).status === 'stale' && (await q(`select count(*) from rwi.ops_log where fight_id=${K.fid}`)) === '1', 'zweite Wiederaufnahme der fertigen Runde: stale (Kampf ist schon in Runde 3), kein zweiter Protokolleintrag');
  // Replay/Determinismus: gespeicherte Eingabe liefert bitgleich das gespeicherte Ergebnis (Engine unverändert)
  { const rr = J(await q(`select json_agg(json_build_object('i', input, 'r', result) order by round_no) from rwi.round_results where fight_id=${K.fid}`)); let same = 0;
    for (const x of rr) { const re = engine.resolveClaim(x.i); same += hashOf(re) === hashOf(x.r) ? 1 : 0; }
    ok(same === rr.length, 'Replay: beide Runden (auch die nach der Wiederaufnahme) werden aus der gespeicherten Eingabe bitgleich reproduziert', `${same}/${rr.length}`); }

  // ---- 5. erneutes stuck nach der Wiederaufnahme = neue Episode, neuer Alarm ----
  const L = await mkFight(); await toStuck(L); await ops.registerEngine('v1-hotfix-2', 1);
  ok((await ops.resume(L.fid, 1, 'pascal', 'erste Wiederaufnahme, Ursache untersucht', 'v1-hotfix-2')).status === 'resumed', 'Wiederaufnahme 1');
  await L.expire(); for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await L.expire(); }
  ok((await jobst(L.fid, 1)) === 'stuck/6/1' && (await alerts(L.fid)) === '2' && (await open(L.fid)) === '1', 'Engine weiterhin defekt: wieder stuck, NEUER Alarm (Episode 1), alter bleibt als erledigt', await jobst(L.fid, 1));
  ok((await q(`select string_agg(dedupe_key || '=' || state, ',' order by id) from rwi.ops_alerts where fight_id=${L.fid}`)) === `stuck:${L.fid}:1:0=resolved,stuck:${L.fid}:1:1=open`, 'Alarmhistorie: Episode 0 erledigt, Episode 1 offen');

  // ---- 6. Wiederaufnahme ohne neue Engine-Version (z. B. vorübergehender Fehler) ----
  const M = await mkFight(); await toStuck(M);
  const rm = await ops.resume(M.fid, 1, 'pascal', 'vorübergehender Fehler, gleiche Version');
  ok(rm.status === 'resumed' && rm.new_engine === null && rm.old_engine === 'unbekannt', 'ohne Versionsangabe: Wiederaufnahme mit unverändertem Code (Version war nicht bekannt, wird als „unbekannt“ protokolliert)', JSON.stringify(rm));
  const cm = await db.claim(M.fid, 1); const km = await db.commit(M.fid, 1, cm.token, cm.round_version, cm.input_hash, engine.ENGINE_VERSION, engine.resolveClaim(cm.input));
  ok(km.status === 'committed', 'Runde wird danach regulär aufgelöst');

  // ---- 7. Wiederaufnahme nur bei beendeter/fremder Lage nicht möglich ----
  const N = await mkFight(); await toStuck(N); await q(`select rwi.abort_instance(${N.inst}, 'Test')`);
  ok((await ops.resume(N.fid, 1, 'pascal', 'Instanz ist bereits beendet', 'v1-hotfix-1')).status === 'not_active', 'beendete Instanz: not_active');
  // ---- 8. Wrapper-Eingaben ----
  ok((await svc('rw_ops_register_engine', { p_version: 'x'.repeat(201), p_state_schema: 1 }).catch((e) => ({ err: String(e.message || e) }))) !== undefined, 'Registrierung mit überlanger Version wird behandelt');
  const wl = await q(`select count(*) from rwi.engine_versions where length(version) > 80`); ok(wl === '0', 'keine überlange Version im Register');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { E.stop(); }
process.exit(done());

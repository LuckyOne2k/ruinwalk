// Betreiberidentität für resume_stuck / terminate_stuck / register_engine: node server/instance/tests/operatoren.mjs
// Geprüft: Berechtigung nur über rwi.operators (Konto-UUID), Freitext/fremde ID/deaktiviert/falscher Umfang werden abgewiesen und protokolliert, Protokoll vollständig und nur anhängend,
// Normalclient (anon/authenticated) kommt an nichts heran, abgeschlossene Runden werden nie erneut verarbeitet. NICHT geprüft (lokal nicht beweisbar): GoTrue/JWT-Prüfung des Betreibers.
import { setup, counter, J } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { runTick } from '../worker/core.mjs';
import { a1Db, opsA1 } from '../worker/a1.mjs';
const { ok, done } = counter();
const E = await setup(54493); const { q, rpcAs } = E;
const svc = rpcAs('service_role'); const db = a1Db(svc), ops = opsA1(svc);
const rejects = async (f) => { try { await f(); return false; } catch { return true; } };
const broken = { ...engine, resolveClaim: () => { throw new Error('Engine kaputt (Test)'); } };
const acc = async (n) => (await E.account(n, 0)).id;
const FREMD = '00000000-0000-4000-8000-000000000999';
let n = 0;
const mkStuck = async () => {
  const ps = []; for (let k = 0; k < 2; k++) ps.push(await E.account('O' + (++n) + 'x' + k));
  const g = await E.group(ps.map((p) => p.chars[0])); for (const p of ps) await q(`select rwi.set_ready(${g.instance}, '${p.chars[0]}')`);
  const S = engine.newFight(J(await q(`select rwi.roster(${g.instance})`)), { bossHp: 4000, bossAtk: 8 });
  await q(`select rwi.start_fight(${g.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${g.instance}`));
  const due = () => q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
  const expire = () => q(`update rwi.fights set lease_until = clock_timestamp() - interval '1 second' where id=${fid} and phase='resolving'`);
  await due();
  for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await expire(); }
  return { fid, inst: g.instance };
};
const lg = (w) => q(`select count(*) from rwi.ops_log where ${w}`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q(`update rwi.cfg set v = 6 where k = 'max_attempts'`);
  const A = await acc('OpA'), B = await acc('OpB'), C = await acc('OpC'), D = await acc('OpD');
  const sop = (id, l, sc) => q(`select rwi.set_operator('${id}', '${l}', array[${sc.map((x) => `'${x}'`).join(',')}])`);
  await sop(A, 'Alice', ['resume', 'terminate', 'engine']); await sop(B, 'Bob', ['engine']); await sop(C, 'Carl', ['resume', 'terminate']);
  ok((await lg(`kind='operator_change'`)) === '3', 'jede Betreiberanlage steht im Betriebsprotokoll (3 Einträge)');

  const K = await mkStuck();
  // ---- Abweisungen: keine Wirkung, aber protokolliert ----
  const before = async () => (await q(`select engine_stuck::text || ':' || (select count(*) from rwi.ops_alerts where state='open' and fight_id=${K.fid}) from rwi.instances where id=${K.inst}`));
  const s0 = await before();
  const bad = [['Freitext statt ID', 'pascal'], ['unbekannte UUID', FREMD], ['Betreiber ohne Umfang resume (nur engine)', B], ['Konto ohne Betreiberzeile', D]];
  for (const [what, id] of bad) {
    if (id === 'pascal') ok(await rejects(() => ops.resume(K.fid, 1, id, 'Fehlerursache untersucht, Hotfix', null)), 'Freitext als Betreiber wird abgewiesen (keine UUID)');
    else { const st = (await ops.resume(K.fid, 2, id, 'Fehlerursache untersucht, Hotfix')).status; ok(st === 'not_operator', `${what}: not_operator`, st); }
  }
  ok((await before()) === s0, 'abgewiesene Aufrufe lassen Instanz und Alarm unverändert (weiter gesperrt)');
  ok((await lg(`kind='denied' and fight_id=${K.fid}`)) === '3', 'drei abgewiesene Aufrufe sind als denied protokolliert (mit Betreiber-ID, Kampf, Runde)', await q(`select string_agg(operator_id::text||':'||note, ' ; ') from rwi.ops_log where kind='denied'`));
  ok((await q(`select count(*) from rwi.ops_log where kind='denied' and operator_id='${FREMD}' and round_no=2 and instance_id=${K.inst} and note like 'resume:%'`)) === '1', 'denied-Eintrag enthält Betreiber-ID, Runde, Instanz und Grund');
  ok((await ops.terminate(K.fid, B, 'Bob darf nicht beenden, nur Engine')).status === 'not_operator', 'terminate ohne Umfang terminate: not_operator');
  ok((await ops.registerEngine(C, 'x-ohne-recht', 1)).status === 'not_operator' && (await q(`select count(*) from rwi.engine_versions where version='x-ohne-recht'`)) === '0', 'register_engine ohne Umfang engine: not_operator, nichts registriert');
  ok((await ops.resume(K.fid, 2, A, 'zu kurz')).status === 'invalid_input', 'Begründung Pflicht (mindestens 10 Zeichen): invalid_input');

  // ---- deaktiviert ----
  await q(`update rwi.operators set active=false where account_id='${C}'`);
  ok((await ops.resume(K.fid, 2, C, 'Carl ist deaktiviert und darf nichts')).status === 'not_operator' && (await q(`select count(*) from rwi.ops_log where kind='denied' and operator_id='${C}' and note like '%deaktiviert%'`)) === '1', 'deaktivierter Betreiber wird abgewiesen, Grund protokolliert');
  await q(`update rwi.operators set active=true where account_id='${C}'`);

  // ---- Erfolgsfall: Protokoll vollständig ----
  await ops.registerEngine(B, 'v1-op-hotfix', 1, 'kompatibel');
  const reg = J(await q(`select row_to_json(l) from rwi.ops_log l where kind='register_engine' and new_engine='v1-op-hotfix'`));
  ok(reg.operator_id === B && reg.operator === 'Bob' && reg.at, 'Engine-Registrierung protokolliert Betreiber-ID, Name und Zeit');
  const r = await ops.resume(K.fid, 1, A, 'Fehlerursache analysiert, Hotfix eingespielt', 'v1-op-hotfix');
  ok(r.status === 'resumed', 'berechtigter Betreiber: resumed', JSON.stringify(r));
  const l = J(await q(`select row_to_json(l) from rwi.ops_log l where kind='resume' and fight_id=${K.fid}`));
  ok(l.operator_id === A && l.operator === 'Alice' && l.fight_id === K.fid && l.round_no === 1 && l.instance_id === K.inst && l.old_engine && l.new_engine === 'v1-op-hotfix' && l.note.length >= 10 && l.at, 'Resume-Protokoll: Betreiber-ID, Name, Zeit, Kampf, Runde, Instanz, alte/neue Engine, Begründung');
  ok((await ops.resume(K.fid, 1, A, 'Zweite Wiederaufnahme derselben Runde')).status !== 'resumed' && (await lg(`kind='resume' and fight_id=${K.fid}`)) === '1', 'zweiter Resume derselben (nicht mehr stuck/abgeschlossenen) Runde wirkt nicht, kein zweiter Protokolleintrag');

  // ---- Terminate ----
  const T = await mkStuck();
  ok((await ops.terminate(T.fid, A, 'Ursache nicht behebbar, Instanz technisch beenden')).status === 'terminated', 'berechtigter Betreiber beendet technisch');
  const t = J(await q(`select row_to_json(l) from rwi.ops_log l where kind='terminate' and fight_id=${T.fid}`));
  ok(t.operator_id === A && t.instance_id === T.inst && t.note && t.at, 'Terminate-Protokoll vollständig');

  // ---- Append-only und Verwaltung ----
  ok(await rejects(() => q(`update rwi.ops_log set note='x' where id=(select min(id) from rwi.ops_log)`)), 'ops_log: UPDATE verboten');
  ok(await rejects(() => q(`delete from rwi.ops_log where id=(select min(id) from rwi.ops_log)`)), 'ops_log: DELETE verboten');
  ok(await rejects(() => q(`set role service_role; truncate rwi.ops_log`)), 'ops_log: service_role darf nicht leeren (TRUNCATE ohne Recht); der Datenbank-Eigentümer wird nicht per Trigger gebremst (dokumentierte Grenze)');
  await q(`delete from rwi.operators where account_id='${D}'`);
  await q(`select rwi.set_operator('${D}', 'Dora', array['resume'])`);
  ok(+(await q(`select count(*) from rwi.ops_log where kind='operator_change'`)) >= 4, 'Betreiberänderungen bleiben protokolliert');
  ok(await rejects(() => q(`select rwi.set_operator('${D}', 'x', array['alles'])`)), 'unbekannter Umfang wird abgewiesen');
  ok(await rejects(() => q(`select rwi.set_operator('${FREMD}', 'Geist', array['resume'])`)), 'Betreiber muss ein echtes Konto sein (Fremdschlüssel auf auth.users)');
  await q(`delete from auth.users where id='${D}'`).catch(() => {});

  // ---- Normalclient ----
  const wr = ['rw_ops_resume', 'rw_ops_terminate', 'rw_ops_register_engine'];
  const args = { rw_ops_resume: { p_fight: K.fid, p_round: 1, p_operator: A, p_note: 'Normalclient darf das nie' }, rw_ops_terminate: { p_fight: K.fid, p_operator: A, p_note: 'Normalclient darf das nie' }, rw_ops_register_engine: { p_operator: A, p_version: 'evil', p_state_schema: 1 } };
  for (const role of ['anon', 'authenticated']) {
    const c = rpcAs(role); let all = true;
    for (const w of wr) if (!(await rejects(() => c(w, args[w])))) all = false;
    ok(all, `${role}: alle drei Betreiber-Wrapper verweigert (kein Ausführungsrecht)`);
    ok(await rejects(() => q(`set role ${role}; select * from rwi.operators`)) && await rejects(() => q(`set role ${role}; select rwi.set_operator('${A}', 'x', array['resume'])`)) && await rejects(() => q(`set role ${role}; select rwi.resume_stuck(1,1,'${A}','xxxxxxxxxxxx')`)), `${role}: rwi.operators, set_operator und rwi.resume_stuck sind nicht erreichbar`);
  }
  ok((await q(`select count(*) from rwi.engine_versions where version='evil'`)) === '0', 'Normalclient-Versuche haben keine Engine registriert');
  ok((await q(`select count(*) from pg_proc where proname='set_operator' and pronamespace='public'::regnamespace`)) === '0', 'keine öffentliche Verwaltungsfunktion für Betreiber (kein neues Admin-Interface)');

  // ---- Betreiberkonto gelöscht ----
  const A2 = await acc('OpGone'); await sop(A2, 'Gone', ['resume']);
  await q(`delete from auth.users where id='${A2}'`);
  ok((await q(`select count(*) from rwi.operators where account_id='${A2}'`)) === '0' && (await lg(`kind='operator_change' and operator_id='${A2}' and note like '%entfernt%'`)) === '1', 'Betreiberkonto gelöscht: Betreiberzeile entfällt, Protokoll behält die Konto-ID');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { E.stop(); }
process.exit(done());

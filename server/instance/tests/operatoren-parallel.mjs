// Korrektur K6 (HARTES, atomares Limit für 'denied'-Protokolleinträge) unter echter Gleichzeitigkeit: node server/instance/tests/operatoren-parallel.mjs
// Jeder Aufruf läuft in einer eigenen psql-Sitzung = eigene Datenbanktransaktion gegen ein echtes lokales PostgreSQL (kein Stub). Supabase selbst (GoTrue, PostgREST, Rollen) ist weiterhin SIMULIERT bzw. nicht beteiligt.
// Mit Mutationsproben: ein nicht atomarer Zähl-/Einfügevorgang MUSS von diesen Tests erkannt werden.
import { setup, counter } from './prod-env.mjs';
const { ok, done } = counter();
const E = await setup(54501); const { q, parallel, rpcAs } = E; const svc = rpcAs('service_role');
const U = (n) => `eeee${String(n).padStart(4, '0')}-0000-4000-8000-000000000000`;
const call = (id) => `select rwi.check_operator('${id}', 'resume', null, null, null) is null`;
const rows = (w = 'true') => q(`select count(*) from rwi.ops_log where kind='denied' and ${w}`);
const reset = async () => { await q(`alter table rwi.ops_log disable trigger ops_log_no_change`); await q(`delete from rwi.ops_log where kind='denied'`); await q(`alter table rwi.ops_log enable trigger ops_log_no_change`); };   // nur im Testcluster
const age = async (w, interval) => { await q(`alter table rwi.ops_log disable trigger ops_log_no_change`); await q(`update rwi.ops_log set at = at - interval '${interval}' where ${w}`); await q(`alter table rwi.ops_log enable trigger ops_log_no_change`); };
const allNull = (res) => res.every((r) => r.code === 0 && r.out.trim().split('\n').pop().trim() === 't');   // jeder einzelne Aufruf wurde abgewiesen und warf nichts
const fill = (n) => q(`insert into rwi.ops_log(kind, operator_id, note) select 'denied', gen_random_uuid(), 'fuell' from generate_series(1, ${n})`);
let uid = 0; const fresh = () => U(++uid);
try {
  console.log('PostgreSQL', await q('show server_version'));
  const def = await q(`select pg_get_functiondef('rwi.check_operator(uuid,text,bigint,integer,text)'::regprocedure)`);
  ok(/pg_advisory_xact_lock\(7003, 0\)/.test(def), 'Sperre: check_operator nimmt die transaktionsgebundene Advisory-Sperre 7003 (kollidiert nicht mit 7001/7002 aus 04_gruppe.sql)');
  // ---------- Randwerte seriell: 20 / 21 / 22 je Konto ----------
  await reset(); let a = fresh();
  for (let i = 0; i < 20; i++) await q(call(a));
  ok((await rows(`operator_id='${a}'`)) === '20' && (await rows(`operator_id='${a}' and note like 'weitere%'`)) === '0', 'Randwert 20: genau 20 Einzeleinträge, noch kein Sammeleintrag');
  await q(call(a)); ok((await rows(`operator_id='${a}'`)) === '21' && (await rows(`operator_id='${a}' and note like 'weitere%'`)) === '1', 'Randwert 21: der 21. Aufruf erzeugt genau den Sammeleintrag');
  await q(call(a)); await q(call(a)); ok((await rows(`operator_id='${a}'`)) === '21', 'Randwert 22 und weitere: keine weitere Zeile');
  // ---------- Randwerte seriell: global 999 / 1000 / 1001 ----------
  await reset(); await fill(999); const g1 = fresh(), g2 = fresh();
  await q(call(g1)); ok((await rows()) === '1000', 'global 999 → 1000: der Aufruf an der Grenze wird noch protokolliert');
  await q(call(g2)); ok((await rows()) === '1000' && (await rows(`operator_id='${g2}'`)) === '0', 'global 1000 → 1001 wird NICHT erreicht: der Aufruf wird abgewiesen, aber nicht protokolliert');
  ok((await q(call(g2))) === 't', 'bei ausgeschöpftem globalem Limit bleibt die Abweisung wirksam (check_operator liefert null)');
  const rr = await svc('rw_ops_terminate', { p_fight: 1, p_operator: g2, p_note: 'Abweisung trotz ausgeschöpftem Limit' }); ok(rr.status === 'not_operator', 'auch über den service_role-Wrapper bleibt es not_operator');
  // ---------- Gleichzeitigkeit: dasselbe Konto, 40 Sitzungen, 3 Wiederholungen ----------
  for (let round = 1; round <= 3; round++) {
    await reset(); const c = fresh(); const res = await parallel(Array.from({ length: 40 }, () => call(c)), 2500);
    ok(allNull(res) && (await rows(`operator_id='${c}'`)) === '21' && (await rows(`operator_id='${c}' and note like 'weitere%'`)) === '1', `Parallel ${round}/3: 40 gleichzeitige Aufrufe desselben Kontos → alle abgewiesen, genau 21 Zeilen (20 einzeln + 1 Sammeleintrag)`, await rows(`operator_id='${c}'`));
  }
  // ---------- Gleichzeitigkeit: 60 verschiedene Konten, 3 Wiederholungen ----------
  for (let round = 1; round <= 3; round++) {
    await reset(); const ids = Array.from({ length: 60 }, fresh); const res = await parallel(ids.map(call), 2500);
    ok(allNull(res) && (await rows()) === '60', `Parallel ${round}/3: 60 gleichzeitige Aufrufe verschiedener Konten → alle abgewiesen, genau 60 Zeilen (je eine)`, await rows());
  }
  // ---------- direkt an der globalen Grenze: 990 vorhanden, 60 gleichzeitig verschiedene Konten ----------
  for (let round = 1; round <= 3; round++) {
    await reset(); await fill(990); const ids = Array.from({ length: 60 }, fresh); const res = await parallel(ids.map(call), 2500);
    ok(allNull(res) && (await rows()) === '1000', `Parallel ${round}/3: bei 990 vorhandenen und 60 gleichzeitigen Aufrufen endet die Tabelle bei genau 1000 (nie 1001+), alle 60 abgewiesen`, await rows());
  }
  // ---------- gemischt: 40 dasselbe Konto + 60 verschiedene, bei 950 vorhanden ----------
  await reset(); await fill(950); const m = fresh(); const mix = [...Array.from({ length: 40 }, () => call(m)), ...Array.from({ length: 60 }, () => call(fresh()))];
  const resm = await parallel(mix, 3000); ok(allNull(resm) && (await rows()) === '1000' && Number(await rows(`operator_id='${m}'`)) <= 21, 'Parallel gemischt: 40 + 60 Aufrufe bei 950 vorhanden → genau 1000 global, höchstens 21 für das eine Konto', `${await rows()} / ${await rows(`operator_id='${m}'`)}`);
  // ---------- exaktes Stundenfenster ----------
  await reset(); const w = fresh(); for (let i = 0; i < 21; i++) await q(call(w));
  await age(`operator_id='${w}'`, '59 minutes 50 seconds'); await q(call(w)); ok((await rows(`operator_id='${w}'`)) === '21', 'Fenster: Einträge von vor 59 min 50 s zählen noch (kein neuer Eintrag)');
  await age(`operator_id='${w}'`, '20 seconds'); await q(call(w)); ok((await rows(`operator_id='${w}'`)) === '22' && (await rows(`operator_id='${w}' and at > clock_timestamp() - interval '1 hour'`)) === '1', 'Fenster: Einträge von vor mehr als einer Stunde zählen nicht mehr, der neue Aufruf wird wieder einzeln protokolliert');
  // ---------- Fehler bei der Protokollierung: Abweisung bleibt ----------
  await reset(); await q(`create function rwi.t_fail() returns trigger language plpgsql as $$ begin raise exception 'Testfehler Protokoll'; end $$`); await q(`create trigger t_fail before insert on rwi.ops_log for each row when (new.kind = 'denied') execute function rwi.t_fail()`);
  const f1 = fresh(); const rf = await q(call(f1)); ok(rf === 't' && (await rows(`operator_id='${f1}'`)) === '0', 'Protokollfehler (Einfügen schlägt fehl): check_operator wirft nicht, liefert weiter null (abgewiesen), keine Zeile');
  const rf2 = await svc('rw_ops_terminate', { p_fight: 1, p_operator: f1, p_note: 'Abweisung trotz Protokollfehler' }); ok(rf2.status === 'not_operator', 'Protokollfehler: der service_role-Wrapper antwortet weiter not_operator (nie eine Freigabe, kein Fehler nach außen)');
  await q(`drop trigger t_fail on rwi.ops_log`); await q(`drop function rwi.t_fail()`);
  // Sperr-Zeitüberschreitung (Protokollierung wartet zu lange): Abweisung bleibt
  const lt = fresh(); const [, wr] = await parallel([`begin; select pg_advisory_xact_lock(7003, 0); select pg_sleep(2.5); commit;`, `select pg_sleep(0.6); set lock_timeout = '300ms'; ${call(lt)}`], 1500);
  ok(wr.code === 0 && wr.out.trim().split('\n').pop().trim() === 't' && (await rows(`operator_id='${lt}'`)) === '0', 'lock_timeout beim Warten auf die Sperre: kein Fehler nach außen, Aufruf abgewiesen, Protokollzeile entfällt (nie mehr als erlaubt)');
  // andere Isolationsstufe: nicht protokollieren statt Grenze riskieren
  const ri = fresh(); const rri = await q(`begin isolation level repeatable read; ${call(ri)}; commit;`); ok(rri.split('\n').some((l) => l.trim() === 't') && (await rows(`operator_id='${ri}'`)) === '0', 'REPEATABLE READ: abgewiesen, aber bewusst nicht protokolliert (Zählung wäre dort nicht verlässlich)');
  // echter Betreiber wird nie ausgebremst, auch bei erschöpftem Limit und blockierter Sperre
  await fill(1000); const OP = (await E.account('ParOp', 0)).id; await q(`select rwi.set_operator('${OP}', 'Echter Betreiber', array['resume'])`);
  const [, wo] = await parallel([`begin; select pg_advisory_xact_lock(7003, 0); select pg_sleep(1.5); commit;`, `select pg_sleep(0.4); select rwi.check_operator('${OP}', 'resume')`], 1500); ok(wo.out.includes('Echter Betreiber'), 'berechtigter Betreiber: sofort durchgelassen, ohne auf die Protokollsperre zu warten');
  // ---------- Mutationsproben ----------
  await reset();
  const noLock = def.replace('perform pg_advisory_xact_lock(7003, 0);', '');
  ok(noLock !== def, 'Mutation A hergestellt: Sperre entfernt (nicht atomares Zählen/Einfügen)');
  const widen = noLock.replace('if n_op < 20 then', 'perform pg_sleep(0.05); if n_op < 20 then');
  ok(widen !== noLock, 'Mutation B hergestellt: wie A, aber mit künstlich verbreitertem Zeitfenster zwischen Zählen und Einfügen');
  await q(noLock); let over = []; for (let r = 0; r < 3; r++) { await reset(); const c = fresh(); await parallel(Array.from({ length: 40 }, () => call(c)), 2500); over.push(Number(await rows(`operator_id='${c}'`))); }
  console.log('   Info Mutation A (ohne Sperre, 3 Läufe à 40 gleichzeitige Aufrufe): Zeilen je Lauf =', over.join(', '), '(Soll 21; Überschreitung ist wahrscheinlich, aber zeitabhängig)');
  await q(widen); const wide = []; for (let r = 0; r < 3; r++) { await reset(); const c = fresh(); await parallel(Array.from({ length: 40 }, () => call(c)), 2500); wide.push(Number(await rows(`operator_id='${c}'`))); }
  ok(wide.every((n) => n > 21), 'Mutationsprobe: ohne Sperre (mit verbreitertem Fenster) überschreiten ALLE drei Läufe das Limit – der Paralleltest „genau 21“ erkennt den nicht atomaren Vorgang', wide.join(', '));
  await reset(); await fill(990); await parallel(Array.from({ length: 60 }, () => call(fresh())), 2500);
  ok(Number(await rows()) > 1000, 'Mutationsprobe (global): ohne Sperre überschreitet die 990+60-Prüfung die 1000 – der Paralleltest „genau 1000“ erkennt es', await rows());
  await q(def); await reset(); const c9 = fresh(); const r9 = await parallel(Array.from({ length: 40 }, () => call(c9)), 2500);
  ok(allNull(r9) && (await rows(`operator_id='${c9}'`)) === '21', 'Originalfunktion wiederhergestellt: 40 gleichzeitige Aufrufe → wieder genau 21');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
await E.stop(); process.exit(done());

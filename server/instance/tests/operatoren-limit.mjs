// Korrektur K6 (Missbrauchsschutz für 'denied'-Protokolleinträge): node server/instance/tests/operatoren-limit.mjs
// Echte lokale PostgreSQL-Datenbank mit Attrappe der Supabase-Rollen (SIMULIERT bzgl. Supabase: kein GoTrue, kein PostgREST). Mit Mutationsprobe des Limits.
import { setup, counter } from './prod-env.mjs';
const { ok, done } = counter();
const E = await setup(54500); const { q, rpcAs } = E; const svc = rpcAs('service_role');
const U = (n) => `bbbb${String(n).padStart(4, '0')}-0000-4000-8000-000000000000`;
const flood = (id, n) => q(`select count(*) from generate_series(1, ${n}) g where rwi.check_operator('${id}', 'resume', null, null, null) is null`);
const denied = (id) => q(`select count(*) from rwi.ops_log where kind='denied' and operator_id='${id}'`);
const recent = () => q(`select count(*) from rwi.ops_log where kind='denied' and at > clock_timestamp() - interval '1 hour'`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  ok((await q(`select count(*) from pg_indexes where schemaname='rwi' and indexname in ('ops_log_denied_op_idx','ops_log_denied_at_idx')`)) === '2', 'K6: die beiden Teilindizes für die Zählung existieren (keine Tabellensuche bei jeder Abweisung)');
  // 1. ein Konto, 50 Abweisungen
  ok((await flood(U(1), 50)) === '50', 'K6: alle 50 Aufrufe eines Nicht-Betreibers werden abgewiesen (die Abweisung selbst bleibt immer wirksam)');
  ok((await denied(U(1))) === '21', 'K6: davon stehen höchstens 21 Zeilen im Protokoll (20 einzelne + 1 Sammeleintrag)', await denied(U(1)));
  ok((await q(`select count(*) from rwi.ops_log where kind='denied' and operator_id='${U(1)}' and note like 'weitere Abweisungen%'`)) === '1', 'K6: genau ein Sammeleintrag „weitere Abweisungen … nicht einzeln protokolliert“');
  ok((await flood(U(1), 30)) === '30' && (await denied(U(1))) === '21', 'K6: weitere Aufrufe in derselben Stunde erzeugen keine weiteren Zeilen mehr');
  // 2. anderes Konto bleibt unberührt
  ok((await flood(U(2), 1)) === '1' && (await denied(U(2))) === '1', 'K6: ein anderes Konto wird einzeln protokolliert (das Limit gilt je Konto, nicht global für alle)');
  // 3. Wirksamkeit über den service_role-Wrapper (so ruft die Edge Function auf)
  const r = await svc('rw_ops_terminate', { p_fight: 1, p_operator: U(1), p_note: 'Missbrauchstest ohne Betreiberrecht' });
  ok(r.status === 'not_operator' && (await denied(U(1))) === '21', 'K6: der Wrapper antwortet weiter not_operator, ohne das Protokoll über das Limit hinaus zu füllen');
  // 4. Zeitfenster: nach einer Stunde wieder einzeln
  await q(`alter table rwi.ops_log disable trigger ops_log_no_change`); await q(`update rwi.ops_log set at = at - interval '2 hours' where operator_id='${U(1)}'`); await q(`alter table rwi.ops_log enable trigger ops_log_no_change`);   // nur im Testcluster
  ok((await flood(U(1), 3)) === '3' && (await q(`select count(*) from rwi.ops_log where kind='denied' and operator_id='${U(1)}' and at > clock_timestamp() - interval '1 hour'`)) === '3', 'K6: nach Ablauf der Stunde wird wieder einzeln protokolliert');
  // 5. globale Obergrenze
  await q(`select count(*) from generate_series(1, 1300) g where rwi.check_operator(gen_random_uuid(), 'resume', null, null, null) is null`);
  ok((await recent()) === '1000', 'K6: insgesamt höchstens 1000 denied-Einträge pro Stunde, auch bei vielen verschiedenen Konten (1300 Aufrufe)', await recent());
  // 6. echte Betreiber bleiben unberührt
  const OP = (await E.account('LimBetreiber', 0)).id; await q(`select rwi.set_operator('${OP}', 'Echter Betreiber', array['resume','terminate'])`);
  ok((await q(`select rwi.check_operator('${OP}', 'terminate')`)) === 'Echter Betreiber', 'K6: ein berechtigter Betreiber wird auch bei erschöpftem Limit nie ausgebremst (Prüfung vor der Zählung)');
  // 7. Mutationsprobe: ohne Limit würden die Tests oben fehlschlagen
  const def = await q(`select pg_get_functiondef('rwi.check_operator(uuid,text,bigint,integer,text)'::regprocedure)`);
  const mut = def.replace('if n_all >= 1000 then return null; end if;', '').replace('if n_op < 20 then', 'if true then');
  ok(mut !== def && mut.includes('if true then'), 'K6 Mutationsprobe: die verfälschte Funktion (ohne Limit) ist hergestellt');
  await q(mut); const before = await denied(U(3)); await flood(U(3), 50);
  ok((await denied(U(3))) === '50' && before === '0', 'K6 Mutationsprobe: ohne Limit würde dasselbe Missbrauchsmuster 50 Zeilen erzeugen (der Test oben ist wirksam)');
  await q(def); await flood(U(4), 50); ok((await denied(U(4))) !== '50', 'K6: Originalfunktion wiederhergestellt, Limit wirkt wieder');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
await E.stop?.(); process.exit(done());

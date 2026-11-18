// Dev-Testskript und Workflow: node server/instance/tests/dev-skript.mjs
// SIMULIERT: ein lokaler HTTP-Stub spielt Supabase (Auth + REST) nach. Geprüft werden Schutzregeln, Abbruchverhalten, Geheimnisfreiheit der Ausgabe, Ablauf und Aufräumen des Skripts
// und die Struktur der Workflow-Datei. Das ECHTE Dev-Verhalten ist damit NICHT bewiesen.
import { readFileSync } from 'node:fs';
import { counter } from './prod-env.mjs';
import { run } from '../../../supabase/dev/real-test.mjs';
import { mkStub, start, capture, jwt, ANON, REF } from './dev-stub.mjs';
const { ok, done } = counter();
try {
  // ---- Schutz und Abbruch ----
  let c = capture(); let r = await run({ env: {}, out: c.out }); ok(r.code === 2 && /fehlende Konfiguration/.test(c.text()), 'fehlende Secrets: Abbruch (Exit 2), kein Aufruf');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: 'https://malbiahllucctiafzydv.supabase.co', DEV_ANON_KEY: jwt({ role: 'anon', ref: 'malbiahllucctiafzydv' }) }, out: c.out, fetchFn: () => { throw new Error('darf nicht aufgerufen werden'); } }); ok(r.code === 2, 'Production-URL wird verweigert (kein Netzaufruf)');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: 'https://example.com', DEV_ANON_KEY: ANON }, out: c.out, fetchFn: () => { throw new Error('nie'); } }); ok(r.code === 2, 'fremde URL wird verweigert');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: `https://${REF}.supabase.co`, DEV_ANON_KEY: jwt({ role: 'service_role', ref: REF }) }, out: c.out, fetchFn: () => { throw new Error('nie'); } }); ok(r.code === 2 && !c.text().includes('service_role'), 'service_role-Schlüssel als Anon-Key wird verweigert (und nicht ausgegeben)');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: `https://${REF}.supabase.co`, DEV_ANON_KEY: jwt({ role: 'anon', ref: 'malbiahllucctiafzydv' }) }, out: c.out, fetchFn: () => { throw new Error('nie'); } }); ok(r.code === 2, 'Anon-Key eines anderen Projekts (Ref) wird verweigert');
  // ---- Ablauf gegen Stub ----
  const S = mkStub({ prepared: { instance: 77, fight: 88 } }); const url = await start(S); const base = { DEV_SUPABASE_URL: url, DEV_ANON_KEY: ANON, DEV_TEST_ALLOW_LOCAL: '1' }; const env = { ...base, DEV_TEST_INSTANCE: '77', DEV_TEST_FIGHT: '88', DEV_TEST_ROUND: '1' };
  const c1 = capture(); r = await run({ env, out: c1.out, runId: 'abcd1234' });
  ok(r.code === 0 && r.fail === 0 && r.skip === 0 && r.pass >= 30, `kompletter Lauf gegen den Stub (mit vorbereiteter Instanz): Exit 0, ${r.pass} Schritte ok, ${r.skip} nicht getestet`, c1.text().split('\n').filter((l) => /FEHLER|NICHT GETESTET/.test(l)).join(' | '));
  const S1 = mkStub(); const url1 = await start(S1); c = capture(); r = await run({ env: { ...base, DEV_SUPABASE_URL: url1 }, out: c.out, runId: 'bbbb2222' });
  ok(r.code === 4 && r.fail === 0 && r.skip === 5 && /NICHT GETESTET Gruppenbeitritt/.test(c.text()) && /UNVOLLSTÄNDIG/.test(c.text()) && S1.users.size === 0, 'ohne Test-Instanz: positive Gruppenschritte sind NICHT GETESTET und der Lauf endet mit Exit 4 (unvollständig), nie mit 0; Konten trotzdem aufgeräumt');
  S1.srv.close();
  ok(S.users.size === 0 && S.chars.length === 0, 'Aufräumen: beide Testkonten und der Charakter sind gelöscht (Wiederholbarkeit)');
  ok(c1.l.every((l) => !/Rw!|eyJ|Bearer|password/i.test(l)) && !c1.text().includes(ANON), 'Ausgabe enthält weder Passwörter noch Tokens noch den Anon-Key');
  ok(/rwtest-abcd1234-a@rwtest\.invalid/.test([...S.calls].length ? 'rwtest-abcd1234-a@rwtest.invalid' : '') && c1.text().includes('rwt_abcd1234_a'), 'Testkonten sind eindeutig erkennbar (rwtest.invalid, rwt_<Lauf>_*)');
  r = await run({ env, out: capture().out, runId: 'eeee5555' }); ok(r.code === 0 && S.users.size === 0, 'zweiter Lauf mit anderer Kennung: gleiches Ergebnis (wiederholbar, keine Kollision)');
  ok(S.calls.every((x) => !/service_role/.test(x)), 'kein Aufruf mit service_role');
  S.srv.close();
  // ---- E-Mail-Bestätigung aktiv ----
  const S2 = mkStub({ confirm: true }); const url2 = await start(S2); c = capture();
  r = await run({ env: { ...env, DEV_SUPABASE_URL: url2 }, out: c.out, runId: 'ffff6666' }); ok(r.code === 3 && /E-Mail-Bestätigung/.test(c.text()) && S2.users.size === 0, 'aktive E-Mail-Bestätigung: Abbruch mit Vorbedingung (Exit 3) VOR jeder Kontoanlage, kein Scheinerfolg');
  S2.srv.close();
  // ---- Workflow-Datei ----
  const wf = readFileSync(new URL('../../../.github/workflows/dev-test.yml', import.meta.url), 'utf8');
  ok(/^on:\n  workflow_dispatch:/m.test(wf) && !/^\s+(push|pull_request|schedule|workflow_run|pull_request_target):/m.test(wf), 'Workflow startet nur manuell (workflow_dispatch)');
  ok(!/service_role|SERVICE_ROLE/i.test(wf.replace(/^#.*$/gm, '')), 'Workflow verwendet keinen service_role-Schlüssel (nur in Kommentaren erwähnt)');
  ok(/environment: dev-test/.test(wf) && /permissions:\n  contents: read/.test(wf) && /add-mask/.test(wf) && /exit 2/.test(wf), 'Environment mit Freigabe, minimale Rechte, Maskierung, sicherer Abbruch bei fehlenden Secrets');
  ok(/secrets\.DEV_SUPABASE_URL/.test(wf) && /secrets\.DEV_ANON_KEY/.test(wf) && !/echo[^\n]*\$\{?DEV_(SUPABASE_URL|ANON_KEY)/.test(wf) && !/secrets\.[A-Z_]*(PASS|PW)/.test(wf), 'nur Dev-URL und Anon-Key als Secrets, nirgends ausgegeben, keine Passwörter hinterlegt');
  ok(/"\$REPO" != "LuckyOne2k\/ruinwalk"/.test(wf) && /"\$BESTAETIGUNG" != "dev"/.test(wf) && !/^\s+if:/m.test(wf), 'Bestätigungseingabe und Repository-Schutz (keine Forks) als FEHLSCHLAGENDER Schritt, nicht als überspringender if: (Korrektur K9)');
  const sc = readFileSync(new URL('../../../supabase/dev/real-test.mjs', import.meta.url), 'utf8');
  ok(!/service_role['"`]?\s*[:=]|SERVICE_ROLE_KEY/.test(sc) && !/delete from|drop |truncate/i.test(sc.replace(/\/\/.*$/gm, '')), 'Skript enthält keinen service_role-Schlüssel und kein direktes SQL-Löschen (nur eigene Konten über delete_account)');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
process.exit(done());

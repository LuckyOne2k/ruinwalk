// Regressionstests der Korrekturen K1–K5, K9, K10 (Dev-Testskript, Workflow) mit Mutationsproben: node server/instance/tests/dev-korrekturen.mjs
// SIMULIERT: alle Läufe gegen den HTTP-STUB (dev-stub.mjs). Das ist KEIN Beweis für das Verhalten des echten Dev-Projekts (GoTrue/PostgREST).
// Mutationsprobe = der kritische Code wird absichtlich verfälscht; der zugehörige Test MUSS dann das Gegenteil melden, sonst prüft er nichts.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { counter } from './prod-env.mjs';
import { mkStub, start, capture, ANON, PUBLISHABLE } from './dev-stub.mjs';
import { run as runOrig, errIs, permDenied, notExposed } from '../../../supabase/dev/real-test.mjs';
const { ok, done } = counter();
const SRC = new URL('../../../supabase/dev/real-test.mjs', import.meta.url);
const src = readFileSync(SRC, 'utf8'); const dir = mkdtempSync(join(tmpdir(), 'rwmut-')); let mseq = 0;
const mutant = async (from, to) => { if (!src.includes(from)) throw new Error('Mutationsstelle nicht gefunden: ' + from.slice(0, 60)); const f = join(dir, `m${++mseq}.mjs`); writeFileSync(f, src.replace(from, to)); return (await import(f)).run; };
const LOCAL = { DEV_TEST_ALLOW_LOCAL: '1' }, PREP = { instance: 77, fight: 88 }, FULL = { DEV_TEST_INSTANCE: '77', DEV_TEST_FIGHT: '88', DEV_TEST_ROUND: '1' };
// führt einen Lauf gegen einen frischen Stub aus
const go = async (runFn, stubOpt, envOpt = {}, key = ANON) => { const S = mkStub(stubOpt); const url = await start(S); const c = capture(); const r = await runFn({ env: { DEV_SUPABASE_URL: url, DEV_ANON_KEY: key, ...LOCAL, ...envOpt }, out: c.out, runId: 'k' + Math.random().toString(16).slice(2, 8) }); S.srv.close(); return { r, S, c }; };
try {
  // ---------- Grundlage: der volle Lauf besteht ----------
  const base = await go(runOrig, { prepared: PREP }, FULL); ok(base.r.code === 0 && base.r.fail === 0, 'Grundlage: voller Lauf gegen den Stub besteht (Exit 0)');

  // ---------- K1: „verweigert“ nur bei gültiger HTTP-Antwort mit vorgesehenem Status und Inhalt ----------
  const stat = (s, b) => ({ status: s, json: b });
  ok(permDenied(stat(401, { code: '42501', message: 'x' })) && permDenied(stat(403, { code: '42501' })), 'K1: 401/403 mit Fehlercode 42501 gelten als erwartetes „verweigert“');
  ok(![0, 200, 404, 406, 500, 502, 503].some((s) => permDenied(stat(s, { code: '42501' }))), 'K1: Netzfehler (0), 200, 404, 406 und Serverfehler sind NIE „verweigert“, auch nicht mit passendem Fehlercode');
  ok(!permDenied(stat(401, null)) && !permDenied(stat(403, 'text')) && !permDenied(stat(403, { code: 'XX000' })) && !permDenied(stat(403, [])), 'K1: ohne Fehlerinhalt oder mit falschem Code ist 401/403 nicht „verweigert“');
  ok(errIs(stat(404, { code: 'PT404', message: 'not_found' }), 404, 'not_found') && !errIs(stat(404, { code: 'PGRST202', message: 'Could not find the function' }), 404, 'not_found') && !errIs(stat(500, { message: 'not_found' }), 404, 'not_found'), 'K1: der vorgesehene 404 (not_found der Funktion) wird vom 404 „Funktion existiert nicht“ (PGRST202) und von 5xx unterschieden');
  ok(notExposed(stat(406, { code: 'PGRST106' })) && !notExposed(stat(404, { code: 'PGRST106' })) && !notExposed(stat(500, { code: 'PGRST106' })) && !notExposed(stat(0, null)), 'K1: nicht exponiertes Schema: nur 406 PGRST106 oder 401/403 42501');
  for (const [nm, opt] of [['Funktion fehlt (404 PGRST202)', { rwStatus: 404 }], ['Serverfehler 500', { rwStatus: 500, rwBody: { message: 'boom' } }], ['Antwort 200 (fälschlich erlaubt)', { rwStatus: 200, rwBody: {} }], ['Netzfehler bei rw_worker_tick', { netFail: 'rw_worker_tick' }], ['Schema-Antwort 404', { schemaStatus: 404 }], ['Schema-Antwort 500', { schemaStatus: 500 }]]) {
    const x = await go(runOrig, { prepared: PREP, ...opt }, FULL); ok(x.r.code === 1 && /FEHLER/.test(x.c.text()), `K1: ${nm} lässt den Lauf FEHLSCHLAGEN (Exit 1)`, `Exit ${x.r.code}`);
  }
  const m1 = await mutant("export const permDenied = (r) => (r.status === 401 || r.status === 403) && isObj(r.json) && r.json.code === '42501';", 'export const permDenied = (r) => r.status !== 200;');
  const x1 = await go(m1, { prepared: PREP, rwStatus: 404 }, FULL); ok(x1.r.code === 0, 'K1 Mutationsprobe: mit der alten Regel „irgendein Nicht-200“ würde der 404-Lauf fälschlich BESTEHEN (der Test ist also wirksam)');
  const m1b = await mutant("export const notExposed = (r) =>", 'export const notExposed = (r) => r.status !== 200 ||');
  const x1b = await go(m1b, { prepared: PREP, schemaStatus: 500 }, FULL); ok(x1b.r.code === 0, 'K1 Mutationsprobe (Schema-Prüfung): mit lockerer Regel würde Serverfehler fälschlich bestehen');

  // ---------- K2: Gruppenaktion im tatsächlichen Request-Format ----------
  const act = base.S.bodies.find((b) => b.path.endsWith('/group_action') && b.body.p_fight === 88);
  ok(!!act && Object.keys(act.body).sort().join() === 'p_action,p_character,p_fight,p_round' && typeof act.body.p_action.ability === 'string' && act.body.p_action.ability.length >= 1 && act.body.p_action.ability.length <= 40 && !('type' in act.body.p_action), 'K2: group_action sendet { p_fight, p_round, p_action: { ability (1–40 Zeichen), target }, p_character } – das Format von public.group_action / rwi.submit_action (nicht mehr { type })');
  const wrapper = readFileSync(new URL('../sql/05_produktion.sql', import.meta.url), 'utf8'), sub = readFileSync(new URL('../sql/03_windows.sql', import.meta.url), 'utf8');
  ok(/create function public\.group_action\(p_fight bigint, p_round int, p_action jsonb, p_character uuid default null\)/.test(wrapper) && /length\(coalesce\(p_action->>'ability',''\)\) not between 1 and 40/.test(sub), 'K2: das erwartete Format ist gegen die echten SQL-Quellen (Wrapper-Signatur, ability-Pflicht) geprüft; index.html ruft group_action nicht auf, es gibt keine Client-Schnittstelle dafür');
  const m2 = await mutant("p_action: { ability: 'standard', target: 'boss' }, p_character: cidA }, sess.A); step('Gruppenaktion (Test-Kampf)", "p_action: { type: 'standard' }, p_character: cidA }, sess.A); step('Gruppenaktion (Test-Kampf)");
  const x2 = await go(m2, { prepared: PREP }, FULL); ok(x2.r.code === 1 && /FEHLER\s+Gruppenaktion \(Test-Kampf\)/.test(x2.c.text()), 'K2 Mutationsprobe: das alte Format { type } wird jetzt als FEHLER erkannt (Stub antwortet wie die Datenbank mit status invalid)');
  const m2b = await mutant("ac.json.status === 'ok'", 'typeof ac.json.status === "string"');
  const x2b = await go(m2b, { prepared: PREP }, FULL); ok(x2b.r.code === 0, 'K2: Kontrollprobe – mit der alten schwachen Statusprüfung wäre das ok, die harte Prüfung auf status ok ist also nötig und aktiv');

  // ---------- K3: Aufräumen: Fehlschlag = Exit 5, nie Erfolg ----------
  for (const [nm, opt] of [['delete_account liefert 500', { deleteFails: true }], ['delete_account wirkungslos (Konto bleibt, Anmeldung danach klappt)', { deleteIneffective: true }], ['Netzfehler bei delete_account', { netFail: 'delete_account' }]]) {
    const x = await go(runOrig, { prepared: PREP, ...opt }, FULL); ok(x.r.code === 5 && x.r.orphans.length === 2 && /VERWAIST/.test(x.c.text()) && /GESAMTERGEBNIS: NICHT ERFOLGREICH/.test(x.c.text()), `K3: ${nm}: Exit 5, beide Konten als verwaist gemeldet, Gesamtergebnis nicht erfolgreich`, `Exit ${x.r.code}, verwaist ${x.r.orphans.length}`);
  }
  const x3 = await go(runOrig, { prepared: PREP, deleteFails: true }, {}); ok(x3.r.code === 5, 'K3: verwaiste Konten schlagen auch den Exit 4 (unvollständig) – es bleibt Exit 5');
  const x3b = await go(runOrig, { confirm: true, settings: false }, FULL); ok(x3b.r.code === 5 && x3b.S.users.size === 2 || x3b.r.code === 5, 'K3/T3: ohne lesbare Einstellungen und mit E-Mail-Bestätigung bleibt das angelegte Konto A zurück → Exit 5 (nicht 3, nicht 0)', `Exit ${x3b.r.code}`);
  const x3c = await go(runOrig, { confirm: true }, FULL); ok(x3c.r.code === 3 && x3c.S.users.size === 0 && !x3c.S.calls.some((l) => l.includes('/auth/v1/signup')), 'K3/T3: bei lesbaren Einstellungen (Bestätigung aktiv) wird gar kein Konto angelegt (kein Signup-Aufruf), Exit 3');
  const m3 = await mutant('if (orphans.length) code = 5; else if (base === 0)', 'if (base === 0)');
  const x3d = await go(m3, { prepared: PREP, deleteFails: true }, FULL); ok(x3d.r.code === 0, 'K3 Mutationsprobe: ohne die Exit-5-Regel würde ein Lauf mit zurückgelassenen Konten ERFOLGREICH erscheinen (Test ist wirksam)');
  const m3b = await mutant('if (!invalidLogin(again))', 'if (false)');
  const x3e = await go(m3b, { prepared: PREP, deleteIneffective: true }, FULL); ok(x3e.r.code === 0, 'K3 Mutationsprobe: ohne die Verifikation der Löschung bliebe ein wirkungsloses delete_account unbemerkt');

  // ---------- K4: positive Gruppentests nie stillschweigend übersprungen ----------
  const x4 = await go(runOrig, { prepared: PREP }, {}); ok(x4.r.code === 4 && x4.r.fail === 0 && x4.r.skip === 5 && /GESAMTERGEBNIS: NICHT ERFOLGREICH \(Exit 4/.test(x4.c.text()), 'K4: ohne Instanz/Kampf: fünf Pflichtschritte NICHT GETESTET, Exit 4, Gesamtergebnis nicht erfolgreich', `Exit ${x4.r.code}, nicht getestet ${x4.r.skip}`);
  const x4b = await go(runOrig, { prepared: PREP }, { DEV_TEST_INSTANCE: '77' }); ok(x4b.r.code === 4 && x4b.r.skip === 1 && /NICHT GETESTET Gruppenaktion/.test(x4b.c.text()), 'K4: nur Instanz ohne Kampf: die Aktion bleibt NICHT GETESTET, Exit 4');
  const x4c = await go(runOrig, { prepared: PREP }, { DEV_TEST_INSTANCE: 'abc', DEV_TEST_FIGHT: '88', DEV_TEST_ROUND: '1' }); ok(x4c.r.code === 2 && x4c.S === undefined || x4c.r.code === 2, 'K4: ungültige Zahl in DEV_TEST_INSTANCE: Konfigurationsfehler (Exit 2), kein Aufruf');
  const x4d = await go(runOrig, { prepared: { instance: 99, fight: 88 } }, FULL); ok(x4d.r.code === 1 && /FEHLER\s+Gruppenbeitritt \(Test-Instanz\)/.test(x4d.c.text()), 'K4: nicht beitrittsfähige/falsche Instanz: harter Fehler statt Scheinerfolg (join liefert no_instance statt joined)');
  const m4 = await mutant('else if (base === 0) code = fail ? 1 : incomplete.length ? 4 : 0;', 'else if (base === 0) code = fail ? 1 : 0;');
  const x4e = await go(m4, { prepared: PREP }, {}); ok(x4e.r.code === 0, 'K4 Mutationsprobe: wenn „nicht getestet“ den Exit-Code nicht beeinflusst, erschiene der unvollständige Lauf grün (Test ist wirksam)');

  // ---------- K5: neue API-Key-Formate ----------
  const x5 = await go(runOrig, { prepared: PREP, publishableOnly: true }, FULL, PUBLISHABLE); ok(x5.r.code === 0 && x5.r.fail === 0, 'K5: Lauf mit sb_publishable_…-Schlüssel besteht, anonyme Aufrufe ohne Bearer (der Stub lehnt einen Bearer, der kein Nutzer-JWT ist, wie PostgREST ab)', `Exit ${x5.r.code}`);
  ok(!x5.S.calls.some((l) => l.includes(PUBLISHABLE)) && x5.c.l.every((l) => !l.includes(PUBLISHABLE)), 'K5: der Publishable-Key erscheint weder in Aufrufprotokoll noch in der Ausgabe');
  for (const k of ['sb_secret_GeheimerSchluesselNurFuerStub123', 'sb_publishable_', 'sb_publishable_kurz', 'irgendwas']) { const x = await go(async (a) => runOrig({ ...a, fetchFn: () => { throw new Error('nie'); } }), {}, FULL, k); ok(x.r.code === 2 && !x.c.text().includes(k), `K5: Schlüssel "${k.slice(0, 14)}…" wird verweigert (Exit 2, kein Netzaufruf, nicht ausgegeben)`); }
  const m5 = await mutant("/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(anon)", "/^sb_/.test(anon)");
  const x5b = await go(async (a) => m5({ ...a, fetchFn: () => { throw new Error('nie'); } }), {}, FULL, 'sb_secret_GeheimerSchluesselNurFuerStub123'); ok(x5b.r.code !== 2, 'K5 Mutationsprobe: mit lockerer Prüfung würde ein Secret-Key akzeptiert (Test ist wirksam)');

  // ---------- K9: Workflow ----------
  const wf = readFileSync(new URL('../../../.github/workflows/dev-test.yml', import.meta.url), 'utf8'), old = readFileSync(new URL('./fixtures/dev-test.afc5dfb.yml', import.meta.url), 'utf8');   // feste Fixture statt git show: im flachen CI-Checkout gibt es den alten Commit nicht
  ok(createHash('sha256').update(old).digest('hex') === '357607d3b75981bdbfae5beb037bbbf69339feb5d677d2a94e465220d2d104ed', 'K9: die Fixture des alten Workflows (Stand afc5dfb) ist unverändert (SHA-256 fest hinterlegt, Kopie von git show afc5dfb:.github/workflows/dev-test.yml)');
  const skips = (y) => /^\s{4}if:/m.test(y);                                                              // ein Job-if: überspringt den Job bei falscher Eingabe → Lauf „grün“
  const failsOnWrong = (y) => /BESTAETIGUNG" != "dev"[^\n]*exit [1-9]/.test(y) && /REPO" != "LuckyOne2k\/ruinwalk"[^\n]*exit [1-9]/.test(y) && /needs: pruefen/.test(y);
  ok(skips(old) && !failsOnWrong(old), 'K9 Nachweis des alten Fehlers: der Stand afc5dfb überspringt den Job bei falscher Eingabe (grüner Lauf ohne Ausführung)');
  ok(!skips(wf) && failsOnWrong(wf), 'K9: neuer Workflow – falsche Bestätigung/falsches Repository lassen den Prüfjob mit Exit 2 scheitern, der Testjob hängt davon ab (needs), kein Job-if');
  ok(/pruefen:[\s\S]*?(?=\n  dev-test:)/.exec(wf)[0].indexOf('environment') < 0 && !/secrets\./.test(/pruefen:[\s\S]*?(?=\n  dev-test:)/.exec(wf)[0]), 'K9: der Prüfjob läuft ohne Environment und ohne Secrets (kein Zugriff auf Dev bei falscher Eingabe)');
  ok(/DEV_ANON_KEY/.test(wf) && /exit 2/.test(wf) && /::error::/.test(wf) && /node supabase\/dev\/real-test\.mjs\s*$/.test(wf.trimEnd() + '\n') && !/continue-on-error|\|\|\s*true/.test(wf), 'K4/K9: der Teststep darf nicht tolerant sein (kein continue-on-error, kein "|| true"); jeder Exit ≠ 0 macht den Lauf rot');

  // ---------- K10: Stub-Kennzeichnung ----------
  for (const f of ['dev-stub.mjs', 'dev-skript.mjs', 'dev-korrekturen.mjs', 'operator-edge.mjs', 'operator-korrekturen.mjs']) { const t = readFileSync(new URL('./' + f, import.meta.url), 'utf8').split('\n').slice(0, 6).join('\n'); ok(/SIMULIERT|STUB|Stub/.test(t) && /(NICHT bewiesen|KEIN|Nicht bewiesen|NICHT BEWIESEN|NICHT ECHT)/i.test(t), `K10: ${f} kennzeichnet sich im Kopf ausdrücklich als Stub/Simulation ohne Echtheitsanspruch`); }
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
process.exit(done());

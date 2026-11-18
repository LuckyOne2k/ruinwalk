// Echter Client-Test gegen das Supabase-DEV-Projekt (nur Dev-URL, Dev-Anon-/Publishable-Key, eigens angelegte Testkonten). KEIN service_role-/Secret-Schlüssel.
// Aufruf: DEV_SUPABASE_URL=... DEV_ANON_KEY=... node supabase/dev/real-test.mjs      (läuft nie automatisch; Workflow: .github/workflows/dev-test.yml, nur workflow_dispatch)
// Pflicht für den VOLLEN Lauf: DEV_TEST_INSTANCE (Instanz-ID einer von dir vorbereiteten, beitrittsfähigen Test-Instanz), DEV_TEST_FIGHT + DEV_TEST_ROUND (laufender Test-Kampf, in dem die Testcharaktere stehen).
// Fehlen diese Angaben, werden die positiven Gruppenschritte NICHT getestet und der Lauf endet mit Exit 4 (unvollständig). Er gilt dann nie als erfolgreich.
// Ausgabe: nur Schrittnamen und Ergebnis. Nie Passwörter, Tokens, Schlüssel oder Antwortinhalte mit Tokens.
// Exit: 0 alles geprüft und ok · 1 Prüfung fehlgeschlagen · 2 Konfiguration fehlt/unsicher · 3 Vorbedingung nicht erfüllt · 4 UNVOLLSTÄNDIG (Pflichtschritte nicht getestet) · 5 Testkonten zurückgelassen/Aufräumen nicht verifiziert
import { randomBytes } from 'node:crypto';
const DEV_REF = 'jlkqktmvqxibqdcobbhf', PROD_REF = 'malbiahllucctiafzydv', DOMAIN = 'rwtest.invalid';
export const EXIT = { OK: 0, FEHLER: 1, KONFIG: 2, VORBEDINGUNG: 3, UNVOLLSTAENDIG: 4, VERWAIST: 5 };
const MEANING = { 1: 'Prüfung fehlgeschlagen', 2: 'Konfiguration fehlt oder ist unsicher', 3: 'Vorbedingung nicht erfüllt', 4: 'UNVOLLSTÄNDIG: Pflichtschritte wurden nicht getestet', 5: 'Testkonten zurückgelassen oder Aufräumen nicht verifiziert' };
const b64j = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
const isObj = (j) => !!j && typeof j === 'object' && !Array.isArray(j);
const posInt = (v) => v === undefined || v === '' ? null : (/^[1-9][0-9]{0,15}$/.test(String(v)) ? Number(v) : NaN);

// Erwartete Fehlerantworten (K1): „verweigert“ zählt NUR bei gültiger HTTP-Antwort mit vorgesehenem Status UND Fehlerinhalt.
// Netzfehler (Status 0), 404 (Funktion fehlt), 5xx und jede 2xx-Antwort sind KEIN erwartetes Verhalten.
export const errIs = (r, status, id) => r.status === status && isObj(r.json) && (r.json.message === id || r.json.code === id);        // eigene Fehler der Funktionen (PT403/PT404/PT409 …)
export const permDenied = (r) => (r.status === 401 || r.status === 403) && isObj(r.json) && r.json.code === '42501';                 // PostgREST: fehlendes EXECUTE-/Tabellenrecht
export const notExposed = (r) => (r.status === 406 && isObj(r.json) && r.json.code === 'PGRST106') || permDenied(r);                 // Schema nicht in „Exposed schemas“ (oder ohne Rechte)

export async function run({ env = process.env, fetchFn = fetch, out = console.log, runId = randomBytes(4).toString('hex') } = {}) {
  let pass = 0, fail = 0; const incomplete = [], orphans = [];
  const step = (name, c, info = '') => { if (c) pass++; else fail++; out(`${c ? 'OK       ' : 'FEHLER   '} ${name}${info ? '  [' + info + ']' : ''}`); return c; };
  const notTested = (name, why) => { incomplete.push(name); out(`NICHT GETESTET ${name}  [${why}]`); };
  const gh = (lvl, msg) => { if (env.GITHUB_ACTIONS === 'true') out(`::${lvl}::${msg}`); };
  const result = (code) => {
    out(`Ergebnis: ${pass} OK, ${fail} Fehler, ${incomplete.length} NICHT GETESTET, ${orphans.length} Testkonten zurückgelassen/unverifiziert`);
    if (code !== 0) { out(`GESAMTERGEBNIS: NICHT ERFOLGREICH (Exit ${code}: ${MEANING[code]})`); gh('error', `Dev-Test nicht erfolgreich (Exit ${code}: ${MEANING[code]})`); } else out('GESAMTERGEBNIS: ERFOLGREICH (alle Pflichtschritte geprüft)');
    return { code, pass, fail, skip: incomplete.length, incomplete, orphans };
  };
  // ---- 1. Konfiguration und Schutz ----
  const missing = ['DEV_SUPABASE_URL', 'DEV_ANON_KEY'].filter((k) => !env[k]);
  if (missing.length) { out(`ABBRUCH: fehlende Konfiguration: ${missing.join(', ')} (Secrets nicht gesetzt). Es wurde kein Aufruf gemacht.`); return result(2); }
  const url = String(env.DEV_SUPABASE_URL).replace(/\/+$/, ''), anon = String(env.DEV_ANON_KEY);
  let host = ''; try { const u = new URL(url); host = u.protocol === 'https:' || /^http:\/\/(127\.0\.0\.1|localhost)/.test(url) ? u.hostname : ''; } catch { /* leer */ }
  const urlOk = host === `${DEV_REF}.supabase.co` || (/^(127\.0\.0\.1|localhost)$/.test(host) && env.DEV_TEST_ALLOW_LOCAL === '1');
  // Schlüsselformate (K5): altes JWT (role anon, optional ref) ODER neues sb_publishable_…; Secret-/service_role-Schlüssel werden verweigert. Das neue Format trägt keine Projektkennung: dort schützt allein die exakte Dev-URL.
  const jwtForm = anon.split('.').length === 3; let ak = null; if (jwtForm) { try { ak = b64j(anon.split('.')[1]); } catch { /* leer */ } }
  const keyOk = jwtForm ? (!!ak && ak.role === 'anon' && (!ak.ref || ak.ref === DEV_REF)) : /^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(anon);
  const inst = posInt(env.DEV_TEST_INSTANCE), fight = posInt(env.DEV_TEST_FIGHT), round = posInt(env.DEV_TEST_ROUND);
  if (!urlOk || host.includes(PROD_REF) || !keyOk) { out('ABBRUCH: URL oder Schlüssel gehören nicht zum Dev-Projekt oder der Schlüssel ist kein Anon-/Publishable-Schlüssel. Es wurde kein Aufruf gemacht.'); return result(2); }
  if ([inst, fight, round].some((v) => Number.isNaN(v))) { out('ABBRUCH: DEV_TEST_INSTANCE/FIGHT/ROUND müssen positive ganze Zahlen sein. Es wurde kein Aufruf gemacht.'); return result(2); }
  out(`Testlauf ${runId} gegen das Dev-Projekt (Testkonten *@${DOMAIN}, Namen rwt_${runId}_*)`);

  // Anonyme Aufrufe: bei JWT-förmigem Anon-Key wie der Client (apikey + Bearer = Anon-Key), beim neuen Format nur apikey (kein Bearer, der Schlüssel ist kein JWT).
  const http = async (method, path, { token, body, headers = {} } = {}) => {
    const bearer = token || (jwtForm ? anon : null); const h = { apikey: anon, 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers };
    let r; try { r = await fetchFn(url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); } catch { return { status: 0, json: null }; }
    let j = null; try { j = await r.json(); } catch { /* leer */ } return { status: r.status, json: j };
  };
  const rpc = (name, args, token) => http('POST', `/rest/v1/rpc/${name}`, { token, body: args || {} });
  const good = (r) => r.status >= 200 && r.status < 300;
  const pw = () => 'Rw!' + randomBytes(12).toString('base64url');                              // nur im Speicher, nie ausgegeben
  const acct = { A: { email: `rwtest-${runId}-a@${DOMAIN}`, user: `rwt_${runId}_a`, pw: pw() }, B: { email: `rwtest-${runId}-b@${DOMAIN}`, user: `rwt_${runId}_b`, pw: pw() } };
  const login = async (a) => { const r = await http('POST', '/auth/v1/token?grant_type=password', { body: { email: a.email, password: a.pw } }); return { ...r, ok: good(r) && isObj(r.json) && !!r.json.access_token }; };
  const invalidLogin = (r) => r.status === 400 && isObj(r.json) && (r.json.error_code === 'invalid_credentials' || r.json.error === 'invalid_grant');
  const data = (n) => ({ cls: 'krieger', path: '', tier: 0, lv: 5, name: n });
  const sess = {}; let cidA = null, cleaned = false;
  // Aufräumen (K3): jedes Konto, das möglicherweise angelegt wurde, muss gelöscht UND als gelöscht verifiziert sein (Anmeldung danach: gültige Ablehnung). Sonst: verwaist → Exit 5.
  const orphan = (a, why) => { orphans.push(a.user); out(`VERWAIST  Testkonto ${a.user}: ${why} (siehe supabase/dev/list_test_accounts.sql, Löschen nur mit Freigabe über cleanup_test_accounts.sql)`); gh('error', `Testkonto ${a.user} verwaist oder nicht verifiziert gelöscht`); };
  const cleanup = async () => {
    if (cleaned) return; cleaned = true;
    for (const k of ['A', 'B']) {
      const a = acct[k]; if (!a.attempted) continue;
      const s = await login(a); if (!s.ok) { orphan(a, s.status === 0 ? 'Netzwerkfehler beim Anmelden zum Aufräumen' : `Anmeldung zum Aufräumen nicht möglich (HTTP ${s.status}); Konto könnte existieren`); continue; }
      const d = await rpc('delete_account', { p_confirm: a.user }, s.json.access_token);
      if (!good(d)) { orphan(a, `delete_account fehlgeschlagen (HTTP ${d.status})`); continue; }
      const again = await login(a);
      if (!invalidLogin(again)) { orphan(a, `Löschung nicht verifiziert (Anmeldung danach: HTTP ${again.status}, keine gültige Ablehnung)`); continue; }
      out(`OK        Aufräumen: Testkonto ${a.user} gelöscht und verifiziert`);
    }
  };
  const finish = async (base) => {
    await cleanup();
    let code = base; if (orphans.length) code = 5; else if (base === 0) code = fail ? 1 : incomplete.length ? 4 : 0;
    return result(code);
  };
  try {
    // ---- 2. Vorprüfung: braucht Dev eine E-Mail-Bestätigung? Dann gar keine Konten anlegen (T3). Best effort; ohne lesbare Einstellungen entscheidet die Registrierung unten. ----
    const st = await http('GET', '/auth/v1/settings');
    if (good(st) && isObj(st.json) && (st.json.mailer_autoconfirm === false || st.json.disable_signup === true)) { out('ABBRUCH (Vorbedingung): Dev verlangt E-Mail-Bestätigung oder hat die Registrierung gesperrt; Testkonten können nicht ohne Postfach genutzt werden. Es wurde kein Konto angelegt. Entscheidung nötig (siehe docs/DEV_TESTVERFAHREN.md).'); return await finish(3); }
    // ---- 3. Registrierung ----
    for (const k of ['A', 'B']) {
      const a = acct[k]; a.attempted = true;                                                                          // schon VOR dem Aufruf: eine verlorene Antwort darf kein unbemerktes Konto hinterlassen (T5)
      const r = await http('POST', '/auth/v1/signup', { body: { email: a.email, password: a.pw, data: { username: a.user } } });
      if (!(good(r) && isObj(r.json))) { if (r.status >= 400 && r.status < 500) a.attempted = false; step(`Registrierung ${k}`, false, `HTTP ${r.status}`); return await finish(1); }      // definitive Ablehnung (4xx): kein Konto entstanden
      if (!r.json.access_token) { out('ABBRUCH (Vorbedingung): Dev verlangt E-Mail-Bestätigung; Testkonten können nicht ohne Postfach bestätigt werden. Entscheidung nötig (siehe docs/DEV_TESTVERFAHREN.md).'); return await finish(3); }
      step(`Registrierung ${k} (${a.user})`, true);
    }
    // ---- 4. Login und JWT ----
    const sa = await login(acct.A), sb = await login(acct.B);
    if (!step('Login A und B', sa.ok && sb.ok)) return await finish(1);
    sess.A = sa.json.access_token; sess.B = sb.json.access_token;
    let pa = null; try { pa = b64j(sess.A.split('.')[1]); } catch { /* leer */ }
    step('JWT: Rolle authenticated, Konto-ID, nicht abgelaufen', !!pa && pa.role === 'authenticated' && /^[0-9a-f-]{36}$/.test(pa.sub || '') && pa.exp * 1000 > Date.now());
    // Positivkontrolle für die Berechtigungstests: anonym erreichbare Funktion muss gültig antworten (sonst bedeutet „verweigert“ später nichts)
    const ua = await rpc('username_available', { p_name: acct.A.user }), uf = await rpc('username_available', { p_name: `rwt_${runId}_frei` });
    step('Positivkontrolle anon: username_available (belegt=false, frei=true)', good(ua) && ua.json === false && good(uf) && uf.json === true);
    // ---- 5. Charaktere ----
    const cr = await rpc('create_character', { p_slot: 1, p_name: 'RWTest', p_data: data('RWTest') }, sess.A);
    cidA = good(cr) && Array.isArray(cr.json) && cr.json[0] ? cr.json[0].character_id : null;
    step('Charaktererstellung (Slot 1)', !!cidA, `HTTP ${cr.status}`);
    const ls = await rpc('list_characters', {}, sess.A);
    step('Charakterliste: genau der eigene Charakter', good(ls) && Array.isArray(ls.json) && ls.json.length === 1 && ls.json[0].character_id === cidA && ls.json[0].character_class === 'krieger');
    const sel = await http('GET', `/rest/v1/characters?character_id=eq.${cidA}&select=character_id,version,character_data`, { token: sess.A });
    step('Charakterauswahl: eigenen Charakter laden (RLS)', good(sel) && Array.isArray(sel.json) && sel.json.length === 1 && sel.json[0].version === 1);
    const selB = await http('GET', `/rest/v1/characters?character_id=eq.${cidA}&select=character_id`, { token: sess.B });
    step('Fremdzugriff: Konto B sieht den Charakter von A nicht', good(selB) && Array.isArray(selB.json) && selB.json.length === 0);
    // ---- 6. Gruppe: Negativfälle (laufen immer, mit exakter Erwartung) ----
    if (cidA) {
      const j0 = await rpc('group_join', { p_instance: 999999999, p_character: cidA }, sess.A); step('Gruppenbeitritt zu nicht vorhandener Instanz: 200 und status no_instance', good(j0) && isObj(j0.json) && j0.json.status === 'no_instance', `HTTP ${j0.status}`);
      const a0 = await rpc('group_action', { p_fight: 999999999, p_round: 1, p_action: { ability: 'standard', target: 'boss' }, p_character: cidA }, sess.A); step('Gruppenaktion in unbekanntem Kampf: 403 forbidden', errIs(a0, 403, 'forbidden'), `HTTP ${a0.status}`);
    }
    // ---- 7. Gruppe: positive Pflichtschritte. Ohne Voraussetzungen: NICHT GETESTET, Gesamtlauf unvollständig (Exit 4). ----
    const view = (r) => good(r) && isObj(r.json) && isObj(r.json.me) && r.json.me.key === cidA;
    if (inst && cidA) {
      const j = await rpc('group_join', { p_instance: inst, p_character: cidA }, sess.A); step('Gruppenbeitritt (Test-Instanz): status joined', good(j) && isObj(j.json) && j.json.status === 'joined', j.json && j.json.status);
      const rd = await rpc('group_ready', { p_instance: inst, p_character: cidA }, sess.A); step('Ready: status ok', good(rd) && isObj(rd.json) && rd.json.status === 'ok', rd.json && rd.json.status);
      const vw = await rpc('group_view', { p_instance: inst, p_character: cidA }, sess.A); step('Instanzansicht: enthält den eigenen Charakter (me.key)', view(vw));
    } else for (const n of ['Gruppenbeitritt (positiv)', 'Ready (positiv)', 'Instanzansicht (positiv)']) notTested(n, 'DEV_TEST_INSTANCE nicht gesetzt: eine beitrittsfähige Test-Instanz muss serverseitig vorbereitet werden');
    // Request-Format von group_action laut Datenbank-Wrapper (supabase: server/instance/sql/05_produktion.sql) und produktion.mjs: p_action = { ability (1–40 Zeichen), target? }; Antwort { status: 'ok' }. index.html ruft group_action nicht auf.
    if (inst && fight && round && cidA) { const ac = await rpc('group_action', { p_fight: fight, p_round: round, p_action: { ability: 'standard', target: 'boss' }, p_character: cidA }, sess.A); step('Gruppenaktion (Test-Kampf): status ok', good(ac) && isObj(ac.json) && ac.json.status === 'ok', ac.json && (ac.json.status || ac.json.message)); }
    else notTested('Gruppenaktion (positiv)', 'DEV_TEST_FIGHT/DEV_TEST_ROUND (und Instanz) nicht gesetzt: ein laufender Test-Kampf muss serverseitig vorbereitet werden');
    // ---- 8. Wiederverbindung ----
    const s2 = await login(acct.A); const ls2 = s2.ok ? await rpc('list_characters', {}, s2.json.access_token) : null;
    step('Wiederverbindung: neue Anmeldung sieht denselben Zustand', s2.ok && good(ls2) && Array.isArray(ls2.json) && ls2.json.length === 1 && ls2.json[0].character_id === cidA && ls2.json[0].version === 1);
    if (inst && s2.ok) { const v2 = await rpc('group_view', { p_instance: inst, p_character: cidA }, s2.json.access_token); step('Wiederverbindung: Instanzansicht nach neuer Anmeldung', view(v2)); }
    else if (!inst) notTested('Wiederverbindung: Instanzansicht', 'DEV_TEST_INSTANCE nicht gesetzt');
    // ---- 9. Berechtigungsfehler: exakte Statuswerte und Fehlerinhalt, nie „irgendein Fehler“ ----
    step('anon: list_characters verweigert (401/403, 42501)', permDenied(await rpc('list_characters', {})));
    step('anon: create_character verweigert (401/403, 42501)', permDenied(await rpc('create_character', { p_slot: 2, p_name: 'Nein', p_data: {} })));
    for (const [n, a] of [['rw_worker_tick', {}], ['rw_ops_stuck_list', {}], ['rw_ops_resume', { p_fight: 1, p_round: 1, p_operator: '00000000-0000-4000-8000-000000000001', p_note: 'Berechtigungstest Dev' }], ['rw_ops_terminate', { p_fight: 1, p_operator: '00000000-0000-4000-8000-000000000001', p_note: 'Berechtigungstest Dev' }]]) {
      step(`anon: ${n} verweigert (401/403, 42501)`, permDenied(await rpc(n, a))); step(`angemeldeter Spieler: ${n} verweigert (401/403, 42501)`, permDenied(await rpc(n, a, sess.A)));
    }
    step('Spieler: internes Schema rwi über die Data API nicht erreichbar (406 PGRST106 oder 401/403)', notExposed(await http('GET', '/rest/v1/operators?select=*', { token: sess.A, headers: { 'accept-profile': 'rwi' } })) && notExposed(await http('GET', '/rest/v1/ops_log?select=*', { token: sess.A, headers: { 'accept-profile': 'rwi' } })));
    step('Spieler: rwi-Funktion resume_stuck nicht per RPC erreichbar (406 PGRST106 oder 401/403)', notExposed(await http('POST', '/rest/v1/rpc/resume_stuck', { token: sess.A, headers: { 'content-profile': 'rwi' }, body: { p_fight: 1, p_round: 1, p_operator: '00000000-0000-4000-8000-000000000001', p_note: 'Berechtigungstest Dev' } })));
    if (cidA) {
      const x = await rpc('group_join', { p_instance: inst || 999999999, p_character: cidA }, sess.B); step('Konto B kann den Charakter von A nicht in eine Gruppe einbringen (403 forbidden)', errIs(x, 403, 'forbidden'), `HTTP ${x.status}`);
      const sv = await rpc('save_character', { p_id: cidA, p_expected_version: 1, p_data: data('Fremd') }, sess.B); step('Konto B kann den Charakter von A nicht überschreiben (409 version_conflict)', errIs(sv, 409, 'version_conflict'), `HTTP ${sv.status}`);
      const dl = await rpc('delete_character', { p_id: cidA }, sess.B); step('Konto B kann den Charakter von A nicht löschen (404 not_found)', errIs(dl, 404, 'not_found'), `HTTP ${dl.status}`);
      const after = await http('GET', `/rest/v1/characters?character_id=eq.${cidA}&select=version`, { token: sess.A }); step('Charakter von A blieb unverändert (Version 1)', good(after) && Array.isArray(after.json) && after.json.length === 1 && after.json[0].version === 1);
    }
    // ---- 10. Löschung ----
    if (cidA) {
      const del = await rpc('delete_character', { p_id: cidA }, sess.A); step('Charakterlöschung (eigener Testcharakter)', good(del));
      const l3 = await rpc('list_characters', {}, sess.A); step('Charakterliste danach leer', good(l3) && Array.isArray(l3.json) && l3.json.length === 0);
    }
  } catch (e) { step('Unerwartete Ausnahme im Testlauf', false, String(e && e.message || e).slice(0, 80)); }
  return await finish(0);
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = await run(); process.exit(r.code); }

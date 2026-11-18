// Echter Client-Test gegen das Supabase-DEV-Projekt (nur Dev-URL, Dev-Anon-Key, eigens angelegte Testkonten). KEIN service_role-Schlüssel.
// Aufruf: DEV_SUPABASE_URL=... DEV_ANON_KEY=... node supabase/dev/real-test.mjs      (läuft nie automatisch; Workflow: .github/workflows/dev-test.yml, nur workflow_dispatch)
// Optional: DEV_TEST_INSTANCE (Instanz-ID einer von dir vorbereiteten Test-Instanz), DEV_TEST_FIGHT + DEV_TEST_ROUND (laufender Test-Kampf) für die positiven Gruppenschritte.
// Ausgabe: nur Schrittnamen und Ergebnis. Nie Passwörter, Tokens, Schlüssel oder Antwortinhalte mit Tokens. Exit: 0 ok · 1 Prüfung fehlgeschlagen · 2 Konfiguration fehlt/unsicher · 3 Vorbedingung nicht erfüllt.
import { randomBytes } from 'node:crypto';
const DEV_REF = 'jlkqktmvqxibqdcobbhf', PROD_REF = 'malbiahllucctiafzydv', DOMAIN = 'rwtest.invalid';
const b64j = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

export async function run({ env = process.env, fetchFn = fetch, out = console.log, runId = randomBytes(4).toString('hex') } = {}) {
  const res = []; let pass = 0, fail = 0, skip = 0;
  const step = (name, c, info = '') => { if (c) pass++; else fail++; res.push(c); out(`${c ? 'OK       ' : 'FEHLER   '} ${name}${info ? '  [' + info + ']' : ''}`); return c; };
  const skipped = (name, why) => { skip++; out(`ÜBERSPRUNGEN ${name}  [${why}]`); };
  // ---- 1. Konfiguration und Schutz ----
  const missing = ['DEV_SUPABASE_URL', 'DEV_ANON_KEY'].filter((k) => !env[k]);
  if (missing.length) { out(`ABBRUCH: fehlende Konfiguration: ${missing.join(', ')} (Secrets nicht gesetzt). Es wurde kein Aufruf gemacht.`); return { code: 2, pass, fail, skip }; }
  const url = String(env.DEV_SUPABASE_URL).replace(/\/+$/, ''), anon = String(env.DEV_ANON_KEY);
  let host = ''; try { const u = new URL(url); host = u.protocol === 'https:' || /^http:\/\/(127\.0\.0\.1|localhost)/.test(url) ? u.hostname : ''; } catch { /* leer */ }
  let ak = null; try { ak = b64j(anon.split('.')[1]); } catch { /* leer */ }
  const urlOk = host === `${DEV_REF}.supabase.co` || (/^(127\.0\.0\.1|localhost)$/.test(host) && env.DEV_TEST_ALLOW_LOCAL === '1');
  if (!urlOk || host.includes(PROD_REF) || !ak || ak.role !== 'anon' || (ak.ref && ak.ref !== DEV_REF)) { out('ABBRUCH: URL oder Schlüssel gehören nicht zum Dev-Projekt oder der Schlüssel ist kein Anon-Schlüssel. Es wurde kein Aufruf gemacht.'); return { code: 2, pass, fail, skip }; }
  const inst = env.DEV_TEST_INSTANCE ? Number(env.DEV_TEST_INSTANCE) : null, fight = env.DEV_TEST_FIGHT ? Number(env.DEV_TEST_FIGHT) : null, round = env.DEV_TEST_ROUND ? Number(env.DEV_TEST_ROUND) : null;
  out(`Testlauf ${runId} gegen das Dev-Projekt (Testkonten *@${DOMAIN}, Namen rwt_${runId}_*)`);

  const http = async (method, path, { token = anon, body, headers = {} } = {}) => {
    let r; try { r = await fetchFn(url + path, { method, headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); } catch { return { status: 0, json: null }; }
    let j = null; try { j = await r.json(); } catch { /* leer */ } return { status: r.status, json: j };
  };
  const rpc = (name, args, token) => http('POST', `/rest/v1/rpc/${name}`, { token, body: args || {} });
  const good = (r) => r.status >= 200 && r.status < 300, denied = (r) => !good(r);
  const pw = () => 'Rw!' + randomBytes(12).toString('base64url');                              // nur im Speicher, nie ausgegeben
  const acct = { A: { email: `rwtest-${runId}-a@${DOMAIN}`, user: `rwt_${runId}_a`, pw: pw() }, B: { email: `rwtest-${runId}-b@${DOMAIN}`, user: `rwt_${runId}_b`, pw: pw() } };
  const login = async (a) => { const r = await http('POST', '/auth/v1/token?grant_type=password', { body: { email: a.email, password: a.pw } }); return r.json && r.json.access_token ? r.json : null; };
  const data = (n) => ({ cls: 'krieger', path: '', tier: 0, lv: 5, name: n });
  const sess = {}; let cidA = null, cleaned = false;
  const cleanup = async () => {                                                                 // nur eigene Testkonten dieses Laufs
    if (cleaned) return; cleaned = true;
    for (const k of ['A', 'B']) { const a = acct[k]; if (!a.created) continue; const s = await login(a); if (!s) { out(`HINWEIS: Testkonto ${a.user} konnte nicht zum Aufräumen angemeldet werden; verwaist (siehe supabase/dev/list_test_accounts.sql)`); continue; }
      const d = await rpc('delete_account', { p_confirm: a.user }, s.access_token); out(`${good(d) ? 'OK       ' : 'HINWEIS  '} Aufräumen: Testkonto ${a.user} ${good(d) ? 'gelöscht' : 'nicht gelöscht (siehe list_test_accounts.sql)'}`); }
  };
  try {
    // ---- 2. Registrierung ----
    for (const k of ['A', 'B']) {
      const a = acct[k], r = await http('POST', '/auth/v1/signup', { body: { email: a.email, password: a.pw, data: { username: a.user } } });
      if (r.status === 0 || !(good(r) && r.json)) { step(`Registrierung ${k}`, false, `HTTP ${r.status}`); await cleanup(); return { code: 1, pass, fail, skip }; }
      a.created = true;
      if (!r.json.access_token) { out('ABBRUCH (Vorbedingung): Dev verlangt E-Mail-Bestätigung; Testkonten können nicht ohne Postfach bestätigt werden. Entscheidung nötig (siehe docs/DEV_TESTVERFAHREN.md).'); await cleanup(); return { code: 3, pass, fail, skip }; }
      step(`Registrierung ${k} (${a.user})`, true);
    }
    // ---- 3. Login und JWT ----
    const sa = await login(acct.A), sb = await login(acct.B);
    if (!step('Login A und B', !!sa && !!sb)) { await cleanup(); return { code: 1, pass, fail, skip }; }
    sess.A = sa.access_token; sess.B = sb.access_token;
    let pa = null; try { pa = b64j(sess.A.split('.')[1]); } catch { /* leer */ }
    step('JWT: Rolle authenticated, Konto-ID, nicht abgelaufen', !!pa && pa.role === 'authenticated' && /^[0-9a-f-]{36}$/.test(pa.sub || '') && pa.exp * 1000 > Date.now());
    // ---- 4. Charaktere ----
    const cr = await rpc('create_character', { p_slot: 1, p_name: 'RWTest', p_data: data('RWTest') }, sess.A);
    cidA = good(cr) && Array.isArray(cr.json) && cr.json[0] ? cr.json[0].character_id : null;
    step('Charaktererstellung (Slot 1)', !!cidA, `HTTP ${cr.status}`);
    const ls = await rpc('list_characters', {}, sess.A);
    step('Charakterliste: genau der eigene Charakter', good(ls) && Array.isArray(ls.json) && ls.json.length === 1 && ls.json[0].character_id === cidA && ls.json[0].character_class === 'krieger');
    const sel = await http('GET', `/rest/v1/characters?character_id=eq.${cidA}&select=character_id,version,character_data`, { token: sess.A });
    step('Charakterauswahl: eigenen Charakter laden (RLS)', good(sel) && Array.isArray(sel.json) && sel.json.length === 1 && sel.json[0].version === 1);
    const selB = await http('GET', `/rest/v1/characters?character_id=eq.${cidA}&select=character_id`, { token: sess.B });
    step('Fremdzugriff: Konto B sieht den Charakter von A nicht', good(selB) && Array.isArray(selB.json) && selB.json.length === 0);
    // ---- 5. Gruppe ----
    if (inst && cidA) {
      const j = await rpc('group_join', { p_instance: inst, p_character: cidA }, sess.A); step('Gruppenbeitritt (Test-Instanz)', good(j) && j.json && j.json.status === 'joined', j.json && j.json.status);
      const rd = await rpc('group_ready', { p_instance: inst, p_character: cidA }, sess.A); step('Ready', good(rd) && rd.json && typeof rd.json.status === 'string' && rd.json.status !== 'error', rd.json && rd.json.status);
      const vw = await rpc('group_view', { p_instance: inst, p_character: cidA }, sess.A); step('Instanzansicht', good(vw) && vw.json && typeof vw.json === 'object', vw.json && vw.json.status);
    } else {
      const j = await rpc('group_join', { p_instance: 999999999, p_character: cidA }, sess.A); step('Gruppenbeitritt zu nicht vorhandener Instanz wird sauber abgewiesen', denied(j) || (j.json && j.json.status && j.json.status !== 'joined'));
      skipped('Gruppenbeitritt/Ready/Instanzansicht (positiv)', 'DEV_TEST_INSTANCE nicht gesetzt: eine Test-Instanz muss serverseitig vorbereitet werden');
    }
    if (inst && fight && round && cidA) { const ac = await rpc('group_action', { p_fight: fight, p_round: round, p_action: { type: 'standard' }, p_character: cidA }, sess.A); step('Gruppenaktion (Test-Kampf)', good(ac) && ac.json && typeof ac.json.status === 'string', ac.json && ac.json.status); }
    else skipped('Gruppenaktion (positiv)', 'DEV_TEST_FIGHT/DEV_TEST_ROUND nicht gesetzt: ein laufender Test-Kampf muss serverseitig vorbereitet werden');
    // ---- 6. Wiederverbindung ----
    const s2 = await login(acct.A); const ls2 = s2 ? await rpc('list_characters', {}, s2.access_token) : null;
    step('Wiederverbindung: neue Anmeldung sieht denselben Zustand', !!s2 && good(ls2) && ls2.json.length === 1 && ls2.json[0].character_id === cidA && ls2.json[0].version === 1);
    if (inst && s2) { const v2 = await rpc('group_view', { p_instance: inst, p_character: cidA }, s2.access_token); step('Wiederverbindung: Instanzansicht nach neuer Anmeldung', good(v2) && v2.json && typeof v2.json === 'object'); }
    // ---- 7. Berechtigungsfehler ----
    step('anon: list_characters verweigert', denied(await rpc('list_characters', {}, anon)));
    step('anon: create_character verweigert', denied(await rpc('create_character', { p_slot: 2, p_name: 'Nein', p_data: {} }, anon)));
    for (const [n, a] of [['rw_worker_tick', {}], ['rw_ops_stuck_list', {}], ['rw_ops_resume', { p_fight: 1, p_round: 1, p_operator: '00000000-0000-4000-8000-000000000001', p_note: 'Berechtigungstest Dev' }], ['rw_ops_terminate', { p_fight: 1, p_operator: '00000000-0000-4000-8000-000000000001', p_note: 'Berechtigungstest Dev' }]]) {
      step(`anon: ${n} verweigert`, denied(await rpc(n, a, anon))); step(`angemeldeter Spieler: ${n} verweigert`, denied(await rpc(n, a, sess.A)));
    }
    step('Spieler: internes Schema rwi über die Data API nicht erreichbar', denied(await http('GET', '/rest/v1/operators?select=*', { token: sess.A, headers: { 'accept-profile': 'rwi' } })) && denied(await http('GET', '/rest/v1/ops_log?select=*', { token: sess.A, headers: { 'accept-profile': 'rwi' } })));
    step('Spieler: rwi-Funktion resume_stuck nicht per RPC erreichbar', denied(await http('POST', '/rest/v1/rpc/resume_stuck', { token: sess.A, headers: { 'content-profile': 'rwi' }, body: { p_fight: 1, p_round: 1, p_operator: '00000000-0000-4000-8000-000000000001', p_note: 'Berechtigungstest Dev' } })));
    if (cidA) {
      step('Konto B kann den Charakter von A nicht in eine Gruppe einbringen', (await (async () => { const x = await rpc('group_join', { p_instance: inst || 999999999, p_character: cidA }, sess.B); return denied(x) || (x.json && x.json.status !== 'joined'); })()));
      step('Konto B kann den Charakter von A nicht überschreiben', denied(await rpc('save_character', { p_id: cidA, p_expected_version: 1, p_data: data('Fremd') }, sess.B)));
      step('Konto B kann den Charakter von A nicht löschen', denied(await rpc('delete_character', { p_id: cidA }, sess.B)));
      const after = await http('GET', `/rest/v1/characters?character_id=eq.${cidA}&select=version`, { token: sess.A }); step('Charakter von A blieb unverändert (Version 1)', good(after) && after.json.length === 1 && after.json[0].version === 1);
    }
    // ---- 8. Löschung ----
    if (cidA) {
      const del = await rpc('delete_character', { p_id: cidA }, sess.A); step('Charakterlöschung (eigener Testcharakter)', good(del));
      const l3 = await rpc('list_characters', {}, sess.A); step('Charakterliste danach leer', good(l3) && l3.json.length === 0);
    }
  } finally { await cleanup(); }
  out(`Ergebnis: ${pass} OK, ${fail} Fehler, ${skip} übersprungen`);
  return { code: fail ? 1 : 0, pass, fail, skip };
}
if (import.meta.url === `file://${process.argv[1]}`) { const r = await run(); process.exit(r.code); }

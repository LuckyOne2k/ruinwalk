// Dev-Testskript und Workflow: node server/instance/tests/dev-skript.mjs
// SIMULIERT: ein lokaler HTTP-Stub spielt Supabase (Auth + REST) nach. Geprüft werden Schutzregeln, Abbruchverhalten, Geheimnisfreiheit der Ausgabe, Ablauf und Aufräumen des Skripts
// und die Struktur der Workflow-Datei. Das ECHTE Dev-Verhalten ist damit NICHT bewiesen.
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { counter } from './prod-env.mjs';
import { run } from '../../../supabase/dev/real-test.mjs';
const { ok, done } = counter();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (p) => `${b64({ alg: 'HS256' })}.${b64(p)}.${createHmac('sha256', 'x').update(JSON.stringify(p)).digest('base64url')}`;
const REF = 'jlkqktmvqxibqdcobbhf';
const ANON = jwt({ role: 'anon', ref: REF, exp: 9999999999 });
const mkStub = ({ confirm = false } = {}) => {
  const users = new Map(), chars = [], calls = []; let seq = 0;
  const srv = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c; const j = body ? JSON.parse(body) : {};
    const tok = (req.headers.authorization || '').replace('Bearer ', ''); calls.push(req.method + ' ' + req.url);
    const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const me = tok === ANON ? null : [...users.values()].find((u) => u.tokens.has(tok));
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/auth/v1/signup') { const id = 'u' + (++seq); const rec = { id, email: j.email, pw: j.password, username: j.data.username, tokens: new Set() }; users.set(j.email, rec); return send(200, confirm ? { id } : { id, access_token: 'x', user: { id } }); }
    if (u.pathname === '/auth/v1/token') { const r = users.get(j.email); if (!r || r.pw !== j.password) return send(400, { error: 'bad' }); const t = jwt({ role: 'authenticated', sub: '00000000-0000-4000-8000-0000000000' + String(r.id.slice(1)).padStart(2, '0'), exp: Math.floor(Date.now() / 1000) + 3600, n: Math.random() }); r.tokens.add(t); return send(200, { access_token: t }); }
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const n = u.pathname.split('/').pop();
      if (n.startsWith('rw_') || n === 'resume_stuck') return send(me ? 403 : 401, { message: 'permission denied' });
      if (!me) return send(401, { message: 'jwt' });
      if (n === 'create_character') { const c = { character_id: '10000000-0000-4000-8000-00000000000' + chars.length, owner: me.id, version: 1 }; chars.push(c); return send(200, [{ character_id: c.character_id, version: 1 }]); }
      if (n === 'list_characters') return send(200, chars.filter((c) => c.owner === me.id).map((c) => ({ character_id: c.character_id, character_class: 'krieger', version: 1 })));
      if (n === 'group_join') return send(200, { status: 'unknown_instance' });
      if (n === 'save_character' || n === 'delete_character') { const c = chars.find((x) => x.character_id === j.p_id); if (!c || c.owner !== me.id) return send(404, { message: 'not_found' }); if (n === 'delete_character') chars.splice(chars.indexOf(c), 1); return send(200, null); }
      if (n === 'delete_account') { if (j.p_confirm !== me.username) return send(400, {}); users.delete(me.email); return send(200, null); }
      return send(404, {});
    }
    if (u.pathname === '/rest/v1/characters') { if (!me) return send(200, []); const id = u.searchParams.get('character_id').replace('eq.', ''); return send(200, chars.filter((c) => c.character_id === id && c.owner === me.id)); }
    if (req.headers['accept-profile'] === 'rwi' || u.pathname.endsWith('operators') || u.pathname.endsWith('ops_log')) return send(406, { message: 'schema not exposed' });
    return send(404, {});
  });
  return { srv, users, chars, calls };
};
const start = (s) => new Promise((r) => s.srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.srv.address().port}`)));
const capture = () => { const l = []; return { out: (x) => l.push(x), text: () => l.join('\n'), l }; };
try {
  // ---- Schutz und Abbruch ----
  let c = capture(); let r = await run({ env: {}, out: c.out }); ok(r.code === 2 && /fehlende Konfiguration/.test(c.text()), 'fehlende Secrets: Abbruch (Exit 2), kein Aufruf');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: 'https://malbiahllucctiafzydv.supabase.co', DEV_ANON_KEY: jwt({ role: 'anon', ref: 'malbiahllucctiafzydv' }) }, out: c.out, fetchFn: () => { throw new Error('darf nicht aufgerufen werden'); } }); ok(r.code === 2, 'Production-URL wird verweigert (kein Netzaufruf)');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: 'https://example.com', DEV_ANON_KEY: ANON }, out: c.out, fetchFn: () => { throw new Error('nie'); } }); ok(r.code === 2, 'fremde URL wird verweigert');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: `https://${REF}.supabase.co`, DEV_ANON_KEY: jwt({ role: 'service_role', ref: REF }) }, out: c.out, fetchFn: () => { throw new Error('nie'); } }); ok(r.code === 2 && !c.text().includes('service_role'), 'service_role-Schlüssel als Anon-Key wird verweigert (und nicht ausgegeben)');
  c = capture(); r = await run({ env: { DEV_SUPABASE_URL: `https://${REF}.supabase.co`, DEV_ANON_KEY: jwt({ role: 'anon', ref: 'malbiahllucctiafzydv' }) }, out: c.out, fetchFn: () => { throw new Error('nie'); } }); ok(r.code === 2, 'Anon-Key eines anderen Projekts (Ref) wird verweigert');
  // ---- Ablauf gegen Stub ----
  const S = mkStub(); const url = await start(S); const env = { DEV_SUPABASE_URL: url, DEV_ANON_KEY: ANON, DEV_TEST_ALLOW_LOCAL: '1' };
  c = capture(); r = await run({ env, out: c.out, runId: 'abcd1234' });
  ok(r.code === 0 && r.fail === 0 && r.pass >= 25, `kompletter Lauf gegen den Stub: Exit 0, ${r.pass} Schritte ok, ${r.skip} übersprungen`, c.text().split('\n').filter((l) => /FEHLER/.test(l)).join(' | '));
  ok(r.skip === 2 && /DEV_TEST_INSTANCE nicht gesetzt/.test(c.text()), 'ohne Test-Instanz: positive Gruppenschritte sind ausdrücklich ÜBERSPRUNGEN (nicht stillschweigend ok)');
  ok(S.users.size === 0 && S.chars.length === 0, 'Aufräumen: beide Testkonten und der Charakter sind gelöscht (Wiederholbarkeit)');
  ok(c.l.every((l) => !/Rw!|eyJ|Bearer|password/i.test(l)) && !c.text().includes(ANON), 'Ausgabe enthält weder Passwörter noch Tokens noch den Anon-Key');
  ok(/rwtest-abcd1234-a@rwtest\.invalid/.test([...S.calls].length ? 'rwtest-abcd1234-a@rwtest.invalid' : '') && c.text().includes('rwt_abcd1234_a'), 'Testkonten sind eindeutig erkennbar (rwtest.invalid, rwt_<Lauf>_*)');
  r = await run({ env, out: capture().out, runId: 'eeee5555' }); ok(r.code === 0 && S.users.size === 0, 'zweiter Lauf mit anderer Kennung: gleiches Ergebnis (wiederholbar, keine Kollision)');
  ok(S.calls.every((x) => !/service_role/.test(x)), 'kein Aufruf mit service_role');
  S.srv.close();
  // ---- E-Mail-Bestätigung aktiv ----
  const S2 = mkStub({ confirm: true }); const url2 = await start(S2); c = capture();
  r = await run({ env: { ...env, DEV_SUPABASE_URL: url2 }, out: c.out, runId: 'ffff6666' }); ok(r.code === 3 && /E-Mail-Bestätigung/.test(c.text()), 'aktive E-Mail-Bestätigung: Abbruch mit Vorbedingung (Exit 3), kein Scheinerfolg');
  S2.srv.close();
  // ---- Workflow-Datei ----
  const wf = readFileSync(new URL('../../../.github/workflows/dev-test.yml', import.meta.url), 'utf8');
  ok(/^on:\n  workflow_dispatch:/m.test(wf) && !/^\s+(push|pull_request|schedule|workflow_run|pull_request_target):/m.test(wf), 'Workflow startet nur manuell (workflow_dispatch)');
  ok(!/service_role|SERVICE_ROLE/i.test(wf.replace(/^#.*$/gm, '')), 'Workflow verwendet keinen service_role-Schlüssel (nur in Kommentaren erwähnt)');
  ok(/environment: dev-test/.test(wf) && /permissions:\n  contents: read/.test(wf) && /add-mask/.test(wf) && /exit 2/.test(wf), 'Environment mit Freigabe, minimale Rechte, Maskierung, sicherer Abbruch bei fehlenden Secrets');
  ok(/secrets\.DEV_SUPABASE_URL/.test(wf) && /secrets\.DEV_ANON_KEY/.test(wf) && !/echo[^\n]*\$\{?DEV_(SUPABASE_URL|ANON_KEY)/.test(wf) && !/secrets\.[A-Z_]*(PASS|PW)/.test(wf), 'nur Dev-URL und Anon-Key als Secrets, nirgends ausgegeben, keine Passwörter hinterlegt');
  ok(/github\.repository == 'LuckyOne2k\/ruinwalk'/.test(wf) && /bestaetigung == 'dev'/.test(wf), 'Bestätigungseingabe und Repository-Schutz (keine Forks)');
  const sc = readFileSync(new URL('../../../supabase/dev/real-test.mjs', import.meta.url), 'utf8');
  ok(!/service_role['"`]?\s*[:=]|SERVICE_ROLE_KEY/.test(sc) && !/delete from|drop |truncate/i.test(sc.replace(/\/\/.*$/gm, '')), 'Skript enthält keinen service_role-Schlüssel und kein direktes SQL-Löschen (nur eigene Konten über delete_account)');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
process.exit(done());

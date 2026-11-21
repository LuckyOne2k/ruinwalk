// Smoke-Test von supabase/functions/operator/index.ts: bun server/instance/tests/operator-index.bun.mjs
// SIMULIERT: läuft unter BUN mit einer Attrappe für globalThis.Deno (env.get, serve) und lokalen HTTP-Attrappen für GoTrue und PostgREST. Das ist KEIN Deno-Lauf und KEIN Supabase-Test.
// NICHT bewiesen: Typprüfung (dafür gibt es in der CI `deno check`), Verhalten der echten Edge Runtime, echtes GoTrue/PostgREST, Verhalten von verify_jwt am Gateway.
import http from 'node:http';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { counter } from './prod-env.mjs';
const { ok, done } = counter();
if (typeof Bun === 'undefined') { console.log('NICHT AUSGEFÜHRT: dieser Test braucht Bun (er zählt nicht als bestanden)'); process.exit(3); }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '22222222-2222-4222-8222-222222222222', now = () => Math.floor(Date.now() / 1000);
const jwt = (p) => `${b64({ alg: 'HS256' })}.${b64(p)}.${createHmac('sha256', 'x').update(JSON.stringify(p)).digest('base64url')}`;
const TOKEN = jwt({ sub: UID, role: 'authenticated', aal: 'aal2', exp: now() + 3600 }), TOKEN1 = jwt({ sub: UID, role: 'authenticated', aal: 'aal1', exp: now() + 3600 });
const seen = [];
const srv = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c; seen.push({ url: req.url, apikey: req.headers.apikey, authorization: req.headers.authorization, body: b });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(req.url === '/auth/v1/user' ? JSON.stringify({ id: UID }) : JSON.stringify({ status: 'terminated', old_engine: null, new_engine: null }));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const URL_ = `http://127.0.0.1:${srv.address().port}`;
// frische Kopie je Konfiguration: das Modul wertet seine Umgebung nur einmal aus
const load = async (env, tag) => { let served = null; globalThis.Deno = { env: { get: (n) => env[n] }, serve: (f) => { served = f; } }; const d = mkdtempSync(join(tmpdir(), 'rwidx-' + tag + '-')); cpSync(new URL('../../../supabase/functions/operator/', import.meta.url).pathname, d, { recursive: true }); await import(join(d, 'index.ts')); return served; };
const post = (f, auth, bodyStr) => f(new Request('http://x/', { method: 'POST', headers: { ...(auth ? { authorization: 'Bearer ' + auth } : {}), 'content-type': 'application/json' }, body: bodyStr }));
const BODY = JSON.stringify({ action: 'terminate', fight: 5, note: 'Fehlerursache untersucht, Hotfix eingespielt' });
try {
  const NEW = { SUPABASE_URL: URL_, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_Attrappe12345' }), SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_Attrappe1234567890' }) };
  let f = await load(NEW, 'neu'); seen.length = 0;
  let r = await post(f, TOKEN, BODY); let j = await r.json();
  const gt = seen.find((s) => s.url === '/auth/v1/user'), pr = seen.find((s) => s.url === '/rest/v1/rpc/rw_ops_terminate');
  ok(r.status === 200 && j.status === 'terminated', 'neues Schlüsselformat: gültiger Aufruf läuft durch (200, terminated)');
  ok(gt && gt.apikey === 'sb_publishable_Attrappe12345' && gt.authorization === 'Bearer ' + TOKEN, 'GoTrue-Prüfung: apikey = Publishable-Key, Bearer = Nutzer-JWT');
  ok(pr && pr.apikey === 'sb_secret_Attrappe1234567890' && pr.authorization === undefined, 'PostgREST-Aufruf: Secret-Key nur im apikey-Header, KEIN Authorization-Header');
  ok(!JSON.stringify(j).includes('sb_secret') && JSON.parse(pr.body).p_operator === UID, 'Antwort enthält keinen Schlüssel; p_operator stammt aus dem geprüften JWT');
  const LEG = { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: 'eyJanon.attrappe.schluessel', SUPABASE_SERVICE_ROLE_KEY: 'eyJservice.attrappe.schluessel' };
  f = await load(LEG, 'alt'); seen.length = 0; r = await post(f, TOKEN, BODY);
  const pl = seen.find((s) => s.url === '/rest/v1/rpc/rw_ops_terminate');
  ok(r.status === 200 && pl.apikey === 'eyJservice.attrappe.schluessel' && pl.authorization === 'Bearer eyJservice.attrappe.schluessel', 'altes Schlüsselformat (Legacy-JWT): apikey und Bearer, Aufruf läuft durch');
  // Body erst nach der Authentifizierung, mit hartem Limit
  f = await load(NEW, 'neu2'); let pulled = 0, i = 0; const big = () => new ReadableStream({ pull(c) { if (i++ >= 3000) return c.close(); pulled += 1024; c.enqueue(new Uint8Array(1024).fill(120)); } });
  seen.length = 0; r = await f(new Request('http://x/', { method: 'POST', body: big(), duplex: 'half' }));
  ok(r.status === 401 && pulled <= 2048 && seen.length === 0, 'ohne Token: 401, der 3-MB-Body wurde nicht gelesen (nur der Vorpuffer des Streams, höchstens 2 KB) und kein Backend aufgerufen', `Vorpuffer ${pulled} Byte`);
  pulled = 0; i = 0; seen.length = 0; r = await f(new Request('http://x/', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN }, body: big(), duplex: 'half' }));
  ok(r.status === 400 && pulled <= 4096 + 4 * 1024 && !seen.some((s) => s.url.startsWith('/rest/v1/rpc/')), 'mit Token und 3-MB-Body: 400, höchstens ~8 KB gelesen, keine Datenbankwirkung', `gelesen ${pulled} Byte`);
  seen.length = 0; r = await post(f, TOKEN1, BODY); ok(r.status === 403 && !seen.some((s) => s.url.startsWith('/rest/v1/rpc/')), 'aal1: 403, keine Datenbankwirkung (MFA-Pflicht ist ohne OPERATOR_REQUIRE_MFA=false aktiv)');
  // fehlende Konfiguration: geschlossen
  f = await load({ SUPABASE_URL: URL_ }, 'leer'); seen.length = 0; r = await post(f, TOKEN, BODY);
  ok(r.status !== 200 && !seen.some((s) => s.url.startsWith('/rest/v1/rpc/')), 'ohne Schlüssel in der Umgebung: kein Erfolg, kein Backend-Aufruf', `Status ${r.status}`);
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
srv.close(); process.exit(done());

// Regressionstests der Korrekturen K6–K8 an der Betreiber-Edge-Function (Body-Limit vor dem Lesen, Schlüsselformate, Konfiguration): node server/instance/tests/operator-korrekturen.mjs
// SIMULIERT: Handler und Hilfsfunktionen laufen unter Node mit Attrappen (kein echtes GoTrue, kein Deno, kein Supabase). NICHT bewiesen: Verhalten in der echten Edge Runtime.
// Mutationsprobe = der kritische Code wird absichtlich verfälscht; der Test MUSS dann das Gegenteil melden, sonst prüft er nichts.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { counter } from './prod-env.mjs';
const { ok, done } = counter();
const FN = new URL('../../../supabase/functions/operator/', import.meta.url);
const fnDir = FN.pathname;
const copyWith = (file, from, to) => { const d = mkdtempSync(join(tmpdir(), 'rwop-')); for (const f of ['handler.mjs', 'keys.mjs']) copyFileSync(join(fnDir, f), join(d, f)); const p = join(d, file); const t = readFileSync(p, 'utf8'); if (!t.includes(from)) throw new Error('Mutationsstelle nicht gefunden: ' + from.slice(0, 60)); writeFileSync(p, t.replace(from, to)); return d; };
const UID = '11111111-1111-4111-8111-111111111111', NOTE = 'Fehlerursache untersucht, Hotfix eingespielt';
const MULTI = JSON.stringify({ action: 'terminate', fight: 5, note: '€'.repeat(1000) }) + ' '.repeat(1200);
const body = (o) => JSON.stringify({ action: 'terminate', fight: 5, note: NOTE, ...o });
const mkH = async (dir, { aal = 'aal2', rpcSpy } = {}) => { const { makeHandler } = await import(join(dir, 'handler.mjs') + '?' + Math.random()); let reads = 0; const spy = rpcSpy || { calls: 0 };
  const h = makeHandler({ verify: async (t) => (t === 'gut' ? { id: UID, aal } : null), rpc: async () => { spy.calls++; return { status: 'terminated' }; } });
  return { call: (auth, readBody) => h({ method: 'POST', authorization: auth, readBody: readBody ? async (m) => { reads++; return readBody(m); } : undefined }), reads: () => reads, spy }; };
try {
  const keys = await import(join(fnDir, 'keys.mjs'));
  // ---------- K8: Schlüsselformate ----------
  const env = (o) => (n) => o[n];
  const NEWP = JSON.stringify({ default: 'sb_publishable_AbCdEf123456' }), NEWS = JSON.stringify({ default: 'sb_secret_GeheimGeheim123456' });
  ok(keys.pickKey(env({ SUPABASE_PUBLISHABLE_KEYS: NEWP, SUPABASE_ANON_KEY: 'altaltaltalt' }), 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY') === 'sb_publishable_AbCdEf123456', 'K8: neues Format (SUPABASE_PUBLISHABLE_KEYS, Name default) hat Vorrang vor dem alten');
  ok(keys.pickKey(env({ SUPABASE_SECRET_KEYS: NEWS }), 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') === 'sb_secret_GeheimGeheim123456', 'K8: neues Secret-Format wird erkannt');
  ok(keys.pickKey(env({ SUPABASE_ANON_KEY: 'eyJalter.jwt.schluessel' }), 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY') === 'eyJalter.jwt.schluessel', 'K8: ohne neues Format gilt der alte Schlüssel (Projekte mit Legacy-Keys)');
  ok(keys.pickKey(env({ SUPABASE_PUBLISHABLE_KEYS: '{kaputt', SUPABASE_ANON_KEY: 'eyJalter.jwt.schluessel' }), 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY') === 'eyJalter.jwt.schluessel', 'K8: unlesbares JSON fällt auf das alte Format zurück, kein Absturz');
  ok(keys.pickKey(env({ SUPABASE_SECRET_KEYS: JSON.stringify({ andere: 'sb_secret_xxxxxxxxxx' }) }), 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') === null && keys.pickKey(env({}), 'A', 'B') === null && keys.pickKey(env({ B: 'kurz' }), 'A', 'B') === null, 'K8: kein Schlüssel „default“, keine oder zu kurze Schlüssel → null (geschlossen im Zweifel)');
  const hn = keys.keyHeaders('sb_secret_GeheimGeheim123456'), hl = keys.keyHeaders('eyJalter.jwt.schluessel');
  ok(Object.keys(hn).join() === 'apikey' && hn.apikey === 'sb_secret_GeheimGeheim123456', 'K8: neuer Secret-Key geht NUR im Header apikey (er ist kein JWT, nie als Bearer)');
  ok(hl.apikey === 'eyJalter.jwt.schluessel' && hl.authorization === 'Bearer eyJalter.jwt.schluessel', 'K8: alter JWT-Schlüssel geht in apikey und Authorization');
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  ok(/pickKey\(get, 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'\)/.test(idx) && /pickKey\(get, 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'\)/.test(idx) && /keyHeaders\(svc\)/.test(idx) && !/authorization: `Bearer \$\{svc\}`/.test(idx), 'K8: index.ts nutzt Schlüsselwahl und -Header (kein fest verdrahteter Bearer mit dem Secret-Key)');
  ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(idx) && !/sb_secret_[A-Za-z0-9]{8,}/.test(idx) && /config_missing/.test(idx) && !/console\.(log|error)\([^)]*svc/.test(idx.replace(/.*config_missing.*\n/, '')), 'K8: kein Schlüssel im Quelltext; fehlende Konfiguration wird nur als Vorhandensein (true/false) gemeldet, nie mit Werten');
  const mk = copyWith('keys.mjs', "String(key).startsWith('sb_')", 'false'); const mkk = await import(join(mk, 'keys.mjs'));
  ok(mkk.keyHeaders('sb_secret_GeheimGeheim123456').authorization !== undefined, 'K8 Mutationsprobe: ohne die sb_-Unterscheidung würde der Secret-Key als Bearer gesendet (Test oben ist wirksam)');
  // ---------- K8: Konfigurationsort und Wirksamkeit ----------
  const cfg = readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8').replace(/^#.*$/gm, '');
  ok(/\[functions\.operator\]\s*\nverify_jwt = true/.test(cfg) && !/project_id|api_url|service_role|secret|jwt_secret/i.test(cfg), 'K8: supabase/config.toml enthält [functions.operator] mit verify_jwt = true (so liest es die Supabase-CLI laut Dokumentation) und sonst nichts (keine Projektkennung, keine Secrets)');
  ok(readdirSync(fnDir).sort().join() === 'handler.mjs,index.ts,keys.mjs' && !existsSync(join(fnDir, 'config.toml')), 'K8: im Funktionsordner liegt keine wirkungslose config.toml mehr (nur handler.mjs, index.ts, keys.mjs)');
  const ci = readFileSync(new URL('../../../.github/workflows/instance-tests.yml', import.meta.url), 'utf8');
  ok(/deno check supabase\/functions\/operator\/index\.ts/.test(ci) && /operator-index\.bun\.mjs/.test(ci), 'K8: CI prüft die Funktion mit deno check und führt den Bun-Smoke-Test aus (in dieser Umgebung NICHT ausgeführt, siehe Bericht)');
  // ---------- K7: Body-Limit vor dem vollständigen Einlesen ----------
  const MAX = 4096, A = (await import(join(fnDir, 'handler.mjs'))).MAX_BODY; ok(A === MAX, 'K7: MAX_BODY ist 4096 Byte');
  const mkReq = (chunks, headers = {}) => { let pulled = 0, i = 0; const rs = new ReadableStream({ pull(c) { if (i >= chunks.length) return c.close(); pulled += chunks[i].byteLength; c.enqueue(chunks[i++]); } }); const req = new Request('http://x/', { method: 'POST', body: rs, headers, duplex: 'half' }); return { req, pulled: () => pulled }; };
  const enc = new TextEncoder(), chunk = (n) => new Uint8Array(n).fill(120);
  let q = mkReq([enc.encode('{"a":1}')]); ok(await keys.readBodyLimited(q.req, MAX) === '{"a":1}', 'K7: kleiner Body wird vollständig gelesen');
  q = mkReq(Array.from({ length: 2000 }, () => chunk(1024))); const big = await keys.readBodyLimited(q.req, MAX);
  ok(big === null && q.pulled() <= MAX + 4 * 1024, 'K7: ein 2-MB-Strom ohne Content-Length wird bei Überschreitung abgebrochen und NICHT vollständig gelesen', `gelesen ${q.pulled()} Byte`);
  const withCl = { headers: { get: (n) => (n === 'content-length' ? '5000000' : null) }, body: { getReader() { throw new Error('darf nicht gelesen werden'); }, cancel() { return Promise.resolve(); } } };
  ok(await keys.readBodyLimited(withCl, MAX) === null, 'K7: ein zu großer Content-Length wird abgewiesen, ohne den Body anzufassen');
  q = mkReq([chunk(4096)]); ok((await keys.readBodyLimited(q.req, MAX)).length === 4096, 'K7: genau 4096 Byte sind erlaubt');
  q = mkReq([chunk(4097)]); ok(await keys.readBodyLimited(q.req, MAX) === null, 'K7: 4097 Byte werden abgewiesen');
  q = mkReq([Uint8Array.of(0xff, 0xfe, 0xfd)]); ok(await keys.readBodyLimited(q.req, MAX) === null, 'K7: ungültiges UTF-8 wird abgewiesen');
  // Handler: Body erst NACH der Authentifizierung gelesen
  const H = await mkH(fnDir);
  let r = await H.call(null, async () => body()); ok(r.status === 401 && H.reads() === 0, 'K7: ohne Authorization wird der Body gar nicht gelesen (401)');
  r = await H.call('Bearer ungueltig', async () => body()); ok(r.status === 401 && H.reads() === 0, 'K7: mit ungültigem Token wird der Body gar nicht gelesen (401)');
  r = await H.call('Bearer gut', async () => body()); ok(r.status === 200 && H.reads() === 1 && H.spy.calls === 1, 'K7: mit gültigem Token wird der Body genau einmal gelesen und verarbeitet');
  const H2 = await mkH(fnDir); r = await H2.call('Bearer gut', async () => null); ok(r.status === 400 && H2.spy.calls === 0, 'K7: readBody meldet Überschreitung (null) → 400, keine Datenbankwirkung');
  const H3 = await mkH(fnDir); r = await H3.call('Bearer gut', async () => MULTI);
  ok(r.status === 400 && H3.spy.calls === 0, 'K7: das Limit zählt BYTES (gültiger JSON-Body, 2260 Zeichen = 4260 Byte → 400), nicht Zeichen');
  const dEarly = copyWith('handler.mjs', "if (method !== 'POST') return json(405, { error: 'method_not_allowed' });", "if (method !== 'POST') return json(405, { error: 'method_not_allowed' }); if (readBody) await readBody(MAX_BODY);");
  const HM = await mkH(dEarly); await HM.call(null, async () => body()); ok(HM.reads() === 1, 'K7 Mutationsprobe: liest ein verfälschter Handler den Body vor der Authentifizierung, erkennt der Test das (Leseanzahl 1 statt 0)');
  const dChars = copyWith('handler.mjs', 'new TextEncoder().encode(raw).length > MAX_BODY', 'raw.length > MAX_BODY');
  const HC = await mkH(dChars); r = await HC.call('Bearer gut', async () => MULTI);
  ok(r.status === 200 && HC.spy.calls === 1, 'K7 Mutationsprobe: mit Zeichenzählung würde der 4260-Byte-Body NICHT abgewiesen (Test oben ist wirksam)', `Status ${r.status}`);
  // ---------- MFA und Identität bleiben unverändert wirksam (Mutationsprobe der Sicherheitsprüfung) ----------
  const HA = await mkH(fnDir, { aal: 'aal1' }); r = await HA.call('Bearer gut', async () => body()); ok(r.status === 403 && r.body.error === 'mfa_required' && HA.spy.calls === 0, 'MFA: aal1 → 403 mfa_required, keine Datenbankwirkung');
  const dMfa = copyWith('handler.mjs', "requireMfa && who.aal !== 'aal2'", 'false'); const HB = await mkH(dMfa, { aal: 'aal1' }); r = await HB.call('Bearer gut', async () => body());
  ok(r.status === 200 && HB.spy.calls === 1, 'MFA Mutationsprobe: ohne die MFA-Prüfung käme aal1 durch (Test oben ist wirksam)');
  const dId = copyWith('handler.mjs', 'p_operator: who.id, p_note: a.note }', "p_operator: JSON.parse(rawBody ?? '{}').operator ?? who.id, p_note: a.note }");
  ok(readFileSync(join(dId, 'handler.mjs'), 'utf8').includes('JSON.parse(rawBody'), 'Identität Mutationsprobe: die verfälschte Variante existiert (Identität aus dem Body); die Abwehr dagegen sind die Tests in operator-edge.mjs (operator/operator_id/account_id → 400)');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
process.exit(done());

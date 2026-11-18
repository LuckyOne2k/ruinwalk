// Betreiber-Edge-Function (supabase/functions/operator): node server/instance/tests/operator-edge.mjs
// SIMULIERT: GoTrue ist ein lokaler Stub (prüft HS256-Signatur, Ablauf, Rolle); die Datenbankwrapper sind ECHT (lokales PG mit Supabase-Rollenstub). Nicht bewiesen: echtes GoTrue, echtes Deno-/Edge-Runtime-Verhalten.
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setup, counter, J } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { runTick } from '../worker/core.mjs';
import { a1Db } from '../worker/a1.mjs';
import { makeHandler, makeVerifier } from '../../../supabase/functions/operator/handler.mjs';
const { ok, done } = counter();
const E = await setup(54497); const { q, rpcAs } = E;
const svc = rpcAs('service_role'); const db = a1Db(svc);
const SECRET = 'nur-fuer-den-lokalen-test-stub', ANON = 'anon-stub-key', SVC_KEY = 'SERVICE-ROLE-GEHEIMNIS-NIE-ZURUECKGEBEN';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (p, secret = SECRET) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), b = b64(p); return `${h}.${b}.${createHmac('sha256', secret).update(h + '.' + b).digest('base64url')}`; };
const now = () => Math.floor(Date.now() / 1000);
const tok = (id, o = {}) => sign({ sub: id, role: 'authenticated', aal: 'aal2', exp: now() + 3600, ...o });
// GoTrue-Stub: GET /auth/v1/user
const srv = http.createServer((req, res) => {
  const t = (req.headers.authorization || '').replace('Bearer ', ''), [h, b, s] = t.split('.');
  const bad = () => { res.writeHead(401); res.end('{"msg":"invalid"}'); };
  if (req.url !== '/auth/v1/user' || req.headers.apikey !== ANON || !s || createHmac('sha256', SECRET).update(h + '.' + b).digest('base64url') !== s) return bad();
  const p = JSON.parse(Buffer.from(b, 'base64url')); if (p.exp <= now() || p.role !== 'authenticated') return bad();
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: p.gotrue_id || p.sub, role: 'authenticated' }));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const URL_ = `http://127.0.0.1:${srv.address().port}`;
const logs = []; let failRpc = false;
const mk = (o = {}) => makeHandler({ verify: makeVerifier({ url: URL_, anonKey: ANON }), rpc: async (n, a) => { if (failRpc) throw new Error('db down: ' + SVC_KEY); return svc(n, a); }, log: (e) => logs.push(e), ...o });
const H = mk();
const call = (token, body, o = {}) => H({ method: 'POST', authorization: token === null ? null : 'Bearer ' + token, rawBody: typeof body === 'string' ? body : JSON.stringify(body), ...o });
const broken = { ...engine, resolveClaim: () => { throw new Error('Engine kaputt (Test)'); } };
let n = 0;
const mkStuck = async () => {
  const ps = []; for (let k = 0; k < 2; k++) ps.push(await E.account('X' + (++n) + 'x' + k));
  const g = await E.group(ps.map((p) => p.chars[0])); for (const p of ps) await q(`select rwi.set_ready(${g.instance}, '${p.chars[0]}')`);
  const S = engine.newFight(J(await q(`select rwi.roster(${g.instance})`)), { bossHp: 4000, bossAtk: 8 });
  await q(`select rwi.start_fight(${g.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${g.instance}`));
  await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
  for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await q(`update rwi.fights set lease_until = clock_timestamp() - interval '1 second' where id=${fid} and phase='resolving'`); }
  return { fid, inst: g.instance };
};
const cnt = (w) => q(`select count(*) from rwi.ops_log where ${w}`);
const acc = async (nm) => (await E.account(nm, 0)).id;
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q(`update rwi.cfg set v = 6 where k = 'max_attempts'`);
  const OP = await acc('EdOp'), TERM = await acc('EdTerm'), PL = (await E.account('EdPlayer')).id;
  await q(`select rwi.set_operator('${OP}', 'Edge-Betreiber', array['resume','terminate','engine'])`); await q(`select rwi.set_operator('${TERM}', 'Nur-Beenden', array['terminate'])`);
  const K = await mkStuck(); const note = 'Fehlerursache untersucht, Hotfix eingespielt';
  const stuck = () => q(`select engine_stuck::text from rwi.instances where id=${K.inst}`);
  const OK = { action: 'resume', fight: K.fid, round: 1, note };

  // ---- Abweisungen ohne jede Wirkung ----
  const base = await q(`select count(*) from rwi.ops_log`);
  const r1 = await call(null, OK); ok(r1.status === 401 && r1.body.error === 'unauthenticated', 'ohne Authorization-Header: 401');
  const r2 = await call(tok(OP, {}).slice(0, -4) + 'AAAA', OK); ok(r2.status === 401, 'manipulierte Signatur: 401');
  const r3 = await call(tok(OP, { exp: now() - 10 }), OK); ok(r3.status === 401, 'abgelaufenes JWT: 401');
  const r4 = await call(sign({ sub: OP, role: 'authenticated', aal: 'aal2', exp: now() + 3600 }, 'falsches-geheimnis'), OK); ok(r4.status === 401, 'JWT mit falschem Schlüssel signiert: 401');
  const r5 = await call(ANON, OK); ok(r5.status === 401, 'Anon-Schlüssel statt Benutzer-JWT: 401');
  const r6 = await call(tok(OP, { role: 'service_role' }), OK); ok(r6.status === 401, 'JWT mit Rolle service_role: 401');
  const r7 = await call('abc', OK); ok(r7.status === 401, 'kein JWT-Format: 401');
  ok((await q(`select count(*) from rwi.ops_log`)) === base && (await stuck()) === 'true', 'bei 401: nichts protokolliert, nichts geändert, Instanz weiter gesperrt');

  const r8 = await call(tok(PL, { gotrue_id: OP }), OK); ok(r8.status === 401, 'JWT-Nutzlast (sub) passt nicht zur von GoTrue gelieferten Identität: 401');
  const rp = await call(tok(PL), OK); ok(rp.status === 403 && rp.body.error === 'forbidden' && !JSON.stringify(rp.body).includes('kein Betreiber'), 'normaler Spieler (gültiges JWT): 403 ohne Grund im Antworttext');
  ok((await cnt(`kind='denied' and operator_id='${PL}' and fight_id=${K.fid}`)) === '1' && (await stuck()) === 'true', 'Spielerversuch steht mit seiner (geprüften) ID als denied im ops_log; Instanz unverändert');
  const rt = await call(tok(TERM), OK); ok(rt.status === 403 && (await cnt(`kind='denied' and operator_id='${TERM}'`)) === '1', 'Betreiber ohne Umfang resume: 403, denied protokolliert');
  const m1 = await call(tok(PL), { ...OK, operator: OP }), m2 = await call(tok(PL), { ...OK, operator_id: OP }), m3 = await call(tok(PL), { ...OK, account_id: OP }), m4 = await call(tok(OP), { ...OK, operator: PL });
  ok([m1, m2, m3, m4].every((x) => x.status === 400 && x.body.error === 'invalid_input'), 'Betreiber-/Konto-ID im Body: 400 (kein Identitätsnachweis, auch nicht zusätzlich)');
  ok((await cnt(`fight_id=${K.fid} and kind <> 'denied'`)) === '0' && (await stuck()) === 'true', 'manipulierte Betreiber-ID: keine Wirkung');
  const bad = [{ ...OK, note: undefined }, { ...OK, note: '' }, { ...OK, note: 'kurz' }, { ...OK, note: '         x         ' }, { ...OK, note: 'x'.repeat(1001) }, { ...OK, fight: 0 }, { ...OK, fight: '1' }, { ...OK, fight: 1.5 }, { ...OK, round: 0 }, { ...OK, round: 100001 },
    { ...OK, engine: 'böse; drop' }, { ...OK, engine: 'x'.repeat(81) }, { ...OK, action: 'register_engine' }, { ...OK, action: 'x' }, { ...OK, extra: 1 }, [OK], null, 'x', { action: 'terminate', fight: K.fid, note, round: 1 }];
  let allBad = true; for (const b of bad) { const x = await call(tok(OP), b === 'x' ? 'x' : b === null ? 'null' : b); if (x.status !== 400) { allBad = false; console.log('nicht abgewiesen:', JSON.stringify(b)); } }
  ok(allBad, `${bad.length} ungültige Eingaben (u. a. fehlende/zu kurze Begründung, falsche Typen, unbekannte Felder/Aktionen): 400`);
  ok((await call(tok(OP), '{kaputt')).status === 400 && (await call(tok(OP), 'x'.repeat(5000))).status === 400, 'kaputtes JSON und zu großer Body: 400');
  ok((await H({ method: 'GET', authorization: 'Bearer ' + tok(OP), rawBody: '' })).status === 405, 'GET: 405');
  const mf = await call(tok(OP, { aal: 'aal1' }), OK); ok(mf.status === 403 && mf.body.error === 'mfa_required' && (await stuck()) === 'true', 'ohne MFA (aal1): 403 mfa_required, keine Wirkung');
  const H2 = mk({ requireMfa: false }); const mf2 = await H2({ method: 'POST', authorization: 'Bearer ' + tok(OP, { aal: 'aal1' }), rawBody: JSON.stringify({ ...OK, round: 2 }) }); ok(mf2.status === 200 && mf2.body.status === 'stale', 'MFA-Pflicht ist abschaltbar (nur Dev): ohne Pflicht wird das Wrapper-Ergebnis durchgereicht (hier stale: falsche Runde, keine Wirkung)', JSON.stringify(mf2));
  ok((await stuck()) === 'true', 'stale-Aufruf ändert nichts');

  // ---- Erfolg ----
  await q(`select rwi.register_engine('${OP}', 'v1-edge-hotfix', 1, 'Edge-Test')`);
  const g = await call(tok(OP), { ...OK, engine: 'v1-edge-hotfix' });
  ok(g.status === 200 && g.body.status === 'resumed' && g.body.new_engine === 'v1-edge-hotfix' && g.body.old_engine, 'gültiger Betreiber: resumed (200)', JSON.stringify(g));
  const l = J(await q(`select row_to_json(l) from rwi.ops_log l where kind='resume' and fight_id=${K.fid}`));
  ok(l.operator_id === OP && l.operator === 'Edge-Betreiber' && l.instance_id === K.inst && l.round_no === 1 && l.new_engine === 'v1-edge-hotfix' && l.note === note, 'Protokoll: Betreiber-ID aus dem JWT, Name, Instanz, Runde, Engine alt/neu, Begründung');
  const g2 = await call(tok(OP), { ...OK, engine: 'v1-edge-hotfix' }); ok(g2.status === 200 && g2.body.status !== 'resumed' && (await cnt(`kind='resume' and fight_id=${K.fid}`)) === '1', 'doppelte Wiederaufnahme: keine zweite Ausführung, kein zweiter Protokolleintrag', g2.body.status);
  ok(logs.some((e) => e.ev === 'done' && e.operator === OP && e.status === 'resumed') && !JSON.stringify(logs).includes('eyJ') && !JSON.stringify(logs).includes(SECRET), 'Funktionslog enthält Betreiber-ID und Ergebnis, aber kein Token');

  // ---- beendet / bereits abgeschlossen ----
  const T = await mkStuck();
  const tr = await call(tok(TERM), { action: 'terminate', fight: T.fid, note: 'Ursache nicht behebbar, technisch beenden' }); ok(tr.status === 200 && tr.body.status === 'terminated', 'Betreiber mit Umfang terminate beendet technisch (200)', JSON.stringify(tr));
  ok((await cnt(`kind='terminate' and fight_id=${T.fid} and operator_id='${TERM}'`)) === '1', 'terminate protokolliert mit der JWT-Identität');
  const t2 = await call(tok(TERM), { action: 'terminate', fight: T.fid, note: 'zweiter Versuch, nichts mehr zu tun' }), t3 = await call(tok(OP), { action: 'resume', fight: T.fid, round: 1, note: 'Instanz ist bereits beendet' });
  ok(t2.body.status === 'not_active' && t3.body.status === 'not_active' && (await cnt(`fight_id=${T.fid} and kind='terminate'`)) === '1', 'bereits abgeschlossene Instanz: not_active, nichts erneut verarbeitet');
  const gone = await call(tok(OP), { action: 'terminate', fight: 999999, note: 'Kampf existiert nicht, Test' }); ok(gone.status === 200 && gone.body.status === 'unknown_fight', 'unbekannter Kampf: unknown_fight');

  // ---- Fehler im Backend ----
  failRpc = true; const fe = await call(tok(OP), { action: 'terminate', fight: K.fid, note: 'Datenbank nicht erreichbar, Test' }); failRpc = false;
  ok(fe.status === 502 && JSON.stringify(fe.body) === '{"error":"backend_error"}' && !JSON.stringify(fe).includes(SVC_KEY), 'Backend-Fehler: 502 ohne Details, kein Schlüssel in der Antwort');
  ok(![r1, r2, r3, rp, rt, g, fe, mf].some((x) => JSON.stringify(x).includes(SVC_KEY) || JSON.stringify(x).includes('service_role')), 'keine Antwort enthält den service_role-Schlüssel');

  // ---- Verdrahtung (index.ts) ----
  const idx = readFileSync(new URL('../../../supabase/functions/operator/index.ts', import.meta.url), 'utf8');
  ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(idx) && /Deno\.env\.get\(n\)/.test(idx) && /pickKey\(get, 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'\)/.test(idx) && !/body[^\n]*svc|svc[^\n]*Response/.test(idx), 'index.ts: Schlüssel nur aus der Umgebung, kein Schlüssel im Code, nicht in Antworten');
  ok(/\[functions\.operator\]\s*\nverify_jwt = true/.test(readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8')), 'supabase/config.toml ([functions.operator]): verify_jwt = true (Gateway als zweite Schicht; Ort laut Supabase-Doku, Korrektur K8)');
  // ---- Data API ----
  for (const role of ['anon', 'authenticated']) ok(await q(`set role ${role}; select count(*) from rwi.operators`).then(() => false, () => true) && await q(`set role ${role}; insert into rwi.operators values ('${PL}','x1',array['resume'])`).then(() => false, () => true), `${role}: rwi.operators weder lesbar noch beschreibbar`);
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { srv.close(); E.stop(); }
process.exit(done());

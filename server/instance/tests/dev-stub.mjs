// HTTP-STUB für supabase/dev/real-test.mjs. SIMULIERT Supabase (GoTrue + PostgREST) mit den Antwortformen, die aus dem Quellcode der Funktionen und der PostgREST-Dokumentation erwartet werden.
// Das ist KEIN echter GoTrue-/PostgREST-/Supabase-Test. Ob das echte Dev-Projekt genauso antwortet, beweist nur ein echter Lauf.
import http from 'node:http';
import { createHmac } from 'node:crypto';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const jwt = (p) => `${b64({ alg: 'HS256' })}.${b64(p)}.${createHmac('sha256', 'x').update(JSON.stringify(p)).digest('base64url')}`;
export const REF = 'jlkqktmvqxibqdcobbhf';
export const ANON = jwt({ role: 'anon', ref: REF, exp: 9999999999 });
export const PUBLISHABLE = 'sb_publishable_TestSchluesselNurFuerStub1234';
// Optionen: confirm (E-Mail-Bestätigung aktiv) · settings (false: /auth/v1/settings nicht lesbar) · rwStatus/rwBody (Antwort auf rw_*-Aufrufe; Standard 401/403 + 42501) · deleteFails · deleteIneffective ·
// schemaStatus (Antwortstatus für nicht exponiertes Schema, z. B. 404/500) · netFail(name) (Verbindungsabbruch) · prepared {instance, fight} (vorbereitete Test-Instanz/-Kampf) · publishableOnly (lehnt Bearer ab, wie neue Schlüssel) · ownerCheckOff (Mutationsprobe der Stub-Sicherheit)
export const mkStub = (o = {}) => {
  const users = new Map(), chars = [], calls = [], bodies = [], members = new Set(); let seq = 0;
  const pg = (status, code, message) => [status, { code, message, details: null, hint: null }];
  const srv = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c; const j = body ? JSON.parse(body) : {};
    const tok = (req.headers.authorization || '').replace('Bearer ', ''); calls.push(req.method + ' ' + req.url + (req.headers.authorization ? ' [bearer]' : ' [ohne bearer]'));
    const send = (s, x) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(x)); };
    const sendPg = (a) => send(a[0], a[1]);
    const me = [...users.values()].find((u) => u.tokens.has(tok)) || null;
    const u = new URL(req.url, 'http://x'); bodies.push({ path: u.pathname, body: j });
    if (u.pathname === '/auth/v1/settings') return o.settings === false ? send(404, {}) : send(200, { mailer_autoconfirm: !o.confirm, disable_signup: false });
    if (u.pathname === '/auth/v1/signup') { const id = 'u' + (++seq); const rec = { id, email: j.email, pw: j.password, username: j.data.username, tokens: new Set() }; users.set(j.email, rec); return send(200, o.confirm ? { id } : { id, access_token: 'x', user: { id } }); }
    if (u.pathname === '/auth/v1/token') {
      const r = users.get(j.email); if (!r || r.pw !== j.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (o.confirm) return send(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      const t = jwt({ role: 'authenticated', sub: '00000000-0000-4000-8000-0000000000' + String(r.id.slice(1)).padStart(2, '0'), exp: Math.floor(Date.now() / 1000) + 3600, n: Math.random() }); r.tokens.add(t); return send(200, { access_token: t });
    }
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const n = u.pathname.split('/').pop(); if (o.netFail && o.netFail === n) return req.socket.destroy();
      if ((req.headers['content-profile'] === 'rwi' || n === 'resume_stuck') && o.schemaStatus) return send(o.schemaStatus, { message: 'x' });
      if (req.headers['content-profile'] === 'rwi' || n === 'resume_stuck') return sendPg(pg(406, 'PGRST106', 'Invalid schema: rwi'));
      if (n.startsWith('rw_')) return o.rwStatus ? send(o.rwStatus, o.rwBody ?? { code: 'PGRST202', message: 'Could not find the function' }) : sendPg(pg(me ? 403 : 401, '42501', 'permission denied for function ' + n));
      if (o.publishableOnly && tok && !me) return sendPg(pg(401, 'PGRST301', 'JWT invalid'));
      if (n === 'username_available') { const t = j.p_name.toLowerCase(); return send(200, ![...users.values()].some((x) => x.username.toLowerCase() === t)); }
      if (!me) return sendPg(pg(401, '42501', 'permission denied for function ' + n));
      if (n === 'create_character') { const c = { character_id: '10000000-0000-4000-8000-00000000000' + chars.length, owner: me.id, version: 1 }; chars.push(c); return send(200, [{ character_id: c.character_id, version: 1 }]); }
      if (n === 'list_characters') return send(200, chars.filter((c) => c.owner === me.id).map((c) => ({ character_id: c.character_id, character_class: 'krieger', version: 1 })));
      const own = () => chars.find((x) => x.character_id === (j.p_character || j.p_id) && (o.ownerCheckOff || x.owner === me.id));
      if (n === 'group_join') { if (!own()) return sendPg(pg(403, 'PT403', 'forbidden')); if (o.prepared && j.p_instance === o.prepared.instance) { members.add(me.id); return send(200, { status: 'joined' }); } return send(200, { status: 'no_instance' }); }
      if (n === 'group_ready') return send(200, { status: members.has(me.id) ? 'ok' : 'not_member' });
      if (n === 'group_view') return members.has(me.id) ? send(200, { me: { key: j.p_character }, version: 1 }) : sendPg(pg(403, 'PT403', 'forbidden'));
      if (n === 'group_action') { if (!own()) return sendPg(pg(403, 'PT403', 'forbidden')); if (!o.prepared || j.p_fight !== o.prepared.fight || !members.has(me.id)) return sendPg(pg(403, 'PT403', 'forbidden')); return send(200, { status: typeof j.p_action === 'object' && typeof j.p_action.ability === 'string' && j.p_action.ability.length >= 1 ? 'ok' : 'invalid' }); }
      if (n === 'save_character') { const c = chars.find((x) => x.character_id === j.p_id && x.owner === me.id); return c ? send(200, 2) : sendPg(pg(409, 'PT409', 'version_conflict')); }
      if (n === 'delete_character') { const c = chars.find((x) => x.character_id === j.p_id && x.owner === me.id); if (!c) return sendPg(pg(404, 'PT404', 'not_found')); chars.splice(chars.indexOf(c), 1); return send(204, null); }
      if (n === 'delete_account') { if (o.deleteFails) return send(500, { message: 'boom' }); if (j.p_confirm !== me.username) return sendPg(pg(400, '22023', 'confirm_mismatch')); if (!o.deleteIneffective) users.delete(me.email); return send(200, null); }
      return sendPg(pg(404, 'PGRST202', 'Could not find the function'));
    }
    if (u.pathname === '/rest/v1/characters') { if (!me) return send(200, []); const id = u.searchParams.get('character_id').replace('eq.', ''); return send(200, chars.filter((c) => c.character_id === id && c.owner === me.id)); }
    if (req.headers['accept-profile'] === 'rwi' && o.schemaStatus) return send(o.schemaStatus, { message: 'x' });
    if (req.headers['accept-profile'] === 'rwi') return sendPg(pg(406, 'PGRST106', 'Invalid schema: rwi'));
    return send(404, {});
  });
  return { srv, users, chars, calls, bodies, members };
};
export const start = (s) => new Promise((r) => s.srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.srv.address().port}`)));
export const capture = () => { const l = []; return { out: (x) => l.push(x), text: () => l.join('\n'), l }; };

// Betreiber-Edge-Function: Kernlogik ohne Laufzeitabhängigkeit (Deno und Node). Die Identität kommt AUSSCHLIESSLICH aus einem von GoTrue geprüften JWT.
// Nichts aus dem Request-Body gilt als Identität (kein operator/operator_id/account_id: solche Felder machen die Anfrage ungültig).
// Aktionen: resume, terminate. (register_engine bleibt bewusst außerhalb: nicht ausdrücklich freigegeben.)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INT = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const ENGINE = /^[A-Za-z0-9._-]{1,80}$/;
const FIELDS = { resume: ['action', 'fight', 'round', 'note', 'engine'], terminate: ['action', 'fight', 'note'] };
export const MAX_BODY = 4096;

// Prüft das JWT bei GoTrue (Signatur, Ablauf, Sitzung). Liefert {id, aal} oder null. Fehlerdetails gehen nie an den Aufrufer.
export function makeVerifier({ url, anonKey, fetchFn = fetch, now = () => Date.now() }) {
  return async (token) => {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || token.split('.').length !== 3) return null;
    let res; try { res = await fetchFn(`${url}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` } }); } catch { return null; }
    if (!res.ok) return null;
    let u; try { u = await res.json(); } catch { return null; }
    let p; try { p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }      // Nutzlast erst NACH der GoTrue-Prüfung gelesen
    if (!u || !UUID.test(u.id || '') || p.sub !== u.id || p.role !== 'authenticated' || typeof p.exp !== 'number' || p.exp * 1000 <= now()) return null;
    return { id: u.id, aal: p.aal === 'aal2' ? 'aal2' : 'aal1' };
  };
}

export function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_input' };
  const f = FIELDS[body.action]; if (!f) return { error: 'invalid_input' };
  if (Object.keys(body).some((k) => !f.includes(k))) return { error: 'invalid_input' };           // u. a. operator, operator_id, account_id
  if (!INT(body.fight, 1, 2 ** 53 - 1)) return { error: 'invalid_input' };
  if (typeof body.note !== 'string') return { error: 'invalid_input' };
  const note = body.note.trim(); if (note.length < 10 || note.length > 1000) return { error: 'invalid_input' };
  if (body.action === 'resume') {
    if (!INT(body.round, 1, 100000)) return { error: 'invalid_input' };
    if (body.engine !== undefined && body.engine !== null && !(typeof body.engine === 'string' && ENGINE.test(body.engine))) return { error: 'invalid_input' };
    return { ok: { action: 'resume', fight: body.fight, round: body.round, note, engine: body.engine ?? null } };
  }
  return { ok: { action: 'terminate', fight: body.fight, note } };
}

const json = (status, o) => ({ status, body: o });
// deps: verify(token) -> {id, aal}|null ; rpc(name, args) -> Objekt (nur service_role-Wrapper) ; requireMfa (Standard true) ; log(ereignis) (ohne Token/Geheimnisse)
export function makeHandler({ verify, rpc, requireMfa = true, log = () => {} }) {
  return async ({ method, authorization, rawBody }) => {
    if (method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const m = /^Bearer (\S+)$/.exec(authorization || '');
    const who = m ? await verify(m[1]) : null;
    if (!who) { log({ ev: 'unauthenticated' }); return json(401, { error: 'unauthenticated' }); }
    if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) return json(400, { error: 'invalid_input' });
    let body; try { body = JSON.parse(rawBody); } catch { return json(400, { error: 'invalid_input' }); }
    const v = validate(body); if (v.error) return json(400, { error: v.error });
    if (requireMfa && who.aal !== 'aal2') { log({ ev: 'mfa_required', operator: who.id }); return json(403, { error: 'mfa_required' }); }
    const a = v.ok; let r;
    try {
      r = a.action === 'resume'
        ? await rpc('rw_ops_resume', { p_fight: a.fight, p_round: a.round, p_operator: who.id, p_note: a.note, p_engine: a.engine })
        : await rpc('rw_ops_terminate', { p_fight: a.fight, p_operator: who.id, p_note: a.note });
    } catch { log({ ev: 'backend_error', operator: who.id, action: a.action }); return json(502, { error: 'backend_error' }); }
    const st = r && typeof r.status === 'string' ? r.status : null;
    if (!st) return json(502, { error: 'backend_error' });
    log({ ev: 'done', operator: who.id, action: a.action, fight: a.fight, status: st });
    if (st === 'not_operator') return json(403, { error: 'forbidden' });                                // Grund (kein Betreiber / deaktiviert / Umfang) bleibt intern, steht im ops_log
    return json(200, { status: st, ...(['resumed', 'terminated'].includes(st) ? { old_engine: r.old_engine ?? null, new_engine: r.new_engine ?? null } : {}) });
  };
}

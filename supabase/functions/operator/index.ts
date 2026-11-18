// Supabase Edge Function "operator" (Deno). NICHT bereitgestellt; Bereitstellung nur nach Freigabe (siehe docs/OPERATOREN.md, docs/DEV_FREIGABE_NACHKORREKTUR.md).
// Umgebung (von Supabase in Edge Functions gesetzt): neues Format SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (JSON, Name "default"), altes Format SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
// Weitere: SUPABASE_URL; optional OPERATOR_REQUIRE_MFA=false (nur Dev, nie setzen für die Abnahme).
// Der Secret-/service_role-Schlüssel wird nur serverseitig hier gelesen, nie zurückgegeben und nie protokolliert.
// verify_jwt (supabase/config.toml, [functions.operator]) bleibt an; unabhängig davon prüft diese Funktion das JWT selbst bei GoTrue.
import { makeHandler, makeVerifier } from './handler.mjs';
import { keyHeaders, pickKey, readBodyLimited } from './keys.mjs';

const get = (n: string) => Deno.env.get(n);
const url = get('SUPABASE_URL') ?? '';
const anon = pickKey(get, 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const svc = pickKey(get, 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
if (!url || !anon || !svc) console.error(JSON.stringify({ ev: 'config_missing', url: !!url, anon: !!anon, svc: !!svc }));       // nur Vorhandensein, nie Werte
const handle = makeHandler({
  verify: makeVerifier({ url, anonKey: anon ?? '' }),
  requireMfa: get('OPERATOR_REQUIRE_MFA') !== 'false',
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (!svc) throw new Error('config');
    const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...keyHeaders(svc), 'content-type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error('rpc ' + r.status);
    return await r.json();
  },
  log: (e: unknown) => console.log(JSON.stringify(e)),
});
Deno.serve(async (req: Request) => {
  const out = await handle({ method: req.method, authorization: req.headers.get('authorization'), readBody: (max: number) => readBodyLimited(req, max) });
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
});

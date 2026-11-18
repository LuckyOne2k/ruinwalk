// Supabase Edge Function "operator" (Deno). NICHT bereitgestellt; Bereitstellung nur nach Freigabe (siehe docs/OPERATOREN.md).
// Umgebung: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (von Supabase automatisch in Edge Functions gesetzt), optional OPERATOR_REQUIRE_MFA=false (nur Dev).
// Der service_role-Schlüssel wird nur serverseitig hier gelesen, nie zurückgegeben und nie protokolliert.
import { makeHandler, makeVerifier } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const handle = makeHandler({
  verify: makeVerifier({ url, anonKey: anon }),
  requireMfa: Deno.env.get('OPERATOR_REQUIRE_MFA') !== 'false',
  rpc: async (name: string, args: Record<string, unknown>) => {
    const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: svc, authorization: `Bearer ${svc}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error('rpc ' + r.status);
    return await r.json();
  },
  log: (e: unknown) => console.log(JSON.stringify(e)),
});
Deno.serve(async (req: Request) => {
  const out = await handle({ method: req.method, authorization: req.headers.get('authorization'), rawBody: await req.text() });
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
});

// Rechte-Audit der KOMBINIERTEN Installation (schema.sql + 01..05) aus dem Systemkatalog: node server/instance/tests/rechte-audit.mjs
// Umgebung: lokale PostgreSQL-Instanz, Supabase-Attrappe im Modus legacy (Standardrechte in public für anon/authenticated/service_role, wie auf Dev), pgcrypto in
// "extensions". Lokal, NICHT das echte Dev-Projekt. Erwartete Mengen sind ausdrücklich aufgeschrieben, nichts wird aus dem Ist-Zustand abgeleitet.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const SQL = (f) => readFileSync(join(here, '../sql', f + '.sql'), 'utf8');
const STUB = readFileSync(join(here, '../../../supabase/tests/00_stub.sql'), 'utf8');
const SCHEMA = readFileSync(join(here, '../../../supabase/schema.sql'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, JSON.stringify(a) === JSON.stringify(b) ? '' : `ist ${JSON.stringify(a)}, erwartet ${JSON.stringify(b)}`);
const cl = await startCluster(54440);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 160)); return r.out; };
const lines = async (s) => { const o = await q(s); return o ? o.split('\n') : []; };
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q('\\set legacy 1\n' + STUB);
  await q(`create schema extensions; create extension pgcrypto schema extensions; alter role postgres set search_path = "$user", public, extensions;`);
  const defBefore = await q(`select count(*) from pg_default_acl`);
  await q(SCHEMA); for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion']) await q(SQL(f));

  const execFns = (role, ns) => lines(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p where p.pronamespace='${ns}'::regnamespace and has_function_privilege('${role}', p.oid, 'EXECUTE') order by 1`);
  const CLIENT = ['create_character(p_slot integer, p_name text, p_data jsonb)', 'delete_account(p_confirm text)', 'delete_character(p_id uuid)', 'list_characters()', 'move_character(p_id uuid, p_target integer)', 'save_character(p_id uuid, p_expected_version integer, p_data jsonb)', 'touch_login()'];
  const WRAP = ['group_action(p_fight bigint, p_round integer, p_action jsonb, p_character uuid)', 'group_heartbeat(p_instance bigint, p_character uuid)', 'group_join(p_instance bigint, p_character uuid)', 'group_leave(p_instance bigint, p_character uuid)', 'group_ready(p_instance bigint, p_character uuid)', 'group_revive_decline(p_fight bigint, p_character uuid)', 'group_revive_use(p_fight bigint, p_character uuid)', 'group_view(p_instance bigint, p_character uuid)'];
  const anonFns = await execFns('anon', 'public'), authFns = await execFns('authenticated', 'public'), svcFns = await execFns('service_role', 'public');
  eq(anonFns, ['username_available(p_name text)'], 'public: anon führt NUR username_available aus');
  ok(authFns.includes('username_available(p_name text)') && CLIENT.every((f) => authFns.includes(f)), 'public: authenticated führt alle 7 Client-Funktionen und username_available aus');
  const wrapNames = WRAP.map((w) => w.split('(')[0]);
  ok(wrapNames.every((w) => authFns.some((f) => f.startsWith(w + '('))), 'public: authenticated führt alle 8 group_*-Wrapper aus', authFns.filter((f) => f.startsWith('group_')).length + ' gefunden');
  const extraAuth = authFns.filter((f) => ![...CLIENT, 'username_available(p_name text)'].includes(f) && !f.startsWith('group_'));
  eq(extraAuth, [], 'public: authenticated führt NICHTS darüber hinaus aus (keine Helfer, Trigger, purge_*, has_entitlement, is_verified, safe_*)');
  ok(authFns.length === 16, 'public: authenticated führt genau 16 Funktionen aus', String(authFns.length));
  // service_role: Standardrechte der Dev-Umgebung geben ihm EXECUTE auf neue Funktionen in public; ausdrücklich entzogen ist nur purge_account_backups (bekannter Befund A)
  ok(!svcFns.some((f) => f.startsWith('purge_account_backups')), 'public: service_role hat KEIN EXECUTE auf purge_account_backups');
  ok(svcFns.some((f) => f.startsWith('purge_expired_backups')), 'public: service_role führt purge_expired_backups aus');
  ok(!svcFns.some((f) => f.startsWith('group_')), 'public: service_role führt die Client-Wrapper nicht aus (Wrapper-Grants nur für authenticated)');
  // PUBLIC
  eq(await lines(`select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','rwi') and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')`), [], 'kein Objekt in public/rwi ist für PUBLIC ausführbar (auch nicht per PostgreSQL-Standard)');

  // rwi: Clients nichts, service_role nur Serverfunktionen
  eq([await execFns('anon', 'rwi'), await execFns('authenticated', 'rwi')], [[], []], 'rwi: anon und authenticated führen keine Funktion aus');
  ok((await q(`select has_schema_privilege('anon','rwi','USAGE')::text || has_schema_privilege('authenticated','rwi','USAGE')::text || has_schema_privilege('anon','rwi','CREATE')::text || has_schema_privilege('authenticated','rwi','CREATE')::text`)) === 'falsefalsefalsefalse', 'rwi: anon/authenticated haben weder USAGE noch CREATE auf das Schema');
  ok(!(await execFns('service_role', 'rwi')).some((f) => /^(join|leave|set_ready|submit_action|submit_action_for|instance_view|heartbeat|heartbeat_for|use_revive_item|decline_revive_item|current_player|own_character)\(/.test(f)), 'rwi: service_role führt keine Testfunktion mit Spielerparameter und nicht own_character aus');
  eq(await lines(`select c.relname || ':' || r from pg_class c cross join (values ('anon'),('authenticated')) v(r) where c.relnamespace='rwi'::regnamespace and c.relkind in ('r','S') and (has_any_column_privilege(v.r, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') or has_table_privilege(v.r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))`), [], 'rwi: keine Tabellen-, Spalten- oder Sequenzrechte für anon/authenticated');

  // Tabellen in public
  const tp = (role) => lines(`select c.relname || ':' || string_agg(p, ',' order by p) from pg_class c cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where c.relnamespace='public'::regnamespace and c.relkind='r' and has_table_privilege('${role}', c.oid, p) group by c.relname order by 1`);
  eq(await tp('anon'), [], 'public: anon hat auf keiner Tabelle ein Recht');
  eq(await tp('authenticated'), ['account_entitlements:SELECT', 'characters:SELECT', 'profiles:SELECT'], 'public: authenticated hat nur SELECT auf profiles, account_entitlements, characters');
  ok((await lines(`select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='S' and (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') or has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE'))`)).length === 0, 'public: keine Sequenzrechte für anon/authenticated');
  eq(await lines(`select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','rwi') and c.relkind in ('r','p') and not c.relrowsecurity order by 1`), [], 'RLS ist auf ALLEN Tabellen in public und rwi aktiv');
  eq(await lines(`select c.relname || '.' || po.polname from pg_policy po join pg_class c on c.oid=po.polrelid where c.relnamespace='rwi'::regnamespace`), [], 'rwi: keine Policies (RLS als zweite Sperre ohne Freigabe)');
  eq((await lines(`select n.nspname || '.' || c.relname || '.' || po.polname || ' ' || array_to_string(array(select rolname from pg_roles where oid = any(po.polroles)), ',') from pg_policy po join pg_class c on c.oid=po.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by 1`)), ['public.account_entitlements.ent_own_read authenticated', 'public.characters.char_own_read authenticated', 'public.profiles.profiles_own_read authenticated'], 'public: genau drei SELECT-Policies, alle nur für authenticated');

  // SECURITY DEFINER und search_path
  eq(await lines(`select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','rwi') and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%') order by 1`), [], 'jede SECURITY-DEFINER-Funktion hat einen festen search_path');
  eq(await lines(`select p.proname from pg_proc p where p.pronamespace='rwi'::regnamespace and p.prosecdef order by 1`), ['on_character_deleted', 'own_character'], 'rwi: genau zwei SECURITY-DEFINER-Funktionen');
  ok((await lines(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','rwi') and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%' and c !~ 'pg_temp$')`)).length === 0, 'in jedem festen search_path steht pg_temp zuletzt (kein Vorrang für temporäre Objekte)');
  ok((await q(`select count(*) from pg_proc p where p.pronamespace='rwi'::regnamespace and not p.prosecdef and p.proconfig is not null`)) === '0', 'rwi: übrige Funktionen laufen als Aufrufer ohne eigene Konfiguration (Serverrollen, kein erweiterter Zugriff)');


  // Statische Heuristik (kein Parser): in den Instanz-Skripten steht hinter from/join/update/into/delete from/insert into keine rwi-Tabelle ohne Schemaname.
  // Ergänzt die Laufzeitnachweise (claim/commit mit search_path pg_catalog, Wrapper mit search_path public, pg_temp); ersetzt keinen Beweis für jede Verzweigung.
  { const tabs = (await lines(`select relname from pg_class where relnamespace='rwi'::regnamespace and relkind='r' order by 1`));
    const re = new RegExp(`\\b(from|join|update|into)\\s+(${tabs.join('|')})\\b`, 'gi'); const hits = [];
    for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion']) SQL(f).split('\n').forEach((l, i) => { const code = l.replace(/--.*$/, ''); re.lastIndex = 0; if (re.test(code)) hits.push(`${f}:${i + 1}`); });
    eq(hits, [], `statisch: keine unqualifizierten Verweise auf die ${tabs.length} rwi-Tabellen in den Instanz-Skripten (Heuristik)`); }

  // Trigger auf auth.users und Wechselwirkungen
  eq(await lines(`select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal`), ['on_auth_user_created'], 'auth.users: genau ein eigener Trigger');
  eq(await lines(`select n.nspname || '.' || c.relname || '.' || t.tgname || ' ' || case when t.tgtype & 2 = 2 then 'BEFORE' else 'AFTER' end from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname = 'public' order by 1`),
    ['public.account_entitlements.entitlements_audit AFTER', 'public.characters.characters_backup_del BEFORE', 'public.characters.characters_backup_upd BEFORE', 'public.characters.characters_guard BEFORE', 'public.characters.characters_rwi_cleanup AFTER', 'public.profiles.profiles_guard BEFORE'], 'Trigger auf den public-Tabellen: erwartete Menge und Zeitpunkte');

  // Default-ACLs
  const dacl = await lines(`select defaclrole::regrole || ' ' || coalesce(defaclnamespace::regnamespace::text,'-') || ' ' || defaclobjtype::text from pg_default_acl where defaclnamespace::regnamespace::text in ('public','rwi') order by 1`);
  console.log('   Default-ACL-Einträge nach Installation (public/rwi):', JSON.stringify(dacl), '| vorher gesamt:', defBefore, 'nachher gesamt:', await q(`select count(*) from pg_default_acl`));
  ok(dacl.filter((x) => / public /.test(x)).length === 3, 'Default-ACLs in public: nur die 3 der Umgebung (die Installation ändert sie nicht)');
  ok(dacl.filter((x) => / rwi /.test(x)).length === 0, 'die Installation erzeugt keinen einzigen neuen Default-ACL-Eintrag (pg_default_acl insgesamt unverändert)', defBefore + ' -> ' + (await q('select count(*) from pg_default_acl')));
  ok((await q(`select count(*) from pg_default_acl d where d.defaclnamespace='rwi'::regnamespace and exists (select 1 from aclexplode(d.defaclacl) a join pg_roles r on r.oid = a.grantee where r.rolname in ('anon','authenticated'))`)) === '0', 'rwi: kein Default-ACL-Eintrag vergibt anon/authenticated etwas');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n').slice(0, 2).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);

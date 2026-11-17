-- Preflight für die Dev-Installation. Schreibt NICHTS (nur Prüfungen), darf jederzeit ausgeführt werden.
-- Wird von build.sh auch an den Anfang von install_dev.sql gestellt: ein zweiter Installationsversuch bricht damit mit klarer Meldung ab,
-- bevor irgendetwas verändert wird (alles läuft in einer Transaktion).
do $$
declare v int := current_setting('server_version_num')::int; n int; r text;
begin
  if v < 150000 then raise exception 'preflight: PostgreSQL 15 oder neuer erforderlich (gefunden %)', current_setting('server_version'); end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then raise exception 'preflight: Rolle % fehlt (keine Supabase-Umgebung?)', r; end if;
  end loop;
  if current_user in ('anon','authenticated','service_role') then raise exception 'preflight: nicht als API-Rolle installieren (aktuell: %)', current_user; end if;
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null
     or to_regclass('auth.sessions') is null or to_regclass('auth.mfa_amr_claims') is null then
    raise exception 'preflight: auth.users/auth.sessions/auth.mfa_amr_claims/auth.uid()/auth.jwt() fehlen';
  end if;
  if not has_table_privilege(current_user, 'auth.users', 'TRIGGER') or not has_table_privilege(current_user, 'auth.users', 'REFERENCES')
     or not has_table_privilege(current_user, 'auth.users', 'DELETE') then
    raise exception 'preflight: % hat auf auth.users nicht die Rechte TRIGGER/REFERENCES/DELETE', current_user;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'rwi') then raise exception 'preflight: Schema rwi existiert bereits - bereits installiert? Abbruch ohne Änderung'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created') then raise exception 'preflight: Trigger on_auth_user_created existiert bereits - bereits installiert? Abbruch ohne Änderung'; end if;
  -- schema.sql entzieht in public ALLE Rechte an allen Tabellen/Funktionen: nur in einem leeren public ausführen
  select count(*) into n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S','f')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  if n > 0 then raise exception 'preflight: public enthält bereits % Relationen - Abbruch (die Installation entzieht in public allen API-Rollen alle Rechte)', n; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if n > 0 then raise exception 'preflight: public enthält bereits % Funktionen - Abbruch', n; end if;
  raise notice 'preflight ok: PostgreSQL %, Installationsrolle %', current_setting('server_version'), current_user;
end $$;

-- Attrappe der Supabase-Umgebung für lokale Tests (Rollen, auth-Schema). NICHT in Supabase ausführen.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb not null default '{}', email_confirmed_at timestamptz, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
-- Modus 'legacy' (ältere Projekte): neue Objekte in public sind standardmäßig für alle API-Rollen freigegeben.
-- Modus 'new' (neue Projekte seit 30.05.2026): keine Standardrechte, alles muss ausdrücklich vergeben werden. Gesteuert über psql-Variable.
\if :{?legacy}
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
\endif

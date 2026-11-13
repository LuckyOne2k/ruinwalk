-- Räumt nach editor_test.sql auf (Testkonten, Testschema, Protokoll). Gefahrlos mehrfach ausführbar.
reset role;
drop policy if exists tmp_upd on public.profiles;
revoke update on public.profiles from authenticated;
delete from auth.users where email like '%@test.de';
delete from public.payment_events;
delete from public.character_backups;
delete from public.audit_log;
drop schema if exists tap cascade;
select 'aufgeräumt' as status, (select count(*) from auth.users) as konten, (select count(*) from public.characters) as charaktere;

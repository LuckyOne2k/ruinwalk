-- ROLLBACK D3 (NICHT ANGEWENDET): macht migration_d3_konto_loeschen.sql rückgängig und stellt den Stand vom 15.11.2026 (vor D2) wieder her.
-- Es werden keine Nutzerdaten angefasst. Bereits (durch Nutzer) gelöschte Konten kommen dadurch NICHT zurück; die Migration selbst löscht nur
-- Protokollzeilen ohne Konto (Waisen), davon gab es live am 15.11.2026 keine (0 von 1 Zeile).
begin;
drop function if exists public.delete_account(text);
drop function if exists public.purge_expired_backups();
create or replace function public.touch_login() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  update public.profiles set last_login = now() where account_id = auth.uid();
end $$;
create or replace function public.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  delete from public.characters where character_id = p_id and account_id = uid;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  insert into public.audit_log(account_id, character_id, action) values (uid, p_id, 'character_deleted');
end $$;
drop function if exists public.purge_account_backups(uuid);   -- erst nach touch_login/delete_character (die riefen sie auf)
alter table public.audit_log drop constraint if exists audit_log_account_id_fkey;
alter table public.payment_events drop constraint if exists payment_events_account_id_fkey;
alter table public.payment_events add constraint payment_events_account_id_fkey foreign key (account_id) references public.profiles(account_id);
-- Rechte der alten Funktionen (create or replace behält sie); zur Sicherheit erneut ausdrücklich:
revoke all on function public.touch_login(), public.delete_character(uuid) from public, anon;
grant execute on function public.touch_login(), public.delete_character(uuid) to authenticated;
commit;

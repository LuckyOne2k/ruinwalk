-- ROLLBACK B2 (NICHT ANGEWENDET): macht migration_b2_loeschreihenfolge.sql rückgängig und stellt public.delete_character in der Fassung vor B2 wörtlich wieder her
-- (Stand supabase/schema.sql vor B2 = Stand nach Migration D3). Es werden keine Nutzerdaten angefasst.
begin;
create or replace function public.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  delete from public.characters where character_id = p_id and account_id = uid;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  insert into public.audit_log(account_id, character_id, action) values (uid, p_id, 'character_deleted');
  perform public.purge_account_backups(uid);
end $$;
revoke all on function public.delete_character(uuid) from public, anon;
grant execute on function public.delete_character(uuid) to authenticated;
commit;

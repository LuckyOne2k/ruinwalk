-- ROLLBACK B4 (NICHT ANGEWENDET): macht migration_b4_speichern_reihenfolge.sql rückgängig und stellt public.save_character und public.move_character
-- in der Fassung vor B4 wörtlich wieder her (Stand supabase/schema.sql auf main 9a05ab4). Es werden keine Nutzerdaten angefasst.
begin;
create or replace function public.save_character(p_id uuid, p_expected_version int, p_data jsonb)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v int; d jsonb; sl smallint;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  if not public.is_verified(uid) then raise exception 'email_not_verified' using errcode = 'PT403'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data = '{}'::jsonb then raise exception 'invalid_data' using errcode = '22023'; end if;
  d := jsonb_set(p_data, '{cid}', to_jsonb(p_id::text));
  select slot_number into sl from public.characters where character_id = p_id and account_id = uid for update;
  if sl is null then
    -- gleiche Meldung für "fremd/nicht vorhanden" und "falsche Version": verrät nichts über fremde Charaktere
    raise exception 'version_conflict' using errcode = 'PT409';
  end if;
  if sl = 3 and not public.has_entitlement(uid, 'third_character_slot') then
    raise exception 'character_locked' using errcode = 'PT403';   -- ohne gültige Berechtigung gesperrt, Daten bleiben unverändert
  end if;
  update public.characters c
     set character_data = d, character_class = public.safe_class(d), level = public.safe_level(d),
         version = c.version + 1, updated_at = now(), last_played = now()
   where c.character_id = p_id and c.account_id = uid and c.version = p_expected_version
   returning c.version into v;
  if v is null then raise exception 'version_conflict' using errcode = 'PT409'; end if;
  return v;
end $$;
create or replace function public.move_character(p_id uuid, p_target int) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); cur smallint; v int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  if not public.is_verified(uid) then raise exception 'email_not_verified' using errcode = 'PT403'; end if;
  if p_target is null or p_target not in (1, 2) then raise exception 'invalid_slot' using errcode = '22023'; end if;
  select slot_number into cur from public.characters where character_id = p_id and account_id = uid for update;
  if cur is null then raise exception 'not_found' using errcode = 'PT404'; end if;
  if cur <> 3 then raise exception 'move_not_allowed' using errcode = '22023'; end if;
  perform set_config('ruinwalk.allow_move', '1', true);
  begin
    update public.characters set slot_number = p_target, version = version + 1, updated_at = now()
     where character_id = p_id and account_id = uid returning version into v;
  exception when unique_violation then
    perform set_config('ruinwalk.allow_move', '', true);
    raise exception 'slot_occupied' using errcode = 'PT409';
  end;
  perform set_config('ruinwalk.allow_move', '', true);
  insert into public.audit_log(account_id, character_id, action, detail) values (uid, p_id, 'character_moved', jsonb_build_object('from', 3, 'to', p_target));
  return v;
end $$;
revoke all on function public.save_character(uuid,int,jsonb) from public, anon;
grant execute on function public.save_character(uuid,int,jsonb) to authenticated;
revoke all on function public.move_character(uuid,int) from public, anon;
grant execute on function public.move_character(uuid,int) to authenticated;
commit;

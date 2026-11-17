-- Instanzkampf, Produktionssicherheit Phase 1: Spieleridentität und Datenbankzugriffe.
-- Voraussetzungen (nicht Teil dieser Datei): supabase/schema.sql (public.characters, public.account_entitlements, auth.uid(), Rollen anon/authenticated/service_role)
-- und 01_proto.sql … 04_gruppe.sql. NICHT in der reinen Prototyp-Testdatenbank (ohne public/auth) ausführen.
--
-- Prinzipien
--  1. Spieleridentität = authentifizierte Sitzung: auth.uid() -> public.characters (account_id = auth.uid()). Der Spielerschlüssel im Schema rwi ist
--     public.characters.character_id::text. Ein Client darf nie einen fremden Spieler angeben; ein Charakterparameter wird nur angenommen, wenn der Charakter
--     dem aufrufenden Konto gehört (und nicht gesperrt ist: Platz 3 nur mit aktiver Berechtigung, wie in der RLS-Richtlinie char_own_read).
--  2. Clients (anon/authenticated) haben KEINEN Zugriff auf das Schema rwi (weder USAGE noch Tabellen noch Funktionen). Sie erreichen die Gruppenfunktionen
--     nur über die SECURITY-DEFINER-Wrapper unten (Schema public, fester search_path, EXECUTE nur für authenticated).
--  3. Jede Funktion im Schema rwi ist ausdrücklich klassifiziert (server | test | trigger | intern). Eine neue, nicht klassifizierte Funktion bricht diese Datei
--     und den Test produktion.mjs ab. Nichts hängt an Standardrechten (PUBLIC-Standard-EXECUTE, Supabase-Standardrechte) – alles wird ausdrücklich entzogen.

------------------------------------------------------------------------------------------------
-- Identität (intern, nur von den Wrappern aufgerufen)
------------------------------------------------------------------------------------------------
-- Liefert den Spielerschlüssel des aufrufenden Kontos. Mit p_character: Eigentum prüfen. Ohne: den eigenen Charakter aus der Mitgliedschaft/Warteliste der Instanz ableiten.
create function rwi.own_character(p_character uuid, p_instance bigint default null) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int; k text; pass int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  if p_character is not null then
    if not exists (select 1 from public.characters c where c.character_id = p_character and c.account_id = uid
                   and (c.slot_number <> 3 or exists (select 1 from public.account_entitlements e where e.account_id = uid and e.entitlement_type = 'third_character_slot' and e.status = 'active')))
    then raise exception 'forbidden' using errcode = 'PT403'; end if;      -- fremder, unbekannter oder gesperrter Charakter: gleiche Antwort
    return p_character::text;
  end if;
  if p_instance is null then raise exception 'character_required' using errcode = 'PT400'; end if;
  -- zuerst nur aktive Teilnahmen (Mitglied aktiv / auf der Warteliste), erst ohne solche auch beendete (damit ein Ausgeschiedener seinen eigenen Status sehen kann)
  for pass in 1..2 loop
    select count(*), min(x.player) into n, k from (
      select distinct a.player from (select player from rwi.members where instance_id = p_instance and (pass = 2 or mstate = 'active')
                                     union all select player from rwi.waitlist where instance_id = p_instance and (pass = 2 or status = 'waiting')) a
      where a.player in (select c.character_id::text from public.characters c where c.account_id = uid
                         and (c.slot_number <> 3 or exists (select 1 from public.account_entitlements e where e.account_id = uid and e.entitlement_type = 'third_character_slot' and e.status = 'active')))
    ) x;
    exit when n > 0;
  end loop;
  if n = 0 then raise exception 'forbidden' using errcode = 'PT403'; end if;   -- nicht deine Instanz und „gibt es nicht“ sind nicht unterscheidbar
  if n > 1 then raise exception 'ambiguous_character' using errcode = 'PT409'; end if;
  return k;
end $$;

------------------------------------------------------------------------------------------------
-- Client-Wrapper (Schema public, nur authenticated)
------------------------------------------------------------------------------------------------
create function public.group_join(p_instance bigint, p_character uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin return rwi.join(p_instance, rwi.own_character(p_character)); end $$;

create function public.group_leave(p_instance bigint, p_character uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin return rwi.leave(p_instance, rwi.own_character(p_character, p_instance)); end $$;

create function public.group_ready(p_instance bigint, p_character uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin return rwi.set_ready(p_instance, rwi.own_character(p_character, p_instance)); end $$;

-- Herzschlag und Wiederverbindung (Serverzeit, Identität aus der Sitzung)
create function public.group_heartbeat(p_instance bigint, p_character uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin return rwi.heartbeat_for(p_instance, rwi.own_character(p_character, p_instance)); end $$;

create function public.group_view(p_instance bigint, p_known_version bigint default null, p_character uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin return rwi.instance_view(p_instance, rwi.own_character(p_character, p_instance), p_known_version); end $$;

create function public.group_action(p_fight bigint, p_round int, p_action jsonb, p_character uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare iid bigint;
begin
  select instance_id into iid from rwi.fights where id = p_fight;
  if iid is null then raise exception 'forbidden' using errcode = 'PT403'; end if;
  return rwi.submit_action_for(rwi.own_character(p_character, iid), p_fight, p_round, p_action);
end $$;

create function public.group_revive_use(p_fight bigint, p_character uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare iid bigint; me text; k text;
begin
  select instance_id into iid from rwi.fights where id = p_fight;
  if iid is null then raise exception 'forbidden' using errcode = 'PT403'; end if;
  me := rwi.own_character(p_character, iid);
  select key into k from rwi.members where instance_id = iid and player = me and mstate = 'active';
  if k is null then raise exception 'forbidden' using errcode = 'PT403'; end if;
  return rwi.use_revive_item(p_fight, k);
end $$;

create function public.group_revive_decline(p_fight bigint, p_character uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare iid bigint; me text; k text;
begin
  select instance_id into iid from rwi.fights where id = p_fight;
  if iid is null then raise exception 'forbidden' using errcode = 'PT403'; end if;
  me := rwi.own_character(p_character, iid);
  select key into k from rwi.members where instance_id = iid and player = me and mstate = 'active';
  if k is null then raise exception 'forbidden' using errcode = 'PT403'; end if;
  return rwi.decline_revive_item(p_fight, k);
end $$;

------------------------------------------------------------------------------------------------
-- Charakter oder Konto gelöscht: Instanzdaten bereinigen (Integration mit public.characters)
------------------------------------------------------------------------------------------------
-- Das Schema rwi hat keinen Fremdschlüssel auf public.characters (Spielerschlüssel = character_id::text). Ohne diesen Trigger blieben nach dem Löschen eines
-- Charakters (delete_character) oder Kontos (delete_account, Kaskade) ein aktives Mitglied ohne Charakter in laufenden Instanzen und die Profilzeile in
-- rwi.players zurück. Regel: Löschen = freiwilliger Austritt über die bestehende Funktion rwi.leave (keine neue Spielregel), danach wird das Profil entfernt.
-- Das Löschen selbst scheitert nie am Spielstand (Kontolöschung darf nicht blockiert werden); ein Fehler beim Austritt wird in rwi.ops_alerts protokolliert.
-- Mitglieds-, Kampf- und Belohnungszeilen bleiben als Verlauf erhalten; sie enthalten nur die nicht mehr zuordenbare Charakter-ID.
create function rwi.on_character_deleted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text := old.character_id::text; r record;
begin
  for r in select i.id from rwi.instances i
            where i.status = 'active'
              and (exists (select 1 from rwi.members m where m.instance_id = i.id and m.player = k and m.mstate = 'active')
                   or exists (select 1 from rwi.waitlist w where w.instance_id = i.id and w.player = k and w.status = 'waiting'))
            order by i.id loop
    begin
      perform rwi.leave(r.id, k);
    exception when others then
      insert into rwi.ops_alerts(what, detail) values ('char_cleanup_failed', 'instance ' || r.id || ': ' || sqlstate);
    end;
  end loop;
  delete from rwi.players where player = k;
  return old;
end $$;
create trigger characters_rwi_cleanup after delete on public.characters for each row execute function rwi.on_character_deleted();

------------------------------------------------------------------------------------------------
-- Rechte: ausdrücklich, nachvollziehbar, ohne Standardrechte
------------------------------------------------------------------------------------------------
do $$
declare
  server_fns   text[] := array['cfg','sweep_event','end_instance','claim_resolution','commit_round','advance_clock','effective_last_seen','permanently_disconnected','sync_windows','wipe_hold',
                               'watchdog_tick','watchdog_core','eligible','glog','active_count','abort_instance','drop_member','after_auto_removal','deadline_verdict','enforce_deadlines',
                               'enforce_deadlines_quiet','promote_waitlist','create_group','roster','start_fight','contribution','set_connection','set_connection_core','group_tick','sweep_core','sweep_events'];
  test_fns     text[] := array['join','leave','set_ready','submit_action','submit_action_for','instance_view','heartbeat','heartbeat_for','use_revive_item','decline_revive_item','current_player'];
  trigger_fns  text[] := array['members_size_guard','on_fight_end','reward_filter','on_character_deleted'];
  internal_fns text[] := array['own_character'];
  r record; t record;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'rwi' loop
    if (r.proname = any(server_fns))::int + (r.proname = any(test_fns))::int + (r.proname = any(trigger_fns))::int + (r.proname = any(internal_fns))::int <> 1 then
      raise exception 'rwi.% ist nicht (eindeutig) klassifiziert – in 05_produktion.sql einordnen', r.proname;
    end if;
  end loop;

  -- 1. Alles entziehen (PUBLIC, anon, authenticated, service_role), dann ausdrücklich vergeben
  revoke all on schema rwi from public, anon, authenticated;
  revoke all on all tables    in schema rwi from public, anon, authenticated;
  revoke all on all sequences in schema rwi from public, anon, authenticated;
  revoke all on all functions in schema rwi from public, anon, authenticated, service_role;
  alter default privileges in schema rwi revoke all on tables    from public, anon, authenticated;
  alter default privileges in schema rwi revoke all on sequences from public, anon, authenticated;
  alter default privileges in schema rwi revoke all on functions from public, anon, authenticated;

  -- 2. service_role (Worker / Edge Function / Zeitgeber): Schema, Tabellen und nur die Serverfunktionen. Testfunktionen mit Spielerparameter bleiben auch ihm verschlossen.
  grant usage on schema rwi to service_role;
  grant select, insert, update, delete on all tables in schema rwi to service_role;
  grant usage, select on all sequences in schema rwi to service_role;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'rwi' and p.proname = any(server_fns) loop
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;

  -- 3. zweite Schicht: Row Level Security auf allen rwi-Tabellen ohne Richtlinie (Clients sehen und ändern nichts, selbst wenn je ein Tabellenrecht versehentlich vergeben würde)
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'rwi' and c.relkind in ('r','p') loop
    execute format('alter table rwi.%I enable row level security', t.relname);
  end loop;
end $$;

-- 4. Client-Wrapper: nur authenticated (anon nie), alle übrigen public-Standardrechte entziehen
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('group_join','group_leave','group_ready','group_heartbeat','group_view','group_action','group_revive_use','group_revive_decline') loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

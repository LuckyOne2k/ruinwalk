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
-- Konto je Charakter (Hook für die Account-Eindeutigkeit je Instanz, siehe 04_gruppe.sql)
------------------------------------------------------------------------------------------------
-- Spielerschlüssel = character_id::text. Kein Treffer (kein Charakter, kein UUID-Format) -> null -> keine Kontoprüfung; produktive Mitglieder kommen immer über own_character (echter Charakter).
create or replace function rwi.account_of(p_player text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select c.account_id from public.characters c
   where c.character_id = (case when p_player ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_player::uuid end) $$;

------------------------------------------------------------------------------------------------
-- Charakter oder Konto gelöscht: Instanzdaten bereinigen (Integration mit public.characters)
------------------------------------------------------------------------------------------------
-- Das Schema rwi hat keinen Fremdschlüssel auf public.characters (Spielerschlüssel = character_id::text). Ohne diesen Trigger blieben nach dem Löschen eines
-- Charakters (delete_character) oder Kontos (delete_account, Kaskade auth.users -> profiles -> characters) ein aktives Mitglied ohne Charakter in laufenden Instanzen
-- und die Profilzeile in rwi.players zurück.
-- Regel: Löschen = freiwilliger Austritt über die bestehende Funktion rwi.leave (keine neue Spielregel), danach wird das Profil entfernt.
-- Reihenfolge/Verfügbarkeit (getestet in loesch-trigger.mjs): Der Trigger läuft NACH dem Löschen der Zeile (AFTER DELETE, je Charakter) und benutzt ausschließlich OLD.character_id.
--   Bei der Kontolöschung sind Konto, Profil und der gerade gelöschte Charakter zu diesem Zeitpunkt bereits nicht mehr sichtbar; rwi.leave liest public.characters nicht.
-- Sperrreihenfolge: Instanzzeilen werden immer aufsteigend nach ID gesperrt (hier je Charakter; bei der Kontolöschung vorab für alle Instanzen des Kontos durch
--   rwi.on_profile_deleting) – damit können zwei gleichzeitige Löschungen/Rundenauflösungen sich nicht gegenseitig verklemmen (Deadlock).
-- Fehlerbehandlung in zwei Stufen, nie ein stilles Geistermitglied:
--   Stufe 1: rwi.leave. Schlägt es fehl (Teiltransaktion wird zurückgerollt), Stufe 2: minimale Bereinigung ohne Spiellogik (Wartelisteneintrag stornieren, Mitglied als
--   'left'/'freiwillig' mit denselben Endzuständen wie rwi.drop_member, ausstehende Beute entfällt), Eintrag 'char_cleanup_failed' in rwi.ops_alerts, danach Versuch der Folgeprüfung (Mindestgröße/Abbruch/Nachrücken).
--   Schlägt auch Stufe 2 fehl, wird der Fehler weitergereicht: das GESAMTE Löschen (Charakter bzw. Konto) wird zurückgerollt und bleibt konsistent wiederholbar.
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
      -- Stufe 2 (ein Fehler hier läuft aus dem Trigger hinaus und rollt das ganze Löschen zurück)
      perform 1 from rwi.instances where id = r.id for update;
      update rwi.waitlist set status = 'cancelled' where instance_id = r.id and player = k and status = 'waiting';
      update rwi.members set mstate = 'left', leave_reason = 'freiwillig', left_at = clock_timestamp(), connected = false, ready_due = null, disc_since = null     -- gleiche Endzustände wie rwi.drop_member(..., 'freiwillig')
       where instance_id = r.id and player = k and mstate = 'active';
      update rwi.entitlements set void = true, reason = 'freiwilliger Austritt' where instance_id = r.id and player = k and kind = 'beute' and not void;
      insert into rwi.ops_alerts(what, detail) values ('char_cleanup_failed', 'instance ' || r.id || ': ' || sqlstate);
      begin
        perform rwi.after_auto_removal(r.id);                                    -- Mindestgröße/Abbruch/Nachrücken, soweit möglich
      exception when others then
        insert into rwi.ops_alerts(what, detail) values ('char_cleanup_incomplete', 'instance ' || r.id || ': ' || sqlstate);
      end;
    end;
  end loop;
  delete from rwi.players where player = k;
  return old;
end $$;
create trigger characters_rwi_cleanup after delete on public.characters for each row execute function rwi.on_character_deleted();

-- Kontolöschung: vor der Kaskade auf die Charaktere alle aktiven Instanzen des Kontos in aufsteigender ID sperren (einheitliche Sperrreihenfolge), danach das Konto aus den
-- Mitglieds-/Wartelistenzeilen entfernen (personenbezogene Kennung; die Zeilen bleiben als anonymer Verlauf). Beim Löschen NUR eines Charakters bleibt die Kontozuordnung bestehen
-- (die Instanz bleibt „ein Charakter je Account“, auch wenn der Charakter ausgetreten/gelöscht ist).
create function rwi.on_profile_deleting() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from rwi.instances i
   where i.status = 'active' and i.id in (select m.instance_id from rwi.members m where m.account = old.account_id and m.mstate = 'active'
                                          union select w.instance_id from rwi.waitlist w where w.account = old.account_id and w.status = 'waiting')
   order by i.id for update;
  return old;
end $$;
create function rwi.on_profile_deleted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update rwi.members set account = null where account = old.account_id;
  update rwi.waitlist set account = null where account = old.account_id;
  return old;
end $$;
create trigger profiles_rwi_lock    before delete on public.profiles for each row execute function rwi.on_profile_deleting();
create trigger profiles_rwi_cleanup after  delete on public.profiles for each row execute function rwi.on_profile_deleted();

------------------------------------------------------------------------------------------------
-- Worker-Schnittstelle A1: schmale, ausschließlich serverseitig ausführbare Wrapper im Schema public (siehe docs/WORKER_A1_SCHNITTSTELLE.md)
------------------------------------------------------------------------------------------------
-- Zweck: Das Schema rwi ist über die Supabase Data API NICHT erreichbar (und bleibt es). Ein Worker/eine Edge Function mit service_role ruft stattdessen genau diese Wrapper per RPC.
-- Je Wrapper: eine eng begrenzte Aufgabe, genau eine rwi-Funktion, SECURITY INVOKER (läuft mit den Rechten von service_role – keine Rechteausweitung), fester search_path (pg_catalog, pg_temp),
-- Eingaben vollständig geprüft (Typ, Wertebereich, Länge/Größe, Format; Verstoß = Fehler PT400 ohne Datenbankänderung), Rückgabe nur die für den Aufrufer nötigen Felder.
-- EXECUTE: nur service_role (Rechte-Block unten). anon, authenticated und PUBLIC haben keinen Zugriff.
create function public.rw_worker_tick() returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare w jsonb;
begin
  w := rwi.watchdog_tick();
  return jsonb_build_object('due', w->'due', 'redispatch', w->'redispatch', 'start', coalesce(w->'group'->'start', '[]'::jsonb), 'stuck_new', w->'stuck_new', 'stuck_open', w->'stuck_open');
end $$;

create function public.rw_worker_rounds(p_fights bigint[]) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if p_fights is null or cardinality(p_fights) not between 1 and 100 or array_position(p_fights, null) is not null or exists (select 1 from unnest(p_fights) x where x < 1) then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  return rwi.fight_rounds(p_fights);
end $$;

create function public.rw_worker_claim(p_fight bigint, p_round int) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare r jsonb;
begin
  if p_fight is null or p_fight < 1 or p_round is null or p_round not between 1 and 100000 then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  r := rwi.claim_resolution(p_fight, p_round);
  if r->>'status' <> 'ok' then return jsonb_build_object('status', r->>'status'); end if;                   -- ohne Zuteilung nichts weiter preisgeben
  return jsonb_build_object('status', 'ok', 'token', r->'token', 'round_version', r->'round_version', 'input', r->'input', 'input_hash', r->'input_hash');
end $$;

create function public.rw_worker_commit(p_fight bigint, p_round int, p_token uuid, p_version int, p_input_hash text, p_engine text, p_result jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare r jsonb;
begin
  if p_fight is null or p_fight < 1 or p_round is null or p_round not between 1 and 100000 or p_token is null or p_version is null or p_version not between 0 and 1000000
     or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$' or p_engine is null or p_engine !~ '^[A-Za-z0-9._+-]{1,64}$'
     or p_result is null or jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text) > 262144 then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  r := rwi.commit_round(p_fight, p_round, p_token, p_version, p_input_hash, p_engine, p_result);
  return jsonb_build_object('status', r->>'status', 'outcome', r->'outcome', 'reason', r->'reason');
end $$;

create function public.rw_worker_report_failure(p_fight bigint, p_round int, p_token uuid, p_error text) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare r jsonb;
begin
  if p_fight is null or p_fight < 1 or p_round is null or p_round not between 1 and 100000 or p_token is null or p_error is null or length(p_error) > 2000 then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  r := rwi.report_failure(p_fight, p_round, p_token, p_error);
  return jsonb_build_object('status', r->>'status', 'attempts', r->'attempts', 'retry_in', r->'retry_in');
end $$;

create function public.rw_worker_roster(p_instance bigint) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if p_instance is null or p_instance < 1 then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  return rwi.roster(p_instance);
end $$;

create function public.rw_worker_start_fight(p_instance bigint, p_state jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare r jsonb;
begin
  if p_instance is null or p_instance < 1 or p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 262144 then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  r := rwi.start_fight(p_instance, p_state);
  return jsonb_build_object('status', r->>'status', 'fight', r->'fight', 'fight_no', r->'fight_no');
end $$;

-- Betrieb (Alarmierung und kontrollierte Wiederaufnahme, siehe docs/STUCK_ABLAUF.md): ebenfalls nur service_role
create function public.rw_ops_stuck_list() returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin return rwi.stuck_overview(); end $$;

create function public.rw_ops_resume(p_fight bigint, p_round int, p_operator text, p_note text) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if p_fight is null or p_fight < 1 or p_round is null or p_round not between 1 and 100000 or p_operator is null or length(p_operator) > 200 or p_note is null or length(p_note) > 4000 then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  return rwi.resume_stuck(p_fight, p_round, p_operator, p_note);
end $$;

create function public.rw_ops_terminate(p_fight bigint, p_operator text, p_note text) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if p_fight is null or p_fight < 1 or p_operator is null or length(p_operator) > 200 or p_note is null or length(p_note) > 4000 then raise exception 'invalid_input' using errcode = 'PT400'; end if;
  return rwi.terminate_stuck(p_fight, p_operator, p_note);
end $$;

------------------------------------------------------------------------------------------------
-- Rechte: ausdrücklich, nachvollziehbar, ohne Standardrechte
------------------------------------------------------------------------------------------------
do $$
declare
  server_fns   text[] := array['cfg','sweep_event','end_instance','claim_resolution','commit_round','advance_clock','effective_last_seen','permanently_disconnected','sync_windows','wipe_hold',
                               'watchdog_tick','watchdog_core','eligible','glog','active_count','abort_instance','drop_member','after_auto_removal','deadline_verdict','enforce_deadlines',
                               'enforce_deadlines_quiet','promote_waitlist','create_group','roster','start_fight','contribution','set_connection','set_connection_core','group_tick','sweep_core','sweep_events','report_failure','account_conflict','account_of','raise_stuck','close_stuck','resume_stuck','terminate_stuck','stuck_overview','fight_rounds'];
  test_fns     text[] := array['join','leave','set_ready','submit_action','submit_action_for','instance_view','heartbeat','heartbeat_for','use_revive_item','decline_revive_item','current_player'];
  trigger_fns  text[] := array['members_size_guard','on_fight_end','reward_filter','on_character_deleted','account_guard','on_profile_deleting','on_profile_deleted'];
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

-- 5. Worker-/Betriebs-Wrapper (A1): nur service_role (anon, authenticated und PUBLIC ausdrücklich nicht); alles andere in public bleibt wie in schema.sql
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('rw_worker_tick','rw_worker_rounds','rw_worker_claim','rw_worker_commit','rw_worker_report_failure','rw_worker_roster','rw_worker_start_fight','rw_ops_stuck_list','rw_ops_resume','rw_ops_terminate') loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

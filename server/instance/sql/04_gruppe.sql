-- Phase 1: Gruppenverwaltung (Beitritt, Warteliste, Nachrücken, Bereitschaft, Austritt, Entfernung) und instance_view. Schema rwi, nur Testdaten.
-- Setzt 01_proto.sql, 02_actions.sql und 03_windows.sql voraus.
alter table rwi.instances add column kind text not null default 'dungeon' check (kind in ('dungeon','special','weltboss')),   -- dungeon = normales Gruppendungeon, special = besonderes Dungeon (z. B. Verschlinger)
  add column stage text not null default 'fight' check (stage in ('ready','fight','done')),     -- ready = Bereitschaftsphase (auch vor dem ersten Kampf)
  add column min_size int not null default 2, add column max_size int not null default 4 check (max_size between 1 and 8),
  add column fights_total int not null default 1, add column fight_no int not null default 0, add column outcome text;
alter table rwi.members add column player text,
  add column mstate text not null default 'active' check (mstate in ('active','left','removed')),
  add column leave_reason text check (leave_reason in ('freiwillig','abwesenheit','bereitschaft')), add column left_at timestamptz,
  add column joined_after_fights int not null default 0, add column ready boolean not null default false, add column ready_at timestamptz,
  add column ready_due timestamptz, add column disc_since timestamptz, add column potions int not null default 3;
-- Verbindliche Größen je Typ, nicht durch Parameter änderbar: normales Dungeon 2-4, besonderes Dungeon und Weltboss 6-8
alter table rwi.instances add constraint instances_size_rule check (
  min_size = case kind when 'dungeon' then 2 else 6 end and max_size = case kind when 'dungeon' then 4 else 8 end);
-- Wächter auf Tabellenebene: mehr aktive Spieler als max_size sind nie möglich, egal über welche Funktion oder welchen direkten Aufruf sie angelegt werden
create function rwi.members_size_guard() returns trigger language plpgsql as $$
declare mx int; n int;
begin
  if new.player is null or new.mstate <> 'active' then return null; end if;
  select max_size into mx from rwi.instances where id = new.instance_id;
  select count(*) into n from rwi.members where instance_id = new.instance_id and mstate = 'active' and player is not null;
  if n > mx then raise exception 'Gruppe voll: % aktive Spieler, Höchstgröße %', n, mx using errcode = 'check_violation'; end if;
  return null;
end $$;
create constraint trigger members_size_guard after insert or update of mstate, player on rwi.members for each row execute function rwi.members_size_guard();
-- Weltboss: genau ein Kampf, Event und absolute Endzeit sind Pflicht. Damit gilt kind = 'weltboss' => fights_total = 1 (Einkampf-Regel in join braucht nur fights_total).
alter table rwi.instances add constraint instances_weltboss_rule check (kind <> 'weltboss' or (fights_total = 1 and event_id is not null and ends_at is not null));
-- Endzustand nach Eventende ist unteilbar: status, stage und outcome gehören zusammen (kein Zwischenzustand, auch nicht durch direkte Aktualisierung)
alter table rwi.instances add constraint instances_event_end_state check ((status = 'event_ended') = coalesce(outcome = 'event_ended', false) and (status <> 'event_ended' or stage = 'done'));
alter table rwi.instances add column created_at timestamptz;      -- nur von create_group gesetzt (Zeitpunkt der Prüfung gegen das Eventende)
create unique index members_player_uq on rwi.members (instance_id, player) where player is not null;       -- höchstens eine Mitgliedschaft je Spieler und Instanz (kein Wiederbeitritt)
insert into rwi.cfg values ('ready_seconds', 60), ('absence_seconds', 300), ('contribution_min', 1);   -- contribution_min: PLATZHALTER (Balance): Mindestzahl ausgeführter Aktionen im letzten Kampf

-- Testcharakter-Quelle: der Server leitet das Kampfprofil nur hieraus ab, nie aus Clientangaben (Bericht, Abschnitt B/L)
create table rwi.players (player text primary key, lv int not null, grundklasse text, pfad text, tier int not null default 0);
create table rwi.waitlist (id bigint generated always as identity primary key, instance_id bigint not null references rwi.instances, player text not null, queued_at timestamptz not null default clock_timestamp(),
  status text not null default 'waiting' check (status in ('waiting','admitted','cancelled')));
create unique index waitlist_uq on rwi.waitlist (instance_id, player) where status = 'waiting';
create table rwi.entitlements (instance_id bigint not null, player text not null, fight_no int not null, kind text not null check (kind in ('kampf_ep','beute')),
  void boolean not null default false, reason text, at timestamptz not null default clock_timestamp(), primary key (instance_id, player, fight_no, kind));
create table rwi.group_log (id bigint generated always as identity primary key, instance_id bigint not null, at timestamptz not null default clock_timestamp(), player text, event text not null, detail text);

create function rwi.eligible(p_player text) returns boolean language sql stable as $$
  select exists (select 1 from rwi.players where player = p_player and lv >= 5 and grundklasse is not null) $$;          -- Instanzzugang erst ab Level 5 mit Grundklasse
create function rwi.glog(p_instance bigint, p_player text, p_event text, p_detail text default null) returns void language sql as $$
  insert into rwi.group_log(instance_id, player, event, detail) values (p_instance, p_player, p_event, p_detail) $$;
create function rwi.active_count(p_instance bigint) returns int language sql stable as $$ select count(*)::int from rwi.members where instance_id = p_instance and mstate = 'active' $$;

-- Instanz abbrechen (Pausenbudget, Mindestgröße nach automatischer Entfernung): keine Belohnung, Fenster und Aufträge enden
create function rwi.abort_instance(p_instance bigint, p_why text) returns void language plpgsql as $$
begin
  update rwi.instances set status = 'aborted', stage = 'done', outcome = 'aborted', engine_stuck = false where id = p_instance and status in ('active','frozen');
  with f as (update rwi.fights set status = 'technical_end', phase = 'done', claim_token = null, lease_until = null where instance_id = p_instance and status = 'active' returning id)
    update rwi.resolve_jobs set status = 'cancelled' where fight_id in (select id from f) and status in ('pending','claimed','stuck');
  update rwi.death_windows set status = 'closed', closed_reason = 'fight_end' where status = 'open' and fight_id in (select id from rwi.fights where instance_id = p_instance);
  update rwi.waitlist set status = 'cancelled' where instance_id = p_instance and status = 'waiting';
  perform rwi.glog(p_instance, null, 'abbruch', p_why);
end $$;

-- Mitglied scheidet aus (intern, Instanzzeile ist gesperrt). Ursache wird festgehalten. Bereits gutgeschriebene Kampf-EP bleiben immer.
create function rwi.drop_member(p_instance bigint, p_player text, p_reason text) returns boolean language plpgsql as $$
declare n int;
begin
  update rwi.members set mstate = case when p_reason = 'freiwillig' then 'left' else 'removed' end, leave_reason = p_reason, left_at = clock_timestamp(),
    connected = false, ready_due = null, disc_since = null where instance_id = p_instance and player = p_player and mstate = 'active';
  get diagnostics n = row_count; if n = 0 then return false; end if;
  if p_reason = 'freiwillig' then                                                           -- freiwillig: noch ausstehende Beute aus abgeschlossenen Kämpfen entfällt; bei automatischer Entfernung bleibt sie
    update rwi.entitlements set void = true, reason = 'freiwilliger Austritt' where instance_id = p_instance and player = p_player and kind = 'beute' and not void;
  end if;
  perform rwi.glog(p_instance, p_player, 'ausgeschieden', p_reason);
  return true;
end $$;

-- Warteliste -> Mitglieder, nur in der Bereitschaftsphase, der Reihe nach, höchstens bis zur Höchstgröße
-- Nach einer automatischen Entfernung: Mindestgröße prüfen (Abbruch) oder frei gewordene Plätze füllen. Instanzzeile ist gesperrt.
create function rwi.after_auto_removal(p_instance bigint) returns boolean language plpgsql as $$
declare i rwi.instances;
begin
  select * into i from rwi.instances where id = p_instance;
  if rwi.active_count(p_instance) = 0 or rwi.active_count(p_instance) < i.min_size then perform rwi.abort_instance(p_instance, 'Mindestgröße unterschritten'); return true; end if;
  if i.stage = 'ready' then perform rwi.promote_waitlist(p_instance); end if;
  return false;
end $$;

-- Gemeinsame Fristenentscheidung (einzige Stelle der Fristenregeln): gibt die Entfernungsursache oder null zurück, ändert nichts.
-- t = clock_timestamp() nach der Instanzsperre. Störungsfenster zählen nicht als Abwesenheit; Abwesenheit läuft in jeder Phase, auch bei Gruppenpause.
create function rwi.deadline_verdict(p_instance bigint, p_player text, t timestamptz) returns text language plpgsql stable as $$
declare m rwi.members; i rwi.instances; gap timestamptz;
begin
  select * into m from rwi.members where instance_id = p_instance and player = p_player and mstate = 'active';
  if not found then return null; end if;
  select * into i from rwi.instances where id = p_instance;
  if i.status <> 'active' or i.stage = 'done' then return null; end if;                                    -- beendete Instanz (Eventende, Abbruch, Abschluss): keine Fristen, keine Entfernungen mehr
  select coalesce(max(to_at), '-infinity') into gap from rwi.system_gaps;
  if m.disc_since is not null and t - greatest(m.disc_since, gap) >= make_interval(secs => rwi.cfg('absence_seconds')) then return 'abwesenheit'; end if;
  if i.stage = 'ready' and not m.ready and m.ready_due is not null and m.ready_due <= t then return 'bereitschaft'; end if;
  return null;
end $$;

-- Wege der Durchsetzung (beide nur dünne Hüllen um deadline_verdict):
-- enforce_deadlines (Clientweg: set_ready, Wiederverbindung, Heartbeat): entfernt sofort und wertet danach Mindestgröße/Nachrücken aus.
create function rwi.enforce_deadlines(p_instance bigint, p_player text, t timestamptz) returns text language plpgsql as $$
declare why text;
begin
  why := rwi.deadline_verdict(p_instance, p_player, t);
  if why is null then return null; end if;
  perform rwi.drop_member(p_instance, p_player, why);
  perform rwi.after_auto_removal(p_instance);
  return why;
end $$;

-- enforce_deadlines_quiet (Workerweg: group_tick): entfernt, wertet aber erst nach allen Entfernungen einer Instanz einmal aus.
create function rwi.enforce_deadlines_quiet(p_instance bigint, p_player text, t timestamptz) returns text language plpgsql as $$
declare why text;
begin
  why := rwi.deadline_verdict(p_instance, p_player, t);
  if why is null then return null; end if;
  perform rwi.drop_member(p_instance, p_player, why);
  return why;
end $$;

create function rwi.current_player() returns text language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), ''), '') $$;   -- authentifizierte Sitzung (wie auth.uid())

create function rwi.promote_waitlist(p_instance bigint) returns int language plpgsql as $$
declare i rwi.instances; w rwi.waitlist; n int := 0; t timestamptz := clock_timestamp();
begin
  select * into i from rwi.instances where id = p_instance;
  if i.status <> 'active' or i.stage <> 'ready' then return 0; end if;
  for w in select * from rwi.waitlist where instance_id = p_instance and status = 'waiting' order by id loop
    exit when rwi.active_count(p_instance) >= i.max_size;
    if not rwi.eligible(w.player) or exists (select 1 from rwi.members where instance_id = p_instance and player = w.player) then
      update rwi.waitlist set status = 'cancelled' where id = w.id; continue; end if;
    insert into rwi.members(instance_id, player, key, last_seen_at, ready_due, joined_after_fights, potions)
      values (p_instance, w.player, w.player, t, t + make_interval(secs => rwi.cfg('ready_seconds')), i.fight_no, 3);       -- drei eigene Heiltränke, 60 s Bereitschaft ab Beitritt
    update rwi.waitlist set status = 'admitted' where id = w.id; n := n + 1; perform rwi.glog(p_instance, w.player, 'nachgerueckt', 'nach Kampf ' || i.fight_no);
  end loop;
  return n;
end $$;

create function rwi.create_group(p_kind text, p_players text[], p_fights_total int, p_event bigint default null, p_ends_at timestamptz default null) returns jsonb language plpgsql as $$
declare iid bigint; pl text; t timestamptz := clock_timestamp(); mn int; mx int; n int := coalesce(array_length(p_players, 1), 0);
begin
  if p_kind not in ('dungeon','special','weltboss') then return jsonb_build_object('status','bad_kind'); end if;
  mn := case p_kind when 'dungeon' then 2 else 6 end; mx := case p_kind when 'dungeon' then 4 else 8 end;      -- verbindliche Größen, kein Parameter
  if p_kind = 'dungeon' and coalesce(p_fights_total, 0) < 2 then return jsonb_build_object('status','single_fight_dungeon'); end if;       -- normale Ein-Kampf-Dungeons sind nicht vorgesehen
  if p_kind = 'special' and coalesce(p_fights_total, 0) < 1 then return jsonb_build_object('status','bad_fights'); end if;
  if p_kind = 'weltboss' and (p_fights_total is distinct from 1 or p_event is null or p_ends_at is null) then return jsonb_build_object('status','bad_weltboss'); end if;
  if p_kind <> 'weltboss' and (p_event is not null or p_ends_at is not null) then return jsonb_build_object('status','bad_weltboss'); end if;
  if n < mn or n > mx then return jsonb_build_object('status','bad_size','min',mn,'max',mx); end if;
  if (select count(distinct x) from unnest(p_players) x) <> n then return jsonb_build_object('status','duplicate'); end if;
  foreach pl in array p_players loop if not rwi.eligible(pl) then return jsonb_build_object('status','not_eligible','player',pl); end if; end loop;
  if p_event is not null then                                                                    -- K.2 Regel 4d: nie eine Instanz für ein abgelaufenes Event
    perform pg_advisory_xact_lock(7001, hashtext(p_event::text));                                  -- Anlage je Event nacheinander: Prüfung und Einfügen sehen denselben Stand
    t := clock_timestamp();                                                                      -- Datenbankzeit erst nach der Sperre, unmittelbar vor dem Einfügen
    if exists (select 1 from rwi.instances where event_id = p_event and (status = 'event_ended' or ends_at <= t)) or t >= p_ends_at then return jsonb_build_object('status','event_ended'); end if;
    if exists (select 1 from rwi.instances where event_id = p_event and ends_at is distinct from p_ends_at) then return jsonb_build_object('status','event_mismatch'); end if;   -- die Endzeit eines Events ist unveränderlich (K.2 Regel 1)
  end if;
  insert into rwi.instances(kind, stage, min_size, max_size, fights_total, event_id, ends_at, created_at) values (p_kind, 'ready', mn, mx, p_fights_total, p_event, p_ends_at, t) returning id into iid;
  insert into rwi.members(instance_id, player, key, last_seen_at, ready_due, potions) select iid, x, x, t, t + make_interval(secs => rwi.cfg('ready_seconds')), 3 from unnest(p_players) x;
  return jsonb_build_object('status','ok','instance',iid);
end $$;

create function rwi.join(p_instance bigint, p_player text) returns jsonb language plpgsql as $$
declare i rwi.instances; t timestamptz; m rwi.members; free boolean; pos int;
begin
  select * into i from rwi.instances where id = p_instance for update;
  if not found then return jsonb_build_object('status','no_instance'); end if;
  t := clock_timestamp();
  if i.status = 'active' and i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if i.status <> 'active' or i.stage = 'done' then return jsonb_build_object('status', case when i.status = 'active' then 'ended' else i.status end); end if;
  if not rwi.eligible(p_player) then return jsonb_build_object('status','not_eligible'); end if;
  select * into m from rwi.members where instance_id = i.id and player = p_player;
  if found then return jsonb_build_object('status', case when m.mstate = 'active' then 'already_member' else 'no_rejoin' end); end if;      -- kein Wiederbeitritt nach Austritt oder Entfernung
  if exists (select 1 from rwi.waitlist where instance_id = i.id and player = p_player and status = 'waiting') then return jsonb_build_object('status','already_waiting'); end if;
  if i.fights_total = 1 then                                                                 -- Einkampf-Instanz (Weltboss ist per Tabellenregel immer eine): kein Übergang, also kein Nachrücken; Beitritt nur vor dem Start und nur mit freiem Platz
    if i.fight_no > 0 or i.stage <> 'ready' then return jsonb_build_object('status','no_join'); end if;
    if rwi.active_count(i.id) >= i.max_size then return jsonb_build_object('status','full'); end if;
  elsif i.fight_no >= i.fights_total then return jsonb_build_object('status','no_join');       -- im letzten Kampf gibt es keinen weiteren Übergang
  end if;
  if i.fights_total = 1 then
    insert into rwi.members(instance_id, player, key, last_seen_at, ready_due, joined_after_fights, potions) values (i.id, p_player, p_player, t, t + make_interval(secs => rwi.cfg('ready_seconds')), 0, 3);
    perform rwi.glog(i.id, p_player, 'beigetreten', null); return jsonb_build_object('status','joined');
  end if;
  insert into rwi.waitlist(instance_id, player) values (i.id, p_player);                      -- Mehrkampf-Dungeon: immer erst auf die Warteliste, Aufnahme nur zwischen Kämpfen
  perform rwi.promote_waitlist(i.id);
  if exists (select 1 from rwi.members where instance_id = i.id and player = p_player and mstate = 'active') then perform rwi.glog(i.id, p_player, 'beigetreten', null); return jsonb_build_object('status','joined'); end if;
  select count(*)::int into pos from rwi.waitlist where instance_id = i.id and status = 'waiting' and id <= (select id from rwi.waitlist where instance_id = i.id and player = p_player and status = 'waiting');
  return jsonb_build_object('status','waitlisted','position',pos);
end $$;

create function rwi.leave(p_instance bigint, p_player text) returns jsonb language plpgsql as $$
declare i rwi.instances; t timestamptz; m rwi.members; r int;
begin
  select * into i from rwi.instances where id = p_instance for update;
  if not found then return jsonb_build_object('status','no_instance'); end if;
  t := clock_timestamp();
  if i.status = 'active' and i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  update rwi.waitlist set status = 'cancelled' where instance_id = i.id and player = p_player and status = 'waiting'; get diagnostics r = row_count;
  if r > 0 then return jsonb_build_object('status','left_waitlist'); end if;
  select * into m from rwi.members where instance_id = i.id and player = p_player;
  if not found or m.mstate <> 'active' then return jsonb_build_object('status','not_member'); end if;
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  perform rwi.drop_member(i.id, p_player, 'freiwillig');
  if rwi.active_count(i.id) = 0 then perform rwi.abort_instance(i.id, 'alle ausgetreten'); return jsonb_build_object('status','left','instance_ended',true); end if;   -- freiwilliger Austritt unter die Mindestgröße ist erlaubt, nur niemand mehr übrig beendet
  if i.stage = 'ready' then perform rwi.promote_waitlist(i.id); end if;
  return jsonb_build_object('status','left');
end $$;

create function rwi.set_ready(p_instance bigint, p_player text) returns jsonb language plpgsql as $$
declare i rwi.instances; t timestamptz; m rwi.members; allr boolean; why text;
begin
  select * into i from rwi.instances where id = p_instance for update;
  if not found then return jsonb_build_object('status','no_instance'); end if;
  t := clock_timestamp();
  if i.status = 'active' and i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  select * into m from rwi.members where instance_id = i.id and player = p_player;
  if not found or m.mstate <> 'active' then return jsonb_build_object('status','not_member'); end if;
  why := rwi.enforce_deadlines(i.id, p_player, t);                                           -- abgelaufene Frist: nicht annehmen, auch wenn group_tick noch nicht gelaufen ist
  if why is not null then return jsonb_build_object('status','removed','reason',why,'instance_aborted',(select status = 'aborted' from rwi.instances where id = i.id)); end if;
  if i.stage <> 'ready' then return jsonb_build_object('status','not_ready_phase'); end if;
  if not m.ready then update rwi.members set ready = true, ready_at = t, ready_due = null where id = m.id; end if;          -- bestätigt, nicht widerrufbar, bleibt bei Verbindungsabbruch bestehen
  select not exists (select 1 from rwi.members where instance_id = i.id and mstate = 'active' and not ready) into allr;
  return jsonb_build_object('status','ok','all_ready', allr);
end $$;

-- Profile der aktiven Mitglieder, nur aus dem Server-Charakterbestand (nie aus Clientangaben)
create function rwi.roster(p_instance bigint) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.key, 'name', m.player, 'grundklasse', pl.grundklasse, 'pfad', pl.pfad, 'tier', pl.tier) order by m.id), '[]'::jsonb)
  from rwi.members m join rwi.players pl on pl.player = m.player where m.instance_id = p_instance and m.mstate = 'active' $$;

-- Kampfstart (Worker bzw. Edge Function liefert den Anfangszustand). Atomar gegen das Eventende geprüft (K.2 Regel 8).
create function rwi.start_fight(p_instance bigint, p_state jsonb) returns jsonb language plpgsql as $$
declare i rwi.instances; t timestamptz; n int; fid bigint; keys text[]; skeys text[];
begin
  select * into i from rwi.instances where id = p_instance for update;
  if not found then return jsonb_build_object('status','no_instance'); end if;
  t := clock_timestamp();
  if i.status = 'active' and i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  if i.stage <> 'ready' then return jsonb_build_object('status','not_ready_phase'); end if;
  if exists (select 1 from rwi.members where instance_id = i.id and mstate = 'active' and not ready) then return jsonb_build_object('status','not_all_ready'); end if;
  n := rwi.active_count(i.id);
  if n = 0 then return jsonb_build_object('status','empty'); end if;
  if i.fight_no = 0 and n < i.min_size then return jsonb_build_object('status','below_min'); end if;     -- Mindestgröße ist nur Startbedingung des ersten Kampfes
  if exists (select 1 from jsonb_array_elements(p_state->'members') x where coalesce((x->>'legacy')::boolean, false)) then return jsonb_build_object('status','legacy_rejected'); end if;
  select array_agg(key order by key) into keys from rwi.members where instance_id = i.id and mstate = 'active';
  select array_agg(x->>'id' order by x->>'id') into skeys from jsonb_array_elements(p_state->'members') x;
  if keys is distinct from skeys then return jsonb_build_object('status','state_mismatch'); end if;
  insert into rwi.fights(instance_id, due_at, state) values (i.id, t + make_interval(secs => rwi.cfg('round_seconds')), p_state) returning id into fid;
  update rwi.instances set stage = 'fight', fight_no = fight_no + 1 where id = i.id;
  update rwi.members set ready = false, ready_at = null, ready_due = null where instance_id = i.id and mstate = 'active';
  perform rwi.glog(i.id, null, 'kampf_start', 'Kampf ' || (i.fight_no + 1) || ' mit ' || n || ' Spielern');
  return jsonb_build_object('status','ok','fight',fid,'fight_no',i.fight_no + 1);
end $$;

-- Kampfende: Ansprüche festhalten (nur für tatsächlich beteiligte Spieler), Übergang in die Bereitschaftsphase oder Instanzende
create function rwi.on_fight_end() returns trigger language plpgsql as $$
declare i rwi.instances; x jsonb; mb rwi.members; t timestamptz := clock_timestamp(); kd text;
begin
  select * into i from rwi.instances where id = new.instance_id;
  if i.fight_no < 1 or i.stage <> 'fight' then return null; end if;                          -- nur über start_fight gestartete Gruppenkämpfe
  if new.status = 'won' then
    for x in select * from jsonb_array_elements(new.state->'members') loop
      select * into mb from rwi.members where instance_id = i.id and key = x->>'id'; continue when not found;
      foreach kd in array array['kampf_ep','beute'] loop
        insert into rwi.entitlements(instance_id, player, fight_no, kind, void, reason)
          values (i.id, mb.player, i.fight_no, kd, mb.mstate <> 'active',                          -- wer während dieses Kampfes ausscheidet, hat ihn nicht abgeschlossen: keine Berechtigung daraus
                  case when mb.mstate <> 'active' then 'ausgeschieden während des Kampfes (' || mb.leave_reason || ')' end) on conflict do nothing;
      end loop;
    end loop;
    if i.fight_no < i.fights_total then
      update rwi.instances set stage = 'ready' where id = i.id;
      update rwi.members set ready = false, ready_at = null, ready_due = case when connected then t + make_interval(secs => rwi.cfg('ready_seconds')) else null end where instance_id = i.id and mstate = 'active';
      perform rwi.promote_waitlist(i.id);                                                    -- Nachrücken ausschließlich hier, zwischen zwei Kämpfen
    else
      update rwi.instances set stage = 'done', outcome = 'won', status = case when status = 'active' then 'completed' else status end where id = i.id;
      update rwi.waitlist set status = 'cancelled' where instance_id = i.id and status = 'waiting';
    end if;
  elsif new.status = 'lost' then
    update rwi.instances set stage = 'done', outcome = 'lost', status = case when status = 'active' then 'completed' else status end where id = i.id;
    update rwi.waitlist set status = 'cancelled' where instance_id = i.id and status = 'waiting';
  end if;
  return null;
end $$;
create trigger fights_end after update of status on rwi.fights for each row when (old.status = 'active' and new.status in ('won','lost')) execute function rwi.on_fight_end();

-- Beitrag im letzten Kampf: Anzahl ausgeführter Aktionen (Platzhalter für die noch offene Beitragsberechnung, Plan 1d)
create function rwi.contribution(p_instance bigint, p_key text) returns int language sql stable as $$
  select count(*)::int from rwi.round_results r, lateral jsonb_array_elements(r.result->'log') e
  where r.fight_id = (select max(id) from rwi.fights where instance_id = p_instance) and e->>'a' = p_key and e->>'e' in ('act','revive') $$;

-- Persönliche Abschlussbelohnung: nur bei Abschluss der gesamten Instanz; entfällt bei freiwilligem Austritt und (vorsichtig, Beitragsschwelle ist Balance) bei Entfernung
create function rwi.reward_filter() returns trigger language plpgsql as $$
declare mb rwi.members; i rwi.instances;
begin
  if exists (select 1 from rwi.instances where id = new.instance_id and status = 'event_ended') then return null; end if;   -- nach festgehaltenem Eventende entsteht keine Belohnung mehr (Absicherung zusätzlich zu den Prüfungen in commit_round)
  if new.reward_id like 'final:%' then
    select * into i from rwi.instances where id = new.instance_id;
    if found and i.fight_no >= 1 and not (i.stage = 'done' and i.outcome = 'won') then return null; end if;        -- Gruppeninstanz: Abschlussbelohnung erst beim erfolgreichen Abschluss der gesamten Instanz, nicht nach Einzelkämpfen
    select * into mb from rwi.members where instance_id = new.instance_id and key = new.test_member;
    if found and mb.mstate = 'left' then return null; end if;                                                     -- freiwilliger Austritt: entfällt
    if found and mb.mstate = 'removed' and rwi.contribution(new.instance_id, new.test_member) < rwi.cfg('contribution_min') then return null; end if;   -- automatisch entfernt: bleibt, wenn im letzten Kampf beigetragen (Schwelle ist Balance, Platzhalter)
  end if;
  return new;
end $$;
create trigger rewards_filter before insert on rwi.rewards for each row execute function rwi.reward_filter();

create or replace function rwi.claim_resolution(p_fight bigint, p_round int) returns jsonb language plpgsql as $$
declare i rwi.instances; f rwi.fights; tok uuid := gen_random_uuid(); snap jsonb; inp jsonb; h text; t timestamptz;
begin
  select * into f from rwi.fights where id = p_fight;                       -- ungesperrt nur, um die Instanz zu finden
  if not found then return jsonb_build_object('status','unknown_fight'); end if;
  select * into i from rwi.instances where id = f.instance_id for update;   -- eine Sperre: die Instanzzeile
  select * into f from rwi.fights where id = p_fight for update;            -- danach neu lesen (jetzt unter Sperre)
  t := clock_timestamp();
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  if i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if f.round_no <> p_round then return jsonb_build_object('status', case when f.round_no > p_round then 'already_resolved' else 'stale' end); end if;
  if f.phase = 'done' then return jsonb_build_object('status','already_resolved'); end if;
  if f.phase = 'wipe_wait' then return jsonb_build_object('status','not_due'); end if;                  -- Kampf angehalten, bis ein Fenster genutzt wird oder alle Fenster geschlossen sind
  if f.phase = 'resolving' and f.lease_until > t then return jsonb_build_object('status','busy'); end if;
  if f.phase = 'planning' then
    if f.due_at > t then return jsonb_build_object('status','not_due'); end if;
    snap := jsonb_build_object('state', f.state, 'actions', f.actions, 'conn', '{}'::jsonb, 'revive_ok', f.revive_ok, 'item_ok', f.item_ok, 'wipe_resume', f.resume)
      || coalesce((select jsonb_build_object('left', jsonb_agg(m.key order by m.id)) from rwi.members m where m.instance_id = i.id and m.mstate <> 'active' and m.key is not null
                   and exists (select 1 from jsonb_array_elements(f.state->'members') x where x->>'id' = m.key and not coalesce((x->>'gone')::boolean, false))), '{}'::jsonb);   -- ausgeschiedene Mitglieder: die Engine setzt sie an der Phasengrenze auf „gone“   -- Snapshot einfrieren
  else
    snap := f.snapshot;                                                                       -- abgelaufene Lease: gespeicherter Snapshot (E.1)
  end if;
  inp := jsonb_build_object('fight_id', f.id, 'round_no', f.round_no, 'seed', encode(i.seed,'hex'), 'cfg_version', i.cfg_version, 'snapshot', snap);
  h := encode(digest(inp::text, 'sha256'), 'hex');
  update rwi.fights set phase='resolving', claim_token=tok, lease_until = t + make_interval(secs => rwi.cfg('lease_seconds')),
    round_version = round_version + 1, snapshot = snap, input_hash = h where id = f.id;
  insert into rwi.resolve_jobs(fight_id, round_no, status, last_dispatch_at) values (f.id, f.round_no, 'claimed', t)
    on conflict (fight_id, round_no) do update set status = 'claimed', last_dispatch_at = t where rwi.resolve_jobs.status in ('pending','claimed','stuck');
  return jsonb_build_object('status','ok','token',tok,'round_version',f.round_version + 1,'input',inp,'input_hash',h);
end $$;
-- Verbindungsstatus: ergänzt die Gruppenpause (03) um die persönliche Abwesenheitsfrist und die Bereitschaftsfrist.
-- In der Bereitschaftsphase gibt es keine Gruppenpause, die Abwesenheitsfrist läuft weiter.
alter function rwi.set_connection(bigint, text, boolean) rename to set_connection_core;
create function rwi.set_connection(p_instance bigint, p_key text, p_connected boolean) returns jsonb language plpgsql as $$
declare i rwi.instances; m rwi.members; t timestamptz; why text;
begin
  select * into i from rwi.instances where id = p_instance for update; t := clock_timestamp();
  select * into m from rwi.members where instance_id = p_instance and key = p_key;
  if found and m.mstate <> 'active' then return jsonb_build_object('status','ignored'); end if;                -- Ausgeschiedene zählen nicht mehr als Verbundene
  if found and p_connected and m.player is not null and i.status = 'active' then
    why := rwi.enforce_deadlines(p_instance, m.player, t);                                   -- Frist zuerst prüfen, erst danach darf disc_since zurückgesetzt werden
    if why is not null then return jsonb_build_object('status','removed','reason',why,'instance_aborted',(select status = 'aborted' from rwi.instances where id = p_instance)); end if;
  end if;
  if found then
    if p_connected then
      update rwi.members set disc_since = null, ready_due = case when i.stage = 'ready' and not ready and player is not null then t + make_interval(secs => rwi.cfg('ready_seconds')) else ready_due end where id = m.id;   -- 60 s ab Wiederverbindung
    else
      update rwi.members set disc_since = coalesce(disc_since, t), ready_due = case when ready then ready_due else null end where id = m.id;     -- Bereitschaftsfrist ruht, bestätigte Bereitschaft bleibt
    end if;
  end if;
  if i.stage = 'ready' and i.fight_no >= 0 and found and m.player is not null then
    update rwi.members set connected = p_connected, last_seen_at = case when p_connected then t else last_seen_at end where id = m.id;
    return jsonb_build_object('status','unchanged');
  end if;
  return rwi.set_connection_core(p_instance, p_key, p_connected);
end $$;

-- Herzschlag eines Spielers (schreibend). instance_view selbst schreibt nie.
create function rwi.heartbeat_for(p_instance bigint, me text) returns jsonb language plpgsql as $$   -- INTERN: Spielerparameter, nur über die Produktions-Wrapper (05_produktion.sql) oder Tests aufrufbar
declare i rwi.instances; m rwi.members; t timestamptz; r jsonb;
begin
  if me is null then return jsonb_build_object('status','unauthenticated'); end if;             -- Identität kommt nie vom Client, sondern aus der authentifizierten Sitzung (Wrapper) bzw. dem Testschlüssel
  select * into i from rwi.instances where id = p_instance for update;                           -- erst sperren, dann die Zeit nehmen
  if not found then return jsonb_build_object('status','not_member'); end if;
  t := clock_timestamp();                                                                        -- ausschließlich Serverzeit, keine Zeit vom Client
  select * into m from rwi.members where instance_id = p_instance and player = me;
  if not found or m.mstate <> 'active' then return jsonb_build_object('status','not_member'); end if;
  if i.status = 'active' and i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  perform rwi.advance_clock(p_instance, t);
  r := rwi.set_connection(p_instance, m.key, true);                                              -- prüft zuerst die Fristen, setzt dann Anwesenheit und Verbindungsstatus
  if r->>'status' = 'removed' then return r; end if;
  update rwi.members set last_seen_at = t where id = m.id;
  return r;
end $$;
create function rwi.heartbeat(p_instance bigint) returns jsonb language sql as $$ select rwi.heartbeat_for(p_instance, rwi.current_player()) $$;   -- Testidentität aus request.jwt.claim.sub; Produktion: public.group_heartbeat


-- Zeitregeln der Gruppe: Abwesenheit (5 min), Bereitschaft (60 s), Mindestgröße nach automatischer Entfernung, Nachrücken, Eventende
create function rwi.group_tick(p_now timestamptz default null) returns jsonb language plpgsql as $$
declare iid bigint; i rwi.instances; mm record; auto int; removed int := 0; aborted int := 0; promoted int := 0; start_ids jsonb := '[]'; t timestamptz; why text;
begin
  for iid in select id from rwi.instances where status = 'active' and stage <> 'done' and exists (select 1 from rwi.members where instance_id = rwi.instances.id and player is not null) order by id loop
    perform 1 from rwi.instances where id = iid for update skip locked; if not found then continue; end if;
    t := coalesce(p_now, clock_timestamp());                                                    -- Zeit erst nach der Sperre
    select * into i from rwi.instances where id = iid;
    if i.status <> 'active' or i.stage = 'done' then continue; end if;
    if i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); continue; end if;
    auto := 0;
    for mm in select player from rwi.members where instance_id = iid and mstate = 'active' order by id loop
      why := rwi.enforce_deadlines_quiet(iid, mm.player, t); if why is not null then auto := auto + 1; end if;
    end loop;
    removed := removed + auto;
    if auto > 0 then
      if rwi.after_auto_removal(iid) then aborted := aborted + 1; continue; end if;
      select * into i from rwi.instances where id = iid;
    end if;
    if i.stage = 'ready' and not exists (select 1 from rwi.members where instance_id = iid and mstate = 'active' and not ready) and (i.fight_no > 0 or rwi.active_count(iid) >= i.min_size) then
      start_ids := start_ids || to_jsonb(iid);
    end if;
  end loop;
  return jsonb_build_object('removed', removed, 'aborted', aborted, 'promoted', promoted, 'start', start_ids);
end $$;

alter function rwi.watchdog_tick() rename to watchdog_core;

-- K.2 Regel 4a-4c: Eventende-Abschluss. Ein Kern, drei Zugänge.
--  sweep_events():           Watchdog, blockierend, Sperren global aufsteigend nach Instanz-ID über alle Events (kein Deadlock mit anderen Watchdogs; Aufrufe innerhalb von Vorgängen warten nie)
--  sweep_event(event, true): innerhalb eines Vorgangs (Claim, Commit, Submit, Start, Heartbeat ...): SKIP LOCKED, wartet nie; gesperrte Fremdinstanzen bleiben dem Watchdog oder ihrer eigenen Selbstprüfung
--  Endzustand (4c): status, stage, outcome, Kämpfe, Aufträge, Fenster und Warteliste in EINER Anweisung bzw. derselben Transaktion; die Tabellenregel instances_event_end_state verbietet Zwischenzustände.
create or replace function rwi.sweep_core(p_event bigint, p_all boolean, p_skip boolean) returns int language plpgsql as $$
declare n int; ids bigint[];
begin
  if p_skip then
    select coalesce(array_agg(id), '{}') into ids from (select id from rwi.instances where (p_all or event_id = p_event) and event_id is not null and status in ('active','frozen') and ends_at is not null and clock_timestamp() >= ends_at order by id for update skip locked) x;
  else
    select coalesce(array_agg(id), '{}') into ids from (select id from rwi.instances where (p_all or event_id = p_event) and event_id is not null and status in ('active','frozen') and ends_at is not null and clock_timestamp() >= ends_at order by id for update) x;
  end if;
  with upd as (update rwi.instances i set status = 'event_ended', stage = 'done', outcome = 'event_ended', engine_stuck = false where i.id = any(ids) and i.status in ('active','frozen') returning i.id),
  f as (update rwi.fights f set status = 'event_ended', phase = 'done', claim_token = null, lease_until = null where f.instance_id in (select id from upd) and f.status = 'active' returning f.id),
  j as (update rwi.resolve_jobs j set status = 'cancelled' where j.fight_id in (select id from f) and j.status in ('pending','claimed','stuck') returning 1),
  w as (update rwi.death_windows w set status = 'closed', closed_reason = 'fight_end' where w.fight_id in (select id from f) and w.status = 'open' returning 1),
  wl as (update rwi.waitlist wl set status = 'cancelled' where wl.instance_id in (select id from upd) and wl.status = 'waiting' returning 1)
  select count(*) into n from upd;
  return n;
end $$;
create or replace function rwi.sweep_event(p_event bigint, p_skip boolean default false) returns int language sql as $$ select rwi.sweep_core(p_event, false, p_skip) $$;
create function rwi.sweep_events() returns int language sql as $$ select rwi.sweep_core(null, true, false) $$;

create or replace function rwi.end_instance(p_instance bigint) returns void language plpgsql as $$
begin
  update rwi.instances set status = 'event_ended', stage = 'done', outcome = 'event_ended', engine_stuck = false where id = p_instance and status in ('active','frozen');
  if not found then return; end if;                                                              -- bereits abgeschlossene Instanz (Sieg, Abbruch, Eventende): nichts mehr verändern
  with f as (update rwi.fights set status = 'event_ended', phase = 'done', claim_token = null, lease_until = null where instance_id = p_instance and status = 'active' returning id)
  update rwi.resolve_jobs set status = 'cancelled' where fight_id in (select id from f) and status in ('pending','claimed','stuck');
  update rwi.death_windows set status = 'closed', closed_reason = 'fight_end' where status = 'open' and fight_id in (select id from rwi.fights where instance_id = p_instance);
  update rwi.waitlist set status = 'cancelled' where instance_id = p_instance and status = 'waiting';
end $$;

create or replace function rwi.watchdog_core() returns jsonb language plpgsql as $$
declare ev bigint; n int := 0; due jsonb; redo jsonb; t timestamptz := clock_timestamp(); fid bigint; iid bigint; lost int := 0; ab int := 0; ex int := 0; r int;
begin
  n := rwi.sweep_events();                                                                       -- 4a: alle beendeten Events in einem Durchgang, Sperren global aufsteigend nach Instanz-ID
  update rwi.death_windows set status = 'closed', closed_reason = 'expired' where status = 'open' and until is not null and until <= t; get diagnostics ex = row_count;
  for fid, iid in select f.id, f.instance_id from rwi.fights f join rwi.instances i on i.id = f.instance_id where f.status = 'active' and f.phase = 'wipe_wait' and i.status = 'active' order by f.id loop
    perform 1 from rwi.instances where id = iid for update skip locked; if not found then continue; end if;       -- gesperrte Instanz: nächster Tick
    if exists (select 1 from rwi.instances where id = iid and ends_at is not null and clock_timestamp() >= ends_at) then perform rwi.end_instance(iid); continue; end if;   -- 4b: nach ends_at kein Ergebnis mehr
    if (select status from rwi.instances where id = iid) = 'active' and exists (select 1 from rwi.fights where id = fid and status = 'active' and phase = 'wipe_wait') and not rwi.wipe_hold(fid, iid, t) then
      update rwi.fights set status = 'lost', phase = 'done' where id = fid; perform rwi.sync_windows(fid, iid, '{"members":[]}'::jsonb, true); lost := lost + 1;
    end if;
  end loop;
  for iid in select id from rwi.instances where status = 'active' and paused_at is not null and pause_used_ms + (extract(epoch from (t - paused_at)) * 1000)::bigint >= rwi.cfg('pause_budget_seconds') * 1000 order by id loop
    perform 1 from rwi.instances where id = iid and status = 'active' for update skip locked; if not found then continue; end if;
    if exists (select 1 from rwi.instances where id = iid and ends_at is not null and clock_timestamp() >= ends_at) then perform rwi.end_instance(iid); continue; end if;
    update rwi.instances set status = 'aborted', engine_stuck = false where id = iid;                              -- Budget aufgebraucht und niemand verbunden: Instanzversuch abgebrochen, keine Belohnung
    with f as (update rwi.fights set status = 'technical_end', phase = 'done', claim_token = null, lease_until = null where instance_id = iid and status = 'active' returning id)
      update rwi.resolve_jobs set status = 'cancelled' where fight_id in (select id from f) and status in ('pending','claimed','stuck');
    update rwi.death_windows set status = 'closed', closed_reason = 'fight_end' where status = 'open' and fight_id in (select id from rwi.fights where instance_id = iid);
    ab := ab + 1;
  end loop;
  select coalesce(jsonb_agg(f.id order by f.id), '[]') into due from rwi.fights f join rwi.instances i on i.id = f.instance_id
    where f.status = 'active' and f.phase = 'planning' and f.due_at <= t and i.status = 'active' and not i.engine_stuck and (i.ends_at is null or i.ends_at > t);
  select coalesce(jsonb_agg(f.id order by f.id), '[]') into redo from rwi.fights f join rwi.instances i on i.id = f.instance_id
    where f.status = 'active' and f.phase = 'resolving' and f.lease_until < t and i.status = 'active' and not i.engine_stuck and (i.ends_at is null or i.ends_at > t);
  return jsonb_build_object('ended', n, 'due', due, 'redispatch', redo, 'windows_expired', ex, 'lost_finalized', lost, 'aborted', ab);
end $$;

create function rwi.watchdog_tick() returns jsonb language plpgsql as $$
begin return rwi.watchdog_core() || jsonb_build_object('group', rwi.group_tick()); end $$;

-- Aktionen nur über den authentifizierten Spieler: der Schlüssel im Kampf wird serverseitig zugeordnet, nie vom Client gewählt
create function rwi.submit_action_for(p_player text, p_fight bigint, p_round int, p_action jsonb) returns jsonb language plpgsql as $$
declare iid bigint; k text;
begin
  select instance_id into iid from rwi.fights where id = p_fight;
  select key into k from rwi.members where instance_id = iid and player = p_player and mstate = 'active';
  if iid is null or k is null then return jsonb_build_object('status','forbidden'); end if;
  return rwi.submit_action(p_fight, k, p_round, p_action);
end $$;

-- instance_view: rein lesend (STABLE, schreibt nichts), nur für Mitglieder, Wartelistenplätze und Ausgeschiedene (nur eigener Status).
create function rwi.instance_view(p_instance bigint, p_player text, p_known_version bigint default null) returns jsonb language plpgsql stable as $$
declare i rwi.instances; me rwi.members; w rwi.waitlist; f rwi.fights; t timestamptz := clock_timestamp(); eff text; stg text; rem bigint; have_me boolean; have_w boolean; out jsonb; own jsonb;
begin
  select * into i from rwi.instances where id = p_instance;
  if not found then return jsonb_build_object('status','forbidden'); end if;                   -- gleiche Antwort für „gibt es nicht“ und „nicht deine“
  select * into me from rwi.members where instance_id = p_instance and player = p_player; have_me := found;
  select * into w from rwi.waitlist where instance_id = p_instance and player = p_player and status = 'waiting'; have_w := found;
  if not have_me and not have_w then return jsonb_build_object('status','forbidden'); end if;
  eff := i.status; if eff in ('active','frozen') and i.ends_at is not null and t >= i.ends_at then eff := 'event_ended'; end if;     -- Eventende gilt auch bei veraltetem Datenbankstand
  stg := case when eff <> 'active' then 'done' else i.stage end;
  out := jsonb_build_object('status','ok','server_now', t, 'instance', jsonb_build_object('id', i.id, 'kind', i.kind, 'status', eff, 'stage', stg, 'fight_no', i.fight_no, 'fights_total', i.fights_total,
         'ends_at', i.ends_at, 'outcome', case when eff = 'event_ended' then 'event_ended' else i.outcome end));
  if have_w and not have_me then
    return out || jsonb_build_object('me', jsonb_build_object('state','waiting','position', (select count(*)::int from rwi.waitlist x where x.instance_id = p_instance and x.status = 'waiting' and x.id <= w.id)));
  end if;
  own := jsonb_build_object('state', me.mstate, 'reason', me.leave_reason,
         'entitlements', coalesce((select jsonb_agg(jsonb_build_object('fight_no', e.fight_no, 'kind', e.kind, 'void', e.void) order by e.fight_no, e.kind) from rwi.entitlements e where e.instance_id = p_instance and e.player = p_player), '[]'::jsonb));
  if me.mstate <> 'active' then return out || jsonb_build_object('me', own); end if;            -- Ausgeschiedene sehen nur ihren eigenen Status, nichts aus der Gruppe
  own := own || jsonb_build_object('key', me.key, 'ready', me.ready, 'ready_remaining_ms', case when me.ready_due is null then null else greatest(0, (extract(epoch from (me.ready_due - t)) * 1000)::bigint) end,
         'potions', me.potions, 'revive_items', me.revive_items);
  out := out || jsonb_build_object('me', own,
    'group', (select coalesce(jsonb_agg(jsonb_build_object('key', m.key, 'name', m.player, 'ready', m.ready, 'connected', m.connected) order by m.id), '[]'::jsonb) from rwi.members m where m.instance_id = p_instance and m.mstate = 'active'),
    'waitlist_size', (select count(*)::int from rwi.waitlist x where x.instance_id = p_instance and x.status = 'waiting'));
  select * into f from rwi.fights where instance_id = p_instance order by id desc limit 1;
  if found then
    rem := case when stg <> 'fight' or f.status <> 'active' or f.phase <> 'planning' then null when f.due_at = 'infinity' then f.due_remaining_ms else greatest(0, (extract(epoch from (f.due_at - t)) * 1000)::bigint) end;
    out := out || jsonb_build_object('stale', p_known_version is distinct from f.round_version, 'version', f.round_version, 'fight', jsonb_build_object(
      'id', f.id, 'status', case when eff = 'event_ended' and f.status = 'active' then 'event_ended' else f.status end, 'phase', f.phase, 'round', f.round_no, 'remaining_ms', rem, 'paused', i.paused_at is not null,
      'telegraph', f.state->'telegraph', 'monster', jsonb_build_object('name', f.state->'monster'->>'name', 'hp', f.state->'monster'->'hp', 'maxhp', f.state->'monster'->'maxhp', 'phase', f.state->'monster'->'phase', 'st', f.state->'monster'->'st'),
      'adds', coalesce((select jsonb_agg(jsonb_build_object('name', a->>'name', 'hp', a->'hp')) from jsonb_array_elements(f.state->'adds') a), '[]'::jsonb),
      'members', (select coalesce(jsonb_agg(jsonb_build_object('key', x->>'id', 'name', x->>'name', 'cls', x->>'cls', 'hp', x->'hp', 'maxhp', x->'maxhp', 'alive', x->'alive', 'st', x->'st',
                    'confirmed', f.actions ? (x->>'id')) order by ord), '[]'::jsonb) from jsonb_array_elements(f.state->'members') with ordinality as t2(x, ord)),
      'my_action', f.actions->me.key,
      'my_cooldowns', (select x->'cd' from jsonb_array_elements(f.state->'members') x where x->>'id' = me.key),
      'windows', (select coalesce(jsonb_agg(jsonb_build_object('key', d.member_key, 'remaining_ms', case when d.until is null then d.remaining_ms else greatest(0, (extract(epoch from (d.until - t)) * 1000)::bigint) end) order by d.id), '[]'::jsonb)
                  from rwi.death_windows d where d.fight_id = f.id and d.status = 'open' and eff = 'active'),
      'can_act', (eff = 'active' and stg = 'fight' and f.status = 'active' and f.phase = 'planning')));
  end if;
  return out;
end $$;

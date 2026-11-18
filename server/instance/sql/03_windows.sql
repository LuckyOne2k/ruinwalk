-- Phase 1: Todesfenster, Wiederbelebungsannahme, Wipe-Halt, Gruppenpause (Plan 1b / Abschnitt 1). Schema rwi, nur Testdaten. Setzt 01_proto.sql und 02_actions.sql voraus.
alter table rwi.fights drop constraint fights_phase_check;
alter table rwi.fights add constraint fights_phase_check check (phase in ('planning','resolving','done','wipe_wait'));
alter table rwi.fights add column resume boolean not null default false, add column revive_ok jsonb not null default '[]', add column item_ok jsonb not null default '[]', add column due_remaining_ms bigint;
alter table rwi.members add column revive_items int not null default 0, add column connected boolean not null default true;      -- revive_items: Testbestand des Wiederbelebungsitems (nur Test)
alter table rwi.instances add column paused_at timestamptz, add column pause_used_ms bigint not null default 0;
insert into rwi.cfg values ('revive_window_seconds', 60), ('revive_limit', 2), ('pause_budget_seconds', 300);

-- Ein Fenster je Todesfall (unabhängig voneinander). until = null: Gruppenpause, remaining_ms hält die Restzeit.
create table rwi.death_windows (
  id bigint generated always as identity primary key, fight_id bigint not null references rwi.fights, member_key text not null, death_no int not null,
  opened_at timestamptz not null, until timestamptz, remaining_ms bigint not null,
  item_open boolean not null default true,                                                  -- „Abwarten“ beendet nur die Item-Möglichkeit, das Fenster für Fähigkeiten bleibt
  status text not null default 'open' check (status in ('open','closed')), closed_reason text check (closed_reason in ('revived','expired','limit','left','fight_end','item_used')),
  unique (fight_id, member_key, death_no));

create or replace function rwi.sweep_event(p_event bigint, p_skip boolean default false) returns int language plpgsql as $$
declare n int; ids bigint[];
begin
  -- p_skip = false (Watchdog): wartet auf gesperrte Instanzen, aufsteigend nach ID. p_skip = true (innerhalb von Claim/Commit): wartet nie.
  if p_skip then
    select coalesce(array_agg(id), '{}') into ids from (select id from rwi.instances where event_id = p_event and status in ('active','frozen') and ends_at is not null and clock_timestamp() >= ends_at order by id for update skip locked) x;
  else
    select coalesce(array_agg(id), '{}') into ids from (select id from rwi.instances where event_id = p_event and status in ('active','frozen') and ends_at is not null and clock_timestamp() >= ends_at order by id for update) x;
  end if;
  with upd as (update rwi.instances i set status = 'event_ended', engine_stuck = false where i.id = any(ids) returning i.id),
  f as (update rwi.fights f set status = 'event_ended', phase = 'done', claim_token = null, lease_until = null
        where f.instance_id in (select id from upd) and f.status = 'active' returning f.id),
  j as (update rwi.resolve_jobs j set status = 'cancelled' where j.fight_id in (select id from f) and j.status in ('pending','claimed','stuck') returning 1),
  w as (update rwi.death_windows w set status = 'closed', closed_reason = 'fight_end' where w.fight_id in (select id from f) and w.status = 'open' returning 1)
  select count(*) into n from upd;
  return n;
end $$;
create or replace function rwi.end_instance(p_instance bigint) returns void language plpgsql as $$
begin
  update rwi.instances set status = 'event_ended', engine_stuck = false where id = p_instance and status in ('active','frozen');
  with f as (update rwi.fights set status = 'event_ended', phase = 'done', claim_token = null, lease_until = null
             where instance_id = p_instance and status = 'active' returning id)
  update rwi.resolve_jobs set status = 'cancelled' where fight_id in (select id from f) and status in ('pending','claimed','stuck');
  update rwi.death_windows set status = 'closed', closed_reason = 'fight_end' where status = 'open' and fight_id in (select id from rwi.fights where instance_id = p_instance);   -- Wiederbelebungsfenster enden (K.2 Regel 4)
end $$;

-- Fenster nach jeder Auflösung angleichen. p_close_all: Kampf endet, alle offenen Fenster verfallen (das Item wird dann nicht verbraucht).
create function rwi.sync_windows(p_fight bigint, p_instance bigint, p_state jsonb, p_close_all boolean) returns void language plpgsql as $$
declare m jsonb; t timestamptz := clock_timestamp(); secs numeric := rwi.cfg('revive_window_seconds'); lim int := rwi.cfg('revive_limit'); paused boolean;
begin
  select paused_at is not null into paused from rwi.instances where id = p_instance;
  if p_close_all then update rwi.death_windows set status = 'closed', closed_reason = 'fight_end' where fight_id = p_fight and status = 'open'; return; end if;
  for m in select * from jsonb_array_elements(p_state->'members') loop
    if (m->>'alive')::boolean then
      update rwi.death_windows set status = 'closed', closed_reason = 'revived' where fight_id = p_fight and member_key = m->>'id' and status = 'open';
    elsif coalesce((m->>'gone')::boolean, false) then
      update rwi.death_windows set status = 'closed', closed_reason = 'left' where fight_id = p_fight and member_key = m->>'id' and status = 'open';
    elsif (m->>'revives')::int >= lim then
      update rwi.death_windows set status = 'closed', closed_reason = 'limit' where fight_id = p_fight and member_key = m->>'id' and status = 'open';      -- ohne freies Limit gibt es kein Fenster: Tod endgültig
    elsif (m->>'deaths')::int > 0 then
      insert into rwi.death_windows(fight_id, member_key, death_no, opened_at, until, remaining_ms)
        values (p_fight, m->>'id', (m->>'deaths')::int, t, case when paused then null else t + make_interval(secs => secs) end, (secs * 1000)::bigint) on conflict do nothing;
    end if;
  end loop;
end $$;

-- Alle Spieler tot: bleibt der Kampf angehalten? Ja, solange ein Fenster mit nutzbarer Option offen ist (Item vorhanden, „Abwarten“ nicht gewählt, Limit frei). Pausierte Fenster gelten als offen.
create function rwi.wipe_hold(p_fight bigint, p_instance bigint, p_now timestamptz) returns boolean language plpgsql as $$
begin
  return exists (select 1 from rwi.death_windows w join rwi.members mb on mb.instance_id = p_instance and mb.key = w.member_key
                 where w.fight_id = p_fight and w.status = 'open' and w.item_open and mb.revive_items > 0 and (w.until is null or w.until > p_now));
end $$;

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
    snap := jsonb_build_object('state', f.state, 'actions', f.actions, 'conn', '{}'::jsonb, 'revive_ok', f.revive_ok, 'item_ok', f.item_ok, 'wipe_resume', f.resume);   -- Snapshot einfrieren
  else
    snap := f.snapshot;                                                                       -- abgelaufene Lease: gespeicherter Snapshot (E.1)
  end if;
  inp := jsonb_build_object('fight_id', f.id, 'round_no', f.round_no, 'seed', encode(i.seed,'hex'), 'cfg_version', i.cfg_version, 'snapshot', snap);
  h := encode(sha256(convert_to(inp::text, 'UTF8')), 'hex');
  update rwi.fights set phase='resolving', claim_token=tok, lease_until = t + make_interval(secs => rwi.cfg('lease_seconds')),
    round_version = round_version + 1, snapshot = snap, input_hash = h where id = f.id;
  insert into rwi.resolve_jobs(fight_id, round_no, status, last_dispatch_at) values (f.id, f.round_no, 'claimed', t)
    on conflict (fight_id, round_no) do update set status = 'claimed', last_dispatch_at = t where rwi.resolve_jobs.status in ('pending','claimed','stuck');
  return jsonb_build_object('status','ok','token',tok,'round_version',f.round_version + 1,'input',inp,'input_hash',h);
end $$;

-- ---- stuck-Alarmierung (Folgeauftrag): jeder Übergang nach „stuck“ erzeugt GENAU EINEN eindeutig identifizierbaren Alarm; Wiederholungen erzeugen keinen zweiten. ----
-- Schlüssel 'stuck:<Kampf>:<Runde>:<Wiederaufnahmen>': nach einer kontrollierten Wiederaufnahme ist ein erneutes stuck derselben Runde ein NEUER Alarm (neue „Episode“).
alter table rwi.resolve_jobs add column resumes int not null default 0, add column last_engine text, add column resume_engine text;
-- Engine-Versionen (Hotfix-Wiederaufnahme, Beschluss): eine neue Engine-Version ist nur nutzbar, wenn sie registriert ist und dasselbe Zustandsschema (state_schema) wie der gespeicherte Zustand hat.
create table rwi.engine_versions (version text primary key check (length(version) between 1 and 80), state_schema int not null, registered_at timestamptz not null default clock_timestamp(), note text);
alter table rwi.fights add column state_schema int not null default 1;     -- Schema des gespeicherten Kampfzustands (heute 1)
alter table rwi.ops_alerts add column fight_id bigint, add column round_no int, add column dedupe_key text,
  add column state text not null default 'open' check (state in ('open','resolved')), add column resolved_at timestamptz, add column resolved_note text;
create unique index ops_alerts_dedupe_uq on rwi.ops_alerts (dedupe_key) where dedupe_key is not null;
-- Betreiber (Operatoren): Konten, die Wiederaufnahme, technische Beendigung und Engine-Registrierung auslösen dürfen. Identität = Supabase-Konto (auth.uid(), von GoTrue geprüft), NIE ein Freitext.
-- Verwaltung ausschließlich serverseitig (SQL/Migration, kein Client- und kein Wrapper-Zugriff): rwi.set_operator. Jede Änderung wird in rwi.ops_log festgehalten.
create table rwi.operators (account_id uuid primary key, label text not null check (length(btrim(label)) between 2 and 80), scopes text[] not null check (scopes <> '{}' and scopes <@ array['resume','terminate','engine']),
  active boolean not null default true, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp());
-- Betriebsprotokoll: jede kontrollierte Wiederaufnahme, technische Beendigung, Engine-Registrierung, abgewiesene Operatoraufrufe und Betreiberänderung (nur anhängen, nie ändern oder löschen)
create table rwi.ops_log (id bigint generated always as identity primary key, at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('resume','terminate','hotfix_commit','register_engine','denied','operator_change')),
  fight_id bigint, round_no int, instance_id bigint, operator_id uuid, operator text, note text, old_engine text, new_engine text);
create function rwi.ops_log_append_only() returns trigger language plpgsql as $$ begin raise exception 'ops_log ist nur zum Anhängen' using errcode = '42501'; end $$;
create trigger ops_log_no_change before update or delete on rwi.ops_log for each row execute function rwi.ops_log_append_only();
-- Prüft einen Betreiber (aktiv, Berechtigung); liefert die Bezeichnung oder null. Abgewiesene Versuche werden protokolliert.
create function rwi.operator_removed() returns trigger language plpgsql as $$
begin insert into rwi.ops_log(kind, operator_id, operator, note) values ('operator_change', old.account_id, old.label, 'Betreiberzeile entfernt'); return old; end $$;
create trigger operators_removed after delete on rwi.operators for each row execute function rwi.operator_removed();
create function rwi.check_operator(p_operator uuid, p_scope text, p_fight bigint default null, p_round int default null, p_note text default null) returns text language plpgsql as $$
declare o rwi.operators;
begin
  select * into o from rwi.operators where account_id = p_operator;
  if found and o.active and p_scope = any(o.scopes) then return o.label; end if;
  insert into rwi.ops_log(kind, fight_id, round_no, instance_id, operator_id, operator, note) values ('denied', p_fight, p_round, (select instance_id from rwi.fights where id = p_fight), p_operator, o.label,
    p_scope || ': ' || case when not found then 'kein Betreiber' when not o.active then 'Betreiber deaktiviert' else 'Berechtigung fehlt' end);
  return null;
end $$;
create function rwi.set_operator(p_account uuid, p_label text, p_scopes text[], p_active boolean default true) returns void language plpgsql as $$
begin
  insert into rwi.operators(account_id, label, scopes, active) values (p_account, btrim(p_label), p_scopes, p_active)
    on conflict (account_id) do update set label = excluded.label, scopes = excluded.scopes, active = excluded.active, updated_at = clock_timestamp();
  insert into rwi.ops_log(kind, operator_id, operator, note) values ('operator_change', p_account, btrim(p_label), 'scopes=' || array_to_string(p_scopes, ',') || ' active=' || p_active);
end $$;
create function rwi.raise_stuck(p_fight bigint, p_round int) returns void language plpgsql as $$
declare ep int;
begin
  select resumes into ep from rwi.resolve_jobs where fight_id = p_fight and round_no = p_round;
  insert into rwi.ops_alerts(what, detail, fight_id, round_no, dedupe_key)
    values ('stuck', 'fight ' || p_fight || ' round ' || p_round, p_fight, p_round, 'stuck:' || p_fight || ':' || p_round || ':' || coalesce(ep, 0))
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
end $$;
create function rwi.close_stuck(p_fight bigint, p_round int, p_kind text, p_operator uuid, p_note text, p_old_engine text default null, p_new_engine text default null) returns void language plpgsql as $$
begin
  insert into rwi.ops_log(kind, fight_id, round_no, instance_id, operator_id, operator, note, old_engine, new_engine)
    values (p_kind, p_fight, p_round, (select instance_id from rwi.fights where id = p_fight), p_operator, (select label from rwi.operators where account_id = p_operator), p_note, p_old_engine, p_new_engine);
  update rwi.ops_alerts set state = 'resolved', resolved_at = clock_timestamp(), resolved_note = p_kind || coalesce(': ' || p_note, '') where what = 'stuck' and fight_id = p_fight and round_no = p_round and state = 'open';
end $$;

create or replace function rwi.commit_round(p_fight bigint, p_round int, p_token uuid, p_expected_version int, p_input_hash text, p_engine text, p_result jsonb) returns jsonb language plpgsql as $$
declare i rwi.instances; f rwi.fights; t timestamptz; bad text; outc text; m jsonb; nxt int; hold boolean := false; ev jsonb; jprev text; jnew text; jeng text;
begin
  select instance_id into strict nxt from rwi.fights where id = p_fight;
  select * into i from rwi.instances where id = nxt for update;
  select * into f from rwi.fights where id = p_fight for update;
  t := clock_timestamp();                                                    -- nach Erhalt der Sperre (E.2)
  if exists (select 1 from rwi.round_results where fight_id = p_fight and round_no = p_round) then return jsonb_build_object('status','already_resolved'); end if;
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  if i.ends_at is not null and t >= i.ends_at then                            -- K.2 Regel 6: kein Ergebnis, Instanz endet, KEIN Rollback
    perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if f.round_no <> p_round or f.claim_token is distinct from p_token or f.round_version <> p_expected_version then return jsonb_build_object('status','superseded'); end if;
  if f.input_hash <> p_input_hash then return jsonb_build_object('status','input_mismatch'); end if;
  select status, resume_engine into jprev, jeng from rwi.resolve_jobs where fight_id = p_fight and round_no = p_round;
  if jprev = 'stuck' then return jsonb_build_object('status','stuck_locked'); end if;                      -- „stuck“ bleibt bis zur ausdrücklichen Operatorentscheidung (resume_stuck) gesperrt: kein Commit, kein Zähler, kein Alarm
  if jeng is not null and jeng is distinct from p_engine then return jsonb_build_object('status','engine_mismatch'); end if;   -- nach resume_stuck nur mit der freigegebenen Engine-Version
  -- Invarianten (E.5): nur ungültige Zustände, keine Logikprüfung
  outc := p_result->>'outcome';
  if outc is null or outc not in ('won','lost','continue') then bad := 'outcome'; end if;
  for m in select * from jsonb_array_elements(p_result->'state'->'members') loop
    if (m->>'hp')::int < 0 or (m->>'hp')::int > (m->>'maxhp')::int then bad := 'hp_range'; end if;
    if (m->>'alive')::boolean and (m->>'hp')::int = 0 then bad := 'alive_hp0'; end if;
  end loop;
  if (p_result->'state'->'monster'->>'hp')::int < 0 then bad := 'monster_hp'; end if;
  if bad is not null then
    jprev := null;
    update rwi.resolve_jobs set attempts = attempts + 1, last_error = 'invariant:' || bad, last_engine = left(p_engine, 80),
      status = case when attempts + 1 >= rwi.cfg('max_attempts') then 'stuck' else status end where fight_id = p_fight and round_no = p_round returning status into jnew;
    if jnew = 'stuck' then
      update rwi.instances set engine_stuck = true where id = i.id;
      if jprev is distinct from 'stuck' then perform rwi.raise_stuck(p_fight, p_round); end if;      -- nur beim Übergang, nie bei weiteren Fehlversuchen
    end if;
    return jsonb_build_object('status','invalid','reason',bad);                -- Transaktion schließt mit Fehlerzähler ab
  end if;
  insert into rwi.round_results(fight_id, round_no, engine_version, input, input_hash, result, completed_at)
    values (p_fight, p_round, p_engine, jsonb_build_object('fight_id', p_fight, 'round_no', p_round, 'seed', encode(i.seed,'hex'), 'cfg_version', i.cfg_version, 'snapshot', f.snapshot), f.input_hash, p_result, t);
  -- Todesfenster (Plan 1b): neue Tode öffnen je ein eigenes Fenster, Wiederbelebte/Ausgetretene schließen ihres; verbrauchte Items abbuchen (nur bei Erfolg)
  for ev in select * from jsonb_array_elements(p_result->'log') loop
    if ev->>'e' = 'item_revive' then update rwi.members set revive_items = revive_items - 1 where instance_id = i.id and key = ev->>'u' and revive_items > 0; end if;
  end loop;
  perform rwi.sync_windows(p_fight, i.id, p_result->'state', outc in ('won'));
  if outc = 'lost' and p_result->>'reason' = 'wipe' then hold := rwi.wipe_hold(p_fight, i.id, t); end if;   -- alle tot: Kampf angehalten, solange ein nutzbares Fenster offen ist
  if outc in ('won','lost') and not hold then perform rwi.sync_windows(p_fight, i.id, p_result->'state', true); end if;
  update rwi.fights set state = p_result->'state', actions = '{}', revive_ok = '[]', item_ok = '[]', resume = false, due_remaining_ms = null, snapshot = null, input_hash = null, claim_token = null, lease_until = null,
    round_version = round_version + 1, round_no = case when outc = 'continue' or hold then round_no + 1 else round_no end,
    phase = case when hold then 'wipe_wait' when outc = 'continue' then 'planning' else 'done' end, status = case when outc = 'continue' or hold then 'active' else outc end,
    due_at = case when i.paused_at is not null then 'infinity'::timestamptz else t + make_interval(secs => rwi.cfg('round_seconds')) end where id = p_fight;
  update rwi.resolve_jobs set status = 'done' where fight_id = p_fight and round_no = p_round;
  if i.engine_stuck and not exists (select 1 from rwi.resolve_jobs x join rwi.fights ff on ff.id = x.fight_id where ff.instance_id = i.id and x.status = 'stuck') then update rwi.instances set engine_stuck = false where id = i.id; end if;      -- Sicherheitsnetz (normalerweise schon von resume_stuck gesetzt)
  if outc = 'won' then
    insert into rwi.rewards(reward_id, instance_id, test_member, kind, payload)
      select 'final:' || i.id || ':' || (m2->>'id'), i.id, m2->>'id', 'coins', '{"test":true}'::jsonb from jsonb_array_elements(p_result->'state'->'members') m2 on conflict do nothing;
    if i.ends_at is not null then update rwi.instances set status = 'completed' where id = i.id; end if;
  end if;
  return jsonb_build_object('status','committed','outcome',outc,'completed_at',t,'hold',hold);
end $$;

create or replace function rwi.submit_action(p_fight bigint, p_key text, p_round int, p_action jsonb) returns jsonb language plpgsql as $$
declare i rwi.instances; f rwi.fights; t timestamptz; nxt bigint; mem jsonb; w rwi.death_windows; mode text := coalesce(p_action->>'mode','normal');
begin
  select instance_id into nxt from rwi.fights where id = p_fight; if not found then return jsonb_build_object('status','unknown_fight'); end if;
  select * into i from rwi.instances where id = nxt for update;
  select * into f from rwi.fights where id = p_fight for update;
  t := clock_timestamp();
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  if i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if f.round_no <> p_round then return jsonb_build_object('status', case when f.round_no > p_round then 'late' else 'stale' end); end if;
  if f.phase <> 'planning' then return jsonb_build_object('status','late'); end if;          -- Runde ist bereits eingefroren
  if not exists (select 1 from jsonb_array_elements(f.state->'members') m where m->>'id' = p_key and (m->>'alive')::boolean) then return jsonb_build_object('status','unknown_member'); end if;
  if jsonb_typeof(p_action) <> 'object' or length(coalesce(p_action->>'ability','')) not between 1 and 40 or length(coalesce(p_action->>'target','')) > 20 then return jsonb_build_object('status','invalid'); end if;
  if mode not in ('normal','revive') then return jsonb_build_object('status','invalid'); end if;
  if mode = 'revive' then                                                                    -- Wiederbelebung: Annahme nur mit offenem Fenster, passendem Todesfall und freiem Limit
    select m into mem from jsonb_array_elements(f.state->'members') m where m->>'id' = p_action->>'target';
    if mem is null or (mem->>'alive')::boolean then return jsonb_build_object('status','no_window'); end if;
    if coalesce((mem->>'gone')::boolean, false) or (mem->>'revives')::int >= rwi.cfg('revive_limit') or (p_action->>'death') is null or (p_action->>'death')::int <> (mem->>'deaths')::int then return jsonb_build_object('status','no_window'); end if;
    select * into w from rwi.death_windows where fight_id = p_fight and member_key = p_action->>'target' and death_no = (mem->>'deaths')::int and status = 'open';
    if not found or (w.until is not null and w.until <= t) then return jsonb_build_object('status','no_window'); end if;
    update rwi.fights set revive_ok = case when revive_ok @> to_jsonb(p_action->>'target') then revive_ok else revive_ok || to_jsonb(p_action->>'target') end where id = p_fight;   -- rechtzeitig angenommen: bleibt gültig, auch wenn die Auflösung nach Fensterablauf stattfindet
  end if;
  update rwi.fights set actions = actions || jsonb_build_object(p_key, jsonb_build_object('ability', p_action->>'ability') || case when p_action ? 'target' then jsonb_build_object('target', p_action->>'target') else '{}'::jsonb end
      || case when mode = 'revive' then jsonb_build_object('mode','revive','death',(p_action->>'death')::int) else '{}'::jsonb end) where id = p_fight;
  update rwi.members set last_seen_at = t where instance_id = i.id and key = p_key;
  return jsonb_build_object('status','ok');
end $$;
-- Wiederbelebungsitem (Sonderreaktion): vom Server rechtzeitig angenommen (Serverzeit), verbraucht wird erst bei erfolgreicher Wiederbelebung (commit_round).
create function rwi.use_revive_item(p_fight bigint, p_key text) returns jsonb language plpgsql as $$
declare i rwi.instances; f rwi.fights; t timestamptz; nxt bigint; mem jsonb; w rwi.death_windows; mb rwi.members;
begin
  select instance_id into nxt from rwi.fights where id = p_fight; if not found then return jsonb_build_object('status','unknown_fight'); end if;
  select * into i from rwi.instances where id = nxt for update;
  select * into f from rwi.fights where id = p_fight for update;
  t := clock_timestamp();
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  if i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true); return jsonb_build_object('status','event_ended'); end if;
  if f.status <> 'active' or f.phase not in ('planning','wipe_wait') then return jsonb_build_object('status','late'); end if;
  select m into mem from jsonb_array_elements(f.state->'members') m where m->>'id' = p_key;
  if mem is null or (mem->>'alive')::boolean or coalesce((mem->>'gone')::boolean, false) or (mem->>'revives')::int >= rwi.cfg('revive_limit') then return jsonb_build_object('status','no_window'); end if;
  select * into w from rwi.death_windows where fight_id = p_fight and member_key = p_key and death_no = (mem->>'deaths')::int and status = 'open';
  if not found or (w.until is not null and w.until <= t) or not w.item_open then return jsonb_build_object('status','no_window'); end if;
  select * into mb from rwi.members where instance_id = i.id and key = p_key;
  if mb.revive_items <= 0 then return jsonb_build_object('status','no_item'); end if;
  if f.item_ok @> to_jsonb(p_key) then return jsonb_build_object('status','ok'); end if;                         -- doppelte Sendung: kein zweiter Einsatz
  update rwi.fights set item_ok = item_ok || to_jsonb(p_key) where id = p_fight;
  update rwi.death_windows set item_open = false where id = w.id;
  if f.phase = 'wipe_wait' then update rwi.fights set phase = 'planning', resume = true, due_at = t where id = p_fight; end if;    -- Wiederaufnahme sofort
  return jsonb_build_object('status','ok');
end $$;
create function rwi.decline_revive_item(p_fight bigint, p_key text) returns jsonb language plpgsql as $$
declare nxt bigint; i rwi.instances; r int;
begin
  select instance_id into nxt from rwi.fights where id = p_fight; if not found then return jsonb_build_object('status','unknown_fight'); end if;
  select * into i from rwi.instances where id = nxt for update;
  update rwi.death_windows w set item_open = false where fight_id = p_fight and member_key = p_key and status = 'open' and item_open; get diagnostics r = row_count;
  return jsonb_build_object('status', case when r > 0 then 'ok' else 'no_window' end);
end $$;

-- Verbindungsstatus und Gruppenpause: Pause nur, wenn kein Mitglied der Instanz verbunden ist. Angehalten: Fenster (Restzeit) und Rundentimer. Budget 5 Minuten je Instanz.
create function rwi.set_connection(p_instance bigint, p_key text, p_connected boolean) returns jsonb language plpgsql as $$
declare i rwi.instances; t timestamptz; n int;
begin
  select * into i from rwi.instances where id = p_instance for update; t := clock_timestamp();
  update rwi.members set connected = p_connected, last_seen_at = case when p_connected then t else last_seen_at end where instance_id = p_instance and key = p_key;
  select count(*) into n from rwi.members where instance_id = p_instance and connected;
  if i.status = 'active' and n = 0 and i.paused_at is null then
    update rwi.instances set paused_at = t where id = p_instance;
    update rwi.death_windows w set remaining_ms = greatest(0, (extract(epoch from (w.until - t)) * 1000)::bigint), until = null where w.status = 'open' and w.until is not null and w.fight_id in (select id from rwi.fights where instance_id = p_instance);
    update rwi.fights set due_remaining_ms = greatest(0, (extract(epoch from (due_at - t)) * 1000)::bigint), due_at = 'infinity' where instance_id = p_instance and status = 'active' and phase = 'planning' and due_at <> 'infinity';
    return jsonb_build_object('status','paused');
  elsif n > 0 and i.paused_at is not null then
    update rwi.instances set pause_used_ms = pause_used_ms + (extract(epoch from (t - paused_at)) * 1000)::bigint, paused_at = null where id = p_instance;
    update rwi.death_windows w set until = t + make_interval(secs => w.remaining_ms / 1000.0) where w.status = 'open' and w.until is null and w.fight_id in (select id from rwi.fights where instance_id = p_instance);
    update rwi.fights set due_at = t + make_interval(secs => coalesce(due_remaining_ms, 0) / 1000.0), due_remaining_ms = null where instance_id = p_instance and status = 'active' and phase = 'planning' and due_at = 'infinity';
    return jsonb_build_object('status','resumed');
  end if;
  return jsonb_build_object('status','unchanged');
end $$;

-- Watchdog: wie bisher, zusätzlich (4) abgelaufene Fenster schließen, (5) angehaltene Kämpfe ohne nutzbares Fenster beenden (Niederlage), (6) Pausenbudget prüfen (Abbruch).
create or replace function rwi.watchdog_tick() returns jsonb language plpgsql as $$
declare ev bigint; n int := 0; due jsonb; redo jsonb; t timestamptz := clock_timestamp(); fid bigint; iid bigint; lost int := 0; ab int := 0; ex int := 0; r int;
begin
  for ev in select distinct event_id from rwi.instances where event_id is not null and status in ('active','frozen') and ends_at is not null and ends_at <= t order by 1 loop
    n := n + rwi.sweep_event(ev);
  end loop;
  update rwi.death_windows set status = 'closed', closed_reason = 'expired' where status = 'open' and until is not null and until <= t; get diagnostics ex = row_count;
  for fid, iid in select f.id, f.instance_id from rwi.fights f join rwi.instances i on i.id = f.instance_id where f.status = 'active' and f.phase = 'wipe_wait' and i.status = 'active' order by f.id loop
    perform 1 from rwi.instances where id = iid for update skip locked; if not found then continue; end if;       -- gesperrte Instanz: nächster Tick
    if (select status from rwi.instances where id = iid) = 'active' and exists (select 1 from rwi.fights where id = fid and status = 'active' and phase = 'wipe_wait') and not rwi.wipe_hold(fid, iid, t) then
      update rwi.fights set status = 'lost', phase = 'done' where id = fid; perform rwi.sync_windows(fid, iid, '{"members":[]}'::jsonb, true); lost := lost + 1;
    end if;
  end loop;
  for iid in select id from rwi.instances where status = 'active' and paused_at is not null and pause_used_ms + (extract(epoch from (t - paused_at)) * 1000)::bigint >= rwi.cfg('pause_budget_seconds') * 1000 order by id loop
    perform 1 from rwi.instances where id = iid and status = 'active' for update skip locked; if not found then continue; end if;
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

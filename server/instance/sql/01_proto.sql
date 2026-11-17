-- PROTOTYP Instanzkampf, Phase 0. Eigenes Schema "rwi", nur Testdaten, keine Verbindung zu Spielercharakteren oder public-Tabellen.
-- Setzt den Architekturbericht V2 um: A.2/A.6 (Aufträge, stuck), D.1/F (effective_last_seen), E.1 (claim/commit), K.2 (Eventende).
create extension if not exists pgcrypto;
create schema if not exists rwi;

create table rwi.cfg (k text primary key, v numeric not null);
insert into rwi.cfg values ('lease_seconds', 30), ('round_seconds', 60), ('max_attempts', 8), ('gap_seconds', 60), ('disc_seconds', 20);
create function rwi.cfg(p text) returns numeric language sql stable as $$ select v from rwi.cfg where k = p $$;

create table rwi.instances (
  id bigint generated always as identity primary key,
  event_id bigint, ends_at timestamptz,                         -- nur Weltboss (K)
  status text not null default 'active' check (status in ('active','event_ended','aborted','technical_end','frozen','completed')),
  engine_stuck boolean not null default false,
  seed bytea not null default gen_random_bytes(32), cfg_version int not null default 1);
create index on rwi.instances (event_id) where status in ('active','frozen');

create table rwi.members (id bigint generated always as identity primary key, instance_id bigint not null references rwi.instances, last_seen_at timestamptz not null);

create table rwi.fights (
  id bigint generated always as identity primary key, instance_id bigint not null references rwi.instances,
  round_no int not null default 1, round_version int not null default 0,
  phase text not null default 'planning' check (phase in ('planning','resolving','done')),
  status text not null default 'active' check (status in ('active','won','lost','event_ended','technical_end')),
  due_at timestamptz not null, claim_token uuid, lease_until timestamptz,
  state jsonb not null, actions jsonb not null default '{}', snapshot jsonb, input_hash text);

create table rwi.resolve_jobs (
  fight_id bigint not null references rwi.fights, round_no int not null,
  status text not null default 'pending' check (status in ('pending','claimed','done','stuck','cancelled')),
  attempts int not null default 0, last_error text, last_dispatch_at timestamptz,
  primary key (fight_id, round_no));                           -- unique (fight, round)

create table rwi.round_results (
  fight_id bigint not null references rwi.fights, round_no int not null,
  engine_version text not null, input jsonb not null, input_hash text not null, result jsonb not null, completed_at timestamptz not null,
  primary key (fight_id, round_no));                           -- zweite Sperre gegen Doppelverarbeitung

create table rwi.rewards (reward_id text primary key, instance_id bigint not null, test_member text not null, kind text not null, payload jsonb not null, issued_at timestamptz not null default clock_timestamp());
create table rwi.system_heartbeat (id int primary key default 1 check (id = 1), at timestamptz not null);
create table rwi.system_gaps (id bigint generated always as identity primary key, from_at timestamptz not null, to_at timestamptz not null);
create table rwi.ops_alerts (id bigint generated always as identity primary key, at timestamptz not null default clock_timestamp(), what text, detail text);

-- Hilfsfunktion: Eventende-Abschluss je Event, mengenbasiert, Sperren in aufsteigender ID (K.2 Regel 4).
create function rwi.sweep_event(p_event bigint) returns int language plpgsql as $$
declare n int;
begin
  with locked as (
    select id from rwi.instances where event_id = p_event and status in ('active','frozen') and ends_at is not null and clock_timestamp() >= ends_at
    order by id for update),
  upd as (update rwi.instances i set status = 'event_ended', engine_stuck = false from locked l where i.id = l.id returning i.id),
  f as (update rwi.fights f set status = 'event_ended', phase = 'done', claim_token = null, lease_until = null
        where f.instance_id in (select id from upd) and f.status = 'active' returning f.id),
  j as (update rwi.resolve_jobs j set status = 'cancelled' where j.fight_id in (select id from f) and j.status in ('pending','claimed','stuck') returning 1)
  select count(*) into n from upd;
  return n;
end $$;

-- Beendet NUR die eigene, bereits gesperrte Instanz (kein Zugriff auf fremde Sperren -> keine Zyklen mit dem Massen-Sweep).
create function rwi.end_instance(p_instance bigint) returns void language plpgsql as $$
begin
  update rwi.instances set status = 'event_ended', engine_stuck = false where id = p_instance and status in ('active','frozen');
  with f as (update rwi.fights set status = 'event_ended', phase = 'done', claim_token = null, lease_until = null
             where instance_id = p_instance and status = 'active' returning id)
  update rwi.resolve_jobs set status = 'cancelled' where fight_id in (select id from f) and status in ('pending','claimed','stuck');
end $$;

-- E.1 Transaktion 1: claim_resolution
create function rwi.claim_resolution(p_fight bigint, p_round int) returns jsonb language plpgsql as $$
declare i rwi.instances; f rwi.fights; tok uuid := gen_random_uuid(); snap jsonb; inp jsonb; h text; t timestamptz;
begin
  select * into f from rwi.fights where id = p_fight;                       -- ungesperrt nur, um die Instanz zu finden
  if not found then return jsonb_build_object('status','unknown_fight'); end if;
  select * into i from rwi.instances where id = f.instance_id for update;   -- eine Sperre: die Instanzzeile
  select * into f from rwi.fights where id = p_fight for update;            -- danach neu lesen (jetzt unter Sperre)
  t := clock_timestamp();
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  if i.ends_at is not null and t >= i.ends_at then perform rwi.end_instance(i.id); return jsonb_build_object('status','event_ended'); end if;
  if f.round_no <> p_round then return jsonb_build_object('status', case when f.round_no > p_round then 'already_resolved' else 'stale' end); end if;
  if f.phase = 'done' then return jsonb_build_object('status','already_resolved'); end if;
  if f.phase = 'resolving' and f.lease_until > t then return jsonb_build_object('status','busy'); end if;
  if f.phase = 'planning' then
    if f.due_at > t then return jsonb_build_object('status','not_due'); end if;
    snap := jsonb_build_object('state', f.state, 'actions', f.actions, 'conn', '{}'::jsonb);   -- Snapshot einfrieren
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

-- E.1 Transaktion 2: commit_round (+ K.2 Regel 6, + Invarianten, + A.6 Fehlerzählung)
create function rwi.commit_round(p_fight bigint, p_round int, p_token uuid, p_expected_version int, p_input_hash text, p_engine text, p_result jsonb) returns jsonb language plpgsql as $$
declare i rwi.instances; f rwi.fights; t timestamptz; bad text; outc text; m jsonb; nxt int;
begin
  select instance_id into strict nxt from rwi.fights where id = p_fight;
  select * into i from rwi.instances where id = nxt for update;
  select * into f from rwi.fights where id = p_fight for update;
  t := clock_timestamp();                                                    -- nach Erhalt der Sperre (E.2)
  if exists (select 1 from rwi.round_results where fight_id = p_fight and round_no = p_round) then return jsonb_build_object('status','already_resolved'); end if;
  if i.status <> 'active' then return jsonb_build_object('status', i.status); end if;
  if i.ends_at is not null and t >= i.ends_at then                            -- K.2 Regel 6: kein Ergebnis, Instanz endet, KEIN Rollback
    perform rwi.end_instance(i.id); return jsonb_build_object('status','event_ended'); end if;
  if f.round_no <> p_round or f.claim_token is distinct from p_token or f.round_version <> p_expected_version then return jsonb_build_object('status','superseded'); end if;
  if f.input_hash <> p_input_hash then return jsonb_build_object('status','input_mismatch'); end if;
  -- Invarianten (E.5): nur ungültige Zustände, keine Logikprüfung
  outc := p_result->>'outcome';
  if outc is null or outc not in ('won','lost','continue') then bad := 'outcome'; end if;
  for m in select * from jsonb_array_elements(p_result->'state'->'members') loop
    if (m->>'hp')::int < 0 or (m->>'hp')::int > (m->>'maxhp')::int then bad := 'hp_range'; end if;
    if (m->>'alive')::boolean and (m->>'hp')::int = 0 then bad := 'alive_hp0'; end if;
  end loop;
  if (p_result->'state'->'monster'->>'hp')::int < 0 then bad := 'monster_hp'; end if;
  if bad is not null then
    update rwi.resolve_jobs set attempts = attempts + 1, last_error = 'invariant:' || bad,
      status = case when attempts + 1 >= rwi.cfg('max_attempts') then 'stuck' else status end where fight_id = p_fight and round_no = p_round;
    if (select status from rwi.resolve_jobs where fight_id = p_fight and round_no = p_round) = 'stuck' then
      update rwi.instances set engine_stuck = true where id = i.id; insert into rwi.ops_alerts(what, detail) values ('stuck', 'fight ' || p_fight || ' round ' || p_round);
    end if;
    return jsonb_build_object('status','invalid','reason',bad);                -- Transaktion schließt mit Fehlerzähler ab
  end if;
  insert into rwi.round_results(fight_id, round_no, engine_version, input, input_hash, result, completed_at)
    values (p_fight, p_round, p_engine, jsonb_build_object('fight_id', p_fight, 'round_no', p_round, 'seed', encode(i.seed,'hex'), 'cfg_version', i.cfg_version, 'snapshot', f.snapshot), f.input_hash, p_result, t);
  update rwi.fights set state = p_result->'state', actions = '{}', snapshot = null, input_hash = null, claim_token = null, lease_until = null,
    round_version = round_version + 1, round_no = case when outc = 'continue' then round_no + 1 else round_no end,
    phase = case when outc = 'continue' then 'planning' else 'done' end, status = case when outc = 'continue' then 'active' else outc end,
    due_at = t + make_interval(secs => rwi.cfg('round_seconds')) where id = p_fight;
  update rwi.resolve_jobs set status = 'done' where fight_id = p_fight and round_no = p_round;
  if i.engine_stuck then update rwi.instances set engine_stuck = false where id = i.id; end if;                       -- A.6 Schritt 3
  if outc = 'won' then
    insert into rwi.rewards(reward_id, instance_id, test_member, kind, payload)
      select 'final:' || i.id || ':' || (m2->>'id'), i.id, m2->>'id', 'coins', '{"test":true}'::jsonb from jsonb_array_elements(p_result->'state'->'members') m2 on conflict do nothing;
    if i.ends_at is not null then update rwi.instances set status = 'completed' where id = i.id; end if;
  end if;
  return jsonb_build_object('status','committed','outcome',outc,'completed_at',t);
end $$;

-- F / D.1 / A.6: effective_last_seen, Lückenerkennung, 20-Sekunden-Regel (mit simulierter Uhr p_now)
create function rwi.advance_clock(p_instance bigint, p_now timestamptz) returns void language plpgsql as $$
declare hb timestamptz;
begin
  select at into hb from rwi.system_heartbeat where id = 1;
  if hb is not null and p_now - hb > make_interval(secs => rwi.cfg('gap_seconds')) then insert into rwi.system_gaps(from_at, to_at) values (hb, p_now); end if;  -- Lücke zuerst erkennen (F, 1a)
  insert into rwi.system_heartbeat(id, at) values (1, p_now) on conflict (id) do update set at = greatest(rwi.system_heartbeat.at, excluded.at);
end $$;
create function rwi.effective_last_seen(p_member bigint, p_now timestamptz) returns timestamptz language sql stable as $$
  select case when i.engine_stuck then p_now
              else greatest(m.last_seen_at, coalesce((select max(g.to_at) from rwi.system_gaps g), '-infinity')) end
  from rwi.members m join rwi.instances i on i.id = m.instance_id where m.id = p_member $$;
create function rwi.permanently_disconnected(p_member bigint, p_now timestamptz) returns boolean language sql stable as $$
  select p_now - rwi.effective_last_seen(p_member, p_now) >= make_interval(secs => rwi.cfg('disc_seconds')) $$;

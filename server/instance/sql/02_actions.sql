-- Phase 1: Aktionsabgabe und Watchdog für den Prototyp (Schema rwi, nur Testdaten). Setzt 01_proto.sql voraus.
alter table rwi.members add column key text;
create unique index on rwi.members (instance_id, key);

-- Ein Spieler bestätigt seine Aktion für die laufende Planungsphase. Nur Transaktionen auf der Instanzsperre (wie claim/commit, K.2 Regel 4).
create function rwi.submit_action(p_fight bigint, p_key text, p_round int, p_action jsonb) returns jsonb language plpgsql as $$
declare i rwi.instances; f rwi.fights; t timestamptz; nxt bigint;
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
  update rwi.fights set actions = actions || jsonb_build_object(p_key, jsonb_build_object('ability', p_action->>'ability') || case when p_action ? 'target' then jsonb_build_object('target', p_action->>'target') else '{}'::jsonb end) where id = p_fight;
  update rwi.members set last_seen_at = t where instance_id = i.id and key = p_key;
  return jsonb_build_object('status','ok');
end $$;

-- Watchdog: (1) beendet abgelaufene Events (Massenlauf ohne fremde Sperren), (2) meldet fällige Runden, (3) meldet Aufträge mit abgelaufener Lease.
-- Die Verarbeitung selbst stößt der Aufrufer an (im Betrieb: pg_net -> Edge Function; im Test: der Worker der Simulation).
create function rwi.watchdog_tick() returns jsonb language plpgsql as $$
declare ev bigint; n int := 0; due jsonb; redo jsonb; t timestamptz := clock_timestamp();
begin
  for ev in select distinct event_id from rwi.instances where event_id is not null and status in ('active','frozen') and ends_at is not null and ends_at <= t order by 1 loop
    n := n + rwi.sweep_event(ev);
  end loop;
  select coalesce(jsonb_agg(f.id order by f.id), '[]') into due from rwi.fights f join rwi.instances i on i.id = f.instance_id
    where f.status = 'active' and f.phase = 'planning' and f.due_at <= t and i.status = 'active' and not i.engine_stuck and (i.ends_at is null or i.ends_at > t);
  select coalesce(jsonb_agg(f.id order by f.id), '[]') into redo from rwi.fights f join rwi.instances i on i.id = f.instance_id
    where f.status = 'active' and f.phase = 'resolving' and f.lease_until < t and i.status = 'active' and not i.engine_stuck and (i.ends_at is null or i.ends_at > t);
  return jsonb_build_object('ended', n, 'due', due, 'redispatch', redo);
end $$;

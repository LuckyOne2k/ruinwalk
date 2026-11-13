-- Ruinwalk – Supabase/Postgres-Schema (Phase 1, überarbeitet)
-- Prinzipien:
--  * Der Server ist maßgeblich. Clients (Rollen anon/authenticated) bekommen KEINE Tabellenschreibrechte.
--  * Schreiben geschieht ausschließlich über SECURITY-DEFINER-Funktionen, die auth.uid() selbst prüfen,
--    mit festem search_path und ohne EXECUTE für PUBLIC.
--  * Row Level Security ist überall aktiv, zusätzlich sind die Tabellenrechte explizit eingeschränkt (zwei Schichten).
-- Test: supabase/tests/run.sh (echtes PostgreSQL mit Supabase-Attrappe).

------------------------------------------------------------------------------------------------
-- Tabellen
------------------------------------------------------------------------------------------------
-- Accounts: Login/Passwort/E-Mail-Verifizierung liegen in Supabase Auth (auth.users). Hier nur das Spielerprofil.
create table public.profiles (
  account_id  uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  created_at  timestamptz not null default now(),
  last_login  timestamptz,
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);
create unique index profiles_username_ci on public.profiles (lower(username));

create table public.account_entitlements (
  entitlement_id    uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.profiles(account_id) on delete cascade,
  entitlement_type  text not null check (entitlement_type in ('third_character_slot')),
  status            text not null check (status in ('pending','active','refunded','failed')),
  granted_at        timestamptz,
  payment_reference text,
  unique (account_id, entitlement_type)
);

create table public.payment_events (
  provider_event_id text primary key,                 -- idempotent: doppelte Webhooks werden abgewiesen
  account_id        uuid references public.profiles(account_id),
  kind              text not null check (kind in ('paid','refunded','failed')),
  payload           jsonb not null,
  processed_at      timestamptz not null default now()
);

create table public.characters (
  character_id    uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.profiles(account_id) on delete cascade,
  slot_number     smallint not null check (slot_number between 1 and 3),
  character_name  text not null check (char_length(character_name) between 1 and 16),
  character_class text not null default 'wanderer' check (character_class ~ '^[a-z_]{1,30}$'),
  level           int  not null default 1 check (level between 1 and 50),
  character_data  jsonb not null check (jsonb_typeof(character_data) = 'object' and pg_column_size(character_data) < 1000000),
  version         int  not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_played     timestamptz,
  unique (account_id, slot_number)
);

-- Rollende Sicherung. Bewusst OHNE Fremdschlüssel auf den Charakter, damit Sicherungen nach dem Löschen eines
-- Charakters für eine spätere Wiederherstellungsfunktion erhalten bleiben. Sie hängen am Account.
create table public.character_backups (
  backup_id      bigserial primary key,
  character_id   uuid not null,
  account_id     uuid not null references public.profiles(account_id) on delete cascade,   -- Konto löschen entfernt auch die Sicherungen (Datenschutz)
  version        int  not null,
  reason         text not null check (reason in ('update','delete')),
  character_data jsonb not null,
  saved_at       timestamptz not null default now()
);
create index character_backups_char on public.character_backups (character_id, backup_id desc);

create table public.audit_log (
  id bigserial primary key,
  account_id   uuid,
  character_id uuid,
  action       text not null,
  detail       jsonb,
  at           timestamptz not null default now()
);

------------------------------------------------------------------------------------------------
-- Hilfsfunktionen (intern, nicht für Clients aufrufbar)
------------------------------------------------------------------------------------------------
create or replace function public.has_entitlement(p_account uuid, p_type text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.account_entitlements
                 where account_id = p_account and entitlement_type = p_type and status = 'active');
$$;

-- Spielen/Speichern erst nach bestätigter E-Mail-Adresse (verhindert Namens-/Platzbelegung mit Wegwerf-Registrierungen).
create or replace function public.is_verified(p_account uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from auth.users where id = p_account and email_confirmed_at is not null);
$$;

------------------------------------------------------------------------------------------------
-- Trigger
------------------------------------------------------------------------------------------------
-- Profil automatisch nach der Registrierung. Der Benutzername kommt aus den Registrierungsdaten (options.data.username).
-- Fehlt er oder ist er ungültig/vergeben, scheitert die Registrierung vollständig (kein Konto ohne Profil).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare u text := new.raw_user_meta_data ->> 'username';
begin
  if u is null or u !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  insert into public.profiles(account_id, username) values (new.id, u);   -- unique_violation bei vergebenem Namen
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Spätere Änderungen an raw_user_meta_data (der Nutzer kann sie selbst ändern) beeinflussen das Profil bewusst NICHT.

-- Benutzername ist für Clients unveränderlich (zusätzlich zum fehlenden UPDATE-Recht).
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_id <> old.account_id then raise exception 'immutable' using errcode = '42501'; end if;
  if new.username <> old.username and coalesce(auth.role(),'') in ('anon','authenticated') then
    raise exception 'username_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- Platz 3 nur mit aktiver Berechtigung; Identität eines Charakters ist unveränderlich. Gilt für JEDEN Schreibweg.
create or replace function public.guard_character() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.slot_number = 3 and tg_op = 'INSERT' and not public.has_entitlement(new.account_id, 'third_character_slot') then
    raise exception 'slot_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.character_id <> old.character_id or new.account_id <> old.account_id
                           or new.slot_number <> old.slot_number or new.created_at <> old.created_at) then
    raise exception 'immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger characters_guard before insert or update on public.characters for each row execute function public.guard_character();

-- Sicherung vor jeder Änderung der Daten und vor dem Löschen; je Charakter bleiben die letzten 10 Update-Sicherungen.
create or replace function public.backup_character() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- läuft das Löschen als Kaskade eines Kontos, existiert das Profil nicht mehr: dann keine neue Sicherung
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where account_id = old.account_id) then return old; end if;
  insert into public.character_backups(character_id, account_id, version, reason, character_data)
  values (old.character_id, old.account_id, old.version, case tg_op when 'DELETE' then 'delete' else 'update' end, old.character_data);
  delete from public.character_backups
   where character_id = old.character_id and reason = 'update'
     and backup_id not in (select backup_id from public.character_backups
                           where character_id = old.character_id and reason = 'update' order by backup_id desc limit 10);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger characters_backup_upd before update of character_data on public.characters for each row execute function public.backup_character();
create trigger characters_backup_del before delete on public.characters for each row execute function public.backup_character();

-- Berechtigungsänderungen (Kauf, Rückerstattung) protokollieren.
create or replace function public.audit_entitlement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_log(account_id, action, detail)
  values (new.account_id, 'entitlement_'||lower(tg_op), jsonb_build_object('type', new.entitlement_type, 'status', new.status, 'ref', new.payment_reference));
  return new;
end $$;
create trigger entitlements_audit after insert or update on public.account_entitlements for each row execute function public.audit_entitlement();

------------------------------------------------------------------------------------------------
-- Client-Funktionen (SECURITY DEFINER, prüfen auth.uid() selbst)
------------------------------------------------------------------------------------------------
create or replace function public.username_available(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_name ~ '^[A-Za-z0-9_]{3,20}$' and not exists (select 1 from public.profiles where lower(username) = lower(p_name));
$$;

create or replace function public.touch_login() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.profiles set last_login = now() where account_id = auth.uid();
end $$;

-- Charakter anlegen. Der Client kann weder ID, Version, Zeitstempel noch Platzregeln beeinflussen.
create or replace function public.create_character(p_slot int, p_name text, p_data jsonb default '{}'::jsonb)
returns table(character_id uuid, version int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); nm text := btrim(coalesce(p_name,'')); cid uuid := gen_random_uuid(); d jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_verified(uid) then raise exception 'email_not_verified' using errcode = '42501'; end if;
  if p_slot is null or p_slot not between 1 and 3 then raise exception 'invalid_slot' using errcode = '22023'; end if;
  if nm = '' or char_length(nm) > 16 or nm ~ '[<>&"''`[:cntrl:]]' then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_data' using errcode = '22023'; end if;
  d := jsonb_set(jsonb_set(p_data, '{cid}', to_jsonb(cid::text)), '{name}', to_jsonb(nm));
  insert into public.characters(character_id, account_id, slot_number, character_name, character_class, level, character_data)
  values (cid, uid, p_slot, nm, public.safe_class(d), public.safe_level(d), d);   -- Platzsperre/Eindeutigkeit: Trigger bzw. unique
  insert into public.audit_log(account_id, character_id, action) values (uid, cid, 'character_created');
  return query select cid, 1;
end $$;

-- Klasse und Level werden aus den Daten abgeleitet (nie vom Client getrennt übergeben) und begrenzt.
create or replace function public.safe_class(d jsonb) returns text language sql immutable set search_path = public, pg_temp as $$
  select case when d->>'cls' ~ '^[a-z_]{1,30}$' then d->>'cls' else 'wanderer' end;
$$;
create or replace function public.safe_level(d jsonb) returns int language sql immutable set search_path = public, pg_temp as $$
  select case when d->>'lv' ~ '^[0-9]{1,9}$' then least(greatest((d->>'lv')::int, 1), 50) else 1 end;
$$;

-- Speichern mit Versionsprüfung (verhindert Überschreiben durch ein zweites Gerät, fremde Charaktere und ungültige Daten).
create or replace function public.save_character(p_id uuid, p_expected_version int, p_data jsonb)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v int; d jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_verified(uid) then raise exception 'email_not_verified' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data = '{}'::jsonb then raise exception 'invalid_data' using errcode = '22023'; end if;
  d := jsonb_set(p_data, '{cid}', to_jsonb(p_id::text));
  update public.characters c
     set character_data = d, character_class = public.safe_class(d), level = public.safe_level(d),
         version = c.version + 1, updated_at = now(), last_played = now()
   where c.character_id = p_id and c.account_id = uid and c.version = p_expected_version
   returning c.version into v;
  if v is null then
    -- gleiche Meldung für "fremd/nicht vorhanden" und "falsche Version": verrät nichts über fremde Charaktere
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  return v;
end $$;

create or replace function public.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.characters where character_id = p_id and account_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_log(account_id, character_id, action) values (uid, p_id, 'character_deleted');
end $$;

------------------------------------------------------------------------------------------------
-- Rechte: erst alles entziehen, dann gezielt vergeben
------------------------------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.account_entitlements enable row level security;
alter table public.payment_events       enable row level security;
alter table public.characters           enable row level security;
alter table public.character_backups    enable row level security;
alter table public.audit_log            enable row level security;

revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Lesen nur Eigenes. Keine INSERT/UPDATE/DELETE-Rechte für Clients.
grant select on public.profiles, public.account_entitlements, public.characters to authenticated;
create policy profiles_own_read on public.profiles             for select to authenticated using (account_id = auth.uid());
create policy ent_own_read      on public.account_entitlements for select to authenticated using (account_id = auth.uid());
create policy char_own_read     on public.characters           for select to authenticated using (account_id = auth.uid());
-- payment_events, character_backups, audit_log: bewusst keine Policy und keine Rechte für Clients.

grant execute on function public.create_character(int,text,jsonb) to authenticated;
grant execute on function public.save_character(uuid,int,jsonb)    to authenticated;
grant execute on function public.delete_character(uuid)            to authenticated;
grant execute on function public.touch_login()                     to authenticated;
grant execute on function public.username_available(text)         to anon, authenticated;
-- Alle übrigen Funktionen (has_entitlement, Trigger, safe_*) sind nur intern und für Clients nicht aufrufbar.
-- Hinweis: Die SECURITY-DEFINER-Funktionen laufen als Tabellenbesitzer (in Supabase `postgres` mit BYPASSRLS)
-- und umgehen RLS deshalb. Sie prüfen auth.uid() ausdrücklich in jeder Anweisung (account_id = uid).

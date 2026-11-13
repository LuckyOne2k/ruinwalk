-- Ruinwalk – Supabase/Postgres-Schema (Phase 1: Entwurf, noch nicht eingespielt)
-- Prinzip: Der Server ist maßgeblich. Der Browser darf nur über RLS-Regeln und die RPC-Funktionen unten auf eigene Daten zugreifen.

create extension if not exists pgcrypto;

-- Accounts: Login/Passwort/E-Mail-Verifizierung übernimmt Supabase Auth (auth.users, Passwort-Hash dort, nie im Spiel).
create table public.profiles (
  account_id  uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  created_at  timestamptz not null default now(),
  last_login  timestamptz,
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);
create unique index profiles_username_ci on public.profiles (lower(username));

-- Berechtigungen (z. B. dritter Charakterplatz). Clients dürfen NUR lesen; Schreiben nur Service-Role (Zahlungs-Webhook).
create table public.account_entitlements (
  entitlement_id    uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.profiles(account_id) on delete cascade,
  entitlement_type  text not null check (entitlement_type in ('third_character_slot')),
  status            text not null check (status in ('pending','active','refunded','failed')),
  granted_at        timestamptz,
  payment_reference text,
  unique (account_id, entitlement_type)               -- ein Kauf gilt einmal pro Account
);

-- Zahlungsereignisse: idempotent über die Event-ID des Anbieters (doppelte Webhooks werden ignoriert).
create table public.payment_events (
  provider_event_id text primary key,
  account_id        uuid references public.profiles(account_id),
  kind              text not null,                    -- paid | refunded | failed
  payload           jsonb not null,
  processed_at      timestamptz not null default now()
);

create or replace function public.has_entitlement(p_account uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from account_entitlements
                 where account_id = p_account and entitlement_type = p_type and status = 'active');
$$;

-- Charaktere: slot_number 1..3, Platz 3 nur mit aktiver Berechtigung (serverseitig erzwungen).
create table public.characters (
  character_id    uuid primary key default gen_random_uuid(),   -- unveränderlich
  account_id      uuid not null references public.profiles(account_id) on delete cascade,
  slot_number     smallint not null check (slot_number between 1 and 3),
  character_name  text not null check (char_length(character_name) between 1 and 16),
  character_class text not null default 'wanderer',
  level           int  not null default 1 check (level between 1 and 50),
  character_data  jsonb not null check (pg_column_size(character_data) < 1000000),
  version         int  not null default 1,                       -- optimistische Sperre gegen parallele Änderungen
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_played     timestamptz,
  unique (account_id, slot_number)
);

create or replace function public.guard_slot() returns trigger language plpgsql as $$
begin
  if new.slot_number = 3 and not public.has_entitlement(new.account_id, 'third_character_slot') then
    raise exception 'slot_locked';
  end if;
  if tg_op = 'UPDATE' and (new.character_id <> old.character_id or new.account_id <> old.account_id or new.slot_number <> old.slot_number) then
    raise exception 'immutable';
  end if;
  return new;
end $$;
create trigger characters_guard before insert or update on public.characters for each row execute function public.guard_slot();

-- Rollende serverseitige Sicherung: vorheriger Stand wird bei jedem Update abgelegt, die letzten 10 je Charakter bleiben.
create table public.character_backups (
  backup_id     bigserial primary key,
  character_id  uuid not null references public.characters(character_id) on delete cascade,
  version       int not null,
  character_data jsonb not null,
  saved_at      timestamptz not null default now()
);
create or replace function public.backup_character() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into character_backups(character_id, version, character_data) values (old.character_id, old.version, old.character_data);
  delete from character_backups where character_id = old.character_id
    and backup_id not in (select backup_id from character_backups where character_id = old.character_id order by backup_id desc limit 10);
  return new;
end $$;
create trigger characters_backup before update of character_data on public.characters for each row execute function public.backup_character();

-- Protokoll kritischer Aktionen (Löschen, Kauf, Migration).
create table public.audit_log (
  id bigserial primary key, account_id uuid, character_id uuid, action text not null, detail jsonb, at timestamptz not null default now()
);

-- Row Level Security: jeder sieht und ändert nur Eigenes.
alter table public.profiles             enable row level security;
alter table public.account_entitlements enable row level security;
alter table public.payment_events       enable row level security;
alter table public.characters           enable row level security;
alter table public.character_backups    enable row level security;
alter table public.audit_log            enable row level security;

create policy profiles_own_read   on public.profiles for select using (account_id = auth.uid());
create policy ent_own_read        on public.account_entitlements for select using (account_id = auth.uid());   -- kein Insert/Update für Clients
create policy char_own_read       on public.characters for select using (account_id = auth.uid());
create policy char_own_insert     on public.characters for insert with check (account_id = auth.uid());       -- Platz 3 prüft der Trigger
-- Kein direktes UPDATE/DELETE für Clients: nur über die Funktionen unten (Versionsprüfung, Protokoll).
-- payment_events, character_backups, audit_log: keine Client-Policies (nur Service-Role).

-- Speichern mit Versionsprüfung: schlägt fehl, wenn jemand anderes (zweites Gerät) zwischenzeitlich gespeichert hat.
create or replace function public.save_character(p_id uuid, p_expected_version int, p_data jsonb, p_class text, p_level int)
returns int language plpgsql security invoker set search_path = public as $$
declare v int;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_data'; end if;   -- nie leeren/ungültigen Stand schreiben
  update characters set character_data = p_data, character_class = p_class, level = p_level,
         version = version + 1, updated_at = now(), last_played = now()
   where character_id = p_id and account_id = auth.uid() and version = p_expected_version
   returning version into v;
  if v is null then raise exception 'version_conflict'; end if;
  return v;
end $$;

create or replace function public.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from characters where character_id = p_id and account_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  insert into audit_log(account_id, character_id, action) values (auth.uid(), p_id, 'character_deleted');
end $$;
revoke all on function public.delete_character(uuid) from public; grant execute on function public.delete_character(uuid) to authenticated;
revoke all on function public.save_character(uuid,int,jsonb,text,int) from public; grant execute on function public.save_character(uuid,int,jsonb,text,int) to authenticated;

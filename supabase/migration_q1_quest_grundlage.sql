-- MIGRATION Q1 (NICHT ANGEWENDET): Quest-System Paket 2 – Server-Grundgerüst (docs/QUEST_PAKET2_BERICHT.md).
-- Nur nach ausdrücklicher Freigabe auf einem Projekt einspielen. Voraussetzung: Stand supabase/schema.sql vor Q1 (B2/B4 empfohlen, nicht zwingend:
-- Q1 ändert keine bestehende Funktion). Legt nur NEUE Objekte an (10 Tabellen, 18 Funktionen, 7 Trigger, 7 Lese-Policies) und verändert keine
-- Nutzerdaten. Rücknahme: supabase/rollback_q1_quest_grundlage.sql. Die Tages-/Wochenaktivierung bleibt bis Paket 3 gesperrt (K1/K2).
-- Gleichwertigkeit mit supabase/schema.sql prüft server/instance/tests/quest-sperren.mjs (QS-10, Katalogvergleich).
begin;
------------------------------------------------------------------------------------------------
-- Quests – Paket 2 (Server-Grundgerüst). Entscheidungen K1–K4 (Pascal, 23.11.2026), Bericht docs/QUEST_PAKET2_BERICHT.md.
--  * Schlüssel: quest_key mit Bereichspräfix (st, pr, nb, tg, wo, ev), Instanzschlüssel inst_key, Belohnungs-ID rid = quest_key || '|' || inst_key.
--  * Perioden: Berliner Ortszeit (Europe/Berlin, mit Sommerzeit), Wechsel täglich um 09:00, Woche ab Montag 09:00.
--  * Rotation (K3, abschließend 23.11.2026): je Periode 3 verschiedene Quests, gewichtet und deterministisch aus dem Periodenschlüssel; zuerst aus
--    Vorlagen, die nicht in der unmittelbar vorherigen Periode vorkamen, reicht das nicht, gewichtet aus deren Quests aufgefüllt; bei weniger als
--    3 aktiven Vorlagen nur die verfügbaren (ohne Duplikate); einmal gespeichert, danach unveränderlich und für alle gleich.
--  * K1/K2: Tages-/Wochenaktivierung ist GESPERRT bis Paket 3. Die Queststufe kommt ausschließlich aus dem serverseitig bestätigten Level
--    (character_confirmed.level); ohne bestätigtes Level keine Aktivierung. character_confirmed wird NIE aus Client-Daten vorbelegt.
--  * K4: Mengenfaktor je Questdefinition (ziele[].faktor = genau 5 positive Zahlen für die Gebietsstufen 1–5; ohne faktor keine Skalierung).
--  * Sperrfolge aller Quest-RPCs: Rotation (eigene Anweisung, vor jeder Charaktersperre) -> Profil (for key share) -> Charakterzeile
--    -> character_confirmed -> character_quests -> quest_rewards. Die Löschkaskade (Profil -> Charakter -> Questzeilen) folgt derselben Reihenfolge.
--  * Questzeilen und Gutschriften werden nie gelöscht (nur die Kaskade beim Löschen des Charakters bzw. Kontos entfernt sie, Datenschutz).
------------------------------------------------------------------------------------------------
-- Prüffunktionen für Tabellenregeln (rein, ohne Tabellenzugriff)
create or replace function public.quest_bereich(p_key text) returns text language sql immutable set search_path = public, pg_temp as $$
  select case split_part(p_key, ':', 1) when 'st' then 'story' when 'pr' then 'pruefung' when 'nb' then 'neben'
                                       when 'tg' then 'tag' when 'wo' then 'woche' when 'ev' then 'event' end;
$$;
-- ziele: nicht leeres Array von Objekten {typ, basis, faktor?}; typ = Zählerschlüssel-Format, basis = ganze Zahl >= 1,
-- faktor (K4, optional) = genau 5 Zahlen > 0 (Gebietsstufe 1..5). Weitere Felder (z. B. ziel/text) sind erlaubt.
create or replace function public.quest_ziele_ok(p jsonb) returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare z jsonb; f jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 or jsonb_array_length(p) > 10 then return false; end if;
  for z in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(z) <> 'object' then return false; end if;
    if coalesce(z->>'typ', '') !~ '^[a-z0-9_.]{1,60}$' then return false; end if;
    if jsonb_typeof(z->'basis') is distinct from 'number' or (z->>'basis') !~ '^[0-9]{1,9}$' or (z->>'basis')::int < 1 then return false; end if;
    if z ? 'faktor' then
      if jsonb_typeof(z->'faktor') <> 'array' or jsonb_array_length(z->'faktor') <> 5 then return false; end if;
      for f in select value from jsonb_array_elements(z->'faktor') loop
        if jsonb_typeof(f) <> 'number' or (f::text)::numeric <= 0 or (f::text)::numeric > 1000 then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end $$;
-- inst_key passend zum Bereich der Quest (Plan Abschnitt 1); Datumsangaben müssen gültig sein, Wochen beginnen am Montag.
create or replace function public.quest_inst_ok(p_key text, p_inst text) returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare d date;
begin
  case public.quest_bereich(p_key)
    when 'story', 'pruefung' then return p_inst = 'einmalig';
    when 'neben' then return p_inst ~ '^n:[0-9]{1,12}:-?[0-9]{1,9}:-?[0-9]{1,9}$';
    when 'event' then return p_inst = 'e:' || split_part(p_key, ':', 2);
    when 'tag', 'woche' then
      if p_inst !~ ('^' || case public.quest_bereich(p_key) when 'tag' then 'd' else 'w' end || ':[0-9]{4}-[0-9]{2}-[0-9]{2}$') then return false; end if;
      begin d := make_date(substr(p_inst, 3, 4)::int, substr(p_inst, 8, 2)::int, substr(p_inst, 11, 2)::int);   -- z. B. 2026-02-30 ist ungültig
      exception when others then return false; end;
      return public.quest_bereich(p_key) = 'tag' or extract(isodow from d) = 1;
    else return false;
  end case;
end $$;
-- Periodendatum zum Instanzschlüssel (nur Tag/Woche, sonst null)
create or replace function public.quest_inst_datum(p_inst text) returns date language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_inst !~ '^[dw]:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  return make_date(substr(p_inst, 3, 4)::int, substr(p_inst, 8, 2)::int, substr(p_inst, 11, 2)::int);
exception when others then return null;   -- ungültiges Datum: quest_inst_ok lehnt den Instanzschlüssel ab
end $$;
create or replace function public.quest_zaehler_ok(p jsonb) returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p is not null and jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_each(p) e where e.key !~ '^[a-z0-9_.]{1,60}$' or jsonb_typeof(e.value) <> 'number'
                       or (e.value::text) !~ '^[0-9]{1,12}$');
$$;

-- Berliner Perioden (Wechsel 09:00 Ortszeit, Woche ab Montag). Rechnung in Ortszeit, daher korrekt bei Sommer-/Winterzeit (Tage mit 23/25 Stunden).
-- Unabhängig von der Sitzungszeitzone (TimeZone), weil ausdrücklich in Europe/Berlin umgerechnet wird.
create or replace function public.quest_periode_datum(p_typ text, p_t timestamptz) returns date language plpgsql stable set search_path = public, pg_temp as $$
declare d date := ((p_t at time zone 'Europe/Berlin') - interval '9 hours')::date;
begin
  if p_t is null then raise exception 'invalid_time' using errcode = '22023'; end if;
  if p_typ = 'tag' then return d; end if;
  if p_typ = 'woche' then return d - (extract(isodow from d)::int - 1); end if;
  raise exception 'invalid_periode' using errcode = '22023';
end $$;
-- Beginn einer Periode als Zeitpunkt (09:00 Berliner Ortszeit am Periodendatum); das Ende ist der Beginn der nächsten Periode.
create or replace function public.quest_periode_start(p_datum date) returns timestamptz language sql stable set search_path = public, pg_temp as $$
  select (p_datum + time '09:00') at time zone 'Europe/Berlin';
$$;
-- Gebietsstufe aus dem BESTÄTIGTEN Level (K1). Level-Grenzen wie BAND_LO im Client (index.html): 1, 8, 16, 26, 38. Ohne Level: null.
create or replace function public.quest_stufe(p_level int) returns smallint language sql immutable set search_path = public, pg_temp as $$
  select case when p_level is null then null when p_level >= 38 then 5 when p_level >= 26 then 4 when p_level >= 16 then 3 when p_level >= 8 then 2 else 1 end::smallint;
$$;

------------------------------------------------------------------------------------------------
-- Tabellen
------------------------------------------------------------------------------------------------
-- Events (nur Betrieb/service_role pflegt sie). Event-Quests heißen ev:<event_key>:<nr>.
create table public.quest_events (
  event_key  text primary key check (event_key ~ '^[a-z0-9_]{1,40}$'),
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  constraint quest_events_zeitraum check (end_at > start_at)
);

-- Questkatalog. Versionen sind unveränderlich: Änderungen ergeben eine neue Version, laufende Quests behalten ihre Version (nur „aktiv“ ist änderbar).
create table public.quest_defs (
  quest_key   text not null check (quest_key ~ '^(st|pr|nb|tg|wo|ev):[a-z0-9_.:-]{1,60}$'),
  version     int  not null check (version >= 1),
  bereich     text not null check (bereich in ('story','neben','tag','woche','event','pruefung')),
  klasse      text check (klasse ~ '^[a-z_]{1,30}$'),
  pfad        text check (pfad ~ '^[a-z_]{1,30}$'),
  stufe       smallint check (stufe between 1 and 3),
  kapitel     text check (kapitel ~ '^[a-z0-9_.]{1,20}$'),
  reihenfolge int  check (reihenfolge >= 0),
  voraus      jsonb not null default '[]' check (jsonb_typeof(voraus) = 'array'),
  ziele       jsonb not null check (public.quest_ziele_ok(ziele)),
  belohnung   jsonb not null default '{}' check (jsonb_typeof(belohnung) = 'object'),
  texte       jsonb not null default '{}' check (jsonb_typeof(texte) = 'object'),
  aktiv       boolean not null default true,
  angelegt_am timestamptz not null default now(),
  primary key (quest_key, version),
  constraint quest_defs_praefix check (bereich = public.quest_bereich(quest_key)),
  constraint quest_defs_pruefung check ((bereich = 'pruefung') = (stufe is not null) and (bereich = 'pruefung' or (klasse is null and pfad is null)))
);

-- Vorlagen für die Rotation (Tag/Woche) mit Gewicht. Je Vorlage (quest_key) ein Eintrag; die Version legt fest, welche Fassung neu ausgewählt wird.
create table public.quest_pools (
  periode_typ text not null check (periode_typ in ('tag','woche')),
  quest_key   text not null,
  version     int  not null,
  gewicht     int  not null check (gewicht between 1 and 1000000),
  aktiv       boolean not null default true,
  primary key (periode_typ, quest_key),
  foreign key (quest_key, version) references public.quest_defs(quest_key, version)
);
create index quest_pools_def on public.quest_pools (quest_key, version);   -- Fremdschlüssel-Index

-- Rotation je Periode: höchstens 3 Quests (quest_key + version als parallele Listen), einmal angelegt und danach unveränderlich, gleich für alle.
-- Ohne verfügbare Vorlage wird keine Zeile angelegt (eine spätere Vorlage kann die Periode dann noch füllen).
create table public.quest_rotation (
  periode_typ   text not null check (periode_typ in ('tag','woche')),
  periode_datum date not null,
  quest_keys    text[] not null,
  versionen     int[]  not null,
  angelegt_am   timestamptz not null default now(),
  primary key (periode_typ, periode_datum),
  constraint quest_rotation_umfang check (cardinality(quest_keys) between 1 and 3 and cardinality(versionen) = cardinality(quest_keys)),
  constraint quest_rotation_montag check (periode_typ = 'tag' or extract(isodow from periode_datum) = 1)
);

-- NPC-Typen und Seeds (Inhalte und Formel folgen mit Paket 8; hier nur die Ablage).
create table public.npc_defs (
  npc_typ  text primary key check (npc_typ ~ '^[a-z0-9_]{1,40}$'),
  gewicht  int not null check (gewicht between 1 and 1000000),
  vorlagen text[] not null default '{}',
  aktiv    boolean not null default true
);
create table public.npc_seed (
  fenster_id  bigint primary key check (fenster_id >= 0),   -- floor(Unix-Zeit UTC / 10800) = 3-Stunden-Fenster
  seed        int not null,
  angelegt_am timestamptz not null default now()
);

-- Serverseitig bestätigte Werte je Charakter (1:1). Schreiben nur in künftigen RPCs (Paket 3); NIE aus Client-Daten vorbelegt (K2).
-- level: bestätigtes Level (K1, Quelle der Queststufe), null = unbestätigt. zaehler: flaches Objekt Zählerschlüssel -> ganze Zahl (komponentenweises
-- Maximum, steigt nur). story_done: bestätigte Story-Abschlüsse (wächst nur).
create table public.character_confirmed (
  character_id    uuid primary key references public.characters(character_id) on delete cascade,
  level           smallint check (level between 1 and 50),
  zaehler         jsonb not null default '{}' check (public.quest_zaehler_ok(zaehler)),
  story_done      text[] not null default '{}',
  aktualisiert_am timestamptz not null default now()
);

-- Questzustand je Charakter und Instanz. stufe, menge_soll, start_stand und version werden beim Aktivieren festgeschrieben (danach unveränderlich).
create table public.character_quests (
  character_id     uuid not null references public.characters(character_id) on delete cascade,
  quest_key        text not null,
  inst_key         text not null,
  version          int  not null,
  status           text not null default 'aktiv' check (status in ('aktiv','abschlussbereit','abgeschlossen','verfallen')),
  periode_datum    date,
  stufe            smallint check (stufe between 1 and 5),
  menge_soll       jsonb check (menge_soll is null or jsonb_typeof(menge_soll) = 'object'),
  start_stand      jsonb check (start_stand is null or public.quest_zaehler_ok(start_stand)),
  npc_ref          jsonb check (npc_ref is null or jsonb_typeof(npc_ref) = 'object'),
  aktiviert_am     timestamptz not null default now(),
  abgeschlossen_am timestamptz,
  primary key (character_id, quest_key, inst_key),
  foreign key (quest_key, version) references public.quest_defs(quest_key, version),
  constraint character_quests_inst check (public.quest_inst_ok(quest_key, inst_key)),
  constraint character_quests_periode check (periode_datum is not distinct from public.quest_inst_datum(inst_key)),
  -- Tag/Woche nur mit festgeschriebenen Werten (keine Aktivierung mit leeren Startständen; Aktivierung selbst erst Paket 3)
  constraint character_quests_fest check (public.quest_bereich(quest_key) not in ('tag','woche') or (stufe is not null and menge_soll is not null and start_stand is not null))
);
create index character_quests_def on public.character_quests (quest_key, version);   -- Fremdschlüssel-Index

-- Gutschriften. Schlüssel (character_id, rid) bleibt dauerhaft belegt (Idempotenz); Zeilen werden nie gelöscht (außer Kaskade).
create table public.quest_rewards (
  character_id uuid not null,
  quest_key    text not null,
  inst_key     text not null,
  rid          text generated always as (quest_key || '|' || inst_key) stored,
  belohnung    jsonb not null check (jsonb_typeof(belohnung) = 'object'),
  status       text not null default 'offen' check (status in ('offen','im_spielstand','endgueltig','verfallen')),
  angelegt_am  timestamptz not null default now(),
  gueltig_bis  timestamptz not null default (now() + interval '14 days'),
  primary key (character_id, rid),
  foreign key (character_id, quest_key, inst_key) references public.character_quests(character_id, quest_key, inst_key) on delete cascade,
  constraint quest_rewards_frist check (gueltig_bis > angelegt_am)
);
create index quest_rewards_quest on public.quest_rewards (character_id, quest_key, inst_key);   -- Fremdschlüssel-Index

-- Ablehnungen/Auffälligkeiten (E2: ablehnen und protokollieren). Nur service_role.
create table public.quest_audit (
  id           bigserial primary key,
  character_id uuid references public.characters(character_id) on delete cascade,
  grund        text not null,
  detail       jsonb,
  at           timestamptz not null default now()
);
create index quest_audit_char on public.quest_audit (character_id);   -- Fremdschlüssel-Index

------------------------------------------------------------------------------------------------
-- Integritätsregeln (Trigger, gelten für jeden zeilenweisen Schreibweg einschließlich service_role; TRUNCATE ist service_role auf den
-- geschützten Tabellen quest_defs, quest_rotation, character_confirmed, character_quests und quest_rewards entzogen, siehe Rechte)
------------------------------------------------------------------------------------------------
-- Katalog: Versionen unveränderlich (nur „aktiv“), Event-Quests nur zu vorhandenem Event. Löschen nur, solange keine gespeicherte Rotation die Version
-- nennt (Questzeilen und Pool schützen der Fremdschlüssel); sonst ließe sich eine Version mit anderem Inhalt neu anlegen.
create or replace function public.quest_defs_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.quest_rotation r, unnest(r.quest_keys, r.versionen) as u(k, v) where u.k = old.quest_key and u.v = old.version) then
      raise exception 'quest_version_immutable' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'aktiv') is distinct from (to_jsonb(old) - 'aktiv') then
    raise exception 'quest_version_immutable' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.bereich = 'event' and not exists (select 1 from public.quest_events where event_key = split_part(new.quest_key, ':', 2)) then
    raise exception 'event_unknown' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger quest_defs_guard before insert or update or delete on public.quest_defs for each row execute function public.quest_defs_guard();

-- Pool: nur Vorlagen des passenden Bereichs (tag/woche).
create or replace function public.quest_pools_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.quest_bereich(new.quest_key) is distinct from new.periode_typ then raise exception 'pool_bereich' using errcode = '23514'; end if;
  return new;
end $$;
create trigger quest_pools_guard before insert or update on public.quest_pools for each row execute function public.quest_pools_guard();

-- Rotation: nur gültige, verschiedene Vorlagen des Periodentyps; danach unveränderlich und nicht löschbar.
create or replace function public.quest_rotation_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then raise exception 'rotation_immutable' using errcode = '42501'; end if;
  if (select count(distinct k) from unnest(new.quest_keys) k) <> cardinality(new.quest_keys)
     or exists (select 1 from unnest(new.quest_keys, new.versionen) as u(k, v)
                 where not exists (select 1 from public.quest_defs d where d.quest_key = u.k and d.version = u.v and d.bereich = new.periode_typ)) then
    raise exception 'rotation_invalid' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger quest_rotation_guard before insert or update or delete on public.quest_rotation for each row execute function public.quest_rotation_guard();

-- NPC-Typen: angebotene Vorlagen müssen Nebenquests sein.
create or replace function public.npc_defs_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from unnest(new.vorlagen) k where not exists (select 1 from public.quest_defs d where d.quest_key = k and d.bereich = 'neben')) then
    raise exception 'npc_vorlage_invalid' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger npc_defs_guard before insert or update on public.npc_defs for each row execute function public.npc_defs_guard();

-- Bestätigte Werte: Level, Zähler (je Schlüssel) und Story-Abschlüsse steigen nur; Löschen nur mit dem Charakter (Kaskade).
create or replace function public.character_confirmed_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.characters where character_id = old.character_id) then raise exception 'confirmed_immutable' using errcode = '42501'; end if;
    return old;
  end if;
  if new.character_id <> old.character_id
     or (old.level is not null and (new.level is null or new.level < old.level))
     or exists (select 1 from jsonb_each(old.zaehler) o where coalesce((new.zaehler ->> o.key)::bigint, -1) < (o.value::text)::bigint)
     or not (new.story_done @> old.story_done) then
    raise exception 'confirmed_only_increases' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger character_confirmed_guard before update or delete on public.character_confirmed for each row execute function public.character_confirmed_guard();

-- Questzeilen: Schlüssel und festgeschriebene Werte unveränderlich; Status nur vorwärts; Löschen nur mit dem Charakter (Kaskade).
-- K1: Tag/Woche nur mit serverseitig bestätigtem Level, die Stufe muss genau die daraus abgeleitete sein (keine Stufe aus Client-Daten).
create or replace function public.character_quests_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if public.quest_bereich(new.quest_key) in ('tag','woche') and not exists (
         select 1 from public.character_confirmed c where c.character_id = new.character_id and c.level is not null and public.quest_stufe(c.level) = new.stufe) then
      raise exception 'level_unconfirmed' using errcode = '42501';
    end if;
    if new.status <> 'aktiv' and public.quest_bereich(new.quest_key) <> 'story' then raise exception 'quest_status_transition' using errcode = '42501'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.characters where character_id = old.character_id) then raise exception 'quest_row_immutable' using errcode = '42501'; end if;
    return old;
  end if;
  if (new.character_id, new.quest_key, new.inst_key, new.version, new.periode_datum, new.aktiviert_am) is distinct from
     (old.character_id, old.quest_key, old.inst_key, old.version, old.periode_datum, old.aktiviert_am)
     or new.stufe is distinct from old.stufe or new.menge_soll is distinct from old.menge_soll
     or new.start_stand is distinct from old.start_stand or new.npc_ref is distinct from old.npc_ref then
    raise exception 'quest_row_immutable' using errcode = '42501';
  end if;
  if new.status <> old.status and not (
       (old.status = 'aktiv' and new.status in ('abschlussbereit','abgeschlossen','verfallen'))
    or (old.status = 'abschlussbereit' and new.status in ('abgeschlossen','verfallen'))) then
    raise exception 'quest_status_transition' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger character_quests_guard before insert or update or delete on public.character_quests for each row execute function public.character_quests_guard();

-- Gutschriften: Inhalt unveränderlich; offen <-> im_spielstand nur bis gueltig_bis; danach nur im_spielstand -> endgueltig bzw. offen -> verfallen;
-- endgueltig/verfallen sind endgültig. Neue Zeilen nur als offen oder im_spielstand. Löschen nur mit dem Charakter (Kaskade).
create or replace function public.quest_rewards_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare t timestamptz := clock_timestamp();
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.characters where character_id = old.character_id) then raise exception 'reward_immutable' using errcode = '42501'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('offen','im_spielstand') then raise exception 'reward_status_transition' using errcode = '42501'; end if;
    return new;
  end if;
  if (new.character_id, new.quest_key, new.inst_key, new.belohnung, new.angelegt_am, new.gueltig_bis) is distinct from
     (old.character_id, old.quest_key, old.inst_key, old.belohnung, old.angelegt_am, old.gueltig_bis) then
    raise exception 'reward_immutable' using errcode = '42501';
  end if;
  if new.status <> old.status and not (
       (old.status in ('offen','im_spielstand') and new.status in ('offen','im_spielstand') and t <= old.gueltig_bis)
    or (old.status = 'im_spielstand' and new.status = 'endgueltig' and t > old.gueltig_bis)
    or (old.status = 'offen' and new.status = 'verfallen' and t > old.gueltig_bis)) then
    raise exception 'reward_status_transition' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger quest_rewards_guard before insert or update or delete on public.quest_rewards for each row execute function public.quest_rewards_guard();

------------------------------------------------------------------------------------------------
-- Rotation (K3)
------------------------------------------------------------------------------------------------
-- Auswahl (K3): Kandidaten = aktive Pool-Einträge des Typs mit aktiver Definition, in zwei Stufen: (1) Vorlagen, die NICHT in der gespeicherten Rotation
-- der unmittelbar vorherigen Periode stehen, (2) die Vorlagen der Vorperiode (Auffüllung, nur wenn Stufe 1 für 3 Plätze nicht reicht). Gewichtete Ziehung
-- ohne Zurücklegen, rein ganzzahlig und deterministisch: Platz k (1..3) zieht r = Hash(Typ|Datum|k) mod Restgewicht der aktuellen Stufe und läuft deren
-- nach quest_key sortierte Kandidaten ab. Keine Duplikate; bei weniger als 3 aktiven Vorlagen nur die verfügbaren. Gleiche Daten -> gleiche Auswahl,
-- unabhängig davon, wer zuerst aufruft. Ohne gespeicherte Vorperiode gibt es keine Stufe 2 (alle Kandidaten in Stufe 1).
create or replace function public.quest_rotation_wahl(p_typ text, p_datum date)
returns table(quest_key text, version int) language plpgsql stable set search_path = public, pg_temp as $$
declare ks text[]; vs int[]; ws bigint[]; ks2 text[]; vs2 int[]; ws2 bigint[]; vorher text[]; k int; i int; w bigint; r bigint; acc bigint;
begin
  if p_typ not in ('tag','woche') or p_datum is null then raise exception 'invalid_periode' using errcode = '22023'; end if;
  select q.quest_keys into vorher from public.quest_rotation q
   where q.periode_typ = p_typ and q.periode_datum = p_datum - case p_typ when 'tag' then 1 else 7 end;
  vorher := coalesce(vorher, '{}');
  -- Stufe 1: nicht in der Vorperiode; Stufe 2: aus der Vorperiode (Auffüllung)
  select array_agg(p.quest_key order by p.quest_key collate "C") filter (where not (p.quest_key = any (vorher))),
         array_agg(p.version order by p.quest_key collate "C") filter (where not (p.quest_key = any (vorher))),
         array_agg(p.gewicht::bigint order by p.quest_key collate "C") filter (where not (p.quest_key = any (vorher))),
         array_agg(p.quest_key order by p.quest_key collate "C") filter (where p.quest_key = any (vorher)),
         array_agg(p.version order by p.quest_key collate "C") filter (where p.quest_key = any (vorher)),
         array_agg(p.gewicht::bigint order by p.quest_key collate "C") filter (where p.quest_key = any (vorher))
    into ks, vs, ws, ks2, vs2, ws2
    from public.quest_pools p join public.quest_defs d on d.quest_key = p.quest_key and d.version = p.version
   where p.periode_typ = p_typ and p.aktiv and d.aktiv and d.bereich = p_typ;
  ks := coalesce(ks, '{}'); vs := coalesce(vs, '{}'); ws := coalesce(ws, '{}');
  ks2 := coalesce(ks2, '{}'); vs2 := coalesce(vs2, '{}'); ws2 := coalesce(ws2, '{}');
  for k in 1 .. 3 loop
    if cardinality(ks) = 0 then   -- Stufe 1 erschöpft: mit der Vorperiode auffüllen
      if cardinality(ks2) = 0 then exit; end if;
      ks := ks2; vs := vs2; ws := ws2; ks2 := '{}'; vs2 := '{}'; ws2 := '{}';
    end if;
    w := 0; for i in 1 .. cardinality(ks) loop w := w + ws[i]; end loop;
    r := hashtextextended(p_typ || '|' || to_char(p_datum, 'YYYY-MM-DD') || '|' || k, 0);
    r := ((r % w) + w) % w;
    acc := 0;
    for i in 1 .. cardinality(ks) loop
      acc := acc + ws[i];
      if r < acc then
        quest_key := ks[i]; version := vs[i]; return next;
        ks := ks[1:i-1] || ks[i+1:]; vs := vs[1:i-1] || vs[i+1:]; ws := ws[1:i-1] || ws[i+1:];
        exit;
      end if;
    end loop;
  end loop;
end $$;
-- Legt die Rotation der Periode einmalig an (insert ... on conflict do nothing). Ohne Kandidaten: keine Zeile.
create or replace function public.quest_rotation_sichern(p_typ text, p_datum date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare ks text[]; vs int[];
begin
  if exists (select 1 from public.quest_rotation where periode_typ = p_typ and periode_datum = p_datum) then return; end if;
  select array_agg(w.quest_key order by w.ord), array_agg(w.version order by w.ord) into ks, vs
    from public.quest_rotation_wahl(p_typ, p_datum) with ordinality as w(quest_key, version, ord);
  if ks is null then return; end if;
  insert into public.quest_rotation(periode_typ, periode_datum, quest_keys, versionen) values (p_typ, p_datum, ks, vs)
  on conflict (periode_typ, periode_datum) do nothing;
end $$;

------------------------------------------------------------------------------------------------
-- Client-RPC: quest_state (Paket 2: liest Charakterdaten, schreibt nur die globale Rotation; Tages-/Wochenaktivierung gesperrt bis Paket 3, K1/K2).
-- Wegen der Rotation keine schreibgeschützte Transaktion (PostgREST: POST, nicht GET). Scheitert der Aufruf, wird auch die Rotation zurückgenommen.
------------------------------------------------------------------------------------------------
-- Sperrfolge: Rotation (eigene Anweisungen, VOR jeder Charaktersperre) -> Profil (for key share, wie save_character/delete_character seit B-4)
-- -> Charakterzeile (for key share: schützt nur vor gleichzeitigem Löschen; save_character wartet höchstens kurz) -> Lesen der Questzeilen ohne Sperre.
-- Keine Beratungssperre der Instanzen (rwi), daher kein Zyklus mit create_group/group_join/on_character_deleted (B-6). Nur unter READ COMMITTED.
-- Fremde, gelöschte oder nicht vorhandene Charaktere: not_found (verrät nichts). Platz 3 ohne Berechtigung: character_locked.
create or replace function public.quest_state(p_character uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t timestamptz := clock_timestamp(); dt date; dw date; sl smallint; cf record; res jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'read_committed_required' using errcode = '25000'; end if;
  if p_character is null then raise exception 'not_found' using errcode = 'PT404'; end if;
  dt := public.quest_periode_datum('tag', t);
  dw := public.quest_periode_datum('woche', t);
  -- 1. Rotation (global, vor jeder Charaktersperre)
  perform public.quest_rotation_sichern('tag', dt);
  perform public.quest_rotation_sichern('woche', dw);
  -- 2. Profil (key share), 3. Charakterzeile
  perform 1 from public.profiles where account_id = uid for key share;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  select slot_number into sl from public.characters where character_id = p_character and account_id = uid for key share;
  if sl is null then raise exception 'not_found' using errcode = 'PT404'; end if;
  if sl = 3 and not public.has_entitlement(uid, 'third_character_slot') then raise exception 'character_locked' using errcode = 'PT403'; end if;
  -- 4. Lesen (ohne Sperre)
  select level, zaehler, story_done into cf from public.character_confirmed where character_id = p_character;
  res := jsonb_build_object(
    'server_zeit', t,
    'perioden', jsonb_build_object(
       'tag',   jsonb_build_object('datum', dt, 'start', public.quest_periode_start(dt), 'ende', public.quest_periode_start(dt + 1)),
       'woche', jsonb_build_object('datum', dw, 'start', public.quest_periode_start(dw), 'ende', public.quest_periode_start(dw + 7))),
    'rotation', jsonb_build_object(
       'tag',   coalesce((select jsonb_agg(jsonb_build_object('quest_key', u.k, 'version', u.v) order by u.o) from public.quest_rotation q,
                          unnest(q.quest_keys, q.versionen) with ordinality as u(k, v, o) where q.periode_typ = 'tag' and q.periode_datum = dt), '[]'),
       'woche', coalesce((select jsonb_agg(jsonb_build_object('quest_key', u.k, 'version', u.v) order by u.o) from public.quest_rotation q,
                          unnest(q.quest_keys, q.versionen) with ordinality as u(k, v, o) where q.periode_typ = 'woche' and q.periode_datum = dw), '[]')),
    'aktivierung', jsonb_build_object('tag_woche', false, 'grund', 'gesperrt_bis_paket_3'),
    'stufe', public.quest_stufe(cf.level),
    'bestaetigt', case when cf is null then null else jsonb_build_object('level', cf.level, 'zaehler', cf.zaehler, 'story_done', to_jsonb(cf.story_done)) end,
    'events', coalesce((select jsonb_agg(jsonb_build_object('event_key', e.event_key, 'start_at', e.start_at, 'end_at', e.end_at) order by e.event_key)
                          from public.quest_events e where e.start_at <= t and t < e.end_at), '[]'),
    'quests', coalesce((select jsonb_agg(jsonb_build_object('quest_key', q.quest_key, 'inst_key', q.inst_key, 'version', q.version, 'status', q.status,
                          'periode_datum', q.periode_datum, 'stufe', q.stufe, 'menge_soll', q.menge_soll, 'start_stand', q.start_stand, 'npc_ref', q.npc_ref,
                          'aktiviert_am', q.aktiviert_am, 'abgeschlossen_am', q.abgeschlossen_am) order by q.quest_key, q.inst_key)
                          from public.character_quests q where q.character_id = p_character), '[]'),
    -- Gutschriften mit verzögert berechnetem Zustand (Fristende ohne Cron); geschrieben wird der Zustand erst in Paket 3.
    'gutschriften', coalesce((select jsonb_agg(jsonb_build_object('rid', g.rid, 'belohnung', g.belohnung, 'status',
                          case when t > g.gueltig_bis and g.status = 'im_spielstand' then 'endgueltig'
                               when t > g.gueltig_bis and g.status = 'offen' then 'verfallen' else g.status end,
                          'gueltig_bis', g.gueltig_bis) order by g.rid)
                          from public.quest_rewards g where g.character_id = p_character), '[]'));
  return res;
end $$;

alter table public.quest_events enable row level security;
alter table public.quest_defs enable row level security;
alter table public.quest_pools enable row level security;
alter table public.quest_rotation enable row level security;
alter table public.npc_defs enable row level security;
alter table public.npc_seed enable row level security;
alter table public.character_confirmed enable row level security;
alter table public.character_quests enable row level security;
alter table public.quest_rewards enable row level security;
alter table public.quest_audit enable row level security;
revoke all on public.quest_events from public, anon, authenticated;
revoke all on public.quest_defs from public, anon, authenticated;
revoke all on public.quest_pools from public, anon, authenticated;
revoke all on public.quest_rotation from public, anon, authenticated;
revoke all on public.npc_defs from public, anon, authenticated;
revoke all on public.npc_seed from public, anon, authenticated;
revoke all on public.character_confirmed from public, anon, authenticated;
revoke all on public.character_quests from public, anon, authenticated;
revoke all on public.quest_rewards from public, anon, authenticated;
revoke all on public.quest_audit from public, anon, authenticated;
revoke all on sequence public.quest_audit_id_seq from public, anon, authenticated;
revoke all on function public.quest_bereich(text) from public, anon, authenticated;
revoke all on function public.quest_ziele_ok(jsonb) from public, anon, authenticated;
revoke all on function public.quest_inst_ok(text,text) from public, anon, authenticated;
revoke all on function public.quest_inst_datum(text) from public, anon, authenticated;
revoke all on function public.quest_zaehler_ok(jsonb) from public, anon, authenticated;
revoke all on function public.quest_periode_datum(text,timestamptz) from public, anon, authenticated;
revoke all on function public.quest_periode_start(date) from public, anon, authenticated;
revoke all on function public.quest_stufe(int) from public, anon, authenticated;
revoke all on function public.quest_defs_guard() from public, anon, authenticated;
revoke all on function public.quest_pools_guard() from public, anon, authenticated;
revoke all on function public.quest_rotation_guard() from public, anon, authenticated;
revoke all on function public.npc_defs_guard() from public, anon, authenticated;
revoke all on function public.character_confirmed_guard() from public, anon, authenticated;
revoke all on function public.character_quests_guard() from public, anon, authenticated;
revoke all on function public.quest_rewards_guard() from public, anon, authenticated;
revoke all on function public.quest_rotation_wahl(text,date) from public, anon, authenticated;
revoke all on function public.quest_rotation_sichern(text,date) from public, anon, authenticated;
revoke all on function public.quest_state(uuid) from public, anon, authenticated;
grant all on public.quest_events, public.quest_defs, public.quest_pools, public.quest_rotation, public.npc_defs, public.npc_seed, public.character_confirmed, public.character_quests, public.quest_rewards, public.quest_audit to service_role;
grant all on sequence public.quest_audit_id_seq to service_role;
-- Quests: TRUNCATE umginge die Zeilentrigger (Unveränderlichkeit, „nie gelöscht“) – daher service_role auf den geschützten Tabellen entzogen.
revoke truncate on public.quest_defs, public.quest_rotation, public.character_confirmed, public.character_quests, public.quest_rewards from service_role;
-- Quests (Paket 2): Katalog lesbar (ohne Klassenprüfungen, Event-Quests erst ab Eventbeginn), Rotation und NPC-Typen lesbar; eigene Questzeilen,
-- Gutschriften und bestätigte Werte nur zum eigenen, nicht gesperrten Charakter (die Unterabfrage unterliegt char_own_read, also auch der Platz-3-Sperre).
-- quest_pools (Gewichte), npc_seed und quest_audit: keine Rechte für Clients. Geschrieben wird nur über Server-Funktionen.
grant select on public.quest_defs, public.quest_rotation, public.quest_events, public.npc_defs,
                public.character_confirmed, public.character_quests, public.quest_rewards to authenticated;
create policy quest_defs_read     on public.quest_defs     for select to authenticated using (
  bereich <> 'pruefung' and (bereich <> 'event' or exists (select 1 from public.quest_events e where e.event_key = split_part(quest_key, ':', 2) and e.start_at <= now())));
create policy quest_rotation_read on public.quest_rotation for select to authenticated using (true);
create policy quest_events_read   on public.quest_events   for select to authenticated using (start_at <= now());
create policy npc_defs_read       on public.npc_defs       for select to authenticated using (true);
create policy confirmed_own_read  on public.character_confirmed for select to authenticated using (
  exists (select 1 from public.characters c where c.character_id = character_confirmed.character_id and c.account_id = (select auth.uid())));
create policy cquests_own_read    on public.character_quests    for select to authenticated using (
  exists (select 1 from public.characters c where c.character_id = character_quests.character_id and c.account_id = (select auth.uid())));
create policy rewards_own_read    on public.quest_rewards       for select to authenticated using (
  exists (select 1 from public.characters c where c.character_id = quest_rewards.character_id and c.account_id = (select auth.uid())));
grant execute on function public.quest_state(uuid)                 to authenticated;
commit;

-- MIGRATION D3 (am 15.11.2026 live angewendet als d3_konto_loeschen; Prüfbericht: docs/D3_PRUEFBERICHT.md): Konto löschen, Zahlungsereignisse/Protokoll, Aufbewahrung gelöschter Charaktere.
-- Nur nach ausdrücklicher Freigabe auf dem Live-Projekt einspielen. Vorher wird sie lokal gegen das ALTE Schema getestet (Upgrade-Pfad).
begin;
-- 1. Protokollzeilen ohne Konto (Waisen) entfernen, damit der Fremdschlüssel gesetzt werden kann
delete from public.audit_log where account_id is not null and not exists (select 1 from public.profiles p where p.account_id = audit_log.account_id);
alter table public.audit_log add constraint audit_log_account_id_fkey foreign key (account_id) references public.profiles(account_id) on delete cascade;
-- 2. Zahlungsereignisse blockieren die Kontolöschung nicht mehr
alter table public.payment_events drop constraint payment_events_account_id_fkey;
alter table public.payment_events add constraint payment_events_account_id_fkey foreign key (account_id) references public.profiles(account_id) on delete set null;
-- 3. Funktionen
-- Aufbewahrung gelöschter Charaktere: 30 Tage. Danach werden ALLE Sicherungen eines nicht mehr vorhandenen Charakters entfernt
-- (Maßstab: die jüngste Sicherung des Charakters, also der Zeitpunkt des Löschens). Sicherungen vorhandener Charaktere bleiben (max. 10).
create or replace function public.purge_account_backups(p_account uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.character_backups b
   where b.account_id = p_account
     and not exists (select 1 from public.characters c where c.character_id = b.character_id)
     and (select max(b2.saved_at) from public.character_backups b2 where b2.character_id = b.character_id) < now() - interval '30 days';
end $$;
-- Für alle Konten (nur service_role, z. B. geplanter Job); gibt die Zahl entfernter Sicherungen zurück.
create or replace function public.purge_expired_backups() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare n bigint;
begin
  delete from public.character_backups b
   where not exists (select 1 from public.characters c where c.character_id = b.character_id)
     and (select max(b2.saved_at) from public.character_backups b2 where b2.character_id = b.character_id) < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- Konto endgültig löschen (durch den Nutzer selbst). Alles in EINER Transaktion: ein Fehler macht alles rückgängig.
-- Voraussetzungen, alle serverseitig geprüft: angemeldet, Sitzung höchstens 2 Minuten alt und per Passwort angelegt (auth.sessions + auth.mfa_amr_claims
-- über die session_id im JWT, gehört dem Konto), Benutzername als Bestätigung. Es wird immer nur das eigene Konto (auth.uid()) gelöscht.
create or replace function public.delete_account(p_confirm text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); sid uuid; sess_at timestamptz; uname text;
begin
  if uid is null or coalesce(auth.jwt() ->> 'role','') <> 'authenticated' then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  select username into uname from public.profiles where account_id = uid for update;   -- sperrt das Profil: parallele Speichervorgänge warten und scheitern danach
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  begin sid := (auth.jwt() ->> 'session_id')::uuid; exception when others then sid := null; end;
  -- Echte erneute Passwortanmeldung: die Sitzung ist höchstens 2 Minuten alt UND wurde per Passwort angelegt (nicht per E-Mail-Link/OTP/Wiederherstellung).
  -- Die Passwortprüfung selbst übernimmt Supabase Auth (mit eigener Ratenbegrenzung); der Client meldet sich direkt vor dem Aufruf neu an.
  select s.created_at into sess_at from auth.sessions s
   where s.id = sid and s.user_id = uid
     and exists (select 1 from auth.mfa_amr_claims m where m.session_id = s.id and m.authentication_method = 'password' and m.created_at >= now() - interval '2 minutes');
  if sess_at is null or sess_at < now() - interval '2 minutes' then raise exception 'reauth_required' using errcode = 'PT403'; end if;
  if p_confirm is null or lower(btrim(p_confirm)) <> lower(uname) then raise exception 'confirm_mismatch' using errcode = '22023'; end if;
  -- Zahlungsereignisse bleiben ohne Kontobezug und ohne persönliche Felder erhalten (Aufbewahrung wird später rechtlich festgelegt)
  update public.payment_events
     set account_id = null,
         payload = jsonb_strip_nulls(jsonb_build_object('redacted', true, 'amount', payload -> 'amount', 'currency', payload -> 'currency'))
   where account_id = uid;
  -- Protokoll: nach Konto und nach allen Charakteren des Kontos (auch bereits gelöschten, bekannt aus den Sicherungen)
  delete from public.audit_log
   where account_id = uid
      or character_id in (select character_id from public.characters where account_id = uid
                          union select character_id from public.character_backups where account_id = uid);
  -- Konto löschen: Kaskade über Profil, Charaktere, Sicherungen, Berechtigungen, Sitzungen, Token. Die Kaskade legt keine neuen Sicherungen an.
  delete from auth.users where id = uid;
end $$;

create or replace function public.touch_login() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  update public.profiles set last_login = now() where account_id = auth.uid();
  perform public.purge_account_backups(auth.uid());   -- abgelaufene Sicherungen gelöschter Charaktere (30 Tage)
end $$;
create or replace function public.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  delete from public.characters where character_id = p_id and account_id = uid;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  insert into public.audit_log(account_id, character_id, action) values (uid, p_id, 'character_deleted');
  perform public.purge_account_backups(uid);
end $$;
-- 4. Rechte (zuerst allen entziehen, dann gezielt vergeben)
revoke all on function public.delete_account(text), public.purge_account_backups(uuid), public.purge_expired_backups() from public, anon, authenticated;
grant execute on function public.delete_account(text) to authenticated;
grant execute on function public.purge_expired_backups() to service_role;
revoke all on function public.purge_account_backups(uuid) from service_role;
commit;

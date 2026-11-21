-- MIGRATION B2 (NICHT ANGEWENDET): Sperrreihenfolge beim Löschen eines Charakters (B-2/B-3, docs/B2_V6_PRUEFUNG.md, „V6′“).
-- Nur nach ausdrücklicher Freigabe auf dem Live-Projekt einspielen. Vorher den Live-Stand von public.delete_character mit supabase/rollback_b2_loeschreihenfolge.sql
-- vergleichen (der Rollback enthält die erwartete heutige Fassung). Es werden keine Nutzerdaten verändert.
-- Wirkung: delete_character sperrt zuerst das eigene Profil (for key share; schließt sich nur mit delete_account/Kontolöschung aus), dann die eigene Charakterzeile
-- (for update; prüft zugleich das Eigentum, gleiche Reihenfolge wie ein direktes DELETE, verhindert B-5), nimmt die Beratungssperre je Charakter (Schlüssel identisch mit Schema rwi: hashtextextended('rwi.char:' || lower(<id>), 0)) und löscht erst danach.
-- Ohne Schema rwi (Produktion heute) ist die Beratungssperre wirkungslos, aber harmlos; die Profilsperre beseitigt die Verklemmung mit delete_account (B-3).
-- Sperrregel (Pr-Torregel, docs/B2_PRUEFBERICHT.md Abschnitt 1): DIE PROFILSPERRE MUSS DIE ERSTE SPERRE IN delete_character BLEIBEN; wer A -> C nimmt
-- (delete_account, Admin-Löschung), hält vorher Pr exklusiv, wer C -> A nimmt (delete_character, direktes DELETE), hält vorher Pr(key share) bzw. kein Pr.
-- Signatur, Rückgabe, Fehlercodes (PT401, PT404) und Rechte bleiben gleich. Neu: Abbruch mit 25000 'read_committed_required' bei anderer Isolationsstufe.
begin;
create or replace function public.delete_character(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'PT401'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'read_committed_required' using errcode = '25000'; end if;
  perform 1 from public.profiles where account_id = uid for key share;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  perform 1 from public.characters where character_id = p_id and account_id = uid for update;   -- Eigentum + Zeilensperre C vor A (B-5)
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rwi.char:' || lower(p_id::text), 0));
  delete from public.characters where character_id = p_id and account_id = uid;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  insert into public.audit_log(account_id, character_id, action) values (uid, p_id, 'character_deleted');
  perform public.purge_account_backups(uid);
end $$;
-- Rechte (create or replace behält sie); zur Sicherheit erneut ausdrücklich:
revoke all on function public.delete_character(uuid) from public, anon;
grant execute on function public.delete_character(uuid) to authenticated;
commit;

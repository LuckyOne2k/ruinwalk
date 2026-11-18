-- Das Skript steht in EINER eigenen Transaktion (begin/commit): auch ohne psql -1 und ohne ON_ERROR_STOP wird nach einer fehlgeschlagenen Prüfung nichts gelöscht.
begin;

-- ZIELPRÜFUNG (zwingend, steht wortgleich in 00_preflight.sql, rollback_dev.sql und cleanup_test_accounts.sql; ein Test vergleicht die Texte)
-- Erwartet ausdrücklich: set rw.project_ref = 'jlkqktmvqxibqdcobbhf';  (vor dem Skript, gleiche Sitzung; fehlt sie oder weicht sie ab: Abbruch, kein Fallback)
-- Zusätzlich muss die Datenbankkennung (pg_control_system().system_identifier) die von ruinwalk-dev sein (am 18.11.2026 lesend abgefragt).
-- Die Projektreferenz selbst steht nirgends in der Datenbank, nur die Kennung ist wirklich an das Projekt gebunden. Der Zustand von public wird hier nicht herangezogen.
do $$
declare dev_ref constant text := 'jlkqktmvqxibqdcobbhf'; prod_ref constant text := 'malbiahllucctiafzydv'; dev_sysid constant text := '7707768362984748398';
  want text := coalesce(current_setting('rw.project_ref', true), ''); have text;
begin
  if want = '' then raise exception 'ziel: rw.project_ref ist nicht gesetzt - Abbruch (erwartet: ruinwalk-dev, %)', dev_ref; end if;
  if want = prod_ref then raise exception 'ziel: Produktion ist ausdrücklich ausgeschlossen - Abbruch'; end if;
  if want <> dev_ref then raise exception 'ziel: rw.project_ref weicht von ruinwalk-dev ab - Abbruch'; end if;
  begin select system_identifier::text into have from pg_control_system();
  exception when others then raise exception 'ziel: Datenbankkennung nicht lesbar - Abbruch'; end;
  if have is distinct from dev_sysid then raise exception 'ziel: Datenbankkennung gehört nicht zu ruinwalk-dev - Abbruch'; end if;
end $$;

-- Löscht ausschließlich Testkonten, deren E-Mail auf @rwtest.invalid endet (reservierte Testdomain, nie echte Spieler). Separat vom Rollback.
-- Voraussetzung: gleiche Bestätigung wie beim Rollback:  set rw.rollback_confirm = 'ja-loeschen';
do $$
declare n bigint;
begin
  if coalesce(current_setting('rw.rollback_confirm', true), '') <> 'ja-loeschen' then raise exception 'cleanup: Bestätigung fehlt'; end if;
  delete from auth.users where email like '%@rwtest.invalid';
  get diagnostics n = row_count;
  raise notice 'cleanup: % Testkonten gelöscht (Kaskade über Profil, Charaktere, Sicherungen, Sitzungen)', n;
end $$;

commit;

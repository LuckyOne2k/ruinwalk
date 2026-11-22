-- Das Skript steht in EINER eigenen Transaktion (begin/commit): auch ohne psql -1 und ohne ON_ERROR_STOP wird nach einer fehlgeschlagenen Prüfung nichts gelöscht.
-- BEDIENUNG: ausschließlich über  supabase/dev/cleanup_dev.sh  (Referenz und Bestätigung als  set local  in DIESER Transaktion, nur Port 5432,
-- bereinigte PG-Umgebung, SHA-256-Pflicht). Direkt mit psql nur über eine Direktverbindung und mit  psql -X -v ON_ERROR_STOP=1 -f  (ohne -1).
begin;
-- Sperr-Wartezeit begrenzen, bevor die erste Sperre angefordert wird (5 s wie bei der Installation; eine wartende Sperre auf auth.users würde
-- sonst auch alle später ankommenden Anmeldezugriffe blockieren). Als DO-Block, damit es keine Ausgabe erzeugt.
do $$ begin perform set_config('lock_timeout', '5s', true); end $$;

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
-- Voraussetzung: gleiche Bestätigung wie beim Rollback (rw.rollback_confirm = 'ja-loeschen'; Wrapper: RW_ROLLBACK_CONFIRM=ja-loeschen).
do $$
declare n bigint; k bigint;
begin
  if coalesce(current_setting('rw.rollback_confirm', true), '') <> 'ja-loeschen' then raise exception 'cleanup: Bestätigung fehlt'; end if;
  -- B-6: mehrere Konten in EINER Anweisung. Vorab in der Reihenfolge der Admin-Löschung sperren: Kontozeilen (U), Profile (Pr), dann die Beratungssperren aller
  -- ihrer Charaktere (A, Schlüssel wie Schema rwi) – jeweils sortiert. Sonst nähme die Kaskade A je Konto nacheinander (nicht global sortiert) und könnte sich mit
  -- gleichzeitigem rwi.create_group/group_join verklemmen; A vor Pr würde dagegen delete_character/save_character (Pr zuerst) blockieren (Pr-Torregel).
  -- Ohne Schema rwi sind die Beratungssperren wirkungslos, aber harmlos.
  -- Nach einem Rollback fehlen public.profiles/public.characters: dann nur die Kontozeilen sperren (keine Kaskade auf Charaktere, kein B-6-Risiko).
  if to_regclass('public.profiles') is not null and to_regclass('public.characters') is not null then
    perform 1 from auth.users u where u.email like '%@rwtest.invalid' order by u.id for update;
    perform 1 from public.profiles p join auth.users u on u.id = p.account_id where u.email like '%@rwtest.invalid' order by p.account_id for update of p;
    for k in select distinct hashtextextended('rwi.char:' || lower(c.character_id::text), 0) from public.characters c join auth.users u on u.id = c.account_id
              where u.email like '%@rwtest.invalid' order by 1 loop
      perform pg_advisory_xact_lock(k);
    end loop;
  else
    perform 1 from auth.users u where u.email like '%@rwtest.invalid' order by u.id for update;
  end if;
  delete from auth.users where email like '%@rwtest.invalid';
  get diagnostics n = row_count;
  raise notice 'cleanup: % Testkonten gelöscht (Kaskade über Profil, Charaktere, Sicherungen, Sitzungen)', n;
end $$;

commit;

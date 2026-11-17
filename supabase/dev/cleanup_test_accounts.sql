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

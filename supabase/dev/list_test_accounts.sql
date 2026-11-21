-- Nur lesen: verwaiste Testkonten des Dev-Tests erkennen (E-Mail endet auf @rwtest.invalid, Namen rwt_<Lauf>_a/b). Ändert nichts.
select u.id, u.email, u.created_at, (select count(*) from public.characters c where c.account_id = u.id) as charaktere,
       (u.created_at < now() - interval '1 hour') as verwaist_verdaechtig
from auth.users u where u.email like '%@rwtest.invalid' order by u.created_at;
-- Löschen NUR mit Freigabe über supabase/dev/cleanup_test_accounts.sql (löscht ausschließlich @rwtest.invalid).

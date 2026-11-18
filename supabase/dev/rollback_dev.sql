-- Rücksetzung der Dev-Installation (schema.sql + rwi 01..05). NIE auf Produktion, nie ungeprüft. Läuft in EINER Transaktion: psql -1 -v ON_ERROR_STOP=1 -f rollback_dev.sql
-- Sicherung gegen Versehen: ohne  set rw.rollback_confirm = 'ja-loeschen';  vor dem Skript (gleiche Sitzung) bricht es ab.
-- Entfernt NUR die Objekte dieser Installation (ausdrückliche Namenslisten, kein „alles in public“). Nicht entfernt werden:
--   * auth.users-Zeilen (Testkonten): separat mit cleanup_test_accounts.sql
--   * Erweiterungen, Rollen, bestehende Default-ACLs, Vault-Secrets, Edge Functions, Cron-Jobs, Migrationshistorie (supabase_migrations)
-- CASCADE wirkt nur auf Objekte dieser Installation (Prüfung unten: keine Abhängigkeiten fremder Objekte).
do $$
declare n_prof bigint := 0; n_chr bigint := 0; n_inst bigint := 0; ext int;
begin
  if coalesce(current_setting('rw.rollback_confirm', true), '') <> 'ja-loeschen' then
    raise exception 'rollback: Bestätigung fehlt. Vorher in derselben Sitzung: set rw.rollback_confirm = ''ja-loeschen'';';
  end if;
  if to_regclass('public.profiles') is not null then select count(*) into n_prof from public.profiles; end if;
  if to_regclass('public.characters') is not null then select count(*) into n_chr from public.characters; end if;
  if to_regclass('rwi.instances') is not null then select count(*) into n_inst from rwi.instances; end if;
  raise notice 'rollback entfernt: % Profile, % Charaktere, % Instanzen (Testkonten in auth.users bleiben bestehen)', n_prof, n_chr, n_inst;
  -- Abhängigkeiten fremder Objekte von unseren Tabellen (z. B. Sichten, Fremdschlüssel anderer Schemas) würden durch CASCADE mitgerissen: dann abbrechen
  select count(*) into ext from pg_depend d join pg_rewrite rw on rw.oid = d.objid join pg_class v on v.oid = rw.ev_class
   join pg_class t on t.oid = d.refobjid where t.relnamespace in ('public'::regnamespace) and t.relname in ('profiles','account_entitlements','payment_events','characters','character_backups','audit_log') and v.relkind in ('v','m');
  if ext > 0 then raise exception 'rollback: % Sichten hängen von unseren Tabellen ab - Abbruch', ext; end if;
  select count(*) into ext from pg_constraint c where c.contype = 'f' and c.confrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname in ('profiles','account_entitlements','payment_events','characters','character_backups','audit_log'))
     and c.conrelid not in (select oid from pg_class where relnamespace in (select oid from pg_namespace where nspname in ('public', 'rwi')));
  if ext > 0 then raise exception 'rollback: % fremde Fremdschlüssel verweisen auf unsere Tabellen - Abbruch', ext; end if;
end $$;

-- 1. Trigger auf dem Supabase-Objekt auth.users zuerst (sonst scheitern Registrierungen zwischen den Schritten)
drop trigger if exists on_auth_user_created on auth.users;
-- 2. Schema rwi samt Tabellen, Funktionen, Triggerfunktionen und eigenen Default-ACL-Einträgen. Der Trigger characters_rwi_cleanup auf public.characters fällt mit der Triggerfunktion.
drop schema if exists rwi cascade;
-- 3. Tabellen zuerst (ihre Trigger hängen an den Funktionen); CASCADE nur als Sicherung innerhalb dieser Tabellen
drop table if exists public.audit_log, public.character_backups, public.characters, public.account_entitlements, public.payment_events, public.profiles cascade;
-- 4. Client-Wrapper und Funktionen in public (nur namentlich genannte), erst nachdem keine Trigger mehr an ihnen hängen
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
      'group_join','group_leave','group_ready','group_heartbeat','group_view','group_action','group_revive_use','group_revive_decline',
      'rw_worker_tick','rw_worker_rounds','rw_worker_claim','rw_worker_commit','rw_worker_report_failure','rw_worker_roster','rw_worker_start_fight','rw_ops_stuck_list','rw_ops_resume','rw_ops_register_engine','rw_ops_terminate',
      'create_character','save_character','delete_character','list_characters','move_character','touch_login','delete_account','username_available',
      'purge_expired_backups','purge_account_backups','has_entitlement','is_verified','safe_class','safe_level',
      'handle_new_user','guard_profile','guard_character','backup_character','audit_entitlement']) loop
    execute format('drop function %s', r.sig);
  end loop;
end $$;

-- Das Skript steht in EINER eigenen Transaktion (begin/commit): auch ohne psql -1 und ohne ON_ERROR_STOP führt ein fehlgeschlagener Check dazu, dass nichts davon ausgeführt wird.
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

-- Rücksetzung der Dev-Installation (schema.sql + rwi 01..05). NIE auf Produktion, nie ungeprüft. Läuft in EINER Transaktion: psql -1 -v ON_ERROR_STOP=1 -f rollback_dev.sql
-- Sicherung gegen Versehen: ohne  set rw.rollback_confirm = 'ja-loeschen';  vor dem Skript (gleiche Sitzung) bricht es ab.
-- Entfernt NUR die Objekte dieser Installation (Manifest mit Fingerabdrücken, kein „alles in public“). Nicht entfernt werden:
--   * auth.users-Zeilen (Testkonten): separat mit cleanup_test_accounts.sql
--   * Erweiterungen, Rollen, bestehende Default-ACLs, Vault-Secrets, Edge Functions, Cron-Jobs, Migrationshistorie (supabase_migrations)
-- KEIN CASCADE: Gelöscht wird ausschließlich, was das Manifest nennt, einzeln und in Abhängigkeitsreihenfolge; jede unerwartete Abhängigkeit lässt die Anweisung (und damit die ganze Transaktion) scheitern.
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

-- Sperren: alle Tabellen des Umfangs exklusiv sperren, BEVOR geprüft wird (gleiche Transaktion, bis zum Ende gehalten). Das verhindert gleichzeitiges Anlegen von
-- Sichten, Fremdschlüsseln, Triggern oder Richtlinien auf diesen Tabellen und Schreibzugriffe. lock_timeout: lieber abbrechen als hängen.
-- Nicht ausschließbar: gleichzeitiges Anlegen einer NEUEN Funktion oder eines Typs in rwi zwischen Prüfung und DROP SCHEMA (siehe docs/DEV_INSTALLATIONSFREIGABE.md).
set local lock_timeout = '15s';
do $$
declare r record;
begin
  for r in select c.oid::regclass as t from pg_class c
            where c.relkind in ('r','p') and (c.relnamespace = (select oid from pg_namespace where nspname = 'rwi')
               or (c.relnamespace = 'public'::regnamespace and c.relname in ('profiles','account_entitlements','payment_events','characters','character_backups','audit_log')))
            order by c.oid loop
    execute format('lock table %s in access exclusive mode', r.t);
  end loop;
end $$;

-- Manifest in einer Zwischentabelle (nur in dieser Transaktion, verschwindet beim Ende). Neuerzeugung: node server/instance/tests/rollback-manifest.mjs;
-- installation.mjs wird rot, solange das Manifest nicht zum installierten Stand passt.
-- Umfang: rwi (18 Tabellen mit Spaltenfingerabdruck, 67 Funktionen mit Signatur und Fingerabdruck aus Sprache, Rückgabetyp, SECURITY, Volatilität, search_path,
-- Quelltext, dazu Trigger und eigene Indizes), public (6 Tabellen mit Spaltenfingerabdruck, 38 Funktionen mit Fingerabdruck). Jede Abweichung (zusätzlich ODER
-- verändert/ersetzt) bricht ab. Nicht abgedeckt: von Hand ergänzte Constraints, Kommentare, Standardwerte, ACLs, Eigentümer.
create temp table rw_manifest(kind text not null, entry text not null) on commit drop;
insert into rw_manifest(kind, entry) values
    ('tab','cfg=a386bfdf20a7ac18598cf82609fc24cb'),
    ('tab','death_windows=e5211949b7263fd7881ef3fc651ae80c'),
    ('tab','engine_versions=62b4a1db485055e9a8b74b1c165cd70a'),
    ('tab','entitlements=9f63ac063d71ebd8c53b145aa85223eb'),
    ('tab','fights=ce087c3d20f75cdf5fd1b8c43752863d'),
    ('tab','group_log=5b3f4c9605b398dee403b4ea28a703eb'),
    ('tab','instances=b8a640dbae00434f16df8d776136b785'),
    ('tab','members=e224f3bd9626c889f5148ddacb38e066'),
    ('tab','operators=1f809ea093aafc87d55b1545d71fafba'),
    ('tab','ops_alerts=28fcca6781f8423a0038ce146fc58d46'),
    ('tab','ops_log=b1bb662f1b5e793e3610b40ce705dccf'),
    ('tab','players=83c6a0c1c8b5beea13d1af6a95839b10'),
    ('tab','resolve_jobs=8f6acc64dd0950d0db7992eab032d97c'),
    ('tab','rewards=f53a9c0a50b0103fa7464de38a1ad478'),
    ('tab','round_results=37d03654d0d70cd3c602bf98c284dfb2'),
    ('tab','system_gaps=304bed487d9832a6be05cdd04c68f234'),
    ('tab','system_heartbeat=9b431fa294e1a433ec694832a1208a36'),
    ('tab','waitlist=5c8341f16f7edddcd910a9c96af9ca67'),
    ('fn','abort_instance(p_instance bigint, p_why text)=626440b5c5ce2ffb0f1cc5d975b922e0'),
    ('fn','account_conflict(p_instance bigint, p_player text)=c865a27c16897ac9c02611dc2a62f68f'),
    ('fn','account_guard()=6bd42996b0e0ef4fa9bd337befb51618'),
    ('fn','account_of(p_player text)=dc37d997c58e35f43d0cd47f4657edea'),
    ('fn','active_count(p_instance bigint)=64760bbac7ffdca79978e20be1b9eb4c'),
    ('fn','advance_clock(p_instance bigint, p_now timestamp with time zone)=5419bb0d79ba1577a20196c5dc6bc64d'),
    ('fn','after_auto_removal(p_instance bigint)=162ad95c892e96f43dbdbbb5294efe25'),
    ('fn','cfg(p text)=da13c0e9bef30aff9f77361fe7f8adcb'),
    ('fn','check_operator(p_operator uuid, p_scope text, p_fight bigint, p_round integer, p_note text)=d49e4583a7ff0ee844d80988d123606b'),
    ('fn','claim_resolution(p_fight bigint, p_round integer)=71a737c14483602ade07b4c7be5940c6'),
    ('fn','close_stuck(p_fight bigint, p_round integer, p_kind text, p_operator uuid, p_note text, p_old_engine text, p_new_engine text)=c8d46e661c5a3e6ccc6c33aaebd58835'),
    ('fn','commit_round(p_fight bigint, p_round integer, p_token uuid, p_expected_version integer, p_input_hash text, p_engine text, p_result jsonb)=ebe4b738c161fd4f1b7f584bfced7280'),
    ('fn','contribution(p_instance bigint, p_key text)=2239f829cdea30e43890a99f1397eaa8'),
    ('fn','create_group(p_kind text, p_players text[], p_fights_total integer, p_event bigint, p_ends_at timestamp with time zone)=788e2557a499bde5f496bc1762613c33'),
    ('fn','current_player()=9fdfca9b4a1e9073234f5a6fdca85316'),
    ('fn','deadline_verdict(p_instance bigint, p_player text, t timestamp with time zone)=507ec4f0ca1be7c36b6649e65bdb2244'),
    ('fn','decline_revive_item(p_fight bigint, p_key text)=a5be399cdb7603ce9413c9e265189090'),
    ('fn','derive_profile(p_character uuid)=27b22a524c3352fb729c7e8b5256a78a'),
    ('fn','drop_member(p_instance bigint, p_player text, p_reason text)=005c6ec6e31e746a34af36d8d30b05ec'),
    ('fn','effective_last_seen(p_member bigint, p_now timestamp with time zone)=67f9ecaa4376920f99403fc3be648327'),
    ('fn','eligible(p_player text)=a12545bcfbc5dfb382f08e5ae1e5dafa'),
    ('fn','end_instance(p_instance bigint)=ab6adf85ba673faef5c248cfa99626e9'),
    ('fn','enforce_deadlines(p_instance bigint, p_player text, t timestamp with time zone)=13a1afae264265dc7225a012fa3fed42'),
    ('fn','enforce_deadlines_quiet(p_instance bigint, p_player text, t timestamp with time zone)=f3aac16fbfd0fa60ec116840ed165af1'),
    ('fn','fight_rounds(p_fights bigint[])=94e41c9cabfe05c0faf4a373398af55a'),
    ('fn','glog(p_instance bigint, p_player text, p_event text, p_detail text)=756cdbc17c808fe1dce4aa6d7a39256e'),
    ('fn','group_tick(p_now timestamp with time zone)=0cb0c0d6eed42e87f521f71218075ee1'),
    ('fn','heartbeat(p_instance bigint)=169a86df587d5abde561af6033f7d266'),
    ('fn','heartbeat_for(p_instance bigint, me text)=c71e5bb3f135ba479e06ef2bf5a0a766'),
    ('fn','instance_view(p_instance bigint, p_player text, p_known_version bigint)=290a3d014afb2df1f219ff56dd025396'),
    ('fn','join(p_instance bigint, p_player text)=e0687eb7f4905ef840afa4f92357dfb1'),
    ('fn','leave(p_instance bigint, p_player text)=56ef61c6d41aa2492491d81c2012469b'),
    ('fn','members_size_guard()=4d1612fca9291c50acb1c23d0573bb27'),
    ('fn','on_character_deleted()=a122dfd45a6ba142fd779e57ac94641d'),
    ('fn','on_fight_end()=33a3049aba83a19f159832caeedf2918'),
    ('fn','on_profile_deleted()=815e31c621db62b33f58ce6cccad6dd1'),
    ('fn','on_profile_deleting()=78f682ff915f0e0e0119ab01817ae673'),
    ('fn','operator_removed()=02144f60efc7b17dcc0237ae835e4c3f'),
    ('fn','ops_log_append_only()=e741657c9fe7364270fa803207542976'),
    ('fn','own_character(p_character uuid, p_instance bigint, p_need_entitlement boolean)=c56d43ad202d6904e133ddc20df610db'),
    ('fn','permanently_disconnected(p_member bigint, p_now timestamp with time zone)=121d1e17588e8e8e8b218e54ae8a8364'),
    ('fn','profile_of(p_player text)=d6badb31d587349ce9f3a9b8b0c6d830'),
    ('fn','profile_snapshot()=68b67a3e919e3badd20a2218c712f361'),
    ('fn','promote_waitlist(p_instance bigint)=d1fda6b56fb4ce6517a8adfda9eee3fe'),
    ('fn','raise_stuck(p_fight bigint, p_round integer)=2b251e4e7deb72185b210d30b4c3d3b0'),
    ('fn','register_engine(p_operator uuid, p_version text, p_state_schema integer, p_note text)=05559fe81b8d1c521e0bb0370d8a0f6a'),
    ('fn','report_failure(p_fight bigint, p_round integer, p_token uuid, p_error text)=1e698586699144339434c907b1c4e621'),
    ('fn','resume_stuck(p_fight bigint, p_round integer, p_operator uuid, p_note text, p_engine text)=0654bcb728fd4fe90f6329f35e49d6bd'),
    ('fn','reward_filter()=d1c6699cf35876947eb2a5d8c3e829ca'),
    ('fn','roster(p_instance bigint)=20cce4c3c3febd82ecf1e042a0039912'),
    ('fn','set_connection(p_instance bigint, p_key text, p_connected boolean)=be9f419265cf685e1037978b19dc4504'),
    ('fn','set_connection_core(p_instance bigint, p_key text, p_connected boolean)=759d2688b588b10889c40e95b4bb052d'),
    ('fn','set_operator(p_account uuid, p_label text, p_scopes text[], p_active boolean)=abd205fd90b403fb0c1a5b3f62cdb683'),
    ('fn','set_ready(p_instance bigint, p_player text)=93fc926991d4ce919b070876919c9144'),
    ('fn','start_fight(p_instance bigint, p_state jsonb)=5f3a324529c6176ee4834082ce32737d'),
    ('fn','stuck_overview()=e89418809bd7f9add1645429a310ea78'),
    ('fn','submit_action(p_fight bigint, p_key text, p_round integer, p_action jsonb)=53142fac258abd7d3d513b60f562e83f'),
    ('fn','submit_action_for(p_player text, p_fight bigint, p_round integer, p_action jsonb)=2964dc1b3b683182fd5471ac05dc7da0'),
    ('fn','sweep_core(p_event bigint, p_all boolean, p_skip boolean)=e1b461c1ffe4f87fb2f54ddb8ecbfacc'),
    ('fn','sweep_event(p_event bigint, p_skip boolean)=ad951e6de06acfc646d2ded072797a78'),
    ('fn','sweep_events()=a3c829f8d39064ad646986f1ec1d8776'),
    ('fn','sync_windows(p_fight bigint, p_instance bigint, p_state jsonb, p_close_all boolean)=e36692696fbc5384a53ae50b38800b4a'),
    ('fn','terminate_stuck(p_fight bigint, p_operator uuid, p_note text)=979987650205331e10f7511f17dc168f'),
    ('fn','use_revive_item(p_fight bigint, p_key text)=e3d9647348bae93c5bf0edeaab0a700a'),
    ('fn','watchdog_core()=3305a8860b06b47fc2d754ec04985fe7'),
    ('fn','watchdog_tick()=41ca18b93f65bd389d5df0b2d16712af'),
    ('fn','wipe_hold(p_fight bigint, p_instance bigint, p_now timestamp with time zone)=fd8ed87bfc14027c7d0f154285427d31'),
    ('ptab','account_entitlements=352016b130e64ddbae2e34f5ac893264'),
    ('ptab','audit_log=bf60161677bcc64b5afa0ed148d1eb10'),
    ('ptab','character_backups=3bc64991c91f6c5be45f40fc85567a83'),
    ('ptab','characters=07076469360970d9387a55841bdd7b09'),
    ('ptab','payment_events=9513e1d7c3133561ba6377d29b6df179'),
    ('ptab','profiles=33edd7adaae50803cab8046918238ec3'),
    ('pfn','audit_entitlement()=9d67bb22c7e5405fa7d8307f98138045'),
    ('pfn','backup_character()=94dd9d87677b843cae5be4de12c5d3c2'),
    ('pfn','create_character(p_slot integer, p_name text, p_data jsonb)=8e6f9d4ca47f2127d7dc9a838c3b5bd4'),
    ('pfn','delete_account(p_confirm text)=0cc4b1d04a35f97fda6c4bafa96c343f'),
    ('pfn','delete_character(p_id uuid)=2befe643cb9e2f9e924e60eeabdb410d'),
    ('pfn','group_action(p_fight bigint, p_round integer, p_action jsonb, p_character uuid)=0353075157a91cfc6a82f47fc3df4e2d'),
    ('pfn','group_heartbeat(p_instance bigint, p_character uuid)=12435038af1f8249b738eb46f541e55b'),
    ('pfn','group_join(p_instance bigint, p_character uuid)=43679c37d0c4d7ea0234496f002352e4'),
    ('pfn','group_leave(p_instance bigint, p_character uuid)=b4046acc02250abb4b36450cfa7ee618'),
    ('pfn','group_ready(p_instance bigint, p_character uuid)=ca9e189658a3072b923aa2c7a32b53f8'),
    ('pfn','group_revive_decline(p_fight bigint, p_character uuid)=49d3c5ba478e0d29667b6c768a437588'),
    ('pfn','group_revive_use(p_fight bigint, p_character uuid)=319a241f6becb39db78850574ce6d299'),
    ('pfn','group_view(p_instance bigint, p_known_version bigint, p_character uuid)=9da2b892b6117ce5cc6d646d8b226436'),
    ('pfn','guard_character()=6e9ecf628ebaf3b238ec564dc1321d1e'),
    ('pfn','guard_profile()=b861544b04c45a97f1eee71bc6e1e544'),
    ('pfn','handle_new_user()=0a9832523afcdb93010f4dd544633472'),
    ('pfn','has_entitlement(p_account uuid, p_type text)=8a0abe632755783a9561f0035a010c9c'),
    ('pfn','is_verified(p_account uuid)=2786eb550d5bf93b021a2fdda5d2e698'),
    ('pfn','list_characters()=7c28b53b70eb2ebff310058a764856c7'),
    ('pfn','move_character(p_id uuid, p_target integer)=cb576c845d5d16e5bbbc81e54e5f6492'),
    ('pfn','purge_account_backups(p_account uuid)=a4f611ba71935c9b7c0d0a95d389f3fa'),
    ('pfn','purge_expired_backups()=3fdff8cca7857bfa7746bf4e8580f783'),
    ('pfn','rw_ops_register_engine(p_operator uuid, p_version text, p_state_schema integer, p_note text)=687f17641f03697bda8770083fca1fd2'),
    ('pfn','rw_ops_resume(p_fight bigint, p_round integer, p_operator uuid, p_note text, p_engine text)=5a13f23e49d359008a371850370b4990'),
    ('pfn','rw_ops_stuck_list()=7667753cc3b2ff25e75985e203cf05a0'),
    ('pfn','rw_ops_terminate(p_fight bigint, p_operator uuid, p_note text)=956fb832e94950144ac259e702db8645'),
    ('pfn','rw_worker_claim(p_fight bigint, p_round integer)=cbcf7c2b679498574775e624ae98cac2'),
    ('pfn','rw_worker_commit(p_fight bigint, p_round integer, p_token uuid, p_version integer, p_input_hash text, p_engine text, p_result jsonb)=9c8a157356a703fee05120f72c79472e'),
    ('pfn','rw_worker_report_failure(p_fight bigint, p_round integer, p_token uuid, p_error text)=ae4fe25b3e5564fe919b6978f512585f'),
    ('pfn','rw_worker_roster(p_instance bigint)=8cc7b78cd2bdc22952e2aad762784d66'),
    ('pfn','rw_worker_rounds(p_fights bigint[])=1184a555f864948cfd4bcf74485ba1ba'),
    ('pfn','rw_worker_start_fight(p_instance bigint, p_state jsonb)=6e65f21e6575f0a6f99f757c73cd8673'),
    ('pfn','rw_worker_tick()=1ee07a7d18844f97bfc79d5739650ed9'),
    ('pfn','safe_class(d jsonb)=246302a8abe70e61c65d0b4c220bc10f'),
    ('pfn','safe_level(d jsonb)=680bfcc830cc10ab400a6b2ff3ffc296'),
    ('pfn','save_character(p_id uuid, p_expected_version integer, p_data jsonb)=86b35764bbee66dbca2f31399e085eeb'),
    ('pfn','touch_login()=f6e44e1725cfc2ee922cae219bd7548e'),
    ('pfn','username_available(p_name text)=046473c6a95e013f43fadf4278a41d14'),
    ('trg','fights.fights_end'),
    ('trg','members.members_account_guard'),
    ('trg','members.members_profile_snapshot'),
    ('trg','members.members_size_guard'),
    ('trg','operators.operators_removed'),
    ('trg','ops_log.ops_log_no_change'),
    ('trg','rewards.rewards_filter'),
    ('trg','waitlist.waitlist_account_guard'),
    ('idx','instances_event_id_idx'),
    ('idx','members_account_uq'),
    ('idx','members_instance_id_key_idx'),
    ('idx','members_player_uq'),
    ('idx','ops_alerts_dedupe_uq'),
    ('idx','ops_log_denied_at_idx'),
    ('idx','ops_log_denied_op_idx'),
    ('idx','waitlist_account_ix'),
    ('idx','waitlist_uq');

do $$
declare extra text;
begin
  select string_agg(c.relkind::text || ' ' || c.relname, ', ' order by c.relname) into extra from pg_class c
   where c.relnamespace = (select oid from pg_namespace where nspname = 'rwi') and c.relkind in ('p','v','m','f','c','S')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.refclassid = 'pg_class'::regclass and d.deptype in ('a','i'));
  if extra is not null then raise exception 'rollback: rwi enthält Relationen außerhalb des Installationsumfangs (%) - Abbruch ohne Änderung', extra; end if;
  select string_agg(c.relname, ', ' order by c.relname) into extra from pg_class c
   where c.relnamespace = (select oid from pg_namespace where nspname = 'rwi') and c.relkind = 'r' and not exists (select 1 from rw_manifest m where m.kind = 'tab' and m.entry = c.relname || '=' || md5((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)));
  if extra is not null then raise exception 'rollback: rwi enthält Tabellen, die nicht (oder nicht mit der vorgesehenen Spaltenstruktur) zur Installation gehören (%) - Abbruch ohne Änderung', extra; end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname) into extra from pg_proc p join pg_language l on l.oid = p.prolang
   where p.pronamespace = (select oid from pg_namespace where nspname = 'rwi') and not exists (select 1 from rw_manifest m where m.kind = 'fn' and m.entry = p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || md5(concat_ws('|', p.prosecdef, p.provolatile, p.proleakproof, p.proisstrict, p.proretset, l.lanname, p.prorettype::regtype::text, coalesce(p.proconfig::text, ''), p.prokind, p.proparallel, pg_get_function_identity_arguments(p.oid), p.prosrc)));
  if extra is not null then raise exception 'rollback: rwi enthält Funktionen, die nicht (oder nicht unverändert) zur Installation gehören (%) - Abbruch ohne Änderung', extra; end if;
  select string_agg(t.typname, ', ') into extra from pg_type t
   where t.typnamespace = (select oid from pg_namespace where nspname = 'rwi') and t.typtype <> 'c' and t.typcategory <> 'A';
  if extra is not null then raise exception 'rollback: rwi enthält Typen außerhalb des Installationsumfangs (%) - Abbruch ohne Änderung', extra; end if;
  select string_agg(c.relname || '.' || g.tgname, ', ') into extra from pg_trigger g join pg_class c on c.oid = g.tgrelid
   where c.relnamespace = (select oid from pg_namespace where nspname = 'rwi') and not g.tgisinternal and not exists (select 1 from rw_manifest m where m.kind = 'trg' and m.entry = c.relname || '.' || g.tgname);
  if extra is not null then raise exception 'rollback: rwi enthält Trigger außerhalb des Installationsumfangs (%) - Abbruch ohne Änderung', extra; end if;
  select string_agg(i.relname, ', ') into extra from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class c on c.oid = x.indrelid
   where c.relnamespace = (select oid from pg_namespace where nspname = 'rwi') and not exists (select 1 from pg_constraint k where k.conindid = i.oid) and not exists (select 1 from rw_manifest m where m.kind = 'idx' and m.entry = i.relname);
  if extra is not null then raise exception 'rollback: rwi enthält Indizes außerhalb des Installationsumfangs (%) - Abbruch ohne Änderung', extra; end if;
  select string_agg(tablename || '.' || policyname, ', ') into extra from pg_policies where schemaname = 'rwi';
  if extra is not null then raise exception 'rollback: rwi enthält Richtlinien außerhalb des Installationsumfangs (%) - Abbruch ohne Änderung', extra; end if;
  -- public: Tabellen mit einem Namen aus dem Manifest müssen genau der Installation entsprechen (sonst gehört das Objekt nicht uns)
  select string_agg(c.relname, ', ' order by c.relname) into extra from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f') and exists (select 1 from rw_manifest m where m.kind = 'ptab' and split_part(m.entry, '=', 1) = c.relname)
     and not exists (select 1 from rw_manifest m where m.kind = 'ptab' and m.entry = c.relname || '=' || md5((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)));
  if extra is not null then raise exception 'rollback: public enthält gleichnamige Objekte, die nicht (oder nicht unverändert) zur Installation gehören (Tabellen: %) - Abbruch ohne Änderung', extra; end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname) into extra from pg_proc p join pg_language l on l.oid = p.prolang
   where p.pronamespace = 'public'::regnamespace and exists (select 1 from rw_manifest m where m.kind = 'pfn' and split_part(m.entry, '(', 1) = p.proname)
     and not exists (select 1 from rw_manifest m where m.kind = 'pfn' and m.entry = p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || md5(concat_ws('|', p.prosecdef, p.provolatile, p.proleakproof, p.proisstrict, p.proretset, l.lanname, p.prorettype::regtype::text, coalesce(p.proconfig::text, ''), p.prokind, p.proparallel, pg_get_function_identity_arguments(p.oid), p.prosrc)));
  if extra is not null then raise exception 'rollback: public enthält gleichnamige Funktionen, die nicht (oder nicht unverändert) zur Installation gehören (%) - Abbruch ohne Änderung', extra; end if;
end $$;

-- Prüfung über die Systemkataloge (pg_depend): Nichts außerhalb des Installationsumfangs darf von Objekten abhängen, die gelöscht werden.
-- Umfang = Schema rwi, die 6 public-Tabellen (samt Spalten, Indizes, Triggern, Richtlinien, Fremdschlüsseln) und die im Manifest genannten public-Funktionen.
-- Unbekannte Objektarten als Abhängige zählen als fremd (Abbruch statt Raten).
do $$
declare bad text; n_bad int;
begin
  with m(classid, objid, ns, rel) as (
        select 'pg_class'::regclass::oid, c.oid, c.relnamespace, q2.r1
          from pg_class c
          cross join lateral (select coalesce(
                 (select i.indrelid from pg_index i where i.indexrelid = c.oid),                              -- Index -> seine Tabelle
                 (select d.refobjid from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.refclassid = 'pg_class'::regclass
                     and d.deptype in ('a', 'i') and c.relkind = 'S' limit 1),                                -- eigene Sequenz -> Tabelle
                 c.oid) as r0) q
          cross join lateral (select coalesce((select t.oid from pg_class t where t.reltoastrelid = q.r0), q.r0) as r1) q2     -- TOAST-Tabelle (und deren Index) -> Haupttabelle
  union all select 'pg_proc'::regclass::oid, p.oid, p.pronamespace, null from pg_proc p
  union all select 'pg_type'::regclass::oid, t.oid, t.typnamespace, nullif(coalesce(nullif(t.typrelid, 0), (select e.typrelid from pg_type e where e.oid = t.typelem and t.typcategory = 'A')), 0) from pg_type t   -- Zeilentyp bzw. Array-Zeilentyp -> Tabelle
  union all select 'pg_namespace'::regclass::oid, n.oid, n.oid, null from pg_namespace n
  union all select 'pg_constraint'::regclass::oid, k.oid, k.connamespace, nullif(k.conrelid, 0) from pg_constraint k
  union all select 'pg_trigger'::regclass::oid, g.oid, r.relnamespace, g.tgrelid from pg_trigger g join pg_class r on r.oid = g.tgrelid
  union all select 'pg_rewrite'::regclass::oid, w.oid, r.relnamespace, w.ev_class from pg_rewrite w join pg_class r on r.oid = w.ev_class
  union all select 'pg_policy'::regclass::oid, o.oid, r.relnamespace, o.polrelid from pg_policy o join pg_class r on r.oid = o.polrelid
  union all select 'pg_attrdef'::regclass::oid, a.oid, r.relnamespace, a.adrelid from pg_attrdef a join pg_class r on r.oid = a.adrelid
  union all select 'pg_default_acl'::regclass::oid, x.oid, x.defaclnamespace, null from pg_default_acl x),
  tabs as (select c.oid from pg_class c where c.relnamespace = 'public'::regnamespace and exists (select 1 from rw_manifest m where m.kind = 'ptab' and split_part(m.entry, '=', 1) = c.relname)),
  fns as (select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and exists (select 1 from rw_manifest m where m.kind = 'pfn' and split_part(m.entry, '(', 1) = p.proname)),
  -- gelöscht wird: alles in rwi, die 6 Tabellen samt Zubehör
  doomed as (select * from m where ns = (select oid from pg_namespace where nspname = 'rwi') or rel in (select oid from tabs) or rel in (select oid from pg_class where relnamespace = (select oid from pg_namespace where nspname = 'rwi'))),
  -- erlaubte Abhängige: dasselbe, dazu unsere benannten Funktionen
  allowed as (select classid, objid from doomed union all select 'pg_proc'::regclass::oid, oid from fns
              -- interne Fremdschlüssel-Trigger auf der Gegenseite (z. B. auf auth.users): gehören zu unserem Fremdschlüssel und fallen mit ihm
              union all select 'pg_trigger'::regclass::oid, g.oid from pg_trigger g join doomed k on k.classid = 'pg_constraint'::regclass and k.objid = g.tgconstraint where g.tgisinternal),
  hits as (
    select d.classid, d.objid, d.objsubid, d.refclassid, d.refobjid, d.refobjsubid
      from pg_depend d join doomed r on r.classid = d.refclassid and r.objid = d.refobjid
     where d.deptype not in ('p', 'e')
       and not exists (select 1 from allowed a where a.classid = d.classid and a.objid = d.objid))
  select count(*), string_agg(pg_describe_object(classid, objid, objsubid) || '  <-hängt ab von-  ' || pg_describe_object(refclassid, refobjid, refobjsubid), E'\n  ' order by pg_describe_object(classid, objid, objsubid))
    into n_bad, bad from hits;
  if n_bad > 0 then raise exception E'rollback: % Objekte außerhalb des Installationsumfangs hängen von zu löschenden Objekten ab - Abbruch ohne Änderung:\n  %', n_bad, bad; end if;
end $$;

-- ===== Löschsequenz: ohne CASCADE, einzeln und in Abhängigkeitsreihenfolge, nur Manifest-Objekte. Jeder Fehler (auch eine unerwartete Abhängigkeit) macht die ganze Transaktion rückgängig. =====
-- 1. Trigger auf dem Supabase-Objekt auth.users zuerst (sonst scheitern Registrierungen zwischen den Schritten); nur der eigene, namentlich genannte Trigger.
drop trigger if exists on_auth_user_created on auth.users;
do $$
declare lst text;
begin
  -- 2. Tabellen im Schema rwi (eine Anweisung: gegenseitige Fremdschlüssel gehören zusammen; Trigger/Indizes/Sequenzen fallen mit den Tabellen)
  select string_agg(c.oid::regclass::text, ', ' order by c.relname) into lst from pg_class c
   where c.relnamespace = (select oid from pg_namespace where nspname = 'rwi') and c.relkind = 'r'
     and exists (select 1 from rw_manifest m where m.kind = 'tab' and m.entry = c.relname || '=' || md5((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)));
  if lst is not null then execute 'drop table ' || lst; end if;
  -- 3. Tabellen in public (ihre Trigger, u. a. characters_rwi_cleanup, fallen mit ihnen; danach hängt nichts mehr an den Funktionen)
  select string_agg(c.oid::regclass::text, ', ' order by c.relname) into lst from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and exists (select 1 from rw_manifest m where m.kind = 'ptab' and m.entry = c.relname || '=' || md5((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)));
  if lst is not null then execute 'drop table ' || lst; end if;
  -- 4. Funktionen: nur die mit Signatur UND Fingerabdruck im Manifest (public und rwi), in einer Anweisung (SQL-Funktionen können einander verwenden)
  select string_agg(p.oid::regprocedure::text, ', ' order by p.pronamespace, p.proname) into lst from pg_proc p join pg_language l on l.oid = p.prolang
   where p.pronamespace in ('public'::regnamespace, (select oid from pg_namespace where nspname = 'rwi'))
     and exists (select 1 from rw_manifest m where m.kind = case when p.pronamespace = 'public'::regnamespace then 'pfn' else 'fn' end
                   and m.entry = p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || md5(concat_ws('|', p.prosecdef, p.provolatile, p.proleakproof, p.proisstrict, p.proretset, l.lanname, p.prorettype::regtype::text, coalesce(p.proconfig::text, ''), p.prokind, p.proparallel, pg_get_function_identity_arguments(p.oid), p.prosrc)));
  if lst is not null then execute 'drop function ' || lst; end if;
  -- 5. Schema rwi OHNE CASCADE: scheitert, sobald irgendetwas darin übrig ist (auch etwas, das erst nach der Prüfung entstanden ist); eigene Default-ACL-Einträge fallen automatisch mit.
  if exists (select 1 from pg_namespace where nspname = 'rwi') then execute 'drop schema rwi'; end if;
end $$;

commit;

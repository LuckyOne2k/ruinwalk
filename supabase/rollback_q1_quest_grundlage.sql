-- ROLLBACK Q1 (NICHT ANGEWENDET): macht supabase/migration_q1_quest_grundlage.sql rückgängig. Entfernt ausschließlich die Objekte aus Q1
-- (Tabellen samt Triggern, Policies, Indizes und Sequenz; danach die Funktionen). ACHTUNG: Questdaten (Katalog, Rotation, Questzeilen, Gutschriften,
-- bestätigte Werte) gehen dabei verloren; bestehende Tabellen und Funktionen bleiben unverändert. Ohne CASCADE: eine fremde Abhängigkeit bricht ab.
begin;
drop table public.quest_rewards, public.character_quests, public.character_confirmed, public.quest_audit, public.quest_rotation, public.quest_pools,
           public.npc_defs, public.npc_seed, public.quest_defs, public.quest_events;
drop function public.quest_bereich(text), public.quest_ziele_ok(jsonb), public.quest_inst_ok(text,text), public.quest_inst_datum(text), public.quest_zaehler_ok(jsonb), public.quest_periode_datum(text,timestamptz), public.quest_periode_start(date), public.quest_stufe(int), public.quest_defs_guard(), public.quest_pools_guard(), public.quest_rotation_guard(), public.npc_defs_guard(), public.character_confirmed_guard(), public.character_quests_guard(), public.quest_rewards_guard(), public.quest_rotation_wahl(text,date), public.quest_rotation_sichern(text,date), public.quest_state(uuid);
commit;

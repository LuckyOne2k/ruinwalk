# Datenbank, RLS und Rechte

Quelle: `supabase/schema.sql`, `docs/ACCOUNT_BACKEND.md`, `docs/D3_PRUEFBERICHT.md`, `docs/INSTANZKAMPF_SICHERHEIT_PHASE1.md`.

## Produktiv-Schema `public` (live in Supabase; ohne Q1 und B2/B4 – deren Einspielung ist nicht bestätigt, siehe unten)

| Tabelle | Inhalt | Client-Zugriff |
|---|---|---|
| `profiles` | account_id (→ auth.users), username (3–20, `[A-Za-z0-9_]`, eindeutig ohne Groß/Klein), last_login | SELECT eigene Zeile |
| `account_entitlements` | Berechtigungen, aktuell nur `third_character_slot` (pending/active/refunded/failed) | SELECT eigene |
| `payment_events` | Zahlungsereignisse, `provider_event_id` als PK (idempotent) | keiner |
| `characters` | character_id, account_id, slot_number 1–3, name (1–16), class, level 1–50, `character_data` jsonb (< 1 MB), `version` | SELECT eigene; Platz 3 nur mit aktiver Berechtigung |
| `character_backups` | Sicherungen (reason update/delete), letzte 10, max. 1 „update“ je 10 min (S1), 30 Tage Aufbewahrung | keiner |
| `audit_log` | Protokoll (Löschen, später Kauf/Migration) | keiner |

**Grundmuster:** RLS überall aktiv · `revoke all … from public, anon, authenticated` · Clients nur SELECT mit Eigentümer-Policy `(select auth.uid())` · Schreiben ausschließlich über `SECURITY DEFINER`-Funktionen mit festem `search_path`, die `auth.uid()` in jeder Anweisung prüfen · `EXECUTE` gezielt vergeben.

**Client-RPCs (authenticated):** `create_character(slot, name, data)`, `save_character(id, expected_version, data)` (Fehler `version_conflict` PT409, `character_locked`), `list_characters()`, `move_character(id, target)`, `delete_character(id)`, `touch_login()`, `delete_account(confirm)` (verlangt frische Passwort-Anmeldung: AMR password, Sitzung ≤ 2 min). Anonym: `username_available(name)`.
**Nur intern/service_role:** `has_entitlement`, `is_verified`, `safe_class`, `safe_level`, `purge_expired_backups` (service_role), `purge_account_backups` (nur intern), Trigger `handle_new_user`, `guard_profile`, `guard_character`, `backup_character`, `audit_entitlement`.

**Fehlermeldungen verraten nichts:** fremder/unbekannter Charakter → gleiche Antwort.

## Quest-Grundgerüst Q1 (vorbereitet, NICHT installiert – weder Dev noch Produktion; laut Repo-Dokumentation, nicht live geprüft)
Steht seit PR #14 in `supabase/schema.sql` (Zielstand); PR #16 änderte nur Migration und Rollback (`lock_timeout`). Migration/Rücknahme: `supabase/migration_q1_quest_grundlage.sql` / `rollback_q1_quest_grundlage.sql` (`set local lock_timeout = '5s'`; Einspielen nur mit Freigabe, `psql -X -v ON_ERROR_STOP=1 -f …`, ohne `-1`, Port 5432). Details: `docs/QUEST_PAKET2_BERICHT.md`.
- **Tabellen (10, alle RLS):** `quest_events`, `quest_defs`, `quest_pools`, `quest_rotation`, `npc_defs`, `npc_seed`, `character_confirmed`, `character_quests`, `quest_rewards`, `quest_audit`.
- **Client-Zugriff:** SELECT (`authenticated`) auf `quest_defs` (ohne Klassenprüfungen, Event-Quests erst ab Eventbeginn), `quest_rotation`, `quest_events` (begonnene), `npc_defs`; eigene Zeilen von `character_confirmed`, `character_quests`, `quest_rewards`. `quest_pools`, `npc_seed`, `quest_audit`: keine Client-Rechte. Kein Client-Schreibrecht.
- **Funktionen (18):** Prüf-/Periodenfunktionen `quest_bereich`, `quest_ziele_ok`, `quest_inst_ok`, `quest_inst_datum`, `quest_zaehler_ok`, `quest_periode_datum`, `quest_periode_start`, `quest_stufe`; Rotation `quest_rotation_wahl`, `quest_rotation_sichern`; 7 Triggerfunktionen (`*_guard`). Einzige Client-RPC: `quest_state(p_character uuid)` (`authenticated`).
- **Grenzen:** Tages-/Wochenaktivierung gesperrt bis Paket 3 (schreibender Teil, offen); Queststufe nur aus `character_confirmed.level`. TRUNCATE für `service_role` entzogen auf `quest_defs`, `quest_rotation`, `character_confirmed`, `character_quests` und `quest_rewards`; `quest_pools` und `npc_defs` behalten dieses Recht. Offen: NPC-Verweisschutz (Auflage für das erste Paket, das `npc_defs.vorlagen` ausliest).

## Supabase-Besonderheiten im Projekt
- Seit 2026 vergibt Supabase für neue Tabellen keine Standardrechte mehr (Data API opt-in) → Rechte ausdrücklich vergeben, Tests prüfen beide Modi („neu“ und „legacy“).
- Neue Funktionen in `public` bekommen standardmäßig EXECUTE für PUBLIC → nach jeder neuen Funktion `revoke … from public` wiederholen. `SECURITY DEFINER` in `public` ist sonst ein öffentlicher Endpunkt.
- Trigger auf `auth.users` im SQL-Editor als `postgres` anlegen.
- Echte Konten existieren im Projekt → Live-Prüfungen nur mit Testkonten, Aufräumen nur von Testkonten.

## Prototyp-Schema `rwi` (Instanzkampf, NICHT live)
- Nur in temporärem lokalem Postgres (Tests). Für anon/authenticated: keine USAGE, keine Tabellenrechte, RLS ohne Policy. service_role: Serverfunktionen (31).
- Clientweg: `public.group_join|leave|ready|heartbeat|view|action|revive_use|revive_decline` (authenticated). Identität = `auth.uid()`, Spielerschlüssel = `characters.character_id::text`, Eigentum geprüft (`rwi.own_character`), Fehler `forbidden` PT403 / `ambiguous_character` PT409 / `not_authenticated` PT401.
- Testfunktionen mit Spielerparameter (`join`, `set_ready`, `submit_action_for`, …) sind für keine Rolle ausführbar. Jede neue `rwi`-Funktion muss im Rechteskript (`sql/05_produktion.sql`) einer Klasse zugeordnet werden, sonst scheitert das Skript (Wächter).
- Nicht auf echter Supabase verifiziert (Annahmen in SICHERHEIT_PHASE1 Abschnitt 6).

## Tests
- `bash supabase/tests/run.sh` – temporäres PostgreSQL 16 + Supabase-Attrappe (`00_stub.sql`), `10_tests.sql`, beide Rechte-Modi.
- `supabase/tests/editor_test.sql` – Test für den Supabase-SQL-Editor; `live_rls_test.sql` – Live-Prüfung (nur Testkonten).
- `server/instance/tests/produktion.mjs` – Rechte mit echten Rollen anon/authenticated/service_role.
- `server/instance/tests/quest-sperren.mjs` – Sperrfolge der Quest-RPCs, Migration/Rollback Q1 = `schema.sql`, `lock_timeout` (QS-1–QS-12).

## Dev-Projekt
`ruinwalk-dev` (`jlkqktmvqxibqdcobbhf`): lesen erlaubt; Installation, Rollback, Cleanup nur über `supabase/dev/`-Skripte und nur mit Freigabe. Stand und Befunde: `supabase-integration.md`.

## Migrationen (Konvention im Projekt)
`supabase/migration_<kürzel>_<thema>.sql` + `supabase/rollback_<kürzel>_<thema>.sql` + `schema.sql` nachziehen + Tests + Prüfbericht in `docs/` (Beispiel: D3). Live-Einspielung nur nach ausdrücklicher Freigabe durch Pascal.

# Supabase-Integration: Nachtbericht

Stand: 18.11.2026. Branch `nacht/supabase-integration` (acht Commits auf Basis von `main`, nicht gemergt). **Auf dem Dev-Projekt wurde nichts installiert oder verändert, auf Produktion nichts angefasst, keine Secrets gelesen oder geschrieben.** Das Dev-Projekt wurde nur mit lesenden Katalogabfragen befragt (Rollen, Default-ACLs, Erweiterungen, Funktionsorte, Spalten; Vault nur Namen). `index.html`, GPS, Echtzeitkampf, `supabase/schema.sql` und alle beschlossenen Spiel- und Kampfregeln sind unverändert.

## 1. Was untersucht wurde

- Tatsächliche SQL-Dateiliste (`git ls-files`): `supabase/schema.sql`, `server/instance/sql/01_proto … 05_produktion.sql`, Migrationsskripte `migration_d3`/`rollback_d3` (nur Produktion), Testskripte unter `supabase/tests/`. Es gibt keine CLI-Migrationen und kein `config.toml`.
- Kombinierte Installation `schema.sql` → `01` → `02` → `03` → `04` → `05` unter Dev-ähnlichen Bedingungen (Default-ACLs in `public`, pgcrypto im Schema `extensions`, API-Rollen ohne `search_path`-Eintrag).
- Rechte aus dem Systemkatalog für `anon`, `authenticated`, `service_role`; RLS; SECURITY DEFINER; `search_path`; Trigger; Default-ACLs.
- Konto → Charakter → Instanz (Registrierung, Slots, Löschen, gesperrter Slot 3, Fremdzugriff).
- Installation, zweiter Versuch, Rollback, Neuinstallation.
- Worker-/Watchdog-Lücke (Architekturentscheidung: `docs/INSTANZKAMPF_WORKER_ARCHITEKTUR.md`).

## 2. Gefundene Fehler und Lücken

| # | Schwere | Befund | Stand |
|---|---|---|---|
| F1 | hoch | `claim_resolution` rief `digest()` unqualifiziert auf. Auf Dev liegt pgcrypto in `extensions`; `anon`/`authenticated`/`service_role` haben dort keinen `search_path`-Eintrag. Lokal im Dev-Nachbau reproduziert: `function digest(text, unknown) does not exist`. Ein Installationskonto ohne `extensions` im Pfad scheiterte außerdem am `seed`-Standardwert (`gen_random_bytes`) | **behoben** |
| F2 | hoch | Löschen eines Charakters oder Kontos ließ in laufenden Instanzen ein aktives Mitglied ohne Charakter und das Profil in `rwi.players` zurück (kein Fremdschlüssel zwischen den Schemas) | **behoben** |
| F3 | mittel | Eine Ausnahme der Engine im Worker erhöhte `attempts` nie: Die Runde wurde nach jedem Lease-Ablauf endlos und unbemerkt wiederholt (nie `stuck`, nie ein Alarm), obwohl V2 A.5 das vorsieht | **behoben** (`rwi.report_failure`) |
| F4 | mittel | `rwi` ist nicht über die Data API erreichbar (gewollt). Eine Edge Function kann `rwi.claim_resolution` damit nicht per RPC rufen. V2 A.4 liest sich, als ginge das | **dokumentiert**, Entscheidung offen |
| F5 | mittel | `rwi.players` hat keine serverseitige Ableitung aus `public.characters` (`derive-profile` fehlt). Grundklasse/Pfad lassen sich aus `characters.character_class` nicht bilden, `character_data` stammt vom Client. Ohne das kann kein echter Spieler beitreten | **offen** |
| F6 | niedrig | Durch die Dev-Default-ACLs behält `service_role` EXECUTE auf 9 interne `public`-Funktionen (`has_entitlement`, `is_verified`, `safe_class`, `safe_level` und 5 Triggerfunktionen) sowie auf die Client-Funktionen (liefern ohne Nutzer-Token nur `not_authenticated`). Praktisch unerheblich, weil `service_role` ohnehin BYPASSRLS und Tabellenrechte hat; `purge_account_backups` ist ausdrücklich entzogen | **dokumentiert**, `schema.sql` bewusst unverändert |
| F7 | niedrig | `handle_new_user` lässt jede Registrierung ohne gültigen `username` scheitern, auch Dashboard-/Admin-/Support-Konten (siehe Abschnitt 4) | **dokumentiert** |
| F8 | Regelfrage | Zwei Charaktere desselben Kontos können in derselben Instanz Mitglied sein (`rwi.join` prüft kein Konto); `own_character` meldet dann `ambiguous_character` | **offen**, nichts geändert |
| F9 | Regelfrage | Ein nachträglich gesperrter Platz-3-Charakter (Rückerstattung) bleibt aktives Mitglied, kann aber nicht mehr handeln (`forbidden`), bis ihn der Server per Verbindungsabbruch entfernt | **offen**, nichts geändert |
| F10 | niedrig | Der Kommentar in `schema.sql` („seit 2026 keine Standardrechte“) trifft auf das Dev-Projekt nicht zu (es hat Default-ACLs). Verhalten der Datei ist in beiden Modi korrekt und getestet | **dokumentiert** |

## 3. Behobene Fehler und geänderte Dateien

Behoben in `server/instance/sql/`:
- `01_proto.sql`, `03_windows.sql`, `04_gruppe.sql`: `digest(...)` → `sha256(convert_to(..., 'UTF8'))` (PostgreSQL-Kernfunktion); `seed` aus `gen_random_uuid()` + `sha256`; `create extension pgcrypto` entfernt. Ergebnis gleich (SHA-256), Instanz-Skripte brauchen keine Erweiterung mehr.
- `05_produktion.sql`: Trigger `characters_rwi_cleanup` (AFTER DELETE auf `public.characters`) ruft die **bestehende** Funktion `rwi.leave` (freiwilliger Austritt, keine neue Regel) und entfernt das Profil. Löschen scheitert nie am Spielstand; Fehler landen in `rwi.ops_alerts`. Die zweite SECURITY-DEFINER-Funktion `rwi.on_character_deleted` ist klassifiziert und im Test exakt benannt.
- `04_gruppe.sql` + `05_produktion.sql`: `rwi.report_failure` (nur mit Token der aktuellen Lease, Wartezeit 5/10/20/40/60 s, ab `max_attempts` `stuck` + Alarm + `engine_stuck`), als Serverfunktion klassifiziert.

Neu: `supabase/dev/{00_preflight.sql, build.sh, rollback_dev.sql, cleanup_test_accounts.sql}`, `server/instance/worker/core.mjs`, die Tests `dev-umgebung`, `konto-integration`, `rechte-audit`, `installation`, `worker`, `tests/run-all-db.sh`, `docs/INSTANZKAMPF_WORKER_ARCHITEKTUR.md`. Geändert: `.github/workflows/instance-tests.yml` (PG 16 und 17, Artefakte), `tests/pg.mjs` und `supabase/tests/run.sh` (`PG_MAJOR`), `tests/run.mjs` (pgcrypto nur für die HMAC-Querprüfung), `tests/produktion.mjs` (Menge der SECURITY-DEFINER-Funktionen in `rwi` ist jetzt genau `{own_character, on_character_deleted}`; nichts gelockert, die Zahl der Prüfungen ist gleich geblieben: 222).

## 4. `handle_new_user`: Bewertung und Lösungsvorschlag

Heutiges Verhalten (getestet): ohne gültigen `username` in `raw_user_meta_data` bricht der Insert in `auth.users` ab; es bleibt kein Konto ohne Profil zurück. Das gilt unabhängig von der Quelle. Folgen: Konten über Dashboard, Admin-API oder für Support lassen sich nur mit `user_metadata.username` anlegen; anonyme Anmeldungen und OAuth ohne Namen scheitern; GoTrue meldet allgemein „Database error saving new user“.

| Lösung | Vorteil | Nachteil |
|---|---|---|
| **S-A (empfohlen):** Marker in `raw_app_meta_data` (z. B. `rw_staff=true`), den nur die Admin-API setzen kann, nicht eine Registrierung; der Trigger erzeugt dann einen Namen `staff_<8 hex>` | Support-Konten möglich, Regel „kein Konto ohne Namen“ bleibt für Spieler vollständig | Eine Änderung an `schema.sql` (und damit der Produktion), Admin-Prozess nötig |
| S-B: bei fehlendem Namen `Spieler_<hex>` vergeben | nichts scheitert | hebt die beschlossene Regel auf, Namensbelegung nicht mehr bewusst |
| S-C: Support-Konten über `user_metadata.username` anlegen (heute) | keine Änderung | jedes Support-Konto braucht einen gültigen, freien Spielernamen |

Nichts davon wurde geändert. Der Test hält das heutige Verhalten als „bekannte Einschränkung“ fest.

## 5. Ausgeführte Tests und exakte Ergebnisse

Lokal (PostgreSQL 16.15, Node 22.23.4) und in GitHub Actions (CI-Lauf auf Commit `a35108a`, Job `database (16)` = PostgreSQL 16.16, Job `database (17)` = **PostgreSQL 17.12**, dieselbe Nebenversion wie Dev). Identische Ergebnisse:

| Test | Prüfungen | | Test | Prüfungen |
|---|---|---|---|---|
| run (Phase 0) | 43 | | rechte-audit (neu) | 29 |
| fenster | 39 | | installation (neu) | 29 |
| gruppe | 157 | | worker (neu) | 25 |
| eventende | 32 | | dev-umgebung (neu) | 22 |
| semantik | 27 | | konto-integration (neu) | 59 |
| produktion | 222 | | supabase/tests/run.sh | 245 je Modus (neu/legacy) |

Dazu Dungeon-Läufe (Seeds 3, 4, 5, Weltboss-Ende) und K.2-Vergleich ohne Probleme; Determinismus Node/Bun/Deno und Engine-Tests (golden, combat, struktur, trennung, offen) grün; `npm test` grün. Beide PostgreSQL-Versionen erzeugen **dieselbe Installationsdatei** (`install_dev.sql`, 1639 Zeilen, sha256 `18003f28802612d6…`) und dieselben Testzahlen (Job `vergleich-pg16-pg17`). Protokolle liegen als Artefakte im CI-Lauf (`db-tests-pg16`, `db-tests-pg17`).

Mutationsprüfung der neuen Tests: Ohne den Löschtrigger scheitern 5 Prüfungen von `konto-integration`; ohne das REVOKE der Wrapper scheitern 3 Prüfungen von `rechte-audit`; die ursprüngliche Reproduktion von F1 und F3 war ein Rot-vor-Grün-Test.

## 6. Echte Integrationstests und reine Simulation

**Echt (echtes PostgreSQL 16 und 17):** Installation aller SQL-Dateien, Rollen `anon`/`authenticated`/`service_role` mit `SET ROLE`, Rechte aus dem Systemkatalog, RLS, Trigger, SECURITY DEFINER, `search_path`-Verhalten, Transaktionen, Rollback, Sperren und Parallelität, die Auftragskette `claim` → Engine → `commit`.

**Simulation (nicht belastbar für echtes Supabase):**
- `auth.users`, `auth.sessions`, `auth.mfa_amr_claims`, `auth.uid()`, `auth.jwt()` sind die Attrappe `supabase/tests/00_stub.sql`. Ob GoTrue für eine Passwortanmeldung wirklich eine `password`-Zeile in `auth.mfa_amr_claims` mit passender `session_id` im JWT schreibt, ist **nicht belegt**. Von dieser Annahme hängt `delete_account` ab.
- JWT-Claims werden per `SET request.jwt.claims` gesetzt; PostgREST ist nicht beteiligt. **Keine echten REST-, RPC-, JWT- oder GoTrue-Tests wurden ausgeführt.**
- Die Default-ACLs und der `search_path` von Dev sind nachgebaut, nicht übernommen.

## 7. Prüfliste für das echte Dev-Projekt

| Punkt | Stand |
|---|---|
| Postgres 17.12; `service_role` BYPASSRLS, `anon`/`authenticated` nicht; `authenticator` ohne BYPASSRLS | **Dev-Katalog** |
| Default-ACLs in `public` (3 Einträge: Tabellen, Funktionen, Sequenzen für `anon`/`authenticated`/`service_role`) | **Dev-Katalog** |
| `public` leer, kein Trigger auf `auth.users`, keine Cron-Jobs, ein Vault-Secret-Name (Wert nicht gelesen) | **Dev-Katalog** |
| pgcrypto liegt in `extensions`; `postgres` hat `extensions` im `search_path`, API-Rollen nicht | **Dev-Katalog** |
| `postgres` hat auf `auth.users` TRIGGER/REFERENCES/DELETE, SELECT auf `auth.sessions`/`mfa_amr_claims`; Spalten von `delete_account` vorhanden | **Dev-Katalog** |
| Preflight lehnt nicht leeres `public`, vorhandenes `rwi`, fehlende Rollen ab | lokal (Preflight selbst auf Dev nicht ausgeführt) |
| Rechtemengen für `anon`/`authenticated`/`service_role`, RLS auf allen Tabellen, feste `search_path` bei SECURITY DEFINER, keine PUBLIC-Ausführung | **lokal nachgewiesen** (Dev-ähnlich); auf Dev nach Installation **offen** |
| Installation erzeugt keine neuen Default-ACL-Einträge | lokal (Anzahl 3 → 3); auf Dev **offen** |
| `rwi` über die Data API nicht erreichbar | **offen** (steht nicht in der Datenbank; Dashboard „Data API / Exposed schemas“ prüfen, danach echte Anfrage mit `Accept-Profile: rwi`) |
| `anon`/`authenticated` über REST/RPC auf interne Funktionen, fremde Charaktere | **offen** (nur als `SET ROLE` lokal gezeigt) |
| `delete_account` mit echter GoTrue-Sitzung | **offen** |
| `extensions.digest`/`gen_random_bytes`: nach F1-Korrektur nicht mehr benötigt | lokal nachgewiesen |
| `search_path`-Manipulation: alle SECURITY-DEFINER-Funktionen mit festem Pfad, `pg_temp` zuletzt | lokal; statische Heuristik für unqualifizierte rwi-Tabellen sauber (kein Parser-Beweis) |
| Zustelllatenz `pg_net`, Edge-Function-Laufzeit, Cron-Takt im Tarif, Commit-Latenz auf Dev (`track_commit_timestamp` ist aus) | **offen** |

## 8. Offene Risiken

1. Echte GoTrue-/PostgREST-Pfade ungetestet (Abschnitt 6).
2. Worker-Pfad (Cron, `pg_net`, Edge Function, `dispatch_due`, A1/A2) nicht gebaut; ohne ihn läuft im Betrieb keine Runde.
3. `derive-profile` fehlt (F5).
4. F8 und F9 sind Regelfragen, keine Technikfragen.
5. Die CI deckt PG 16/17 ab, nicht die Supabase-eigenen Patches (`supautils`, Event-Trigger `pgrst_ddl_watch` u. a.).
6. `service_role` bleibt allmächtig auf `public`; der Service-Role-Key ist das wertvollste Secret.
7. Commit-Latenz: keine Commit-vor-Deadline-Garantie, wie beschlossen; auf Dev nicht gemessen.

## 9. Empfohlene Installationsreihenfolge

`supabase/dev/build.sh` erzeugt eine Datei mit dieser Reihenfolge; Ausführung in **einer** Transaktion:
`00_preflight` → `supabase/schema.sql` → `01_proto` → `02_actions` → `03_windows` → `04_gruppe` → `05_produktion`.
`05` braucht `public.characters` und `auth.uid()` und läuft nicht in einer reinen Prototyp-Datenbank. Ein zweiter Versuch bricht im Preflight mit „bereits installiert“ ab, ohne etwas zu verändern (getestet). Rollback: `rollback_dev.sql` mit `set rw.rollback_confirm = 'ja-loeschen'`; verbleibt: Testkonten in `auth.users` (separat `cleanup_test_accounts.sql`, nur `@rwtest.invalid`), Erweiterungen, Vault, Cron, Edge Functions, Migrationshistorie.

## 10. Nächste Schritte für die echte Dev-Installation (nach deiner Freigabe)

1. Diesen Branch prüfen und über PR nach `main` bringen (oder die Installationsdatei aus dem CI-Artefakt nehmen).
2. Preflight (nur lesend) auf Dev ausführen.
3. Installationsdatei als **eine** Migration auf Dev einspielen.
4. Sofort aus dem Katalog prüfen: Rechtemengen, RLS, Default-ACL-Zahl, `rwi`-Sichtbarkeit; Supabase-Advisors.
5. Testkonten mit `username`, bestätigter E-Mail und Domain `@rwtest.invalid` über die Auth-API anlegen (Passwörter nur lokal).
6. Echte REST/RPC-/JWT-Tests und `delete_account` mit echter Passwortanmeldung (Ort der Ausführung klären: meine Shell erreicht Dev nicht).
7. Danach erst Worker-Pfad (Entscheidungen aus der Architekturdatei) und `derive-profile`.

## 11. Was ausdrücklich deine Freigabe braucht

- Jede Ausführung auf Dev (Preflight, Installation, Tests, Rollback, Bereinigung des Vault-Überbleibsels `rwprobe_secret`).
- Merge in `main`.
- Änderung an `supabase/schema.sql` (S-A für `handle_new_user`, Härtung F6, Kommentar F10): betrifft die Produktion.
- Entscheidungen F8, F9, A1/A2, Alarmierung von `stuck`, Wiederholung von `stuck` alle 5 Minuten.
- Bau von `dispatch_due`, Cron-Job, Edge Function, Secrets, Deployment.

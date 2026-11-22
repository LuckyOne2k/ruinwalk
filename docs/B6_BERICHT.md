# B-6: Deadlocks bei Mehrzeilen-Löschungen und gleichzeitiger Gruppenbildung

Stand 22.11.2026 · Zweig `fix/b6-mehrzeilen-loeschung` (Basis `main` `9820ac3`) · **nicht committet, nicht installiert, nicht live**. Betrifft nur Datenbanken mit Schema `rwi` (Dev/Test); Produktion hat kein `rwi` → keine Produktionsmigration.
Vorgeschichte: `docs/LOESCHVORGANG.md` (Betriebsregel B-6), `docs/B2_PRUEFBERICHT.md` (Probe R6).

## 1. Ursache
- **B-6a – mehrzeiliges DELETE auf `public.characters`** (Dashboard-Mehrfachauswahl, `service_role`, `postgres`): Der AFTER-ROW-Trigger `rwi.on_character_deleted` nahm die Beratungssperre A je Zeile **in Zeilenreihenfolge** und bereinigte dazwischen die Instanzen (Instanzsperre I).
  - gegen `rwi.create_group` (A **sortiert**): Zeilenfolge ≠ Schlüsselfolge → Zyklus → 40P01.
  - gegen `public.group_join` (A → I): DELETE hält I der ersten Zeile und wartet auf A der zweiten, der Beitritt hält dieses A und wartet auf I → 40P01 (bei der Umsetzung zusätzlich gefunden).
- **B-6b – mehrere Konten in einer Anweisung** (`delete from auth.users where …`, `cleanup_test_accounts.sql`): Die Kaskade läuft je Konto als eigene Anweisung; `on_profile_deleting` sperrt A sortiert **je Konto**, nicht über alle Konten → gleiche Zyklen.

## 2. Änderung
| Datei | Änderung |
|---|---|
| `server/instance/sql/05_produktion.sql` | Trigger `characters_rwi_cleanup … referencing old table as rwi_deleted_chars`; `on_character_deleted` sperrt zuerst die A **aller** in der Anweisung gelöschten Charaktere plus der eigenen Zeile (`union`, entdoppelt, aufsteigend) – vor jeder Instanzsperre. Wiedereintrittsfähig; bei `delete_character`/`delete_account` sind die Sperren schon gehalten. Rechteklasse (`trigger`), SECURITY DEFINER, `search_path`, RC-Pflicht unverändert |
| `supabase/dev/cleanup_test_accounts.sql` | vor dem Löschen: Kontozeilen (`for update`, sortiert) → Profile (`for update`, sortiert) → A aller Charaktere (sortiert) – Reihenfolge der Admin-Löschung (U → Pr → A), damit weder `create_group`/`group_join` noch `delete_character`/`save_character` (Pr zuerst) einen Zyklus bilden. Nach einem Rollback (Tabellen fehlen) nur die Kontozeilen. Zielprüfung und Löschprädikat unverändert |
| `supabase/dev/rollback_dev.sql:124` | Fingerabdruck `on_character_deleted` → `3723ef89552f432a40aae71b31bbe749` |
| `server/instance/tests/b2-sperren.mjs` | B6-1, B6-2, B6-3 (mit/ohne Vorab-Sperre; „mit“ führt den **echten** Lösch-Block des Cleanup-Skripts aus), B6-4 (Gegenprobe zur Reihenfolge U → Pr → A) |
| `docs/LOESCHVORGANG.md`, `docs/B2_PRUEFBERICHT.md` (Status, Abschnitt 14), `docs/B4_BERICHT.md`, `docs/DEV_INSTALLATIONSFREIGABE.md` | Doku, neuer Hash |

**SHA-256 `install_dev.sql`:** `5625f1fd166db60148003bfc09f94a59c79a2b33e321574be4a3c61669c4dfbd` (2156 Zeilen, zwei Builds gleich). **SHA-256 `cleanup_test_accounts.sql`:** `455f776f9a5143575394e2d3d7124b858847d6014d54d7e533bc1ebc423f57d5`.

## 3. Prüfung (rw-backend-security, rw-architekt)
- Kein Blocker. Eingefrorene Instanzkampf-Architektur unberührt; Rechteklasse unverändert; Übergangstabelle vollständig beim ersten Aufruf (AFTER-Ereignisse am Ende der Anweisung), bei FK-Kaskaden je Konto.
- Befund rw-architekt: erste Fassung der Cleanup-Vorab-Sperre nahm A **vor** Konto/Profil (neuer Zyklus mit `delete_account`/`delete_character` desselben Testkontos) → **behoben** (U → Pr → A), Gegenprobe B6-4.
- Härtung rw-backend-security: eigene Zeile zusätzlich zur Übergangstabelle sperren (`union`) → **umgesetzt**.
- Technische Alternative für B-6b (Trigger auf `auth.users` vor den internen RI-Triggern) von beiden **abgeraten**: namensabhängig, Supabase-eigenes Schema, `rechte-audit` erwartet genau einen Trigger auf `auth.users`.

## 4. Tests (lokal, PostgreSQL 16.15 und 17.12)
| Test | PG17 | PG16 |
|---|---|---|
| `b2-sperren.mjs` (`B2_MIX=200`, inkl. B6-1 … B6-4) | 59/59 | 59/59 |
| `b2-sperren.mjs` nach der letzten Cleanup-Korrektur (`B2_MIX=0`) | 59/59 | 59/59 |
| `installation.mjs` (Installation, Rollback, Cleanup-Skript) | 273/273 | 273/273 |
| `loesch-trigger` / `konto-integration` / `konto-regel` | 59 / 63 / 48 | gleich |
| `produktion` / `rechte-audit` / `dev-umgebung` | 222 / 29 / 22 | gleich |
| Manifest gegen `rollback_dev.sql` | 146/146 | – |
Bestätigte bekannte Fehler: B-6b (Mehrkonten-Löschung **ohne** Vorab-Sperre → genau ein 40P01), B-4c.

**Mutationsproben** (je in einer Kopie, PG17): alter Trigger (A je Zeile) → B6-1 und B6-2 rot (40P01, B6-2: Instanzsperre gehalten); Trigger-Schleife unsortiert → B6-1 rot; Cleanup ohne Vorab-Sperre → B6-3 rot; Cleanup mit A vor Konto/Profil → B6-4 rot.

## 5. Verbleibende Risiken
- **B-6b (offen, Betriebsregel):** mehrere Konten in **einer** Anweisung ohne Vorab-Sperre ∥ `create_group`/`group_join` → genau ein 40P01, atomar. Regel: Konten einzeln löschen oder vorab U → Pr → A sperren (wie `cleanup_test_accounts.sql`). Die Supabase-Auth-Admin-API löscht je Konto einzeln (Annahme, nicht live geprüft).
- **Kosten bei Massenlöschungen:** jeder Zeilenaufruf fragt alle Sperren der Anweisung erneut an (bereits gehalten, lokal) – quadratisch, bei tausenden Zeilen spürbar. Empfehlung: in Teilmengen löschen; spätere Verbesserung als `FOR EACH STATEMENT`-Trigger.
- Im Cleanup-Skript: ein zwischen Vorab-Sperre und Löschen neu angelegter Charakter eines Testkontos wird nur je Konto gesperrt (unkritisch, nur Testkonten).
- B-4c unverändert offen. Nicht live geprüft; Dev-Installation mit dem neuen Hash braucht eine eigene Freigabe.

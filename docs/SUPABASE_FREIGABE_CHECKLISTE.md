# Freigabe-Checkliste vor einer Dev-Installation

Stand: Branch `nacht/supabase-integration`, Commit `f270633` (CI grün auf PostgreSQL 16.16 und 17.12). **Nichts davon wurde auf Dev oder Produktion ausgeführt.**
Zeichen: ✅ erledigt und getestet · 🟡 lokal getestet, echter Nachweis offen · ⬜ offen · 🧑 deine Entscheidung.

## A. Entscheidungen (🧑)
- ⬜ Dev-Installation freigeben (ausdrücklich, als **eine** Migration aus `supabase/dev/build.sh`).
- ⬜ Merge in `main` (bisher ausdrücklich nicht).
- ⬜ Account-Regel: **strenge Zählung** (auch ausgetretene Charaktere zählen) bestätigen oder auf „nur aktive“ ändern.
- ⬜ Lösch-Bereinigung: Löschen scheitert und wird zurückgerollt, **wenn selbst die minimale Bereinigung fehlschlägt** (statt Geistermitglied). Bestätigen?
- ⬜ Hotfix-Weg bei stuck (Commit mit neuer Engine-Version ohne `resume_stuck`) beibehalten oder nur über `resume_stuck`? (`docs/STUCK_ABLAUF.md`)
- ⬜ F9: nachträglich gesperrter Platz-3-Charakter in laufender Instanz.
- ⬜ Zustellung des stuck-Alarms (wohin, wer).
- ⬜ S-A: erst nach Prüfung gegen echtes GoTrue umsetzen? (`docs/SUPABASE_S-A_UNTERSUCHUNG.md`)
- ⬜ Änderungen an `supabase/schema.sql` (F6, F10, S-A) betreffen die Produktion.

## B. Technisch bereit (lokal und CI)
- ✅ Kombinierte Installation `schema.sql` + `01`–`05` in einer Transaktion, Preflight, zweiter Versuch blockiert, Rollback, Neuinstallation (`installation.mjs`).
- ✅ Rechte aus dem Katalog: `anon` nur `username_available`; `authenticated` nur Client-Wrapper; `service_role` nur Serverfunktionen (`rechte-audit.mjs`, `produktion.mjs`).
- ✅ RLS auf allen Tabellen (zweite Schicht), SECURITY DEFINER mit festem `search_path`.
- ✅ Lösch-Trigger: 9 Szenarien, Deadlock-Schutz, Rollback (`loesch-trigger.mjs`).
- ✅ Account-Eindeutigkeit je Instanz inkl. Parallelität (`konto-regel.mjs`).
- ✅ A1-Wrapper: Rechtematrix, Eingabeprüfung, `anon`/`authenticated` abgewiesen (`worker-a1.mjs`).
- ✅ stuck: Alarm genau einmal, keine automatische Wiederholung, kontrollierte Wiederaufnahme (`stuck.mjs`).
- ✅ PostgreSQL 16 und 17 mit identischen Ergebnissen; Determinismus Node/Bun (Deno in der CI); `npm test`.

## C. Vor der Installation auf Dev prüfen (🟡/⬜)
- ⬜ Dashboard: **Data API → Exposed schemas** enthält **nicht** `rwi` (nur im Dashboard sichtbar).
- ⬜ Preflight (nur lesend) auf Dev ausführen und Ergebnis ansehen.
- ⬜ Dev-Zustand unverändert gegenüber der Bestandsaufnahme (PG 17.12, `public` leer, kein Trigger auf `auth.users`, Probe-Migrationen vorhanden).
- ⬜ Entscheidung, wie mit den zwei Probe-Migrationen und dem Vault-Überbleibsel `rwprobe_secret` umgegangen wird (nicht automatisch löschen).
- ⬜ Ort für die echten Tests klären (meine Shell erreicht Dev nicht).

## D. Nach der Installation sofort aus dem Katalog prüfen (⬜)
- ⬜ Rechtemengen, RLS, Default-ACL-Zahl (3 Einträge für `postgres` in `public`), Sichtbarkeit von `rwi` (gleiche Abfragen wie `rechte-audit.mjs`).
- ⬜ Supabase-Advisors (Sicherheit/Performance).
- ⬜ Rollback-Skript (`supabase/dev/rollback_dev.sql`) nur mit Freigabe und Bestätigungswort.

## E. Echte Pfade, lokal nicht nachweisbar (⬜)
- ⬜ Registrierung über GoTrue mit `username` in den Nutzerdaten (Trigger `on_auth_user_created`).
- ⬜ REST/RPC mit echtem JWT: Client-Wrapper (`group_*`), Ablehnung ohne Token, Ablehnung fremder Charaktere.
- ⬜ `delete_account` mit echter Passwortanmeldung (Sitzung höchstens 2 Minuten alt).
- ⬜ A1-Wrapper per PostgREST-RPC mit `service_role`; `anon`/`authenticated` erhalten HTTP 401/403.
- ⬜ S-A: `app_metadata` bei `admin.createUser` im INSERT sichtbar? Dashboard-Anlage von Staff-Konten?
- ⬜ Commit-Latenz auf Dev messen (ohne daraus eine Commit-vor-Deadline-Garantie abzuleiten).

## F. Nicht Teil dieser Freigabe (gebaut ist es nicht)
- ⬜ `derive-profile` (Spielerprofil aus `public.characters`) – ohne ihn kann kein echter Spieler einer Instanz beitreten.
- ⬜ Cron-Zeitgeber, `pg_net`, Edge Function, Secrets, Deployment des Workers, Ratenbegrenzung.
- ⬜ Benachrichtigung bei stuck.
- ⬜ Ableitung der Betreiberidentität bei Wiederaufnahme.

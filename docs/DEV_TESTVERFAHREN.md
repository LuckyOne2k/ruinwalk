# Testverfahren für das echte Dev-Projekt (vorbereitet, NICHT ausgeführt)

> **Hinweis (Übernahme nach main, 20.11.2026):** Das Dev-Echttest-Paket (`.github/workflows/dev-test.yml`, `supabase/dev/real-test.mjs`,
> Tests `dev-skript.mjs`, `dev-korrekturen.mjs`, `dev-stub.mjs`, Fixture `fixtures/dev-test.afc5dfb.yml`) ist bewusst **nicht** in main enthalten.
> Es folgt in einem eigenen PR, sobald die GitHub-Umgebung `dev-test` eingerichtet ist. Quelle bis dahin: Zweig `nacht/operator-edge-function`.

Stand: 18.11.2026. Gilt erst **nach** deiner Freigabe der Dev-Installation. Nur Projekt `ruinwalk-dev` (`jlkqktmvqxibqdcobbhf`). Production (`malbiahllucctiafzydv`) wird nie angefasst.

## Vorbedingungen (alle ⬜ bis zur Freigabe)
1. Dev-Installation als **eine** Migration (`supabase/dev/build.sh`) durch dich freigegeben und ausgeführt; Katalogprüfung (`docs/EXPOSED_SCHEMAS.md`) bestanden.
2. Dev: *Exposed schemas* = `public` (ohne `rwi`); E-Mail-Bestätigung für Dev entweder aus oder Testkonten über Einladungs-/Admin-Weg (Entscheidung nötig).
3. Zwei Dev-Testkonten `rwtest-a@…`, `rwtest-b@…` (nur Dev, Wegwerf-Passwörter, nie in Chat/Log). Ein Betreiberkonto `rwtest-op@…` nur für Schritt 11.
4. Schlüssel: nur **anon/publishable** Key des Dev-Projekts für Clientschritte. Der service_role-Key wird für Schritte 9–11 nur lokal von dir gesetzt, nie im Repo, nie in CI.

## Schritte (je Schritt: Aufruf, erwartetes Ergebnis, Abbruch bei Abweichung)
| # | Schritt | Erwartet |
|---|---|---|
| 1 | Registrierung mit Passwort (GoTrue `/auth/v1/signup`) | Konto + `public.profiles`-Zeile; Namensregeln greifen |
| 2 | Login, JWT erhalten | `access_token`, `sub` = Konto-ID |
| 3 | Charakter anlegen (`rpc/create_character`) mit Klasse, Level ≥ 5 | Zeile in `characters`, nur eigener Zugriff |
| 4 | Auswahl/Laden (`rpc/…`) und Fremdzugriff mit Konto B | A sieht nur eigene; B bekommt Abweisung |
| 5 | Gruppe/Instanz beitreten (`rw_group_join`) | `joined`, `profile.src='derived'`, Profil entspricht `docs/PROFILABLEITUNG.md` |
| 6 | Ready (`rw_group_ready`) | Profil final, danach eingefroren |
| 7 | Gruppenaktion (`rw_group_action`) im Kampf | angenommen; ungültige Aktion abgewiesen |
| 8 | Reconnect (neuer Login/Token, Zustand lesen) | gleicher Zustand, keine Doppelmitgliedschaft |
| 9 | Berechtigungsprüfung mit **anon** und Konto-JWT | alle `rw_worker_*`/`rw_ops_*`: 401/403; `Accept-Profile: rwi` → Fehler |
| 10 | Worker-Schleife (service_role, lokal von dir): tick, claim, commit | Runde wird genau einmal abgeschlossen |
| 11 | Betreiberweg: Betreiber per SQL anlegen, `rw_ops_resume` mit Betreiber-UUID, ohne/falsche UUID | `resumed` bzw. `not_operator`; `ops_log` vollständig |
| 12 | Charakter löschen, dann Konto löschen | Mitgliedschaften/Instanzen bereinigt, Löschablauf wie `docs/LOESCHVORGANG.md`, Protokoll behält Betreiber-ID |
| 13 | Aufräumen: nur Testkonten/-daten löschen (mit Freigabe) | Dev wieder sauber |

Jedes Ergebnis wird mit Zeit, Aufruf und Statuscode (ohne Token/Passwörter) in `docs/DEV_TESTPROTOKOLL.md` festgehalten.

## GitHub Actions mit Dev-Testkonten: machbar?
**Ja, mit Einschränkungen – Empfehlung: nur manuell (`workflow_dispatch`), nie bei Push/PR.**
- Machbar: Schritte 1–9 brauchen nur die öffentliche URL und den anon-Key sowie zwei Testkonten (GitHub *Environment* `dev-test` mit Schutzregel/Freigabe, Secrets `DEV_SUPABASE_URL`, `DEV_ANON_KEY`, `DEV_TEST_A_PW`, `DEV_TEST_B_PW`).
- Nicht in CI: service_role-Key (Schritte 10–12) – er umgeht alle Rechte; gehört nicht in GitHub. Diese Schritte bleiben lokal bei dir.
- Schutz: Workflow bricht ab, wenn die URL nicht die Dev-Projekt-Ref enthält (`jlkqktmvqxibqdcobbhf`) oder die Production-Ref (`malbiahllucctiafzydv`) vorkommt; keine Secrets in Logs (`::add-mask::`), keine Forks.
- Risiken: Rate-Limits/E-Mail-Bestätigung bei Registrierung, Dev-Zustand wird verändert (Testdaten), Flakiness durch Netz.
- Alternative (realistischer für den Anfang): lokales Skript `node supabase/dev/real-test.mjs` (noch nicht gebaut), das du mit den Dev-Schlüsseln in deiner Shell startest; Ausgabe ohne Geheimnisse.
**Gebaut (Stand 18.11.2026, nicht ausgeführt):** Workflow `.github/workflows/dev-test.yml` (nur `workflow_dispatch`, Environment `dev-test`) und `supabase/dev/real-test.mjs` (deckt die Schritte 1–9 und 12 ab; Schritte 10, 11 und die positiven Gruppenschritte brauchen lokale/serverseitige Vorbereitung). Verwaiste Testkonten: `supabase/dev/list_test_accounts.sql`. Lokal geprüft nur gegen einen HTTP-Stub (`dev-skript.mjs`).

## Weiter offen (nur echt beweisbar)
Echtes GoTrue/JWT, REST-Verhalten von PostgREST (Rechte, Profile-Header), Betreiber-JWT-Prüfung durch eine Edge Function (nicht gebaut), Last/Parallelität gegen echte Instanz.

## Nachkorrektur des Dev-Testskripts (Stand 18.11.2026)
Exit-Codes von `supabase/dev/real-test.mjs`: 0 alles geprüft · 1 Fehler · 2 Konfiguration · 3 Vorbedingung (E-Mail-Bestätigung) · **4 unvollständig (Pflichtschritte nicht getestet)** · **5 Testkonten zurückgelassen oder Löschung nicht verifiziert**. „Verweigert“ gilt nur bei gültiger Antwort mit vorgesehenem Status und Fehlerinhalt (nie bei Netzfehler, 404, 5xx). Ohne `DEV_TEST_INSTANCE`/`DEV_TEST_FIGHT`/`DEV_TEST_ROUND` endet der Lauf mit Exit 4 (rot). Offene Konzeptfrage: Mit frischen Testkonten pro Lauf ist die positive Gruppenaktion nicht erreichbar (Kampfstart braucht `service_role`); siehe `docs/DEV_FREIGABE_NACHKORREKTUR.md`.

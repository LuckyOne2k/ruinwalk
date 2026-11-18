# Dev-Freigabe: Nachkorrektur zu K1–K10

Stand: 18.11.2026. Branch `nacht/operator-edge-function`, Basis `afc5dfb`. **Nicht committet, nicht gepusht** (alles liegt im Arbeitsbaum).
Nicht getan: keine Installation auf Dev/Production, kein Deployment, kein Workflow-Lauf, keine Secrets angefasst, kein Merge, `index.html`, `supabase/schema.sql` und `main` unverändert.

## 1. Kurzfassung

Alle zehn Korrekturen sind umgesetzt und mit Regressionstests samt Mutationsproben belegt. **Alle diese Tests sind Simulationen** (HTTP-Stub, Attrappe für Deno, lokales PostgreSQL mit Rollenattrappe). Echtes GoTrue, echtes Deno und echtes Supabase wurden nie getestet. Ob Dev genauso antwortet wie der Stub, beweist nur ein echter Lauf.

Neue Empfehlung für die **Datenbankinstallation auf Dev: BEDINGTE FREIGABE** (Abschnitt 6). Edge-Function-Deployment und Workflow-Lauf bleiben **nicht freigegeben**.

## 2. K1–K10 einzeln

| K | Fehler (vorher) | Änderung | Testnachweis |
|---|---|---|---|
| **K1** | `denied` = jede Nicht-2xx-Antwort. Netzfehler, 404 (Funktion fehlt) und 5xx zählten als „verweigert“. | `supabase/dev/real-test.mjs`: `permDenied` (401/403 **und** Fehlercode 42501), `notExposed` (406 PGRST106 oder 401/403 42501), `errIs` (exakter Status + Meldung der Funktion, z. B. 404 `not_found` ≠ 404 PGRST202). Positivkontrolle `username_available` (anon, belegt=false/frei=true). Fremdzugriffe prüfen exakt 403 `forbidden`, 409 `version_conflict`, 404 `not_found`. | `dev-korrekturen.mjs`: Einzelprüfungen der Prädikate; Läufe mit „Funktion fehlt 404“, 500, 200, Netzfehler, Schema-404/500 enden mit Exit 1. **Mutation:** mit der alten Regel besteht der 404-Lauf (Test also wirksam). |
| **K2** | Gruppenaktion sendete `{type:'standard'}`; die Datenbank verlangt `ability`. Prüfung akzeptierte jeden Statustext. | Request `{p_fight, p_round, p_action:{ability, target}, p_character}`, Erfolg nur bei 200 und `status === 'ok'`. Beitritt `joined`, Ready `ok`, Ansicht `me.key === Charakter`. **Quelle des Formats:** `public.group_action` (`05_produktion.sql`), `rwi.submit_action` (`03_windows.sql`, `ability` 1–40 Zeichen) und `produktion.mjs`. `index.html` ruft `group_action` **nicht** auf, es gibt keine Client-Schnittstelle dazu. | `dev-korrekturen.mjs`: gesendeter Body entspricht dem Format; gegen die SQL-Quellen geprüft. **Mutation:** altes Format `{type}` wird als FEHLER erkannt (Stub antwortet wie die Datenbank mit `invalid`); mit schwacher Statusprüfung würde es bestehen. |
| **K3** | Fehlgeschlagenes Aufräumen gab nur „HINWEIS“, Exit 0. Bei E-Mail-Bestätigung blieben Konten zurück. | Jedes möglicherweise angelegte Konto muss gelöscht **und verifiziert** sein (Anmeldung danach: 400 `invalid_credentials`). Sonst `VERWAIST` und **Exit 5**, das alle anderen Ergebnisse (auch 0 und 4) übersteuert. `attempted` wird vor dem Signup gesetzt (verlorene Antwort bleibt nicht unbemerkt). Vorprüfung `GET /auth/v1/settings`: ist die Bestätigung aktiv, wird **kein Konto angelegt** (Exit 3). | `dev-korrekturen.mjs`: `delete_account` 500 / wirkungslos / Netzfehler → Exit 5 mit 2 verwaisten Konten; verwaist schlägt Exit 4; Bestätigung ohne lesbare Einstellungen → Exit 5; mit lesbaren Einstellungen kein Signup-Aufruf, Exit 3. **Mutationen:** ohne Exit-5-Regel und ohne Löschverifikation erschiene der Lauf grün. |
| **K4** | Positive Gruppenschritte wurden übersprungen, der Lauf blieb Exit 0 und grün. | Fehlende Voraussetzungen: „NICHT GETESTET“ je Schritt, **Exit 4**, „GESAMTERGEBNIS: NICHT ERFOLGREICH“, GitHub-`::error::`. Ungültige Zahlen → Exit 2. Teststep ohne `continue-on-error`. Negativfälle laufen immer (Instanz unbekannt → 200 `no_instance`; Aktion in unbekanntem Kampf → 403 `forbidden`). | `dev-skript.mjs` (geändert) und `dev-korrekturen.mjs`: ohne Instanz Exit 4 mit 5 Schritten nicht getestet; nur Instanz ohne Kampf Exit 4; falsche Instanz → Fehler. **Mutation:** wenn „nicht getestet“ den Exit nicht beeinflusst, wäre der Lauf grün. |
| **K5** | Schlüsselprüfung nur für alte JWT-Anon-Keys; Bearer-Header immer gesendet. | Erlaubt: JWT-Anon-Key (role anon, ggf. ref) **oder** `sb_publishable_…`. `sb_secret_…`, kurze/andere Formen → Exit 2 ohne Netzaufruf. Bei neuem Format wird kein Bearer gesendet (nur `apikey`). | `dev-korrekturen.mjs`: voller Lauf mit Publishable-Key (Stub lehnt Bearer ab, der kein Nutzer-JWT ist); Key nie in Ausgabe/Protokoll; vier verbotene Formen → Exit 2. **Mutation:** lockere Prüfung würde Secret-Key akzeptieren. |
| **K6** | Jeder angemeldete Nutzer konnte unbegrenzt `denied`-Zeilen erzeugen. | `rwi.check_operator` (`03_windows.sql`): je Konto höchstens 20 Einzeleinträge/Stunde + 1 Sammeleintrag, insgesamt höchstens 1000/Stunde; zwei Teilindizes. Berechtigte Betreiber werden vor der Zählung durchgelassen. Die Abweisung bleibt immer wirksam. | `operatoren-limit.mjs` (PostgreSQL): 50 Aufrufe → 21 Zeilen, alle 50 abgewiesen; anderes Konto einzeln; Wrapper antwortet `not_operator`; nach 2 h wieder einzeln; 1300 Aufrufe vieler Konten → genau 1000; Betreiber ungebremst. **Mutation:** ohne Limit entstehen 50 Zeilen. |
| **K7** | Body wurde vor Authentifizierung und Limit vollständig gelesen; Limit zählte Zeichen. | `keys.mjs: readBodyLimited` (Stream bricht bei Überschreitung ab, Content-Length nur als Vorprüfung, UTF-8 streng); Handler liest über `readBody` **erst nach** der Authentifizierung; Limit in **Bytes**. `index.ts` ruft nur noch so auf. | `operator-korrekturen.mjs`: 2-MB-Strom → nach ~5 KB abgebrochen; großer Content-Length ohne Lesen; 4096 ok / 4097 nein; ungültiges UTF-8; ohne/mit ungültigem Token 0 Lesezugriffe; Mehrbyte-Body (2260 Zeichen = 4260 Byte) → 400. `operator-index.bun.mjs`: dasselbe über `index.ts` (Bun, Deno-Attrappe). **Mutationen:** Lesen vor der Authentifizierung und Zeichenzählung werden erkannt. |
| **K8** | `config.toml` im Funktionsordner (laut Supabase-Doku wird nur `supabase/config.toml` gelesen). Nur alte Schlüsselumgebung (`SUPABASE_ANON_KEY`/`SERVICE_ROLE_KEY`, Bearer mit Secret). Keine Typprüfung von `index.ts`. | Wirkungslose Datei gelöscht, `supabase/config.toml` mit `[functions.operator] verify_jwt = true` angelegt (nur das). `keys.mjs: pickKey` bevorzugt `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS` (Name `default`), sonst alte Variablen; `keyHeaders`: `sb_…` nur als `apikey`, nie als Bearer. Fehlende Konfiguration: nur `config_missing` mit true/false, Aufrufe scheitern geschlossen (502). CI: `deno check` und Bun-Smoke-Test (siehe Abschnitt 4). | `operator-korrekturen.mjs`: Schlüsselwahl (neu, alt, kaputt, fehlend, zu kurz), Header, Config-Ort und -Inhalt, kein altes `config.toml`, CI-Schritte vorhanden. `operator-index.bun.mjs`: GoTrue-Aufruf mit Publishable-Key + Nutzer-JWT; PostgREST-Aufruf mit Secret-Key nur im `apikey`; altes Format mit beiden Headern; ohne Schlüssel kein Backend-Aufruf. **Mutation:** ohne `sb_`-Unterscheidung würde der Secret-Key als Bearer gesendet. |
| **K9** | Falsche Bestätigung oder falsches Repository: Job per `if:` **übersprungen**, GitHub-Lauf grün. | Neuer Job `pruefen` (ohne Environment, ohne Secrets) scheitert mit Exit 2; `dev-test` hängt per `needs` davon ab; kein Job-`if:` mehr. | `dev-korrekturen.mjs`: der Stand `afc5dfb` wird aus Git gelesen und als fehlerhaft erkannt (Job-`if:`); neuer Workflow besteht die Strukturprüfung; Prüfjob ohne Environment/Secrets; kein `continue-on-error`/`|| true`. `dev-skript.mjs`: Strukturtests angepasst. **Grenze:** das Verhalten von GitHub Actions selbst wurde nicht ausgeführt, nur die Datei geprüft. |
| **K10** | Berichte/Tests konnten Stubs wie echte Integrationstests wirken lassen. | Köpfe aller Stub-Tests nennen ausdrücklich „SIMULIERT/STUB, nicht bewiesen“; `dev-stub.mjs` dokumentiert, dass Antwortformen aus Quellcode und PostgREST-Doku abgeleitet sind; Docs `OPERATOREN.md`, `DEV_TESTVERFAHREN.md` ergänzt. Dieser Bericht trennt in Abschnitt 4. | `dev-korrekturen.mjs`: je Testdatei Prüfung des Kopfes auf Stub-Kennzeichnung mit Echtheitsvorbehalt. **Grenze:** ältere Berichte (z. B. `SUPABASE_INTEGRATION_NACHTBERICHT.md`) wurden nicht neu geschrieben; sie nennen die Simulation bereits an anderer Stelle. |

### Angepasste Bestandstests (nichts entfernt oder abgeschwächt)
- `dev-skript.mjs`: Der alte Test „voller Lauf Exit 0 mit 2 übersprungenen Schritten“ kodierte genau den Fehler K4 und wurde **ersetzt**: voller Lauf mit vorbereiteter Instanz (Exit 0, 0 nicht getestet) plus Lauf ohne Instanz (Exit 4). Workflow-Strukturtests folgen dem neuen Aufbau (K9). Die 19 Prüfungen bleiben, `no_instance` statt der erfundenen Stub-Antwort `unknown_instance` (die echte SQL liefert `no_instance`).
- `operator-edge.mjs`: zwei Prüfungen zeigen auf die neue Verdrahtung (Schlüsselwahl über `pickKey`, `verify_jwt` in `supabase/config.toml`). Die Prüfabsicht ist gleich, die Config-Prüfung ist jetzt am wirksamen Ort.

## 3. Neue Testergebnisse (lokal, PostgreSQL 16.15, Node 22, Bun 1.4)

| Test | Ergebnis | Art |
|---|---|---|
| `dev-korrekturen.mjs` (neu) | 47 von 47 | **Stub** |
| `dev-skript.mjs` (geändert) | 19 von 19 | **Stub** |
| `operator-korrekturen.mjs` (neu) | 30 von 30 | **Stub/Attrappen** |
| `operator-edge.mjs` (angepasst) | 34 von 34 | **GoTrue-Stub**, echte lokale PG-Wrapper |
| `operatoren-limit.mjs` (neu) | 13 von 13 | lokale PG, Supabase-Rollen simuliert |
| `operator-index.bun.mjs` (neu) | 9 von 9 | **Bun mit Deno-Attrappe**, kein Deno-Lauf |
| Gesamtsuite `run-all-db.sh` (PG 16) | alle 25 Testdateien bestanden (nach Anpassung von `operator-edge` erneut einzeln 34/34) | gemischt, alles lokal |

Nicht lokal ausgeführt: **PostgreSQL 17** (nicht installiert), **`deno check`** und **echter Deno-Lauf** (kein Deno vorhanden), **Engine-/Determinismus-Tests** in Node/Bun/Deno (nicht berührt, nicht neu gelaufen), **GitHub Actions** selbst. Das zählt **nicht** als bestanden. Die CI wurde um `deno check` und den Bun-Smoke-Test erweitert und muss noch laufen.

## 4. Simulierte vs. echte Tests

**Echt (lokal reproduzierbar, aber nur lokal):** Datenbanklogik in einem lokalen PostgreSQL 16 (Funktionen, Rechte-Grants, Log-Limit, Wrapper), reine JavaScript-Logik (Handler, Schlüsselwahl, Body-Limit, Exit-Code-Logik).

**Simuliert (kein Beweis für Supabase):**
- GoTrue: lokaler HS256-Stub (`operator-edge.mjs`) und HTTP-Stub (`dev-stub.mjs`).
- PostgREST: Stub mit Antwortformen aus dem Quellcode (`PT403/PT404/PT409`) und aus der Dokumentation (`42501`, `PGRST106`, `PGRST202`). **Annahme:** Dev antwortet für Funktionen ohne EXECUTE mit 401/403 und Code 42501. Antwortet PostgREST stattdessen 404 `PGRST202` (Funktion unsichtbar), schlägt der Test absichtlich fehl; dann ist eine bewusste Anpassung nach dem ersten echten Lauf nötig.
- Supabase-Rollen und `auth.*`: Attrappe.
- Deno: `index.ts` läuft nur unter Bun mit Attrappe `globalThis.Deno`.
- GoTrue-Einstellungen (`mailer_autoconfirm`, `disable_signup` in `/auth/v1/settings`) und die Fehlerform des fehlgeschlagenen Logins (`invalid_credentials`): aus dem Gedächtnis/der Doku abgeleitet, **nicht verifiziert**.

**Nie getestet:** echtes GoTrue (Token, `aal2`, Widerruf), echte Edge Runtime/Deno-Typprüfung, Gateway-`verify_jwt` mit neuen Signaturschlüsseln, PostgREST mit echten Secret-/Publishable-Keys, E-Mail-Bestätigung und Mailversand auf Dev, das echte Dev-Projekt insgesamt.

## 5. Verbleibende Risiken

1. **Positive Gruppentests nicht in einem Lauf möglich.** Frische Konten pro Lauf können in eine vorbereitete Instanz beitreten (nur Einkampf-Instanz im Zustand `ready`, Charakter berechtigt), aber die Aktion setzt einen **gestarteten** Kampf mit diesen Mitgliedern voraus; der Start braucht `service_role`. Solange das ungelöst ist, endet der Workflow **absichtlich rot (Exit 4)**. Entscheidung nötig: Zwei-Phasen-Ablauf, dauerhafte Testkonten (Zugangsdaten wären Secrets) oder lokaler Lauf mit deiner Servicerolle.
2. **E-Mail-Bestätigung auf Dev** muss aus sein (Entscheidung nötig), sonst Exit 3. Ob `rwtest.invalid` registrierbar ist, ist offen.
3. **Annahmen über echte Antwortformen** (Abschnitt 4) können den ersten echten Lauf rot färben. Das ist gewollt, kostet aber eine Anpassungsrunde.
4. **`rw_worker_tick`-Negativtest ist scharf:** wäre die Funktion fälschlich für `authenticated` freigegeben, löste der Test einen echten Tick auf Dev aus. Verhindert wird das nur durch die vorherige Rechteprüfung (Katalogprüfung in Phase A).
5. **Log-Limit schützt vor Flut je Konto und insgesamt, nicht vor Verdrängung:** ein Angreifer mit vielen Konten kann die 1000 Einträge/Stunde ausschöpfen, sodass spätere echte `denied`-Ereignisse in dieser Stunde nicht einzeln stehen. Die Abweisung selbst bleibt wirksam. Der Besitzer der Datenbank kann `ops_log` weiterhin per TRUNCATE leeren.
6. **`deno check` ist ungelaufen.** Es kann Typfehler in `index.ts` geben, die weder Bun noch Node melden.
7. **Gateway `verify_jwt` + neue Signaturschlüssel** und das Verhalten beim Deployment sind ungeklärt (Deployment nicht freigegeben).
8. Der Environment-Schutz (`dev-test`, erforderliche Freigeber) und seine Zweigbeschränkung müssen in GitHub eingerichtet werden; aus dem Repository nicht prüfbar.
9. Das Löschen der Testkonten setzt voraus, dass `delete_account` auf Dev die Anmeldung innerhalb von 2 Minuten akzeptiert; real ungetestet.

## 6. Neue Empfehlung für die Datenbankinstallation auf Dev

**BEDINGTE FREIGABE** (Phase A aus `docs/DEV_FREIGABE_VORABPRUEFUNG.md`), unter diesen Bedingungen:
1. **Die Datenbankinstallation enthält jetzt eine Änderung dieses Branches:** `03_windows.sql` (Log-Limit, zwei Teilindizes). Sie ist in allen lokalen Tests (PG 16, inkl. Installations-, Rollback- und Rechte-Audit) grün. **PG 17 steht noch aus** (CI) und sollte vor der Installation grün sein, da Dev PostgreSQL 17 verwendet.
2. Zuerst Katalogprüfung der Rechte direkt nach der Installation (`docs/EXPOSED_SCHEMAS.md`); `rwi` darf nicht exponiert sein.
3. Rollback-Bereitschaft (`rollback_dev.sql`, nicht von Edge Functions erfasst).
4. Die Installation selbst ist **unabhängig** von den ungelösten Punkten (Edge Function, Workflow, Gruppentest-Konzept). Sie stellt nur Datenbankobjekte bereit.

**Weiterhin KEINE FREIGABE** für: Deployment der Edge Function (erst nach grünem `deno check`, geklärten Schlüsselformaten und Betreiberkonto mit MFA) und Ausführung des Dev-Workflows (erst nach Entscheidung zu E-Mail-Bestätigung und Gruppentest-Konzept).

Ich warte auf deine Freigabe. Bis dahin: keine Commits, keine Pushes, nichts installiert oder deployt.

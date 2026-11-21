# Dev-Installationsentscheidung (unabhängige Read-only-Prüfung)

Stand: 18.11.2026, Branch `nacht/operator-edge-function`, HEAD `afc5dfb` plus **nicht committete** Änderungen K1–K10. Bewertet wird ausschließlich dieser Arbeitsstand.
Nicht getan: kein Commit/Push, keine Installation, kein Deployment, keine Secrets, kein Merge; `index.html` und `supabase/schema.sql` unverändert. Einzige neue Datei dieser Prüfung: dieser Bericht (nicht committet). Für die Prüfung B wurde ein Wegwerf-PostgreSQL im lokalen Testcluster benutzt (`/tmp`), nicht Dev.

## Empfehlung: **KEINE FREIGABE** für die Dev-Installation in diesem Stand

Begründung in einem Satz: Die Änderung an `03_windows.sql` ist auf PG 17 nie gelaufen, die CI hat den Stand nie gesehen, und das Log-Limit hält unter Parallelität nachweislich nicht (Abschnitt B). Alle drei Punkte sind behebbar; danach ist **BEDINGTE FREIGABE** möglich (Abschnitt E).

## A. PG 17 und Regression

| Frage | Befund |
|---|---|
| Auf PG 17 getestet? | **Nein.** Lokal ist nur PostgreSQL 16 installiert (`/usr/lib/postgresql`: `16`). |
| Lief die CI nach den Änderungen? | **Nein.** `git ls-remote` und `gh run list` zeigen für den Branch nur Commit `afc5dfb` (alter Stand, `instance-tests`: success). Die Änderungen sind nicht committet, also nicht gepusht; eine grüne CI für den aktuellen Stand **existiert nicht**. |
| Alter Stand vs. nach K1–K10 | Alter Stand `afc5dfb`: CI grün auf PG 16 **und** 17 (Run zu diesem Commit). Nach K1–K10: nur lokaler Lauf PG 16 (25 Testdateien exit 0; `operator-edge` nach Anpassung einzeln 34/34; danach nicht mehr als Gesamtsuite wiederholt). |
| Deckt die SQL-Testbasis `03_windows.sql` vollständig ab? | Die ganze Datei wird bei jedem Setup (`prod-env.mjs`) und im Installationstest (`installation.mjs`) ausgeführt, die Funktionen laufen also. Fachlich abgedeckt: Einzelabweisung (`operatoren.mjs`, `operator-edge.mjs`, `hotfix-resume.mjs`), Limit seriell (`operatoren-limit.mjs`). **Nicht abgedeckt:** parallele Aufrufe, genau 20/21 Zeilen je Konto an den Randwerten einzeln, 1000/1001 global an den Randwerten einzeln (nur „1000 nach 1300“ seriell), Ausführungsplan/Indexnutzung, Verhalten bei Fehlern des `insert` im Limit-Zweig. |
| Fehlende PG-17-Prüfungen | (1) komplette `run-all-db.sh` auf PG 17; (2) `installation.mjs` (Installation, Rollback, Zweitinstallation) auf PG 17; (3) `rechte-audit.mjs`; (4) `operatoren-limit.mjs`, `operator-edge.mjs`, `hotfix-resume.mjs`; (5) PG-17-Verhalten des neuen Teilindex mit `where kind = 'denied'`. Die CI-Matrix (`.github/workflows/instance-tests.yml:39-42`, `pg: [16, 17]`) deckt das ab, **sobald der Stand gepusht ist und läuft**. |
| Weitere nicht ausgeführte Tests | `deno check` und Bun-Smoke (`instance-tests.yml:21-24`, nur eingetragen, nie gelaufen), Engine-/Determinismus-Tests (nicht berührt, nicht neu gelaufen), GitHub-Actions-Verhalten des neuen Workflows. Nicht ausgeführt = nicht bestanden. |

## B. K6: `denied`-Protokollbegrenzung (`server/instance/sql/03_windows.sql:122-143`)

Implementierung: zwei Zählungen (Zeilen 131-132), Rückgabe `null` bei global ≥ 1000 (133), Einzeleintrag bei je Konto < 20 (134-136), ein Sammeleintrag bei genau 20 (137-138), danach `return null` (140). Keine Sperren, keine Zähltabelle.

| Punkt | Ergebnis |
|---|---|
| Trennung Sicherheitsentscheidung/Protokollierung | **Gut:** Der Berechtigte verlässt die Funktion in Zeile 129 (`return o.label`) vor jeder Zählung; **jeder** andere Pfad endet mit `return null` (133, 140). Die Abweisung hängt nie vom Zählergebnis ab. Scheitert ein `count`/`insert` mit Fehler, bricht die Transaktion ab (Aufrufer bekommt Fehler, keine Wirkung): fail-closed. Die Aufrufer (`04_gruppe.sql:624, 637, 668`) werten nur `null`. |
| Serielle Randwerte | Je Konto: Aufrufe 1–20 einzeln, Aufruf 21 Sammeleintrag, danach nichts → 21 Zeilen (`operatoren-limit.mjs`, bestanden auf PG 16). Global: bei 1000 stoppt es exakt (1300 Aufrufe → 1000). Der Sammeleintrag zählt global mit. |
| **Parallele Anfragen desselben Kontos** | **Limit wird überschritten.** Gemessen (lokal PG 16, 40 gleichzeitig gestartete Sitzungen, ein Konto): **27 Zeilen statt 21, 0 Sammeleinträge.** Ursache: Zählen und Einfügen sind nicht atomar (`READ COMMITTED`, Zeilen 131-136), mehrere Sitzungen sehen denselben Zählerstand. Der Sammeleintrag wird übersprungen, wenn der Zähler an `20` vorbeispringt (`elsif n_op = 20`, Zeile 137). |
| **Parallele Anfragen verschiedener Konten** | **Globale Grenze wird überschritten.** Gemessen: Tabelle bei 990 Zeilen, 60 gleichzeitige Aufrufe verschiedener Konten → **1047 statt höchstens 1000.** |
| Stundenfenster | Gleitend (`clock_timestamp() - interval '1 hour'`, Zeilen 131-132), `at` wird mit `clock_timestamp()` gesetzt: konsistent. Seriell geprüft (nach 2 h wieder einzeln). Randfall: Der Sammeleintrag wandert mit dem ersten Eintrag aus dem Fenster, danach kann bei Dauerfeuer ein weiterer entstehen (ein Sammeleintrag je Fenster, kein Schaden). |
| Genau 20 / 21 / 1000 / 1001 | 20 vorhandene → Sammeleintrag; 21 → keiner mehr; global 999 → Einzeleintrag möglich, 1000 → keiner, 1001 nie erreichbar **seriell**; parallel siehe oben. Die Randwerte sind nur indirekt getestet (21 je Konto, 1000 insgesamt), nicht als einzelne Fälle. |
| Umgehung durch viele Konten | Je Konto 21 Zeilen/Stunde, global 1000/Stunde. Mit rund 50 Konten (Registrierung ist offen, E-Mail-Bestätigung auf Dev ggf. aus) lässt sich das globale Fenster dauerhaft füllen. Folge: **echte** `denied`-Ereignisse (z. B. deaktivierter Betreiber) werden in dieser Stunde nicht einzeln protokolliert. Die Abweisung bleibt wirksam; Auswertung des Protokolls wird aber unzuverlässig. Dokumentiert in `DEV_FREIGABE_NACHKORREKTUR.md`, Risiko 5. |
| Locks / Kosten | Keine expliziten Sperren, nur Einfügen am Tabellenende: keine unnötigen Locks. Kosten: jede Abweisung führt zwei `count(*)` aus, der globale zählt bis zu 1000 Indexeinträge (Teilindex `ops_log_denied_at_idx`, Zeile 123). Unter Dauerfeuer bleibt das auch **nach** Erreichen der Grenze so (Zählung vor dem Abbruch). Gering, aber nicht null; nicht gemessen. |
| Wirksamkeit der Mutationsprobe | `operatoren-limit.mjs` weist nach, dass ohne Limit 50 Zeilen entstehen. Eine Mutationsprobe für **Parallelität** fehlt (es gibt keinen Parallel-Test). |

**Bewertung K6:** Sicherheitsabweisung korrekt und unabhängig. Das Limit ist **ein weiches Limit**, kein hartes: Es begrenzt Dauerlast, nicht gleichzeitige Spitzen. Für eine „Obergrenze“ im Sinn der Korrektur K6 ist es nicht ausreichend belegt. Behebung: Zählen und Einfügen unter `pg_advisory_xact_lock` (je Konto, plus globaler Schlüssel nur im Einfügepfad), oder fester Zähler je Stunde in einer eigenen Tabelle mit `insert … on conflict do update … where count < Grenze`; danach Parallel-Test mit Mutationsprobe.

## C. Datenbankinstallation und Rollback

| Punkt | Befund |
|---|---|
| SQL-Änderungen gegenüber `afc5dfb` | `git diff afc5dfb`: **nur** `server/instance/sql/03_windows.sql` (+14/−3, Zeilen 122-143): zwei Teilindizes, neue Fassung von `rwi.check_operator`. `supabase/schema.sql`, `01`, `02`, `04`, `05`, `00_preflight.sql`, `build.sh`, `rollback_dev.sql` unverändert. |
| Rollback | `supabase/dev/rollback_dev.sql:28-29` entfernt `drop schema if exists rwi cascade`. Indizes und `check_operator` liegen in `rwi` und fallen mit. **Kein neues Objekt außerhalb von `rwi`**, also keine neue Rücksetzlücke. Rollback/Zweitinstallation sind im Installationstest (`installation.mjs`, PG 16) geprüft; **PG 17 nicht**. Unverändert nicht zurückgenommen: Rollen, Default-ACLs fremder Rollen, Edge Functions, Migrationshistorie, Testkonten in `auth.users`. |
| Reihenfolge | Unverändert: Preflight, `schema.sql`, `01`…`05` in einer Transaktion (`build.sh`). Die neuen Indizes werden nach der Tabelle `rwi.ops_log` (Zeile ~116) angelegt, die Funktion nach den Indizes: Reihenfolge korrekt. `05_produktion.sql:353` führt `check_operator` in `server_fns` (Grant nur an `service_role`): unverändert und ausreichend, `check_operator` bleibt für Clients unerreichbar. |
| Grants, RLS, Trigger, Daten | Keine neuen Tabellen, keine neuen Grants. RLS-Schleife in `05` erfasst alle `rwi`-Tabellen und ist von Indizes unberührt. Der Trigger `ops_log_no_change` (nur UPDATE/DELETE) wird von den INSERTs nicht berührt. Bestehende Daten: keine (Neuinstallation). Neue Abhängigkeit: `service_role` liest `ops_log` über die Zählungen; dafür hat `service_role` bereits `select` auf alle `rwi`-Tabellen (`05_produktion.sql`, Rechte-Block), `rechte-audit.mjs` bestanden (PG 16). |
| Idempotenz | **Bewusst nicht idempotent** wie bisher: `create function` ohne `or replace`, `create index` ohne `if not exists`; zusätzlich bricht `00_preflight.sql:20` ab, wenn `rwi` schon existiert. Doppelte Ausführung bricht also ab und wird mit der Transaktion zurückgerollt. Kein Problem, aber **kein „nur diese Änderung nachspielen“-Weg**: Eine bereits installierte ältere Fassung bekäme die neue Funktion nur über Rollback/Neuinstallation oder eine eigene Migration. |
| Hinweis zur Installationsdatei | Eine früher gebaute `install_dev.sql`/ein früher notierter Hash gilt **nicht mehr** für diesen Stand; sie muss neu gebaut und neu geprüft werden. |
| Neue Berechtigungs-/Abhängigkeitsprobleme | Keine gefunden (lokal, PG 16). Offen: Verhalten der Supabase-Default-ACLs im echten Dev-Projekt bleibt wie bei jeder Installation nur per Katalogprüfung nach der Installation belegbar. |

## D. Gesamtprüfung K1–K10 (Kurz)

Quellen stichprobenartig gegengelesen (`real-test.mjs`, `dev-test.yml`, `handler.mjs`, `keys.mjs`, `index.ts`, `supabase/config.toml`): K1–K5, K7–K10 entsprechen der Darstellung in `DEV_FREIGABE_NACHKORREKTUR.md`; **K6 ist nur teilweise erfüllt** (Abschnitt B). Alle zugehörigen Tests sind Stub-/Attrappentests oder lokale PG-16-Tests, **keine** echten GoTrue-, Deno- oder Supabase-Integrationstests.

## E. Verbleibende Risiken

1. K6-Limit unter Parallelität überschreitbar (gemessen), kein Parallel-Test.
2. Verdrängung echter `denied`-Einträge durch viele Konten.
3. PG 17 und CI für den aktuellen Stand fehlen (Dev ist PG 17).
4. `deno check`/Bun-Smoke/Workflow nur eingetragen, nie gelaufen.
5. Positive Gruppentests mit dem Workflow nicht erreichbar (Exit 4 absichtlich); E-Mail-Bestätigung auf Dev offen.
6. Annahmen über echte Antwortformen von PostgREST/GoTrue ungeprüft; erster echter Lauf kann rot werden.
7. Nicht idempotente Installation; Rollback nimmt Rollen/Edge Functions/Migrationshistorie nicht zurück.
8. Edge-Function-Deployment bleibt ohne reale Tests (aal2, `verify_jwt` mit neuen Signaturschlüsseln, Secret-Key-Header).
9. `ops_log` kann vom Datenbankbesitzer per TRUNCATE geleert werden.

## F. Notwendige Voraussetzungen für eine (bedingte) Freigabe

1. K6 hart machen (Advisory-Lock oder Zähltabelle), Parallel-Test mit Mutationsprobe ergänzen und Randwerte 20/21/1000/1001 einzeln testen; **oder** schriftliche Entscheidung, dass ein weiches Limit genügt (dann Doku und Bericht entsprechend umformulieren).
2. Stand committen und pushen **auf deine ausdrückliche Anweisung**, CI vollständig grün auf **PG 16 und 17** (inkl. `installation`, `rechte-audit`, `operatoren-limit`); erst dann gilt Abschnitt A als erfüllt.
3. `install_dev.sql` neu bauen, Hash notieren, Inhalt gegen diesen Bericht prüfen.
4. Nach der Installation sofort Katalogprüfung (`docs/EXPOSED_SCHEMAS.md`): `rwi` nicht exponiert, kein EXECUTE für `anon`/`authenticated` auf `rw_worker_*`/`rw_ops_*`, 18 Tabellen in `rwi`.
5. `rollback_dev.sql` mit gesetzter Bestätigung bereit; Entscheidung, was mit Testkonten und Edge Function im Fehlerfall geschieht.
6. Ziel ausdrücklich `ruinwalk-dev` (`jlkqktmvqxibqdcobbhf`), nie Production.

Die Installation ist **unabhängig** von Edge-Function-Deployment und Workflow; beide bleiben **nicht freigegeben**.

Ich warte auf deine Entscheidung.

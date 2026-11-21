# K6: Parallelitäts-Nachkorrektur (hartes denied-Limit)

Stand: 18.11.2026, Branch `nacht/operator-edge-function` (HEAD `afc5dfb`, alle Änderungen **nicht committet**, nichts gepusht).
Nicht getan: keine Installation auf Dev/Production, kein Deployment, keine Secrets, kein Merge, `index.html`/`schema.sql`/`main` unverändert.
Dieser Bericht ersetzt die K6-Aussagen in `DEV_FREIGABE_NACHKORREKTUR.md` (Abschnitt „K6“, Risiko 5) und `DEV_INSTALLATIONSENTSCHEIDUNG.md` (Abschnitt B).

## 1. Ursache des bisherigen Fehlers
`rwi.check_operator` zählte zuerst (`count(*)`) und fügte danach ein. Zwischen beiden Schritten gab es keine Sperre. Unter READ COMMITTED sahen gleichzeitige Transaktionen denselben Zählerstand und fügten alle ein. Gemessen im alten Stand (lokal PG 16): 40 gleichzeitige Aufrufe eines Kontos → 27 statt 21 Zeilen, Sammeleintrag fehlte; 60 gleichzeitige Aufrufe bei 990 Zeilen → 1047 statt 1000. Das Limit war nur seriell hart.

## 2. Technische Lösung (`server/instance/sql/03_windows.sql`, `rwi.check_operator`, ab Zeile ~126)
- **Eine transaktionsgebundene Advisory-Sperre** `pg_advisory_xact_lock(7003, 0)` umschließt Zählung **und** Einfügen. Die Klasse 7003 kollidiert nicht mit den vorhandenen Sperren 7001/7002 (`04_gruppe.sql`).
- Reihenfolge: erst Betreiberprüfung (berechtigt → sofort `return o.label`, **vor** jeder Sperre), dann Sperre, dann **eine** Zeitmarke `t = clock_timestamp()` für Fenster **und** `at` des neuen Eintrags (exaktes, gleitendes 1-Stunden-Fenster `at > t - 1 hour`), dann global zählen (`>= 1000` → nichts einfügen), dann je Konto zählen (`< 20` → Einzeleintrag, `= 20` → ein Sammeleintrag, sonst nichts).
- Die Zählung ist eine neue Anweisung nach dem Erwerb der Sperre. Unter READ COMMITTED nimmt sie einen frischen Snapshot und sieht damit die Einträge der vorherigen Sperrinhaberin (deren Commit hat die Sperre freigegeben). Unter anderen Isolationsstufen gilt das nicht; dort wird **nicht protokolliert** (Warnung), damit die Grenze hart bleibt.
- **Trennung von Sicherheitsentscheidung und Protokollierung:** ab der Abweisung steht der Rückgabewert `null` fest. Die gesamte Protokollierung läuft in einem Unterblock mit `exception when others`: jeder Fehler (Insert schlägt fehl, `lock_timeout`, Platz, Rechte) wird zur Warnung, die Funktion liefert weiter `null`. Ein Protokollfehler kann also nie eine Freigabe oder einen Fehler nach außen erzeugen; im schlimmsten Fall fehlt die Zeile (weniger, nie mehr als erlaubt).
- Beim Umbau gefunden und behoben: `FOUND` wird von den neuen `count`-Anweisungen überschrieben und hätte den Notiztext („kein Betreiber“ / „deaktiviert“ / „Berechtigung fehlt“) verfälscht. `found` wird jetzt direkt nach der Betreiberabfrage in `had` gesichert (Zeile 133).
- Die beiden Teilindizes (`ops_log_denied_op_idx`, `ops_log_denied_at_idx`) bleiben unverändert.

### Begründung der Sperrstrategie
- Das **globale** Limit (1000) lässt sich nur einhalten, wenn alle Protokollierungen der abgewiesenen Aufrufe nacheinander zählen und einfügen. Eine Sperre je Konto würde die Grenze für viele Konten nicht schützen (gemessen: 1047). Deshalb **eine** globale Sperre; sie deckt das Konto-Limit automatisch mit ab.
- Eine einzige Sperre ist **deadlock-frei** (keine zweite Sperre in anderer Reihenfolge). `check_operator` wird in `resume_stuck`, `terminate_stuck` und `register_engine` (`04_gruppe.sql:624, 637, 668`) als erste Datenbankoperation aufgerufen, bevor Zeilensperren auf Kampf/Instanz genommen werden; nach der Abweisung kehren diese Funktionen sofort zurück.
- Haltedauer: bis zum Ende der aufrufenden Transaktion (`xact`). Das ist ein kurzer einzelner Funktionsaufruf über PostgREST/Edge Function. Berechtigte Betreiber warten nie auf diese Sperre.
- Alternativen verworfen: Zähltabelle mit `insert … on conflict` (zusätzliches Objekt, mehr Installations-/Rollbackfläche, „weitere Architekturänderung“); `lock table` (zu grob, blockiert auch Lesende/`ops_log`-Einträge anderer Arten).

## 3. Ergebnisse der Paralleltests (`server/instance/tests/operatoren-parallel.mjs`, 30 Prüfungen, PG 16.15)
Jeder Aufruf ist eine eigene psql-Sitzung = eigene Datenbanktransaktion in einem echten lokalen PostgreSQL, gleichzeitiger Start über `pg_sleep_until`. Supabase (GoTrue, PostgREST, Rollen) ist dabei weiter nicht beteiligt/simuliert.

| Prüfung | Ergebnis |
|---|---|
| Randwerte je Konto seriell | 20 → 20 Zeilen ohne Sammeleintrag; 21 → genau 1 Sammeleintrag; 22+ → unverändert 21 |
| Randwerte global seriell | 999 → 1000 (Aufruf an der Grenze protokolliert); bei 1000 wird der nächste abgewiesen, **nicht** protokolliert (kein 1001); auch über `rw_ops_terminate` weiter `not_operator` |
| 40 gleichzeitige Aufrufe, ein Konto (3 Wiederholungen) | je Lauf alle 40 abgewiesen, **genau 21 Zeilen** (20 + 1 Sammeleintrag) |
| 60 gleichzeitige Aufrufe, 60 Konten (3 Wiederholungen) | je Lauf genau 60 Zeilen |
| 990 vorhanden + 60 gleichzeitig (3 Wiederholungen) | je Lauf **genau 1000** |
| 950 vorhanden + 40 (ein Konto) + 60 (verschieden) gleichzeitig | genau 1000 global, 21 für das eine Konto |
| Stundenfenster | Einträge von vor 59 min 50 s zählen noch; älter als 1 h zählen nicht, danach wieder Einzeleintrag |
| Protokollfehler (Trigger, der beim Einfügen wirft) | `check_operator` wirft nicht, liefert `null`; Wrapper `not_operator`; keine Zeile |
| `lock_timeout` beim Warten auf die Sperre | kein Fehler nach außen, abgewiesen, Zeile entfällt |
| REPEATABLE READ | abgewiesen, bewusst nicht protokolliert |
| Berechtigter Betreiber bei blockierter Sperre und erschöpftem Limit | sofort durchgelassen |

## 4. Mutationsprobe
- **A:** Sperre entfernt. 3 Läufe à 40 gleichzeitige Aufrufe: 39, 40, 23 Zeilen (statt 21). Zeitabhängig, deshalb nur als Information ausgegeben.
- **B:** Sperre entfernt **und** Fenster zwischen Zählen und Einfügen verbreitert (`pg_sleep(0.05)`): alle drei Läufe 40 Zeilen → der Test „genau 21“ schlägt zuverlässig an (Prüfung bestanden = Mutation erkannt).
- **Global:** ohne Sperre endete der Lauf „990 + 60 gleichzeitig“ bei 1049 → Test „genau 1000“ erkennt es.
- Danach Originalfunktion wiederhergestellt und erneut geprüft (40 gleichzeitig → genau 21).
- Weiter vorhanden: `operatoren-limit.mjs` (13) mit Mutationsprobe „ohne Limit“.

## 5. Regression (lokal, nur PostgreSQL 16.15)
`run-all-db.sh` mit `PG_MAJOR=16`: **26 von 26 Testdateien Exit 0** (inkl. neu `operatoren-parallel` 30, `installation` 29, `rechte-audit` 29, `operatoren` 31, `hotfix-resume` 34, `operator-edge` 34, `operatoren-limit` 13, `dev-korrekturen` 47, `dev-skript` 19, `operator-korrekturen` 30). Der Stand wurde dabei **als Ganzes** getestet.
**PG 17: nicht getestet** (lokal nicht installiert), daher **nicht bestanden**. Ebenfalls nicht gelaufen: CI, `deno check`, Bun-Smoke-Test (nur eingetragen), Engine-/Determinismus-Tests (unberührt, nicht neu gelaufen).

## 6. Status `install_dev.sql` und `rollback_dev.sql`
- **`supabase/dev/install_dev.sql`** neu erzeugt mit `build.sh` (erzeugte Datei, **untracked, nicht committet, nicht installiert**): 2077 Zeilen, **sha256 `447b53c071e5161aea55389ad2353725c33147fcc0b652f3ab55f4ed1bf149cd`** (Stand damals, **überholt** – maßgeblich ist der Hash im Kopf von `docs/DEV_INSTALLATIONSFREIGABE.md`). Sie enthält byte-genau (geprüft) `00_preflight.sql`, `schema.sql`, `01`…`05` in dieser Reihenfolge; die atomare Fassung steht in Abschnitt `03_windows.sql` (Sperre 7003 einmal vorhanden). Der Installationstest baut sie selbst neu und erhielt denselben Kurz-Hash (`447b53c071…`).
- **SQL-Änderungen gegenüber `afc5dfb`:** ausschließlich `server/instance/sql/03_windows.sql` (zwei Teilindizes, neue `check_operator`). `schema.sql`, `01`, `02`, `04`, `05`, Preflight, `build.sh`, `rollback_dev.sql` unverändert (`git diff` leer).
- **Abhängigkeiten/Preflight:** keine neuen Objekte außerhalb `rwi`, keine neuen Grants, keine RLS-/Trigger-Änderung; `check_operator` bleibt in `server_fns` (nur `service_role`, `05_produktion.sql:353`). Advisory-Sperren brauchen keine Rechte. Preflight (`00_preflight.sql:20`) verhindert weiter die Doppelinstallation; die Installation ist bewusst nicht idempotent.
- **`rollback_dev.sql`** unverändert und ausreichend: `drop schema if exists rwi cascade` (Zeile 29) entfernt Funktion und Indizes; die Sperre hinterlässt kein Objekt. Rollback und Zweitinstallation sind im Installationstest auf PG 16 bestanden; **auf PG 17 nicht getestet**.
- Hinweis: Der alte Hash/die alte Datei ist ungültig; nur diese Datei gilt für diesen Stand. Ändert sich der Stand, muss sie neu gebaut werden.

## 7. Verbleibende Risiken
1. **PG 17 und CI nicht gelaufen** (Dev ist PG 17). Advisory-Locks, `exception`-Blöcke und Teilindizes sind unkritisch, aber nicht belegt.
2. **Serialisierung:** alle abgewiesenen Aufrufe laufen für die Protokollierung kurz nacheinander (auch nach Erreichen des Limits wird gezählt). Unter Dauerfeuer entsteht Wartezeit nur für Abgewiesene; der Durchsatz ist **nicht gemessen**. Berechtigte sind nicht betroffen.
3. Haltedauer bis Transaktionsende: ein künftiger Aufrufer, der nach einer Abweisung lange weiterarbeitet, würde andere Abgewiesene blockieren. Heute nicht der Fall.
4. **Bewusster Protokollverlust** bei Fehler, Zeitüberschreitung oder Nicht-READ-COMMITTED (nur Warnung im Serverlog; nicht im `ops_log`).
5. **Verdrängung bleibt:** viele Konten können die 1000 pro Stunde ausschöpfen; echte `denied`-Ereignisse stehen dann nicht einzeln im Protokoll (Abweisung wirkt weiter).
6. Der Datenbankbesitzer kann `ops_log` per TRUNCATE leeren; das Limit wird dadurch zurückgesetzt.
7. Die Paralleltests laufen mit bis zu 100 gleichzeitigen psql-Prozessen und zeitabhängigen Startpunkten; sie sind bisher stabil (je dreimal wiederholt), aber auf einem stark belasteten CI-Runner nicht erprobt.
8. Alle bekannten offenen Punkte aus `DEV_INSTALLATIONSENTSCHEIDUNG.md` außerhalb von K6 (Edge-Function-Deployment, Workflow/Gruppentests, echte GoTrue-/Deno-/Supabase-Tests) bleiben **unverändert offen**.

Ich habe vollständig gestoppt und warte auf deine Freigabe. Keine Commits, Pushes, Installationen oder Deployments.

# Ablauf bei „stuck“ (hängende Runde): Erkennen, Alarm, Untersuchen, Beheben, Wiederaufnehmen oder beenden

Umgesetzt in `server/instance/sql/03_windows.sql` (Alarm, Protokoll), `04_gruppe.sql` (`report_failure`, `resume_stuck`, `terminate_stuck`, `stuck_overview`, Watchdog), Wrapper in `05_produktion.sql`.
Tests: `server/instance/tests/stuck.mjs` (46 Prüfungen), `server/instance/tests/hotfix-resume.mjs` (34 Prüfungen). **Eine tatsächliche Benachrichtigung nach außen (E-Mail, Chat, Pager) gibt es nicht.** Der Alarm ist ein Datensatz; die Zustellung ist offen.

## Regeln (verbindlich, so getestet)
1. Der Worker meldet einen Engine-Fehler mit `report_failure`. Die Wiederholung kommt nach 5 / 10 / 20 / 40 / 60 s (danach 60 s). Dasselbe gilt für verletzte Invarianten im Commit.
2. Nach `max_attempts` Fehlversuchen wird der Auftrag `stuck`, die Instanz bekommt `engine_stuck = true`.
3. **Ein `stuck`-Auftrag wird nie automatisch wiederholt.** Der Watchdog verteilt ihn nicht mehr. Ein Claim wird mit `status: stuck` abgewiesen, selbst wenn die Lease abgelaufen ist.
4. **Genau ein Alarm je Übergang nach stuck.** Schlüssel `stuck:<Kampf>:<Runde>:<Wiederaufnahmen>`, eindeutig per Unique-Index. Weitere Fehlermeldungen (`already_stuck`), weitere ungültige Commits und beliebig viele Watchdog-Läufe erzeugen keinen zweiten Alarm. Gleichzeitige Meldungen am Übergang ebenfalls nicht (getestet: 4 parallel → 1 Alarm).
5. Der Watchdog legt einen fehlenden Alarm genau einmal nach (Sicherheitsnetz) und schließt Alarme von Aufträgen, die nicht mehr stuck sind (z. B. Instanz beendet).
6. Alarmierung verändert keine Instanzdaten (Kampfzustand, Aktionen, Mitglieder: Prüfsumme vorher/nachher gleich).
7. Eine **Wiederaufnahme** ist nur für die aktuelle Runde möglich, nur solange kein Rundenergebnis existiert, nur aus `stuck`, mit Betreibername (2–80 Zeichen) und Begründung (10–1000 Zeichen). Sie wird in `rwi.ops_log` protokolliert und macht den alten Claim-Token ungültig. Eine zweite Wiederaufnahme derselben Episode findet keinen stuck-Auftrag mehr (`not_stuck`). Eine bereits aufgelöste Runde ergibt `stale`. Drei gleichzeitige Wiederaufnahmen: genau eine wirkt.
8. Wird derselbe Kampf nach einer Wiederaufnahme erneut stuck, entsteht ein **neuer** Alarm (neue Episode).

## Schritte
**1. Erkennen.** Der Watchdog-Tick (`rw_worker_tick`) liefert `stuck_open` (Anzahl offener Alarme) und `stuck_new`. Der Betrieb fragt `rw_ops_stuck_list()` ab: Alarm-ID, Zeit, Kampf, Runde, Instanz, Versuche, Wiederaufnahmen, letzte Fehlermeldung.

**2. Alarm erzeugen.** Geschieht automatisch beim Übergang (`rwi.raise_stuck`). Offen ist, wer den Datensatz nach außen meldet (z. B. ein geplanter Job, der `rw_ops_stuck_list()` liest und bei neuem Alarm benachrichtigt). Das ist bewusst noch nicht gebaut.

**3. Fehler untersuchen.** `last_error` zeigt die letzte Fehlermeldung (Engine-Ausnahme oder `invariant:<Grund>`). Der eingefrorene Eingabe-Snapshot der Runde liegt in `rwi.fights.snapshot` (Seed, Zustand, Aktionen); die Runde lässt sich mit der Engine offline nachrechnen. Die Instanz ist währenddessen eingefroren: Fristen laufen nicht gegen die Spieler (bestehende Regel A.6 „Fristenstopp“).

**4. Ursache beheben.** Engine-Fehler: Engine-Korrektur ausrollen. Fehlerhafte Daten: nur nach Absprache und protokolliert korrigieren.

**5a. Kontrollierte Wiederaufnahme.** `rw_ops_resume(kampf, runde, betreiber, begründung)`. Wirkung: Auftrag `pending`, Versuche 0, Wiederaufnahmen +1, Alarm erledigt, `engine_stuck` zurück, Lease sofort abgelaufen, der nächste Tick verteilt den Kampf. Die Runde wird mit dem gespeicherten Snapshot deterministisch neu aufgelöst und genau einmal gespeichert.

**5b. Technische Beendigung.** `rw_ops_terminate(kampf, betreiber, begründung)`, wenn die Ursache nicht behebbar ist. Die Instanz endet als `aborted`, der Kampf als `technical_end`, es gibt keine Belohnung (wie jeder technische Abbruch). Nur für stuck-Kämpfe möglich; ein gesunder Kampf ergibt `not_stuck`.

## Hotfix und Wiederaufnahme mit neuer Engine-Version (Beschluss)
Eine neue Engine-Version darf nach einem Hotfix zur kontrollierten Wiederaufnahme dienen. Regeln (so umgesetzt und getestet):
1. **`stuck` bleibt gesperrt**, bis ein Operator ausdrücklich `resume_stuck` aufruft. Ein direkter Commit auf einen stuck-Auftrag wird abgewiesen (`stuck_locked`), auch mit gültigem Ergebnis und neuer Engine-Version; er zählt nicht als Fehlversuch und erzeugt keinen Alarm. (Der frühere Weg „Commit mit neuer Engine-Version löst stuck“ ist damit abgeschafft; `run.mjs` und `stuck.mjs` prüfen jetzt Sperre, Wiederaufnahme und Commit nacheinander.)
2. **Fehlerursache untersucht:** `resume_stuck` verlangt Betreiber (2–80 Zeichen) und Begründung (10–1000 Zeichen).
3. **Kompatibilität:** Eine neue Engine-Version muss in `rwi.engine_versions` registriert sein (`rw_ops_register_engine(version, state_schema, note)`; eine registrierte Version wird nie umgeschrieben) und dasselbe Zustandsschema (`state_schema`) wie der gespeicherte Kampfzustand (`rwi.fights.state_schema`, heute 1) haben. Unbekannt → `unknown_engine`, anderes Schema → `incompatible_engine`; in beiden Fällen bleibt alles unverändert (stuck, Alarm offen, kein Protokolleintrag). Ohne gespeicherten Snapshot → `no_snapshot`.
4. **Keine Wiederholung bereits Erledigtem:** nur die aktuelle Runde ohne Ergebnis (`stale` für abgeschlossene Runden, `already_resolved` für fertige); der Snapshot ist eingefroren, die neue Zuteilung hat denselben `input_hash` (keine Aktion wird erneut gelesen oder wiederholt); der alte Claim-Token ist ungültig (ein später eintreffender Commit des alten Workers ergibt `superseded`); Ergebnisse früherer Runden bleiben byte-gleich; das Ergebnis der Runde wird genau einmal gespeichert.
5. **Freigegebene Version:** Nach der Wiederaufnahme akzeptiert der Commit nur die freigegebene Engine-Version (`engine_mismatch` sonst).
6. **Protokoll:** `rwi.ops_log` enthält Art, Betreiber, Begründung, **alte und neue Engine-Version**. Die alte Version stammt aus dem letzten fehlgeschlagenen Commit, sonst vom letzten Rundenergebnis des Kampfes, sonst `unbekannt` (Engine-Ausnahmen über `report_failure` melden die Version bisher nicht).
7. **Replay/Determinismus** unverändert: gespeicherte Eingabe und Ergebnis jeder Runde (auch der nach der Wiederaufnahme) sind bitgleich reproduzierbar (Test).
8. Ohne Versionsangabe (`p_engine` leer): Wiederaufnahme mit unverändertem Code, z. B. nach einem vorübergehenden Fehler; die vorherige Version wird als freigegebene übernommen, sofern sie bekannt ist.
9. Aufruf: `rw_ops_resume(kampf, runde, betreiber, begründung, engine_version)`.

## Alarmierung: Datenbankalarm ist die maßgebliche Quelle (Beschluss)
Es gibt vorerst **keine externe Zustellung**. Sichergestellt (getestet in `stuck.mjs` und `hotfix-resume.mjs`):
- genau ein Alarm pro Übergang nach `stuck` (eindeutiger Schlüssel `stuck:<Kampf>:<Runde>:<Episode>`),
- Wiederholungen (weitere Fehler, weitere Commits, beliebig viele Watchdog-Läufe, parallele Meldungen) erzeugen keine Duplikate,
- Alarmstatus (`open`/`resolved`, `resolved_at`, `resolved_note`) und Historie bleiben erhalten; nach einer Wiederaufnahme entsteht bei erneutem stuck ein neuer Alarm der nächsten Episode, der alte bleibt als erledigt stehen,
- Wiederaufnahme und technische Beendigung stehen in `rwi.ops_log` (nur anhängen).

### Spätere Zustellung (nicht gebaut, Vorschlag)
Die Zustellung bleibt unabhängig ergänzbar, ohne `rwi.ops_alerts` oder die Alarmlogik zu ändern:
1. Eigene Tabelle `rwi.alert_delivery(alert_id references rwi.ops_alerts, channel, status, attempts, last_error, delivered_at)` mit Unique `(alert_id, channel)` – so entsteht je Alarm und Kanal höchstens eine Zustellung.
2. Ein geplanter Server-Job (gleicher Cron wie der Watchdog) liest über `rw_ops_stuck_list()` die offenen Alarme ohne Zustellung, sendet über einen Dienst (E-Mail-Anbieter, Chat-Webhook, Pager) und trägt das Ergebnis ein. Wiederholung mit Backoff; Ausfall des Dienstes ändert nichts an Instanzen.
3. Zugangsdaten nur als Secret der Edge Function, nie in der Datenbank oder im Repository.
4. Zustellung mit „mindestens einmal“-Garantie; der Empfänger erkennt Duplikate an der Alarm-ID.

## Nicht belegt / offen
- Zustellung des Alarms nach außen (Benachrichtigung).
- Alte Engine-Version bei reinen Engine-Ausnahmen (`report_failure`) ist nicht immer bekannt (siehe Regel 6).
- Wer ist „Betreiber“? Die Wrapper sind nur mit `service_role` aufrufbar; die Betreiberkennung ist eine freie Textangabe, keine geprüfte Identität. Eine Betreiber-Rolle oder Zwei-Personen-Freigabe wäre eine spätere Entscheidung.
- Verhalten unter echter Last und echten Netzwerkausfällen (nur lokal getestet).

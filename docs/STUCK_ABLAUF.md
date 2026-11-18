# Ablauf bei „stuck“ (hängende Runde): Erkennen, Alarm, Untersuchen, Beheben, Wiederaufnehmen oder beenden

Umgesetzt in `server/instance/sql/03_windows.sql` (Alarm, Protokoll), `04_gruppe.sql` (`report_failure`, `resume_stuck`, `terminate_stuck`, `stuck_overview`, Watchdog), Wrapper in `05_produktion.sql`.
Tests: `server/instance/tests/stuck.mjs` (43 Prüfungen). **Eine tatsächliche Benachrichtigung nach außen (E-Mail, Chat, Pager) gibt es nicht.** Der Alarm ist ein Datensatz; die Zustellung ist offen.

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

## Bestehender Hotfix-Weg bleibt erhalten
Der frühere Beschluss (A.6): Ein Commit mit **neuer Engine-Version** und gültigem Ergebnis löst eine hängende Runde. Dieser Weg funktioniert weiter (Test in `run.mjs` unverändert, plus `stuck.mjs`). Er wird jetzt protokolliert (`ops_log`, Art `hotfix_commit`) und erledigt den Alarm.
**Offene Entscheidung:** Dieser Weg ist ebenfalls eine bewusste serverseitige Handlung, aber er braucht den Claim-Token des letzten Claims und prüft die Engine-Version nicht gegen die fehlerhafte. Soll ein Commit auf einen stuck-Auftrag künftig nur über `resume_stuck` möglich sein? Das würde den Hotfix-Test aus `run.mjs` ändern und braucht deine Entscheidung.

## Nicht belegt / offen
- Zustellung des Alarms nach außen (Benachrichtigung).
- Wer ist „Betreiber“? Die Wrapper sind nur mit `service_role` aufrufbar; die Betreiberkennung ist eine freie Textangabe, keine geprüfte Identität. Eine Betreiber-Rolle oder Zwei-Personen-Freigabe wäre eine spätere Entscheidung.
- Verhalten unter echter Last und echten Netzwerkausfällen (nur lokal getestet).

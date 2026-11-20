# K.2-Vergleich: Diagnose bei Deadlocks (Prio 1)

Stand: 20.11.2026. Nur Testdiagnose – keine Änderung an SQL, Sperrlogik, Deadlock-Behandlung oder K.2-Testlogik.

## Anlass
`node server/instance/tests/k2-compare.mjs skip 15` (CI-Job `database`, Pflichtprüfung) wurde sporadisch rot
(CI-Läufe 44279099804: 1 Deadlock; 44609289963: 2 Deadlocks; Fachwerte jeweils 0). Die PostgreSQL-Meldung wurde bisher nicht ausgegeben,
das Serverlog der temporären Testinstanz beim Beenden gelöscht – die Ursache war nicht nachvollziehbar.

## Was jetzt ausgegeben wird (stderr, im CI-Joblog sichtbar)
- **Je fehlgeschlagener Sitzung** ein Block `----- PostgreSQL-Fehler: Variante …, Durchlauf …, Event …, commit_round(Kampf N) | sweep_event Nr. k (Start +… ms) -----`
  mit `ERROR: <SQLSTATE>` (z. B. `40P01`), `DETAIL` (alle beteiligten Prozesse und Sperren), `HINT`, `CONTEXT` (bis zur PL/pgSQL-Zeile), `LOCATION`.
- **Bei Fehlschlag oder Abbruch** das Serverlog der Testinstanz vor dem Löschen: SQLSTATE, Quellort, `STATEMENT`,
  die Anweisungen aller beteiligten Prozesse (`Process <pid>: …`) und Sperrwartezeiten (`log_lock_waits`).
  Bis 4.000 Zeilen vollständig, darüber gekürzt (Abschnitte ±40 Zeilen um jedes „deadlock detected“ und das Logende bleiben vollständig).
- Grüne Läufe: keine zusätzliche Ausgabe.
- Zuordnung Block ↔ Serverlog: Die erste Prozessnummer im `DETAIL` ist das Opfer und entspricht dem `[pid]`-Präfix im Serverlog.

## Umsetzung
- `server/instance/tests/diagnose.mjs`: psql mit `VERBOSITY=verbose`, `SHOW_CONTEXT=always`; Server mit `log_error_verbosity=verbose`,
  `lc_messages=C` (Meldungen sprachunabhängig englisch); Fehlerblock und Serverlog-Ausgabe.
- `server/instance/tests/k2-compare.mjs`: nutzt diese Schalter und gibt die Diagnose aus; Varianten, Parallelität, Zeitplan, Zählung,
  Fachprüfungen und Exit-Code unverändert.
- `server/instance/tests/diagnose-test.mjs` (19 Prüfungen, CI-Schritt nach dem K.2-Vergleich): erzeugt in einer eigenen Testinstanz
  einen echten Deadlock. Synchronisierung ohne Zeitannahme: Advisory-Signale in `pg_locks` (B hält Zeile 2) und der Sperrwarte-Eintrag
  von A im Serverlog (Deadlock-Prüfung von A ist ohne Zyklus gelaufen) – dadurch wird B deterministisch zum Opfer.

## Prüfung
Lokal (PostgreSQL 16): alle Instanzkampf-Suites grün; Mutationsproben erkannt; stabil unter CPU- und Datenbanklast.
Unabhängig geprüft von `rw-qa` und `rw-instanzkampf` (20.11.2026): „freigeben mit Auflagen“ (Doku, Schrittreihenfolge – umgesetzt).

## Offener Befund (nicht Teil von Prio 1, nicht untersucht)
In einem lokalen Lauf `skip 15` hat die neue Diagnose einen Deadlock eingefangen: `commit_round` wartete im internen Sweep mit
`FOR UPDATE SKIP LOCKED` auf eine fremde Transaktion (`CONTEXT: while locking updated version … of tuple in relation "instances"`),
Gegenstück war ein blockierender `sweep_event`. Annahme: SKIP LOCKED greift beim Nachverfolgen einer geänderten Zeilenversion nicht.
Das betrifft die eingefrorene Zusicherung K.2 („interne Sweeps warten nie“) und das gleiche Muster in `sweep_core` (`sql/04_gruppe.sql`).
Untersuchung und jede Korrektur: Prio 2, nur mit ausdrücklicher Freigabe von Pascal.

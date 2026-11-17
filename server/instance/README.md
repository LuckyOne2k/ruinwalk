# Instanzkampf – isolierter Prototyp (Phase 0/1)

Vollständig getrennt vom Spiel: eigenes Schema `rwi` in einem **temporären lokalen Postgres**, keine Spielerdaten, keine Verbindung zu Supabase, `index.html` unberührt.
Alle Inhalte (Klassen, Boss, Zahlen) sind **Testwerte**, keine Spielbalance.

| Was | Befehl |
|---|---|
| Kompletter Dungeon-Kampf (echte Klassenstruktur, mit Wiederbelebung, echte Auftragskette); `--team legacy` = alte Referenzgruppe; `--weltboss-ende` = Event endet nach dem Claim | `node server/instance/sim/run-dungeon.mjs --seed 3` |
| …mit Weltboss-Eventende mitten im Kampf | `… --weltboss-ende` |
| …andere Gruppen | `… --team 3 \| noheal \| notank` |
| Engine-Kernregeln (38, alte Testprofile) | `node server/instance/tests/combat.mjs` |
| Klassenstruktur (4 Grundklassen, 12 Pfade, 48 Fähigkeiten), Statusregeln, Wiederbelebung A/B/C, Limit, Wipe-Wiederaufnahme (57) | `node server/instance/tests/struktur.mjs` |
| Eingefrorene Referenzkämpfe (12, alte Testprofile) | `node server/instance/tests/golden.mjs` |
| Gruppenverwaltung (Beitritt, Warteliste, Nachrücken, Bereitschaft, Austritt, Entfernung, Abbruch) und `instance_view` (98) | `node server/instance/tests/gruppe.mjs` |
| Trennung der alten Testprofile vom regulären Engine-Pfad (12) | `node server/instance/tests/trennung.mjs` |
| Statusliste offener Kampfregeln, an echtem Engine-Verhalten belegt (10 Proben) | `node server/instance/tests/offen.mjs` |
| Todesfenster, Annahme in Zeit, Wipe-Halt, Niederlage nach Ablauf, Gruppenpause, Eventende je Eingangsfunktion (39) | `node server/instance/tests/fenster.mjs` |
| Datenbank-Tests: Claim, Commit, Lease, Eventende, Störungsfenster, Aktion, Watchdog (43) | `node server/instance/tests/run.mjs` |
| K.2-Vergleich der Eventende-Varianten | `node server/instance/tests/k2-compare.mjs old\|eigene\|skip 30 [nosweep]` |
| Gleiches Ergebnis in Node, Bun, Deno (Phase-0-Engine und Engine v1 mit echten Teams, Wiederbelebung, Ausfall, Austritt) | `bash server/instance/tests/run-determinism.sh` |

Voraussetzung: Node 22, PostgreSQL-Binaries (`initdb`, `pg_ctl`, `psql`, `pgbench`) und pgcrypto. CI: `.github/workflows/instance-tests.yml`.


## Gruppenverwaltung und instance_view (sql/04_gruppe.sql)

- **Anlegen/Beitritt:** `create_group` (2–8 Spieler, Mindest- ≤ Höchstgröße ≤ 8, Zugang erst ab Level 5 mit Grundklasse). `join`: Mehrkampf-Dungeon immer über die Warteliste, Aufnahme **nur in der Bereitschaftsphase**, in Reihenfolge, bis zur Höchstgröße. Während eines Kampfes nur Warteliste, nie Teilnahme am laufenden Kampf. Einkampf-Instanz (Weltboss): Beitritt nur vor dem Start, kein Nachrücken, keine Warteliste. Im letzten Kampf kein Beitritt mehr.
- **Kein Wiederbeitritt** nach Austritt oder Entfernung (eindeutiger Index je Spieler und Instanz). Nachrücker erhalten 3 eigene Heiltränke, nie rückwirkende Ansprüche.
- **Bereitschaft:** `set_ready` (nicht widerrufbar, bleibt bei Trennung). Verbundene: 60 s, danach automatische Entfernung („bereitschaft“). Getrennte: Frist ruht, 60 s ab Wiederverbindung. `start_fight` startet erst, wenn alle bereit sind, prüft atomar das Eventende und lehnt Referenzprofile und abweichende Teilnehmerlisten ab.
- **Abwesenheit:** 5 Minuten ununterbrochen getrennt → automatische Entfernung („abwesenheit“), Störungsfenster zählen nicht. In der Bereitschaftsphase keine Gruppenpause.
- **Mindestgröße:** reine Startbedingung. Freiwilliger Austritt darf darunter fallen (nur „niemand mehr da“ beendet). Jede automatische Entfernung mit Ergebnis unter der Mindestgröße → Instanz „aborted“.
- **Ansprüche (Tabelle `entitlements`):** Kampf-EP und Beute je Kampf nur für Beteiligte. Freiwilliger Austritt: noch ausstehende Beute entfällt, Kampf-EP bleiben. Automatische Entfernung: verdiente Ansprüche bleiben. Wer während eines Kampfes ausscheidet, hat daraus keinen Anspruch. Abschlussbelohnung nur bei Sieg der gesamten Instanz und nur für verbliebene Mitglieder.
- **`instance_view`:** `STABLE`, schreibt nichts. Nur Mitglieder (volle Sicht), Wartende (Platz) und Ausgeschiedene (nur eigener Status). Fremde und unbekannte Instanzen sind nicht unterscheidbar. Fremde Aktionen nur als „bestätigt ja/nein“. Das Eventende gilt in der Antwort sofort, auch wenn der Watchdog es noch nicht festgehalten hat. `stale` zeigt eine veraltete Clientversion.
- **Abweichung vom Bericht (A.2):** Der Herzschlag steckt nicht mehr in `instance_view`, sondern in `heartbeat` (schreibend), weil die Ansicht nichts verändern darf. Der Client ruft beides auf.
- Platzhalter (Balance, nicht festgelegt): HP-Anteil der Nachrücker (50 %) und der zurückkehrenden Toten (10 %) in `nextFight`.

## Alte Testprofile (legacy.mjs) sind vom regulären Pfad getrennt

`legacy.mjs` bleibt ausschließlich als eingefrorene Regressionsreferenz (12 Referenzkämpfe, Kernregeltests, Determinismus-Kette, `run-dungeon --team legacy`). `newFight`, `resolveRound` und `resolveClaim` lehnen Referenzprofile ab, solange `enableLegacyReference()` nicht aufgerufen wurde. Das tun nur `tests/golden.mjs`, `tests/combat.mjs`, `tests/determinism.mjs` und `sim/run-dungeon.mjs` (nur mit `--team legacy`). `start_fight` in der Datenbank lehnt sie ebenfalls ab. `tests/trennung.mjs` prüft das und die erlaubten Importe im Quelltext.

## Offene Kampfregeln (Status, belegt durch `tests/offen.mjs`)

| Nr. | Punkt | Planregel | Ist | Status | Nächster Schritt |
|---|---|---|---|---|---|
| E1 | Energie und Ressourcenverbrauch | bei Bestätigung reservieren, bei Ausführung abbuchen, bei Verfall erstatten, Regeneration am Rundenbeginn | Engine kennt keine Energie | offen | Energiefeld, Kosten je Fähigkeit, Reservierung in `submit_action`, Erstattung bei Verfall; Zahlen sind Balance |
| D1 | DoT-Zeitpunkt | Ticks zu Beginn der Runden N+1 … N+D, vor allen Aktionen | Ticks am Rundenende | offen | Tick-Schritt an den Rundenanfang verlegen (ändert die Referenzkämpfe, neue Referenz nötig) |
| D2 | Anwendungsrunde | löst nie aus, genau D-mal | tickt schon in der Anwendungsrunde | offen | mit D1 beheben |
| D3 | Reihenfolge | Regeneration, Gift, Blutung, Brennen, je Gruppe nach Teilnehmer | Reihenfolge der Anwendung | offen | feste Reihenfolge einführen |
| B1 | Brennen-Sprung | Stapel gehen auf einen zufälligen anderen lebenden Gegner über, nicht von Bossen | nicht umgesetzt | offen | Sprung mit eigenem Zufallsstrom |
| T1 | Bossansage | Ansage mit Ziel und Wirkung am Rundenbeginn | Ansage ohne Ziel | offen | Ziel am Rundenbeginn wählen und in der Ansage speichern |
| T2 | Bossziel und Bedrohung | im Plan nicht geregelt | Prototyp: Bedrohung plus 25 % Zufall | Entscheidung nötig | Regel festlegen, bevor sie umgesetzt wird |
| H1 | Heil- und Schildregeln | nie über Maximum, höherer Wert gilt, Obergrenze 35 % | wie Regel | erfüllt | – |
| H2 | Heil-/Schild-/Regenerationswerte, Trank, Rückkehr-HP, Nachrücker-HP | Balance | Platzhalter | Balance offen | Zahlenbalance |
| W1 | Wipe-Wiederaufnahme | läuft genau an der angehaltenen Stelle der Auflösung weiter | eigener Zwischenschritt (Pseudo-Runde) | offen | Auflösungsposition speichern und fortsetzen |

Weitere bekannte Lücken: Beitrags- und Teilnahmeschwellen für Beute und Abschlussbelohnung (Balance) sind nicht modelliert. Entfernte Mitglieder erhalten die Abschlussbelohnung vorsichtshalber nicht, bis die Schwelle feststeht. Heiltränke sind als Zähler vorhanden, ihre Wirkung im Kampf noch nicht. Profilableitung bei Bereitschaft (Bericht L) und Edge Function sind Phase 2.

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
| Gruppenverwaltung (Beitritt, Warteliste, Nachrücken, Bereitschaft, Austritt, Entfernung, Abbruch) und `instance_view` (157) | `node server/instance/tests/gruppe.mjs` |
| Eventende-Semantik: `completed_at < ends_at` zählt, Commit darf später folgen; konkurrierende Transaktionen, Ansicht „ending“, kein Sieg/keine Belohnung nach dem Ende (27) | `node server/instance/tests/semantik.mjs` |
| Produktionssicherheit: Spieleridentität und Rechte mit echten Rollen anon/authenticated/service_role, Modus neu und legacy (214) | `node server/instance/tests/produktion.mjs` |
| Trennung der alten Testprofile vom regulären Engine-Pfad (12) | `node server/instance/tests/trennung.mjs` |
| Statusliste offener Kampfregeln, an echtem Engine-Verhalten belegt (10 Proben) | `node server/instance/tests/offen.mjs` |
| Todesfenster, Annahme in Zeit, Wipe-Halt, Niederlage nach Ablauf, Gruppenpause, Eventende je Eingangsfunktion (39) | `node server/instance/tests/fenster.mjs` |
| Datenbank-Tests: Claim, Commit, Lease, Eventende, Störungsfenster, Aktion, Watchdog (43) | `node server/instance/tests/run.mjs` |
| K.2 Regel 4a–4d: Watchdog-Sperrreihenfolge, interne Sweeps (SKIP LOCKED), Endzustand nach Eventende, keine Anlage nach Eventende, parallele Rennen (32) | `node server/instance/tests/eventende.mjs` |
| K.2-Vergleich der Eventende-Varianten | `node server/instance/tests/k2-compare.mjs old\|eigene\|skip 30 [nosweep]` |
| Gleiches Ergebnis in Node, Bun, Deno (Phase-0-Engine und Engine v1 mit echten Teams, Wiederbelebung, Ausfall, Austritt) | `bash server/instance/tests/run-determinism.sh` |

Voraussetzung: Node 22, PostgreSQL-Binaries (`initdb`, `pg_ctl`, `psql`, `pgbench`) und pgcrypto. CI: `.github/workflows/instance-tests.yml`.


## Gruppenverwaltung und instance_view (sql/04_gruppe.sql)

- **Anlegen/Beitritt:** `create_group(kind, players, fights_total, event, ends_at)`: **feste Größen je Typ**, keine Parameter dafür (und eine Prüfregel `instances_size_rule` in der Tabelle): `dungeon` (normal) **2–4**, `special` (besonders) 6–8, `weltboss` 6–8. Die Obergrenze gilt an drei Stellen: in `create_group`, in der Tabellenregel `instances_size_rule` und im Tabellenwächter `members_size_guard` (ein Constraint-Trigger auf `members`). Damit kann auch ein direkter SQL-Aufruf (`insert`, `update`, `promote_waitlist`) nie mehr aktive Spieler erzeugen als `max_size`. Normale Ein-Kampf-Dungeons werden ausdrücklich abgelehnt (`single_fight_dungeon`); Weltboss braucht genau einen Kampf, Event und Endzeit; besondere Dungeons dürfen einen Kampf haben (Annahme). Zugang erst ab Level 5 mit Grundklasse. `join`: Mehrkampf-Dungeon immer über die Warteliste, Aufnahme **nur in der Bereitschaftsphase**, in Reihenfolge, bis zur Höchstgröße. Während eines Kampfes nur Warteliste, nie Teilnahme am laufenden Kampf. Weltboss (Typ) und Einkampf-Instanzen: Beitritt nur vor dem Start, kein Nachrücken, keine Warteliste. Im letzten Kampf kein Beitritt mehr.
- **Kein Wiederbeitritt** nach Austritt oder Entfernung (eindeutiger Index je Spieler und Instanz). Nachrücker erhalten 3 eigene Heiltränke, nie rückwirkende Ansprüche.
- **Bereitschaft:** `set_ready` (nicht widerrufbar, bleibt bei Trennung). Verbundene: 60 s, danach automatische Entfernung („bereitschaft“). Getrennte: Frist ruht, 60 s ab Wiederverbindung. `start_fight` startet erst, wenn alle bereit sind, prüft atomar das Eventende und lehnt Referenzprofile und abweichende Teilnehmerlisten ab.
- **Fristen werden serverseitig unter der Instanzsperre geprüft** (`enforce_deadlines`, Zeit = `clock_timestamp()` nach der Sperre), nie vom Worker abhängig: `set_ready` nach Ablauf von `ready_due` lehnt ab und entfernt; eine Wiederverbindung nach 5 Minuten entfernt, statt `disc_since` zurückzusetzen; Störungsfenster zählen nicht. Der Worker (`group_tick`) nutzt dieselbe Logik, parallele Aufrufe ergeben genau ein Ergebnis.
- **Fristenregeln an einer Stelle:** `deadline_verdict(instance, player, t)` entscheidet (Ready-Frist, Abwesenheit, Störungsfenster) und ändert nichts. Zwei dünne Hüllen führen aus: `enforce_deadlines` (Clientweg: `set_ready`, Wiederverbindung, `heartbeat`; wertet Mindestgröße/Nachrücken sofort aus) und `enforce_deadlines_quiet` (Workerweg: `group_tick`; wertet einmal nach allen Entfernungen einer Instanz aus).
- **Heartbeat:** `heartbeat(instance)` hat weder Zeit- noch Spielerparameter; Identität aus der Sitzung (`request.jwt.claim.sub`, in Produktion `auth.uid()`), Zeit nur serverseitig, Anwesenheit und Verbindungsstatus in einer Transaktion.
- **Abwesenheit:** 5 Minuten ununterbrochen getrennt → automatische Entfernung („abwesenheit“), Störungsfenster zählen nicht. In der Bereitschaftsphase keine Gruppenpause.
- **Mindestgröße:** reine Startbedingung. Freiwilliger Austritt darf darunter fallen (nur „niemand mehr da“ beendet). Jede automatische Entfernung mit Ergebnis unter der Mindestgröße → Instanz „aborted“.
- **Ansprüche (Tabelle `entitlements`):** Kampf-EP und Beute je Kampf nur für Beteiligte. Freiwilliger Austritt: noch ausstehende Beute entfällt, Kampf-EP bleiben. Automatische Entfernung: verdiente Ansprüche bleiben. Wer während eines Kampfes ausscheidet, hat daraus keinen Anspruch. Abschlussbelohnung nur bei Sieg der gesamten Instanz: verbliebene Mitglieder ja, freiwillig Ausgetretene nein, automatisch Entfernte nur bei Beitrag im letzten Kampf (`contribution ≥ contribution_min`; **Platzhalter 1 ausgeführte Aktion, Balance offen**).
- **`instance_view`:** `STABLE`, schreibt nichts. Nur Mitglieder (volle Sicht), Wartende (Platz) und Ausgeschiedene (nur eigener Status). Fremde und unbekannte Instanzen sind nicht unterscheidbar. Fremde Aktionen nur als „bestätigt ja/nein“. Das Eventende gilt in der Antwort sofort, auch wenn der Watchdog es noch nicht festgehalten hat. `stale` zeigt eine veraltete Clientversion.
- **Abweichung vom Bericht (A.2):** Der Herzschlag steckt nicht mehr in `instance_view`, sondern in `heartbeat` (schreibend), weil die Ansicht nichts verändern darf. Der Client ruft beides auf.
- **Eventende (K.2 Regel 4a–4d, `sweep_core`, `end_instance`, `create_group`):** Der Watchdog (`sweep_events`) sperrt blockierend und global aufsteigend nach Instanz-ID über alle Events. Interne Aufrufe (`sweep_event(event, true)`) nutzen `SKIP LOCKED` und warten nie. Der Endzustand (`status`, `stage = 'done'`, `outcome = 'event_ended'`, Kämpfe, Aufträge, Fenster, Warteliste `cancelled`) entsteht in einer Anweisung; die Tabellenregel `instances_event_end_state` verbietet Zwischenzustände. Danach keine Fristen, Entfernungen, Belohnungen. `create_group` lehnt Events ab, deren Endzeit erreicht ist (`event_ended`) oder deren Endzeit von bestehenden Instanzen abweicht (`event_mismatch`); die Anlage je Event ist serialisiert, die Zeit wird erst nach der Sperre genommen.
- **Einkampf-Erkennung:** In `join` zählt nur `fights_total = 1`. Der Weltboss ist per Tabellenregel `instances_weltboss_rule` immer eine Einkampf-Instanz mit Event und Endzeit, eine zusätzliche Prüfung auf `kind` wäre dort wirkungslos. Normale Ein-Kampf-Dungeons lehnt nur `create_group` ab, die Tabelle erlaubt sie (ältere Testinstanzen haben `fights_total = 1`).
- **Sicherheitsgrenze (Phase 1 umgesetzt, siehe `docs/INSTANZKAMPF_SICHERHEIT_PHASE1.md`):** Alle Funktionen mit übergebener Spieler-ID (`join`, `leave`, `set_ready`, `submit_action(_for)`, `instance_view`, `heartbeat(_for)`, `use_/decline_revive_item`) sind **Testfunktionen**: für anon, authenticated und service_role entzogen. Clients erreichen die Gruppenfunktionen nur über die Wrapper `public.group_join|leave|ready|heartbeat|view|action|revive_use|revive_decline` (Identität aus `auth.uid()` und `public.characters`, nie als freier Parameter). `create_group` und alle Worker-Funktionen sind nur für `service_role`. `sql/05_produktion.sql` setzt das um; nur lokal getestet (`tests/produktion.mjs`), nicht auf einer echten Supabase-Instanz.
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

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
| Todesfenster, Annahme in Zeit, Wipe-Halt, Niederlage nach Ablauf, Gruppenpause, Eventende je Eingangsfunktion (39) | `node server/instance/tests/fenster.mjs` |
| Datenbank-Tests: Claim, Commit, Lease, Eventende, Störungsfenster, Aktion, Watchdog (43) | `node server/instance/tests/run.mjs` |
| K.2-Vergleich der Eventende-Varianten | `node server/instance/tests/k2-compare.mjs old\|eigene\|skip 30 [nosweep]` |
| Gleiches Ergebnis in Node, Bun, Deno (Phase-0-Engine und Engine v1 mit echten Teams, Wiederbelebung, Ausfall, Austritt) | `bash server/instance/tests/run-determinism.sh` |

Voraussetzung: Node 22, PostgreSQL-Binaries (`initdb`, `pg_ctl`, `psql`, `pgbench`) und pgcrypto. CI: `.github/workflows/instance-tests.yml`.

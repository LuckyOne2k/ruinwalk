# Instanzkampf – isolierter Prototyp (Phase 0/1)

Vollständig getrennt vom Spiel: eigenes Schema `rwi` in einem **temporären lokalen Postgres**, keine Spielerdaten, keine Verbindung zu Supabase, `index.html` unberührt.
Alle Inhalte (Klassen, Boss, Zahlen) sind **Testwerte**, keine Spielbalance.

| Was | Befehl |
|---|---|
| Kompletter Dungeon-Kampf (4 Testspieler gegen Boss, echte Auftragskette) | `node server/instance/sim/run-dungeon.mjs --seed 3` |
| …mit Weltboss-Eventende mitten im Kampf | `… --weltboss-ende` |
| …andere Gruppen | `… --team 3 \| noheal \| notank` |
| Engine-Tests (38) | `node server/instance/tests/combat.mjs` |
| Datenbank-Tests: Claim, Commit, Lease, Eventende, Störungsfenster, Aktion, Watchdog (43) | `node server/instance/tests/run.mjs` |
| K.2-Vergleich der Eventende-Varianten | `node server/instance/tests/k2-compare.mjs old\|eigene\|skip 30 [nosweep]` |
| Gleiches Ergebnis in Node, Bun, Deno | `bash server/instance/tests/run-determinism.sh` |

Voraussetzung: Node 22, PostgreSQL-Binaries (`initdb`, `pg_ctl`, `psql`, `pgbench`) und pgcrypto. CI: `.github/workflows/instance-tests.yml`.

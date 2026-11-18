---
name: ruinwalk-instanzkampf
description: Schutzregeln, Invarianten und Prüfliste für die Instanzkampf-/Dungeon-Architektur von Ruin Walk (server/instance, Schema rwi, Gruppen, Rundenkampf-Engine, Watchdog, Eventende, Belohnungen). PFLICHT vor jeder Änderung, Analyse oder Planung in server/instance/ oder an Gruppen-, Dungeon-, Weltboss- oder Mehrspielerlogik.
---

# Instanzkampf – geschützte Architektur

Maßgeblich: `docs/INSTANZKAMPF_ARCHITEKTURBERICHT_V2.md` (Fassung 2.1, gilt vor Fassung 1), `docs/INSTANZKAMPF_SICHERHEIT_PHASE1.md`, `server/instance/README.md`.
Status: lokaler Prototyp (Freigabephase 0/1), **nicht live, nicht im Client**. Alle Zahlen sind Testwerte.

## Eingefroren (Änderung nur mit ausdrücklicher Freigabe von Pascal)
1. **Schichtentrennung:** `advance_clock` (SQL) = nur Wanduhr-Regeln, berechnet nie Kampfergebnisse · Engine `resolveRound` = nur Kampfregeln, rein, liest keine Uhr, kein `Math.random`/`Date.now` · `commit_round` (SQL) = prüft Invarianten und speichert atomar.
2. **Ein Auftragsweg:** Nur die Datenbank löst Runden aus (`dispatch_if_due` aus Aktion, Herzschlag, Watchdog). Clients rufen nie eine Edge Function oder `claim_resolution`/`commit_round`.
3. **Claim, Token, Lease**, Eindeutigkeit `resolve_jobs (fight_id, round_no)` und `round_results`, `round_version` ändern nur Claim und Commit.
4. **Deterministischer Zufall** aus Seed, Strom, Kampf, Runde, Ziehungsnummer (`engine/rng.mjs`); identisch in Node, Bun, Deno. Kein gespeicherter Zähler.
5. **Belohnungen** mit Lease und `ack`, ehrliche Garantien (keine Exactly-once-Behauptung).
6. **Whitelist-Profil** und Profilableitung bei Bereitschaft (Bericht B, L).
7. **Absolutes Weltboss-Eventende** (K.2): `ends_at` unveränderlich, nie pausierbar, Prüfung mit `clock_timestamp()` **nach** der Zeilensperre, Eventende ist keine Niederlage, Commit nach `ends_at` erzeugt weder Sieg noch EP, Watchdog sperrt global aufsteigend nach Instanz-ID, interne Sweeps nur `SKIP LOCKED`, Endzustand unteilbar (Tabellenregel `instances_event_end_state`).
8. **Freigabephasen 0–3** (O.2).

## Sicherheitsgrenze (Phase 1)
- Clients nur über `public.group_*`-Wrapper. Identität aus `auth.uid()`, Spielerschlüssel = eigene `character_id`, nie freier Spielerparameter.
- Schema `rwi` für anon/authenticated unerreichbar. Funktionen mit Spielerparameter sind Testfunktionen ohne EXECUTE für irgendeine Rolle.
- **Jede neue `rwi`-Funktion** muss in `sql/05_produktion.sql` genau einer Klasse (`server`, `test`, `trigger`, `intern`) zugeordnet werden – sonst scheitert das Skript absichtlich.
- Gruppengrößen fest an drei Stellen: `create_group`, Tabellenregel `instances_size_rule`, Trigger `members_size_guard` (dungeon 2–4, special 6–8, weltboss 6–8).
- Fristen (`deadline_verdict`) nur serverseitig unter der Instanzsperre; Herzschlag ohne Zeit- oder Spielerparameter.

## Vor jeder Änderung – Prüfliste
1. Betroffene Abschnitte im Bericht V2 lesen (A Watchdog, B Profil, C Belohnung, D Disconnect, E Atomarität, F Störungsfenster, K Eventende).
2. Ist ein eingefrorener Punkt betroffen? → Stopp, Pascal mit Begründung fragen.
3. Ist es eine offene Kampfregel (E1, D1–D3, B1, T1, T2, H2, W1)? → Status in `server/instance/README.md` beachten; D1/D2 ändern Referenzkämpfe → neue Golden-Referenz nötig und begründen.
4. Engine-Änderung: Determinismus prüfen (Node/Bun/Deno), `golden.mjs` darf sich nur bewusst ändern.
5. SQL-Änderung: Sperrreihenfolge (eine kurze Sperre je Vorgang, nie über Berechnung/HTTP), `clock_timestamp()` nach Sperre, Rechteklasse, Tabellenregeln.
6. Legacy-Profile bleiben vom regulären Pfad getrennt (`trennung.mjs`).

## Pflichttests nach Änderungen
```bash
bash server/instance/tests/run-determinism.sh          # REQUIRE_RUNTIMES=node reicht lokal, CI prüft node bun deno
node server/instance/tests/golden.mjs && node server/instance/tests/combat.mjs
node server/instance/tests/struktur.mjs && node server/instance/tests/trennung.mjs && node server/instance/tests/offen.mjs
# Datenbank (braucht initdb/pg_ctl/psql/pgbench + pgcrypto):
node server/instance/tests/run.mjs && node server/instance/tests/fenster.mjs && node server/instance/tests/gruppe.mjs
node server/instance/tests/eventende.mjs && node server/instance/tests/semantik.mjs && node server/instance/tests/produktion.mjs
node server/instance/tests/k2-compare.mjs skip 15
for s in 3 4 5; do node server/instance/sim/run-dungeon.mjs --seed $s --ruhig || exit 1; done
```
Reproduzierbarkeit: zwei Läufe `run-dungeon.mjs --seed 3` müssen identische Ausgabe liefern (md5).

## Was nicht behauptet werden darf
Nicht auf echter Supabase geprüft: `auth.uid()`-Verhalten, Nicht-Exposition von `rwi`, Eigentümerrolle, Latenzen, pg_cron/pg_net-Tarif. Bei Berichten immer „lokal getestet“ sagen.

# Architektur und Verzeichnisse

## Verzeichnisstruktur

```
index.html            Das Spiel (HTML+CSS+JS inline, ~3.100 Zeilen). Leaflet 1.9.4 von unpkg.
landingpage.html      Öffentliche Landingpage („The Forgotten World“), Farben Gold/Dunkelbraun, Cinzel + Crimson Text
sprites*.js, pxdom.js Pixel-Sprites (Charaktere, Figuren, Ausrüstung, Items, Monster, Fähigkeiten)
figs/                 Klassen-/Pfadfiguren (PNG, z. B. ritter.png, ritter_base.png, ritter_down.png), figs/lay/ Ebenen (deaktiviert)
items/                ~560 Item-Bilder (z. B. w_schwert_1.png)
status/               11 Status-Icons (gift, feuer, betaeubt, …)
assets/               logo.png, bg_login.jpg, bg_chars.jpg, bg_create.jpg
supabase/             schema.sql, migration_d3_*.sql, rollback_d3_*.sql, tests/ (SQL-Tests mit Supabase-Attrappe)
server/instance/      Instanzkampf-Prototyp: engine/ (rng, v1, legacy, content), sql/01–05, sim/, tests/
tests/                Playwright-Tests des Spiels (run.js, harness.js, cases/*.js, fake_supabase.js)
tools/                Python-Hilfen (Status-Icons erzeugen, Editor-Tests bauen)
docs/                 Berichte, Pläne, Spezifikationen (siehe docs-index.md), docs/ki-team/ = KI-Team
marketing/            Marketing-Wissensbasis, Kalender, Vorlagen, Meta-Anbindung, Freigaben
.claude/              Agenten, Skills, Hooks, Einstellungen des KI-Teams
.github/workflows/    pages.yml (Deploy main → GitHub Pages, ohne Tests), instance-tests.yml (alle Tests)
```

## Client (`index.html`)

- Zentrale Bezeichner: `S` (Spielstand), `def()`/`sanitize()` (Standardstand/Bereinigung), `save()` (mit `_bak`/`_corrupt`), `KEY`/`ACTIVE` (aktiver Charakter lokal oder Cloud).
- Welt: `cellEnts` (Zelle 165 m), `areaEnts`, `REGION` (12×12 Zellen), `worldBand`/`effBand` (Gebietsstufe), `habAt`/`HAB` (Lebensräume aus Overpass/OSM, Ersatz `fbHab`), `mulberry` (deterministischer Zufall der Welt).
- Kampf (Echtzeit): `strike`, `useSkill`, `roamTick`, `monsterHit`, `bossTick`/`bossResolve`/`reactDo`, `faint`, `usePotion`. Zufall über `Math.random()` (kein Seed).
- Klassen: `CLASSES`, `PATHS`, `UP_LV=[15,30,50]`, `CLASS_LV=5`, `effClass`, `SECRET`, `UPQ`.
- Items: `ITEMS`, `GT`, `CW`, `ARMT`, `SETS`, `SB`, `RECIPES`, `GR`, `craftGear`, `UPCH`, `UPFEE`, `gVal`, `shopInfo`.
- Cloud: `sbFetch`/`sbAuthed`, Sync-Modul `SY` (`syncTick/syncPush/syncFlush/syncAdopt`), `readMeta/writeMeta`, Konfliktdialog, Tab-Sperre.
- Supabase-Zugang: `SB_URL` + `SB_KEY` (Publishable Key, öffentlich, unkritisch). Nie `service_role` im Client (Test prüft das).

## Backend (Supabase)

- Projekt `ruinwalk` (`malbiahllucctiafzydv`), Region eu-central-1, Postgres 17. Genutzt: Auth (E-Mail/Passwort) + PostgREST-RPCs. Keine Edge Functions, kein Realtime.
- Erweiterungen installiert: pgcrypto, supabase_vault, pg_stat_statements, uuid-ossp. Verfügbar, nicht installiert: pg_cron, pg_net (in D3 entfernt), pgmq, pg_jsonschema.
- Kein Supabase-CLI-Projekt (`supabase/config.toml` fehlt). Schema als `schema.sql`, Änderungen als handgeschriebene `migration_*.sql` + `rollback_*.sql`.

## Instanzkampf-Prototyp (`server/instance/`)

- Schichten (eingefroren, Bericht V2 A.1): `advance_clock` (SQL, nur Wanduhr-Regeln) · Engine `resolveRound` (rein, deterministisch, kein `Date.now`/`Math.random`) · `commit_round` (SQL, prüft und speichert atomar).
- Auslösung nur durch die Datenbank (geplant `pg_net`), nie durch Clients. Auftragstabelle `resolve_jobs` unique (fight_id, round_no). Claim + Lease + Token.
- Zufall: aus Seed, Strom, Kampf, Runde, Ziehungsnummer (`engine/rng.mjs`). Gleiches Ergebnis in Node, Bun, Deno.
- Clientzugang nur über `public.group_*`-Wrapper (Identität aus `auth.uid()` + Charakter-Eigentum). Schema `rwi` für anon/authenticated unerreichbar.
- Engine `v1.mjs` (echte Klassenstruktur), `legacy.mjs` nur als eingefrorene Referenz (`enableLegacyReference()`).
- Details und Invarianten: Skill `ruinwalk-instanzkampf`.

## Deployment

- `pages.yml`: jeder Push auf `main` deployt das ganze Verzeichnis nach GitHub Pages – **ohne** Testlauf. Daher: nie ungetestet auf `main` pushen.
- `instance-tests.yml`: läuft bei Änderungen an `server/instance/**`, `supabase/schema.sql`, `supabase/tests/00_stub.sql` (Jobs: determinism, database, bestehende-tests).

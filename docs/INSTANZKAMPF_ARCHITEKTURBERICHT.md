# Ruinwalk – Technischer Architekturbericht: Instanzkampfsystem

Stand: 16.11.2026 · Repository-Stand: Commit `0392290` (sauber) · Grundlage: `INSTANZKAMPF_PLAN.md`, `index.html` (3.108 Zeilen), `supabase/schema.sql`, `tests/`, `docs/`, Live-Stand des Supabase-Projekts `ruinwalk` (nur lesend abgefragt).
Nur Analyse und Planung. Nichts wurde im Repository geändert oder implementiert. Dieser Bericht liegt bewusst **außerhalb** des Repositorys.

**Kennzeichnung:** **[V]** vorhanden (im Code belegt) · **[E]** Erweiterung von Vorhandenem · **[N]** komplett neu · **[A]** technische Annahme · **[U]** nicht durch den Code belegbar.

---

## 1. Zusammenfassung der bestehenden Architektur

- **Client [V]:** Das gesamte Spiel ist **eine Datei**, `index.html` (269 KB, ein Inline-Skript, keine Module, kein Build). Dazu `sprites*.js`, `pxdom.js`. Auslieferung über GitHub Pages (`.github/workflows/pages.yml` lädt nur das Verzeichnis hoch, **ohne Tests**).
- **Backend [V]:** **Supabase** (Projekt `ruinwalk`, Region eu-central-1, Postgres 17, Status ACTIVE_HEALTHY). Genutzt werden Auth (E-Mail/Passwort) und Postgres über PostgREST. Der Client spricht über `sbFetch`/`sbAuthed` (Z. 2089–2122) mit `/auth/v1/…` und `/rest/v1/rpc/…`. **Keine Edge Functions** deployt, **keine Realtime-Nutzung** im Client.
- **Datenbank [V]:** 6 Tabellen (`profiles`, `account_entitlements`, `payment_events`, `characters`, `character_backups`, `audit_log`), überall RLS, Clients nur `SELECT`; Schreiben nur über `SECURITY DEFINER`-Funktionen (`create_character`, `save_character`, `list_characters`, `move_character`, `delete_character`, `delete_account`, `touch_login`). Versionsprüfung `version`/`p_expected_version` (SQLSTATE `PT409`).
- **Spielerdaten [V]:** Der gesamte Spielstand (Level, Inventar, Ausrüstung `gear`/`eq`, Münzen `cu`, XP, Status) liegt als **ein JSON-Dokument** `characters.character_data` (< 1 MB). Es wird **vom Client** erzeugt und gespeichert (`save` Z. 925, `syncPush` Z. 2508). Der Server prüft nur: JSON-Objekt, Größe, Version; er leitet `character_class` und `level` ab (`safe_class`, `safe_level`).
- **Kampf [V]:** Alle Kampfberechnungen laufen **ausschließlich im Browser** und in Echtzeit (`strike` Z. 1550, `useSkill` Z. 1650, `roamTick` Z. 1261, `monsterHit` Z. 1330, `bossTick`/`bossResolve`/`reactDo` Z. 1467–1548, `usePotion` Z. 1711). Es gibt **keine serverseitige Kampfberechnung**. Mehrspieler ist nur ein Platzhalter (`othersInFight()` liefert immer 0, Z. 1617).
- **Zufall [V]:** 20-mal `Math.random()` im Client, kein Seed. `mulberry` (Z. 985) existiert nur für die deterministische Weltgenerierung.
- **Tests [V]:** (a) Playwright/Chrome-Tests gegen das echte `index.html` (`tests/run.js`, 20 Dateien in `tests/cases/`, Schnittstelle `window.__RW` nur im Testmodus), laut Commit-Historie zuletzt 219 grün; (b) **echte PostgreSQL-Tests** mit Supabase-Attrappe (`supabase/tests/run.sh`, `10_tests.sql`, laut `docs/ACCOUNT_BACKEND.md` 168 Prüfungen, beide Rechte-Modi).

**Live-Stand der Supabase-Erweiterungen (gelesen):** installiert u. a. `pgcrypto`, `supabase_vault`, `pg_stat_statements`, `uuid-ossp`. **Verfügbar, aber nicht installiert:** `pg_cron` (1.6.4), `pg_net` (0.20.4), `pgmq`, `pg_jsonschema`. Das heißt: geplante Aufgaben und HTTP-Aufrufe aus der Datenbank sind möglich, müssen aber erst aktiviert werden **[A: im aktuellen Tarif erlaubt, nicht geprüft]**.

**Zentrale Erkenntnis:** Der Server ist heute nur ein **gesicherter Dokumentenspeicher**. Der Instanzkampf braucht erstmals **Spiellogik auf dem Server**. Das ist der größte Schritt des Projekts und der Grund für die Architektur in den Abschnitten 4–7.

---

## 2. Relevante Dateien und Funktionen

| Bereich | Fundstelle | Zweck | Für Instanz |
|---|---|---|---|
| Klassen/Fähigkeiten | `CLASSES` Z. 692, `PATHS` Z. 726, `UP_LV` Z. 725, `effClass` Z. 817 | 4 Klassen, 12 Pfade, 50 Fähigkeiten | Datenquelle [V] |
| Ausrüstungswerte | `getBase` Z. 477, `gStats` Z. 506, `SB` Z. 511, `SETD`, `SETS`, `gs` Z. 546 | Basiswerte, Qualität/Upgrade, Set-Boni | wiederverwendbar mit Anpassung |
| Kampfwerte | `maxHP`, `defense`, `atk`, `critCh` (Z. 945–948) | HP/Verteidigung/Angriff/Krit | Formeln kopierbar, lesen aber globales `S` |
| Spielerangriff | `strike` Z. 1550 | Schaden, Krit, Heilung, Beute, XP, UI, Speichern in einer Funktion | **nicht** übernehmbar |
| Fähigkeit | `useSkill` Z. 1650 | Energie, Abklingzeit (Sekunden), Wirkung | nur Datenfelder |
| Monsterangriff | `monsterHit` Z. 1330 | Rohschaden `rnd(min,max)`, Rüstung, Mindestschaden 25 % | Formel kopierbar |
| Boss | `BFX` Z. 1467, `bossResolve`, `reactDo`, `bossTick` | Echtzeit-Telegraphen | nicht übernehmbar (Echtzeit) |
| Tränke | `usePotion` Z. 1711, `potHeal` | Heilung `40 + 10 % maxHP`, Reinigung | Formel kopierbar |
| Status-Anzeige | `FX` Z. 2818, `playerFx`, `mobFx`, `fxChip`, `status/*.png` (11 Icons) | Status-Chips | Muster wiederverwendbar |
| Beute/Münzen | `rollGear` Z. 583, `rollSet`, `COIN` Z. 668, `earn` Z. 690, `addGear`, `addXP` Z. 954 | Beute, Münzen, XP | **nicht** übernehmbar (Client-Zufall, klassengebunden) |
| Speichern | `sanitize` Z. 842, `tryLoad`, `save`, `def` | Spielstand-Bereinigung | Client bleibt Besitzer des Dokuments |
| Cloud | `syncPush` Z. 2508, `syncTick`, `syncFlush`, `acPlay` Z. 2408, `tlBeat` Z. 2745 (Tab-Sperre), `authBoot` Z. 2760 | Sync, Konflikte, Einzel-Tab-Besitz | Muster für Wiederverbindung |
| Auth | `sbFetch`, `sbAuthed`, `authRefresh` | Token, Refresh | direkt nutzbar [V] |
| Server | `supabase/schema.sql` | Tabellen, RPC-Muster, Rechte | Muster für neue Funktionen |
| Tests | `tests/harness.js`, `tests/util.js`, `tests/cases/combat.js`, `status.js`, `supabase/tests/*` | Regression Echtzeit + SQL | Basis für Testplan |

---

## 3. Wiederverwendbare Kampfmechaniken

**Grundsatz:** Der Echtzeitkampf wird **nicht angefasst, nicht umgebaut und nicht ausgelagert**. `strike`, `useSkill`, `monsterHit`, `usePotion`, `bossTick` bleiben unverändert in `index.html`. Der Instanzkampf **kopiert Formeln und Daten** in ein eigenes, reines Modul (Zielzustand: Server), statt sie aus dem Client zu extrahieren. Grund: Die Funktionen sind mit `S`, `sel`, `P`, `eng`, `toast`, `save`, `Date.now()` und `Math.random()` verwoben. Eine Zerlegung wäre ein Umbau des Echtzeitkampfs und damit ein Regressionsrisiko, das der Auftrag ausschließt.

| Element | Status | Vorgehen |
|---|---|---|
| Daten `CLASSES`, `PATHS`, Fähigkeitsfelder (`mult`, `hits`, `crit`, `heal`, `perLv`, `healPct`, `shield`, `stun`) | [V] rein als Daten | Aus `index.html` in Server-Konfiguration überführen, per **Vertragstest** gegen den Client abgleichen (siehe 13) |
| `getBase`/`gStats`/Set-Tabellen `SETD`/`SETS` | [V] rein, aber groß | In das Server-Modul kopieren, Parameter statt globalem `S` |
| `SB()` (Set-Boni) | [V] liest `S.eq`, `S.gear` | kopieren, Ausrüstung als Parameter |
| `maxHP`, `defense`, `atk`, `critCh` | [V] lesen `S.lv`, `C0()` | kopieren mit Profil-Parameter |
| Schadensformel (`(atk+rnd(0,8))·mult·fm`, Krit `×(2+critDmg)`, Mehrfachtreffer) | [V] in `strike` | kopieren; `fm = 1 + dm + …` ist laut Plan die gemeinsame additive Summe (auch Stärkung) |
| Monsterschaden (`max(1, ceil(raw·.25), raw−def)`) | [V] in `monsterHit` | kopieren; Plan 2.2: Rüstungsschwächung senkt erst die Verteidigung |
| Trank (`40 + 10 % maxHP`) | [V] | kopieren, Reinigungsregeln laut Plan |
| Status-Chips/Icons (`FX`, `status/*.png`) | [V] | Muster für den Instanz-Client; Icons vorhanden für Gift, Feuer(=Brennen), Betäubt, Schutz(=Schild) |
| Erschöpfung, Anfängerschutz, Aggro/Leine, GPS-Reichweite | [V] | **nicht** relevant (Echtzeit/Welt) |
| Boss-Telegraphen/Abwehr/Unterbrechen (`BFX`) | [V] Echtzeit | **nicht** übernehmbar. Instanzbosse folgen den Regeln aus Plan Abschnitt 3 |

**Fähigkeiten-Bausteine (aus dem Code gezählt, 50 Fähigkeiten):** 39 mit Schaden (`mult`), 10 mit Mehrfachtreffern, 5 mit erzwungenem Krit, 10 mit Betäubung, 7 mit Schild, 9 mit fester Heilung (3 mit `perLv`), 6 mit Prozentheilung, 2 mit Reichweitenbonus (entfällt laut Plan), 11 ohne Schaden, 9 `self`. Die Bausteine decken sich mit der Zuordnung im Plan (Abschnitt 4 „Heute → Instanz“).

**Bewusst nicht wiederverwendet:** Beute, Münzen und XP (`rollGear`, `earn`, `addXP`). Sie nutzen Client-Zufall und binden Beute an die Klasse des Spielers. Der Plan verlangt serverseitige, seed-basierte Pools.

---

## 4. Notwendige neue serverseitige Systeme

Alle **[N]**, mit Ausnahme der genannten Muster.

1. **Instanz- und Mitgliederverwaltung** (Tabellen + SQL-Funktionen), Muster: `save_character` (Zeilensperre `FOR UPDATE`, Versionsprüfung).
2. **Fristen- und Präsenzlogik** (Gruppenpause, 5-Minuten-Abwesenheit, Bereitschaft 60 s, Event-Ende) als **zeitstempelbasierte** Auswertung in SQL.
3. **Kampfengine** (Rundenauflösung): reine Funktion `resolveRound(state, actions, seed) → (state', events)`.
4. **Datengetriebene Konfiguration** (Fähigkeiten, Status, Gegner, Begegnungen, Dungeons, Beutepools).
5. **Beute- und Belohnungsbuchung** (Ledger mit Idempotenzschlüsseln, Belohnungseingang).
6. **Matchmaking** (globale Warteschlange, Gruppenbildung).
7. **Weltboss-Events** (UTC-Zeitraum, Gruppeninstanzen).
8. **Watchdog** (`pg_cron`) für Instanzen, die niemand mehr aufruft.

### Entscheidung: Wo läuft die Engine? (technische, keine Design-Entscheidung)

| Kriterium | A: Engine in PL/pgSQL (alles in der DB) | B: Engine als reine TypeScript-Funktion in einer Edge Function, Speichern per SQL-Funktion |
|---|---|---|
| Atomarität | Eine Transaktion, Zeilensperre | Lesen → rechnen → ein `commit_round`-Aufruf mit Versionsprüfung (Muster [V] aus `save_character`) |
| Portierung der JS-Formeln (`getBase`, `SB`, `effClass`) | Neu schreiben in SQL, fehleranfällig | **nahezu Copy-and-paste** aus `index.html` |
| Test | Vorhandene PG-Tests (`supabase/tests/run.sh`) [V] | Reine Funktion mit `node` testbar (kein Browser, keine DB) [E] |
| Neues Tooling | keines | Edge-Function-Deployment (heute keine Funktion deployt) [N] |
| Kosten/Limits | Datenbanklast | Aufrufe nur je Runde, nicht je Poll (siehe 6) [A] |
| Zufall | `hmac` aus `pgcrypto` (installiert) | `crypto.subtle`/HMAC |

**Empfehlung:** **B** für die Kampfengine, **SQL** für alles Zeit-, Mitglieds- und Buchungsrecht. Begründung: Die Formeln und Daten liegen als JavaScript vor und lassen sich fast unverändert übernehmen. Eine Portierung nach SQL wäre die fehleranfälligste Einzelaufgabe des Projekts. **Entscheidungsgate in Phase 0:** Zeigt der Spike unüberwindbare Hürden (Deployment, Kaltstart, Limits), fällt die Wahl auf A. Die Datenstrukturen (Abschnitt 5) sind für beide Varianten gleich.

---

## 5. Vorgeschlagene Instanzdatenstruktur

**Prinzip:** Wahrheit liegt ausschließlich in Postgres. Es gibt **keinen Speicherzustand** auf dem Server, damit Neustarts nichts verlieren. Alles Zeitabhängige wird aus **Zeitstempeln** berechnet, nicht aus laufenden Timern.

### 5.1 Konfiguration (statisch, per Migration befüllt) [N]
- `cfg_abilities` (50 Zeilen: Klasse/Pfad/Stufe, Bausteine, Zieltyp, Energie, Abklingzeit in Runden), `cfg_statuses` (9 Status laut Plan 2.2), `cfg_enemies`, `cfg_encounters`, `cfg_dungeons` (Typ, Mindest-/Höchstgröße, Begegnungsfolge), `cfg_loot_pools` (Dungeon- und Boss-Pool getrennt), `cfg_balance` (alle Zahlenwerte aus Plan Abschnitt 8 als benannte Werte, vorerst Platzhalter).
- Abklingzeiten im Code sind **Sekunden** (`cd:15`), der Plan verlangt **Runden**. Umrechnung ist Balance (Plan 8), nicht Architektur.

### 5.2 Laufzeit [N]
| Tabelle | Wichtige Felder |
|---|---|
| `instances` | `instance_id`, `dungeon_id`, `kind` (normal/special/worldboss), `event_id`, `phase` (`gathering`/`ready`/`fight`/`wipe`/`done`/`aborted`/`event_ended`), `fight_no`, `version`, `seed` (bytea, **für Clients nie lesbar**), `pause_used_ms` (Budget, verbrauchte Zeit), `pause_since`, `created_at`, `closed_at`, `close_reason` |
| `instance_members` | `instance_id`, `account_id`, `character_id`, `state` (`active`/`left`/`removed`), `exit_cause` (freiwillig/Abwesenheit/Bereitschaft), `joined_fight_no`, `ready`, `ready_since`, `last_seen_at`, `profile` (jsonb, Kampfprofil-Schnappschuss), `potions_left`, `revivals_used`, `cooldowns`, `energy` |
| `fights` | `instance_id`, `fight_no`, `status`, `round_no`, `phase` (`tick`/`planning`/`resolve`/`wipe_window`), `phase_deadline` (timestamptz) **oder** `phase_remaining_ms` (wenn eingefroren), `state` (jsonb: Gegner, Status-Stapel, Schilde, Aufladungen), `rng_counter`, `initiative` |
| `fight_actions` | `fight_id`, `round_no`, `member`, `action` (jsonb), `action_id` (Client-UUID), `confirmed_at`, `status` (`confirmed`/`resolved`/`dropped`), **unique (fight, round, member)** |
| `fight_participation` | je (Instanz, Kampf, Spieler): Beitragszähler, `eligible` (Kampfteilnahme-Berechtigung), wird beim Kampfende fixiert |
| `fight_log` | append-only: Ereignisse **und jede Zufallsentscheidung** (Plan: protokolliert) |
| `revival_windows` | `fight_id`, `member`, `died_at`, `remaining_ms`, `used`, `death_no` |
| `reward_ledger` | `key` (Primärschlüssel, siehe 10), `kind`, `account_id`, `payload`, `created_at` |
| `reward_inbox` | Einträge je Spieler, `claimed_at`, `acked_at` |
| `worldboss_events` | `event_id`, `starts_at`, `ends_at` (UTC) |
| `matchmaking_queue` | `account_id`, `dungeon_kind`, `since` |

Teilindex: **ein aktives Mitglied je Charakter** (`unique … where state='active'` über offene Instanzen).

### 5.3 Zustandsübergänge Instanz (nach Plan)
`gathering → ready (Bereitschaftsphase) → fight → ready … → done` · jederzeit `→ aborted` (Budget erschöpft und niemand verbunden, automatische Entfernung unter Mindestgröße) · `fight → wipe → aborted/done` · `event_ended` nur Weltboss.
Jeder Übergang ist **eine SQL-Funktion**, die die Instanzzeile sperrt, den Vorzustand prüft und `version` erhöht. Ungültige Übergänge scheitern mit `PT409`.

---

## 6. Zustandsmodell und Rundenausführung

### 6.1 Serverautorität (Auftrag 3 A)
| Nur der Server entscheidet | Client darf nur |
|---|---|
| Kampfprofil (HP, Angriff, Verteidigung, Krit) | Aktionswunsch senden: Fähigkeit, Ziel, `action_id`, Rundennummer |
| Schaden, Heilung, Krit (aus gespeichertem Seed), Treffer, Status, Ticks, Initiative | Zustand anzeigen |
| Energie, Abklingzeiten, Reservierung/Erstattung | Reaktion „Wiederbelebungsitem einsetzen/Abwarten“ senden |
| Fristen, Pause, Entfernung, Bereitschaft, Siegprüfung | „Bereit“, Austritt senden |
| Teilnahmeberechtigung, Beute-Auslosung, Münzen, XP | Belohnungen abholen |

**Manipulationsschutz:** Der Client sendet nie Schaden, HP, Energie oder Status. Jede Aktion wird gegen den Serverzustand geprüft (Spieler aktiv, lebt, nicht betäubt, Energie, Abklingzeit, Ziel gültig, richtige Runde/Phase, Frist nicht abgelaufen, eine Aktion je Runde). Der Seed liegt in `instances.seed` ohne Leserecht; Clients lesen nur über eine Sicht-Funktion. Krit-Ergebnisse sind damit nicht vorhersagbar.

### 6.2 Zufall [N]
Pro Instanz ein `seed` (`gen_random_bytes(32)`). Zufallsströme per **HMAC** aus Seed, Strom-Name und Zähler: `kampf`, `dungeon_pool`, `boss_pool` (Plan 8, Punkt 6). Jede Ziehung wird mit Zähler in `fight_log` geschrieben, dadurch ist ein Kampf reproduzierbar und prüfbar. `pgcrypto` ist installiert [V].

### 6.3 Rundenablauf
1. **Rundenbeginn/Ticks** (Plan 1): Status-Ticks, Energie-Regeneration, Siegprüfung Fall 2 (Tod durch Effekt → Kampfende vor der Planung). Gegneraktionen werden angekündigt.
2. **Planung (60 s):** `phase_deadline = now() + 60 s`. Aktionen per `submit_action`: Prüfung, Energie **reservieren**, Eintrag mit `unique(fight, round, member)`. Wiederholter Aufruf mit gleicher `action_id` liefert dasselbe Ergebnis (Idempotenz).
3. **Auflösung:** startet, sobald alle aktiven Spieler bestätigt haben oder die Frist abläuft. Nicht bestätigende Spieler erhalten automatisch den Standardangriff (Plan 1). Sortierung nach Initiative, Aktion für Aktion: Tod/Betäubung → Verfall mit **Erstattung**, Zielumleitung nach Planregeln, Wirkung, Beitragszähler, Siegprüfung Fall 1 am Rundenende (nach Restauflösung), Niederlage sofort.
4. **Commit:** `commit_round(instance, expected_version, neuer_zustand, ereignisse, beiträge, ledger)` als **eine** SQL-Funktion = eine Transaktion. Nur `service_role` darf sie aufrufen (Muster `purge_expired_backups` [V]).
5. **Übergang:** Kampfende → Kampf-EP-Buchung → Bereitschaftsphase → nächster Kampf.

### 6.4 Wer löst eine Runde aus? (kein Dauerprozess nötig)
- **Auslöser:** (a) `submit_action`, wenn die letzte Bestätigung eintrifft, (b) jeder lesende Aufruf, der `phase_deadline < now()` erkennt, (c) **`pg_cron`-Watchdog** (z. B. alle 10–30 s, nur Instanzen mit überfälliger Frist) **[A: pg_cron aktivierbar, Sekundenintervalle laut Version 1.6.4 vermutet, vor Phase 3 prüfen]**.
- **Gleichzeitigkeit:** Mehrere Auslöser sind harmlos. Die Auflösung rechnet auf Basis `version`, `commit_round` akzeptiert nur die erwartete Version. Wer verliert, liest den neuen Zustand. Doppelte Verarbeitung ist ausgeschlossen.

### 6.5 Kommunikation und Last [A]
- **Lesen** per RPC `instance_view` (PostgREST, reine SQL-Funktion, Mitgliedschaftsprüfung), Polling ca. alle 2–3 s in der Planung. Dieselbe Anfrage dient als **Herzschlag** (aktualisiert `last_seen_at`) und liefert `server_now` und `phase_deadline` (Client nutzt nie seine eigene Uhr).
- **Warum nicht Edge Function pro Poll:** Bei 1 Aufruf je 3 s und Spieler wären das ≈ 1.200 Aufrufe/Stunde. Gängige Gratis-Kontingente für Funktionsaufrufe wären damit schnell erschöpft **[U: konkretes Kontingent nicht geprüft]**. Deshalb läuft die Edge Function nur **einmal je Runde und Instanz**.
- **Realtime** (Push) ist optional als spätere Optimierung. Im Code heute ungenutzt [V], kein Muss.

### 6.6 Verbindungsabbruch, Neustart, Wiederverbindung
- **Neustart:** Kein Zustand im Speicher. Nach Neustart von Edge Function oder Datenbank ist alles in Tabellen. Laufende Rundenfristen sind absolute Zeitstempel (`phase_deadline`). Eingefrorene (Pause, Wiederbelebungsfenster) stehen als `remaining_ms` (Plan 8, Punkt 1: Restzeit, nicht Endzeitpunkt).
- **Verbunden** heißt: `last_seen_at` jünger als eine Toleranz [A: technischer Wert, entspricht dem Balance-Eintrag „Toleranz für kurze Statusfehler“].
- **Trennung:** wird nie eigens „erkannt“, sondern aus `now() − last_seen_at` abgeleitet. Eine bestätigte Aktion bleibt erhalten, eine nicht bestätigte wird bei der Auflösung automatisch erzeugt (Plan 1).
- **Wiederverbindung:** Beim Start fragt der Client `my_active_instance()` ab (Einhängepunkt: `authBoot`, Z. 2760, neben der vorhandenen Cloud-Sitzungswiederherstellung [V]) und springt direkt in die Instanz.
- **Reihenfolge-Regel (wichtig):** Jeder Herzschlag ruft **zuerst** `advance_clock` auf und aktualisiert **dann** `last_seen_at`. So wird eine Abwesenheit über 5 Minuten noch angewendet, bevor die Rückkehr sie löschen würde.

---

## 7. Speicherung und Wiederherstellung

**Bestehend [V]:** Postgres mit RLS, `SECURITY DEFINER`-Funktionen, Versionsprüfung, rollierende Backups (Trigger), Audit-Log.

**Dauerhaft zu speichern (Quelle der Wahrheit):** `instances`, `instance_members` (inkl. `last_seen_at`, `ready`, `potions_left`, Kampfprofil), `fights.state`, `fight_actions` (bestätigte Aktionen), `fight_participation`, `revival_windows`, Seed, Pausenbudget, `reward_ledger`, `reward_inbox`, Konfiguration.

**Rekonstruierbar (nicht speichern):** Initiative-Reihenfolge (aus Profil und Seed), Verbundenheitsstatus (aus `last_seen_at`), Pausenzustand (aus Zeitstempeln), abgeleitete Anzeigewerte, Beute-Ergebnisse **nicht** (die werden gespeichert, nie neu gewürfelt, Plan 1d).

**Schutz vor doppelter Verarbeitung:** `unique(fight, round, member)` für Aktionen, `action_id`-Idempotenz, `version`-Prüfung in `commit_round`, Ledger-Schlüssel (Abschnitt 10).

**Backups:** Instanzdaten sind kurzlebig. Es genügt ein kleiner Aufbewahrungsjob (z. B. abgeschlossene Instanzen nach X Tagen löschen, **ohne** Ledger). Charakterdaten sind weiter durch `character_backups` gesichert.

**Datenschutz [V→E]:** Die neuen Tabellen enthalten Kontobezug. `delete_account` (siehe `schema.sql`) muss erweitert werden (Mitgliedschaften, Inbox löschen, Ledger anonymisieren). Das entspricht dem Vorgehen bei `payment_events`. Pflicht-Punkt, damit die Konto-Löschung weiter vollständig ist.

---

## 8. Status- und Fähigkeitenintegration

**Zuordnung der 50 Fähigkeiten:** Jede Fähigkeit wird zu einer Zeile in `cfg_abilities` mit **Bausteinen** statt Sonderlogik: `damage{mult,hits,forceCrit}`, `heal{flat,perLv,pct,target}`, `shield`, `stun`, `apply_status{id,stacks}`, `revive`, `cleanse`. Welche Fähigkeit welchen Baustein und welchen Status bekommt, steht verbindlich im Plan (Abschnitt 4, Spalten „Instanz“ und „Status“). Nichts davon wird geändert.

| Aspekt | Umsetzung | Status |
|---|---|---|
| Wiederverwendete Berechnungen | `mult`/`hits`/Krit/`heal`/`perLv`/`healPct` aus `strike`/`useSkill` kopiert | [V] Formel, [N] Ort |
| Neue Effektverarbeitung | 9 Status mit Stapeln, Dauer in Runden, Ticks zu Rundenbeginn, Brennen-Sprung, Reinigung (ältester zuerst, max. 2) | [N]. Heute kennt der Client nur `psn` (Gift/Brennen), `S.shield` (Anzahl Treffer), `S.stun` und `myStun` |
| Schild | **Semantikwechsel** laut Plan: heute „nächste N Treffer −70 %“ (`S.shield` zählt Treffer), in der Instanz absorbierender Schildwert, Obergrenze 35 % max. HP, „höherer Wert statt Summe“ | [N], Plan 2.2 |
| Betäubung/Resistenz | Betäubung = „nächste Aktion verfällt“, Resistenz nach erfolgreicher Betäubung, Boss-Sonderregel | [N] |
| Wiederbelebung | genau **zwei** Fähigkeiten (Heiliger Schild, Kräuterbalsam) + Item-Sonderreaktion; Fenster in `revival_windows`, Zähler am Mitglied | [N] |
| Aktionsverfall | Aktion verfällt bei Tod/Betäubung/ungültigem Ziel mit **Energie- und Abklingzeit-Erstattung**, protokolliert | [N] |
| Statusanzeige | Icons vorhanden: Gift, Feuer, Betäubt, Schutz. **Fehlen:** Blutung, Verlangsamung, Rüstungsschwächung, Regeneration, Stärkung | [E]/[N] Assets |
| Boss-Sonderregeln | Daten in `cfg_enemies` (Stapelobergrenze, Tick-Cap, Resistenzen) | [N] |

**Nicht geändert:** Keine Fähigkeit, kein Zieltyp, kein Status des Plans. Alle Zahlen bleiben Platzhalter in `cfg_balance`.

**Kampfprofil (kritischer Punkt):** Beim Beitritt erzeugt der Server ein Profil aus `characters.character_data` (Level, Klasse, Pfad, Stufe, `gear`/`eq`) mit den kopierten Formeln. Er prüft Klasse/Stufe/Pfad per `canEquip`-Regeln. **Einschränkung [U/Risiko]:** `character_data` stammt vom Client. Er könnte beliebige Ausrüstung eintragen. Der Server kann Plausibilität prüfen (Basis-ID gültig, Level-Anforderung, Klassenregeln), **nicht** die Herkunft der Gegenstände. Das ist ein Grundproblem des heutigen Modells (siehe 14, Risiko R1).

---

## 9. Gruppen- und Verbindungsverwaltung

Alle Regeln stammen aus dem Plan (Abschnitt 1, 1a, 1b). Technische Abbildung:

| Regel | Abbildung |
|---|---|
| Globale Gruppenvermittlung, Portale nur Einstieg | `matchmaking_queue` + `join_queue(dungeon_kind)`. Portal-Kennung wird nur durchgereicht. **Standort ist nicht prüfbar** (Testmodus `setTest` im Client existiert [V]), deshalb darf der Server nichts Wichtiges daran knüpfen, was zum Plan passt |
| Mindestgröße als Startbedingung (2 / 6) | Prüfung nur in `start_fight` beim ersten Start. Danach nur Regel „automatische Entfernung unter Mindestgröße ⇒ abgebrochen“ |
| Freiwilliger Austritt | `leave_instance()`: `state='left'`, `exit_cause='freiwillig'`, Gruppe läuft weiter, auch unter Mindestgröße |
| Kein Wiederbeitritt | Beitritt prüft: für diese Instanz existiert kein Eintrag mit `left`/`removed` für dieses Konto |
| Nachrücker | Nur in Phase `ready`. Eigene 3 Tränke (`potions_left=3`), keine zurückgesetzten Abklingzeiten, Energie/HP laut Balance-Startwerten |
| Bereitschaft | `set_ready()` setzt `ready=true` unwiderruflich. Fristen: verbunden 60 s ab `ready_phase_start` bzw. Beitritt/Wiederverbindung, getrennt 5 Minuten, danach 60 s ab Rückkehr. Nach Ablauf `removed`, `exit_cause='Bereitschaft'` |
| Bereitschaft bleibt bei Trennung | `ready` wird nur beim Kampfstart zurückgesetzt, nicht bei Trennung |
| Persönliche Abwesenheit | `now() − last_seen_at ≥ 5 min` ⇒ `removed`, `exit_cause='Abwesenheit'`. Wirksam an Aktions-/Phasengrenzen |
| Gruppenpause | Kein Mitglied (auch kein toter) verbunden ⇒ Uhr des Pausenbudgets läuft von `max(last_seen_at)+Toleranz` bis zur ersten Rückkehr. Alle Fristen werden eingefroren (Restzeit). Budget 5 min kumuliert, danach `aborted` |
| Wipe-Zustand | Gleiche Pausenlogik |
| Wiederherstellung der Mitgliedschaft | `my_active_instance()` beim Start (siehe 6.6) |

**Kernprinzip:** Eine zentrale SQL-Funktion `advance_clock(instance, now)` wertet **alle** zeitabhängigen Regeln **in zeitlicher Reihenfolge** aus (Pausenende, Abwesenheiten, Bereitschaftsfristen, Event-Ende, Wiederbelebungsfenster). Das gewährleistet, dass ein spät eintreffender Aufruf dasselbe Ergebnis liefert wie ein pünktlicher. Der Watchdog ruft sie für Instanzen auf, die niemand mehr abfragt.

---

## 10. Belohnungsarchitektur

**Bestehend [V]:** XP/Münzen/Items sind Zahlen und Listen im Client-Dokument (`S.xp`, `S.cu`, `S.inv`, `S.gear`). Es gibt keinen Belohnungseingang, keinen Duplikatschutz und keine serverseitige Zufallsentscheidung.

**Neu [N]:**
- **Ledger** `reward_ledger` mit **Primärschlüssel = Idempotenzschlüssel** laut Plan 1d: `ep:{instanz}:{kampf}:{spieler}`, `final:{instanz}:{spieler}` (inkl. Münzen), `dungeonloot:{instanz}:{kampf}:{eintrag}`, `bossloot:{instanz}:{bosskampf}:{eintrag}`. `INSERT … ON CONFLICT DO NOTHING` in derselben Transaktion wie `commit_round`. Auch „kein berechtigter Teilnehmer“ wird als Ergebnis gespeichert.
- **Teilnahme je Kampf:** `fight_participation` zählt gültige Zustandsänderungen (Plan 1d, Beitragsarten). Berechtigung wird beim Kampfende fixiert.
- **Auslosung:** erst bei erfolgreichem Instanzabschluss, je Gegenstand separat, gleiche Chance, aus den Strömen `dungeon_pool`/`boss_pool`. Niederlage, Abbruch und Event-Ende buchen **nichts** außer bereits gebuchter Kampf-EP.
- **Persönliche Münzen** als Teil des `final`-Eintrags, ohne gemeinsamen Pool.
- **Nachrücker:** `final`-Anteil aus der verdienten Berechtigung, Formel ist Balance.
- **Automatische Entfernung:** Ledger-Einträge abgeschlossener Kämpfe bleiben, wie in der Tabelle in Plan 1d.
- **Weltboss-Eventende:** `advance_clock` setzt alle laufenden Kämpfe auf `event_ended`. Sieg zählt nur, wenn die Feststellung **vor** `ends_at` in derselben Transaktion erfolgte (Prüfung gegen `ends_at` mit Zeilensperre, Plan 8, Punkt 7).

**Übergabe an den Client (kritischer Punkt):** Der Charakter-Stand liegt beim Client, nicht beim Server. Ein Eintrag im Ledger ist also noch **keine** Gutschrift im Spielstand. Vorschlag **[A], zweistufig und crash-sicher:**
1. Client ruft `claim_rewards()`: liefert alle offenen Inbox-Einträge (ohne sie zu löschen).
2. Client wendet sie an (`addXP`, `earn`, `addGear`, Items) und trägt die IDs in sein Dokument ein (`S.rclaimed`).
3. Nach erfolgreichem Cloud-Speichern (`syncPush` bestätigt) ruft er `ack_rewards(ids)`; erst dann gilt der Eintrag als abgeholt.
4. Stürzt der Client dazwischen ab, bleibt der Eintrag in der Inbox. Beim nächsten Abholen erkennt der Client die ID in `S.rclaimed` und überspringt sie. So entsteht **genau eine** Wirkung.

**Volles Inventar [U]:** `SLOTS` sind die 10 Ausrüstungsplätze, nicht die Inventargröße. Im Code habe ich **keine Inventarobergrenze** gefunden (`S.inv` ist eine Zuordnung, `S.gear` eine Liste). Ob und wo ein „volles Inventar“ entsteht, ist daher heute nicht belegbar. Die Inbox bleibt trotzdem nötig (Abholen, Absturzsicherheit). Kapazität und Verfall sind Konfiguration (Plan 1d).

**Grenze:** Da der Client sein Dokument selbst speichert, kann er Münzen/Items auch **ohne** Instanz in sein Dokument schreiben. Der Instanzbetrieb verhindert das nicht (siehe R1).

---

## 11. Clientintegration

- **Trennung [E]:** Neue Datei `instance.js` (Muster: `sprites*.js`, `pxdom.js` werden bereits per Script-Tag geladen [V]) statt weiterer Zeilen in `index.html`. In `index.html` sind nur wenige Einhängepunkte nötig: Script-Tag, Menüeintrag, Aufruf beim Start (`authBoot`), Abholen (`claim_rewards`).
- **Zustandstrennung:** Die Instanz-UI liest ausschließlich `instance_view`. Sie schreibt **nicht** in `S` außer beim Abholen der Belohnungen. Der Echtzeitkampf (`eng`, `sel`, `bossFx`, `S.mh`) bleibt unberührt.
- **Wiederverwendbar [V]:** `sbAuthed` (Auth, Refresh, Fehlerbehandlung), `toast`, Sheets (`openSheet`), `fxChip`/`FX`-Muster, Layout „Daumenzone“, Tab-Besitz (`tlBeat`) gegen zwei Tabs eines Charakters.
- **Neu [N]:** Matchmaking-Ansicht, Bereitschaft, Planungsansicht (Zielwahl, Fähigkeitsleiste mit Rundenzählern, 60-s-Anzeige nach `server_now`), Rundenprotokoll, Wiederbelebungsfenster mit Auswahldialog, Belohnungsabholung, Weltboss-Ansicht, Hinweise bei Pause/Entfernung/Abbruch.
- **Hintergrund-Tab:** Browser drosseln Timer. Der Client zeigt nur Server-Zeit an. Verpasste Runden löst der Server nach Plan (Standardangriff). `visibilitychange` ist bereits angebunden [V] und dient für sofortiges erneutes Abfragen.
- **Mobil [V]:** Bestehende Tests prüfen Tippgrößen ≥ 40 px und Überlauf bei 320–412 px. Dieselben Prüfungen gelten für die neue UI.
- **Testmodus-Hinweis [V]:** `setTest` erlaubt Bewegung ohne GPS. Für Instanzen irrelevant, da Portale nur Einstieg sind.

---

## 12. Implementierungsphasen

Reihenfolge gegenüber deinem Vorschlag **angepasst**: (1) Neue Phase 0 (Spike und Entscheidungsgate), weil Tarif, `pg_cron`, Edge-Function-Deployment und Engine-Ort **ungeprüft** sind. (2) Speicherung wird mit der Serverbasis zusammengelegt, weil keine Runde ohne persistierten Zustand testbar ist. (3) Ein Node-**Simulationsclient** ersetzt die frühe UI, damit Server und Regeln ohne Oberfläche vollständig testbar sind. (4) Wiederbelebung nach Gruppenlogik, wie von dir vorgeschlagen.

| Phase | Ziel | Betroffene Systeme | Änderungen | Abhängig von | Risiken | Tests | Abnahme |
|---|---|---|---|---|---|---|---|
| **0 Spike** | Technische Annahmen prüfen | Supabase-Projekt, ggf. Testprojekt | Einwegexperimente: Edge-Function-Deployment, `pg_cron`-Aktivierung/-Takt, `pg_net`, Latenz, Kontingente. Entscheidung A/B | – | Tarif/Limits anders als angenommen | – | Schriftliche Entscheidung A oder B, Tarif und Limits belegt |
| **1 Reine Kernberechnung** | Formeln und Daten als reines Modul, ohne UI/DB | neues Server-Modul, Konfigurationsdaten | Kopie von `getBase`/`gStats`/`SB`/`effClass`, Schaden-, Monster-, Trankformeln, `cfg_*`-Daten aus `index.html` | 0 | Abweichung zum Client | **Vertragstest** (siehe 13) | Gleiche Werte wie Client für alle Klassen/Pfade/Stufen und alle Set-Kombinationen der Stichprobe |
| **2 Serverbasis + Speicherung** | Tabellen, RLS, Funktionen, Instanzlebenszyklus | `schema`-Migration, SQL-Tests | Tabellen aus 5, `create_instance`, `join`, `leave`, `instance_view`, Herzschlag, `advance_clock`, `delete_account`-Erweiterung | 1 | Rechte-Fehler (Funktionen für PUBLIC offen) | `supabase/tests` (beide Modi) | Rechte-Test grün, keine Client-Schreibrechte, Neustart verliert nichts |
| **3 Rundenverwaltung** | Planung, Timer, Aktionen, Commit | Engine, `submit_action`, `commit_round`, Watchdog | Phasenmaschine, Reservierung, idempotente Aktionen, Zeitlogik | 2 | Doppelte Verarbeitung, Race Conditions | Engine-Unit + SQL-Konkurrenztests | Gleichzeitige Auslöser erzeugen genau eine Auflösung |
| **4 Aktionen, Initiative, Fähigkeiten, Status** | 50 Fähigkeiten, 9 Status | Engine, `cfg_abilities`/`cfg_statuses` | Bausteine, Ticks, Stapel, Reinigung, Schild, Betäubung, Aktionsverfall mit Erstattung | 3 | Regelbruch bei Randfällen | Tabellentests je Regel aus dem Plan | Jede Zeile der Tabellen „Aktionsverfall“, „Zielumleitung“ als Test grün |
| **5 Gegner und Bosse** | Begegnungen, Bossregeln | `cfg_enemies`, Engine | Gegnerlogik, Aufladungen, Telegraphen nach Plan 3, Stapelobergrenzen | 4 | Zu viele Sonderfälle | Boss-Szenariotests | Jeder Bossangriff hat mindestens zwei lösbare Wege (Plan-Empfehlung) |
| **6 Gruppen, Bereitschaft, Pause** | Beitritt, Nachrücker, Bereitschaft, Abwesenheit, Pause | SQL-Funktionen, `advance_clock` | Fristen, Entfernungsursachen, Mindestgröße, Wiederherstellung | 2, 3 | Zeitlogik, Reihenfolge | Zeittests mit **simulierter Uhr** | Alle Fristfälle des Plans reproduzierbar |
| **7 Wiederbelebung** | Fenster, Zähler, Item-Reaktion | `revival_windows`, Engine | Limits, Konkurrenzregel, Pause-Einfrieren | 4, 6 | Fensterlogik bei Pause/Wipe | Szenariotests | Pausen/Wipe/gleichzeitiger Tod wie im Plan |
| **8 Belohnungen** | Ledger, Pools, Inbox, Eventende | `reward_*`, `commit_round` | Buchung, Auslosung, Abholen/Bestätigen | 3, 6, 7 | Duplikate, Verlust zwischen Server und Client | Doppelaufruf, Absturz zwischen Schritten | Kein Eintrag wirkt zweimal, auch nach Neustart |
| **9 Client** | Oberfläche | `instance.js`, wenige Zeilen `index.html` | Ansichten aus 11 | 3–8 | Regression Echtzeit, mobile Bedienung | Playwright | Bestehende 219 Tests unverändert grün, neue UI-Tests |
| **10 Integration** | Weltboss-Event, Last, Abschluss | alle | Event-Anbindung, Dauerläufe mit Bots | alle | Last, seltene Zustände | Simulationen, Chaos (Verbindungsabbrüche, Neustarts) | Alle Regeln aus Plan Abschnitt 8 belegt |

**Mindestumfang für ein erstes spielbares Ergebnis:** Phasen 0–4, 6 (Basis), 8, 9 für normale 2er-Dungeons mit einem Kampf. Weltboss und Sonderfälle folgen.

---

## 13. Testplan

**Prinzip:** Gezielt Risiken absichern, nicht alles testen. Vorhandene Infrastruktur nutzen.

1. **Reine Engine (Node, ohne Browser/DB) [N, klein]:** Ein einfacher Node-Lauf neben `tests/run.js`. Tabellengetrieben: Schadensformel, Krit mit festem Seed, Status-Stapel, Ticks, Brennen-Sprung, Reinigung, Schild-Absorption, Betäubung/Resistenz, **Aktionsreihenfolge/Initiative**, Zielumleitung und Erstattung, Energie/Abklingzeit, Tod/Wiederbelebung (Limit 2, Fenster 60 s, Konkurrenz), Siegprüfung Fall 1/Fall 2, Wipe.
2. **Vertragstest Client ↔ Server [N]:** Ein Playwright-Test liest über `window.__RW` die Werte (`CLASSES`, `PATHS`, `getBase`, `maxHP`/`atk`/`defense`/`critCh` für Stichproben) und vergleicht sie mit dem Server-Modul. Verhindert stilles Auseinanderlaufen bei künftigen Balance-Änderungen.
3. **SQL (vorhandene PG-Testinfrastruktur [V→E]):** Rechte (Clients dürfen keine Instanztabellen schreiben, keine neuen Funktionen für PUBLIC), `commit_round` nur für `service_role`, Versionskonflikte, Unique-Ketten (Aktionen, Ledger), Mitgliedschaftsregeln, Kein-Wiederbeitritt, Lösch-Kaskade.
4. **Zeit (simulierte Uhr):** `advance_clock(instance, now)` mit übergebener Zeit testen: Pause nur bei „niemand verbunden“, Budget 5 min kumuliert, 5-min-Abwesenheit mit Reconnect-Reset, Bereitschaft 60 s/5 min, Wiederbelebungsfenster eingefroren, Event-Ende (Start bis letzte Sekunde, Sieg nur vor Ende), Reihenfolge-Regel „zuerst Frist, dann Herzschlag“.
5. **Serverneustart:** Zustand mitten in der Runde lesen, „neu starten“ (frische Verbindung/Funktion), Fortsetzen ohne Abweichung.
6. **Doppelte Aktionen/Auszahlungen:** Gleiche `action_id` zweimal, zwei gleichzeitige Auslöser der Auflösung, doppeltes `claim_rewards`, Absturz zwischen Abholen und Bestätigen, Auslosung zweimal anstoßen ⇒ identisches Ergebnis.
7. **Client (Playwright [V]):** Wenige UI-Tests: Planung/Bestätigung, Wiederverbindung in laufende Instanz, Belohnung abholen, Layout bei 320–412 px.
8. **Regression Echtzeitkampf [V]:** Bestehende Tests `combat`, `status`, `gear`, `save`, `cloud*` laufen **unverändert** weiter und müssen nach jeder Phase grün sein. Zusätzlich ein Test, dass `index.html` ohne `instance.js`-Daten (Server aus) normal startet und kämpft.
9. **Simulation:** Ein Bot-Client (Node), der Dungeons mit 2–4 Spielern durchspielt, zufällig trennt und wiederverbindet. Prüft Invarianten (kein Doppel-Ledger, Summe Berechtigte ≤ Mitglieder, Zustand konsistent).

**Hinweis [V]:** Die GitHub-Action deployt bei jedem Push auf `main` **ohne Tests**. Empfehlung (klein, optional): die vorhandenen Tests vor dem Deployen laufen lassen. Das ist eine Prozessänderung, keine Pflicht für dieses Projekt.

---

## 14. Technische Risiken

| # | Risiko | Wahrsch. | Auswirkung | Vermeidung |
|---|---|---|---|---|
| R1 | **Client besitzt Charakterdaten** (`save_character` nimmt beliebiges JSON): Ausrüstung, Münzen, Items können manipuliert werden, Kampfprofil basiert darauf | **hoch** | hoch (Fairness, Beuteentwertung) | Server prüft Plausibilität (Basis-IDs, Level-/Klassenregeln). Belohnungen gehen über Server-Ledger. Grundlösung (Spielstand serverseitig) liegt außerhalb dieses Auftrags. **Als bekannte Restgrenze festhalten** |
| R2 | Bestehender Echtzeitkampf wird durch Eingriffe beeinträchtigt | niedrig, wenn Plan befolgt | hoch | Kein Umbau von `strike`/`monsterHit`/`useSkill`. Neue Datei, wenige Einhängepunkte. Bestehende Tests als Sperre |
| R3 | Drift zwischen Client-Formeln und Server-Kopie | mittel | mittel | Vertragstest (13.2) |
| R4 | Zeit- und Fristlogik (Pause, Abwesenheit, Bereitschaft, Event-Ende) in Randfällen falsch | **hoch** | hoch | Eine zentrale Funktion `advance_clock`, chronologische Auswertung, Tests mit simulierter Uhr |
| R5 | Konkurrierende Aktionen/Auslöser, doppelte Verarbeitung | mittel | hoch | Zeilensperre, `version`, Unique-Schlüssel, Idempotenz |
| R6 | Belohnungsduplikate oder -verlust zwischen Server und Client | mittel | hoch | Ledger-Schlüssel, zweistufiges Abholen mit Bestätigung, Tests für Absturz dazwischen |
| R7 | Neustart/Datenverlust bei Timern | niedrig | hoch | Kein Speicherzustand, absolute Zeitstempel/Restzeiten |
| R8 | **Tarif/Limits** (Edge-Function-Aufrufe, `pg_cron`, gleichzeitige Verbindungen) anders als angenommen | mittel **[U]** | mittel–hoch | Phase 0 prüft. Polling nur über SQL-Funktionen. Variante A als Rückfall |
| R9 | Edge-Function-Betrieb ist neu (Deployment, Kaltstart, Geheimnisse) | mittel | mittel | Spike, ein einziger kleiner Endpunkt, Fehlerpfade testen. Rückfall A |
| R10 | Polling-Last und Mobilbrowser (Hintergrund-Drosselung) erzeugen scheinbare Trennungen | mittel | mittel | Toleranzwert, serverseitige Zeit, Standardaktion statt Strafe (Plan) |
| R11 | Zu große/komplexe Architektur | mittel | mittel | Nur Tabellen, die der Plan wirklich braucht. Konfiguration als Daten. Mindestumfang Abschnitt 12. Keine Message-Queue, kein eigener Dienst |
| R12 | Konto-Löschung/Datenschutz unvollständig durch neue Tabellen | mittel | hoch (rechtlich) | `delete_account` erweitern und mit Test absichern |
| R13 | Portale/Standort nicht prüfbar | hoch | niedrig | Server knüpft nichts an den Standort (passt zum Plan: Portale nur Einstieg) |
| R14 | Inhalte fehlen (Gegner, Bosse, Beutepools, Zahlen) | hoch | mittel | Inhalt ist Balance/Content, nicht Architektur. Phase 5/8 liefern Struktur, Befüllung folgt separat |

---

## 15. Empfohlene Gesamtarchitektur

```
Browser (GitHub Pages)
  index.html  ── Echtzeitkampf, Welt, Charakter   [unverändert]
  instance.js ── Instanz-UI (nur Anzeige + Aktionswünsche)  [N]
        │  HTTPS, vorhandene Token/Sitzung (sbAuthed)
        ▼
Supabase (vorhanden)
  PostgREST-RPC (SQL, SECURITY DEFINER)         ── Lesen (instance_view = Herzschlag), Aktionen, Beitritt, Bereitschaft, Austritt, Belohnungen
  Edge Function "resolve-round" (nur 1×/Runde)  ── reine Engine resolveRound()  [Variante B]
        │ commit_round() (service_role, 1 Transaktion, Versionsprüfung)
        ▼
  Postgres: instances, members, fights, actions, log, participation, revival_windows, reward_ledger, reward_inbox, cfg_*
  pg_cron (zu aktivieren) ── Watchdog: advance_clock für verwaiste Instanzen, Event-Ende
```

Leitlinien: (1) Server ist Wahrheit, Client sendet nur Wünsche. (2) Zeit = Zeitstempel, nichts im Speicher. (3) Eine Transaktion pro Auflösung, Idempotenz überall. (4) Konfiguration als Daten, Zahlenwerte nur in `cfg_balance`. (5) Echtzeitkampf bleibt unangetastet. (6) Keine neuen kostenpflichtigen Dienste vorausgesetzt **[A: Supabase-Tarif deckt Edge Function, `pg_cron`, `pgcrypto`; vor Phase 3 zu belegen]**.

---

## 16. Abschließende Einschätzung der Umsetzbarkeit

**Machbar:** Ja, für ein kleines Browser-RPG mit den vorhandenen Bausteinen (Supabase, RLS-Funktionsmuster, Tests mit echtem Postgres). Der Plan ist technisch abbildbar, ohne Designentscheidungen anzufassen.

**Größter Aufwand:** (1) Die Server-Engine mit 9 Status, 50 Fähigkeiten und Zielumleitung, (2) die Zeit- und Fristlogik, (3) das Belohnungsprotokoll mit sicherer Übergabe an den Client.

**Größte Restgrenze:** Solange der Spielstand als Client-Dokument gespeichert wird (R1), sichert das System Kampfablauf, Teilnahme und Belohnungsbuchung, **nicht** die Echtheit von Ausrüstung und Münzen. Das ist kein Hindernis für den Start, aber bei Handel oder Ranglisten vor dem Launch zu entscheiden.

**Noch nicht belegt [U]:** Supabase-Tarif und Limits, `pg_cron`-Takt, Edge-Function-Kaltstart und Kontingent, Realtime-Eignung, Inhalte (Gegnerwerte, Beutepools). Phase 0 klärt das, bevor Aufwand entsteht.

**Konsistenzprüfung dieses Berichts (Auftrag 9):**
- Echtzeitkampf unangetastet: ja (Abschnitt 3, 11, 12 Phase 9, R2).
- Regeln aus `INSTANZKAMPF_PLAN.md` abbildbar: ja. Pause, Abwesenheit, Bereitschaft, Kein-Wiederbeitritt, Mindestgröße, Abbruch = Niederlage-Folgen, Münzen in Abschlussbelohnung, Nachrücker nach verdienter Berechtigung, Eventende, zwei Wiederbelebungsfähigkeiten (Abschnitte 5–10).
- Keine Designentscheidung verändert: ja. Offene Punkte sind ausschließlich technisch markiert (Toleranzwert, Abholprotokoll, Engine-Ort).
- Keine kostenpflichtigen Dienste vorausgesetzt: ja, als Annahme gekennzeichnet und in Phase 0 zu belegen.
- Reihenfolge sinnvoll und begründet: ja (Abschnitt 12).
- Realistisch für ein kleines Browser-GPS-RPG: ja, mit Mindestumfang und Rückfall A.

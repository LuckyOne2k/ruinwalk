# Ruinwalk – Architekturbericht Instanzkampf, Fassung 2.1 (Überarbeitung technischer Unklarheiten, Abschlussprüfung)

Stand: 16.11.2026 · Basis: Repository-Commit `fec2598` (Änderungen dieser Fassung noch **nicht** committet) · `INSTANZKAMPF_PLAN.md` unverändert · keine Implementierung.
Diese Fassung **ergänzt** `INSTANZKAMPF_ARCHITEKTURBERICHT.md` (Fassung 1). Die Grundarchitektur bleibt: Postgres als einzige Wahrheit, Zeit aus Zeitstempeln, SQL für Mitgliedschaft/Fristen/Buchung, reine Kampfengine in einer Edge Function (Rückfall: Engine in SQL), Echtzeitkampf unangetastet. Hier stehen nur die **korrigierten Abschnitte**. Alles andere gilt aus Fassung 1 weiter. **Fassung 2.1** enthält zusätzlich die Weltboss-Absicherung (Abschnitt K) und die Korrekturen aus der Abschlussprüfung (Abschnitt N). Wo Fassung 1 und diese Fassung sich widersprechen, gilt diese Fassung.

**Kennzeichnung:** **[V]** im Code belegt · **[E]** Erweiterung · **[N]** neu · **[A]** Annahme · **[U]** nicht belegbar.

## 0. Übersicht der Änderungen gegenüber Fassung 1

| Thema | Änderung |
|---|---|
| Auslösung der Runde | Clients rufen die Edge Function **nie** auf. Nur die Datenbank löst sie aus (`pg_net`), aus drei Quellen mit Auftragstabelle. Ersetzt Fassung 1, 6.4 |
| Trennung `advance_clock` / Engine | Neu und eindeutig definiert (A.1) |
| Zufall | **Kein gespeicherter Zähler mehr.** Jede Ziehung ergibt sich aus Seed, Strom, Kampf, Runde und Ziehungsnummer. Ersetzt Fassung 1, 6.2 (`rng_counter`) |
| Disconnect-Regel (20 s) | In die Rundenmaschine eingeordnet (D) |
| Kampfprofil | Konkret: was der Client kontrolliert, was der Server prüft, was bleibt (B). Ersetzt Fassung 1, Abschnitt 8 „Kampfprofil“ |
| Belohnungszustellung | Lease statt bloßem Claim, klare Garantien, **keine** Exactly-once-Behauptung (C). Ersetzt Fassung 1, Abschnitt 10 „Übergabe“ |
| Atomarität | Vollständiger Ablauf von Lesen bis Commit mit Absturzfällen (E) |
| Neu | Störungsfenster (F), Gesamtarchitektur 2, Restrisiken, Voraussetzungen, Freigabephasen |
| Fassung 2.1 / 2.1b | Weltboss-Eventende (K), Profilableitung (L), Phase-0-Voraussetzungen (M), Prüfprotokoll (N), Risiken/Phasen/Einfrieren (O), offene Entscheidungen (P); hängende Instanz (A.6), Grenzen der Invarianten (E.5). Änderungsliste: N.1, N.2 und N.4 |

---

## A. Runden-Watchdog

### A.1 Eindeutige Trennung der Schichten

| | `advance_clock(instance, now)` | Kampfengine `resolveRound` | `commit_round` |
|---|---|---|---|
| Ort | SQL | reine TypeScript-Funktion in der Edge Function | SQL |
| Aufgabe | **Nur Wanduhr-Regeln:** Präsenz, 5-Minuten-Abwesenheit, Gruppenpause und Budget, Bereitschaftsfristen, Event-Ende, Mindestgröße/Abbruch, Fälligkeit der Runde (`due_at`) | **Nur Kampfregeln:** Initiative, Aktionen, Schaden, Status, Ticks, Tod, Umleitung, Erstattung, Siegprüfung, Niederlage, Beitragszähler | Prüfen und **atomar speichern** |
| Liest die Uhr? | ja (`now`) | **nein** (kein `Date.now`, kein `Math.random`) | ja (`now()` für neue Fristen) |
| Berechnet Kampfergebnisse? | **nie** | ja | **nie** (nur Invariantenprüfung) |
| Schreibt | Mitglieder, Fristen, Flags, `due_at`, Aufträge | nichts (liefert Ergebnis) | Kampfzustand, Protokoll, `rewards`, nächste Phase |

`advance_clock` entscheidet nur **dass** eine Runde fällig ist und welche Mitglieder zu entfernen sind. **Was** in der Runde geschieht, entscheidet ausschließlich die Engine. Entfernungen, die mitten in einer laufenden Auflösung fällig würden, werden als `pending_removal` vermerkt und von der Engine erst an der nächsten Aktions-/Phasengrenze wirksam gemacht (Plan 1: nie mitten in einer Aktion).

**Wichtig:** Ist **kein** Mitglied verbunden, gilt die Gruppenpause. Dann sind alle **spielerbezogenen** Fristen eingefroren (Restzeit). **Zwei Ausnahmen:** (a) das absolute **Weltboss-Eventende** wird nie pausiert (Abschnitt K), (b) eine Runde, die **schon vor Pausenbeginn** fällig war, bleibt fällig (Chronologie-Regel unten). Ein Watchdog für „niemand sendet mehr etwas“ ist nur für Fälle nötig, in denen die Zeit **weiterläuft**:
1. Letzte Verbindung brach ab, **nachdem** die Frist schon abgelaufen oder die Runde schon vollständig bestätigt war (die Runde war logisch vorher fällig).
2. Verbundene Spieler, deren Browser nicht mehr zuverlässig sendet (Hintergrund-Tab), aber noch innerhalb der Toleranz liegen.
3. Fristen ohne Spielerbezug: 5-Minuten-Abwesenheit, Budget 5 Minuten, Bereitschaftsfristen, **Weltboss-Eventende (nie pausierbar)**.

**Chronologie-Regel:** `advance_clock` wertet Ereignisse in zeitlicher Reihenfolge aus. Ist `due_at` einer Runde **früher** als der Pausenbeginn (`pause_start = max(last_seen_at aller Mitglieder) + T_conn`, der letzte Zeitpunkt, an dem mindestens ein Mitglied noch als verbunden galt, D.1), war die Runde fällig, solange noch jemand verbunden war. Sie wird aufgelöst, auch wenn beim Auslösen niemand mehr verbunden ist. Der Verbindungsstatus im Snapshot bezieht sich dann auf `t_snap = min(Jetzt, pause_start)`. Ist `due_at` **später** als `pause_start`, ist die Runde eingefroren und nicht fällig. Bei laufender Pause wird nie ein Claim für eine später fällige Runde erteilt.

### A.2 Auftragstabelle und drei Auslöser

`resolve_jobs(fight_id, round_no, status, attempts, last_dispatch_at, last_error)` mit **unique (fight_id, round_no)**. Status: `pending` → `claimed` → `done` (oder `stuck`, oder `cancelled` bei Eventende, K.2 Regel 4). Pro Runde existiert höchstens **ein** logischer Auftrag.

`dispatch_if_due(instance)` (SQL, SECURITY DEFINER) wird aufgerufen aus:
1. **`submit_action`**, wenn die letzte nötige Bestätigung eintrifft (geringste Verzögerung),
2. **`instance_view`** (Herzschlag jedes Clients; ruft vorher `advance_clock`),
3. **`pg_cron`-Tick** (Watchdog, siehe A.3).

`dispatch_if_due` sperrt die Instanzzeile, prüft `due_at <= now()` und legt den Auftrag per `INSERT … ON CONFLICT DO NOTHING` an. Nur wenn der Auftrag neu ist **oder** `last_dispatch_at` älter als ein Wiederholintervall (z. B. 15 s) und noch nicht `done`, wird `net.http_post(...)` abgesetzt und `last_dispatch_at`/`attempts` aktualisiert. Mehrfachaufrufe erzeugen so höchstens einen Versand je Intervall.

### A.3 Wie `pg_cron` überfällige Instanzen erkennt

Job (z. B. alle 15–30 s **[A: Sekundenintervall ab pg_cron 1.5, im Projekt Version 1.6.4 verfügbar, noch nicht installiert, vor Einsatz zu prüfen]**): `select watchdog_tick();`

`watchdog_tick()`:
1. Schreibt `system_heartbeat(now)` (siehe F).
2. Wählt per Index `fights where due_at <= now() and status = 'active'` plus Instanzen mit fälligen Wanduhr-Regeln (`instances.clock_due_at <= now()`). `due_at` und `clock_due_at` werden von `advance_clock`, `submit_action` und dem Herzschlag laufend neu berechnet. Der Tick scannt also **keine** Tabellen vollständig.
3. Ruft für jede gefundene Instanz `advance_clock` und `dispatch_if_due` auf (begrenzt, z. B. höchstens 50 je Tick, Rest im nächsten Tick).
4. Schließt hängende Aufträge: `claimed` mit abgelaufener Lease werden wieder `pending`.

Fallback, falls Sekundenintervalle nicht möglich sind: Minutentakt. Dann verzögert sich nur der Fall „Spieler sind weg, Runde hing in der Schwebe“ um bis zu 60 s. Sobald ein Client verbunden ist, laufen Auslöser 1 und 2 sofort.

### A.4 Aufruf der Edge Function `resolve-round`

- **Ja, `pg_net` ist geeignet** [A: Erweiterung verfügbar, Version 0.20.4, nicht installiert]. `net.http_post(url, body, headers, timeout_milliseconds)` ist **asynchron**: Der Aufruf wird beim Commit der aufrufenden Transaktion eingereiht und von einem Hintergrundprozess gesendet. Er liefert eine Request-ID, kein Ergebnis. Antworten landen kurzlebig in `net._http_response` und dienen **nur** der Fehlersuche. **Maßgeblich ist nie die HTTP-Antwort, sondern der Zustand in der Datenbank** (`resolve_jobs.status`, Rundennummer).
- **Body:** nur `{instance_id, fight_id, round_no}`. Keine Spielzustände, keine Entscheidungen.
- **Authentifizierung (zweistufig):**
  1. Standard-JWT-Prüfung der Plattform bleibt an (Header `Authorization: Bearer <anon key>`, öffentlicher Schlüssel, filtert nur grobe Fremdaufrufe).
  2. **Geheimnis-Header** `x-rw-secret`: ein zufälliger Wert (≥ 32 Byte). In der Datenbank im **Vault** (`supabase_vault`, installiert [V]) gespeichert, in der Edge Function als Funktionsgeheimnis hinterlegt. Die Funktion prüft ihn **zuerst**, mit konstantem Zeitvergleich, und beendet sich bei Fehler sofort (401). Rotation in zwei Schritten (beide Werte kurzzeitig akzeptieren).
  3. Die Edge Function greift mit dem Service-Role-Schlüssel (Plattform-Umgebungsvariable) auf `claim_resolution` und `commit_round` zu. Beide Funktionen sind nur für `service_role` ausführbar (Muster `purge_expired_backups` [V]). Clients haben **keinen** Weg, die Edge Function oder diese RPCs zu nutzen.
- Anders als in Fassung 1 skizziert gibt es **keinen** vom Client ausgelösten Aufruf der Edge Functions. Auch die Profilableitung (Abschnitt L) läuft als datenbankausgelöster Auftrag gleicher Art. Das verkleinert die Angriffsfläche und vereinfacht die Fehlerfälle.

### A.5 Fehlerfälle

| Fall | Verhalten |
|---|---|
| **Timeout** der Edge Function | Der Auftrag bleibt `claimed`, bis die Lease (z. B. 30 s) abläuft. Danach `pending`, nächster Auslöser sendet erneut. Nichts ist gespeichert, bis `commit_round` erfolgreich war. Das Neuberechnen liefert dasselbe Ergebnis (E.3) |
| **Fehler in der Engine** (Ausnahme) | Kein Commit. `attempts+1`, `last_error` gesetzt. Wiederholung mit Wartezeit (5, 10, 20, 40, 60 s). Nach z. B. 8 Versuchen `stuck`: Eintrag in `ops_alerts`, weiter Wiederholung alle 5 Minuten. Ein **deterministischer** Fehler wiederholt sich bei jedem Versuch. Er endet erst mit einem Engine-Hotfix (E.1: Version darf sich während einer hängenden Runde ändern) oder einem Eingriff durch dich. Die Behandlung einer dauerhaft hängenden Instanz steht in **A.6**. Ihre **Belohnungsfolge** ist offene Entscheidung D1 (P). Bei Weltboss-Instanzen gewinnt das Eventende immer (Abschnitt K) |
| **Mehrfachaufruf** gleichzeitig | Der zweite Aufruf erhält bei `claim_resolution` die Antwort `busy` (Lease aktiv) oder `already_resolved`. Er rechnet nichts |
| **Mehrfachaufruf** nach Abschluss | `already_resolved`, keine Wirkung |
| **Edge Function nicht erreichbar** | `pg_net` meldet Fehler in `_http_response`, der Auftrag bleibt `pending`, Wiederholung wie oben. Alle SQL-Regeln laufen weiter (`advance_clock`, Abwesenheit, Event-Ende). Die Runde bleibt **offen und überfällig**. `submit_action` lehnt neue Aktionen ab (Stichtag ist `phase_deadline`, nicht der Zeitpunkt der Auswertung). Die Oberfläche zeigt „Auswertung verzögert“ |
| **Dauerhafter Ausfall der Edge Function** | Rückfall-Entscheidung: Engine nach SQL (Variante A aus Fassung 1). Das ist die Absicherung, kein Normalbetrieb |

### A.6 Dauerhaft hängende Instanz (Behandlung zu R21)

Gilt, wenn ein Auftrag `stuck` ist (A.5), z. B. durch einen deterministischen Engine-Fehler oder wiederholt abgewiesene Invarianten. **Keine neue Spielregel:** Die Schritte 1 bis 3 und 5 sind Betrieb. Nur die **Belohnungsfolge** von Schritt 4 (`technical_end`) ist Entscheidung D1 (Abschnitt P). („Schritt“ ist hier nicht mit den Charakterprüfungs-Stufen aus B.3 zu verwechseln.)

1. **Erkennen.** Ein Auftrag `resolve_jobs` (oder ein Ableitungsauftrag, L) im Status `stuck` setzt `instances.engine_stuck = true` und schreibt `ops_alerts`. Dieser Zustand wird von dir sichtbar überwacht (M, Punkt 15).
2. **Spieler nicht benachteiligen.** Solange `engine_stuck` gilt, ist für diese Instanz `effective_last_seen = jetzt` (derselbe Mechanismus wie das Störungsfenster, F, nur je Instanz). Damit laufen Abwesenheit, Pausenbudget, Bereitschaft und die 20-Sekunden-Regel nicht weiter. Niemand wird entfernt, erhält AFK-Folgen oder verliert eine Berechtigung. Der Fristenstopp gehört zu **T1** (D2). Die Oberfläche zeigt „Auswertung verzögert“. **Ausnahme:** Das Weltboss-Eventende bleibt absolut (K).
3. **Beheben.** Die Eingabe der Runde (Snapshot, Zustand, Seed, `cfg_version`) liegt gespeichert vor (E.5). Der Fehler wird damit offline reproduziert und per Engine-Hotfix behoben. Da `engine_version` nur gespeichert wird (E.1), löst die nächste Wiederholung die Runde regulär. `commit_round` setzt dann `engine_stuck = false`, die Fristen laufen mit der Restzeit weiter.
4. **Kein Hotfix innerhalb der Zeit H** (Wert ist D4): Operator-Aufruf `ops_close_instance(instance, grund)`, nur `service_role`, protokolliert, idempotent, Endzustand `technical_end`. Technische Wirkung: kein weiterer Kampf, offene Claims entwertet, bereits gebuchte Einträge bleiben. Die **Belohnungsfolgen** sind **D1** und werden hier nicht entschieden. **Bis D1 entschieden ist:** In Phase 1 (nur Bots) ist `technical_end` zulässig. In Phase 2 (echte Spieler) ist er **gesperrt**. Stattdessen gibt es den Not-Aus `ops_freeze_instance(instance, grund)` (Endzustand ist **nicht** gesetzt): Die Instanz bleibt unverändert, ohne laufende Fristen, ohne neue Buchungen. Die Spieler sehen „pausiert durch Betreiber“. Die Korrektur erfolgt manuell durch dich. Für Weltboss gilt auch hier das Eventende (K).
5. **Vorbeugen.** Engine-Szenariotests, Invarianten (E.5), Not-Aus je Instanz (I.1, Punkt 8).

**Zwei Doppelverarbeitungs-Sperren (unabhängig voneinander):** (1) `claim_resolution` vergibt unter Zeilensperre genau **ein** gültiges Token je Runde, `commit_round` akzeptiert nur dieses Token. (2) `unique (fight_id, round_no)` auf der Ergebnistabelle `round_results` verhindert ein zweites Ergebnis selbst bei einem Fehler in (1).

---

## B. Charakterdaten und Manipulationsschutz

### B.1 Was der Client heute selbst kontrolliert (aus Code und Schema)

Der Server speichert `character_data` **unverändert**. `save_character` prüft nur JSON-Objekt, Größe, Version, Eigentümer und leitet `character_class`/`level` ab (`safe_class` akzeptiert **jeden** Namen `[a-z_]{1,30}`). Die Bereinigung (`sanitize`, Z. 842) läuft **im Client** und ist damit kein Schutz.

| Datenfeld | Wert, den der Client setzen kann | Quelle |
|---|---|---|
| Level `lv` | 1–50 beliebig (XP unabhängig) | `sanitize`, `safe_level` |
| Klasse `cls` | jede der 5 Klassen, Klassenwahl ab Stufe 5 nicht erzwungen | `sanitize` |
| Pfad `path` | jeder der 12 Pfade, **ohne Prüfung gegen die Klasse** | `sanitize` |
| Stufe `tier` | 0–3, **ohne Prüfung gegen Level, Klassenquest oder geheime Bedingung** | `sanitize`; Prüfung nur in `canUp` (Client) |
| Freischalt-Nachweise `stats.*`, `qb` | beliebige Zähler bis 1e9 (Grundlage von `SECRET`, `UPQ`) | `sanitize` |
| Ausrüstung `gear` | beliebige Einträge `{u,b,q,p}`: `b` muss gültige Basis-ID sein, `q` 0–4, `p` 0–10. **Kein** Bezug zu Besitz, Herkunft, Material | `sanitize` |
| Angelegt `eq` | Platz und Slot müssen passen. **Klassen-/Level-/Pfadregeln (`canEquip`) nur im Client** (`fixEq` beim Laden) | `sanitize`, `fixEq` |
| Zusätzliche Verteidigung `def` | bis 1e6, **fließt in `defense()` ein** (Altfeld, im Spiel auf 0 gesetzt) | `sanitize`, Z. 946 |
| `hp`, `en` | `hp` bis 1e6, `en` bis 100 | `sanitize` |
| Inventar `inv`, Münzen `cu` | bis 1e7 je Gegenstand, 1e12 Münzen | `sanitize` |
| Abklingzeiten, Schild, Betäubung, Erschöpfung | frei (nur Echtzeitkampf) | `S.scd`, `S.shield`, `S.stun` |

### B.2 Grundprinzip: Whitelist-Profil statt Vertrauen

Der Server baut das Kampfprofil **ausschließlich** aus fünf Eingaben: `lv`, `cls`, `path`, `tier`, und den **angelegten** Gegenständen `eq → gear`. Alles andere wird **ignoriert**: `hp`, `en`, `def`, `inv`, `cu`, `stats`, Abklingzeiten, Schild, Betäubung. Aus diesen fünf Eingaben berechnet er HP, Angriff, Verteidigung und Krit mit den kopierten Formeln (Fassung 1, Abschnitt 3). Der Client schickt dem Server nie Kampfwerte. **Wann und wo** das Profil entsteht (nicht beim Beitritt, sondern bei jeder Bereitschaft, in der Edge Function aus der Server-Kopie des Charakters), regelt Abschnitt L.

### B.3 Drei Stufen

**Stufe 1: Sofort umsetzbare Plausibilitätsprüfungen (reine Serverlogik, kein Umbau des Charaktersystems)** **[E]**

| Prüfung | Regel (aus dem vorhandenen Code übernommen) |
|---|---|
| Level und Klasse | 1 ≤ `lv` ≤ 50. Klasse ist eine der 4 Grundklassen. Instanzzugang ab Stufe 5 nach Klassenwahl (Plan 1a) |
| Spezialisierung | `PATHS[path].b === cls`. `tier ≤ 3`. Für `tier ≥ t` gilt `lv ≥ UP_LV[t−1]` (15/30/50). `tier = 0` ohne Pfad |
| Fähigkeiten | Abgeleitet, nicht geliefert: Klassenfähigkeiten mit `lv ≤ S.lv`, Pfadfähigkeiten der Stufen `≤ tier` (wie `effClass`). Eine „gelieferte“ Fähigkeitsliste existiert nicht |
| Ausrüstung | Jede Basis-ID wird mit dem kopierten `getBase` geparst. `q ∈ 0..4` (`fixedQ`-Gegenstände: erzwungen). `p ∈ 0..10` (`UPMAX`). `u` eindeutig. `eq`-Verweise gültig und Slot passend |
| Anforderungen | `lv ≥ lvReq` je Gegenstand. `canEquip`: Waffen-/Nebenhand-/Rüstungstyp zur Klasse, Pfad-Set nur bei passendem Pfad und Stufe |
| Waffen-/Rüstungswerte, Set-Boni | werden **berechnet** (`gStats`, `SB`), nie übernommen. Set-Zählung nur über validierte Slots |
| Grenzen | Alle Werte sind damit durch die Formeln nach oben begrenzt |

**Ergebnis:** Der schlimmste Fall ist nicht „unendliche Werte“, sondern „bestmögliche **legitim erreichbare** Ausrüstung für Klasse und Level“.

**Stufe 2: Besitz- und Herkunftsprüfung (notwendig für echte Sicherheit)**
Der Server müsste wissen, **woher** ein Gegenstand kommt. Das ist heute nicht möglich: Drops, Herstellung, Verbesserung, Handel und Händlerkauf geschehen im Browser mit `Math.random` (`rollGear`, `craftGear`, `upgradeGear`, `shopInfo`). Der Server sieht nur das fertige Dokument. Zwei begrenzte Zwischenlösungen:

| Maßnahme | Wirkung | Grenze |
|---|---|---|
| **Gegenstands-Fingerabdruck** `item_seen(character, uid → b, q, max p, erstmals gesehen)`, geprüft bei jedem `save_character`: ein bekannter `u` darf `b` und `q` nie ändern, `p` nur erhöhen. Zunächst nur **protokollieren** (Beobachtungsmodus) | erkennt das nachträgliche Umschreiben eines vorhandenen Gegenstands und Sprünge bei `p` | Neue Gegenstände mit neuer `u` bleiben unprüfbar. Wer vor der Erstregistrierung eintrügt, ist nicht erfasst |
| **Instanz-Belohnungstabelle `rewards`** (vormals Ledger, Fassung 1): Belohnungen aus Instanzen sind serverseitig ausgestellt und eindeutig | Instanzbeute ist echt | betrifft nicht den übrigen Bestand |

**Stufe 3: Langfristig nötige Änderungen am Charakterspeicher**

| Option | Inhalt | Aufwand |
|---|---|---|
| **C1 Signierte Gegenstände** | Der Server stellt Instanz- und Händlergegenstände mit HMAC-Signatur (`uid`, `b`, `q`, `p`, Konto) aus. Verbessern geht nur über Server-RPC. Instanzen akzeptieren nur signierte Gegenstände | mittel, ändert nur die Gegenstandsdaten und Upgrade |
| **C2 Besitz im Server** | Tabellen `character_items`, `character_wallet`, `character_inventory`. Jede Änderung (Drop, Herstellung, Upgrade, Verkauf, Münzen) ist ein Server-Aufruf mit Serverzufall. Der Client hält nur einen Cache | **hoch**: berührt Echtzeitkampf-Beute, Handwerk, Händler, Synchronisation, Offline-Spielen |
| **C3 Serverseitige Weltbeute** | Weltmonster-Drops serverbewertet | sehr hoch, außerhalb dieses Projekts |

### B.4 Inventargegenstände im Kampf
- Die **3 Heiltränke** je Instanz werden vom Server ausgegeben (Plan 1c), unabhängig vom Inventar `S.inv.trank`. Es gibt **keine** Abhängigkeit vom Client-Inventar.
- Das **Wiederbelebungsitem** existiert im Code nicht (`ITEMS` enthält keines [V]). Der Plan setzt voraus, dass es **besessen** werden muss. Das braucht serverseitig geführten Besitz (C2) oder Ausgabe über den Server. **Technische Folge:** In den Freigabephasen 1 und 2 (I.2) ist es nicht verfügbar. Das ändert keine Regel des Plans.

### B.5 Was nach Stufe 1 (und Beobachtungsmodus) weiterhin möglich bleibt

1. Eintragen **beliebiger neuer** Gegenstände innerhalb der Grenzen (beste Ausrüstung für Level und Klasse, Qualität „Legendär“, `+10`).
2. Freies Wählen von Klasse und Pfad (innerhalb der Levelgrenzen), Überspringen der **geheimen** Bedingungen und Klassenquests (`stats` sind Client-Zähler).
3. Level bis 50 ohne Erfahrung.
4. Mehrfachkonten, Bots, Automatisierung von Aktionen.
5. Aufblähen von Münzen, Erfahrung und Inventar **außerhalb** von Instanzen (wirkt nicht auf Instanzbelohnungen).
6. Zeitliche Vorteile innerhalb der 60 s (die Ankündigung ist per Plan sichtbar).

**Nicht mehr möglich:** eigene Schadens-, HP-, Energie-, Krit-, Initiative-, Status- oder Abklingzeitwerte, doppelte oder verspätete Aktionen, vorhersagbare Krits (Seed ist für Clients unlesbar), erfundene Instanzbelohnungen, Doppelauszahlung.

### B.6 Bewertung: Erster PvE-Instanztest ohne Umbau des Charaktersystems?

**Ja.** Unter diesen Bedingungen (Freigabephase 2):
- Stufe-1-Prüfungen aktiv, Fingerabdruck im Beobachtungsmodus.
- **Eingeschränkte Belohnungen:** nur Kampf-EP und persönliche Münzen mit serverseitigen Obergrenzen je Instanz und Tag. **Keine Gegenstände** (oder nur markierte Testgegenstände) und kein Wiederbelebungsitem.
- **Geschlossener Teilnehmerkreis** (Allowlist), damit Manipulation sozial, nicht technisch begrenzt ist.
- Keine Marktfunktion existiert [V] (`BESTANDSAUFNAHME`: kein Handel), also kein Schaden für eine Spielerwirtschaft.

Das gesamte Charaktersystem muss dafür **nicht** umgebaut werden. Für den **öffentlichen** Betrieb mit Gegenstandsbelohnungen und Ranglisten ist mindestens C1, besser C2, nötig.

---

## C. Belohnungszustellung

### C.1 Prüfung des Ablaufs aus Fassung 1 (`claim_rewards` → Client speichert → `ack_rewards`)

| Szenario | Ergebnis in Fassung 1 | Bewertung |
|---|---|---|
| Mehrere Geräte | beide holen denselben Eintrag, beide wenden an | Doppelanwendung möglich, wenn beide Dokumente später zusammenlaufen. Konfliktlösung (`acConflict*`) wählt jedoch **ein** Dokument, die Wirkung bliebe praktisch einfach. **Aber** unklar und nicht garantiert |
| Mehrere Tabs | `tlBeat` [V] erlaubt nur einem Tab zu schreiben | Schutz vorhanden, aber nur im Client |
| Wiederhergestellte Sicherung | Wirkung und `rclaimed` gehen verloren, Server hat bereits bestätigt | **Verlust** der Belohnung |
| Absturz zwischen Schritten | siehe C.4 | in Fassung 1 nicht vollständig behandelt |
| Wiederholte Requests | `claim` liefert dasselbe erneut | ok, aber ohne Sperre |
| Manipulierte `rclaimed` | Eintrag löschen → erneute Anwendung, solange nicht bestätigt | begrenzt, aber nicht ausdrücklich |

### C.2 Verfahren (einfach, mit Lease)

Eine Tabelle `rewards` (**ersetzt** `reward_ledger` und `reward_inbox` aus Fassung 1; die Zeile selbst ist zugleich Ausstellungsnachweis, `issued_at` bleibt auch nach `acked` erhalten und wird nur mit der Konto-Löschung entfernt):

| Feld | Bedeutung |
|---|---|
| `reward_id` (Primärschlüssel) | **eindeutig, deterministisch** aus Fassung 1: `ep:{instanz}:{kampf}:{charakter}`, `final:{instanz}:{charakter}` (inkl. Münzen), `dungeonloot:{instanz}:{kampf}:{eintrag}`, `bossloot:{instanz}:{bosskampf}:{eintrag}` (der Eintrag ist je Empfänger eindeutig). Maßgeblich ist der **Charakter** (das Instanzmitglied), nicht das Konto, weil `S.rcl` im Dokument des einzelnen Charakters liegt |
| `character_id` | Empfänger. `claim_rewards` liefert nur Einträge des **gerade aktiven** Charakters (sonst würde ein anderer Charakter desselben Kontos die Belohnung anwenden und bestätigen) |
| `kind` | `ep` / `coins` / `item` |
| `payload` | Betrag bzw. Gegenstand (`b`, `q`; nie vom Client wählbar) |
| `status` | `issued` → `leased` → `acked` |
| `lease_token`, `lease_until`, `leased_by` (Gerät/Sitzung) | |

Ablauf:
1. **Ausstellung** in `commit_round`/Abschluss in derselben Transaktion (`ON CONFLICT DO NOTHING`). Jede `reward_id` entsteht **höchstens einmal**.
2. **`claim_rewards(character_id, device_id)`** (der Charakter muss dem angemeldeten Konto gehören) vergibt unter Zeilensperre `status='leased'` mit Token und `lease_until = now()+10 min` an **ein** Gerät. Ein anderes Gerät erhält diese Einträge erst nach Ablauf der Lease oder nach `ack`. Wiederholter Aufruf desselben Geräts liefert dieselben Einträge mit **demselben** Token.
3. **Client** prüft jede `reward_id` gegen `S.rcl` (Liste zuletzt angewendeter IDs im Charakterdokument, begrenzt auf z. B. 200). Fehlt sie: Wirkung anwenden und ID eintragen. Ist sie schon enthalten: **nicht erneut anwenden**.
4. **Speichern:** Erst wenn `syncPush` die Cloud-Version **mit** dieser `rcl` bestätigt hat, ruft der Client `ack_rewards(ids, token)`. Der Server setzt `acked`.
5. Wird nicht bestätigt, läuft die Lease ab, der Eintrag wird erneut angeboten. Der Client erkennt die ID in `S.rcl` und bestätigt ohne erneute Anwendung.
6. **`ack_rewards` gilt für jeden eigenen, noch nicht bestätigten Eintrag**, auch mit einem früheren Lease-Token (ein spätes `ack` eines Geräts, dessen Lease inzwischen abgelaufen ist, ist gültig und idempotent). Das Token dient nur der **Exklusivität** der Auslieferung, nicht der Sicherheit. `device_id` ist vom Client frei wählbar und deshalb **kein** Sicherheitsmerkmal.
7. **`S.rcl` wird nur um IDs gekürzt, die der Server als `acked` gemeldet hat.** Unbestätigte IDs bleiben, auch wenn die Liste über 200 wächst. Der Server begrenzt die Zahl **unbestätigter** Einträge je Charakter (Konfiguration) und fasst darüber hinaus Kampf-EP-Einträge nicht zusammen, sondern stellt keine weiteren aus, bevor abgeholt wurde. [A: Obergrenze groß genug, dass sie im Normalbetrieb nie erreicht wird]

### C.3 Garantien (ehrlich)

| Ebene | Garantie |
|---|---|
| Ausstellung auf dem Server | **höchstens einmal** je `reward_id` (Primärschlüssel, Transaktion). Technisch belastbar |
| Markierung „zugestellt“ | höchstens einmal (`acked` ist endgültig) |
| Wirkung im Charakterdokument | **mindestens einmal** angeboten, durch `S.rcl` **in der Praxis einmal** angewendet. **Keine** Exactly-once-Garantie, weil das Dokument vom Client gespeichert wird und zwischen „Server hat geliefert“ und „Dokument gespeichert“ keine gemeinsame Transaktion existiert |

**Bleibende Fehlermöglichkeiten:**
- **Wiederhergestellte Sicherung nach `ack`:** Die Belohnung ist im Dokument weg, aber server-seitig `acked`. Es gibt **keine automatische Wiedergewährung** (das würde Wiederholungsfarmen ermöglichen). Der Ausstellungsnachweis bleibt für manuelle Korrektur im Support.
- **Löschen oder Fälschen von `S.rcl`:** Löscht der Spieler Einträge, wird eine **noch nicht bestätigte** Belohnung höchstens erneut angewendet, nach `ack` nie wieder angeboten. Ein Bestätigen ohne Anwenden schadet nur ihm selbst. Eine **nicht ausgestellte** ID kann nie eingelöst werden (der Server liefert nur eigene Einträge).
- **Direkte Dokumentänderung** (Münzen/XP/Gegenstände ohne Instanz) bleibt unverändert möglich (B.5). Die Zustellung kann das nicht verhindern.

### C.4 Absturzfälle

| Absturz nach … | Folge |
|---|---|
| `claim` vor Anwendung | Lease läuft ab, erneut angeboten |
| Anwendung, lokalem Speichern, vor Cloud-Sync | kein `ack`, Lease läuft ab, Client sieht ID lokal in `S.rcl` (falls lokal erhalten) und wendet nicht doppelt an. Verlorener lokaler Stand: erneut angeboten, einmal angewendet |
| Cloud-Sync, vor `ack` | erneut angeboten, ID bereits in `S.rcl`, nur `ack` |
| `ack` | fertig |
| Konfliktlösung wählt den Cloud-Stand **ohne** die Wirkung | `S.rcl` ebenfalls verworfen, Eintrag noch nicht `acked`, erneut angeboten, einmal angewendet |
| Konfliktlösung nach `ack` verwirft die Wirkung | Verlust (Kombination aus Konfliktwahl und früherem `ack`) |

Gegen den letzten Fall hilft nur die Regel: `ack` erst nach Bestätigung der Cloud-Version, und die Konfliktwahl danach bleibt Nutzerentscheidung (vorhandenes Verhalten [V]).

### C.5 Unterschiede nach Belohnungsart

| Art | Anwendung im Client | Besonderheit |
|---|---|---|
| **Kampf-EP** | `addXP(n)` (Levelaufstieg, Stufe-50-Deckel setzt XP auf 0 [V]) | Mehrere kleine Einträge je Kampf, unabhängig. Wirkung bleibt bei Niederlage/Abbruch (Plan). Verlust einzelner EP bei Rückgriff auf Sicherung ist geringfügig |
| **Persönliche Münzen** | `earn(n)` (`S.cu += n`) | Teil des `final`-Eintrags, kein gemeinsamer Pool. Obergrenze je Instanz serverseitig im Test |
| **Gegenstände** | `addGear(b, q)` erzeugt **lokal** `u = ++S.gid` | Die Server-`reward_id` ist die Identität. Das lokale `u` ist nur Anzeige. Im Test zunächst **nicht** ausgeben (siehe B.6). Später signiert (C1) |

Die Reihenfolge innerhalb von `final` ist unerheblich. Jeder Eintrag wird einzeln gebucht.

---

## D. Disconnect-Regel „20 Sekunden“ in der Rundenmaschine

Plan 1, „Dauerhaft getrennte Spieler und Rundentempo“, Regeln 3–9. Technische Einordnung:

### D.1 Begriffe (aus `last_seen_at`, keine neuen Regeln)
- `seit = now() − last_seen_at`. Überall in diesem Bericht steht `last_seen_at` für `effective_last_seen` (F, A.6): also `max(last_seen_at, Ende des jüngsten Störungsfensters)`, bei `engine_stuck` die aktuelle Zeit.
- **verbunden:** `seit ≤ T_conn` (technische Toleranz für verpasste Signale, Plan Regel 9). `T_conn` ist deutlich **kleiner als 20 s**.
- **dauerhaft getrennt:** `seit ≥ 20 s` ununterbrochen. Zwischen `T_conn` und 20 s: nicht verbunden, aber noch **kein** Ausschluss aus der Wartepflicht.

### D.2 Frühzeitige Fälligkeit
Eine Planungsphase ist **vorzeitig fällig**, wenn gleichzeitig gilt:
1. mindestens **ein Gruppenmitglied verbunden** ist (auch ein toter; sonst Gruppenpause statt Auflösung),
2. jeder **lebende** Spieler entweder bestätigt hat **oder** dauerhaft getrennt ist (≥ 20 s).

Sonst wird sie spätestens bei `phase_deadline` (60 s) fällig. `fights.due_at = min(phase_deadline, early_due_at)`; `early_due_at` ist der früheste Zeitpunkt, an dem 1 und 2 zusammen gelten (letzte Bestätigung bzw. `last_seen_at + 20 s` des letzten Blockierers). Er wird bei Bestätigung, Herzschlag und `advance_clock` neu berechnet. Der Watchdog erkennt dadurch die Fälligkeit **ohne** Spielerverkehr.

### D.3 Wo es in die Maschine gehört (`planning → resolving → commit`)

`closing` ist **kein gespeicherter Zustand**. Gemeint ist nur der Zeitraum, in dem eine Runde in `planning` steht und `due_at` erreicht ist, aber noch kein Claim erfolgte. In diesem Zeitraum nimmt `submit_action` keine Aktionen mehr an (Stichtag `phase_deadline` bzw. Fälligkeit).

| Stelle | Aufgabe |
|---|---|
| `submit_action` / Herzschlag / `advance_clock` | `due_at` neu berechnen. Wiederverbinden schiebt `early_due_at` zurück oder löscht es (Regel 6) |
| `dispatch_if_due` | sendet nur, wenn `due_at <= now()` |
| **`claim_resolution` (maßgeblich)** | Unter Zeilensperre wird die Bedingung **erneut** geprüft („unmittelbar vor Beginn der Auflösung“, Regel 6). War nur die vorzeitige Regel der Grund und ist inzwischen ein Blockierer wieder verbunden und unbestätigt, antwortet `claim_resolution` mit `not_due`, die Planung läuft bis zu 60 s weiter. Sonst: Phase wechselt auf `resolving`, **ab jetzt werden keine Aktionen mehr angenommen** |
| Snapshot im Claim | Der Verbindungszustand je Mitglied (verbunden/getrennt) und die bestätigten Aktionen werden im Claim **eingefroren** (`resolution_claims.snapshot`). Die Engine liest nur diesen Snapshot |
| `resolveRound` | Bestätigte Aktionen bleiben unverändert (Regel 7). Für lebende Spieler **ohne** bestätigte Aktion entsteht der **Standardangriff** (Herkunft „automatisch“, Plan Block 2) |
| `commit_round` | speichert, Herkunft im Protokoll |

Wiederverbindet sich ein Spieler **nach** dem Claim, aber vor dem Commit, gilt für diese Runde der Snapshot (seine Aktion ist wie nach Ende der Planung „verspätet“, Plan Regel 1). Das entspricht „tatsächliche Auflösung“ = Beginn des Claims.

Diese Regel ist ausschließlich eine Rundentempo-Regel (Regel 8). Sie berührt weder Belohnungsberechtigung noch AFK.

---

## E. Atomarität und Wiederherstellung

### E.1 Vollständiger Ablauf (vom Lesen bis zum Commit)

1. **Auslöser** (A.2) legt/aktualisiert den Auftrag und sendet über `pg_net`.
2. **Edge Function** prüft Geheimnis-Header, dann Body.
3. **`claim_resolution(instance, fight, round)`** (SQL, Transaktion 1):
   - `SELECT … FOR UPDATE` auf der Instanzzeile,
   - Prüfung: Instanz nicht beendet (kein Endzustand wie `event_ended`, `aborted`, `technical_end`, abgeschlossen) und nicht `frozen`, Weltboss: K.2, Runde ist die aktuelle, **und** entweder Phase `planning` und fällig (D.3, Chronologie-Regel A.1) **oder** Phase `resolving` mit **abgelaufener** Lease (dann wird der **gespeicherte Snapshot unverändert** erneut verwendet, nur ein neues Token vergeben). Ein Claim mit gültiger Lease ergibt `busy`,
   - Snapshot einfrieren, Phase `resolving`, `claim_token` erzeugen, `lease_until = now()+30 s`,
   - Rückgabe: Kampfzustand, Mitglieder, bestätigte Aktionen, Snapshot, Seed, `cfg_version`, `round_version`. Danach **Sperre frei**.
4. **`resolveRound(state, snapshot, seed, cfg)`** in der Edge Function: **reine** Funktion. Keine Sperre, kein Datenbankzugriff.
5. **`commit_round(claim_token, expected_round_version, ergebnis)`** (SQL, Transaktion 2):
   - `FOR UPDATE` auf der Instanzzeile,
   - Token ist das aktuelle (**auch bei abgelaufener Lease**, solange noch kein neuer Claim es abgelöst hat, denn das Ergebnis ist deterministisch), `round_version` stimmt, `input_hash` stimmt überein. `claim_resolution` berechnet `input_hash` in SQL über die Daten, die es herausgibt, und speichert ihn. Die Edge Function schickt ihn nur zurück. Er erkennt Verwechslungen und Änderungen der Eingabe, **keine** falschen Ergebnisse (E.5). Die **`engine_version` wird nicht verglichen, sondern in `round_results` gespeichert**. So bleibt ein Hotfix der Engine bei einer hängenden Runde möglich,
   - **Invarianten** (Engine ist nicht blind vertraut): HP ≥ 0 und ≤ Maximum, Energie ≥ 0, Aktionen nur bestätigter Mitglieder, keine Statusänderung außerhalb der Konfiguration, `reward_id`-Schlüssel gültig, weitere Invarianten in E.5,
   - schreibt Ereignisprotokoll, neuen Kampfzustand, Mitgliedsfelder, Aktionsstatus, Wiederbelebungsfenster, `round_results`, Belohnungen (`ON CONFLICT DO NOTHING`), setzt nächste Phase und Frist (`now() + Dauer`), erhöht `round_version`, markiert den Auftrag `done`,
   - bei Weltboss: Zeitprüfung gegen `ends_at` mit `clock_timestamp()` **nach** Erhalt der Sperre, in derselben Transaktion, die das Ergebnis speichert. Verbindliche Regeln: **Abschnitt K**.

### E.2 Versionen und Sperren
- **Eine** Sperre je Vorgang: die Instanzzeile, **kurz**. Es wird **nie** eine Sperre über die Berechnung oder den HTTP-Aufruf gehalten.
- **Zeitquelle:** `now()` ist in Postgres der **Beginn der Transaktion**. Für jede Prüfung gegen eine absolute Zeit (Eventende, Fristen am Claim-/Commit-Zeitpunkt) gilt `clock_timestamp()` **nach** Erhalt der Zeilensperre. `now()` genügt nur für „ungefähr jetzt“ (Lease-Dauer, Wiederholintervalle).
- `round_version` ändert **nur** `claim_resolution` und `commit_round`. Herzschlag, Abwesenheitsmarken und `pending_removal` ändern sie **nicht**. Dadurch scheitert ein Commit nicht, nur weil währenddessen ein Herzschlag eintraf.
- Fristen, die während `resolving` fällig werden (z. B. Abwesenheit), werden als `pending_removal` vermerkt und an der nächsten Grenze angewendet (A.1).

### E.3 Zufall ohne Neuziehen
- Jede Zufallszahl ist `HMAC(seed, strom ‖ kampf ‖ runde ‖ ziehungsnummer)`. Die **Ziehungsnummer** wird **je Rundenauflösung bei 0 begonnen** und von der Engine deterministisch hochgezählt (Reihenfolge ergibt sich aus der Initiative, Gleichstände deterministisch nach Mitglieds-ID).
- Es gibt **keinen** gespeicherten globalen Zähler. Ein erneuter Versuch derselben Runde liefert deshalb **bit-genau dieselben** Zufallszahlen. Das ersetzt `rng_counter` aus Fassung 1.
- Voraussetzung: `resolveRound` ist rein und hängt nur ab von `(state, snapshot, seed, cfg_version, engine_version)`. Durchgesetzt durch einen **Determinismus-Test** (zweimal rechnen, Hashes gleich), das Verbot von `Date`/`Math.random` im Engine-Modul und `input_hash` im Claim (`engine_version` wird mit dem Ergebnis gespeichert).
- **Numerischer Determinismus über Laufzeiten:** Die Engine läuft in Tests unter Node und im Betrieb unter Deno (M, Punkt 7). Gleitkomma-Bibliotheksfunktionen (`Math.pow`, `exp`, `log`, `sin` usw.) sind zwischen Laufzeiten **nicht** bitgleich garantiert. Deshalb gilt: Die Engine nutzt nur `+ − × ÷`, `floor`, `round`, `min`, `max`, möglichst ganzzahlig. Die HMAC-Ausgabe wird per Ganzzahlarithmetik in eine Zahl umgewandelt. Der Determinismus-Test läuft in **beiden** Laufzeiten gegen dieselben erwarteten Hashes.
- Beute-Auslosung (Instanzabschluss) nutzt dieselbe Technik mit Strom `dungeon_pool`/`boss_pool` und Ziehungsnummer aus (Kampf, Eintrag, Kandidat), das Ergebnis steht zusätzlich in der `rewards`-Zeile (nie neu gewürfelt).
- Konfigurationsänderungen während einer Instanz dürfen das Ergebnis eines Wiederholungsversuchs nicht verändern: `cfg_version` wird beim Anlegen der Instanz festgeschrieben, Konfigurationszeilen sind versioniert und nie überschrieben.

### E.4 Absturzfälle

| Absturz | Folge |
|---|---|
| vor dem Claim | nichts geschehen, Auftrag bleibt `pending`, erneut versendet |
| nach Claim, vor Berechnung | Lease läuft ab, nächster Claim liefert **denselben Snapshot** (gespeichert), gleiche Berechnung |
| **nach Berechnung, vor Commit** | Ergebnis ging verloren. Neuer Claim, **identische** Berechnung (E.3), identisches Ergebnis. Nichts war gespeichert, also nichts doppelt |
| **während des Commits** | Transaktion wird zurückgerollt (alles oder nichts) |
| Commit erfolgt, Antwort verloren | nächster Versuch: `already_resolved`, keine Wirkung |
| zwei Instanzen der Funktion gleichzeitig | zweite erhält `busy` (Lease) |
| abgelaufene Lease, alter Worker meldet später | **Nach** einem neuen Claim: `commit_round` lehnt das alte Token ab (`superseded`). **Vor** einem neuen Claim: der Commit wird angenommen (E.1) |
| Datenbankneustart | alles Persistente bleibt. Laufende Aufträge werden nach Lease-Ablauf neu gestartet |

**Grenze:** Dass die Engine bei gleicher Eingabe gleich rechnet, ist eine **Bedingung**, die getestet werden muss, keine Eigenschaft der Plattform.

### E.5 Grenzen der Invarianten (zu R15 und R16)

**Befund:** Die Invarianten in E.1 (HP-Bereich, Energie ≥ 0, nur bestätigte Aktionen) fangen **ungültige Zustände**. Sie verhindern **nicht** ein falsches, aber gültiges Ergebnis (z. B. 12 statt 15 Schaden, falsches Ziel, falscher Kritwurf, fehlender Statuseffekt). Das ist mit SQL-Prüfung nicht zu leisten, ohne die Engine ein zweites Mal zu schreiben. Eine Behauptung, Invarianten verhinderten falsche Ergebnisse, gilt hier **nicht**.

**Was tatsächlich getan wird:**
1. **Stärkere Konsistenzinvarianten** (SQL, billig): HP-Änderung je Mitglied = Summe der protokollierten Schäden/Heilungen/Erstattungen. Energieänderung = Summe der protokollierten Kosten/Regeneration. Jede Aktion im Protokoll gehört zu einem lebenden Mitglied und zu bestätigter oder Standardaktion. Ziehungsnummern lückenlos aufsteigend. Belohnungen nur bei Sieg bzw. Abschluss und nur für Berechtigte. Status und Fähigkeiten nur aus der Konfiguration der `cfg_version`.
2. **Doppellauf** in der Edge Function (zweimal rechnen, Hash vergleichen) fängt Nichtdeterminismus, **keine** Logikfehler.
3. **Wiederholbarkeit:** `round_results` speichert zusätzlich `input_hash`, `engine_version` und die vollständige Eingabe (Snapshot, Zustand, Seed, `cfg_version`). Damit ist jede Runde später **nachrechenbar** (Audit und Fehleranalyse).
4. **Logikfehler** werden nur **vor** dem Betrieb gefunden: Szenariotests je Regel des Plans, Vertragstest gegen die Client-Formeln, Replay-Audit mit Zufallsszenarien in Phase 1.
5. **Schadensbegrenzung im Betrieb:** Belohnungsobergrenzen in Phase 2, Korrekturweg über `round_results` und `rewards` (Support).

**Ergebnis:** R16 bleibt ein **echtes Restrisiko**, kein gelöstes. Seine Folgen sind begrenzt (Nachrechnen, Korrektur, Obergrenzen), nicht ausgeschlossen.

---

## F. Störungsfenster (neue technische Absicherung, Annahme T1)

**Problem:** Fällt die gesamte Plattform kurz aus, können Spieler keinen Herzschlag senden. Nach der Wiederkehr würden Abwesenheit, Pausenbudget, Bereitschaftsfristen **und die 20-Sekunden-Regel** rückwirkend greifen, obwohl niemand etwas dafür kann (Plan: Wer nichts für seine Verbindung kann, verliert nichts).

**Vorschlag [A, technische Absicherung, keine Regeländerung im Normalbetrieb]:**
1. `watchdog_tick` schreibt alle 15–30 s `system_heartbeat`. Liegt zwischen zwei Herzschlägen eine Lücke, die größer als das Doppelte des Tick-Intervalls ist (z. B. > 60 s), wird sie als **Störungsfenster** `[von, bis]` in `system_gaps` gespeichert.
1a. **Erkennung vor jeder Fristauswertung:** `advance_clock` beginnt mit der Lückenprüfung (`jetzt − letzter system_heartbeat > 60 s` → Fenster anlegen). Außerdem schreibt jeder `instance_view`-Aufruf den `system_heartbeat` (höchstens alle 15 s). Sonst könnte der Herzschlag eines Clients **nach** einem Ausfall die 20-Sekunden-Regel auswerten, **bevor** der erste Cron-Tick das Fenster angelegt hat.
2. **Virtueller Herzschlag:** Für alle Zeitregeln gilt `effective_last_seen = max(last_seen_at, bis des jüngsten Störungsfensters)`. Abwesenheit, Pausenbudget, Bereitschaftsfristen und die 20-Sekunden-Regel zählen damit **erst ab dem Ende des Fensters**. Das beseitigt den Widerspruch, dass nach einem Ausfall alle Spieler sofort „dauerhaft getrennt“ wären und Standardangriffe erhielten.
3. Laufende **Planungsfristen und Wiederbelebungsfenster** werden um die Länge des Fensters verlängert.
4. **Ausnahme, verbindlich:** Ein Störungsfenster verschiebt **nie** ein Weltboss-Eventende (Abschnitt K). Fällt das Eventende in ein Fenster oder danach, gilt es unverändert. Es gibt keine Gutschrift für die Ausfallzeit.
5. Störungsfenster wirken nicht auf Fristen, die ausdrücklich absolute Serverzeit sind (nur Eventende).
6. Für eine Instanz mit `engine_stuck` gilt derselbe Mechanismus je Instanz (A.6, Schritt 2).

**Hinweis:** Das ist die einzige Stelle, die ein Ergebnis in einer Ausnahmesituation beeinflusst (Entscheidung **T1**: annehmen oder verwerfen). Ohne T1 entstünden bei Plattformausfällen ungerechtfertigte Entfernungen, Abbrüche und Standardangriffe.

---

## G. Aktualisierte Gesamtarchitektur

```
Browser (GitHub Pages)
  index.html   Echtzeitkampf, Welt, Charakter           [unverändert]
  instance.js  Instanz-UI: Anzeige, Aktionswünsche,
               Belohnungen abholen (claim/ack, S.rcl)   [N]
       │ HTTPS, vorhandene Sitzung (sbAuthed)
       ▼
Supabase
  PostgREST-RPC (SQL, SECURITY DEFINER, nur eigene Instanzen):
     instance_view (Herzschlag + advance_clock + dispatch_if_due)
     submit_action, set_ready, join/leave, claim_rewards, ack_rewards
       │
       │ dispatch_if_due ── pg_net (async) ──► Edge Function resolve-round
       │        ▲                                 prüft Geheimnis, dann:
       │        │ pg_cron: watchdog_tick          claim_resolution (SQL, Tx1)
       │        │ (15–30 s, system_heartbeat)     resolveRound  (rein, TS)
       │                                          commit_round   (SQL, Tx2)
       │ set_ready ── pg_net ──► Edge Function derive-profile (L)
       │                           → store_profile (SQL, nur service_role)
       ▼
  Postgres: instances, members, fights, actions, resolve_jobs, derive_jobs,
            resolution_claims, round_results, fight_log, participation,
            revival_windows, rewards, cfg_* (versioniert), system_gaps,
            system_heartbeat, ops_alerts, item_seen, worldboss_events
  Vault: Geheimnis für den Aufruf; Funktionsgeheimnis in der Edge Function
```
Unverändert aus Fassung 1: Konfiguration als Daten, Mindestumfang, Rückfall A, Clientintegration über `instance.js`, Vertragstest.

---

## H. Noch bestehende technische Risiken

Die **maßgebliche** Liste mit allen Risiken R1–R25 steht in **O.1** (Stand dieser Fassung). Die frühere Liste an dieser Stelle ist dort aufgegangen, um widersprüchliche Doppelbewertungen zu vermeiden. Offene **Entscheidungen** (keine Risiken) stehen getrennt in **P**.

---

## I. Voraussetzungen und Freigabephasen

### I.1 Voraussetzungen vor dem **ersten Test mit echten Spielern** (geschlossener PvE-Test)

1. Phase 0 abgeschlossen: Tarif/Limits dokumentiert, `pg_cron`, `pg_net`, Edge Function und Vault **in dem Projekt, in dem Phase 2 läuft**, nachweislich funktionsfähig (Messungen aus einem anderen Projekt oder Tarif gelten nicht), Entscheidung A/B (D3) getroffen.
2. Engine rein und deterministisch, Determinismus-Test grün. Vertragstest gegen den Client grün.
3. `claim_resolution`/`commit_round` mit zwei Sperren, Absturzfälle E.4 per Test belegt.
4. `advance_clock` mit simulierter Uhr gegen **alle** Fristfälle des Plans getestet (Pause, Abwesenheit, Bereitschaft, 20-s-Regel, Event-Ende).
5. Rechte-Tests (beide Modi) bestehen: Clients dürfen keine Instanztabellen schreiben und weder `commit_round` noch `claim_resolution` aufrufen.
6. Stufe-1-Profilprüfung aktiv, Fingerabdruck im Beobachtungsmodus, Obergrenzen für Belohnungen.
7. Belohnungen nur Kampf-EP und Münzen, mit Lease/`ack` (C), `S.rcl` im Client.
8. Allowlist der Teilnehmer, Möglichkeit, Instanzen und Konten zu sperren, Not-Aus je Instanz (`ops_freeze_instance`, A.6).
9. Konto-Löschung deckt neue Tabellen ab (Test).
10. Überwachung: `ops_alerts`, `stuck`-Aufträge, Fehlerprotokoll sichtbar für dich.
11. Bestehende 219 Tests und PG-Tests unverändert grün, Backup der Datenbank vor dem Test.
12. Entscheidung T1 = D2 (Störungsfenster, einschließlich `engine_stuck`, A.6) getroffen.
13. Eventende-Tests (K.4), Profil-Tests (L) und Tests der Absturzfälle (E.4) grün, Entscheidung D1 (hängende Instanz, P) getroffen oder `technical_end` für Phase 2 gesperrt (A.6, Punkt 4).

### I.2 Trennung der Freigabephasen 0–3 (nicht zu verwechseln mit den Implementierungsphasen 0–10 aus Fassung 1)

Maßgeblich für alle vier Phasen ist die Tabelle in **O.2** (mit Übergangskriterien). Diese Tabelle hier ist das Detail zu den Phasen 1–3.

| | **Phase 1: Engine-/Watchdog-Test** (technischer Test) | **Phase 2: Geschlossener PvE-Test** | **Phase 3: Öffentlicher Betrieb** |
|---|---|---|---|
| Teilnehmer | Entwickler und Bots | eingeladene, bekannte Spieler (Allowlist) | alle |
| Umgebung | Testprojekt oder abgetrennte Testdaten | echtes Projekt, abgetrennte Instanzdefinitionen | echtes Projekt |
| Ziel | Technik, Fristen, Abstürze, Determinismus belegen | Spielgefühl, Gruppenlogik, Stabilität mit echten Verbindungen | stabiler Dauerbetrieb |
| Charakterprüfung | Stufe 1 | Stufe 1 + Fingerabdruck (nur Protokoll) | **mindestens C1, besser C2** |
| Belohnungen | Testwerte | **nur Kampf-EP und Münzen, mit Obergrenzen**, keine Gegenstände, kein Wiederbelebungsitem | volle Belohnung nach Plan inkl. Gegenstände, Pools, Item |
| Zustellung | Lease/`ack` testen | Lease/`ack` produktiv | zusätzlich Support-Werkzeug zur Korrektur |
| Weltboss-Event | nur Simulation | optional kleine Probe | mit Eventbetrieb und Lasttest |
| Sicherung | Standard | Datenbank-Backup vor Start, Not-Aus je Instanz | Überwachung, Alarm, Ratenbegrenzung, Bot-Abwehr, Meldewege |
| Ausstiegskriterien | alle Tests grün | keine Doppelbuchung, keine hängenden Runden, keine ungewollten Entfernungen in der Beobachtung | Lasttest bestanden, Sicherheitsprüfung der Charakterdaten |

**Klare Aussage:** Ein **technischer Test** darf nach Ende der **Implementierungsphase 4** (Fassung 1) beginnen. Ein **geschlossener PvE-Test** mit echten Spielern ist nach Erfüllung von I.1 verantwortbar und erfordert **keinen** Umbau des Charaktersystems. Ein **öffentlicher Mehrspielerbetrieb mit Gegenstandsbelohnungen** darf **nicht** starten, bevor die Herkunft von Ausrüstung und Belohnungen serverseitig gesichert ist (B.3, Stufe 3).

---

## J. Konsistenzprüfung dieser Fassung

- Grundarchitektur aus Fassung 1 beibehalten, nur technische Unklarheiten geändert (Abschnitt 0 zeigt jede Änderung). ✔
- `INSTANZKAMPF_PLAN.md`, Repository, Spielmechaniken unverändert, keine Implementierung. ✔
- 20-Sekunden-Regel entspricht Plan 1, Regeln 3–9 (Wiederverbinden vor Auflösung, Snapshot, Standardangriff, bestätigte Aktionen bleiben). ✔
- Gruppenpause hat Vorrang vor Auflösung bei „niemand verbunden“, auch ein toter Verbundener verhindert sie. ✔
- Keine Exactly-once-Behauptung für die Wirkung im Charakterdokument. ✔
- Wiederbelebungsitem nicht verfügbar in Freigabephasen 1/2, ohne Regeländerung. ✔
- Annahmen/Unbelegtes (Tarif, `pg_cron`-Sekundentakt, `pg_net`-Verhalten, Limits) ausdrücklich markiert und Phase 0 zugeordnet. ✔
- (Fassung 2.1) Abschnitte K–P ergänzt. Prüfergebnis und Änderungsprotokoll: N, O, P.
- (Fassung 2.1c) Begriffe vereinheitlicht: `effective_last_seen`, `engine_stuck`, `frozen`, `technical_end`, `event_ended`, `derive_jobs` sind definiert. Die Gruppen „Stufe“ (B.3), „Schritt“ (A.6) und „Freigabephase“ (I, O) sind getrennt. Einzelheiten: N.4.
- (Fassung 2.1b) Alle Verweise auf Ledger/Inbox auf `rewards` vereinheitlicht, Risikoliste nur noch in O.1, Phasenbezeichnungen eindeutig („Implementierungsphase“ gegen „Freigabephase“).

---

## K. Weltboss-Eventende (verbindlich, technisch)

Grundlage: `INSTANZKAMPF_PLAN.md`, „Weltboss-Event und Zeitgrenze“. Dieser Abschnitt bildet die dortigen Regeln technisch ab und **ändert keine**.

### K.1 Prüfung des Bestands
Fassung 1 (Abschnitte 6, 10) und Fassung 2 enthalten das Eventende (atomare Prüfung, `event_ended`, kein Sieg danach). **Nicht vollständig und teils widersprüchlich** war:
1. A.1 sagte bei Pause „nichts ist fällig“, ohne das Eventende auszunehmen.
2. Die Prüfung nutzte `now()` (Transaktionsbeginn), nicht die tatsächliche Zeit im Moment der Festschreibung.
3. F (Störungsfenster) nannte keine Ausnahme für das Eventende.
4. Nicht geregelt: laufender Claim/Lease bei Eventende, Aufträge nach Eventende, Eventende während Pause, Bereitschaftsphase, Massenabschluss vieler Instanzen, Verzögerung des Watchdogs.
5. Ob Kampf-EP und Kampfsieg dieselbe Prüfung nutzen.

### K.2 Regeln

1. **Absolute Zeit.** `worldboss_events.ends_at` (UTC) gilt als absolute Serverzeit und ist nach dem Start des Events unveränderlich [A: eine Änderung ist technisch ein neues Event]. **Nichts** darf es verschieben: weder Gruppenpause, Disconnects, Bereitschaftsfristen, Störungsfenster (F), Lease, Auftragswiederholung noch Watchdog-Verzögerung.
2. **Nie pausierbar.** Für jede Weltboss-Instanz gilt `clock_due_at <= ends_at`. Die Gruppenpause friert Spielerfristen ein, **nie** `ends_at`.
3. **Zeitquelle.** Jede Eventprüfung verwendet `clock_timestamp()` **nach** Erhalt der Zeilensperre der Instanz (E.2), nie `now()`.
4. **Eventende-Abschluss.** Sobald `clock_timestamp() >= ends_at` (erkannt durch Watchdog, Herzschlag, Claim, Commit oder Start), werden **alle** Instanzen des Events, die nicht bereits endgültig abgeschlossen sind, auf `event_ended` gesetzt. Das gilt auch für pausierte Instanzen, Wipe-Zustand, Bereitschaftsphase (endet ohne Kampf), `gathering` und `resolving`. Dabei werden: offene Claims entwertet (Token gelöscht), offene Aufträge `cancelled`, Wiederbelebungsfenster und ausstehende Aktionen beendet. **Es entstehen keine Sieg-, Abschluss-, Beute- oder Münzeinträge.** Bereits gebuchte Kampf-EP bleiben unverändert. Der Vorgang ist idempotent. Bei vielen Instanzen läuft er **mengenbasiert** (eine Anweisung je Event), nicht als Schleife mit Stückzahlbegrenzung. Die Zeilensperren werden **in aufsteigender Instanz-ID** genommen (`ORDER BY id FOR UPDATE`), damit kein Deadlock mit Einzelaufrufen entsteht. Der Abschluss darf in Teilmengen laufen. Jede Teilmenge prüft `ends_at` selbst, und kein Teil hängt vom anderen ab.
5. **Eventende ist keine Niederlage.** Eigener Endzustand `event_ended`, kein Wipe-Pfad, keine AFK-Folge, kein Berechtigungsverlust (Plan).
6. **Siegabschluss atomar.** `commit_round` ist für Weltboss-Kämpfe so aufgebaut, dass in **einer** Transaktion gilt: Instanzzeile sperren → Status aktiv und Token gültig → `t := clock_timestamp()` → ist `t >= ends_at`: **kein** Sieg und kein Ergebnis wird gespeichert, die Instanz wird `event_ended` (die Transaktion schließt mit diesem Endzustand ab, ohne Rollback). Sonst: Ergebnis, Siegfeststellung, `completed_at = t` und **alle** damit verbundenen Einträge (Kampf-EP, Abschlussbelohnung, Beute) in derselben Transaktion. Die Prüfung liegt so spät wie möglich vor dem Festschreiben. Verbleibend ist nur noch der Transaktionsabschluss (Größenordnung Millisekunden). **Verbindlich ist `completed_at = t`**, nicht der Zeitpunkt des Commit-Abschlusses: Ein Sieg mit `t < ends_at` gilt, auch wenn die Transaktion Millisekunden später sichtbar wird. Dieses Fenster ist nicht zu schließen und wird als Rechenzeit akzeptiert (R22). Da der Abschluss-Sweep (Regel 4) dieselbe Zeilensperre braucht, gilt entweder „Sieg vollständig festgeschrieben“ oder „Instanz `event_ended`“, nie beides.
7. **Gilt für alle Kämpfe mit Ergebnisbuchung.** Das gilt für **jedes** Rundenergebnis (Sieg, Wipe, Zwischenstand). Auch Kampf-EP eines gewonnenen Weltbosskampfs entstehen nur, wenn die Siegfeststellung vor `ends_at` abgeschlossen wurde. Eine begonnene Auflösung, deren Ergebnis erst nach `ends_at` festgeschrieben würde, erzeugt weder Sieg noch EP. Nie rückwirkend, auch nicht nach Wiederverbindung oder Auftragswiederholung.
8. **Start neuer Kämpfe.** `start_fight` prüft in derselben Transaktion nach der Sperre `clock_timestamp() < ends_at`. Kein Mindestrest. Nach `ends_at` startet kein Kampf, die Bereitschaftsphase endet ohne Kampf.
9. **Aktionen und Bereitschaft nach dem Ende.** `submit_action`, `set_ready`, Beitritt und Nachrücken werden mit `event_ended` abgewiesen.
10. **Edge Function nach dem Ende.** Ein bereits laufender Aufruf von `resolve-round` kann rechnen, aber sein `commit_round` wird nach Regel 6 abgewiesen. Ein neuer Claim wird mit `event_ended` verweigert. Ergebnisse aus Wiederholungen oder verspätet eintreffenden Aufrufen werden nie als rechtzeitig anerkannt.
11. **Unabhängig vom Watchdog.** Der Schutz hängt **nicht** davon ab, dass der Cron-Tick pünktlich lief. Claim, Commit und Start prüfen `ends_at` selbst. Der Watchdog (Regel 4) ist nur für das Festhalten des Endzustands und die Anzeige nötig. Eine Verzögerung ändert kein Ergebnis.
12. **Stuck-Engine, Ausfall, Störung.** Hängt die Engine, ist die Plattform gestört oder niemand verbunden: Das Eventende gilt trotzdem zur absoluten Zeit. Es entsteht dann **kein** Sieg. Das ist technisch zwingend und entspricht dem Plan („keine Verlängerung“).
13. **Anzeige.** Spieler sehen bei Rückkehr `event_ended` ohne Verschuldenshinweis.

### K.3 Verhältnis zu den anderen Zeitregeln (Rangfolge)
1. Absolutes Eventende (`ends_at`) schlägt alles.
2. Danach chronologisch: Fälligkeit einer Runde vor Pausenbeginn, Gruppenpause, Abwesenheit, Bereitschaft, Disconnect/20-s-Regel.
3. Störungsfenster (F) wirkt nur auf Spielerfristen und endet an `ends_at`.

### K.4 Tests (Ergänzung zu 13 in Fassung 1)
- Eventende bei laufender Gruppenpause, im Wipe-Zustand, in der Bereitschaftsphase, während `resolving`, mit hängender Edge Function.
- Commit mit Siegfeststellung genau vor und genau nach `ends_at` (simulierte Uhr): Sieg bzw. `event_ended`.
- Gleichzeitiger Eventende-Sweep und `commit_round`: genau ein Ausgang, nie Sieg **und** `event_ended`.
- Auftragswiederholung nach `ends_at`: keine Wirkung.
- Störungsfenster, das über `ends_at` hinausreicht: Ende bleibt absolut.
- Kampf-EP früherer Kämpfe bleiben nach Eventende.

---

## L. Profilableitung bei Bereitschaft (Lücke aus der Abschlussprüfung)

**Lücke:** Die Berichte sagen, der Server leite das Profil aus dem Charakter ab, aber nicht **wann** und **wo**. Der Plan erlaubt Ausrüstungswechsel zwischen Kämpfen und sperrt ab „Bereit“ (1b). Die Ableitung braucht die kopierten JavaScript-Formeln und kann deshalb nicht in `set_ready` (SQL) laufen.

**Regel (technisch):**
1. **Nur Cloud-Charaktere** nehmen an Instanzen teil. Lokale Charaktere (`ACTIVE.type !== 'cloud'`) haben keine Server-Kopie und sind ausgeschlossen. Charaktere im Konflikt- oder Sperrzustand (`character_locked`, Konflikt) können nicht „Bereit“ melden.
2. **Vor „Bereit“** muss der Client den Stand zum Server synchronisieren (`syncPush` bestätigt). Die Oberfläche zeigt erst danach „Bereit“ an.
3. `set_ready` speichert `ready_requested_at` (Serverzeit) und die Version der Charakterzeile (`characters.version`) und legt einen Auftrag in `derive_jobs` an (`unique (member, ready_requested_at)`, gleiche Zustellung, Wiederholung und Stuck-Behandlung wie `resolve_jobs`, A.2/A.4/A.6).
4. Die Edge Function `derive-profile` liest `character_data` **selbst aus der Datenbank** und speichert die **tatsächlich verwendete** Charakterversion mit dem Profil (sie kann neuer sein als die angeforderte, weil der Client zwischenzeitlich gespeichert hat. Das ist der eigene, rechtmäßige Stand des Spielers. Verbindlich ist die Version zum Ableitungszeitpunkt), prüft nach B.3 Stufe 1, berechnet das Profil und speichert es per RPC (`store_profile(member, character_version, profil)`, nur `service_role`). Erst dann ist die Bereitschaft wirksam (`ready=true`). Das Ergebnis ist deterministisch und idempotent je (Mitglied, Charakterversion).
5. **Fristen:** Der 60-Sekunden-Zähler der Bereitschaft (Plan) gilt ab `ready_requested_at`, nicht ab dem Ende der Ableitung. Die Ableitung selbst dauert nur Sekundenbruchteile bis Sekunden. **Bleibt der Ableitungsauftrag wegen Technik offen** (Edge Function nicht erreichbar), gilt die Bereitschaft als rechtzeitig, sobald die Ableitung gelingt, und die Instanz **startet den Kampf nicht**, solange ein Ableitungsauftrag eines Mitglieds mit rechtzeitiger Anforderung offen ist. Solange der Ableitungsauftrag eines Mitglieds offen ist, **ruhen dessen Bereitschaftsfristen und Abwesenheitsfristen** (virtueller Herzschlag, F). Eine technische Verzögerung führt nie zu Entfernung oder Verlust der Bereitschaft. Nur ein **ungültiges** Profil (Punkt 6) wirkt gegen den Spieler.
6. **Ungültiges Profil** (Prüfung scheitert): Bereitschaft wird mit Grund abgewiesen, der Spieler kann Ausrüstung korrigieren, solange seine Frist läuft. Es gibt keine neue Regel für die Folgen. Es gelten die bestehenden Bereitschaftsfristen. **Grenzfall:** Weichen Client- und Server-Formeln ab (R3), würde ein rechtmäßiger Spieler abgewiesen. Das verhindert der Vertragstest (M, Punkt 10), und eine Abweisung wird mit Grund protokolliert (`ops_alerts`).
7. Nach `ready=true` ist das Profil **gesperrt**. Spätere Änderungen des Charakterdokuments wirken auf diesen Kampf nicht (entspricht der Ausrüstungssperre). Aktuelle HP und Energie führt der Server (Plan), nie das Dokument (B.2). Ändert sich das Maximum durch einen Ausrüstungswechsel zwischen Kämpfen, gilt die Regel des Plans. Der Server begrenzt die aktuellen Werte auf das neue Maximum.
8. **Sichtbarkeit:** Der Client sieht die abgeleiteten Zahlen (Anzeige), aber **nie** Seed oder Rohziehungen. Das Rundenprotokoll zeigt Ergebnisse (z. B. „kritisch“), die Rohwerte der HMAC-Ausgaben liegen in einer für Clients nicht lesbaren Spalte (Audit).
9. **Eingabehärtung:** Der Parser akzeptiert nur Whitelist-Felder, begrenzt die Zahl der Einträge in `gear` (z. B. ≤ 200) und die Dokumentgröße, und liefert bei Fehlern eine Ablehnung statt einer Ausnahme.
10. **Gleichzeitigkeit:** Ein Charakter hat höchstens **ein aktives** Instanzmitglied (Teilindex, Fassung 1). Dieselbe Charakterzeile kann nicht in zwei Instanzen gleichzeitig kämpfen.

---

## M. Voraussetzungen für Phase 0 (ergänzt)

Phase 0 = technische Voraussetzungen und Tarifprüfung. Ohne diese Punkte beginnt keine Implementierung.

| # | Zu klären / bereitzustellen | Nachweis |
|---|---|---|
| 1 | **Tarif und Limits** des Supabase-Projekts: Edge-Function-Aufrufe und -Laufzeit, Datenbankverbindungen, Speicher, **Inaktivitätspause** (ein inaktives Projekt kann pausiert werden, dann steht auch `pg_cron`) [U] | schriftliche Tabelle mit Quelle |
| 2 | **Testumgebung**, getrennt vom Echtprojekt (zweites Projekt oder lokale Instanz). Datenbank-Branches können kostenpflichtig sein [U] | Entscheidung |
| 3 | `pg_cron` und `pg_net` **aktivierbar**, Sekundenintervall für `pg_cron` tatsächlich möglich, Verhalten bei langen Läufen und Überlappung | Messung |
| 4 | **Edge Function** deploybar (Werkzeug und Zugriff vorhanden, heute keine deployt), Funktionsgeheimnisse setzbar, Kaltstartzeit, CPU-/Laufzeitgrenzen gegen die Engine-Kosten | Messung |
| 5 | **Vault-Geheimnis** und Funktionsgeheimnis (`x-rw-secret`), Rotation | Probelauf |
| 6 | **`pg_net`-Zustellung** unter Last: Verlustrate, Reihenfolge, Verzögerung, Aufbewahrung von `_http_response`, Timeout-Parameter | Messung |
| 7 | **Sprache und Format des Engine-Moduls:** ein einziges reines ES-Modul in JavaScript (mit Typkommentaren), lauffähig in **Node** (Tests) und in der Edge Function (Deno), ohne Build-Schritt | Beispielmodul läuft in beiden |
| 8 | **Ablage und Test des Server-Codes**: Verzeichnis für Server-Funktionen und Migrationen im Repository, Test-Aufruf neben `tests/run.js` und `supabase/tests/run.sh` | Konvention festgelegt |
| 9 | **Migrationsweg** für das Schema (Skripte oder Werkzeug), Rückbau, Versionierung der `cfg_*`-Tabellen | festgelegt |
| 10 | **Vertragstest-Schnittstelle:** welche Werte `window.__RW` für den Abgleich liefert (nur lesend, ohne Änderung am Spielverhalten) | Liste |
| 11 | **Datenbank-Backup/Wiederherstellung** vor dem ersten Schreiben neuer Tabellen | Probe |
| 12 | **Entscheidung A/B (D3)** (Engine in Edge Function oder in SQL) anhand der Messungen 3–6 | Protokoll |
| 13 | **Entscheidung T1 = D2** (Störungsfenster und `engine_stuck`-Fristenstopp) | Protokoll |
| 14 | **Zeitquelle:** Nachweis, dass `clock_timestamp()` und Zeilensperren das in K beschriebene Verhalten liefern (Test mit zwei Sitzungen) | SQL-Test |
| 15 | **Beobachtbarkeit:** wo Fehler und `stuck`-Aufträge für dich sichtbar sind (`ops_alerts`, Protokoll) | Entwurf |

---

## N. Ergebnis der Abschlussprüfung und Änderungsprotokoll (Fassung 2.1)

### N.1 Gefundene Fehler und Widersprüche, und was geändert wurde

| # | Befund | Änderung |
|---|---|---|
| 1 | A.1: „bei Pause ist nichts fällig“ widersprach dem absoluten Eventende | A.1 korrigiert, Abschnitt K |
| 2 | `now()` ist der Transaktionsbeginn, kein Zeitpunkt der Festschreibung | E.2 und K.2 Regel 3 und 6: `clock_timestamp()` nach der Sperre |
| 3 | Störungsfenster (F) konnte zusammen mit der 20-Sekunden-Regel nach einem Ausfall alle Spieler sofort „dauerhaft getrennt“ erscheinen lassen | F neu: virtueller Herzschlag am Fensterende, Fristverlängerung, Ausnahme Eventende |
| 4 | Verbindungsstatus im Snapshot, wenn die Runde vor Pausenbeginn fällig war und beim Auslösen niemand mehr verbunden ist | Chronologie-Regel (A.1) mit `t_snap` |
| 5 | E.1: Claim nur bei Phase `planning` erlaubt, E.4 setzte aber einen neuen Claim nach Lease-Ablauf voraus | E.1: Claim auch bei `resolving` mit abgelaufener Lease, gespeicherter Snapshot |
| 6 | E.1: `engine_version` musste mit dem Claim übereinstimmen, verhinderte damit einen Hotfix bei hängender Runde | Version nur gespeichert, nicht verglichen |
| 7 | Zwei Tabellen (`reward_ledger`, `rewards`) für dasselbe | `rewards` ersetzt beide (C.2) |
| 8 | `ack_rewards` mit abgelaufenem Token unklar, `device_id` als Sicherheitsmerkmal missverständlich, Kürzen von `S.rcl` konnte unbestätigte IDs löschen | C.2 Punkte 6, 7 |
| 9 | Profil: nicht geregelt, **wann** und **wo** es entsteht (Ausrüstungswechsel zwischen Kämpfen, JavaScript-Formeln nicht in SQL, lokale Charaktere) | Abschnitt L, B.2, A.4 |
| 10 | Rohzufall im Protokoll für Clients | L Punkt 8 |
| 11 | Dauerhaft deterministisch fehlschlagende Engine ohne Behandlung | A.5, A.6, R21, D1 |
| 12 | Phase-0-Voraussetzungen unvollständig | Abschnitt M |
| 13 | Namensverwechslung der Phasen (Implementierung 0–10 gegen Test/Freigabe) | I.2 benannt als Freigabephasen 0–3 |

### N.2 Vollprüfung von Fassung 2.1 (zweite Runde): Befunde und Änderungen

| # | Abschnitt | Befund | Änderung |
|---|---|---|---|
| 14 | Kopf | Verwies auf alten Commit `0392290` als Basis | Basis `fec2598`, Hinweis „nicht committet“ |
| 15 | 0 | Änderungsübersicht kannte K–O und die Freigabephasen nicht | Zeile ergänzt |
| 16 | A.1 | `pause_start` nicht definiert (Fehler: Auflösung vor Pause nicht berechenbar) | `max(last_seen_at) + T_conn` |
| 17 | A.1, E.1, E.3, 3 weitere | Reste „Ledger“/„Inbox“ neben `rewards` | vereinheitlicht |
| 18 | C.2 | `reward_id` und `S.rcl` am Konto statt am Charakter: ein anderer Charakter desselben Kontos könnte die Belohnung anwenden und bestätigen | `character_id`, ID über Charakter |
| 19 | E.1 | Commit bei abgelaufener Lease und noch aktuellem Token nicht geregelt. `input_hash`: Herkunft unklar | ausdrücklich akzeptiert. Hash in SQL berechnet |
| 20 | E.3 | Gleitkomma-Bibliotheksfunktionen zwischen Node (Tests) und Deno (Betrieb) nicht bitgleich garantiert | nur exakte Operationen, Test in beiden Laufzeiten |
| 21 | E.5 (neu) | Invarianten fangen nur ungültige Zustände, nicht falsche gültige (R16 überschätzt) | ehrliche Grenzen, stärkere Konsistenzinvarianten, Wiederholbarkeit |
| 22 | F | Lückenerkennung nur im Cron-Tick: Herzschlag eines Clients konnte die 20-Sekunden-Regel **vor** dem Fenster auswerten | Erkennung zu Beginn von `advance_clock`, `system_heartbeat` auch durch `instance_view` |
| 23 | A.6 (neu) | Hängende Instanz hätte Abwesenheits-Entfernungen ausgelöst, obwohl niemand etwas dafür kann | Fristenstopp je Instanz, Hotfix, `technical_end`, D1 |
| 24 | K.2 | Millisekundenfenster zwischen `t` und sichtbarem Commit nicht benannt. Sperrreihenfolge beim Massenabschluss fehlte (Deadlockgefahr) | `completed_at = t` verbindlich, Sperren aufsteigend nach ID |
| 25 | L | Technisch verzögerte Profilableitung konnte die Bereitschaftsfrist verfehlen. Charakterversion bei Ableitung unklar | Verzögerung ohne Nachteil, Start wartet, verwendete Version gespeichert |
| 26 | H, O.1 | Zwei divergierende Risikolisten, R5 fehlte in O.1 | H verweist auf O.1, R5 ergänzt, R15/R16/R21/R22 neu eingestuft |
| 27 | I.1, I.2, O.2 | Messungen aus Testprojekt galten für das Echtprojekt. „Phase 4“ mehrdeutig. Keine Übergangskriterien | Messung im Phase-2-Projekt, „Implementierungsphase 4“, Übergangszeile |
| 28 | O.3, P (neu) | „Einfrieren“ vermischte Risiken und Entscheidungen | Entscheidungen D1–D5 getrennt |

### N.3 Geprüft, ohne Änderung nötig
- Auftragswiederholung und Lease: Token plus `unique (fight_id, round_no)` plus `round_results`, kein Doppelcommit möglich. ✔
- Deterministischer Zufall: Ziehungsnummer je Runde bei 0, Wiederholung bitgleich. Neuziehen ausgeschlossen. ✔
- Lock-Reihenfolge: eine Instanzsperre je Vorgang, kurz, nie über Berechnung oder HTTP. Der Massenabschluss (K.2 Regel 4) sperrt mehrere Instanzen in aufsteigender ID-Reihenfolge. ✔
- Mehrfache Claims von Belohnungen: Lease je Gerät, `acked` endgültig, Ausstellung einmalig. Verbleibende Bruchstellen in C.3 ehrlich benannt. ✔
- Gameplay-Regeln des Plans: nicht berührt. ✔

### N.4 Dritte Lektüre (Qualitätsprüfung): Befunde und Änderungen

| # | Abschnitt | Befund | Änderung |
|---|---|---|---|
| 29 | A.5 | „legt dieser Bericht nicht fest“ widersprach A.6 | Verweis auf A.6 und D1 |
| 30 | A.6 | „Stufe 1–3 / Stufe 4“ passte nicht zur Aufzählung und kollidierte mit den Stufen aus B.3. `engine_stuck`: Mechanismus, Rücksetzung und Ableitungsaufträge undefiniert. „Not-Aus“ undefiniert | „Schritt“, `effective_last_seen = jetzt`, `commit_round` setzt zurück, `ops_freeze_instance` |
| 31 | A.2, G, L | Tabelle für Ableitungsaufträge fehlte. `cancelled` fehlte als Auftragsstatus. `worldboss_events` fehlte im Diagramm | `derive_jobs`, Status ergänzt, Diagramm korrigiert |
| 32 | D.1, F | `last_seen_at` wurde überall verwendet, obwohl F `effective_last_seen` vorschreibt | Gleichsetzung in D.1 |
| 33 | D.3 | `closing` nirgends definiert | als abgeleiteter Zeitraum erklärt |
| 34 | E.1, E.4 | Endzustandsliste unvollständig. E.4 und E.1 widersprachen sich bei abgelaufener Lease (Commit angenommen oder abgelehnt) | Liste erweitert, E.4 unterscheidet vor und nach neuem Claim |
| 35 | C.2 | `claim_rewards` ohne Charakter. Obergrenze je Konto statt je Charakter. Empfänger der Beute-ID unklar | Signatur, Obergrenze je Charakter, Hinweis |
| 36 | K.2 | Regel 7 nannte nur Siege. Regel 6: Endzustand im Commit ohne Rollback nicht klar | Alle Rundenergebnisse, Hinweis ergänzt |
| 37 | L | Ruhen der Fristen bei offenem Ableitungsauftrag nur per Verweis. `hp`-Aussage widersprach B.2. Abweisung durch Formeldrift nicht benannt | Fristenruhe ausformuliert, HP-Satz, Grenzfall |
| 38 | B.4, B.6, I, J | „Teststufe“ gegen „Freigabephase“ gegen „Stufe“ (B.3) | einheitlich Freigabephase |
| 39 | O.2, O.3, P, I.2 | Übergangszeile falsch angeordnet. O.3 behauptete, kein D blockiere Phase 0/1, obwohl D2/D3 Voraussetzung für Phase 1 sind. Zwei Phasentabellen | Zeile je Phase, O.3 korrigiert, O.2 maßgeblich |
| 40 | O.1 | R21 zu niedrig (steht auf R15/R16), R3 ohne Abweisung legitimer Spieler | R21 mittel, R3 ergänzt |
| 41 | N | Abschnittsreihenfolge N.1, N.3, N.2 | umbenannt |
| 42 | A.6 | Einleitung ordnete D1 dem falschen Schritt zu | Schritt 4 |
| 43 | I.1, N.1 | I.1 nannte T1 und A/B ohne D-Nummer, Not-Aus nicht benannt. N.1 Nr. 11 verwies nicht auf A.6 | D2/D3, `ops_freeze_instance`, Verweise |
| 44 | O.1 | Stand-Angabe „2.1“ veraltet | „Stand Fassung 2.1c“ |

---

## O. Abschließende Risikoliste, Freigabephasen und Einfrieren

### O.1 Verbleibende technische Risiken (Stand Fassung 2.1c)

| # | Risiko | Wahrsch. | Wirkung | Vermeidung / Stand |
|---|---|---|---|---|
| R1 | Charakterdaten sind clientkontrolliert, Herkunft von Gegenständen nicht prüfbar | hoch | hoch | Stufe 1 begrenzt auf „bestes legitimes Profil“. Für Phase 3 C1/C2 nötig |
| R3 | Formel-Drift Client ↔ Server (auch: rechtmäßige Spieler werden bei „Bereit“ abgewiesen, L.6) | mittel | mittel | Vertragstest, Pflicht ab Phase 1 |
| R4 | Zeit- und Fristlogik in Randfällen | hoch | hoch | `advance_clock`, simulierte Uhr, Rangfolge K.3 |
| R5 | Doppelverarbeitung/konkurrierende Auslöser | niedrig (Token, `round_results` unique, Instanzsperre) | hoch | Zwei unabhängige Sperren (A.5), Test der Absturzfälle (E.4) |
| R6 | Belohnung geht bei Sicherungswiederherstellung nach `ack` verloren | mittel | mittel | dokumentiert, Support über `rewards`-Zeile |
| R8 | Tarif, Limits, `pg_cron`-Takt, Inaktivitätspause unbelegt | mittel **[U]** | mittel–hoch | Phase 0 |
| R9 | Edge-Function-Betrieb neu | mittel | mittel | Phase 0, Rückfall A |
| R10 | Hintergrund-Tabs erzeugen scheinbare Trennungen | mittel | mittel | `T_conn`, Standardangriff |
| R11 | Zu komplex | mittel | mittel | Mindestumfang |
| R12 | Konto-Löschung unvollständig | mittel | hoch | `delete_account` erweitern, testen |
| R15 | Engine nicht deterministisch (auch zwischen Node und Deno, E.3) | mittel | hoch | Determinismus-Test in beiden Laufzeiten, Beschränkung auf exakte Rechenoperationen, `input_hash` |
| R16 | Falsches, aber gültiges Engine-Ergebnis wird committed. Invarianten fangen **nur ungültige Zustände** (E.5) | mittel | hoch | **Nicht verhinderbar, nur begrenzt:** Konsistenzinvarianten, Szenariotests, Vertragstest, Replay-Audit, Obergrenzen in Phase 2, Korrekturweg |
| R17 | Geheimnis des Aufrufs | niedrig | mittel | Vault, Rotation |
| R18 | `pg_net`/`pg_cron` Verhalten unter Last | mittel **[U]** | mittel | Phase 0 Messung |
| R19 | Plattformausfall verursacht Entfernungen | niedrig | mittel | T1 |
| R20 | Bots und Automatisierung | mittel | mittel | Phase 2 Allowlist, Phase 3 Ratenbegrenzung |
| R21 | **Dauerhaft hängende Instanz** (deterministischer Engine-Fehler oder Invariantenverletzung) | mittel | mittel | A.6: Fristen laufen nicht, Hotfix, danach `ops_close_instance`. **Belohnungsfolge von `technical_end` ist Entscheidung D1**, nicht Risiko |
| R22 | **Eventende:** Massenabschluss vieler Instanzen und Millisekundenfenster zwischen `t < ends_at` und sichtbarem Commit | mittel | niedrig | mengenbasierter Abschluss mit Sperrreihenfolge, `completed_at = t` verbindlich (K.2 Regeln 4, 6) |
| R23 | **Zeitsprung/Uhr der Datenbank** (Serveruhr ungenau) | niedrig | mittel | Eine Zeitquelle (Datenbank), nie Client- oder Edge-Zeit für Regeln |
| R24 | **Griefing durch Heartbeat ohne Bestätigung** (verbunden, aber nie bestätigen) | mittel | niedrig | Plan akzeptiert 60-s-Wartezeit je Runde, Standardangriff |
| R25 | **Schreibzugriff auf `character_data` während Instanz** (Spielstand ändert sich nach „Bereit“) | mittel | niedrig | Profil gesperrt (L.7) |
| R2, R7, R13, R14 | siehe Fassung 1 | | | unverändert |

### O.2 Freigabephasen (klare Trennung)

| | **Phase 0** | **Phase 1** | **Phase 2** | **Phase 3** |
|---|---|---|---|---|
| Name | Technische Voraussetzungen und Tarifprüfung | Engine-/Watchdog-Test | Geschlossener PvE-Test | Öffentlicher Betrieb |
| Ziel | Annahmen belegen, A/B und T1 entscheiden | Technik ohne echte Spieler beweisen | Gruppenlogik und Stabilität mit echten Verbindungen | Dauerbetrieb |
| Teilnehmer | Entwickler | Entwickler und Bots | eingeladene Spieler (Allowlist) | alle |
| Umgebung | Test- und Messumgebung | Testumgebung | Echtprojekt, getrennte Instanzdefinitionen | Echtprojekt |
| Inhalt | Abschnitt M komplett (15 Punkte) | Engine, `advance_clock`, `claim`/`commit`, Watchdog, Belohnungs-Lease, Determinismus, Absturz- und Eventende-Tests (K.4) mit Bots und simulierter Uhr | Normale Dungeons (2–4), einfache Belohnungen | Alle Instanzarten, Weltboss, volle Belohnung |
| Charakterprüfung | – | Stufe 1 | Stufe 1 + Fingerabdruck (nur Protokoll) | mindestens C1, besser C2 |
| Belohnungen | – | Testwerte | nur Kampf-EP und Münzen mit Obergrenzen, **keine** Gegenstände, kein Wiederbelebungsitem | volle Belohnung inkl. Gegenstände und Beute |
| Weltboss | – | Simulation (K.4) | optional kleine Probe | mit Eventbetrieb und Lasttest |
| Eintrittsbedingung | – | M komplett, D2 und D3 entschieden, D4-Werte für Phase 1 festgelegt | I.1 komplett, D1 entschieden oder `technical_end` gesperrt, Phase-0-Messungen im Phase-2-Projekt wiederholt | Beobachtungszeitraum (D4) ohne Doppelbuchung und ohne Hänger, D5 umgesetzt |
| Ausstieg | schriftliches Ergebnis | alle Tests grün, kein Doppelcommit in Dauerlauf | keine Doppelbuchung, keine hängenden Runden, keine ungewollten Entfernungen, Protokoll sauber | Lasttest und Sicherheitsprüfung bestanden |

**Zuordnung zu Fassung 1 (Implementierungsphasen 0–10):** Freigabephase 0 = Implementierungsphase 0. Freigabephase 1 ab Ende der Implementierungsphase 4. Freigabephase 2 ab Ende der Implementierungsphase 9 (Mindestumfang). Freigabephase 3 erst nach Phase 10 und Charakterabsicherung.

### O.3 Kann die Architektur eingefroren werden?

**Ja, mit klar begrenztem Vorbehalt.** Nach Fassung 2.1 sind eingefroren:
- Schichtentrennung (`advance_clock` nur Uhr-Regeln, Engine nur Kampfregeln, `claim`/`commit` als Brücke),
- ein Auftragsweg (Datenbank löst per `pg_net` aus, Clients rufen nie eine Edge Function),
- Claim, Token, Lease, `round_results`-Eindeutigkeit, deterministischer Zufall,
- `rewards` mit Lease und `ack`, ehrliche Garantien,
- Whitelist-Profil und Profilableitung bei Bereitschaft,
- absolutes Weltboss-Eventende mit Rangfolge (Abschnitt K),
- Freigabephasen 0–3.

**Nicht eingefroren, sondern an Phase 0 gebunden** (das sind Messungen, keine Architekturänderungen): Wahl Engine in Edge Function oder SQL (A/B), Takt von `pg_cron`, Lease- und Intervallwerte, Entscheidung T1. Fällt Phase 0 negativ aus, wird **nur** die Engine-Ablage (A) geändert, alle Datenstrukturen und Abläufe bleiben.

**Offen bleibt:** Entscheidungen D1–D5 in Abschnitt P. Sie ändern keine Datenstruktur und keinen Ablauf, bestimmen aber, **wann** welche Phase beginnen darf: D2 und D3 werden in Phase 0 entschieden und sind Voraussetzung für Phase 1. D4-Werte für Phase 1 sind vor Phase 1 festzulegen. D1 ist Voraussetzung für Phase 2, D5 für Phase 3. **Keine** Entscheidung blockiert den Beginn von Phase 0.

---

## P. Offene Entscheidungen (getrennt von technischen Risiken)

| # | Entscheidung | Wer | Gebunden an | Technische Vorbereitung |
|---|---|---|---|---|
| D1 | **Belohnungsfolge von `technical_end`** (dauerhaft hängende Instanz, A.6): (a) wie das Eventende: kein Verschulden, nur bereits Gebuchtes bleibt, keine Abschlussbelohnung, (b) wie Abbruch/Niederlage laut Plan, (c) Entschädigung. Technischer Hinweis: (a) entspricht dem Plan-Grundsatz „kein Verschulden, kein Nachteil“, (b) trifft Spieler für einen Fehler des Betriebs | du | vor Phase 2 | Endzustand und Aufruf stehen, nur die Folgeregel fehlt |
| D2 | **T1** Störungsfenster und `engine_stuck`-Fristenstopp (F, A.6) annehmen oder verwerfen | du | in Phase 0, vor Phase 1 | Alternative ohne T1: Ausfälle führen zu Entfernungen und Standardangriffen |
| D3 | **A/B** Engine in Edge Function oder in SQL | du, nach Messung in Phase 0 | in Phase 0, vor Phase 1 | beide Wege sind beschrieben (Fassung 1, Rückfall A) |
| D4 | **Zahlenwerte:** Grenzen der Dauerläufe in Phase 1 (vor Phase 1), Zeit H bis `ops_close_instance` und Obergrenzen der Belohnungen (vor Phase 2), Länge des Beobachtungszeitraums (vor Phase 3) | du, mit Messwerten | je Phasenübergang | als Konfiguration vorgesehen |
| D5 | **C1 oder C2** (Herkunftssicherung von Gegenständen) für Phase 3 | du | vor Phase 3 | Fingerabdruck in Phase 2 liefert Entscheidungsdaten |

Offene **Risiken** stehen ausschließlich in O.1. Eine Entscheidung wird erst dann Risiko, wenn sie ungetroffen in die Phase hineinläuft, an die sie gebunden ist.

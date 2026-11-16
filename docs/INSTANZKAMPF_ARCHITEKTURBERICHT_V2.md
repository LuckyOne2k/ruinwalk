# Ruinwalk – Architekturbericht Instanzkampf, Fassung 2 (Überarbeitung technischer Unklarheiten)

Stand: 16.11.2026 · Repository: Commit `0392290`, unverändert · `INSTANZKAMPF_PLAN.md` unverändert · keine Implementierung.
Diese Fassung **ergänzt** `INSTANZKAMPF_ARCHITEKTURBERICHT.md` (Fassung 1). Die Grundarchitektur bleibt: Postgres als einzige Wahrheit, Zeit aus Zeitstempeln, SQL für Mitgliedschaft/Fristen/Buchung, reine Kampfengine in einer Edge Function (Rückfall: Engine in SQL), Echtzeitkampf unangetastet. Hier stehen nur die **korrigierten Abschnitte**. Alles andere gilt aus Fassung 1 weiter.

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
| Neu | Störungsfenster (F), Gesamtarchitektur 2, Restrisiken, Voraussetzungen, drei Teststufen |

---

## A. Runden-Watchdog

### A.1 Eindeutige Trennung der Schichten

| | `advance_clock(instance, now)` | Kampfengine `resolveRound` | `commit_round` |
|---|---|---|---|
| Ort | SQL | reine TypeScript-Funktion in der Edge Function | SQL |
| Aufgabe | **Nur Wanduhr-Regeln:** Präsenz, 5-Minuten-Abwesenheit, Gruppenpause und Budget, Bereitschaftsfristen, Event-Ende, Mindestgröße/Abbruch, Fälligkeit der Runde (`due_at`) | **Nur Kampfregeln:** Initiative, Aktionen, Schaden, Status, Ticks, Tod, Umleitung, Erstattung, Siegprüfung, Niederlage, Beitragszähler | Prüfen und **atomar speichern** |
| Liest die Uhr? | ja (`now`) | **nein** (kein `Date.now`, kein `Math.random`) | ja (`now()` für neue Fristen) |
| Berechnet Kampfergebnisse? | **nie** | ja | **nie** (nur Invariantenprüfung) |
| Schreibt | Mitglieder, Fristen, Flags, `due_at`, Aufträge | nichts (liefert Ergebnis) | Kampfzustand, Protokoll, Ledger, nächste Phase |

`advance_clock` entscheidet nur **dass** eine Runde fällig ist und welche Mitglieder zu entfernen sind. **Was** in der Runde geschieht, entscheidet ausschließlich die Engine. Entfernungen, die mitten in einer laufenden Auflösung fällig würden, werden als `pending_removal` vermerkt und von der Engine erst an der nächsten Aktions-/Phasengrenze wirksam gemacht (Plan 1: nie mitten in einer Aktion).

**Wichtig:** Ist **kein** Mitglied verbunden, gilt die Gruppenpause. Dann ist **nichts** fällig, die Rundenzeit ist eingefroren (Restzeit). Ein Watchdog für „niemand sendet mehr etwas“ ist deshalb nur für diese Fälle nötig, in denen die Zeit **weiterläuft**:
1. Letzte Verbindung brach ab, **nachdem** die Frist schon abgelaufen oder die Runde schon vollständig bestätigt war (die Runde war logisch vorher fällig).
2. Verbundene Spieler, deren Browser nicht mehr zuverlässig sendet (Hintergrund-Tab), aber noch innerhalb der Toleranz liegen.
3. Fristen ohne Spielerbezug: 5-Minuten-Abwesenheit, Budget 5 Minuten, Bereitschaftsfristen, Weltboss-Eventende.

### A.2 Auftragstabelle und drei Auslöser

`resolve_jobs(fight_id, round_no, status, attempts, last_dispatch_at, last_error)` mit **unique (fight_id, round_no)**. Status: `pending` → `claimed` → `done` (oder `stuck`). Pro Runde existiert höchstens **ein** logischer Auftrag.

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
- Anders als in Fassung 1 skizziert gibt es **keinen** vom Client ausgelösten Aufruf. Das verkleinert die Angriffsfläche und vereinfacht die Fehlerfälle.

### A.5 Fehlerfälle

| Fall | Verhalten |
|---|---|
| **Timeout** der Edge Function | Der Auftrag bleibt `claimed`, bis die Lease (z. B. 30 s) abläuft. Danach `pending`, nächster Auslöser sendet erneut. Nichts ist gespeichert, bis `commit_round` erfolgreich war. Das Neuberechnen liefert dasselbe Ergebnis (E.3) |
| **Fehler in der Engine** (Ausnahme) | Kein Commit. `attempts+1`, `last_error` gesetzt. Wiederholung mit Wartezeit (5, 10, 20, 40, 60 s). Nach z. B. 8 Versuchen `stuck`: Eintrag in `ops_alerts`, weiter Wiederholung alle 5 Minuten. **Kein** Spielernachteil (siehe unten) |
| **Mehrfachaufruf** gleichzeitig | Der zweite Aufruf erhält bei `claim_resolution` die Antwort `busy` (Lease aktiv) oder `already_resolved`. Er rechnet nichts |
| **Mehrfachaufruf** nach Abschluss | `already_resolved`, keine Wirkung |
| **Edge Function nicht erreichbar** | `pg_net` meldet Fehler in `_http_response`, der Auftrag bleibt `pending`, Wiederholung wie oben. Alle SQL-Regeln laufen weiter (`advance_clock`, Abwesenheit, Event-Ende). Die Runde bleibt **offen und überfällig**. `submit_action` lehnt neue Aktionen ab (Stichtag ist `phase_deadline`, nicht der Zeitpunkt der Auswertung). Die Oberfläche zeigt „Auswertung verzögert“ |
| **Dauerhafter Ausfall der Edge Function** | Rückfall-Entscheidung: Engine nach SQL (Variante A aus Fassung 1). Das ist die Absicherung, kein Normalbetrieb |

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

Der Server baut das Kampfprofil **ausschließlich** aus fünf Eingaben: `lv`, `cls`, `path`, `tier`, und den **angelegten** Gegenständen `eq → gear`. Alles andere wird **ignoriert**: `hp`, `en`, `def`, `inv`, `cu`, `stats`, Abklingzeiten, Schild, Betäubung. Aus diesen fünf Eingaben berechnet er HP, Angriff, Verteidigung und Krit mit den kopierten Formeln (Fassung 1, Abschnitt 3). Der Client schickt dem Server nie Kampfwerte.

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
| **Instanz-Ledger** (Fassung 1): Belohnungen aus Instanzen sind serverseitig ausgestellt und eindeutig | Instanzbeute ist echt | betrifft nicht den übrigen Bestand |

**Stufe 3: Langfristig nötige Änderungen am Charakterspeicher**

| Option | Inhalt | Aufwand |
|---|---|---|
| **C1 Signierte Gegenstände** | Der Server stellt Instanz- und Händlergegenstände mit HMAC-Signatur (`uid`, `b`, `q`, `p`, Konto) aus. Verbessern geht nur über Server-RPC. Instanzen akzeptieren nur signierte Gegenstände | mittel, ändert nur die Gegenstandsdaten und Upgrade |
| **C2 Besitz im Server** | Tabellen `character_items`, `character_wallet`, `character_inventory`. Jede Änderung (Drop, Herstellung, Upgrade, Verkauf, Münzen) ist ein Server-Aufruf mit Serverzufall. Der Client hält nur einen Cache | **hoch**: berührt Echtzeitkampf-Beute, Handwerk, Händler, Synchronisation, Offline-Spielen |
| **C3 Serverseitige Weltbeute** | Weltmonster-Drops serverbewertet | sehr hoch, außerhalb dieses Projekts |

### B.4 Inventargegenstände im Kampf
- Die **3 Heiltränke** je Instanz werden vom Server ausgegeben (Plan 1c), unabhängig vom Inventar `S.inv.trank`. Es gibt **keine** Abhängigkeit vom Client-Inventar.
- Das **Wiederbelebungsitem** existiert im Code nicht (`ITEMS` enthält keines [V]). Der Plan setzt voraus, dass es **besessen** werden muss. Das braucht serverseitig geführten Besitz (C2) oder Ausgabe über den Server. **Technische Folge:** In den Teststufen 1 und 2 (siehe I) ist es nicht verfügbar. Das ändert keine Regel des Plans.

### B.5 Was nach Stufe 1 (und Beobachtungsmodus) weiterhin möglich bleibt

1. Eintragen **beliebiger neuer** Gegenstände innerhalb der Grenzen (beste Ausrüstung für Level und Klasse, Qualität „Legendär“, `+10`).
2. Freies Wählen von Klasse und Pfad (innerhalb der Levelgrenzen), Überspringen der **geheimen** Bedingungen und Klassenquests (`stats` sind Client-Zähler).
3. Level bis 50 ohne Erfahrung.
4. Mehrfachkonten, Bots, Automatisierung von Aktionen.
5. Aufblähen von Münzen, Erfahrung und Inventar **außerhalb** von Instanzen (wirkt nicht auf Instanzbelohnungen).
6. Zeitliche Vorteile innerhalb der 60 s (die Ankündigung ist per Plan sichtbar).

**Nicht mehr möglich:** eigene Schadens-, HP-, Energie-, Krit-, Initiative-, Status- oder Abklingzeitwerte, doppelte oder verspätete Aktionen, vorhersagbare Krits (Seed ist für Clients unlesbar), erfundene Instanzbelohnungen, Doppelauszahlung.

### B.6 Bewertung: Erster PvE-Instanztest ohne Umbau des Charaktersystems?

**Ja.** Unter diesen Bedingungen (Teststufe 2):
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

Eine Tabelle `rewards` (ersetzt Ledger/Inbox aus Fassung 1 für die Zustellung; `reward_ledger` bleibt als Ausstellungsnachweis):

| Feld | Bedeutung |
|---|---|
| `reward_id` (Primärschlüssel) | **eindeutig, deterministisch** aus Fassung 1: `ep:{instanz}:{kampf}:{konto}`, `final:{instanz}:{konto}` (inkl. Münzen), `dungeonloot:{instanz}:{kampf}:{eintrag}`, `bossloot:{instanz}:{bosskampf}:{eintrag}` |
| `kind` | `ep` / `coins` / `item` |
| `payload` | Betrag bzw. Gegenstand (`b`, `q`; nie vom Client wählbar) |
| `status` | `issued` → `leased` → `acked` |
| `lease_token`, `lease_until`, `leased_by` (Gerät/Sitzung) | |

Ablauf:
1. **Ausstellung** in `commit_round`/Abschluss in derselben Transaktion (`ON CONFLICT DO NOTHING`). Jede `reward_id` entsteht **höchstens einmal**.
2. **`claim_rewards(device_id)`** vergibt unter Zeilensperre `status='leased'` mit Token und `lease_until = now()+10 min` an **ein** Gerät. Ein anderes Gerät erhält diese Einträge erst nach Ablauf der Lease oder nach `ack`. Wiederholter Aufruf desselben Geräts liefert dieselben Einträge mit **demselben** Token.
3. **Client** prüft jede `reward_id` gegen `S.rcl` (Liste zuletzt angewendeter IDs im Charakterdokument, begrenzt auf z. B. 200). Fehlt sie: Wirkung anwenden und ID eintragen. Ist sie schon enthalten: **nicht erneut anwenden**.
4. **Speichern:** Erst wenn `syncPush` die Cloud-Version **mit** dieser `rcl` bestätigt hat, ruft der Client `ack_rewards(ids, token)`. Der Server setzt `acked`.
5. Wird nicht bestätigt, läuft die Lease ab, der Eintrag wird erneut angeboten. Der Client erkennt die ID in `S.rcl` und bestätigt ohne erneute Anwendung.

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
- `seit = now() − last_seen_at`.
- **verbunden:** `seit ≤ T_conn` (technische Toleranz für verpasste Signale, Plan Regel 9). `T_conn` ist deutlich **kleiner als 20 s**.
- **dauerhaft getrennt:** `seit ≥ 20 s` ununterbrochen. Zwischen `T_conn` und 20 s: nicht verbunden, aber noch **kein** Ausschluss aus der Wartepflicht.

### D.2 Frühzeitige Fälligkeit
Eine Planungsphase ist **vorzeitig fällig**, wenn gleichzeitig gilt:
1. mindestens **ein Gruppenmitglied verbunden** ist (auch ein toter; sonst Gruppenpause statt Auflösung),
2. jeder **lebende** Spieler entweder bestätigt hat **oder** dauerhaft getrennt ist (≥ 20 s).

Sonst wird sie spätestens bei `phase_deadline` (60 s) fällig. `fights.due_at = min(phase_deadline, early_due_at)`; `early_due_at` ist der früheste Zeitpunkt, an dem 1 und 2 zusammen gelten (letzte Bestätigung bzw. `last_seen_at + 20 s` des letzten Blockierers). Er wird bei Bestätigung, Herzschlag und `advance_clock` neu berechnet. Der Watchdog erkennt dadurch die Fälligkeit **ohne** Spielerverkehr.

### D.3 Wo es in die Maschine gehört (`planning → closing → resolving → commit`)

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
   - Prüfung: Instanz aktiv, Runde ist die aktuelle, Phase `planning`, fällig (D.3), kein aktiver Claim,
   - Snapshot einfrieren, Phase `resolving`, `claim_token` erzeugen, `lease_until = now()+30 s`,
   - Rückgabe: Kampfzustand, Mitglieder, bestätigte Aktionen, Snapshot, Seed, `cfg_version`, `round_version`. Danach **Sperre frei**.
4. **`resolveRound(state, snapshot, seed, cfg)`** in der Edge Function: **reine** Funktion. Keine Sperre, kein Datenbankzugriff.
5. **`commit_round(claim_token, expected_round_version, ergebnis)`** (SQL, Transaktion 2):
   - `FOR UPDATE` auf der Instanzzeile,
   - Token ist das aktuelle, `round_version` stimmt, `input_hash` und `engine_version` stimmen mit dem Claim überein,
   - **Invarianten** (Engine ist nicht blind vertraut): HP ≥ 0 und ≤ Maximum, Energie ≥ 0, Aktionen nur bestätigter Mitglieder, keine Statusänderung außerhalb der Konfiguration, Ledger-Schlüssel gültig,
   - schreibt Ereignisprotokoll, neuen Kampfzustand, Mitgliedsfelder, Aktionsstatus, Wiederbelebungsfenster, `round_results`, Belohnungen (`ON CONFLICT DO NOTHING`), setzt nächste Phase und Frist (`now() + Dauer`), erhöht `round_version`, markiert den Auftrag `done`,
   - bei Weltboss: prüft `now() < ends_at` **in derselben Transaktion** für Kampfstart und Siegfeststellung (Plan 8, Punkt 7).

### E.2 Versionen und Sperren
- **Eine** Sperre je Vorgang: die Instanzzeile, **kurz**. Es wird **nie** eine Sperre über die Berechnung oder den HTTP-Aufruf gehalten.
- `round_version` ändert **nur** `claim_resolution` und `commit_round`. Herzschlag, Abwesenheitsmarken und `pending_removal` ändern sie **nicht**. Dadurch scheitert ein Commit nicht, nur weil währenddessen ein Herzschlag eintraf.
- Fristen, die während `resolving` fällig werden (z. B. Abwesenheit), werden als `pending_removal` vermerkt und an der nächsten Grenze angewendet (A.1).

### E.3 Zufall ohne Neuziehen
- Jede Zufallszahl ist `HMAC(seed, strom ‖ kampf ‖ runde ‖ ziehungsnummer)`. Die **Ziehungsnummer** wird **je Rundenauflösung bei 0 begonnen** und von der Engine deterministisch hochgezählt (Reihenfolge ergibt sich aus der Initiative, Gleichstände deterministisch nach Mitglieds-ID).
- Es gibt **keinen** gespeicherten globalen Zähler. Ein erneuter Versuch derselben Runde liefert deshalb **bit-genau dieselben** Zufallszahlen. Das ersetzt `rng_counter` aus Fassung 1.
- Voraussetzung: `resolveRound` ist rein und hängt nur ab von `(state, snapshot, seed, cfg_version, engine_version)`. Durchgesetzt durch einen **Determinismus-Test** (zweimal rechnen, Hashes gleich), das Verbot von `Date`/`Math.random` im Engine-Modul und `input_hash`/`engine_version` im Claim.
- Beute-Auslosung (Instanzabschluss) nutzt dieselbe Technik mit Strom `dungeon_pool`/`boss_pool` und Ziehungsnummer aus (Kampf, Eintrag, Kandidat), das Ergebnis steht zusätzlich im Ledger (nie neu gewürfelt).
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
| abgelaufene Lease, alter Worker meldet später | `commit_round` lehnt das alte Token ab (`superseded`) |
| Datenbankneustart | alles Persistente bleibt. Laufende Aufträge werden nach Lease-Ablauf neu gestartet |

**Grenze:** Dass die Engine bei gleicher Eingabe gleich rechnet, ist eine **Bedingung**, die getestet werden muss, keine Eigenschaft der Plattform.

---

## F. Störungsfenster (neue technische Absicherung)

**Problem:** Fällt die gesamte Plattform kurz aus, können Spieler keinen Herzschlag senden. Nach der Wiederkehr würde `advance_clock` rückwirkend 5-Minuten-Abwesenheit und Pausenbudget berechnen, obwohl niemand etwas dafür kann (Plan: Wer nichts für seine Verbindung kann, verliert nichts).
**Vorschlag [A, technische Absicherung, keine Regeländerung im Normalbetrieb]:** `watchdog_tick` schreibt alle 15–30 s `system_heartbeat`. Liegt zwischen zwei Herzschlägen eine Lücke > 90 s, gilt diese als **Störungsfenster**. Zeiten innerhalb des Fensters zählen **nicht** für Abwesenheit, Pausenbudget und Bereitschaftsfristen. Rundenfristen werden um das Fenster verlängert.
**Hinweis:** Das ist die einzige Stelle in diesem Bericht, die ein Ergebnis in einer Ausnahmesituation beeinflusst. Sie ist eine **technische Notwendigkeit** im Sinn des Plans, aber ausdrücklich als Annahme T1 geführt. Ohne sie entstünden bei Plattformausfällen ungerechtfertigte Entfernungen und Abbrüche.

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
       ▼
  Postgres: instances, members, fights, actions, resolve_jobs,
            resolution_claims, round_results, fight_log, participation,
            revival_windows, reward_ledger, rewards, cfg_* (versioniert),
            system_heartbeat, ops_alerts, item_seen
  Vault: Geheimnis für den Aufruf; Funktionsgeheimnis in der Edge Function
```
Unverändert aus Fassung 1: Konfiguration als Daten, Mindestumfang, Rückfall A, Clientintegration über `instance.js`, Vertragstest.

---

## H. Noch bestehende technische Risiken

| # | Risiko | Wahrsch. | Wirkung | Stand |
|---|---|---|---|---|
| R1 | Client besitzt Charakterdaten, Herkunft nicht prüfbar (B.5) | hoch | hoch | Durch Stufe 1 begrenzt, nicht gelöst. Für öffentlichen Betrieb C1/C2 nötig |
| R3 | Formel-Drift Client ↔ Server | mittel | mittel | Vertragstest |
| R4 | Zeit- und Fristlogik in Randfällen | hoch | hoch | zentrale `advance_clock`, simulierte Uhr |
| R5 | Doppelverarbeitung | niedrig (zwei Sperren) | hoch | Token + `round_results` unique |
| R6 | Belohnungsverlust durch Backup/Konflikt (C.3) | mittel | mittel | dokumentiert, Ausstellungsnachweis für Support |
| R8 | Tarif/Limits/`pg_cron`-Takt unbestätigt | mittel **[U]** | mittel–hoch | Phase 0 |
| R9 | Edge-Function-Betrieb neu, Kaltstart | mittel | mittel | Spike, Rückfall A |
| R10 | Polling und Hintergrund-Tabs erzeugen scheinbare Trennungen | mittel | mittel | `T_conn`, Standardangriff statt Strafe |
| R11 | Zu komplex | mittel | mittel | Mindestumfang, nur Tabellen aus dem Plan |
| R12 | Konto-Löschung unvollständig | mittel | hoch | `delete_account` erweitern, testen |
| R15 | **Determinismus der Engine** (Fehler = abweichende Wiederholung) | mittel | hoch | Determinismus-Test, `input_hash`, Code-Regel |
| R16 | **Engine-Fehler wird committed** (SQL prüft nur Invarianten) | mittel | hoch | Szenariotests, Invarianten, Protokoll zum Nachrechnen |
| R17 | **Geheimnis des Aufrufs** (Leck, Rotation) | niedrig | mittel | Vault, Rotation in 2 Schritten, nur Rundenkennung im Body |
| R18 | **`pg_net`/`pg_cron` Verhalten** (Backlog, Überlappung, Limits) unbelegt | mittel **[U]** | mittel | Phase 0, Aufträge idempotent, kurze Ticks |
| R19 | Plattformausfall verursacht ungerechte Entfernung (F) | niedrig | mittel | Störungsfenster (T1) |
| R20 | **Bots/Automatisierung** im Mehrspielerbetrieb | mittel | mittel | im Test: Allowlist. Öffentlich: Ratenbegrenzung, Meldungen |
| R2 | Echtzeitkampf-Regression | niedrig | hoch | bestehende Tests als Sperre, `instance.js` getrennt |
| R7, R13, R14 | siehe Fassung 1 | | | unverändert |

**Offene technische Entscheidung T1:** Störungsfenster (F) annehmen oder verwerfen. Keine Designregel betroffen.

---

## I. Voraussetzungen und Teststufen

### I.1 Voraussetzungen vor dem **ersten Test mit echten Spielern** (geschlossener PvE-Test)

1. Phase 0 abgeschlossen: Tarif/Limits dokumentiert, `pg_cron`, `pg_net`, Edge Function und Vault im **echten** Projekt nachweislich funktionsfähig, Entscheidung A/B getroffen.
2. Engine rein und deterministisch, Determinismus-Test grün. Vertragstest gegen den Client grün.
3. `claim_resolution`/`commit_round` mit zwei Sperren, Absturzfälle E.4 per Test belegt.
4. `advance_clock` mit simulierter Uhr gegen **alle** Fristfälle des Plans getestet (Pause, Abwesenheit, Bereitschaft, 20-s-Regel, Event-Ende).
5. Rechte-Tests (beide Modi) bestehen: Clients dürfen keine Instanztabellen schreiben und weder `commit_round` noch `claim_resolution` aufrufen.
6. Stufe-1-Profilprüfung aktiv, Fingerabdruck im Beobachtungsmodus, Obergrenzen für Belohnungen.
7. Belohnungen nur Kampf-EP und Münzen, mit Lease/`ack` (C), `S.rcl` im Client.
8. Allowlist der Teilnehmer, Möglichkeit, Instanzen und Konten zu sperren.
9. Konto-Löschung deckt neue Tabellen ab (Test).
10. Überwachung: `ops_alerts`, `stuck`-Aufträge, Fehlerprotokoll sichtbar für dich.
11. Bestehende 219 Tests und PG-Tests unverändert grün, Backup der Datenbank vor dem Test.
12. Entscheidung T1 (Störungsfenster) getroffen.

### I.2 Trennung der Stufen

| | **1. Technischer Test** | **2. Geschlossener PvE-Test** | **3. Öffentlicher Mehrspielerbetrieb** |
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

**Klare Aussage:** Ein **technischer Test** darf sofort nach Phase 4 beginnen. Ein **geschlossener PvE-Test** mit echten Spielern ist nach Erfüllung von I.1 verantwortbar und erfordert **keinen** Umbau des Charaktersystems. Ein **öffentlicher Mehrspielerbetrieb mit Gegenstandsbelohnungen** darf **nicht** starten, bevor die Herkunft von Ausrüstung und Belohnungen serverseitig gesichert ist (B.3, Stufe 3).

---

## J. Konsistenzprüfung dieser Fassung

- Grundarchitektur aus Fassung 1 beibehalten, nur technische Unklarheiten geändert (Abschnitt 0 zeigt jede Änderung). ✔
- `INSTANZKAMPF_PLAN.md`, Repository, Spielmechaniken unverändert, keine Implementierung. ✔
- 20-Sekunden-Regel entspricht Plan 1, Regeln 3–9 (Wiederverbinden vor Auflösung, Snapshot, Standardangriff, bestätigte Aktionen bleiben). ✔
- Gruppenpause hat Vorrang vor Auflösung bei „niemand verbunden“, auch ein toter Verbundener verhindert sie. ✔
- Keine Exactly-once-Behauptung für die Wirkung im Charakterdokument. ✔
- Wiederbelebungsitem nicht verfügbar in Teststufen 1/2, ohne Regeländerung. ✔
- Annahmen/Unbelegtes (Tarif, `pg_cron`-Sekundentakt, `pg_net`-Verhalten, Limits) ausdrücklich markiert und Phase 0 zugeordnet. ✔

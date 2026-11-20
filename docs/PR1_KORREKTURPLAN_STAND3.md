# Korrigierter Plan PR 1 – Stand 3 (20.11.2026)

> Nur Plan. Noch **keine** Code- oder SQL-Änderung, kein Commit auf dem PR-Zweig, keine Datenbankänderung.
> Bezug: lokaler Zweig `integration/nacht-nach-main` (Basis `main` `c9b351a` + Nachtstand `nacht/operator-edge-function` `2cd72e5`, noch nicht gepusht).
> Fundstellen beziehen sich auf diesen Stand: `server/instance/sql/0X_*.sql:Zeile` (abgekürzt `0X:Zeile`).
> Freigegebene Korrekturen: **K-1, group_tick-Isolation, M-1, M-2, M-4**. Entscheidungen von Pascal: E1 (PT409 mit Grund stornieren), E2 (nur Alarm), E3 (stuck-Sperre, Betreiber-Wiederaufnahme, Engine-Bindung bestätigt; V2 aktualisieren; Phase-2-Sperre erhalten), E5 (`waitlist.reason` freigegeben), E6 (Lasttest einplanen). Vorgabe: keine neue `betriebsphase`-Konfiguration.

## 1. group_tick: nur bekannte, geprüfte Fehler isolieren

**Was im isolierten Block überhaupt werfen kann.** Alle `raise exception` in 01–05 gesichtet. Im Block laufen nur: `enforce_deadlines_quiet`, `drop_member`, `after_auto_removal`, `abort_instance`, `promote_waitlist` und die Trigger auf `members`/`waitlist`/`fights`. Bekannte Fehlerquellen darin:

| Quelle | SQLSTATE | Meldung / Merkmal |
|---|---|---|
| `derive_profile` (`05:141–168`) | `PT422` | `profile_invalid:<grund>` |
| `account_guard` (`04:60`) | `PT409` | genau `account_in_instance` |
| `members_size_guard` (`04:22`) | `23514` | beginnt mit `Gruppe voll: `, Kontext `rwi.members_size_guard()` |
| eindeutige Indizes (`04:31`, `04:48`) | `23505` | Constraint `members_player_uq` bzw. `members_account_uq` |

**P0001:** In diesen Pfaden gibt es **kein** `raise exception` ohne eigenen Fehlercode. Ein P0001 hätte also keinen bekannten Grund und wird **nicht** isoliert.

**Isolationsliste (abschließend).** Isoliert wird nur, wenn Code **und** Merkmal passen:

| Nr | Bedingung | Herkunft muss sein |
|---|---|---|
| I1 | `PT422` und Meldung `^profile_invalid:[a-z_]+$` | Kontext enthält `rwi.derive_profile(` |
| I2 | `PT409` und Meldung genau `account_in_instance` | Kontext enthält `rwi.account_guard()` |
| I3 | `23514` und Meldung `^Gruppe voll: ` | Kontext enthält `rwi.members_size_guard()` |
| I4 | `23505` und Constraint `members_account_uq` oder `members_player_uq` | – |

**Alles andere bricht den Tick ab:**
- unbekannte Codes
- jeder P0001
- andere Integritätsfehler (23xxx mit anderem Merkmal)
- Programmierfehler: 42xxx, P0002/P0003 (`into strict`), 22xxx
- Systemfehler: 53xxx, 55P03, 57014, 58xxx, XX000
- 40P01 (Deadlock) und 40001: nicht isoliert, weil sich die Ursache keiner einzelnen Instanz zuordnen lässt; der nächste Tick versucht es erneut

Umsetzung: `when others then`, danach `GET STACKED DIAGNOSTICS` (Code, Meldung, Constraint, Kontext). Passt I1–I4 → isolieren. Sonst `raise` (dieselbe Ausnahme mit unverändertem Code und Text).

**Ablauf eines Ticks (eine Transaktion T):**
1. `watchdog_core`: Eventende-Abschluss 4a, wartend, aufsteigend nach ID.
2. Für jede Instanz in `group_tick`, aufsteigend nach ID:
   - Sperre der Instanz `for update skip locked` (in T, bleibt bis zum Ende gehalten)
   - Zeit nach der Sperre, Neuprüfung des Status
   - Eventende-Zweig (in T, **nicht** isoliert)
   - **BEGIN** (Teiltransaktion S): Fristprüfung der Mitglieder, `after_auto_removal` mit Nachrücken, Startprüfung, offenen `group_tick_failed`-Alarm schließen
   - **EXCEPTION:** S wird zurückgerollt (Sperren aus S werden frei, die Instanzsperre aus T bleibt). Code der Abbruch-Klasse → `raise`. Sonst Alarm (in T) und `failed += iid`.
3. Alarm-Sicherheitsnetz von `watchdog_tick`.
4. Commit von T.

**Vereinbarkeit mit den Regeln:**
- **4a:** Der Abschluss aus Schritt 1 wird nicht mehr durch spätere Gruppenfehler zurückgerollt. Genau das war die Ursache in Probe P1.
- **4b:** Unverändert.
- **Sperrreihenfolge:** Unverändert.
- **E2:** Keine automatische Beendigung einer dauerhaft fehlerhaften Instanz, nur der Alarm.

**Einordnung:** Nach K-1 fängt das Nachrücken I1–I4 bereits selbst ab. Die Isolation in `group_tick` ist dann nur noch eine **zweite Schicht** für genau diese vier Fälle → **Entscheidung E12**.

## 2. Alarm-Episoden: eindeutig über alle Aufrufpfade

**Problem des alten Entwurfs:**
- Ein Schlüssel `dedupe_key` mit `on conflict do nothing` kann einen Alarm **still verschlucken**. Der eindeutige Index `ops_alerts_dedupe_uq` (`03:107`) gilt unabhängig vom Status.
- Eine Episode aus „Anzahl erledigter Alarme“ kollidiert, sobald jemand Alarmzeilen löscht. `service_role` hat DELETE (`05:378`) und umgeht RLS.

**Neuer Entwurf: neue Alarme werden ohne `dedupe_key` geschrieben.** Dann gibt es kein `ON CONFLICT` und damit keinen stillen Verlust.

**Wartelisten-Alarm (`waitlist_invalid`):**
- Er wird nur geschrieben, wenn `update rwi.waitlist set status='cancelled', reason=… where id=w.id and status='waiting'` genau eine Zeile geändert hat.
- Der Übergang von `waiting` weg ist einseitig: Keine Funktion setzt `waiting` wieder (geprüft in 01–05).
- **Daraus folgt:** höchstens ein Alarm je Eintrag, unabhängig von Aufrufer und Gleichzeitigkeit.

**Gruppen-Tick-Alarm (`group_tick_failed`):**
- Unter der gehaltenen Instanzsperre: `insert … where not exists (offener group_tick_failed mit detail-Präfix 'instance <iid> sqlstate <code>:')`.
- Läuft die Instanz in einem späteren Tick ohne Fehler durch: offene Alarme dieser Instanz schließen (unter derselben Sperre).

**Eindeutigkeit, Pfad für Pfad:**

| Aufrufpfad | Rolle (Rechte) | Rechte auf `ops_alerts` | Ordnung bei Gleichzeitigkeit |
|---|---|---|---|
| `public.rw_worker_tick` → `watchdog_tick` → `group_tick` | `service_role` (INVOKER, `05:259`) | INSERT/UPDATE (`05:378`), umgeht RLS | Instanzsperre `for update skip locked`; zwei Ticks bearbeiten dieselbe Instanz nie gleichzeitig |
| direkter Aufruf `rwi.watchdog_tick`/`group_tick` | `service_role` (EXECUTE auf Serverfunktionen, `05:381`) oder `postgres` | wie oben bzw. Eigentümer | wie oben |
| künftiger pg_cron-Job | Eigentümer des Jobs (`postgres`); heute gibt es keinen Job | Eigentümer | wie oben, außerdem läuft ein Job nie parallel |
| Nachrücken über `group_join`/`group_leave`/`group_ready` (DEFINER, `05:51–100`) | Eigentümer (`postgres`) | Eigentümer | Instanzsperre der Eingangsfunktion + UPDATE-Bedingung |
| Nachrücken in Lösch-Triggern (DEFINER, `05:203`) | Eigentümer | Eigentümer | wie oben, plus Sperrreihenfolge der Kontolöschung |
| `anon`/`authenticated` direkt | kein Recht auf Schema `rwi` (`05:368–371`), RLS aktiv | keins | – |

Für das Einfügen sind keine Rechte auf eine Sequenz nötig (Identity-Spalte).

**Grenze:**
- Wer direkt mit Tabellenrechten schreibt (`service_role`, `postgres`), kann einen zusätzlichen offenen Alarm von Hand anlegen. Folge: ein **doppelter** Alarm, nie ein **verlorener**.
- Löscht jemand einen offenen Alarm von Hand, entsteht beim nächsten Fehler ein neuer. Auch das bedeutet keinen Verlust.

**Ein fehlgeschlagener Alarm hebelt die Isolation nicht aus:**
- Wirft das Schreiben des Alarms, wird **nicht** abgefangen. Der Tick bricht sichtbar ab (pg_cron-Status `failed` bzw. HTTP 5xx am Worker).
- Zusätzlich liefert die Rückgabe `group.failed` und `watchdog_tick.group_failed`.
- Test A-4 und Mutationsprobe ⑪ belegen das.

## 3. Nachrücken: bisherige `eligible`-Prüfung bleibt, Fehler werden eng abgefangen

Nachweis vorab (Probe P4, lokale Wegwerf-Datenbank): `profile_snapshot` (`04:73`, `coalesce(new.profile, rwi.profile_of(new.player))`) leitet bei ausdrücklich gesetztem Profil **nicht** neu ab. Einfügen mit Profil bei ungültigem Spielstand gelingt; ohne Profil wirft es `profile_invalid:path_class_mismatch`.

Neue Schleife (pro Wartendem, unter der Instanzsperre des Aufrufers):

```
exit when active_count >= max_size                         -- unverändert
if member exists → Eintrag storniert, Grund 'already_member' -- unverändert (bisher ohne Grund)
BEGIN                                                      -- Block A
  ok := rwi.eligible(w.player)                             -- UNVERÄNDERTE Funktion, unveränderte Regel (lv ≥ 5, Grundklasse)
  p  := rwi.profile_of(w.player)
EXCEPTION when sqlstate 'PT422' then
  passt die Meldung nicht zu ^profile_invalid:[a-z_]+$ oder der Kontext nicht zu rwi.derive_profile( → raise
  sonst: Eintrag storniert (Bedingung status='waiting'), Grund = Meldung; bei genau 1 geänderter Zeile → Alarm; continue
END
if not ok → storniert, Grund 'not_eligible' (kein Alarm, wie bisher still); continue
if p erfüllt (lv ≥ 5 und Grundklasse) nicht                 -- Wettlauf: Spielstand zwischen den zwei Anweisungen geändert
   → Eintrag bleibt 'waiting', glog 'nachruecken_verschoben'; continue (nächster Durchlauf entscheidet)
BEGIN                                                      -- Block B
  insert members(..., profile = p)                         -- Profil ausdrücklich gesetzt → keine erneute Ableitung (Nachweis P4)
EXCEPTION
  when sqlstate 'PT409' → nur wenn Meldung genau 'account_in_instance' und Kontext rwi.account_guard(): storniert, Grund 'account_in_instance'; sonst raise
  when check_violation (23514) → nur wenn Meldung ^Gruppe voll: und Kontext rwi.members_size_guard(): Eintrag BLEIBT 'waiting'; exit; sonst raise
  when unique_violation (23505) → nur bei Constraint members_account_uq (→ 'account_in_instance') oder members_player_uq (→ 'already_member'): storniert; sonst raise
END
→ 'admitted' wie bisher
```

**Streng bleiben unverändert:** `create_group`, `join` (für den eigenen Spieler) und `set_ready` (`04:260`) werfen weiter `PT422`.

## 4. Phase 2 ohne neue Konfiguration

**Nachgewiesene Fakten aus dem Code:**
- Es gibt keinen Phasenbegriff im SQL. `frozen` erlaubt die Tabellenregel (`01:12`), es wird aber nirgends gesetzt.
- `leave` funktioniert in einer Instanz mit stuck-Runde: Es prüft nur `status='active'`, nicht `engine_stuck` (`04:229–245`).
- Der letzte Spieler, der austritt, löst `abort_instance` aus (`04:242`). Das schließt die Aufträge und automatisch auch den Alarm (`04:526`).
- Die Lösch-Trigger erfassen eine stuck-Instanz (`status='active'`).
- `effective_last_seen` setzt bei stuck „jetzt“ (`01:155`). Abwesende werden deshalb **nie** entfernt.
- Es gibt **keine** Regel „ein Charakter in höchstens einer aktiven Instanz“ (nur `members_player_uq` je Instanz, `04:31`). Eine hängende Instanz blockiert den Spieler also nicht für andere Instanzen.

**Sperrvarianten ohne `betriebsphase`:**

| Variante | Mechanismus | Neue Konfiguration? | Bewertung |
|---|---|---|---|
| **S-A: Betreiberrecht** | In Phase 2 hat kein Betreiber den Umfang `terminate` (`operators.scopes`, `03:110`). Vergabe nur über `set_operator` mit `ops_log`. | nein (vorhandene Daten) | nur organisatorisch; eine einzige Fehlvergabe hebt die Sperre auf |
| **S-B: Datenbasierte Sperre je Instanz** (Empfehlung) | `terminate_stuck` gibt `phase_locked` zurück, wenn die Instanz **einen echten Spieler** enthält: ein Mitglied (jeder `mstate`) oder Wartender, dessen Schlüssel das UUID-Format hat, auch wenn der Charakter inzwischen gelöscht ist. Phase 1 laut V2 = nur Bots = Prototyp-Schlüssel ohne Charakter. | nein | technisch erzwungen, unabhängig von Betreiberrechten |
| S-A + S-B | beides | nein | Verteidigung in zwei Schichten |

**Gibt es immer einen Ausweg aus „stuck“ unter S-B (Phase 2, ohne `technical_end`)?**

| Ausweg | heute vorhanden | Löst |
|---|---|---|
| Engine-Hotfix + `resume_stuck` | ja | behebbarer Fehler |
| Spieler treten aus (`leave`) | ja | alle aktiven treten aus → `abort_instance` |
| Charakter- bzw. Kontolöschung | ja | wie Austritt |
| Weltboss-Eventende | ja (4a, M-1) | Weltboss |
| `technical_end` | nur Phase 1 | – |
| **Lücke** | – | Dungeon, nicht behebbarer Fehler, ein Mitglied kommt nie wieder: Frist ruht (A.6 Schritt 2) → **die Instanz bleibt unbegrenzt bestehen** |

Diese Lücke ist genau der „dauerhaft unauflösbare“ Zustand. Die anderen Spieler sind nicht blockiert, aber die Instanz, der Alarm und die Verbindungspflege bleiben bestehen. Lösungen, alle mit Entscheidung:
- **E13a:** D1 entscheiden (Belohnungsfolge von `technical_end`). Danach `technical_end` in Phase 2 freigeben. Laut V2 ist das der vorgesehene Weg.
- **E13b:** Höchstdauer für stuck in Phase 2 (Wert H, D4). Danach greift die Fristprüfung wieder, Abwesende werden regulär entfernt. Das ist eine **Regeländerung** an A.6 Schritt 2.
- **E13c:** Betreiber darf einzelne abwesende Mitglieder einer stuck-Instanz regelkonform entfernen (wie `drop_member` mit Grund „abwesend“). Neue Betreiberfunktion.

**Abhängigkeit zu `ops_freeze_instance`:**
- Die Sperre (S-B) hängt **nicht** von Freeze ab. Eine stuck-Instanz ist schon „eingefroren“: keine Claims, keine Buchungen (`04:360`, `512/514`), Fristen ruhen.
- **Freeze würde die Lage verschlechtern**, wenn es wie bisher entworfen umgesetzt würde:
  - `leave`, `join`, `set_ready` und der Herzschlag antworten bei `frozen` nur mit `frozen` (`04:240/254/281/419`). Der Ausweg „Spieler treten aus“ fiele weg.
  - Die Lösch-Trigger überspringen `frozen` (`05:207/234`) → Geistermitglieder.
  - `resume_stuck`/`terminate_stuck` antworten `not_active` (`04:643/674`).
  - → Eine eingefrorene stuck-Instanz hätte **gar keinen** Ausweg mehr außer dem Eventende.
- **Mindestbedingungen für ein späteres Paket F (eigene Freigabe):**
  - Austritt und Löschung bleiben möglich (ohne Nachrücken).
  - Auftauen ist festgelegt (E10).
  - `resume_stuck` funktioniert nach dem Auftauen.
  - Das Eventende erfasst `frozen` auch in den Eingangsfunktionen (E9, berührt den Code der Regel 4b).
- Bis dahin: **kein Freeze**. Phase 2 läuft mit S-B und den Auswegen oben.

**`technical_end` (M-4) und Phase 1:**
- Ablauf in `terminate_stuck`: Sperre → aktiv? → Eventende (M-1) → stuck? → S-B → `technical_end_instance`.
- Phase 1 (nur Prototyp-Schlüssel) → `technical_end`.
- Andere Abbrüche (Budget, Mindestgröße, alle ausgetreten) bleiben `aborted` und sind nicht gesperrt.

**Prüfungen an bestehenden Tests:** `stuck.mjs`, `operatoren.mjs:70` und `operator-edge.mjs:94` erwarten `terminated`. Bei der Umsetzung prüfen, ob sie Prototyp-Schlüssel oder echte Charaktere verwenden. Bei echten Charakteren: Erwartung `phase_locked`, für `technical_end` zusätzlich ein Fall mit Prototyp-Schlüsseln.

## 5. M-1, M-2, M-4 (unverändert gegenüber Stand 2, angepasst an Abschnitt 4)

- **M-1:**
  - `terminate_stuck` prüft direkt nach der Sperre mit `clock_timestamp()`: Ist `ends_at` erreicht → `end_instance` + `sweep_event(…, true)` + `close_stuck(…,'event_end',…)`, Rückgabe `event_ended`. Das gilt vor jeder anderen Entscheidung, auch vor S-B.
  - `report_failure`: dieselbe Prüfung, kein Fehlversuch nach dem Eventende (gleiches Muster wie `commit_round`, `03:184`).
- **M-2:**
  - In `commit_round` (`03:190`) zählt `engine_mismatch` als Fehlversuch: Zähler +1, `last_error='engine_mismatch:<x>≠<y>'`, Lease verkürzt.
  - Ab `max_attempts` → `stuck`, `engine_stuck=true`, `raise_stuck` (nur beim Übergang).
  - Rückgabe `engine_mismatch` ohne Ausnahme. Die Engine-Bindung bleibt (E3).
- **M-4:**
  - Neue Funktion `technical_end_instance`: Instanz `technical_end/done/technical_end`, Kämpfe `technical_end`, Aufträge, Todesfenster und Warteliste wie in `abort_instance` (`04:86–95`). Keine Belohnung (`reward_filter`, 341).
  - Wird nur von `terminate_stuck` aufgerufen, nur in Phase 1 (S-B).
- **V2-Doku (E3):** A.5 (keine automatische Wiederholung nach `stuck`), A.6 Schritt 3 (Wiederaufnahme nur durch den Betreiber), A.6 Schritt 4 (`phase_locked`, Freeze als Paket F), E.1 (Engine-Bindung nach Wiederaufnahme mit Zähler).

## 6. M-5: vollständiger Vergleich der Profilvarianten

Quellen: `engine/content.mjs`, `engine/v1.mjs:21–25`, `05:136–171`, `docs/AUSRUESTUNG_INSTANZPROFIL.md`, `docs/CHARAKTERFORTSCHRITT_SERVERARCHITEKTUR.md`, `04:293/315`.

| Kriterium | **V1: Klasse, Pfad, Stufe (Ist)** | **V2: mit Ausrüstung** |
|---|---|---|
| **Profilinhalt** | `{lv, grundklasse, pfad, tier, char_version, src}` | V1 + abgeleitete Werte `hp, atk, def` (+ `crit`, falls die Engine Krit je Einheit bekommt) + Set-Boni mit Engine-Gegenstück (`hpb`, `def`) + Belegnummern der Gegenstände |
| **Profilgröße** | ~80–100 Byte JSONB je Mitglied | nur Rechenergebnis + 10 Platz-Belege: geschätzt 0,5–1 KB (Schätzung). Rohdaten mit bis zu 200 Gegenständen (L.9) gehören nicht ins Profil |
| **Snapshot-Zeitpunkt** | Eintritt (Trigger `04:73`) und jedes „Bereit“ (`04:260`). „Bereit“ wird nach jedem Kampf zurückgesetzt (`04:315`) → neu abgeleitet vor jedem Kampf einer Mehrkampf-Instanz; eingefroren ab „Bereit“ (L.7, `slot3-f9.mjs`) | gleich; Ausrüstungswerte würden zum selben Zeitpunkt eingefroren |
| **Ausrüstungswechsel** | keine Wirkung | wirkt zwischen Kämpfen ab dem nächsten „Bereit“; im Kampf gesperrt; laut Plan wird die aktuelle HP auf das neue Maximum begrenzt (L.7) |
| **Kampfberechnung** | Engine: `{hp, atk, def, init}` fest je Grundklasse (Krieger 200/20/12/4, Bogenschütze 150/24/6/8, Magier 130/28/4/6, Heiler 150/16/7/5) + INIT-Wert des Pfads (−1…+2). Schaden `floor(atk·power/100) − floor(def/2)`, Krit global (`crit_pct 15`, `crit_mult 200`). Level wirkt nur über `tier` (Fähigkeiten über `abilitiesOf`) | Engine braucht Eingänge für Werte je Einheit. Die Client-Formeln haben eine **andere Skala**: `maxHP = (100+10·(lv−1))·(1+hpb)+Σhp` (≈100–600), `atk = 10+2·lv+Σatk`, Treffer `(atk+rnd 0..8)·mult·fm`, Monstertreffer `max(1, ceil(roh·0,25), roh−def)`. **Skalenentscheidung zwingend** (AUSRÜSTUNG §3 Schritt 1). 20 Set-Boni haben kein Gegenstück in der Engine |
| **Boss-Balancing** | Boss „Aschenwächter“ 900/24/8/7, schwerer Schlag 260, Welle 55, 2 Begleiter 90/10/2/9, Wut ×1,5. Gegen feste Spielerwerte ausbalanciert; Spannweite der Gruppe nur über Klasse und Pfad | Bosswerte müssen über die gesamte Spannweite der Ausrüstung (Qualität 0–4, Verbesserung 0–10, Stufen 1–3) funktionieren; Simulationen mit Verteilungen nötig (`rw-gamedesign`); größere Gefahr von Über- und Unterforderung |
| **Fälschungsrisiko** | gering: `lv/cls/path/tier` frei schreibbar, wirken aber nur auf Zugang und Fähigkeiten | **hoch** ohne Beleg für Gegenstände: `S.gear` mit `q=4, p=10` frei schreibbar (AUSRÜSTUNG §4). Voraussetzung: Ledger (CHARAKTERFORTSCHRITT Variante B, ab B1) |
| **Determinismus und Engine-Version** | unverändert (`c3`) | neue Inhaltsversion, Zustandsschema evtl. neu, Referenzkämpfe und Determinismus (Node/Bun/Deno) neu, Engine-Bindung bei Wiederaufnahme beachten |
| **Eingefrorene Architektur** | nicht berührt | berührt die Kampfregeln der Engine → ausdrückliche Freigabe nötig |
| **Aufwand (Schätzung)** | keiner; nur Bericht L anpassen | hoch: Skalenentscheidung, Formeln auf den Server übertragen + Vertragstest gegen den Client, Engine erweitern, Ledger, Balancing; mehrere PRs |
| **Bericht L** | weicht ab (SQL statt Edge Function, Eintritt + „Bereit“, keine Ausrüstung) → L nachziehen | entspricht der Absicht von L |

Empfehlung: V1 für den Prototyp, L anpassen. V2 erst mit dem Ledger (E4 offen).

## 7. Migration 06: vollständige Aufstellung

**Inhalt:**

| Objekt | Art | Eigenschaften (nach dem Muster der Geschwister in 03/04) |
|---|---|---|
| `rwi.waitlist.reason text` | neue Spalte | übernimmt die Tabellenrechte (`service_role` S/I/U/D), RLS bleibt aktiv (`05:386`); keine Spaltenrechte für Clients |
| `rwi.technical_end_instance(bigint, text)` | neu | `plpgsql`, SECURITY INVOKER, VOLATILE, alle Namen mit Schema (`rwi.`), kein `SET search_path` (wie `abort_instance`) |
| `promote_waitlist`, `group_tick`, `watchdog_tick`, `terminate_stuck`, `report_failure`, `commit_round` | `create or replace` | gleiche Signatur, INVOKER, kein `SET` (wie bisher). `create or replace` behält Eigentümer und Funktionsrechte; geprüft per Fingerabdruck |
| `profile_try` | **entfällt** (Abschnitt 3 nutzt `eligible`/`profile_of` unverändert) | – |
| `rwi.cfg` | **keine** neue Zeile | – |

**Rechte (im Rechteblock von 06 ausdrücklich):**
- `revoke all on function rwi.technical_end_instance(bigint,text) from public, anon, authenticated, service_role`
- `grant execute … to service_role`. Nötig, weil `rw_ops_terminate` als INVOKER mit `service_role` läuft (`05:341`).
- Ersetzte Funktionen: ACL bleibt; der Test vergleicht `proacl` vor und nach.
- Einordnungsprüfung: Die Schleife in `05:351–364` läuft nur bei 05. 06 bekommt eine eigene Prüfung: Jede rwi-Funktion muss in einer der Listen stehen, `technical_end_instance` als Serverfunktion. Sonst Abbruch.
- Die Standardrechte (`05:372–374`) gelten für Objekte, die der Eigentümer später anlegt. Trotzdem wird ausdrücklich entzogen.

**SECURITY DEFINER:**
- Keine neue DEFINER-Funktion.
- Die bestehenden (`derive_profile`, `profile_of`, `eligible`, `account_of`, Lösch-Trigger, `public.group_*`) bleiben unverändert: Eigentümer = installierende Rolle (`postgres`), `search_path = public, pg_temp`.
- Der Test prüft: alle DEFINER-Funktionen in `rwi`/`public` haben Eigentümer `postgres` und einen `search_path` in `proconfig`.

**Wer was mit welchen Rechten aufruft:**
- `service_role` (INVOKER-Wrapper) → `watchdog_tick` → `group_tick` → Nachrücken → `eligible`/`profile_of` (DEFINER, EXECUTE vorhanden, `05:381`). Ebenso `rw_ops_terminate` → `terminate_stuck` → `technical_end_instance` (neues Recht).
- DEFINER-Pfade laufen als Eigentümer.

**RLS:** keine neue Tabelle, keine neue Richtlinie; Schutz für `anon`/`authenticated` unverändert.

**Rollback `06_…_rollback.sql`:**
- Die 6 ersetzten Funktionen werden **wörtlich** wie in 03/04 wiederhergestellt.
- `drop function rwi.technical_end_instance(bigint,text)`
- `alter table rwi.waitlist drop column reason` (die Gründe gehen verloren, auf Dev hinnehmbar)
- Vorher prüfen: Instanzen mit `technical_end` bleiben gültig (Prüfregel `01:12`), werden aber gemeldet.
- **Test:** Fingerabdruck nach dem Rollback = frische Installation 01–05 (`prosrc`-md5, `proconfig`, `prosecdef`, `provolatile`, `proacl`, Eigentümer, Spaltenliste von `waitlist`).

**Folgen für Werkzeuge und Prüfsummen:**
- `supabase/dev/build.sh`: 06 in die Dateiliste und die Kopfzeile („01..06“).
- `supabase/dev/rollback_dev.sql`: Der Fingerabdruck „18 Tabellen … 67 Funktionen“ (Z. 68) → 68 Funktionen, neue Spalte in `waitlist`. Ohne Anpassung bricht der Dev-Rollback ab.
- `installation.mjs`: Dateireihenfolge (Z. 24) und Fingerabdrücke.
- `rechte-audit.mjs`: Funktionsliste.
- `docs/DEV_INSTALLATIONSFREIGABE.md`: neue sha256 von `install_dev.sql` (bisher `2206042d…adebf3`). Die Tests rechnen die Prüfsumme dynamisch; der Wert wird nach dem Erzeugen eingetragen, nicht vorher ausgerechnet.
- `cleanup_dev.sh`: voraussichtlich nicht betroffen (bei der Umsetzung prüfen).

**Wichtiger Nebeneffekt bei den Testladern:**
- 15 Testdateien laden die SQL-Dateien mit eigenen Listen, manche nur 01–04 (`gruppe`, `eventende`, `fenster`, `semantik`, `run`, `worker`, `sim/run-dungeon`, `sim/eventende-audit` u. a.).
- Ein 06, das Funktionen aus 03/04 ersetzt, müsste in **allen** diesen Listen ergänzt werden. Sonst testen die Prototyp-Tests den alten Stand.
- **Alternativen (E11):**
  - (a) Die Korrekturen direkt in 03/04 einarbeiten. Auf Dev ist noch nichts installiert, `install_dev.sql` ist eine Erstinstallation. Für Rollback und Prüfsumme genügen dann `rollback_dev.sql` und die neue Prüfsumme.
  - (b) 06 + gemeinsamer Lader `sql/load.mjs`, den alle Tests nutzen.
  - Empfehlung: (a). Eine 06-Migration lohnt sich erst, wenn es einen installierten Stand gibt.

## 8. Tests

Neue Testdatei `server/instance/tests/korrekturen-pr1.mjs`, eingetragen in `run-all-db.sh` **und** `instance-tests.yml`.

**Aus Stand 2 (gelten weiter):**

| Nr | Fall | Erwartung |
|---|---|---|
| K1-1 | P1-Nachbau: Weltboss + Dungeon, ein Wartender Z ungültig, Frist von A abgelaufen | Tick gelingt; Weltboss `event_ended`; A entfernt; Z storniert mit `profile_invalid:path_class_mismatch`; 1 Alarm |
| K1-2 | gleicher Tick noch zweimal | kein zweiter Alarm |
| K1-3 | X tritt bei bzw. meldet „Bereit“, Z wartet ungültig | X gelingt |
| K1-4 | Konto-Konflikt beim Nachrücken | storniert, `account_in_instance`, kein Abbruch |
| K1-6/7 | S1: Beitritt mit eigenem ungültigem Spielstand; S2: „Bereit“ mit eigenem ungültigem Spielstand; S3: Gruppe anlegen mit ungültigem Spieler | `PT422` bzw. Abweisung, unverändert |
| K1-8 | Einfügen mit ausdrücklichem Profil bei ungültigem Charakter | gelingt, Profil = gesetztes Profil |
| K1-9 | Wettlauf mit zwei Sitzungen: Z wird nachgerückt, Z speichert parallel ungültig | Mitgliedsprofil = abgeleiteter Stand, kein Fehler |
| L1 | Charakterlöschung eines Mitglieds, ungültiger Wartender | Löschung gelingt, Wartender mit Grund storniert, 1 Alarm |
| L2 | Kontolöschung (P1b-Nachbau, auch Charakter B) | gelingt |
| L3 | Kontolöschung in der Kaskade, später gelöschter eigener Charakter ungültig auf Warteliste | gelingt |
| L4 | Stufe 2 erzwungen + ungültiger Wartender | gelingt, `char_cleanup_failed` bleibt |
| L5 | Löschender selbst ungültig | gelingt |
| L6 | Konto-Konflikt beim Nachrücken während einer Löschung | gelingt, `account_in_instance` |
| G-1 | zwei Instanzen, erste wirft isolierbaren Fehler (Test-Hook), zweite mit abgelaufener Frist | zweite verarbeitet; erste unverändert; `failed=[1]`; 1 Alarm |
| G-2 | Sperrprobe: Tick in offener Transaktion, zweite Sitzung sperrt erste Instanz mit `for update nowait` | `55P03` |
| G-3 | Teilergebnisse in S: Mitglied entfernt, dann Fehler | Entfernung zurückgerollt |
| G-7 | Eventende gleichzeitig mit Fehler in anderer Instanz | Eventende bleibt erhalten |
| M1-1 | P3-Nachbau: `terminate` nach `ends_at` | `event_ended`, Alarm erledigt |
| M1-2 | zwei Sitzungen: Sperre bis nach `ends_at`, `terminate` startet davor | `event_ended` |
| M1-3 | `report_failure` nach `ends_at` | `event_ended`, Zähler unverändert |
| M2-1 | P2-Nachbau | nach `max_attempts` `stuck`, `engine_stuck=t`, 1 Alarm |
| M2-2 | danach `resume_stuck` mit richtiger Engine, Commit | gelöst, `engine_stuck=f` |
| M2-3 | richtige Engine sofort | kein Zähler |
| M2-4 | `engine_mismatch` nach `ends_at` | `event_ended` geht vor |
| M4-1 | Phase 1: `terminate` | Instanz/Kampf `technical_end`, Warteliste storniert, keine Belohnung |
| M4-2 | Phase 1: zweiter Aufruf | `not_active` |

**Neu in Stand 3:**

| Nr | Fall | Erwartung |
|---|---|---|
| I-1…I-4 | je ein isolierbarer Fehler (I1–I4) per Test-Hook in einer Instanz | Isolation, zweite Instanz verarbeitet |
| I-5 | Hook wirft `P0001` mit beliebigem Text | Tick bricht ab |
| I-6 | `PT422` mit Meldung ohne `profile_invalid:` | Abbruch |
| I-7 | `PT409` mit `ambiguous_character` | Abbruch |
| I-8 | `23514` aus einer anderen Prüfregel | Abbruch |
| I-9 | `23505` mit anderem Constraint | Abbruch |
| I-10 | `42501`, `P0002`, `40P01` | Abbruch |
| N-1 | Wartender mit gültigem Spielstand unter Level 5 | storniert, `not_eligible`, kein Alarm |
| N-2 | „Gruppe voll“ (Wettlauf mit zwei Sitzungen) | Eintrag bleibt wartend |
| N-3 | `members_account_uq`-Verletzung (Hook umgeht `account_guard`) | storniert, `account_in_instance` |
| N-4 | Wettlauf: Spielstand ändert sich zwischen `eligible` und `profile_of` (Hook) | bleibt wartend, glog |
| A-1 | zwei parallele `watchdog_tick` (Worker + direkt) über 20 Durchläufe | genau ein offener `group_tick_failed` je Instanz und Ursache |
| A-2 | ein Eintrag wird über drei Pfade gleichzeitig nachgerückt (Tick, `leave`, Löschung) | genau ein `waitlist_invalid` |
| A-3 | `service_role` löscht offenen Alarm von Hand | nächster Fehler → neuer Alarm |
| A-4 | Schreiben des Alarms scheitert (Hook entzieht INSERT) | Tick bricht sichtbar ab |
| A-5 | als `authenticated`: Zugriff auf `rwi.ops_alerts` | verweigert |
| P2-1 | stuck-Instanz mit echtem Charakter: `terminate` | `phase_locked`, nichts geändert, `ops_log denied` |
| P2-2 | nur Prototyp-Schlüssel | `technical_end` |
| P2-3 | echter Charakter bereits gelöscht (Schlüssel bleibt) | `phase_locked` |
| P2-4 | echter Wartender | `phase_locked` |
| P2-5 | Phase 2: alle treten aus | `aborted`, Alarm erledigt |
| P2-6 | Phase 2: Löschung | gelingt |
| P2-7 | Phase 2: Eventende | `event_ended` vor `phase_locked` |
| P2-8 | über die Edge Function | 200 + `phase_locked` |
| R-1 | Rechte nach 06 | `technical_end_instance`: EXECUTE nur `service_role`; ACL der ersetzten Funktionen unverändert; alle DEFINER mit Eigentümer `postgres` und `search_path` |
| R-2 | Rollback 06 | Fingerabdruck = Installation 01–05 |
| R-3 | `rollback_dev.sql` nach Installation mit 06 | läuft vollständig |
| R-4 | Einordnungsprüfung | neue, nicht eingeordnete rwi-Funktion → 06 bricht ab |

Test-Hooks (Fehler auslösen) über temporäre Ersatzfunktionen nur in der Testdatenbank; nichts Testspezifisches im Produktionscode.

**Bestehende Tests:** `stuck.mjs:104`, `operatoren.mjs:70`, `operator-edge.mjs:94` anpassen (siehe Abschnitt 4); `installation.mjs` und `rechte-audit.mjs` mit neuer Prüfsumme; ganz `run-all-db.sh` auf PG16 lokal, PG17 über CI.

**Wackelstelle `installation.mjs:399–403` und `468–472`** (gemessen 7412–7953 ms gegen Grenze 8000 ms): Sperrhalter per `pg_locks` synchronisieren statt fester 1200 ms; Haltezeit 60 s und danach `pg_terminate_backend`; reine Wartezeit ab `wait_event_type='Lock'` messen (Erwartung 4,5–7 s); zusätzlich prüfen: Fehler 55P03 und Sperre zum Abbruchzeitpunkt noch gehalten; Gesamtzeit nur grob ≤ 15 s. Gleiches Muster für Z. 253/259.

## 9. Mutationsproben

| Nr | Mutation | Muss rot werden |
|---|---|---|
| ① | Nachrücken reicht `PT422` weiter | K1-1, K1-3, L1–L3 |
| ② | Profil beim Einfügen nicht gesetzt | K1-9 |
| ③ | Grund wird nicht gespeichert | K1-1, K1-4 |
| ④ | `PT409` nicht abgefangen | K1-4, L6 |
| ⑤ | `join` nachsichtig | S1 |
| ⑥ | BEGIN/EXCEPTION in `group_tick` entfernt | G-1, G-7 |
| ⑦ | Sperre in S verschoben | G-2 |
| ⑧ | Abbruch-Klasse wird isoliert | I-5…I-10 |
| ⑨ | Fehler ohne Alarm | G-1 |
| ⑩ | fester Alarmschlüssel ohne Episode | A-3 |
| ⑪ | Alarm-Schreiben mit eigenem `exception when others then null` | A-4 |
| ⑫ | `ends_at`-Prüfung in `terminate` entfernt | M1-1 |
| ⑬ | `now()` statt `clock_timestamp()` | M1-2 |
| ⑭ | Zähler bei `engine_mismatch` entfernt | M2-1 |
| ⑮ | `raise_stuck` ohne Übergangsprüfung | M2-1 (zwei Alarme) |
| ⑯ | `abort_instance` statt `technical_end_instance` | M4-1 |
| ⑳ | `when others` isoliert ohne Prüfung der Liste | I-5…I-10 |
| ㉑ | Prüfung des Kontexts bei I1–I3 entfernt | I-6/I-8 mit fremdem Kontext |
| ㉒ | „Gruppe voll“ storniert | N-2 |
| ㉓ | `eligible`-Aufruf durch eigene Regel ersetzt | N-1 (Vergleich mit dem Original über alle Profiltestfälle) |
| ㉔ | Alarm mit `on conflict do nothing` + festem Schlüssel | A-3 |
| ㉕ | Alarm ohne Bedingung „genau 1 Zeile geändert“ | A-2 |
| ㉖ | Prüfung auf echte Spieler in `terminate_stuck` entfernt | P2-1 |
| ㉗ | UUID-Prüfung nur gegen bestehende Charaktere | P2-3 |
| ㉘ | `grant execute` für `technical_end_instance` fehlt | P2-2 über den Wrapper |
| ㉙ | Rollback stellt eine Funktion nicht wörtlich wieder her | R-2 |

## 10. Belastungstest Teiltransaktionen (E6)

- **Vor der Betriebsfreigabe, nicht in diesem PR.**
- Aufbau: 100 und 200 Instanzen, je Tick in mehr als 64 davon schreibende Fristwechsel. Parallel 20 Sitzungen mit Lesezugriffen und `commit_round`.
- Messen: Tick-Dauer, Latenz der parallelen Anweisungen, Wartezeiten `SubtransSLRU`/`SubtransBuffer` in `pg_stat_activity`. Vergleich mit einem Tick ohne Teiltransaktionen. PG16 und PG17.
- Abbruchkriterium: Bremst die Datenbank merklich → Begrenzung der Instanzen je Tick (Betriebsentscheidung, keine neue Spielregel).

## 11. Offene Entscheidungen

- **E11:** Korrekturen direkt in 03/04 (empfohlen) oder Migration 06 mit gemeinsamem Lader?
- **E12:** Fehlerisolation in `group_tick` mit der engen Liste I1–I4 umsetzen (zweite Schicht) oder weglassen?
- **E13:** Wie wird die Lücke „Dungeon stuck + Mitglied kommt nie wieder“ in Phase 2 geschlossen: a) D1 entscheiden, b) Höchstdauer H, c) Betreiber entfernt Abwesende, oder bewusst hinnehmen?
- **E14:** Phase-2-Sperre als S-B (datenbasiert, empfohlen), S-A (Betreiberrecht) oder beides?
- **E8/E9/E10:** Paket F (Freeze) nur mit den Mindestbedingungen aus Abschnitt 4; bis dahin kein Freeze.
- **E4:** V1 oder V2 der Profilableitung.
- Erledigt durch Vorgaben: E7 (keine `betriebsphase`).

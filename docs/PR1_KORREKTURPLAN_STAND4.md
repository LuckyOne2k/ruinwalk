# Korrigierter Plan PR 1 – Stand 4 (20.11.2026)

> Nur Plan. Keine Code- oder SQL-Änderung, kein Commit, keine Datenbankaktion.
> Grundlage: Stand 3 (`docs/PR1_KORREKTURPLAN_STAND3.md`). Stand 4 ersetzt Stand 3 vollständig. Abschnitte, die sich nicht geändert haben, sind mit „unverändert aus Stand 3“ gekennzeichnet und stehen hier trotzdem vollständig.
> Bezug: lokaler Zweig `integration/nacht-nach-main` (Basis `main` `c9b351a` + `nacht/operator-edge-function` `2cd72e5`). Fundstellen: `server/instance/sql/0X_*.sql:Zeile` = `0X:Zeile`.

## 0. Änderungen gegenüber Stand 3

| # | Änderung | Grund |
|---|---|---|
| Ä1 | **I4 (23505) gestrichen**, ebenso der 23505-Fang im Nachrücken und Test N-3 | Prüfung der Nutzervorgaben (Abschnitt 12): Laut Vorgabe aus Stand 3 müssen „unerwartete Integritätsfehler“ den Tick abbrechen. `members_player_uq`/`members_account_uq` sind durch die vorgelagerten Prüfungen (Mitgliedsprüfung unter Instanzsperre, `account_guard` mit Beratungssperre `04:59`) gedeckt; eine Verletzung wäre unerwartet → Abbruch |
| Ä2 | Tests K1-5, G-4, G-5, G-6 und Mutationsproben ⑰–⑲ geklärt | Auftrag Punkt 1 (Abschnitt 9/10) |
| Ä3 | **S-B neu belegt**: Kennzeichen ist `members.profile->>'src'`, nicht das UUID-Format; Prüfung über eine Hook-Funktion nach dem Muster von `account_of` | Auftrag Punkt 2 (Abschnitt 4) |
| Ä4 | K1-9 in zwei bzw. drei Abläufe mit getrennten Erwartungen geteilt | Auftrag Punkt 3 |
| Ä5 | E13 als offene Betriebsentscheidung mit Folgen; ausdrücklich **keine** Freigabe für Phase 2 | Auftrag Punkt 4 |
| Ä6 | E4 offen; nötige Anpassungen an Bericht L aufgelistet | Auftrag Punkt 5 |
| Ä7 | Neuer Befund B-1 (Groß-/Kleinschreibung von Schlüsseln, bestehend, nicht Teil von PR 1) | bei der Prüfung von S-B gefunden |

## 1. group_tick: nur bekannte, geprüfte Fehler isolieren

**Was im isolierten Block werfen kann** (unverändert aus Stand 3): `enforce_deadlines_quiet`, `drop_member`, `after_auto_removal`, `abort_instance`, `promote_waitlist` und die Trigger auf `members`/`waitlist`/`fights`. Bekannte Quellen: `derive_profile` (`05:141–168`, `PT422 profile_invalid:*`), `account_guard` (`04:60`, `PT409 account_in_instance`), `members_size_guard` (`04:22`, `23514`, „Gruppe voll: …“), eindeutige Indizes (`04:31`, `04:48`, `23505`).

**P0001:** In diesen Pfaden gibt es kein `raise exception` ohne eigenen Fehlercode. P0001 wird nicht isoliert.

**Isolationsliste (abschließend, Stand 4):**

| Nr | Bedingung | Herkunft muss sein |
|---|---|---|
| I1 | `PT422` und Meldung `^profile_invalid:[a-z_]+$` | Kontext enthält `rwi.derive_profile(` |
| I2 | `PT409` und Meldung genau `account_in_instance` | Kontext enthält `rwi.account_guard()` |
| I3 | `23514` und Meldung `^Gruppe voll: ` | Kontext enthält `rwi.members_size_guard()` |

**Alles andere bricht den Tick ab:** unbekannte Codes, jeder P0001, **jeder 23505** (Ä1), andere 23xxx, 42xxx, P0002/P0003, 22xxx, 53xxx, 55P03, 57014, 58xxx, XX000, 40P01, 40001.

Umsetzung: `when others then`, `GET STACKED DIAGNOSTICS` (Code, Meldung, Constraint, Kontext). Passt I1–I3 → isolieren, sonst `raise` (dieselbe Ausnahme mit unverändertem Code und Text).

**Ablauf eines Ticks (eine Transaktion T)** (unverändert aus Stand 3):
1. `watchdog_core` (Eventende-Abschluss 4a, wartend, aufsteigend nach ID).
2. Für jede Instanz in `group_tick`, aufsteigend nach ID:
   - Sperre `for update skip locked` (in T)
   - Zeit nach der Sperre, Neuprüfung des Status
   - Eventende-Zweig (in T, nicht isoliert)
   - **BEGIN** (Teiltransaktion S): Fristprüfung, `after_auto_removal` mit Nachrücken, Startprüfung, offenen `group_tick_failed`-Alarm schließen
   - **EXCEPTION:** S zurückgerollt (Sperren aus S frei, Instanzsperre aus T bleibt). I1–I3 → Alarm (in T), `failed += iid`. Sonst `raise`.
3. Alarm-Sicherheitsnetz von `watchdog_tick`.
4. Commit von T.

**Vereinbarkeit:** 4a wird nicht mehr durch spätere Gruppenfehler zurückgerollt (Ursache P1); 4b, Sperrreihenfolge unverändert; E2: nur Alarm, keine automatische Beendigung.

**Einordnung:** Nach K-1 fängt das Nachrücken I1–I3 selbst ab. Die Isolation ist eine zweite Schicht → E12.

## 2. Alarm-Episoden

Unverändert aus Stand 3:
- Neue Alarme ohne `dedupe_key` und ohne `ON CONFLICT` → kein stiller Verlust.
- `waitlist_invalid`: nur bei genau einer geänderten Zeile in `update … where id=w.id and status='waiting'`. Der Übergang von `waiting` weg ist einseitig → höchstens ein Alarm je Eintrag.
- `group_tick_failed`: `insert … where not exists (offener Alarm mit detail-Präfix 'instance <iid> sqlstate <code>:')` unter der gehaltenen Instanzsperre; bei späterem Erfolg schließen.
- Eindeutigkeit je Aufrufpfad (Worker `service_role`, direkter Aufruf, künftiger pg_cron-Job, `group_*`-Wrapper und Lösch-Trigger als DEFINER, `anon`/`authenticated` ohne Zugriff) wie in Stand 3, Abschnitt 2.
- Grenze: Direkte Tabellenschreiber (`service_role`, `postgres`) können einen Alarm verdoppeln, nie einen verlieren.
- Ein fehlgeschlagener Alarm wird nicht abgefangen → Tick bricht sichtbar ab.

## 3. Nachrücken

Nachweis P4 (unverändert): `profile_snapshot` (`04:73`) leitet bei ausdrücklich gesetztem Profil nicht neu ab.

Schleife (Stand 4, Ä1 eingearbeitet):

```
exit when active_count >= max_size                         -- unverändert
if member exists → Eintrag storniert, Grund 'already_member' -- unverändert (bisher ohne Grund)
BEGIN                                                      -- Block A
  ok := rwi.eligible(w.player)                             -- UNVERÄNDERTE Funktion
  p  := rwi.profile_of(w.player)
EXCEPTION when sqlstate 'PT422' then
  Meldung nicht ^profile_invalid:[a-z_]+$ oder Kontext nicht rwi.derive_profile( → raise
  sonst: storniert (Bedingung status='waiting'), Grund = Meldung; bei genau 1 geänderter Zeile → Alarm; continue
END
if not ok → storniert, Grund 'not_eligible' (kein Alarm); continue
if p erfüllt (lv ≥ 5 und Grundklasse) nicht → Eintrag bleibt 'waiting', glog 'nachruecken_verschoben'; continue
BEGIN                                                      -- Block B
  insert members(..., profile = p)
EXCEPTION
  when sqlstate 'PT409' → nur Meldung genau 'account_in_instance' und Kontext rwi.account_guard(): storniert, Grund 'account_in_instance'; sonst raise
  when check_violation (23514) → nur Meldung ^Gruppe voll: und Kontext rwi.members_size_guard(): Eintrag BLEIBT 'waiting'; exit; sonst raise
  -- 23505 wird NICHT gefangen (Ä1): bricht den Aufrufer ab
END
→ 'admitted' wie bisher
```

**Streng bleiben unverändert:** `create_group`, `join` (eigener Spieler), `set_ready` (`04:260`).

**K1-9 – paralleles Speichern (Ä4).** `save_character` ändert nur `public.characters`; das Nachrücken liest nur. Es gibt keine gemeinsame Sperre. Unter READ COMMITTED sieht jede Anweisung den bei ihrem Start bestätigten Stand. Je nachdem, wann das Speichern bestätigt wird, gibt es drei Abläufe:

| Ablauf | Zeitpunkt des Commits von `save_character` (ungültiger Stand) | Erwartung |
|---|---|---|
| K1-9a | **vor** dem `eligible`-Aufruf | `eligible` wirft `PT422` → Block A fängt → Eintrag storniert, Grund `profile_invalid:<grund>`, genau 1 Alarm, **kein** Mitglied |
| K1-9b | **zwischen** `eligible` und `profile_of` | `eligible` = true, `profile_of` wirft `PT422` → gleicher Fang in Block A → wie K1-9a |
| K1-9c | **nach** `profile_of` (vor oder nach dem Einfügen bzw. dem Commit des Nachrückens) | Mitglied wird mit dem **vorher gültigen** Profil eingefügt (`profile.char_version` = alte Version), kein Fehler, kein Alarm. Beim eigenen „Bereit“ leitet `set_ready` neu ab (`04:260`) → `PT422` → „Bereit“ abgewiesen (streng, eigener Spieler), Profil bleibt unverändert |
| (N-4) | gültiger Stand, aber z. B. Level < 5, Commit zwischen `eligible` und `profile_of` | `eligible` = true, `p` erfüllt die Bedingung nicht → Eintrag bleibt `waiting`, glog |

Test: Die Zeitpunkte werden über eine Ersatzfunktion nur in der Testdatenbank erzwungen (z. B. `rwi.profile_of` bzw. `rwi.eligible` mit vorgeschaltetem Warten auf eine Beratungssperre, die die zweite Sitzung erst nach ihrem Commit freigibt). K1-9c zusätzlich ohne Hook: Nachrücken in offener Transaktion, zweite Sitzung speichert und bestätigt, dann erste Sitzung bestätigen.

## 4. Phase 2

### 4.1 Fakten (unverändert aus Stand 3)
- Kein Phasenbegriff im SQL; `frozen` erlaubt (`01:12`), nirgends gesetzt.
- `leave` funktioniert bei stuck (`04:229–245`); der letzte Austritt → `abort_instance` (`04:242`) → Alarm geschlossen (`04:526`).
- Lösch-Trigger erfassen stuck-Instanzen.
- `effective_last_seen` = jetzt bei stuck (`01:155`) → Abwesende werden nie entfernt.
- Keine Regel „ein Charakter in höchstens einer aktiven Instanz“ (`04:31` nur je Instanz).

### 4.2 S-B: Nachweis über Schlüsseltypen, Constraints und Erzeugungspfade (Ä3)

**Schlüsseltypen und Constraints:**

| Spalte | Typ | Constraint | Fundstelle |
|---|---|---|---|
| `rwi.members.player` | `text` | nur `members_player_uq (instance_id, player)`; kein Fremdschlüssel, kein Format | `04:31` |
| `rwi.waitlist.player` | `text` | `waitlist_uq (instance_id, player) where status='waiting'`; kein Format | `04:36–38` |
| `rwi.players.player` (Prototyp-Profile) | `text` | Primärschlüssel; kein Format | `04:35` |
| `public.characters.character_id` | `uuid` | Primärschlüssel | `schema.sql` |
| `rwi.members.profile` | `jsonb` | keins; gesetzt beim Einfügen (Trigger `04:73`) und bei „Bereit“ (`04:260`) | |
| `rwi.members.account` / `waitlist.account` | `uuid` | gesetzt von `account_guard` (`04:57`) aus `account_of` (`05:115–118`); **bei Kontolöschung auf null gesetzt** (`05:242–243`) | |

**Erzeugungspfade für Mitglieds- und Wartelistenschlüssel:**

| Pfad | Wer darf | Schlüssel | Profil `src` | Fundstelle |
|---|---|---|---|---|
| `public.group_join` → `rwi.own_character` → `rwi.join` | `authenticated` | `p_character::text` eines eigenen, existierenden Charakters (kanonisch, Kleinbuchstaben) | `derived` | `05:50–52`, `05:25–29` |
| `rwi.create_group(p_players text[])` | nur `service_role` (Serverfunktion, `05:381`) | beliebiger Text; zugelassen nur, wenn `eligible` (`04:187`): UUID-Text mit Charakter → `derived`; sonst Zeile in `rwi.players` → `prototype`; sonst abgewiesen | `derived` oder `prototype` | `04:176–190`, `05:175–181` |
| `rwi.promote_waitlist` | intern | Schlüssel aus `waitlist` (entstanden über einen der Pfade oben) | wie `profile_of` | `04:160–175` |
| `rwi.join` direkt | niemand außer dem Eigentümer (Testfunktion, `05:356`, `05:371`) | beliebig | wie `profile_of` | |
| direktes Einfügen in die Tabellen | `service_role`, `postgres` (`05:378`) | beliebig, umgeht alle Prüfungen | beliebig oder null | außerhalb des Schutzumfangs |

**Folgerungen:**
- Das **UUID-Format allein trägt nicht**: `rwi.players.player` und `members.player` haben keine Formatregel; ein Prototyp-Schlüssel darf UUID-Form haben, und `create_group` nimmt UUID-Text auch in Großbuchstaben an (siehe B-1).
- Das einzige **serverseitig erzeugte, dauerhafte** Kennzeichen ist `members.profile->>'src'`:
  - Es wird nur von `profile_of` gesetzt (beim Einfügen über den Trigger, beim Nachrücken ausdrücklich, bei „Bereit“).
  - `derived` entsteht nur, wenn eine Zeile in `public.characters` existiert (`05:177–178`).
  - Es bleibt nach Charakter- und Kontolöschung erhalten (anders als `account`, das bei der Kontolöschung genullt wird).
  - Es kann nicht von `derived` zu `prototype` wechseln: Das ginge nur bei „Bereit“ ohne Charakterzeile mit `rwi.players`-Zeile. Nach der Charakterlöschung ist das Mitglied aber `left` (Lösch-Trigger), und die `rwi.players`-Zeile wird gelöscht (`05:224`).
- Wartelistenzeilen haben kein Profil. Kennzeichen dort: `account` (nicht null ⇔ Charakter existierte beim Einfügen) **und** Existenz in `rwi.players`.

**Regel S-B (fail-closed), über eine Hook-Funktion wie bei `account_of` (`04:50` Prototyp, `05:115` Produktion):**
- Neue Funktion `rwi.is_bot_member(p_profile jsonb, p_player text) returns boolean` und `rwi.is_bot_waiting(p_player text, p_account uuid) returns boolean`.
- **04 (Prototyp-Schicht, ohne `public.characters`):** beide geben `true` zurück. Echte Spieler gibt es dort nicht (keine Client-Wrapper).
- **05 (Produktion):**
  - Mitglied ist Bot ⇔ `p_profile->>'src' = 'prototype'` **und** es gibt keine `public.characters`-Zeile mit diesem Schlüssel (falls UUID-förmig, auch ohne Rücksicht auf Groß-/Kleinschreibung) **und** es gibt eine `rwi.players`-Zeile. Fehlendes Profil, fehlendes `src` oder jeder andere Wert → **kein** Bot.
  - Wartender ist Bot ⇔ `p_account is null` **und** `rwi.players`-Zeile vorhanden **und** keine Charakterzeile. Sonst kein Bot.
- `terminate_stuck` gibt `phase_locked` zurück, sobald **ein** Mitglied (jeder `mstate`) oder ein Wartender (`status='waiting'`) kein Bot ist.
- Bestehende Grenze: Wer direkt in die Tabellen schreibt, kann `src='prototype'` fälschen. Das sind nur `service_role`/`postgres`, die ohnehin alle Prüfungen umgehen können.

**Neuer Befund B-1 (bestehend, nicht Teil von PR 1):** `create_group` akzeptiert UUID-Text in Großbuchstaben. `profile_of` leitet dann ab (`~*` und `::uuid`), der Mitgliedsschlüssel weicht aber von `character_id::text` ab. Folge: Der Lösch-Trigger (`05:204`, Vergleich mit `old.character_id::text`) findet das Mitglied nicht → Geistermitglied. Nur über `service_role` erreichbar. Vorschlag: eigener Folgepunkt (Normalisierung in `create_group` oder Abweisung).

**Folgen für bestehende Tests:** `stuck.mjs`, `operatoren.mjs`, `operator-edge.mjs` und `hotfix-resume.mjs` nutzen `prod-env.mjs` mit **echten Charakteren** (`prod-env.mjs:35`, `44`). Ihr `terminate` ergibt künftig `phase_locked`. Für `technical_end` braucht es zusätzlich eine Prototyp-Gruppe (`rwi.players`-Zeilen, `create_group` mit Prototyp-Schlüsseln).

### 4.3 Auswege aus „stuck“ und Freeze (unverändert aus Stand 3)
- Auswege: Hotfix + `resume_stuck`; Austritt; Löschung; Weltboss-Eventende; `technical_end` nur Phase 1.
- Lücke: Dungeon, nicht behebbarer Fehler, ein Mitglied kommt nie wieder → Instanz bleibt unbegrenzt bestehen.
- Freeze ist keine Voraussetzung für S-B und würde ohne Mindestbedingungen die Auswege abschneiden (`04:240/254/281/419`, `05:207/234`, `04:643/674`). Paket F nur mit: Austritt und Löschung möglich, Auftauen festgelegt (E10), `resume_stuck` nach dem Auftauen, Eventende auch für `frozen` in den Eingangsfunktionen (E9). Bis dahin kein Freeze.

### 4.4 E13 – offene Betriebsentscheidung (Ä5)

**Status: offen. Phase 2 (echte Spieler im Instanzkampf) ist mit diesem Plan NICHT freigegeben.** PR 1 macht den Prototyp für Dev und Phase 1 (nur Bots) robuster. Er ist keine Betriebsfreigabe.

| Option | Was passiert | Folgen für Spieler | Folgen für Betrieb | Regel- oder Architekturänderung? | Abhängigkeit |
|---|---|---|---|---|---|
| **a) D1 entscheiden, danach `technical_end` in Phase 2** | Betreiber beendet hängende Instanzen technisch | Belohnungsfolge laut D1 (z. B. keine Belohnung, Teilbelohnung, Ersatz) | sauberer Endzustand, Alarm geschlossen | ja: D1 ist eine offene Regelentscheidung (V2 Abschnitt P) | Freigabe D1; danach Anpassung S-B |
| **b) Höchstdauer H für stuck** | nach H greifen die Fristen wieder, Abwesende werden regulär entfernt; ist niemand mehr da → `abort_instance` | Abwesende verlieren den Platz wie bei normaler Abwesenheit, obwohl die Ursache technisch war | Instanz endet von selbst | ja: Änderung an A.6 Schritt 2 (Fristenstopp) und Wert H (D4) | Freigabe Regeländerung |
| **c) Betreiber entfernt Abwesende einzeln** | neue Betreiberfunktion mit Protokoll, wie `drop_member` „abwesend“ | wie b, aber gezielt und begründet | Handarbeit, protokolliert | ja: neue Betreiberfunktion (neuer Umfang in `operators.scopes`) | Freigabe + Umsetzung |
| **d) bewusst hinnehmen** | Instanz bleibt bis zum Austritt aller Mitglieder bestehen | aktive Spieler nicht blockiert (keine Instanzgrenze je Charakter); Abwesende behalten den Platz | offener Alarm und Instanzzeile auf unbestimmte Zeit; Zahl solcher Fälle muss überwacht werden | nein | – |

Bis zur Entscheidung gilt in Dev/Phase 1: `technical_end` nur für reine Bot-Instanzen (S-B). Für Phase 2 ist **vor** der Betriebsfreigabe eine der Optionen a–d ausdrücklich zu wählen.

### 4.5 `terminate_stuck` – Ablauf (Stand 4)
1. Eingaben prüfen, `check_operator`.
2. Instanz und Kampf `for update`.
3. Nicht `active` → `not_active`.
4. Eventende (`clock_timestamp()` nach der Sperre) → `end_instance` + `sweep_event(…, true)` + `close_stuck(…,'event_end',…)` → `event_ended` (vor allem anderen, M-1).
5. Kein stuck-Auftrag → `not_stuck`.
6. S-B: ein Nicht-Bot vorhanden → `ops_log` (kind `denied`, Notiz `phase2: technical_end gesperrt`), `phase_locked`, keine Änderung.
7. Sonst `technical_end_instance` + `close_stuck` + `ops_log terminate` → `terminated`.

Andere Abbrüche (Budget, Mindestgröße, alle ausgetreten) bleiben `aborted` und sind nicht gesperrt. Die Edge Function reicht jeden Status mit HTTP 200 durch (`supabase/functions/operator/handler.mjs:67`).

## 5. M-1, M-2, M-4 (unverändert aus Stand 3)
- **M-1:** Eventende-Prüfung nach der Sperre in `terminate_stuck` (4.5 Schritt 4) und `report_failure` (kein Fehlversuch nach dem Eventende; Muster `03:184`).
- **M-2:** `engine_mismatch` in `commit_round` (`03:190`) zählt als Fehlversuch; ab `max_attempts` `stuck` + `engine_stuck` + `raise_stuck` beim Übergang; Rückgabe ohne Ausnahme; Engine-Bindung bleibt (E3).
- **M-4:** `technical_end_instance` (`technical_end/done/technical_end`, Kämpfe `technical_end`, Aufträge/Fenster/Warteliste wie `abort_instance`, keine Belohnung), nur aus `terminate_stuck`.
- **V2-Doku (E3):** A.5, A.6 Schritt 3/4, E.1 nachziehen.

## 6. M-5 / E4 – offene Entscheidung (Ä6)

**Status: offen. Keine Freigabe für V1 oder V2.** Der Vergleich V1/V2 (Profilinhalt, Größe, Snapshot-Zeitpunkt, Ausrüstungswechsel, Kampfberechnung, Boss-Balancing, Fälschungsrisiko, Determinismus, eingefrorene Architektur, Aufwand) ist unverändert aus Stand 3, Abschnitt 6. Empfehlung bleibt V1 für den Prototyp.

PR 1 ändert die Profilableitung **nicht**. Bis E4 entschieden ist, beschreibt die Doku den Ist-Stand (= V1) ausdrücklich als **vorläufig**.

**Nötige Anpassung von Bericht L** (V2-Bericht, Abschnitt L) – bei V1:

| Punkt in L | Heute in L | Anpassung (Ist-Stand V1) |
|---|---|---|
| Lücke (Einleitung) | Ableitung braucht kopierte JS-Formeln, kann nicht in SQL laufen | Ableitung läuft in SQL (`rwi.derive_profile`, `05:136–171`); es werden nur Klasse, Pfad, Stufe und Level abgeleitet, keine Ausrüstung |
| L.3 | `set_ready` legt `derive_jobs`-Auftrag an | keine Aufträge; Ableitung synchron beim Eintritt (Trigger `04:73`) und bei „Bereit“ (`04:260`) |
| L.4 | Edge Function `derive-profile`, `store_profile` | entfällt; `char_version` wird im Profil gespeichert (`05:153/170`) |
| L.5 | Fristen ruhen bei offener Ableitung | entfällt (keine technische Verzögerung möglich) |
| L.6 | Abweisung mit Grund + `ops_alerts` | Eintritt/„Bereit“: Ausnahme `PT422 profile_invalid:<grund>` an den Aufrufer, **kein** Alarm; Hintergrundpfade (Nachrücken, K-1): Stornierung mit Grund + Alarm |
| L.7 | eingefroren ab „Bereit“ | unverändert gültig; „Bereit“ wird nach jedem Kampf zurückgesetzt (`04:315`) → neue Ableitung vor jedem Kampf |
| L.9 | Ablehnung statt Ausnahme | gilt nur in Hintergrundpfaden (K-1); auf den eigenen Pfaden bleibt die Ausnahme (streng) |
| L.1, L.10 | Sperr-/Konfliktzustand; ein aktives Mitglied je Charakter | nicht umgesetzt bzw. nicht geprüft; als offen kennzeichnen |
| neu | – | Hinweis: Ausrüstung, Level-Skalierung und Set-Boni wirken im Instanzkampf nicht (vorläufig, E4) |

Bei V2 bliebe L inhaltlich gültig; dann wären Skalenentscheidung, Ledger und Engine-Erweiterung eigene Vorhaben.

Hinweis: In `/home/user/ruinwalk-k2` liegt eine nicht committete Änderung an derselben V2-Datei. Die L-Anpassung muss danach zusammengeführt werden.

## 7. Migration 06 (unverändert aus Stand 3, ergänzt um S-B)

| Objekt | Art | Eigenschaften |
|---|---|---|
| `rwi.waitlist.reason text` | neue Spalte | Tabellenrechte übernommen, RLS aktiv (`05:386`) |
| `rwi.technical_end_instance(bigint, text)` | neu | `plpgsql`, INVOKER, VOLATILE, Namen mit Schema, kein `SET` |
| `rwi.is_bot_member(jsonb, text)`, `rwi.is_bot_waiting(text, uuid)` | **neu (Ä3)** | 04-Fassung: `sql`, STABLE, INVOKER, Rückgabe `true`. 05-Fassung (`create or replace`): `sql`, STABLE, **SECURITY DEFINER** (liest `public.characters`, wie `account_of` `05:115–118`), `set search_path = public, pg_temp`, Eigentümer `postgres` |
| `promote_waitlist`, `group_tick`, `watchdog_tick`, `terminate_stuck`, `report_failure`, `commit_round` | `create or replace` | Signatur, INVOKER, kein `SET`; ACL und Eigentümer bleiben |
| `rwi.cfg` | keine neue Zeile | – |

**Rechte:**
- `technical_end_instance`, `is_bot_member`, `is_bot_waiting`: `revoke all … from public, anon, authenticated, service_role`; `grant execute … to service_role` (Aufruf über `rw_ops_terminate` als INVOKER, `05:341`).
- Einordnung: alle drei als Serverfunktionen; 06 bringt eine eigene Einordnungsprüfung mit (die Schleife `05:351–364` läuft nur bei 05).
- Standardrechte `05:372–374` gelten zusätzlich, trotzdem ausdrücklich entziehen.
- DEFINER-Prüfung im Test: alle DEFINER-Funktionen in `rwi`/`public` mit Eigentümer `postgres` und `search_path` in `proconfig` (jetzt einschließlich `is_bot_*`).
- RLS: keine neue Tabelle, keine neue Richtlinie.

**Rollback:** 6 Funktionen wörtlich wie in 03/04; `drop function` für `technical_end_instance`, `is_bot_member`, `is_bot_waiting`; `drop column reason`; Meldung von Instanzen mit `technical_end`. Test: Fingerabdruck = Installation 01–05.

**Werkzeuge und Prüfsummen:** `build.sh` (06 aufnehmen), `rollback_dev.sql` (Fingerabdruck: 67 → **70** Funktionen, Spalte `waitlist.reason`), `installation.mjs` (Reihenfolge Z. 24, Fingerabdrücke), `rechte-audit.mjs`, neue sha256 in `docs/DEV_INSTALLATIONSFREIGABE.md` nach dem Erzeugen.

**Testlader (E11):** 15 Testdateien laden SQL mit eigenen Listen, manche nur 01–04. Empfehlung (a): Korrekturen direkt in 03/04/05 einarbeiten. Dann gilt für E5 („Migration, Rollback, Tests, Prüfsumme“): Migration = geänderte Installationsdateien (Erstinstallation, auf Dev ist nichts installiert); Rollback = angepasstes `rollback_dev.sql` mit neuem Fingerabdruck; Prüfsumme = neue sha256. Alternative (b): eigene Datei 06 + gemeinsamer Lader.

## 8. Wackelstelle `installation.mjs` (unverändert aus Stand 3)
Z. 399–403 und 468–472 (gemessen 7412–7953 ms gegen 8000 ms): Sperrhalter über `pg_locks` synchronisieren statt fester 1200 ms; Haltezeit 60 s, danach `pg_terminate_backend`; reine Wartezeit ab `wait_event_type='Lock'` messen (4,5–7 s); zusätzlich 55P03 prüfen und dass die Sperre zum Abbruchzeitpunkt noch gehalten ist; Gesamtzeit grob ≤ 15 s. Gleiches Muster für Z. 253/259.

## 9. Tests (vollständige Liste Stand 4)

Neue Testdatei `server/instance/tests/korrekturen-pr1.mjs`, eingetragen in `run-all-db.sh` und `instance-tests.yml`.

**Klärung der in Stand 3 fehlenden Fälle (Auftrag Punkt 1):**

| Fall (Stand 2) | Inhalt in Stand 2 | Entscheidung Stand 4 |
|---|---|---|
| K1-5 | Wartender unter Level 5 → storniert `not_eligible`, kein Alarm | **übernommen als N-1** (gleicher Inhalt, in Stand 3 nur umbenannt) |
| G-4 | Abbruch-Code (`42501`) → ganzer Tick schlägt fehl, auch 4a zurückgerollt | **wieder aufgenommen** als eigener Fall: I-10 prüft nur den Abbruch, G-4 zusätzlich, dass der 4a-Abschluss mit zurückgerollt wird (erwartet, fail-closed) |
| G-5 | Episode: Fehler → Alarm; Erfolg → Alarm erledigt; Fehler erneut → neuer Alarm | **wieder aufgenommen**; passt zum Entwurf aus Abschnitt 2 (Schließen bei Erfolg, `not exists` auf offene Alarme). In Stand 3 fälschlich nur durch A-3 (Handlöschung) ersetzt |
| G-6 | Alarm-Schreiben scheitert → Tick bricht sichtbar ab | **übernommen als A-4** (gleicher Inhalt) |

**Tabelle:**

| Nr | Fall | Erwartung |
|---|---|---|
| K1-1 | P1-Nachbau: Weltboss + Dungeon, Wartender Z ungültig, Frist von A abgelaufen | Tick gelingt; Weltboss `event_ended`; A entfernt; Z storniert `profile_invalid:path_class_mismatch`; 1 Alarm |
| K1-2 | gleicher Tick noch zweimal | kein zweiter Alarm |
| K1-3 | X tritt bei bzw. meldet „Bereit“, Z wartet ungültig | X gelingt |
| K1-4 | Konto-Konflikt beim Nachrücken (`PT409`) | storniert, `account_in_instance`, kein Abbruch |
| K1-6/7 | S1 Beitritt, S2 „Bereit“ mit eigenem ungültigem Spielstand, S3 Gruppe anlegen mit ungültigem Spieler | `PT422` bzw. Abweisung, unverändert |
| K1-8 | Einfügen mit ausdrücklichem Profil bei ungültigem Charakter | gelingt, Profil = gesetztes Profil |
| K1-9a | Speichern bestätigt vor `eligible` | storniert mit Grund, 1 Alarm, kein Mitglied |
| K1-9b | Speichern bestätigt zwischen `eligible` und `profile_of` | wie K1-9a |
| K1-9c | Speichern bestätigt nach `profile_of` | Mitglied mit altem gültigem Profil (`char_version` alt), kein Alarm; danach eigenes „Bereit“ → `PT422`, Profil unverändert |
| N-1 (= K1-5) | Wartender unter Level 5 | storniert `not_eligible`, kein Alarm |
| N-2 | „Gruppe voll“ (zwei Sitzungen) | Eintrag bleibt wartend |
| N-4 | gültiger Stand < Level 5 zwischen `eligible` und `profile_of` | bleibt wartend, glog |
| N-5 (neu, Ä1) | `members_account_uq`-Verletzung über Hook (umgeht `account_guard`) | **Abbruch** des Aufrufers (nicht mehr storniert) |
| L1–L6 | Löschungen (Charakter, Konto, Kaskade, Stufe 2, Löschender selbst ungültig, Konto-Konflikt) | jeweils erfolgreich, Folgezustand geprüft |
| G-1 | zwei Instanzen, erste wirft I1 (Hook), zweite mit abgelaufener Frist | zweite verarbeitet, erste unverändert, `failed=[1]`, 1 Alarm |
| G-2 | Sperrprobe mit `for update nowait` | `55P03` |
| G-3 | Teilergebnisse in S, dann Fehler | Entfernung zurückgerollt |
| G-4 | Hook wirft `42501` | Tick bricht ab; 4a-Abschluss derselben Transaktion ebenfalls zurückgerollt |
| G-5 | Fehler → Alarm; nächster Tick ohne Fehler → Alarm erledigt; Fehler erneut | zwei Alarmzeilen, die erste erledigt |
| G-7 | Eventende gleichzeitig mit Fehler in anderer Instanz | Eventende bleibt erhalten |
| I-1…I-3 | je ein isolierbarer Fehler (I1–I3) | Isolation |
| I-5 | `P0001` | Abbruch |
| I-6 | `PT422` ohne `profile_invalid:` | Abbruch |
| I-7 | `PT409 ambiguous_character` | Abbruch |
| I-8 | `23514` aus anderer Prüfregel | Abbruch |
| I-9 | `23505` (jeder Constraint, auch `members_account_uq`) | Abbruch (Ä1) |
| I-10 | `42501`, `P0002`, `40P01` | Abbruch |
| A-1 | zwei parallele `watchdog_tick` über 20 Durchläufe | genau ein offener `group_tick_failed` je Instanz und Ursache |
| A-2 | Eintrag über drei Pfade gleichzeitig nachgerückt | genau ein `waitlist_invalid` |
| A-3 | `service_role` löscht offenen Alarm von Hand | nächster Fehler → neuer Alarm |
| A-4 (= G-6) | Alarm-Schreiben scheitert | Tick bricht sichtbar ab |
| A-5 | `authenticated` auf `rwi.ops_alerts` | verweigert |
| M1-1…M1-3 | P3-Nachbau; zwei Sitzungen über `ends_at`; `report_failure` nach `ends_at` | `event_ended`; Zähler unverändert |
| M2-1…M2-4 | P2-Nachbau; Wiederaufnahme mit richtiger Engine; richtige Engine sofort; Mismatch nach `ends_at` | `stuck` + 1 Alarm; gelöst; kein Zähler; `event_ended` |
| M4-1/M4-2 | Bot-Instanz: `terminate`, zweiter Aufruf | `technical_end`, keine Belohnung; `not_active` |
| P2-1 | stuck-Instanz mit echtem Charakter (`src='derived'`) | `phase_locked`, nichts geändert, `ops_log denied` |
| P2-2 | reine Prototyp-Gruppe (`rwi.players`, `src='prototype'`) | `technical_end` |
| P2-3 | echter Charakter bereits gelöscht (Mitglied `left`, `src` bleibt `derived`) | `phase_locked` |
| P2-4 | echter Wartender (`account` nicht null) | `phase_locked` |
| P2-5 | alle treten aus | `aborted`, Alarm erledigt |
| P2-6 | Löschung | gelingt |
| P2-7 | Eventende | `event_ended` vor `phase_locked` |
| P2-8 | über die Edge Function | 200 + `phase_locked` |
| P2-9 (neu) | Prototyp-Schlüssel in UUID-Form ohne Charakter, `src='prototype'` | Bot → `technical_end` (Format allein entscheidet nicht) |
| P2-10 (neu) | Mitglied mit fehlendem Profil bzw. ohne `src` (direkt eingefügt) | kein Bot → `phase_locked` (fail-closed) |
| P2-11 (neu) | Konto gelöscht (`account` genullt), Mitglied `src='derived'` | `phase_locked` |
| P2-12 (neu) | 04-Installation ohne 05 | `is_bot_*` = true → `technical_end` |
| R-1…R-4 | Rechte nach 06 (inkl. `is_bot_*` DEFINER/Eigentümer/`search_path`), Rollback-Fingerabdruck, `rollback_dev.sql`, Einordnungsprüfung | wie Stand 3 |

Gestrichen: **N-3** (Ä1, ersetzt durch N-5), **I-4** (Ä1, in I-9 aufgegangen).

Test-Hooks über temporäre Ersatzfunktionen nur in der Testdatenbank.

**Bestehende Tests:** `stuck.mjs:104`, `operatoren.mjs:70`, `operator-edge.mjs:94` (echte Charaktere → `phase_locked`; `technical_end` über zusätzliche Prototyp-Gruppe); `installation.mjs`, `rechte-audit.mjs`; ganz `run-all-db.sh` auf PG16, PG17 über CI.

## 10. Mutationsproben (vollständige Liste Stand 4)

**Klärung ⑰–⑲ (Auftrag Punkt 1):**

| Nr (Stand 2) | Inhalt in Stand 2 | Entscheidung Stand 4 |
|---|---|---|
| ⑰ | Phasenprüfung (`betriebsphase`) entfernt → P2-1 rot | **ersetzt durch ㉖** (S-B-Prüfung entfernt). Grund: Vorgabe „keine `betriebsphase`“ |
| ⑱ | fehlende Phase wird als 1 behandelt → P2-4 rot | **sinngemäß übernommen als ⑱'**: unbekanntes/fehlendes Kennzeichen wird als Bot behandelt → P2-10 rot (fail-closed-Probe für S-B) |
| ⑲ | Phasenprüfung vor dem Eventende → M1-4 rot | **übernommen als ⑲'**: S-B-Prüfung vor die Eventende-Prüfung verschoben → P2-7 rot |

**Tabelle:**

| Nr | Mutation | Muss rot werden |
|---|---|---|
| ① | Nachrücken reicht `PT422` weiter | K1-1, K1-3, L1–L3 |
| ② | Profil beim Einfügen nicht gesetzt | K1-9c (Trigger leitet erneut ab und wirft) |
| ③ | Grund wird nicht gespeichert | K1-1, K1-4 |
| ④ | `PT409` nicht abgefangen | K1-4, L6 |
| ⑤ | `join` nachsichtig | S1 |
| ⑥ | BEGIN/EXCEPTION in `group_tick` entfernt | G-1, G-7 |
| ⑦ | Sperre in S verschoben | G-2 |
| ⑧ | Abbruch-Klasse wird isoliert | I-5…I-10, G-4 |
| ⑨ | Fehler ohne Alarm | G-1 |
| ⑩ | Alarm mit festem Schlüssel und `on conflict do nothing` | G-5, A-3 |
| ⑪ | Alarm-Schreiben mit `exception when others then null` | A-4 |
| ⑫ | `ends_at`-Prüfung in `terminate` entfernt | M1-1 |
| ⑬ | `now()` statt `clock_timestamp()` | M1-2 |
| ⑭ | Zähler bei `engine_mismatch` entfernt | M2-1 |
| ⑮ | `raise_stuck` ohne Übergangsprüfung | M2-1 |
| ⑯ | `abort_instance` statt `technical_end_instance` | M4-1 |
| ⑱' | fehlendes/unbekanntes Kennzeichen = Bot | P2-10 |
| ⑲' | S-B vor Eventende | P2-7 |
| ⑳ | `when others` isoliert ohne Listenprüfung | I-5…I-10 |
| ㉑ | Kontextprüfung bei I1–I3 entfernt | I-6, I-8 |
| ㉒ | „Gruppe voll“ storniert | N-2 |
| ㉓ | `eligible` durch eigene Regel ersetzt | N-1 (Vergleich mit dem Original über alle Profiltestfälle) |
| ㉔ | 23505 im Nachrücken wieder gefangen | N-5, I-9 |
| ㉕ | Alarm ohne Bedingung „genau 1 Zeile geändert“ | A-2 |
| ㉖ | S-B-Prüfung in `terminate_stuck` entfernt | P2-1 |
| ㉗ | S-B nur über UUID-Format statt `src` | P2-9, P2-10 |
| ㉘ | `grant execute` für `technical_end_instance` fehlt | P2-2 über den Wrapper |
| ㉙ | Rollback stellt eine Funktion nicht wörtlich wieder her | R-2 |
| ㉚ | S-B prüft nur aktive Mitglieder | P2-3 |
| ㉛ | S-B nutzt `account` statt `src` für Mitglieder | P2-11 |

Hinweis: ㉔ ersetzt den alten Inhalt von ㉔ aus Stand 3 („Alarm mit `on conflict do nothing`“), der in ⑩ aufgeht.

## 11. Belastungstest Teiltransaktionen (E6, unverändert)
Vor der Betriebsfreigabe, nicht in diesem PR: 100/200 Instanzen, > 64 schreibende Teiltransaktionen je Tick, 20 parallele Sitzungen; Tick-Dauer, Latenz, `SubtransSLRU`/`SubtransBuffer`; PG16/17; bei merklicher Bremse Begrenzung je Tick (Betriebsentscheidung).

## 12. Abgleich mit den bisherigen Entscheidungen von Pascal (Auftrag Punkt 6)

| Entscheidung | Inhalt | Übernommen? |
|---|---|---|
| Freigabe Korrekturen | K-1, group_tick-Isolation, M-1, M-2, M-4 | ja (Abschnitte 1–5); M-3 und M-5 ohne Verhaltensänderung |
| K-1-Vorgabe | Hintergrundpfade brechen nicht ab; Eintritt und Ready bleiben streng | ja (Abschnitt 3) |
| E1 | `PT409 account_in_instance` beim Nachrücken mit Grund stornieren | ja. **Korrektur:** Stand 3 hatte zusätzlich `23505` als „Konto-Konflikt“ gefangen; das ging über E1 hinaus und widersprach der Vorgabe „unerwartete Integritätsfehler abbrechen“ → gestrichen (Ä1) |
| E2 | dauerhafte group_tick-Fehler nur alarmieren | ja |
| E3 | stuck-Sperre, Betreiber-Wiederaufnahme, Engine-Bindung bestätigt; V2 aktualisieren; Phase-2-Sperre erhalten; Freeze gesondert | ja (Abschnitte 4, 5) |
| E4 | keine Freigabe; Varianten gegenüberstellen | ja, als offen gekennzeichnet (Abschnitt 6) |
| E5 | `waitlist.reason` inkl. Migration, Rollback, Tests, Prüfsumme; keine Installation | ja; bei E11 (a) über die Installationsdateien und `rollback_dev.sql` (Abschnitt 7) |
| E6 | Lasttest vor Betriebsfreigabe | ja (Abschnitt 11) |
| Vorgaben Stand 3 | nur bekannte Fehler isolieren, P0001 nach Grund; Alarm-Eindeutigkeit belegen; `eligible` erhalten, PT409/Gruppe voll eng; keine `betriebsphase`; M-5 vollständig; Migration vollständig | ja; zu „nur bekannte Fehler“ siehe Ä1 |
| Grenzen | keine Änderungen an 4a/4b, K1, Ansatz A, Variante 2; `docs/quests/` und `a-k1.mjs` unangetastet | ja; Freeze-Punkt E9 würde 4b-Code berühren und ist deshalb ausdrücklich nicht Teil von PR 1 |

## 13. Offene Entscheidungen

**Für die Umsetzung von PR 1 nötig:**
- **E11:** Korrekturen direkt in 03/04/05 (empfohlen) oder eigene Datei 06 mit gemeinsamem Lader?
- **E12:** Fehlerisolation in `group_tick` mit der engen Liste I1–I3 umsetzen (zweite Schicht) oder weglassen?
- **E14:** Phase-2-Sperre als S-B (datenbasiert über `src`, empfohlen), S-A (Betreiberrecht) oder beides?

**Nicht nötig für die Umsetzung, aber für den Betrieb bzw. die Doku:**
- **E13:** Umgang mit dauerhaft hängenden Dungeons in Phase 2 (a–d, Abschnitt 4.4). Ohne diese Entscheidung keine Phase-2-Freigabe.
- **E4:** Profilableitung V1 oder V2. Bis dahin Bericht L als „vorläufig V1“ angepasst.
- **E8/E9/E10:** Paket F (Freeze), Eventende für `frozen` in den Eingangsfunktionen (berührt 4b-Code), Auftauen. Nicht Teil von PR 1.
- **D1:** Belohnungsfolge von `technical_end` (Voraussetzung für E13 a).
- **B-1:** Normalisierung von Schlüsseln in `create_group` als eigener Folgepunkt?

## 14. Ist PR 1 danach technisch umsetzbar?

**Ja**, sobald E11, E12 und E14 entschieden sind. Alle übrigen offenen Punkte betreffen den Betrieb (E13, D1), spätere Pakete (E8–E10, B-1) oder die endgültige Fassung von Bericht L (E4). Sie blockieren die Umsetzung nicht.

Vorbehalte:
- PR 1 bleibt eine Verbesserung für Dev und Phase 1. **Keine Freigabe für Phase 2.**
- Die bisher als „nicht freigabefähig“ bewerteten Punkte K-1, M-1, M-2 und M-4 sind mit diesem Plan vollständig adressiert. M-3 und M-5 werden nur dokumentiert.
- Nach der Umsetzung ist eine erneute unabhängige Prüfung durch `rw-qa`, `rw-instanzkampf` und `rw-backend-security` nötig (Abgleichpflicht).

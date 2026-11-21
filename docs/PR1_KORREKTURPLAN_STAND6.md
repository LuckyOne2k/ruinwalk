# Korrigierter Plan PR 1 – Stand 6 (21.11.2026)

> Nur Plan. Keine Code-, SQL-, Test-, Workflow- oder Konfigurationsänderung, kein Commit, keine Datenbankaktion, keine Installation.
> Stand 6 ersetzt Stand 5 (`docs/PR1_KORREKTURPLAN_STAND5.md`, Commit `a1e6bdb`) vollständig. Stand 5 ersetzte Stand 4 (`docs/PR1_KORREKTURPLAN_STAND4.md`, Commit `e996bea`).
> Änderungen gegenüber Stand 5: Abschnitt 0.4. Grundlage: Prüfberichte zu Stand 5 (E14/S-B, K1-9, Vollständigkeit) und zu K1-9g (Sperrreihenfolgen, B-2) vom 21.11.2026.
> Bezug: lokaler Zweig `integration/nacht-nach-main` in `/home/user/ruinwalk-pr1` (Basis `main` `c9b351a` + `nacht/operator-edge-function` `2cd72e5`, nicht gepusht).
> Fundstellen: `server/instance/sql/0X_*.sql:Zeile` = `0X:Zeile`.
> **Phase 2 (echte Spieler im Instanzkampf) bleibt gesperrt. Dieser Plan enthält keine Freigabe für Phase 2.**

## 0. Verbindliche Entscheidungen und Änderungen gegenüber Stand 4

### 0.1 Entscheidungen (Pascal)

| Nr | Entscheidung | Stand |
|---|---|---|
| Freigabe | Korrekturen K-1, M-1, M-2, M-4; M-3 und M-5 nur dokumentieren | übernommen |
| K-1 | Hintergrundpfade brechen bei ungültigem `character_data` nicht ab (Eintrag mit Grund stornieren, Alarm); Eintritt und „Bereit“ bleiben streng | übernommen (Abschnitt 2) |
| E1 | `PT409 account_in_instance` beim Nachrücken mit Grund stornieren | übernommen |
| E2 | dauerhafte Fehler nur alarmieren, nicht automatisch beenden | übernommen; durch E12 betrifft das nur noch das Nachrücken |
| E3 | stuck-Sperre, Betreiber-Wiederaufnahme, Engine-Bindung bestätigt; V2 aktualisieren; Phase-2-Sperre erhalten; Freeze gesondert | übernommen (Abschnitte 4, 5, 6) |
| E5 | `waitlist.reason` freigegeben inkl. Migration, Rollback, Tests, Prüfsumme; keine Installation | übernommen in der Auslegung von E11 |
| **E6 (neu)** | Belastungstest bleibt, **neu definiert** als allgemeiner Last- und Stabilitätstest mit 100/200 Instanzen; **kein** Test auf > 64 Teiltransaktionen | übernommen (Abschnitt 10) |
| **E11 (neu)** | Änderungen **direkt in 03/04/05**, keine Datei 06. Für die noch nicht installierte Dev-Umgebung gelten die geänderten Installationsdateien als Migration und `rollback_dev.sql` mit neu erzeugtem Manifest als Rollback. Vor einer späteren Produktionsinstallation muss der dortige Installationsstand separat geprüft werden | übernommen (Abschnitt 7) |
| **E12 (neu)** | **Keine** zusätzliche Fehlerisolation in `group_tick`. Fehlerbehandlung zentral in `promote_waitlist`. Unerwartete Fehler brechen den gesamten Tick ab; Restrisiko: auch das Eventende (4a) kann zurückgerollt werden | übernommen (Abschnitte 1, 3) |
| **E14 (neu)** | S-B allein über `members.profile->>'src'` für Phase 1. Normale Clients können das Merkmal nicht setzen; `service_role` und `postgres` können es wegen ihrer Schreibrechte manipulieren → Vertrauensgrenze, keine absolute Sicherheitsgarantie. Phase 2 bleibt gesperrt | übernommen (Abschnitte 4, 8) |
| Vorgabe | keine neue `betriebsphase`-Konfiguration | übernommen |
| Vorgabe | `eligible` unverändert erhalten; PT409 und Gruppengröße eng abfangen; unerwartete Integritätsfehler (auch 23505) brechen ab; kein pauschales Verschlucken | übernommen (Abschnitt 2) |

### 0.2 Entfernt gegenüber Stand 4 (Folge von E12/E6)
- Isolationsliste I1–I3 in `group_tick` und der zugehörige BEGIN/EXCEPTION-Block.
- Alarm `group_tick_failed` samt Episoden-Logik (Schließen bei Erfolg, Präfix-Prüfung).
- Rückgabefelder `failed` (`group_tick`) und `group_failed` (`watchdog_tick`); **`watchdog_tick` bleibt unverändert.**
- Tests G-1, G-2, G-3, G-4, G-5, G-7, I-1…I-3, I-5…I-10, A-1, A-3 (Einzelbegründung in Abschnitt 9.3).
- Mutationsproben ⑥, ⑦, ⑧, ⑨, ⑩, ⑪, ⑳, ㉑ (Abschnitt 11.2).
- Belastungstest „> 64 schreibende Teiltransaktionen“ (E6 neu).
- Alle Bestandteile einer Datei 06 (eigene Migration, eigener Rollback, eigene Einordnungsprüfung, Testlader-Anpassung).

### 0.3 Neu gegenüber Stand 4
- N-8 (alle acht Nachrück-Aufrufwege), N-9 (bewusster Abbruch bei unerwartetem Fehler im Tick), N-10 (Nachrücken bei unerwartetem Fehler: kein Verschlucken).
- Sicherheits- und Betriebsregeln mit der Einschränkung von E14 (Abschnitt 8).
- Anpassungen an Funktionsliste `05:353`, Rollback-Manifest, `installation.mjs`, `rechte-audit.mjs` für Variante a (Abschnitt 7).

### 0.4 Änderungen gegenüber Stand 5 (Stand 6)

| # | Änderung | Abschnitt | Grund |
|---|---|---|---|
| S6-1 | `is_bot_waiting`: zusätzlich „Schlüssel hat kein UUID-Format“ (fail-closed) | 4.1 | Wartende haben kein `src`; `account` und `rwi.players` sind durch `service_role` änderbar; B-2 erzeugt Wartende mit `account` NULL auch ohne Manipulation |
| S6-2 | Tests P2-14 bis P2-18, Mutationsprobe ㊴ | 9.1, 11.1 | Prüfbericht zu Stand 5, Punkt 1; P2-18 macht „auf Produktion nie `technical_end`“ prüfbar |
| S6-3 | K1-9 als Snapshot-Modell S1/S2/S3; maßgebliche Versionen; K1-9a–K1-9d präzisiert; neu K1-9e, K1-9f, K1-9g1–K1-9g4 | 2.6, 9.1 | Prüfbericht zu Stand 5, Punkt 2, und Prüfbericht K1-9g |
| S6-4 | Sperrreihenfolgen Löschung / Nachrücken / Beitritt | 2.7 | Prüfbericht K1-9g |
| S6-5 | Regeln 8.1 und 8.2 präzisiert; Regel 8.7 (B-2) neu | 8 | Prüfbericht zu Stand 5, V-2/V-5; B-2 |
| S6-6 | **B-2** als offener, bestehender Fehler (Wettlauf Beitritt ↔ Charakterlöschung); **kein** Fix festgelegt; der früher genannte `FOR SHARE`-Ansatz ist verworfen (Deadlock mit der Kontolöschung, 2.7.4) | 2.7.3, 2.7.4, 14.4 | Prüfbericht K1-9g; Hinweis Pascal 21.11.2026 |
| S6-7 | Korrektur einer Aussage im Prüfbericht K1-9g: „kein Deadlock mit `FOR SHARE`“ galt nur für die Charakterlöschung, **nicht** für die Kontolöschung | 2.7.4 | Hinweis Pascal 21.11.2026, nachvollzogen |
| S6-8 | Versionsbezeichnungen bereinigt (Kopf, 2.2; 9.1, 11.1, 13 geprüft) | Kopf, 2.2 | Korrekturauftrag Pascal 21.11.2026, Befund 1 |
| S6-9 | Regel 8.1 als **betriebliche Vorgabe** gekennzeichnet; technisch erzwungen ist nur der Ausschluss von `anon`/`authenticated` | 8 | Korrekturauftrag Pascal 21.11.2026, Befund 2 |
| S6-10 | K1-9g4 als **dokumentierter, erwarteter Ist-Fehler**: bestanden bei exakt dokumentiertem Zustand, getrennt gezählt, jede Abweichung rot | 2.7.5, 9.1, 11.1 | Korrekturauftrag Pascal 21.11.2026, Befund 3 |

E11, E12 und E14 sind unverändert. Phase 2 bleibt gesperrt.

## 1. group_tick und Watchdog (E12)

- `group_tick` (`04:430–453`) und `watchdog_tick` (`04:515–528`) bleiben **unverändert**. Es gibt keine Teiltransaktion und keine Isolation je Instanz.
- Die Ursache von Probe P1 (Nachrücken wirft `PT422` → ganzer Tick inkl. Eventende-Abschluss 4a zurückgerollt) wird durch K-1 im Nachrücken beseitigt (Abschnitt 2), nicht durch den Tick.
- Was in `group_tick` außerhalb des Nachrückens werfen könnte (Prüfung aus dem Bericht zu E12, unverändert gültig):

| Funktion | Kann aus Daten werfen? | Beleg |
|---|---|---|
| `deadline_verdict` | nein | `04:123–136`: nur Lesezugriffe, kein `raise`, kein `into strict` |
| `drop_member` | nein | `04:97–110`; `members_size_guard` kehrt bei `mstate <> 'active'` sofort zurück (`04:19`) |
| `glog` | nein | Einfügen ins Protokoll |
| `after_auto_removal` → `abort_instance` | nein | `04:112–119`, `04:86–95`: Endzustand `aborted/done/aborted` passt zu `instances_event_end_state` (`04:29`); Trigger `fights_end` nur bei `won`/`lost` (`04:327`) |
| Startprüfung | nein | `04:447–449`: nur Lesezugriffe |
| `promote_waitlist` | **heute ja** (`PT422`, `PT409`, `23514`) | nach K-1 eng behandelt (Abschnitt 2) |

**Restrisiko (ausdrücklich, E12):** Jeder künftige, heute unbekannte Fehler in einer Instanz – auch ein datenabhängiger – bricht den **gesamten** Tick ab. Weil `watchdog_tick` = `watchdog_core` + `group_tick` in **einer** Transaktion läuft (`04:515–528`), wird dabei auch der bereits erledigte **Eventende-Abschluss (Regel 4a) zurückgerollt**. Der Fehler ist sichtbar (pg_cron-Status `failed` bzw. Fehler am Worker), wirkt aber global, bis er behoben ist. Absicherung: Tests N-8 und N-9. Eine Trennung von `watchdog_core` und `group_tick` in getrennte Transaktionen wäre eine Architekturänderung und ist **nicht** Teil von PR 1.

## 2. K-1: Nachrücken (`promote_waitlist`, `04:160–175`)

### 2.1 Nachweis `profile_snapshot`
- Code: `04:73` `new.profile := coalesce(new.profile, rwi.profile_of(new.player))`. `COALESCE` wertet das zweite Argument nur aus, wenn das erste null ist; `profile_of` ist STABLE und wird nicht vorab berechnet.
- Probe P4 (lokale Wegwerf-Datenbank, 20.11.2026): Charakter mit ungültigem Spielstand. Einfügen **mit** Profil → gelingt, gesetztes Profil gespeichert. Einfügen **ohne** Profil → `profile_invalid:path_class_mismatch`. Damit ist belegt: Bei gesetztem Profil wird `profile_of` nicht aufgerufen.
- Absicherung als Regressionstest K1-8 und Mutationsprobe ②.

### 2.2 Ablauf (Stand 6; inhaltlich unverändert seit Stand 5)

```
exit when active_count >= max_size                         -- unverändert
if member exists → Eintrag storniert, Grund 'already_member' -- unverändert (bisher ohne Grund)
BEGIN                                                      -- Block A
  ok := rwi.eligible(w.player)                             -- UNVERÄNDERTE Funktion (04:79 / 05:183)
  p  := rwi.profile_of(w.player)
EXCEPTION when sqlstate 'PT422' then
  GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, ctx = PG_EXCEPTION_CONTEXT
  msg nicht ^profile_invalid:[a-z_]+$  ODER  ctx enthält nicht 'rwi.derive_profile(' → raise
  sonst: update waitlist set status='cancelled', reason=msg where id=w.id and status='waiting';
         bei genau 1 geänderter Zeile → Alarm 'waitlist_invalid'; continue
END
if not ok → storniert, Grund 'not_eligible' (kein Alarm, wie bisher still); continue
if p erfüllt (lv ≥ 5 und Grundklasse) nicht → Eintrag bleibt 'waiting', glog 'nachruecken_verschoben'; continue
BEGIN                                                      -- Block B
  insert members(..., profile = p)                         -- Profil ausdrücklich gesetzt (2.1)
EXCEPTION
  when sqlstate 'PT409' then
    msg genau 'account_in_instance' UND ctx enthält 'rwi.account_guard()' → storniert, Grund 'account_in_instance'; continue
    sonst → raise
  when check_violation (23514) then
    msg ^Gruppe voll:  UND ctx enthält 'rwi.members_size_guard()' → Eintrag BLEIBT 'waiting'; exit
    sonst → raise
END
→ 'admitted' wie bisher
```

### 2.3 Prüfung der Fänge (eng, gezielt, kein pauschaler Fang)

| Fang | Quelle | Warum eng genug | Was nicht gefangen wird |
|---|---|---|---|
| `PT422` | `derive_profile` (`05:141–168`), alle Meldungen `profile_invalid:<grund>` | Code **und** Meldungsmuster **und** Kontext müssen passen | jeder andere `PT422` (Meldung oder Herkunft abweichend) → `raise` |
| `PT409` | `account_guard` (`04:60`), Meldung genau `account_in_instance` | Code **und** exakte Meldung **und** Kontext; der zweite `PT409` im System (`ambiguous_character`, `05:43`) liegt nur im Clientweg | `ambiguous_character` und jeder andere `PT409` → `raise` |
| `23514` | `members_size_guard` (`04:16–24`) | Constraint-Trigger `after insert … for each row`, **nicht** aufschiebbar (`04:25`, kein `DEFERRABLE`) → er feuert am Ende derselben `insert`-Anweisung, also innerhalb von Block B. Code **und** Meldungsanfang **und** Kontext | jede andere Prüfregel-Verletzung (z. B. `instances_size_rule` `04:13`) → `raise` |
| `23505` | `members_player_uq` (`04:31`), `members_account_uq` (`04:48`) | **nicht gefangen**: durch Mitgliedsprüfung unter Instanzsperre bzw. `account_guard` mit Beratungssperre (`04:59`) gedeckt, eine Verletzung wäre unerwartet | → bricht den Aufrufer ab |
| alles andere | – | kein `when others` | → bricht den Aufrufer ab (N-10) |

Der Alarm `waitlist_invalid` wird **ohne** `dedupe_key` und ohne `ON CONFLICT` geschrieben. Eindeutigkeit über die Bedingung „genau eine Zeile von `waiting` auf `cancelled` geändert“; `waiting` wird nirgends wieder gesetzt (geprüft in 01–05). Scheitert das Schreiben des Alarms, wird **nicht** abgefangen → Aufrufer bricht sichtbar ab (A-4).

### 2.4 Die acht Aufrufwege (Grundlage für N-8)

| Nr | Weg | Fundstelle | Transaktion |
|---|---|---|---|
| W1 | `join` | `04:223` | Clientweg `group_join` |
| W2 | `leave` | `04:243` | Clientweg `group_leave` |
| W3 | `set_ready` → `enforce_deadlines` → `after_auto_removal` | `04:257` → `04:144` → `04:117` | Clientweg `group_ready` |
| W4 | `set_connection` (Herzschlag/Wiederverbindung) → `enforce_deadlines` → `after_auto_removal` | `04:391` → `04:144` → `04:117` | Clientweg `group_heartbeat` |
| W5 | `on_fight_end` (Trigger `fights_end`) | `04:316`, Trigger `04:327` | **innerhalb von `commit_round`** (Worker) |
| W6 | `group_tick` → `after_auto_removal` | `04:445` → `04:117` | Watchdog-Tick |
| W7 | Lösch-Trigger Stufe 1 → `leave` | `05:212` → `04:243` | Charakter- bzw. Kontolöschung |
| W8 | Lösch-Trigger Stufe 2 → `after_auto_removal` | `05:221` → `04:117` | Charakter- bzw. Kontolöschung, wenn Stufe 1 scheitert |

Nebenbefund (bleibt dokumentiert): Vor K-1 hätte ein ungültiger Wartender über W5 auch `commit_round` scheitern lassen → `report_failure` → nach `max_attempts` eine **stuck-Runde**, ausgelöst durch einen Spielstand. K-1 behebt das für alle acht Wege zentral.

### 2.5 Streng bleiben unverändert
`create_group` (`04:187`), `join` für den eigenen Spieler (`04:200 ff.`), `set_ready` (`04:260`) werfen weiter `PT422`.

### 2.6 K1-9 – paralleles Speichern: Snapshot-Modell (Stand 6)

**Sperren:** Jeder der acht Aufrufer hält die Instanzzeile `for update`, bevor das Nachrücken läuft (`04:203`, `04:232`, `04:250`, `04:387`, `03:179`, `04:434`, Lösch-Trigger über `leave` bzw. `05:214`). `save_character` sperrt nur seine Charakterzeile (`schema.sql:285`). Das Nachrücken liest Charaktere nur (`eligible`, `profile_of`, `account_of` ohne Sperre). Speichern und Nachrücken warten deshalb nie aufeinander.

**Snapshots (READ COMMITTED):** `promote_waitlist` ist VOLATILE (`04:160`) → jede Anweisung arbeitet auf einem neuen Stand. `eligible` (`05:183`, SQL STABLE) und `profile_of` (`05:176`, STABLE) lesen innerhalb ihres Aufrufs einen einheitlichen Stand.

| Zeitpunkt | Anweisung | Stand |
|---|---|---|
| S1 | `ok := rwi.eligible(w.player)` | erster Stand |
| S2 | `p := rwi.profile_of(w.player)` | neuer Stand |
| S3 | `insert into rwi.members(…, profile = p)` | `p` ist ein fester Wert; `account_guard` liest `account_of` neu (durch Speichern unveränderlich); `profile_snapshot` leitet nicht ab (2.1) |

**Maßgebliche Versionen:**
- Beim Nachrücken: Charakterstand zu **S2** (`profile.char_version`).
- Für den Kampf: Stand beim **eigenen „Bereit“** – `set_ready` leitet neu ab und friert ein (`04:260`). Nachgerückte haben `ready=false` und 60 s Frist (`04:169`); nach jedem Kampf wird „Bereit“ zurückgesetzt (`04:315`).
- Ist der Stand beim eigenen „Bereit“ ungültig: `PT422`, „Bereit“ abgewiesen, Profil bleibt; nach Fristablauf entfernt `group_tick` mit Grund `bereitschaft` (`04:133`).

| Nr | Zeitpunkt des Commits von `save_character` | Erwartung |
|---|---|---|
| K1-9a | vor S1, ungültiger Stand | `PT422` in `eligible` → Block A → `cancelled`, Grund `profile_invalid:<grund>`, 1 Alarm, kein Mitglied |
| K1-9b | zwischen S1 und S2, ungültig | `eligible` = true, `profile_of` wirft → Block A → wie K1-9a |
| K1-9c | zwischen S2 und S3, ungültig | Mitglied mit Profil zu S2 (`char_version` alt, gültig), kein Fehler, kein Alarm. **Nachweis für Mutationsprobe ②** (leitete `profile_snapshot` neu ab, würfe er bei S3) |
| K1-9d | nach dem Commit des Nachrückens, ungültig | wie K1-9c; danach eigenes `set_ready` → `PT422`, „Bereit“ abgewiesen, Profil unverändert; nach Fristablauf Entfernung `bereitschaft` |
| K1-9e | zwischen S1 und S2, **gültige** Änderung (z. B. anderer gültiger Pfad) | Mitglied mit Profil zu S2 (neue `char_version`), kein Alarm |
| K1-9f | Speichervorgang offen (nicht bestätigt) während des Nachrückens | Nachrücken wartet nicht (Laufzeit gemessen, Grenze z. B. < 1 s), verwendet den zuletzt bestätigten Stand; nach dem Commit ändert sich bis zum eigenen „Bereit“ nichts |
| K1-9g1–g4 | gleichzeitige Löschung bzw. Beitritt | siehe 2.7.5 |
| N-4 | zwischen S1 und S2, gültiger Stand < Level 5 | Eintrag bleibt `waiting`, glog |

**Erzwingen der Zeitpunkte (nur Testdatenbank):** K1-9b und K1-9e über eine Ersatzfunktion für `rwi.eligible`, die nach dem Original auf eine Beratungssperre wartet; die zweite Sitzung speichert, bestätigt und gibt die Sperre frei. K1-9c ebenso mit einer Ersatzfunktion für `rwi.account_of` (läuft in `account_guard` vor `profile_snapshot`, Trigger-Reihenfolge nach Namen). K1-9f: Sitzung B hält eine offene Transaktion mit `update public.characters`, Sitzung A rückt nach.

### 2.7 Sperrreihenfolgen: Löschung, Nachrücken, Beitritt (Stand 6)

#### 2.7.1 Abläufe
- **D′ – Charakterlöschung** (`public.delete_character`, `schema.sql:340–349`): `delete from public.characters` sperrt die Charakterzeile C exklusiv (davor Trigger `backup_character`, `schema.sql:168`, schreibt nur in `character_backups`) → `on_character_deleted` (`05:202–226`): Schleife über aktive Instanzen, in denen der Charakter aktives Mitglied oder wartend ist (`05:206–210`, aufsteigend) → je Instanz `leave` mit **Instanzsperre** (`04:232`), Stornierung bzw. Entfernung (`04:236 ff.`) → `delete from rwi.players` (`05:224`) → Audit, Sicherungen.
- **D – Kontolöschung** (`public.delete_account`, `schema.sql:221–247`): Profilzeile `for update` (`schema.sql:226`) → `delete from auth.users` (`schema.sql:247`) → Kaskade auf `profiles` (`schema.sql:16`) mit `on_profile_deleting` vor dem Löschen: **alle aktiven Instanzen des Kontos** aufsteigend gesperrt (`05:233–239`) → Kaskade auf `characters` (`schema.sql:26`): Charakterzeilen gesperrt, je Charakter `on_character_deleted` → `on_profile_deleted` leert `account` (`05:242–243`).
- **P – Nachrücken** (alle acht Wege): zuerst die eine Instanzsperre (`group_tick` mehrere, aber `skip locked`, `04:434`) → Charaktere nur lesen → beim Einfügen Beratungssperre `7002(Instanz, Konto)` (`04:59`).
- **J – Beitritt** (`group_join` → `own_character` → `rwi.join`): `own_character` liest die Charakterzeile ohne Sperre (`05:25–29`) → Instanzsperre (`04:203`) → `eligible` (`04:208`) → weitere Prüfungen → Einfügen in `members` (`04:218`) bzw. `waitlist` (`04:222`).

#### 2.7.2 Gegenüberstellung

| Ressource | D′ | D | P | J |
|---|---|---|---|---|
| Profil, `auth.users` | – | 1., 2. | – | – |
| Instanz I | 2. (nur bei Bezug zu I) | 3. (alle Instanzen des Kontos) | **1.** | **1.** |
| Charakterzeile C_W | **1.** exklusiv | 4. exklusiv | nur lesen | nur lesen |
| Beratungssperre 7002 | – | – | 2. | 2. |
| Warteliste/Mitglieder von I | nach Instanzsperre | nach Instanzsperre | nach Instanzsperre | nach Instanzsperre |

#### 2.7.3 Ergebnis
- **Kein Deadlock zwischen Löschung und Nachrücken:** P wartet nie auf eine Sperre, die D oder D′ halten; `group_tick` wartet nicht.
- **Kein aktives Mitglied ohne Charakter über das Nachrücken:** Wartet W in I, muss D/D′ die Instanzsperre von I holen, bevor die Löschung bestätigt werden kann. Solange P die Instanz I hält, sieht P den Charakter noch (Lesen wartet nicht) und nimmt W gültig auf. Danach erfasst die Lösch-Schleife W (W war beim Snapshot der Schleife wartend oder Mitglied), `leave` liest nach dem Warten den neuen Stand und entfernt W als `left/freiwillig`.
- **B-2 (bestehender Fehler, nicht durch PR 1 verursacht) – Wettlauf Beitritt ↔ Charakterlöschung:** Ist W in I weder Mitglied noch wartend, braucht D′ die Instanz I nicht und kann zwischen `eligible` (`04:208`) und dem Einfügen (`04:218`/`04:222`) von J bestätigen. Ergebnis: bei Einkampf-Instanzen ein **aktives Mitglied mit `profile` NULL und `account` NULL ohne Charakter**, bei Mehrkampf-Dungeons ein **Wartender mit `account` NULL ohne Charakter**. Folgen: Der Wartende wird später regulär mit `not_eligible` storniert; das Mitglied wird erst durch Bereitschafts- bzw. Abwesenheitsfrist entfernt; S-B stuft beide als „kein Bot“ ein (fail-closed, für Mitglieder über fehlendes `src`, für Wartende über S6-1). B-2 ist der einzige gefundene Weg zu `account` NULL ohne Manipulation.

#### 2.7.4 Kein Fix für B-2 in Stand 6
Der im Prüfbericht K1-9g genannte Ansatz „Charakterzeile im Beitrittsweg `for share` sperren, vor der Instanzsperre“ ist **verworfen**:
- J hielte dann C_W (geteilt) und wartete auf I.
- D (Kontolöschung) hält I bereits aus `on_profile_deleting` (3.) und will C_W in der Kaskade exklusiv löschen (4.).
- → Zyklus J: C_W → I, D: I → C_W → **Deadlock**. Die Aussage „kein Deadlock“ im Prüfbericht galt nur für die Charakterlöschung D′ (dort C_W vor I), nicht für die Kontolöschung.

B-2 bleibt ein offener Punkt (14.4). Ein Fix braucht eine eigene Analyse aller Sperrreihenfolgen (D, D′, J, P, `save_character`, `move_character`) und eine eigene Freigabe. Test K1-9g4 dokumentiert bis dahin den Ist-Zustand.

#### 2.7.5 Tests K1-9g (zwei Sitzungen, Wartezustände über `pg_stat_activity.wait_event_type='Lock'` und `pg_locks` geprüft, Deadlock-Wächter mit Zeitlimit)
- **K1-9g1 – Charakterlöschung, P hält I zuerst:**
  1. P: `begin; select 1 from rwi.instances where id = I for update;`
  2. D′ (als `authenticated`, Besitzer von W): `select public.delete_character(W)` → wartet nachweislich auf das Tupel von I.
  3. P: `select rwi.promote_waitlist(I); commit;`
  4. D′ läuft weiter und endet ohne Fehler.
  Erwartung: kein 40P01; W zuerst `admitted`, danach Mitglied `left/freiwillig`; Charakterzeile weg; keine `rwi.players`-Zeile; Invariante **INV-1** = 0.
- **K1-9g2 – Kontolöschung, P hält I zuerst:** wie g1, aber D ruft `public.delete_account` auf (Vorbereitung wie in `konto-integration.mjs`); D wartet nachweislich in `on_profile_deleting` auf I. Erwartung wie g1, zusätzlich `account` NULL in Mitglieds- und Wartelistenzeilen von W.
- **K1-9g3 – Löschung zuerst:** D′ hält I über den Trigger (Hook hält die Transaktion nach `leave` an); P (`join` eines Dritten in I) wartet nachweislich auf I. Nach dem Commit von D′ rückt P W **nicht** nach (Eintrag bereits storniert). INV-1 = 0.
- **K1-9g4 – Ist-Zustand B-2:**
  1. Hook ersetzt `rwi.eligible` durch eine Fassung, die nach dem Original auf eine Beratungssperre wartet.
  2. J: `group_join(I_einkampf, W)` wartet nach `eligible`.
  3. D′: `delete_character(W)` bestätigt sofort (kein Bezug zu I).
  4. Sperre freigeben, J fügt ein.
  **Art des Tests: dokumentierter, erwarteter Ist-Fehler (bekannter Fehler B-2).** Der Test weist den fehlerhaften Zustand gezielt nach. Trifft genau dieser Zustand ein, gilt der Test als **bestanden** (Ergebnis „bekannter Fehler bestätigt“), nicht als Suite-Fehler.
  Erwarteter Ist-Zustand (alle Punkte müssen zutreffen):
  - Einkampf-Instanz: genau ein aktives Mitglied W mit `profile` NULL und `account` NULL, keine Charakterzeile zu W; INV-1 = 1 (nur W);
  - `terminate_stuck` auf dieser Instanz (nach Herstellen von stuck) → `phase_locked` (S-B fail-closed);
  - Variante Mehrkampf-Dungeon: genau ein Wartender W mit `account` NULL ohne Charakter; das nächste Nachrücken storniert ihn mit `not_eligible`, ohne Alarm; danach INV-1 = 0;
  - kein Deadlock (40P01), kein anderer Fehler in J oder D′.

  **Abweichungen werden weiterhin erkannt:** Jede Abweichung vom erwarteten Ist-Zustand macht den Test **rot** – sowohl ein „besseres“ Ergebnis (z. B. J endet mit `forbidden`, INV-1 = 0, weil B-2 unbemerkt behoben oder der Hook wirkungslos wurde) als auch ein „schlechteres“ (z. B. INV-1 > 1, gesetzter `account`, Profil mit `src`, `terminate_stuck` ≠ `phase_locked`, Deadlock). Ein späterer Fix von B-2 muss den Test deshalb bewusst auf die neue Erwartung umstellen.

  **Ausweisung in der Suite:** Der Test läuft in `korrekturen-pr1.mjs` mit eigener Kennzeichnung (z. B. Präfix `BEKANNT B-2:`) und wird in der Zusammenfassung getrennt gezählt („bekannte Fehler bestätigt: 1“). Er wird **nicht** übersprungen, **nicht** abgeschaltet und zählt **nicht** als unerwarteter Fehler. Der Exit-Code der Suite ist 0, solange alle übrigen Tests grün sind und der bekannte Fehler exakt wie dokumentiert auftritt.

**INV-1:** `select count(*) from rwi.members m where m.mstate = 'active' and m.player ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and not exists (select 1 from public.characters c where c.character_id::text = lower(m.player))`.

## 3. Watchdog und Regeln 4a/4b
- 4a: Der Eventende-Abschluss in `watchdog_core` bleibt unverändert. Mit K-1 entfällt die bekannte Ursache für sein Zurückrollen (P1). Restrisiko siehe Abschnitt 1.
- 4b: Eingangsfunktionen unverändert.
- Sperrreihenfolge: unverändert.
- E2: Dauerhafte Fehler werden nur alarmiert (Wartelisten-Alarm), nichts wird automatisch beendet.

## 4. Phase 2 und `terminate_stuck` (E14)

### 4.1 S-B über `members.profile->>'src'`
Belege (aus dem Bericht zu E14):
- Kein Tabellenzugriff für Clients: `05:368–371` (Rechte entzogen), `05:385–387` (RLS ohne Richtlinie).
- Kein Profilparameter im Clientweg: `group_join(p_instance, p_character uuid)` (`05:50–52`); `rwi.join` fügt ohne Profil ein (`04:218`, `04:222`), gesetzt vom Trigger (`04:73`).
- `members.profile` wird nur an zwei Stellen geschrieben: Trigger beim Einfügen (`04:73`) und `set_ready` (`04:260`). Nach K-1 zusätzlich ausdrücklich beim Nachrücken (Wert aus `profile_of`).
- `src='derived'` nur aus `derive_profile` mit vorhandener Charakterzeile (`05:141`, `153`, `170`); `src='prototype'` nur aus `rwi.players` ohne Charakterzeile (`05:177–181`); `rwi.players` schreibt keine Funktion (nur Löschen `05:224`).
- Bleibt nach Löschung erhalten: Lösch-Trigger ändert `profile` nicht (`05:216–217`), Kontolöschung leert nur `account` (`05:242–243`), `set_ready` verlangt ein aktives Mitglied (`04:256`).
- Unempfindlich gegen B-1: UUID in Großbuchstaben ergibt ebenfalls `derived` (`05:177`).

Umsetzung über Hook-Funktionen nach dem Muster `account_of` (`04:50` → `05:115`):
- `rwi.is_bot_member(p_profile jsonb, p_player text) returns boolean`, `rwi.is_bot_waiting(p_player text, p_account uuid) returns boolean`.
- **04:** beide `true` (Prototyp-Schicht ohne Client-Wrapper, keine echten Spieler).
- **05** (`create or replace`, SECURITY DEFINER wie `account_of`, `set search_path = public, pg_temp`):
  - Mitglied ist Bot ⇔ `p_profile->>'src' = 'prototype'` **und** keine Charakterzeile zum Schlüssel (UUID-förmig, ohne Rücksicht auf Groß-/Kleinschreibung) **und** `rwi.players`-Zeile vorhanden. Fehlt Profil oder `src`, oder hat `src` einen anderen Wert → **kein** Bot (fail-closed).
  - Wartender ist Bot ⇔ `p_account is null` **und** `rwi.players`-Zeile vorhanden **und** keine Charakterzeile **und** der Schlüssel hat **kein** UUID-Format (S6-1). Begründung: Wartelisteneinträge haben kein `src`; `account` und `rwi.players` sind durch `service_role` änderbar; B-2 (2.7.3) erzeugt Wartende mit `account` NULL auch ohne Manipulation. Echte Charakterschlüssel sind immer UUIDs (`characters.character_id uuid`). Folge: Ein wartender Prototyp-Schlüssel in UUID-Form führt zu `phase_locked` (fail-closed, bewusst).
  - `is_bot_member` bleibt bei `src` (P2-9 gültig): `src` ist nach `set_ready` nicht umstellbar, weil `profile_of` die Charakterzeile bevorzugt (`05:177`) und ein gelöschtes Mitglied nicht mehr aktiv ist (`04:256`).

Zu Wartenden mit `account` NULL (Prüfbericht zu Stand 5): Über die Lösch-Trigger bleibt in einer **aktiven** Instanz kein echter Wartender mit `account` NULL zurück (Stornierung `04:236` bzw. `05:215` vor dem Leeren von `account` in `05:242–243`; scheitern beide Stufen, wird die Löschung zurückgerollt). Der einzige Weg ohne Manipulation ist B-2 (2.7.3).

**Einschränkung (E14, ausdrücklich):** Normale Clients (`anon`, `authenticated`) können `src` weder setzen noch verändern. `service_role` und `postgres` haben Schreibrechte auf alle `rwi`-Tabellen (`05:378`) und können `src` deshalb manipulieren. Das Merkmal ist eine **Vertrauensgrenze** gegenüber Clients, **keine absolute Datenbank-Sicherheitsgarantie**. Es eignet sich für Phase 1 (nur Bots), nicht als alleiniger Schutz für Phase 2.

### 4.2 Ablauf `terminate_stuck`
1. Eingaben prüfen, `check_operator` (Umfang `terminate` bleibt Pflicht).
2. Instanz und Kampf `for update`.
3. Nicht `active` → `not_active`.
4. Eventende (`clock_timestamp()` nach der Sperre) → `end_instance` + `sweep_event(…, true)` + `close_stuck(…,'event_end',…)` → `event_ended` (vor allem anderen, M-1).
5. Kein stuck-Auftrag → `not_stuck`.
6. S-B: ein Mitglied (jeder `mstate`) oder ein Wartender (`status='waiting'`) ist kein Bot → `ops_log` (kind `denied`, Notiz `phase2: technical_end gesperrt`), `phase_locked`, keine Änderung.
7. Sonst `technical_end_instance` + `close_stuck` + `ops_log terminate` → `terminated`.

Andere Abbrüche (Budget, Mindestgröße, alle ausgetreten) bleiben `aborted` und sind nicht gesperrt. Die Edge Function reicht jeden Status mit HTTP 200 durch (`supabase/functions/operator/handler.mjs:67`).

**Folge für Produktion (S6-5, Test P2-18):** Auf Produktion gibt es keine `rwi.players`-Zeilen (Regel 8.2). Damit ist dort jedes Mitglied und jeder Wartende „kein Bot“, und jedes `terminate_stuck` auf eine stuck-Instanz ergibt `phase_locked`. `technical_end` ist auf Produktion nicht erreichbar.

### 4.3 Auswege aus „stuck“ und Freeze (unverändert aus Stand 4)
- Auswege: Hotfix + `resume_stuck`; Austritt (`04:229–245`, ohne `engine_stuck`-Prüfung); Löschung; Weltboss-Eventende; `technical_end` nur für Bot-Instanzen.
- Lücke: Dungeon, nicht behebbarer Fehler, ein Mitglied kommt nie wieder → Instanz bleibt unbegrenzt bestehen (E13).
- Freeze ist keine Voraussetzung für S-B und würde ohne Mindestbedingungen die Auswege abschneiden (`04:240/254/281/419`, `05:207/234`, `04:643/674`). Paket F nur mit: Austritt und Löschung möglich, Auftauen festgelegt (E10), `resume_stuck` nach dem Auftauen, Eventende auch für `frozen` in den Eingangsfunktionen (E9, berührt 4b-Code). Bis dahin kein Freeze.

### 4.4 E13 – offene Betriebsentscheidung (unverändert aus Stand 4)

| Option | Was passiert | Folgen für Spieler | Folgen für Betrieb | Regeländerung? |
|---|---|---|---|---|
| a) D1 entscheiden, danach `technical_end` in Phase 2 | Betreiber beendet hängende Instanzen | Belohnungsfolge laut D1 | sauberer Endzustand | ja (D1, V2 Abschnitt P) |
| b) Höchstdauer H für stuck | nach H greifen Fristen wieder | Abwesende verlieren den Platz trotz technischer Ursache | Instanz endet von selbst | ja (A.6 Schritt 2, Wert H/D4) |
| c) Betreiber entfernt Abwesende einzeln | neue Betreiberfunktion | wie b, gezielt | Handarbeit, protokolliert | ja (neuer Umfang) |
| d) bewusst hinnehmen | Instanz bleibt bis zum Austritt aller | aktive Spieler nicht blockiert | offener Alarm, Instanzzeile auf unbestimmte Zeit | nein |

**Ohne Entscheidung zu E13 (und D1 bei Option a) gibt es keine Freigabe für Phase 2.**

## 5. M-1, M-2, M-4 (unverändert aus Stand 4)
- **M-1:** Eventende-Prüfung nach der Sperre in `terminate_stuck` (4.2 Schritt 4) und `report_failure` (kein Fehlversuch nach dem Eventende; Muster `03:184`).
- **M-2:** `engine_mismatch` in `commit_round` (`03:190`) zählt als Fehlversuch; ab `max_attempts` `stuck` + `engine_stuck` + `raise_stuck` nur beim Übergang; Rückgabe ohne Ausnahme; Engine-Bindung bleibt (E3).
- **M-4:** `technical_end_instance` (`technical_end/done/technical_end`, Kämpfe `technical_end`, Aufträge/Fenster/Warteliste wie `abort_instance`, keine Belohnung), nur aus `terminate_stuck` und nur für Bot-Instanzen.
- **V2-Doku (E3):** A.5 (keine automatische Wiederholung nach `stuck`), A.6 Schritt 3 (Wiederaufnahme nur durch Betreiber), A.6 Schritt 4 (`phase_locked`, Freeze als Paket F), E.1 (Engine-Bindung nach Wiederaufnahme mit Zähler). Hinweis: In `/home/user/ruinwalk-k2` liegt eine nicht committete Änderung an derselben V2-Datei; Zusammenführung nötig.

## 6. M-5 / E4 – offen (unverändert aus Stand 4)
- **E4 ist offen. Keine Freigabe für V1 oder V2.** PR 1 ändert die Profilableitung nicht.
- Der Vergleich V1/V2 (Stand 3/4, Abschnitt 6) bleibt gültig; Empfehlung V1 für den Prototyp.
- Bis zur Entscheidung wird Bericht L auf den Ist-Stand (V1) angepasst und ausdrücklich als **vorläufig** gekennzeichnet: L-Einleitung (Ableitung in SQL, nur Klasse/Pfad/Stufe/Level), L.3 (keine Aufträge; Ableitung bei Eintritt und „Bereit“), L.4 (keine Edge Function; `char_version` im Profil), L.5 (entfällt), L.6 (Ausnahme `PT422` im eigenen Pfad ohne Alarm; Hintergrund: Stornierung mit Grund + Alarm), L.7 (gilt; Neuableitung vor jedem Kampf, `04:315`), L.9 (nur Hintergrundpfade), L.1/L.10 (offen), neuer Hinweis „Ausrüstung, Level-Skalierung, Set-Boni wirken im Instanzkampf nicht (vorläufig)“.

## 7. Umsetzung in 03/04/05 (E11)

### 7.1 Änderungen je Datei

| Datei | Änderung |
|---|---|
| `03_windows.sql` | `commit_round`: `engine_mismatch` als Fehlversuch (M-2) |
| `04_gruppe.sql` | `waitlist` um Spalte `reason text` (in der Tabellendefinition `04:36–37`); `promote_waitlist` (Abschnitt 2.2); neu `technical_end_instance` (neben `abort_instance`); neu `is_bot_member`/`is_bot_waiting` (Prototyp-Fassung, neben `account_of`); `terminate_stuck` (4.2); `report_failure` (M-1). **Unverändert:** `group_tick`, `watchdog_tick`, `profile_snapshot`, `eligible`, `profile_of` |
| `05_produktion.sql` | `is_bot_member`/`is_bot_waiting` Produktionsfassung (`create or replace`, neben `account_of` `05:115`); Funktionsliste `server_fns` (`05:353`) um `technical_end_instance`, `is_bot_member`, `is_bot_waiting` |

### 7.2 Eigenschaften der neuen Funktionen

| Funktion | 04-Fassung | 05-Fassung |
|---|---|---|
| `technical_end_instance(bigint, text)` | `plpgsql`, INVOKER, VOLATILE, Namen mit Schema, kein `SET` (wie `abort_instance`) | – |
| `is_bot_member(jsonb, text)` | `sql`, STABLE, INVOKER, `true` | `sql`, STABLE, **SECURITY DEFINER**, `set search_path = public, pg_temp`, Eigentümer = installierende Rolle (`postgres`) |
| `is_bot_waiting(text, uuid)` | wie oben | wie oben |

Ersetzte Funktionen behalten ihre Eigenschaften (INVOKER, kein `SET`).

### 7.3 Rechte, RLS, Einordnung
- **Einordnung:** Die Prüfschleife `05:351–364` bricht die Installation ab, wenn eine rwi-Funktion in keiner oder mehreren Listen steht. Die drei neuen Funktionen kommen in `server_fns` (`05:353`).
- **Rechte:** Über die bestehende Schleife `05:380–382` erhält `service_role` EXECUTE auf alle Serverfunktionen. Nötig, weil `rw_ops_terminate` als INVOKER mit `service_role` läuft (`05:341`). `public`, `anon`, `authenticated` erhalten nichts (`05:371`, Standardrechte `05:372–374`).
- **RLS:** keine neue Tabelle, keine neue Richtlinie; `waitlist` bleibt mit RLS (`05:386`). Die neue Spalte übernimmt die Tabellenrechte (`service_role` S/I/U/D, `05:378`).
- **SECURITY DEFINER:** Die zwei neuen DEFINER-Funktionen folgen exakt dem Muster von `account_of` (Eigentümer `postgres`, fester `search_path`).

### 7.4 Migration, Rollback, Prüfsumme (Auslegung E11/E5)
- **Migration** (nur Dev, noch nicht installiert) = geänderte Installationsdateien; `supabase/dev/build.sh` erzeugt daraus `install_dev.sql` (Dateiliste unverändert, 01..05).
- **Rollback** = `supabase/dev/rollback_dev.sql` mit neu erzeugtem Manifest (`node server/instance/tests/rollback-manifest.mjs`; Umfang laut `rollback_dev.sql:68`: dann 70 statt 67 rwi-Funktionen, geänderter Fingerabdruck von `waitlist`).
- **Prüfsumme** = neue sha256 von `install_dev.sql`, nach dem Erzeugen in `docs/DEV_INSTALLATIONSFREIGABE.md` eingetragen (bisher `2206042d…adebf3`); nicht vorher ausgerechnet.
- **Vor einer späteren Produktionsinstallation** muss der dort vorhandene Installationsstand separat geprüft werden; dann ist eine echte Migration mit eigenem Rollback nötig.

### 7.5 Prüfungen, die angepasst werden
- `installation.mjs`: schlägt fehl, solange das Manifest nicht zum installierten Stand passt (`rollback_dev.sql:67`) → Manifest neu erzeugen; Rollback-Sperrtests (Z. 468–472) siehe Abschnitt 12.
- `rechte-audit.mjs`: muss die drei neuen Funktionen erfassen (EXECUTE nur `service_role`; DEFINER-Eigentümer und `search_path` für `is_bot_*`). Ob die Prüfung allgemein über alle Funktionen läuft oder eine feste Liste hat, wird bei der Umsetzung geprüft und ggf. ergänzt.
- `rollback_dev.sql`: ACLs und Eigentümer deckt das Manifest nicht ab (`rollback_dev.sql:70`); das bleibt bei `rechte-audit.mjs` und Test R-1.
- Testlader: keine Änderung nötig (alle 15 Lader laden 03/04/05 direkt).

## 8. Sicherheits- und Betriebsregeln (neu, E14)
1. **Vertrauensgrenze `src` (betriebliche Vorgabe, keine technische Sperre):** `members.profile->>'src'` ist gegenüber Clients verlässlich, nicht gegenüber `service_role`/`postgres`.
   - **Technisch erzwungen** (durch PostgreSQL-Rechte und RLS) ist nur: `anon` und `authenticated` können diese Spalten und Tabellen weder lesen noch schreiben (`05:368–371`, `05:385–387`; Test P2-13).
   - **Nicht technisch erzwungen**, sondern **betriebliche Vorgabe**: `members.profile` wird nur über den Trigger beim Einfügen (`04:73`), über `promote_waitlist` (ausdrücklich gesetztes Profil aus `profile_of`) und über `set_ready` (`04:260`) geschrieben. Direkte Tabellenschreibzugriffe von `service_role`/`postgres` auf `rwi.members.profile`, `rwi.members.account`, `rwi.waitlist.account` und `rwi.players` sind **untersagt**. PostgreSQL verhindert sie **nicht**: `service_role` hat Schreibrechte auf alle `rwi`-Tabellen (`05:378`) und umgeht RLS, `postgres` ist Eigentümer.
   - Einhaltung: organisatorisch (Betreiberregeln, Code-Review, keine Ad-hoc-SQL-Änderungen an diesen Spalten); Verstöße fallen nur über Audit/Prüfung auf, nicht über eine Datenbankfehlermeldung.
2. **Kein Missbrauch der Bot-Kennzeichnung:** `rwi.players` (Prototyp-Profile) wird nur in Test- und Dev-Umgebungen befüllt, nie auf Produktion. **Folge:** Auf Produktion ist `technical_end` über `terminate_stuck` nicht erreichbar (4.2, P2-18).
3. **Phase 2 bleibt gesperrt.** Voraussetzungen für eine spätere Freigabe: Entscheidung E13 (bei Option a auch D1), unabhängige Prüfung, ausdrückliche Freigabe durch Pascal. S-B ist für Phase 2 kein ausreichender alleiniger Schutz.
4. **Betreiberberechtigung:** Der Umfang `terminate` bleibt Pflicht (`check_operator`); S-B ist eine zusätzliche, datenbasierte Sperre.
5. **Restrisiko Watchdog (E12):** Ein unerwarteter Fehler stoppt den ganzen Tick einschließlich Eventende-Abschluss. Betrieb: pg_cron-Läufe mit Status `failed` bzw. Worker-Fehler müssen sichtbar überwacht werden; bei Ausfall gilt der Fehler als dringend.
6. **Produktion:** Keine Installation ohne separate Prüfung des dortigen Stands (E11).
7. **Bekannter Fehler B-2:** Zwischen Beitritt und gleichzeitiger Charakterlöschung kann ein Mitglied bzw. Wartender ohne Charakter entstehen (2.7.3). Bis zu einem freigegebenen Fix: Invariante INV-1 (2.7.5) im Betrieb überwachen; betroffene Zeilen werden durch die Fristen bzw. das Nachrücken bereinigt; S-B behandelt sie fail-closed. Ein Fix darf die Sperrreihenfolge der Kontolöschung nicht verletzen (2.7.4).

## 9. Tests

Neue Testdatei `server/instance/tests/korrekturen-pr1.mjs`, eingetragen in `server/instance/tests/run-all-db.sh` **und** `.github/workflows/instance-tests.yml` (Job `database`; `database-pg17` über `run-all-db.sh`). Test-Hooks nur über temporäre Ersatzfunktionen in der Testdatenbank.

### 9.1 Testliste Stand 6

| Nr | Fall | Erwartung |
|---|---|---|
| K1-1 | P1-Nachbau: Weltboss + Dungeon, Wartender Z ungültig, Frist von A abgelaufen | Tick gelingt; Weltboss `event_ended`; A entfernt; Z storniert `profile_invalid:path_class_mismatch`; 1 Alarm |
| K1-2 | gleicher Tick noch zweimal | kein zweiter Alarm |
| K1-3 | X tritt bei bzw. meldet „Bereit“, Z wartet ungültig | X gelingt |
| K1-4 | Konto-Konflikt beim Nachrücken (`PT409 account_in_instance`) | storniert mit Grund, kein Abbruch |
| K1-6/7 | S1 Beitritt, S2 „Bereit“ mit eigenem ungültigem Spielstand, S3 Gruppe anlegen mit ungültigem Spieler | `PT422` bzw. Abweisung, unverändert |
| K1-8 | Einfügen mit ausdrücklichem Profil bei ungültigem Charakter | gelingt, Profil = gesetztes Profil (`profile_of` nicht aufgerufen) |
| K1-9a | Speichern (ungültig) vor S1 | `cancelled` mit Grund, 1 Alarm, kein Mitglied |
| K1-9b | Speichern (ungültig) zwischen S1 und S2 (Hook `eligible`) | wie K1-9a |
| K1-9c | Speichern (ungültig) zwischen S2 und S3 (Hook `account_of`) | Mitglied mit Profil zu S2, kein Fehler, kein Alarm (Nachweis ②) |
| K1-9d | Speichern (ungültig) nach dem Commit des Nachrückens | wie K1-9c; eigenes „Bereit“ → `PT422`; nach Fristablauf Entfernung `bereitschaft` |
| **K1-9e** | gültige Änderung zwischen S1 und S2 | Mitglied mit Profil zu S2 (neue `char_version`), kein Alarm |
| **K1-9f** | offener, nicht bestätigter Speichervorgang | Nachrücken wartet nicht (Laufzeit gemessen), alter Stand |
| **K1-9g1** | Charakterlöschung, P hält I zuerst (2.7.5) | kein 40P01; W `left/freiwillig`; INV-1 = 0 |
| **K1-9g2** | Kontolöschung, P hält I zuerst | wie g1, `account` NULL |
| **K1-9g3** | Löschung hält I zuerst, P wartet | W nicht nachgerückt; INV-1 = 0 |
| **K1-9g4** | **dokumentierter, erwarteter Ist-Fehler B-2:** Beitritt ↔ Charakterlöschung (2.7.5) | bestanden, wenn genau der dokumentierte Zustand eintritt (Mitglied ohne Charakter, `profile`/`account` NULL, INV-1 = 1, `terminate_stuck` → `phase_locked`); getrennt gezählt als „bekannter Fehler bestätigt“; jede Abweichung (besser oder schlechter) → rot |
| N-1 | Wartender unter Level 5 | storniert `not_eligible`, kein Alarm |
| N-2 | „Gruppe voll“ (zwei Sitzungen) | Eintrag bleibt `waiting` |
| N-4 | gültiger Stand < Level 5 zwischen `eligible` und `profile_of` | bleibt `waiting`, glog |
| N-5 | `members_account_uq`-Verletzung (Hook umgeht `account_guard`) | Abbruch des Aufrufers |
| **N-6** | `PT409` mit anderer Meldung (Hook) | Abbruch des Aufrufers |
| **N-7** | `23514` aus anderer Prüfregel bzw. ohne `members_size_guard`-Kontext (Hook) | Abbruch des Aufrufers |
| **N-8** | ungültiger Wartender; nacheinander jeder der acht Wege W1–W8 (2.4) in einer frischen Instanz (Stufe 2 über den bestehenden Testweg in `loesch-trigger.mjs` erzwungen) | jeder Weg gelingt; Eintrag mit Grund storniert; genau 1 Alarm je Eintrag; bei W5 wird die Runde regulär committet (kein `report_failure`, kein stuck) |
| **N-9** | `group_tick` trifft einen unerwarteten Fehler in einer Instanz (Hook, z. B. `42501` aus `deadline_verdict`), gleichzeitig ein fälliges Eventende in einer anderen Instanz | ganzer `watchdog_tick` bricht ab; auch der Eventende-Abschluss ist zurückgerollt (dokumentiertes Restrisiko); nach Entfernen des Hooks erledigt der nächste Tick beides |
| **N-10** | Nachrücken trifft einen unerwarteten Fehler (Hook: `PT422` ohne `profile_invalid:`-Muster bzw. fremder Kontext) | kein Verschlucken: Aufrufer bricht ab, Eintrag bleibt `waiting`, kein Alarm |
| L1–L6 | Löschungen (Charakter, Konto, Kaskade, Stufe 2, Löschender selbst ungültig, Konto-Konflikt) | jeweils erfolgreich, Folgezustand geprüft |
| A-2 | ein Eintrag wird über drei Wege gleichzeitig nachgerückt (W6, W2, W7) | genau ein `waitlist_invalid` |
| A-4 | Schreiben des Wartelisten-Alarms scheitert (Hook entzieht INSERT) | Aufrufer bricht sichtbar ab, nichts verschluckt |
| A-5 | `authenticated` auf `rwi.ops_alerts` | verweigert |
| M1-1 | P3-Nachbau: `terminate` nach `ends_at` | `event_ended`, Alarm erledigt |
| M1-2 | zwei Sitzungen: Sperre bis nach `ends_at`, `terminate` startet davor | `event_ended` |
| M1-3 | `report_failure` nach `ends_at` | `event_ended`, Zähler unverändert |
| M2-1 | P2-Nachbau | nach `max_attempts` `stuck`, `engine_stuck=t`, 1 Alarm |
| M2-2 | danach `resume_stuck` mit richtiger Engine, Commit | gelöst, `engine_stuck=f` |
| M2-3 | richtige Engine sofort | kein Zähler |
| M2-4 | `engine_mismatch` nach `ends_at` | `event_ended` geht vor |
| M4-1 | Bot-Instanz: `terminate` | `technical_end`, keine Belohnung, Warteliste storniert |
| M4-2 | Bot-Instanz: zweiter Aufruf | `not_active` |
| P2-1 | stuck-Instanz mit echtem Charakter (`src='derived'`) | `phase_locked`, nichts geändert, `ops_log denied` |
| P2-2 | reine Prototyp-Gruppe (`rwi.players`, `src='prototype'`) | `technical_end` |
| P2-3 | echter Charakter bereits gelöscht (Mitglied `left`, `src` bleibt `derived`) | `phase_locked` |
| P2-4 | echter Wartender (`account` nicht null) | `phase_locked` |
| P2-5 | alle treten aus | `aborted`, Alarm erledigt |
| P2-6 | Löschung in stuck-Instanz | gelingt |
| P2-7 | Eventende | `event_ended` vor `phase_locked` |
| P2-8 | über die Edge Function | 200 + `phase_locked` |
| P2-9 | Prototyp-Schlüssel in UUID-Form ohne Charakter, `src='prototype'` | Bot → `technical_end` |
| P2-10 | Mitglied ohne Profil bzw. ohne `src` (direkt eingefügt) | kein Bot → `phase_locked` |
| P2-11 | Konto gelöscht (`account` genullt), Mitglied `src='derived'` | `phase_locked` |
| P2-12 | Installation nur 01–04 | `is_bot_*` = true → `technical_end` |
| **P2-13** | `authenticated` versucht, `members.profile` bzw. `rwi.players` zu schreiben (direkt und über alle `group_*`-Wrapper) | verweigert bzw. kein Weg vorhanden |
| **P2-14** | echter Wartender in einer stuck-Instanz löscht sein Konto | Eintrag `cancelled`, `account` NULL, keine `rwi.players`-Zeile; `terminate` entscheidet nur nach den übrigen Mitgliedern |
| **P2-15** | Manipulation: `postgres` legt `rwi.players`-Zeile mit der UUID eines gelöschten echten Spielers an und setzt dessen Eintrag direkt auf `waiting` mit `account` NULL | `is_bot_waiting` = false (UUID-Regel) → `phase_locked` |
| **P2-16** | Prototyp-Wartender in UUID-Form | `phase_locked` (fail-closed, bewusst) |
| **P2-17** | Prototyp-Wartender ohne UUID-Form (Gegenprobe) | Bot → `technical_end` |
| **P2-18** | Installation ohne `rwi.players`-Zeilen (wie Produktion), stuck-Instanz mit echten Spielern bzw. mit Prototyp-Schlüsseln ohne `rwi.players`-Zeile | immer `phase_locked` |
| R-1 | Rechte | `technical_end_instance`, `is_bot_*`: EXECUTE nur `service_role`; `is_bot_*` (05) DEFINER mit Eigentümer `postgres` und `search_path`; ACL der ersetzten Funktionen unverändert |
| R-2 | Einordnung | Installation bricht ab, wenn eine der drei neuen Funktionen in `05:353` fehlt (Probe) |
| R-3 | `rollback_dev.sql` mit neuem Manifest nach Installation | läuft vollständig; ohne neues Manifest bricht er ab |
| R-4 | `install_dev.sql` | sha256 neu, in Doku eingetragen, zwei Builds gleich |

### 9.2 Anpassung bestehender Tests
- `stuck.mjs:104`, `operatoren.mjs:70`, `operator-edge.mjs:94`, `hotfix-resume.mjs`: arbeiten mit echten Charakteren (`prod-env.mjs:35`, `44`) → `terminate` erwartet künftig `phase_locked`; für `technical_end` zusätzlich eine Prototyp-Gruppe (`rwi.players`-Zeilen wie `installation.mjs:142`).
- `installation.mjs`: Manifest, sha256, Wackelstelle (Abschnitt 12).
- `rechte-audit.mjs`: drei neue Funktionen.
- Gesamtlauf `run-all-db.sh` auf PG16 lokal, PG17 über CI.

### 9.3 Entfernte Tests (gegenüber Stand 4) mit Begründung

| Test | Inhalt | Grund |
|---|---|---|
| G-1 | Isolation einer Instanz, zweite läuft weiter | keine Isolation mehr (E12) |
| G-2 | Sperrprobe Teiltransaktion | keine Teiltransaktion mehr |
| G-3 | Teilergebnisse in S zurückgerollt | keine Teiltransaktion mehr |
| G-4 | Abbruch-Code rollt auch 4a zurück | inhaltlich in **N-9** aufgegangen |
| G-5 | Alarm-Episoden `group_tick_failed` | Alarm entfällt |
| G-7 | Eventende bleibt bei Fehler in anderer Instanz erhalten | gilt ohne Isolation nicht mehr; Gegenteil ist jetzt N-9 |
| I-1…I-3, I-5…I-10 | Isolationsliste und Abbruchklassen im Tick | Isolationsliste entfällt; Abbruch bei Unerwartetem durch N-9 (Tick) und N-5/N-6/N-7/N-10 (Nachrücken) abgedeckt |
| A-1 | ein offener `group_tick_failed` je Instanz bei parallelen Ticks | Alarm entfällt |
| A-3 | Handlöschung eines `group_tick_failed` | Alarm entfällt |

### 9.4 Neue Tests
- Gegenüber Stand 4 (in Stand 5): N-6, N-7, N-8, N-9, N-10, P2-13, R-2 (neu gefasst: Einordnung in 05), R-3 (neu gefasst: Manifest), R-4 (Prüfsumme).
- Gegenüber Stand 5 (in Stand 6): K1-9d (Abspaltung aus dem bisherigen K1-9c), K1-9e, K1-9f, K1-9g1, K1-9g2, K1-9g3, K1-9g4, P2-14, P2-15, P2-16, P2-17, P2-18. K1-9a–K1-9c präzisiert (Zeitpunkte S1/S2/S3, Hooks).
- Nummernlücken sind gewollt: K1-5 ist N-1 (seit Stand 3), N-3 entfiel in Stand 4 (ersetzt durch N-5).

## 10. Last- und Stabilitätstest (E6 neu)
- **Vor der Betriebsfreigabe, nicht in PR 1.**
- Aufbau: 100 und 200 gleichzeitige Instanzen (Dungeon und Weltboss gemischt), realistische Abläufe (Beitritt, Warteliste, Bereitschaft, Kämpfe über den Worker, Abwesenheit, Löschungen), Watchdog-Takt wie geplant.
- Messen: Dauer je `watchdog_tick`, Latenz der Client- und Worker-Aufrufe, Sperrwartezeiten, Deadlocks, Fehlerquote, Speicher/Verbindungen; PG16 und PG17.
- Abbruchkriterien und Zielwerte vor dem Test festlegen (Entscheidung).
- **Kein** gesonderter Test auf > 64 Teiltransaktionen.

## 11. Mutationsproben

### 11.1 Liste Stand 6

| Nr | Mutation | Muss rot werden |
|---|---|---|
| ① | Nachrücken reicht `PT422` weiter | K1-1, K1-3, L1–L3, N-8 |
| ② | Profil beim Einfügen nicht gesetzt | K1-9c (Trigger leitet bei S3 erneut ab und wirft), K1-8 |
| ③ | Grund wird nicht gespeichert | K1-1, K1-4 |
| ④ | `PT409` nicht abgefangen | K1-4, L6 |
| ⑤ | `join` nachsichtig | S1 |
| ⑫ | `ends_at`-Prüfung in `terminate` entfernt | M1-1 |
| ⑬ | `now()` statt `clock_timestamp()` | M1-2 |
| ⑭ | Zähler bei `engine_mismatch` entfernt | M2-1 |
| ⑮ | `raise_stuck` ohne Übergangsprüfung | M2-1 |
| ⑯ | `abort_instance` statt `technical_end_instance` | M4-1 |
| ⑱' | fehlendes/unbekanntes Kennzeichen = Bot | P2-10 |
| ⑲' | S-B vor Eventende | P2-7 |
| ㉒ | „Gruppe voll“ storniert | N-2 |
| ㉓ | `eligible` durch eigene Regel ersetzt | N-1 (Vergleich mit dem Original über alle Profiltestfälle) |
| ㉔ | 23505 im Nachrücken gefangen | N-5 |
| ㉕ | Alarm ohne Bedingung „genau 1 Zeile geändert“ | A-2 |
| ㉖ | S-B-Prüfung in `terminate_stuck` entfernt | P2-1 |
| ㉗ | S-B nur über UUID-Format statt `src` | P2-9, P2-10 |
| ㉘ | `technical_end_instance` fehlt in `server_fns` | R-2 bzw. P2-2 über den Wrapper |
| ㉙ | Manifest nicht neu erzeugt | R-3 |
| ㉚ | S-B prüft nur aktive Mitglieder | P2-3 |
| ㉛ | S-B nutzt `account` statt `src` für Mitglieder | P2-11 |
| **㉜** | `PT409` ohne Meldungsprüfung gefangen | N-6 |
| **㉝** | `23514` ohne Kontextprüfung gefangen | N-7 |
| **㉞** | `when others` im Nachrücken | N-10 |
| **㉟** | Alarm-Schreiben im Nachrücken mit eigenem Fang | A-4 |
| **㊱** | Fehlerfang in `on_fight_end`/`commit_round` statt im Nachrücken (W5 einzeln abgesichert, andere Wege nicht) | N-8 (andere Wege rot) |
| **㊲** | Isolation in `group_tick` doch eingebaut (`when others`) | N-9 (Tick läuft weiter statt abzubrechen) |
| **㊳** | `is_bot_*` (05) ohne `search_path` bzw. INVOKER | R-1 |
| **㊴** | UUID-Regel in `is_bot_waiting` entfernt | P2-15, P2-16 |
| **㊵** | Lösch-Schleife erfasst nur aktive Mitglieder, nicht Wartende (`05:206–210`, Bedingung zu `waitlist` entfernt) | K1-9g1, K1-9g3 (INV-1 bzw. Eintrag bleibt `waiting`) |
| **㊶** | Hook in K1-9g4 wirkungslos (wartet nicht) bzw. B-2 unbemerkt verändert | K1-9g4 (Ist-Zustand tritt nicht ein → rot; Nachweis, dass auch eine „bessere“ Abweichung erkannt wird) |

### 11.2 Entfernte Mutationsproben

| Nr | Inhalt | Grund |
|---|---|---|
| ⑥ | BEGIN/EXCEPTION in `group_tick` entfernt | keine Isolation (E12) |
| ⑦ | Sperre in Teiltransaktion verschoben | keine Teiltransaktion |
| ⑧ | Abbruch-Klasse wird isoliert | ersetzt durch ㊲ |
| ⑨ | Fehler ohne Alarm (`group_tick_failed`) | Alarm entfällt |
| ⑩ | fester Alarmschlüssel ohne Episode | Alarm entfällt |
| ⑪ | Alarm-Schreiben in `group_tick` verschluckt | Alarm entfällt; Gegenstück im Nachrücken ist ㉟ |
| ⑳ | `when others` isoliert ohne Listenprüfung | ersetzt durch ㉞ (Nachrücken) und ㊲ (Tick) |
| ㉑ | Kontextprüfung bei I1–I3 entfernt | ersetzt durch ㉜/㉝ |

## 12. Wackelstelle `installation.mjs` (unverändert aus Stand 4)
Z. 399–403 und 468–472 (gemessen 7412–7953 ms gegen 8000 ms): Sperrhalter über `pg_locks` synchronisieren statt fester 1200 ms; Haltezeit 60 s, danach `pg_terminate_backend`; reine Wartezeit ab `wait_event_type='Lock'` messen (4,5–7 s); zusätzlich 55P03 prüfen und dass die Sperre zum Abbruchzeitpunkt noch gehalten ist; Gesamtzeit grob ≤ 15 s. Gleiches Muster für Z. 253/259.

## 13. Prüfung Stand 6 gegen Stand 4/5 und frühere Befunde

| Befund / Punkt | Herkunft | Stand 6 |
|---|---|---|
| K-1 Hintergrundpfade blockiert (P1, P1b) | Prüfung rw-instanzkampf | behoben über Nachrücken (Abschnitt 2), alle acht Wege (N-8) |
| P1: Eventende zurückgerollt | Probe P1 | Ursache beseitigt; Restrisiko für künftige Fehler dokumentiert (Abschnitt 1, N-9) |
| M-1 Eventende bei `terminate_stuck`/`report_failure` | rw-instanzkampf, P3 | Abschnitt 5, M1-1…M1-3 |
| M-2 `engine_mismatch`-Stillstand | rw-instanzkampf, P2 | Abschnitt 5, M2-1…M2-4 |
| M-3 stuck vs. V2 | rw-instanzkampf | V2-Doku nachziehen (E3), keine Verhaltensänderung |
| M-4 `technical_end` | rw-instanzkampf | Abschnitt 5, M4-1/M4-2, nur Bot-Instanzen |
| M-5 Profil vs. Bericht L | rw-instanzkampf | E4 offen, L vorläufig (Abschnitt 6) |
| 23505 zu weit gefangen | Stand 4 Ä1 | bleibt nicht gefangen (N-5, ㉔) |
| S-B nur UUID-Format | Auftrag Stand 4 | `src`-basiert, Belege 4.1, Einschränkung E14 |
| B-1 Großbuchstaben-Schlüssel | Stand 4 | offen, nicht Teil von PR 1; S-B unempfindlich |
| Wackelstelle `installation.mjs` | rw-backend-security G6, rw-instanzkampf G-4 | Abschnitt 12 |
| `jprev := null` toter Code | rw-instanzkampf G-3 | nicht Teil der freigegebenen Korrekturen, unverändert offen (Aufräumpunkt) |
| Lösch-Trigger als Mehrfachhalter | rw-instanzkampf G-1 | nicht Teil von PR 1, unverändert |
| Doku-Widersprüche | rw-instanzkampf G-2, rw-qa G6 | V2/L/`STUCK_ABLAUF`/`OPERATOREN`/`LOESCHVORGANG` beim Umsetzen nachziehen |
| Testliste doppelt gepflegt | rw-qa G3 | neue Datei in `run-all-db.sh` **und** `instance-tests.yml` |
| Konsistenz Stand 4 → 5 | – | alle Verweise auf `group_tick_failed`, I1–I3, `failed`/`group_failed`, Datei 06, „> 64 Teiltransaktionen“ nur noch in den Abschnitten 0.2, 9.3, 11.2 (Entfernungslisten) |
| V-1: echter Wartender mit `account` NULL ungetestet | Prüfbericht zu Stand 5 | P2-14 bis P2-17, UUID-Härtung (S6-1) |
| V-2: „auf Produktion nie `technical_end`“ nur implizit | Prüfbericht zu Stand 5 | 4.2, Regel 8.2, P2-18 |
| V-3: K1-9 zu grob, Folgen bei Fristablauf fehlten | Prüfbericht zu Stand 5 | 2.6 Snapshot-Modell, K1-9a–K1-9f |
| V-4: `is_bot_waiting` ohne UUID-Ausschluss | Prüfbericht zu Stand 5 | S6-1, ㊴ |
| V-5: Regel 8.1 missverständlich | Prüfbericht zu Stand 5 | Regel 8.1 präzisiert |
| Sperrreihenfolgen Löschung/Nachrücken | Prüfbericht K1-9g | 2.7, K1-9g1–K1-9g3, ㊵ |
| B-2: Beitritt ↔ Charakterlöschung | Prüfbericht K1-9g | offen, dokumentiert (2.7.3, Regel 8.7, K1-9g4); kein Fix |
| `FOR SHARE`-Vorschlag für B-2 | Prüfbericht K1-9g, Hinweis Pascal | verworfen (Deadlock mit Kontolöschung, 2.7.4) |
| Regel 8.1 als technische Sperre missverständlich | Korrekturauftrag Pascal 21.11.2026 | als betriebliche Vorgabe gekennzeichnet (S6-9) |
| K1-9g4 könnte als Suite-Fehler gelten | Korrekturauftrag Pascal 21.11.2026 | erwarteter Ist-Fehler mit exakter Erwartung, getrennt gezählt, Abweichungen rot, ㊶ (S6-10) |
| Konsistenz Stand 5 → 6 | – | Testnummern K1-9a–K1-9g4, P2-1–P2-18, N-1–N-10 (ohne N-3), Mutationen ①–㊶ geprüft; keine doppelten Nummern; alle neuen Tests in 9.1, 9.4 und 14.3 genannt; Versionsbezeichnungen in Kopf, 2.2, 9.1, 11.1, 13 auf Stand 6 bzw. als Historie korrekt |

## 14. Zusammenfassung

### 14.1 Übernommene Entscheidungen
Freigabe K-1/M-1/M-2/M-4; K-1-Vorgabe (Hintergrund nachsichtig, eigene Pfade streng); E1; E2; E3; E5 (in der Auslegung von E11); E6 neu; E11 (03/04/05, keine Datei 06); E12 (keine Isolation, Restrisiko 4a); E14 (S-B allein, Vertrauensgrenze); keine `betriebsphase`; `eligible` unverändert; enge Fänge; 23505 nicht gefangen; Phase 2 gesperrt. Stand 6 (Auftrag Pascal 21.11.2026): UUID-Härtung `is_bot_waiting` (S6-1); K1-9-Snapshot-Modell; Sperrreihenfolgen; B-2 als offener, bestehender Fehler ohne festgelegten Fix; `FOR SHARE`-Ansatz verworfen.

### 14.2 Entfernte Tests
G-1, G-2, G-3, G-4 (→ N-9), G-5, G-7, I-1, I-2, I-3, I-5, I-6, I-7, I-8, I-9, I-10, A-1, A-3. Mutationsproben ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ ⑳ ㉑.

### 14.3 Neu hinzugefügte Tests
- In Stand 5: N-6, N-7, N-8, N-9, N-10, P2-13, R-2 (neu gefasst), R-3 (neu gefasst), R-4. Mutationsproben ㉜ ㉝ ㉞ ㉟ ㊱ ㊲ ㊳; ㉘ und ㉙ neu gefasst.
- In Stand 6: K1-9d, K1-9e, K1-9f, K1-9g1, K1-9g2, K1-9g3, K1-9g4, P2-14, P2-15, P2-16, P2-17, P2-18; K1-9a–K1-9c präzisiert. Mutationsproben ㊴ ㊵ ㊶; ② präzisiert (Nachweis über K1-9c). Invariante INV-1. K1-9g4 ist ein dokumentierter, erwarteter Ist-Fehler (getrennt gezählt).

### 14.4 Verbleibende offene Punkte
- **E4:** Profilableitung V1 oder V2 (Bericht L bis dahin vorläufig).
- **E13:** Umgang mit dauerhaft hängenden Dungeons in Phase 2 (a–d).
- **D1:** Belohnungsfolge von `technical_end` (Voraussetzung für E13 a).
- **E8/E9/E10:** Paket F (Freeze), Eventende für `frozen` in den Eingangsfunktionen (4b-Code), Auftauen.
- **B-1:** Normalisierung von Schlüsseln in `create_group`.
- **B-2 (bestehender Fehler):** Wettlauf Beitritt ↔ Charakterlöschung erzeugt Mitglied bzw. Wartenden ohne Charakter (2.7.3). Kein Fix festgelegt; `FOR SHARE` vor der Instanzsperre verworfen (2.7.4). Ein Fix braucht eine eigene Analyse aller Sperrreihenfolgen und eine eigene Freigabe. Bis dahin: K1-9g4 dokumentiert den Ist-Zustand, INV-1 wird überwacht (Regel 8.7).
- Zielwerte und Abbruchkriterien für den Last- und Stabilitätstest (E6).
- Aufräumpunkte ohne Verhaltensänderung: `jprev := null` (G-3), Lösch-Trigger als Mehrfachhalter (G-1).

### 14.5 Voraussetzungen für die spätere Umsetzung
1. Ausdrückliche Freigabe von Stand 6 durch Pascal.
2. Arbeit ausschließlich in `/home/user/ruinwalk-pr1` auf `integration/nacht-nach-main`; `docs/quests/` und `server/instance/tests/a-k1.mjs` unangetastet.
3. Reihenfolge: SQL (03/04/05) → neue und angepasste Tests → Manifest neu erzeugen → `install_dev.sql` bauen, sha256 eintragen → Doku (V2, L vorläufig, `STUCK_ABLAUF`, `OPERATOREN`, `LOESCHVORGANG`, `DEV_INSTALLATIONSFREIGABE`).
4. Alle Datenbanktests grün auf PG16 lokal; Mutationsproben laut 11.1 rot; danach unabhängige Prüfung durch `rw-qa`, `rw-instanzkampf`, `rw-backend-security` (Abgleichpflicht).
5. Commit, Push und PR nur nach gesonderter Freigabe.

### 14.6 Voraussetzungen für die Dev-Installation
1. Umsetzung abgeschlossen und geprüft (14.5).
2. CI grün (PG16 und PG17), insbesondere `installation.mjs` mit neuem Manifest.
3. Neue sha256 von `install_dev.sql` dokumentiert und zweimal reproduzierbar.
4. Gesonderte, ausdrückliche Freigabe der Installation auf `ruinwalk-dev` (nie Produktion), mit den bisherigen Grenzen (kein Cron, keine Secrets, `rwprobe` unverändert).
5. „Automatic branching“ der Supabase-GitHub-Integration bestätigt aus.

### 14.7 Punkte, die weiterhin eine ausdrückliche Freigabe brauchen
- Stand 6 als Umsetzungsgrundlage.
- Beginn der Umsetzung.
- Änderungen an bestehenden Tests (`stuck.mjs`, `operatoren.mjs`, `operator-edge.mjs`, `hotfix-resume.mjs`, `installation.mjs`, `rechte-audit.mjs`).
- Commit, Push und PR von PR 1.
- Dev-Installation.
- Jede Freigabe von Phase 2 (setzt mindestens E13, ggf. D1, voraus).
- E4, E8–E10, B-1 jeweils einzeln.
- B-2: jeder Fix (eigene Sperranalyse; `FOR SHARE` vor der Instanzsperre ist ausgeschlossen).
- Zielwerte des Last- und Stabilitätstests.
- Eine spätere Trennung von `watchdog_core` und `group_tick` (Architekturänderung), falls das Restrisiko aus E12 nicht mehr getragen werden soll.

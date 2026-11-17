# Instanzkampf – Produktionssicherheit Phase 1: Spieleridentität und Datenbankzugriffe

Stand: Commit nach 0e4aff5. Umsetzung: `server/instance/sql/05_produktion.sql`, Tests: `server/instance/tests/produktion.mjs`.
Gilt für das Schema `rwi` (Instanzkampf-Prototyp). Keine Änderung an `index.html`, GPS, Solokämpfen, Echtzeitmechanik oder Charakterdaten der Produktion.

**Wichtig – was dieses Dokument NICHT behauptet:** Alles hier Beschriebene ist *lokal* getestet (temporäres PostgreSQL 16 mit Supabase-Attrappe). Es ist **nicht** auf einer echten Supabase-Dev-Instanz geprüft (siehe Abschnitt 6).

## 1. Identitätsmodell (aus dem vorhandenen Schema abgeleitet, nichts erfunden)

Vorhanden in `supabase/schema.sql`: `public.characters(character_id uuid, account_id uuid → profiles → auth.users, slot_number 1..3)`, `public.account_entitlements`, `auth.uid()`. Die RLS-Richtlinie `char_own_read` macht Platz 3 nur mit aktiver Berechtigung (`third_character_slot`) nutzbar.

- **Spielerschlüssel im Schema `rwi`** (`members.player`, `members.key`, `waitlist.player`, `players.player`) = `public.characters.character_id::text`. Die Konto-ID (`auth.uid()`) ist nie ein Spielerschlüssel.
- **Identität eines Aufrufs** = `auth.uid()` der Sitzung. Ohne Sitzung: Fehler `not_authenticated` (SQLSTATE `PT401`).
- **Welcher meiner Charaktere?** Zwei Wege, beide serverseitig geprüft (`rwi.own_character`):
  1. Charakterparameter `p_character`: wird nur akzeptiert, wenn `characters.account_id = auth.uid()` und der Charakter nicht gesperrt ist (Platz 3 nur mit aktiver Berechtigung). Sonst `forbidden` (`PT403`) – gleiche Antwort für „fremd“, „gibt es nicht“ und „gesperrt“. Der Parameter wählt nur *einen eigenen* Charakter aus; er kann keine fremde Identität einführen.
  2. Ohne Parameter (außer bei `group_join`): der eigene Charakter wird aus der Mitgliedschaft/Warteliste der Instanz abgeleitet (zuerst aktive Teilnahmen). Kein Treffer: `forbidden`. Mehr als ein eigener Charakter in der Instanz: `ambiguous_character` (`PT409`) – es wird nie geraten.

## 2. Vollständige Funktionsliste

Alle 46 Funktionen im Schema `rwi` sind im Rechteskript ausdrücklich in genau eine Klasse eingeordnet (`server`, `test`, `trigger`, `intern`). Eine neue, nicht eingeordnete Funktion lässt das Skript scheitern (Wächter, im Test belegt).

### 2.1 Neue Client-Schnittstelle (Schema `public`, SECURITY DEFINER, fester `search_path`, EXECUTE nur `authenticated`)

| Neue Funktion | Frühere Funktion (Parameter vorher) | Identitätsprüfung | Zugriff |
|---|---|---|---|
| `group_join(p_instance, p_character)` | `rwi.join(p_instance, p_player text)` | `p_character` muss dem Konto gehören, nicht gesperrt | authenticated ja · anon nein · service_role nein |
| `group_leave(p_instance, p_character = null)` | `rwi.leave(p_instance, p_player text)` | Eigentum bzw. Ableitung aus der Mitgliedschaft | wie oben |
| `group_ready(p_instance, p_character = null)` | `rwi.set_ready(p_instance, p_player text)` | wie oben | wie oben |
| `group_heartbeat(p_instance, p_character = null)` (auch Wiederverbindung) | `rwi.heartbeat(p_instance)` (Spieler aus `request.jwt.claim.sub`) | wie oben; Serverzeit, nie Clientzeit | wie oben |
| `group_view(p_instance, p_known_version = null, p_character = null)` | `rwi.instance_view(p_instance, p_player text, p_known_version)` | wie oben; Nicht-Mitglieder: `forbidden` | wie oben |
| `group_action(p_fight, p_round, p_action, p_character = null)` | `rwi.submit_action_for(p_player text, p_fight, p_round, p_action)` und `rwi.submit_action(p_fight, p_key text, …)` | Instanz aus dem Kampf, Eigentum bzw. Ableitung; der Kampfschlüssel wird serverseitig aus der Mitgliedschaft bestimmt | wie oben |
| `group_revive_use(p_fight, p_character = null)` | `rwi.use_revive_item(p_fight, p_key text)` | wie oben, Schlüssel aus eigener aktiver Mitgliedschaft | wie oben |
| `group_revive_decline(p_fight, p_character = null)` | `rwi.decline_revive_item(p_fight, p_key text)` | wie oben | wie oben |

### 2.2 Interne Serverfunktionen (Schema `rwi`; nur `service_role`; anon/authenticated nie)

`create_group` (nimmt eine Spielerliste – deshalb **nicht** für Clients; Gruppen entstehen serverseitig), `start_fight`, `claim_resolution`, `commit_round`, `group_tick`, `watchdog_tick`, `watchdog_core`, `sweep_events`, `sweep_event`, `sweep_core`, `end_instance`, `set_connection` (Verbindungsabbruch durch den Server, nimmt Schlüssel), `set_connection_core`, `advance_clock`, `effective_last_seen`, `permanently_disconnected`, `sync_windows`, `wipe_hold`, `eligible`, `glog`, `active_count`, `abort_instance`, `drop_member`, `after_auto_removal`, `deadline_verdict`, `enforce_deadlines`, `enforce_deadlines_quiet`, `promote_waitlist`, `roster`, `contribution`, `cfg`.

### 2.3 Nur Test/Migration (Spielerparameter; für **keine** Clientrolle und auch nicht für `service_role` ausführbar)

`join`, `leave`, `set_ready`, `submit_action`, `submit_action_for`, `instance_view`, `heartbeat` (Testidentität aus `request.jwt.claim.sub`), `heartbeat_for`, `use_revive_item`, `decline_revive_item`, `current_player`. Ausführbar nur für den Tabelleneigentümer (Migrationsrolle) – die bestehenden Prototyp-Tests laufen unverändert darüber.

### 2.4 Trigger- und Hilfsfunktionen

`members_size_guard`, `on_fight_end`, `reward_filter` (Trigger; EXECUTE nicht nötig, sie feuern auch ohne). `own_character` (SECURITY DEFINER, nur von den Wrappern aufgerufen, für niemanden ausführbar).

### 2.5 Nicht vorhanden

- **Belohnungen abrufen/einlösen:** Es gibt (noch) keine solche Funktion. Die Tabellen `rwi.rewards`/`rwi.entitlements` sind für Clients unerreichbar (kein Schema-/Tabellenrecht, RLS ohne Richtlinie). Vor Einführung einer Einlösefunktion gilt dasselbe Muster (Identität aus `auth.uid()`, Charakter-Eigentum, idempotente `reward_id`). Das ist bewusst **nicht** vorgezogen (Phase 2).
- **Gruppe als Spieler anlegen (Lobby/Matchmaking):** nicht vorhanden, Phase 2.

## 3. Rechte der drei Rollen (Systemkatalog, im Test ausgelesen)

| | anon | authenticated | service_role |
|---|---|---|---|
| Schema `rwi` USAGE | nein | nein | ja |
| Tabellen `rwi.*` | kein Recht | kein Recht | SELECT/INSERT/UPDATE/DELETE |
| RLS auf `rwi.*` | aktiv, keine Richtlinie | aktiv, keine Richtlinie | umgeht RLS |
| `rwi`-Serverfunktionen (31) | nein | nein | ja |
| `rwi`-Testfunktionen (11) und `own_character` | nein | nein | nein |
| Wrapper `public.group_*` (8) | nein | ja | nein |
| PUBLIC (Standard-EXECUTE) auf `rwi`-Funktionen | entzogen | – | – |

Technik: `REVOKE ALL` auf Schema/Tabellen/Sequenzen/Funktionen von PUBLIC, anon, authenticated (und für Funktionen von service_role), danach ausdrücklich nur die nötigen `GRANT`s. Die ursprünglichen unsicheren Funktionen bleiben nicht „nebenher“ erreichbar: Sie sind selbst entzogen (nicht nur durch Wrapper überdeckt).

## 4. Tests mit echten Datenbankrollen (`produktion.mjs`)

Jeder Aufruf läuft mit `SET ROLE anon | authenticated | service_role` (wie PostgREST) und gesetzter Sitzungsidentität (`request.jwt.claim.sub`), nicht als Superuser. Zwei Läufe: Modus „neu“ (keine Standardrechte) und Modus „legacy“ (Supabase-Altmodus mit Standardrechten für alle API-Rollen, **auch im Schema rwi** – der ungünstigste Fall).

Geprüft (je Modus): Inventar und Rechte-Matrix aus `pg_proc`/`aclexplode`; kein PUBLIC-Recht; Schema-/Tabellenrechte; RLS; Wrapper-Eigenschaften (SECURITY DEFINER, `search_path`); anon kann nichts; authenticated ohne Sitzungsidentität kann nichts; A kann nicht als B handeln (Beitritt, Austritt, Bereitschaft, Herzschlag, Ansicht, Aktion, Revive-Item); A kann B's Gruppe nicht ändern (Zustand vorher/nachher per Prüfsumme gleich); fremder, unbekannter, gesperrter und manipulierter Charakter-ID wird abgewiesen (inkl. SQL-Zeichen); Tabellen nach Einschleusungsversuchen unversehrt; Mehrdeutigkeit; Testfunktionen für alle drei Rollen nicht ausführbar; direkte Tabellenzugriffe (SELECT/INSERT/UPDATE/DELETE) abgewiesen; berechtigte Serverfunktionen (`group_tick`, `watchdog_tick`, `sweep_events`, `set_connection`, `claim_resolution`, `commit_round`, `create_group` inkl. Weltboss) funktionieren als `service_role`; Rechteskript wiederholbar.

Mutationsprüfung der Sicherheitsschicht: 21 Mutationen an `05_produktion.sql` (Eigentumsprüfung entfernt, Platz-3-Sperre, Mehrdeutigkeit, fehlende Anmeldung, je Wrapper ohne Prüfung, falscher Revive-Schlüssel, Wrapper für anon, nicht entzogene Funktions-/Schema-/Tabellenrechte, RLS aus, Testfunktion für service_role, Wächter entfernt, fester search_path entfernt …): alle gefangen. Drei überlebten zunächst (Revive-Schlüssel, Schemarecht) und führten zu verstärkten Tests; zwei werden durch Abbruch statt durch eine gezielte Prüfung gefangen (P15 Klassifizierung, P19 Ableitung).

## 5. Event-Ende-Audit (Ergebnis, ohne Regel- oder Codeänderung)

Geprüft am tatsächlichen Ablauf von `rwi.commit_round` (`03_windows.sql`) und den Eingangsfunktionen. Messskript: `server/instance/sim/eventende-audit.mjs` (Postgres 16 mit `track_commit_timestamp=on`).

1. **Wann wird `completed_at` gesetzt?** In `commit_round` direkt nach dem Sperren von Instanz und Kampf: `t := clock_timestamp()`; derselbe Wert `t` wird als `completed_at` in `round_results` geschrieben.
2. **Wann wird das Eventende geprüft?** Mit demselben `t` (`t >= ends_at` → `event_ended`, kein Ergebnis), unmittelbar danach. Prüfung und Zeitstempel sind identisch und liegen unter der Instanzsperre.
3. **Wann ist das Ergebnis für andere Transaktionen sichtbar?** Erst beim COMMIT der aufrufenden Transaktion (READ COMMITTED), also nach `t`.
4. **Kann eine Transaktion prüfen, weiterarbeiten und erst nach dem Eventende committen?** **Ja.** Ruft ein Aufrufer `commit_round` innerhalb einer längeren Transaktion auf (explizites `BEGIN … COMMIT`) oder wird der Prozess zwischen Rückkehr der Funktion und COMMIT angehalten, bleibt die Sperre bestehen und der Commit kann beliebig spät folgen.
5. **Entsteht dann ein Ergebnis, das nach unserer Regel nicht mehr zählen dürfte?** **Ja, in genau diesem Fall.** Messung (synthetischer Sieg, Transaktion 3 s über das Eventende offen gehalten): `completed_at` lag 13,8 s vor `ends_at`, der Commit 3,0 s danach; Belohnungen (6) wurden angelegt, Status `completed`. Andere Sitzungen sahen in der Zwischenzeit die Instanz als `event_ended` (`instance_view`; Tabelle noch `active`), später als `completed` – eine sichtbare Rückwärtsbewegung. `sweep_events` wartete korrekt auf die Sperre und fand danach nichts mehr zu beenden (kein Doppelzustand).

**Realistischer Rahmen:** `commit_round` ist `service_role`-only. Über PostgREST/RPC ist jeder Aufruf eine eigene Transaktion; dann ist das Fenster nur die Dauer bis zum Commit. Gemessen lokal (1500 Messungen ruhig, 3000 unter Schreiblast): Abstand `clock_timestamp()` → Commit p50 0,007–0,008 ms, p99 0,04–0,09 ms, max 0,19–0,27 ms. Auf einer gehosteten Datenbank (WAL-Flush, ggf. synchrone Replikation) ist das **nicht gemessen** und kann deutlich größer sein. Eine garantierte Obergrenze gibt PostgreSQL nicht.

**Konflikt:** Die Regel „Sieg zählt nur, wenn das Ergebnis serverseitig vor dem Ende abgeschlossen wurde“ lässt zwei Lesarten zu: (a) *abgeschlossen = die Serverprüfung unter der Sperre* (heute umgesetzt), (b) *abgeschlossen = für andere sichtbar/committet*. PostgreSQL kann (b) innerhalb einer Transaktion nicht garantieren, denn der Commit-Zeitpunkt entsteht erst nach der letzten Anweisung.

**Vorschläge (nicht umgesetzt, Entscheidung ausstehend):**
- **S1 – Lesart (a) festschreiben, Aufrufbedingung erzwingen:** Zählzeitpunkt = `completed_at` (Prüfung unter der Sperre). Festlegen, dass `commit_round` nur als Einzel-Anweisung (Autocommit/RPC) aufgerufen wird; die Restunschärfe = Commit-Latenz wird dokumentiert und überwacht (Messung per `track_commit_timestamp`, falls auf Supabase verfügbar). Keine Verhaltensänderung.
- **S2 – Sicherheitsabstand:** Siege nur, wenn `completed_at <= ends_at − Δ` (z. B. 2 s). Deckt die Latenz ab, ändert aber die Regel (Ereignisende effektiv früher). Braucht Ihre Entscheidung.
- **S3 – Nachträgliche Abstimmung:** Ein Job vergleicht `pg_xact_commit_timestamp` mit `ends_at` und widerruft Siege mit Commit nach dem Ende. Verfügbarkeit auf gehostetem Supabase ungeklärt; Belohnungen müssten widerrufbar sein.
- **S4 – Prüfung erst im COMMIT:** ein DEFERRED-Constraint-Trigger prüft `clock_timestamp() < ends_at` unmittelbar vor dem Commit und bricht sonst die Transaktion ab (Ergebnis zählt nicht, Instanz wird beendet). Verengt das Fenster auf den WAL-Flush (Millisekunden), schließt es nicht. Verhalten ändert sich nur im Randfall, den die Regel ohnehin als „zählt nicht“ ansieht.

**Empfehlung (überholt durch 5.1; S4 verworfen):** S4 zusammen mit S1 (Autocommit-Vorgabe und Dokumentation der verbleibenden Commit-Latenz). Das ändert die Regel nicht, nur ihre technische Durchsetzung. Wird die Regel streng als „sichtbar/committet vor Ende“ verstanden, bleibt nur S2 (Sicherheitsabstand). **Umsetzung erst nach Ihrer Entscheidung.**

### 5.1 Verbindliche Entscheidung und Umsetzung (nach dem Audit)

**Festgelegte Semantik (Architekturentscheidung):** Für einen Weltboss zählt der serverseitige Zeitpunkt der unwiderruflichen Abschlussentscheidung. `completed_at` ist dafür der verbindliche Zeitstempel. Sieg gültig, wenn `completed_at < ends_at`; bei `completed_at >= ends_at` kein Sieg, keine Abschlussbelohnung, `event_ended`. Der Datenbank-Commit darf danach folgen; er verlängert das Event nicht, sondern veröffentlicht eine vor dem Ende getroffene Entscheidung. Ein gültiger Sieg wird durch einen späteren Commit nie rückwirkend ungültig; nach `ends_at` entsteht nie nachträglich ein Sieg.

**Der Code setzt das bereits so um** (kein Umbau nötig, jetzt durch Tests festgeschrieben): `commit_round` nimmt `t := clock_timestamp()` nach den Zeilensperren von Instanz und Kampf, prüft `t >= ends_at` (→ `event_ended`, kein Ergebnis) und schreibt dasselbe `t` als `completed_at`; alle Sweeps, der Watchdog und `end_instance` fassen nur Instanzen im Status `active`/`frozen` an und warten bzw. überspringen (SKIP LOCKED) Instanzen, deren Sperre eine laufende Entscheidung hält. Nach dem Commit sehen sie `completed` und ändern nichts.

**Behobener Fehler (Anzeige):** `instance_view` leitete bisher aus der Uhr allein `event_ended` ab. Eine bereits vor dem Ende getroffene, noch nicht committete Entscheidung ist für diese Lesesicht unsichtbar; Beobachter sahen deshalb „event_ended“ und später „completed“. Jetzt gilt: Endzustände (`event_ended`, `completed`, …) stammen **nur aus festgeschriebenen Daten**. Nach `ends_at` und ohne festgehaltenen Endzustand meldet die Ansicht den vorläufigen, nicht endgültigen Zustand `ending` (Stufe unverändert, Ergebnis leer, nichts handlungsfähig, keine Restzeit). Der Wechsel kann nur `ending` → `event_ended` oder `ending` → `completed` sein, nie `event_ended` → `completed`. `ending` ist eine reine Anzeige, nichts davon wird gespeichert; Clients müssen den Wert behandeln.

**S4 (Prüfung im COMMIT) wird bewusst NICHT umgesetzt:** Ein DEFERRED-Trigger, der den Commit nach `ends_at` abbricht, würde eine vor dem Ende gültig getroffene Entscheidung rückwirkend verwerfen und widerspricht der festgelegten Semantik. **S1** (Aufrufmodell): `commit_round` wird als einzelne Anweisung (RPC/Autocommit) aufgerufen, damit die Zeit zwischen Entscheidung und Veröffentlichung klein bleibt. Das ist eine Konvention und wird **nicht** technisch erzwungen (ein erzwungener Autocommit ist in PostgreSQL nicht zuverlässig erkennbar) und es ist **keine** Garantie, dass der Commit vor dem Eventende liegt. Ein Sicherheitsabstand wurde nicht eingeführt.

**Was PostgreSQL prinzipbedingt nicht garantieren kann:** dass der Commit zeitlich vor `ends_at` liegt, oder eine Obergrenze zwischen Entscheidung (`completed_at`) und Sichtbarkeit. Die Semantik hängt deshalb absichtlich nicht am Commit. Folge: Zwischen Entscheidung und Commit kann ein Beobachter nach `ends_at` `ending` sehen, obwohl ein Sieg bereits entschieden ist; dieser Zustand ist dann ehrlich „noch offen“, nie „beendet“.

Tests: `server/instance/tests/semantik.mjs` (steuerbare Uhr nur in der Testdatenbank, Produktionscode unverändert; echte Nebenläufigkeit mit offenen Transaktionen). Szenarien: Entscheidung 100 ms vor dem Ende mit Commit danach (inkl. Nachweis per Commit-Zeitstempel), exakt am Ende, 1 ms davor, nach dem Ende, zwei konkurrierende Transaktionen (drei Varianten), Watchdog/Sweep/group_tick gegen eine laufende Entscheidung, `instance_view` bei offener Transaktion, Erhalt des Siegs nach späteren Sweeps/Watchdog, keine Belohnung nach dem Ende. Mutationsprüfung: 9 Mutationen, 7 gefangen; 2 überlebten, weil dahinter eine zweite, absichtlich redundante Absicherung steht (`sweep_core` filtert zusätzlich im UPDATE; `reward_filter` wird zusätzlich durch die Stufenprüfung abgedeckt).

## 5a. Flackernder Test `kontoloeschen` (Ergebnis)

Betroffen: `tests/cases/kontoloeschen.js`, erster Test („Erfolg – Login dann delete_account …“), Fehler `page.waitForSelector: Timeout 30000ms exceeded` (Selektor `#ac_dn`, Zeile 31).

**Ursache (belegt):** Echtes Testrennen, kein App-Fehler. Der Test tippt `acexport` (startet einen asynchronen Export, `acBusy=true`) und tippt sofort danach `acdel`. Der App-Handler ignoriert `acdel`, solange `acBusy` gesetzt ist (`index.html`, Fall `acdel`). Ist der Export beim Tippen noch nicht fertig, erscheint das Löschformular nie. Nur das Timing der Fake-Antworten entscheidet.

**Fix (nur im Test, ohne Schlafzeit):** Vor dem Weitergehen wird auf das sichtbare Zustandssignal „Export heruntergeladen“ gewartet.

**Läufe:** ursprünglicher Test lokal sequentiell 3/20 und später 4/15, 4/12, 3/12 fehlgeschlagen (jeweils dieselbe Stelle); unter Parallellast (3 parallele Schleifen) 1/24. Korrigierter Test: 30/30 sequentiell, 30/30 unter Parallellast (3×10) grün.

## 6. Lokal getestet vs. nicht auf echter Supabase-Instanz geprüft

**Lokal getestet (belegt durch Tests):** alles in Abschnitt 4.

**Nicht verifiziert (Annahmen):**
- Dass `auth.uid()` auf Supabase die JWT-Claims (`request.jwt.claims`/`sub`) wie in der Attrappe liefert (die Attrappe bildet das dokumentierte Verhalten nach, ist aber nicht die echte Implementierung).
- Dass das Schema `rwi` in den API-Einstellungen **nicht** als exponiertes Schema eingetragen ist (Vorgabe: bleibt aus; sonst wäre es nur durch die Rechte, nicht durch Nichterreichbarkeit geschützt).
- Dass die Funktions-Eigentümerrolle auf Supabase (`postgres`) die Wrapper wie getestet ausführt (SECURITY DEFINER, RLS-Umgehung) und dass `service_role` dort `BYPASSRLS` hat.
- Verhalten anonymer Anmeldungen (Rolle `authenticated`, aber ohne Charaktere): lokal nur indirekt durch „Konto ohne Charakter“ abgedeckt.
- Echte Latenzen (Commit, Netz) der gehosteten Datenbank.

**Bekannte Lücken / bewusst offen:**
- `rwi.players` (Stufe, Klasse, Pfad) ist eine Prototyp-Tabelle; die Ableitung aus `public.characters.character_data` fehlt (Phase 2). Die Identität ist abgesichert, die Datenquelle der Zugangsbedingung noch nicht produktiv.
- Keine Ratenbegrenzung/Missbrauchsschutz für Wrapper-Aufrufe.
- Wer den `service_role`-Schlüssel hat, hat vollen Zugriff (so vorgesehen).
- Ein Client mit rohem SQL-Zugang (den PostgREST nicht bietet) könnte `request.jwt.claim.sub` selbst setzen; Voraussetzung der Sicherheit ist daher, dass Clients nur über die Supabase-API gehen.

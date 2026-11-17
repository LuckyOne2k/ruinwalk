# Instanzkampf: Worker und Watchdog – Architekturentscheidung

Stand: 18.11.2026, Branch `nacht/supabase-integration`. Grundlage: `INSTANZKAMPF_ARCHITEKTURBERICHT_V2.md` (A.2–A.6, K.2) und der Code in `server/instance/`.
Nichts hiervon ist auf Dev oder Produktion ausgeführt. Dieses Dokument ändert keine Spielregel und keine beschlossene Architekturentscheidung; es füllt die Lücke zwischen „liefert Arbeitsaufträge“ und „führt sie zuverlässig aus“.

## 1. Befund

| Baustein | Stand |
|---|---|
| `rwi.watchdog_tick()` | vorhanden, liefert `{due: [fight_id], redispatch: [fight_id], …}` und erledigt Sweeps, Wipe-Halt, Pausenbudget, Eventende |
| `rwi.claim_resolution` / `rwi.commit_round` | vorhanden, Lease, Token, `round_version`, `input_hash`, `completed_at` unter Instanzsperre |
| `rwi.group_tick()` | vorhanden, Gruppenfristen (Bereitschaft, Abwesenheit, Warteliste) |
| Zustellung (`dispatch_if_due`, `pg_cron`, `pg_net`, Edge Function `resolve-round`) | **nur im Bericht beschrieben, im Repository nicht vorhanden** |
| Fehlermeldung des Workers an die Datenbank | **fehlte**: eine Ausnahme der Engine erhöhte `attempts` nie. Die Runde wurde nach jedem Lease-Ablauf endlos und unbemerkt wiederholt (kein `stuck`, kein Alarm). Behoben durch `rwi.report_failure` (Branch-Commit 052a6b3) |
| Worker-Kern | neu: `server/instance/worker/core.mjs` (transportunabhängig), getestet in `tests/worker.mjs` |

**Neue Erkenntnis zum Transport:** Das Schema `rwi` ist bewusst nicht über die Data API erreichbar. Eine Edge Function mit `supabase-js` und Service-Role-Key kann `rwi.claim_resolution` deshalb **nicht** per RPC aufrufen. V2 A.4 nennt „Edge Function ruft mit dem Service-Role-Key claim und commit“; das ist nur umsetzbar, wenn entweder (A1) schmale Service-Funktionen in `public` hinzukommen oder (A2) die Edge Function eine direkte Postgres-Verbindung nutzt. `rwi` freizugeben wäre ein Rückschritt und scheidet aus.

## 2. Anforderungen und wer sie erfüllt

| Anforderung | Mechanismus | Nachweis (lokal) |
|---|---|---|
| fällige Aktionen/Runden erkennen | `watchdog_tick` → `due`, `redispatch` | gruppe/fenster/worker W1 |
| `claim` → Engine → `commit` korrekt | Worker-Kern, Token und `round_version` aus dem Claim | worker W1, run-dungeon |
| parallele Bearbeitung derselben Instanz | Instanzsperre, Lease, `busy` | worker W2 (6 Worker, genau ein Ergebnis) |
| abgebrochene Jobs | Lease-Ablauf → `redispatch`, gespeicherter Snapshot | worker W3 |
| Wiederholung, doppelte Aufrufe, Zombie-Commit | `already_resolved`, `superseded`, Token | worker W2–W4 |
| Fehler protokollieren | `resolve_jobs.last_error`, `ops_alerts`; Engine-Fehler über `report_failure` | worker W5, W6 |
| festhängende Instanzen | `attempts ≥ max_attempts` → `stuck`, `engine_stuck`, Alarm; keine automatische Verteilung mehr | worker W6 |
| technische Endzustände | Watchdog (`technical_end`, `aborted`), `end_instance`; Worker entscheidet nie | gruppe, eventende, worker W7 |
| `completed_at`, `event_ended`, `ending`, absolutes UTC-Ende | unverändert in der Datenbank (Commit 8e423a3). Der Worker liest nur `status`; nach `event_ended` wird nichts wiederholt | semantik, eventende, worker W7 |
| Gruppenpausen | `wipe_hold`, Pausenbudget im Watchdog; der Worker sieht nur `due`/`redispatch` | fenster |

Grundsatz: **Die Datenbank ist die einzige Wahrheit.** Der Worker hält keinen Zustand, wiederholt nichts selbst und wertet keine HTTP-Antwort als Beleg. „Wiederholen“ heißt: der nächste Tick findet den Kampf wieder.

## 3. Varianten

**Variante A: `pg_cron` + `pg_net` → Edge Function (Beschluss in V2 A.2–A.6)**
Cron-Takt 15–30 s ruft eine SQL-Funktion `dispatch_due` auf (noch zu schreiben): `watchdog_tick`, dann je Auftrag `net.http_post` mit `Bearer`-Anon-Key und `x-rw-secret`, Body nur `{instance_id, fight_id, round_no}`. Die Funktion `resolve-round` (Deno) führt den Worker-Kern aus. Datenbankzugriff über
- **A1:** drei schmale Funktionen in `public` mit EXECUTE nur für `service_role` (`worker_claim`, `worker_commit`, `worker_report`), die `rwi.*` aufrufen; oder
- **A2:** direkte Postgres-Verbindung (Pooler), Rolle `rw_worker` mit EXECUTE nur auf die Serverfunktionen.

Vorteile: eine Plattform, keine eigene Infrastruktur, Anbindung wie beschlossen. Nachteile: Latenz Cron (≥1,5 s Intervalle erst ab pg_cron 1.5; 15–30 s Takt gewollt) + pg_net (asynchron, Antwort nicht verlässlich) + Edge-Kaltstart; Laufzeitgrenzen der Edge Function; Secrets in zwei Orten (Vault und Function-Secret); `net._http_response` wächst. A1 hält `rwi` verschlossen und braucht kein DB-Passwort in der Function; A2 braucht ein sehr mächtiges Secret (DB-URL) und einen Pooler.

**Variante B: externer Dauer-Worker (Node/Bun/Deno-Prozess)**
Ein kleiner Prozess auf eigenem Host, direkte Datenbankverbindung als `rw_worker`, Schleife alle 1–2 s: `watchdog_tick`, dann Kern. Mindestens zwei Instanzen (Lease verhindert Doppelarbeit, W2).
Vorteile: kürzeste Latenz, keine HTTP-Zustellung, kein Kaltstart, einfach zu testen und zu beobachten, Engine ohne Plattformlimits. Nachteile: zusätzliche Infrastruktur und Betrieb, zusätzliches Secret (DB-URL), Ausfall des Hosts = Spiel steht (Watchdog in der DB bleibt, aber keine Auflösung), Zugang aus dem Internet zur Datenbank.

**Verworfen:** Auflösung als SQL/PLpgSQL (Engine bleibt reines, deterministisches JS; in V2 entschieden).

## 4. Empfehlung

**Variante A mit A1 als Standardweg, Variante B als vorbereitete Rückfalloption.**
Gründe: entspricht V2 (keine Umdeutung), `rwi` bleibt unerreichbar, kein Datenbankpasswort im Function-Umfeld, kein zusätzlicher Host. A hängt aber an Phase-0-Messungen auf Dev, die noch nicht vorliegen: Zustelllatenz `pg_net`, Edge-Function-Laufzeit/Kaltstart gegen eine Runde (lease 30 s), Cron-Takt in der Tarifstufe, Wachstum von `net._http_response`. Zeigen diese Zahlen, dass die Rundenfrist nicht sicher gehalten wird, wechselt man auf B; der Worker-Kern ist für beide gleich (`db`-Schnittstelle). **Das ist eine Empfehlung, keine Freigabe.**

## 5. Ablauf in Variante A (Soll)

1. Cron alle 15–30 s: `select rwi.dispatch_due()`. Sie sperrt nichts dauerhaft, ruft `watchdog_tick` und `group_tick` auf und verschickt je `due`/`redispatch`-Eintrag einen `net.http_post` (idempotent: mehrfach schadet nicht).
2. Edge Function prüft `x-rw-secret` (konstante Zeit), liest nur die drei Felder, führt `processFight` aus.
3. Antwort der Function ist unwichtig. Entscheidend ist der Zustand in `fights`/`resolve_jobs`.
4. Fehlerfälle:

| Fall | Folge |
|---|---|
| Aufruf doppelt oder verspätet | `busy` / `already_resolved` / `not_due`, keine Wirkung |
| Function stirbt nach Claim | Lease läuft ab, nächster Tick (`redispatch`), gespeicherter Snapshot |
| Function stirbt nach Commit | Wiederholung liefert `already_resolved`, nichts doppelt |
| Engine wirft | `report_failure`: Zähler, Wartezeit 5/10/20/40/60 s, ab `max_attempts` `stuck` |
| `commit` meldet `invalid`/`input_mismatch` | zählt in `resolve_jobs`, gleicher `stuck`-Weg |
| Cron fällt aus | Lücke wird über `system_heartbeat`/`system_gaps` erfasst, Spieler werden nicht benachteiligt (T1/D2); Auflösung holt der erste Tick nach |
| Eventende (absolut, UTC) | Claim/Commit nach `ends_at` → `event_ended`, kein Ergebnis; Watchdog beendet; kein Wiederholen |

## 6. Authentifizierung der internen Aufrufe (Soll)

`x-rw-secret` mit mindestens 32 Byte Zufall, im Vault (für Cron) und als Function-Secret, Vergleich in konstanter Zeit, Rotation in zwei Schritten (neu akzeptieren, dann Absender umstellen, dann alt sperren). Nichts davon im Repository, in Logs oder in Migrationen. Der Anon-Key ist öffentlich und beweist nichts.

## 7. Überwachung (Soll, noch nicht gebaut)

Auswertbar sind bereits `rwi.ops_alerts`, `resolve_jobs.status = 'stuck'`, `instances.engine_stuck`, `system_gaps`. Offen: **wer wird wie benachrichtigt** (E-Mail, Webhook, Dashboard). Das ist eine Betriebsentscheidung.

## 8. Was fehlt noch (nicht gebaut, absichtlich)

- `rwi.dispatch_due()` und der Cron-Job
- `public.worker_*`-Funktionen (A1) bzw. DB-Rolle `rw_worker` (A2)
- Edge Function `resolve-round` und ihre Secrets, Deployment
- `derive-profile`: `rwi.players` hat keine serverseitige Ableitung aus `public.characters.character_data`. Die Klassenwahl (Grundklasse/Pfad) lässt sich aus `characters.character_class` allein nicht bilden; `character_data` stammt vom Client. Ohne diese Ableitung kann ein echter Spieler keiner Instanz beitreten. Das blockiert den Produktivbetrieb unabhängig vom Worker.
- Messungen auf Dev (Abschnitt 4)

## 9. Entscheidungen, die bei dir liegen

1. A1 (schmale `public`-Service-Funktionen) oder A2 (direkte DB-Verbindung)? Empfehlung A1.
2. Wie wird `stuck` gemeldet, und wird eine `stuck`-Instanz nach V2 A.5 alle 5 Minuten automatisch erneut versucht? (Heute: nein, nur manuell.)
3. Dürfen zwei Charaktere desselben Kontos in einer Gruppe spielen? Die Datenbank erlaubt es derzeit (`rwi.join` ohne Kontoprüfung; `own_character` liefert dann `ambiguous_character`). Regel nicht entschieden, nichts geändert.

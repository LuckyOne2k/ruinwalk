# Worker-Schnittstelle A1 (Stand: Branch `nacht/supabase-integration`)

**Beschluss:** Der Worker spricht die Datenbank über schmale, nur serverseitig ausführbare Wrapper im Schema `public` an. Das Schema `rwi` wird **nicht** über die Supabase Data API freigegeben.
Umgesetzt in `server/instance/sql/05_produktion.sql` (Abschnitt „Worker-Schnittstelle A1“), Adapter `server/instance/worker/a1.mjs`, Tests `server/instance/tests/worker-a1.mjs`.
Es gibt keine externe Anbindung und keine Secrets in diesem Stand.

## Eigenschaften aller Wrapper
- **Eine Aufgabe, eine rwi-Funktion.** Der Test liest die Funktionskörper aus dem Katalog und prüft: jeder Wrapper ruft genau eine `rwi.*`-Funktion auf.
- **SECURITY INVOKER.** Der Wrapper läuft mit den Rechten des Aufrufers (`service_role`), nicht mit denen des Besitzers. Es gibt keine Rechteausweitung; `service_role` hatte diese `rwi`-Rechte ohnehin.
- **Fester `search_path = pg_catalog, pg_temp`.** Der Test prüft die Einstellung für alle elf Wrapper im Katalog.
- **Eingaben vollständig geprüft:** Typ (über die Signatur), Wertebereich, Länge/Größe, Format. Ein Verstoß ergibt den Fehler `invalid_input` (SQLSTATE `PT400`, bei PostgREST HTTP 400) **ohne Datenbankänderung** (der Test vergleicht Zeilenzahlen vor und nach 30 ungültigen Aufrufen).
- **Rückgabe nur das Nötige.** Ohne Zuteilung liefert `rw_worker_claim` ausschließlich `{status}`. `rw_worker_commit` liefert `status`, `outcome`, `reason`.
- **EXECUTE nur für `service_role`.** `anon`, `authenticated` und PUBLIC haben kein Recht (Katalogprüfung und tatsächlicher Aufruf: „permission denied for function“).

## Berechtigungsmatrix (aus dem Systemkatalog, Testlauf)
| Wrapper | ruft | anon | authenticated | service_role | PUBLIC | SECURITY DEFINER |
|---|---|---|---|---|---|---|
| `rw_worker_tick()` | `rwi.watchdog_tick` | nein | nein | **ja** | nein | nein |
| `rw_worker_rounds(bigint[])` | `rwi.fight_rounds` | nein | nein | **ja** | nein | nein |
| `rw_worker_claim(bigint, int)` | `rwi.claim_resolution` | nein | nein | **ja** | nein | nein |
| `rw_worker_commit(bigint, int, uuid, int, text, text, jsonb)` | `rwi.commit_round` | nein | nein | **ja** | nein | nein |
| `rw_worker_report_failure(bigint, int, uuid, text)` | `rwi.report_failure` | nein | nein | **ja** | nein | nein |
| `rw_worker_roster(bigint)` | `rwi.roster` | nein | nein | **ja** | nein | nein |
| `rw_worker_start_fight(bigint, jsonb)` | `rwi.start_fight` | nein | nein | **ja** | nein | nein |
| `rw_ops_stuck_list()` | `rwi.stuck_overview` | nein | nein | **ja** | nein | nein |
| `rw_ops_resume(bigint, int, uuid, text, text default null)` | `rwi.resume_stuck` | nein | nein | **ja** | nein | nein |
| `rw_ops_register_engine(uuid, text, int, text default null)` | `rwi.register_engine` | nein | nein | **ja** | nein | nein |
| `rw_ops_terminate(bigint, uuid, text)` | `rwi.terminate_stuck` | nein | nein | **ja** | nein | nein |

## Eingabeprüfung und Rückgabe je Wrapper
| Wrapper | Prüfung (sonst `invalid_input`) | Rückgabe |
|---|---|---|
| `rw_worker_tick` | keine Eingabe | `due[]`, `redispatch[]`, `start[]`, `stuck_new`, `stuck_open` |
| `rw_worker_rounds` | 1–100 Kampf-IDs, keine NULL, jede ≥ 1 | `[{id, round_no}]` |
| `rw_worker_claim` | Kampf ≥ 1, Runde 1–100000 | bei Zuteilung `status, token, round_version, input, input_hash`; sonst nur `{status}` (z. B. `not_due`, `busy`, `stuck`, `already_resolved`) |
| `rw_worker_commit` | Token nicht NULL, Version 0–1 000 000, `input_hash` = 64 Kleinbuchstaben-Hex, `engine` = `[A-Za-z0-9._+-]{1,64}`, Ergebnis ein JSON-Objekt ≤ 256 KiB | `status`, `outcome`, `reason` |
| `rw_worker_report_failure` | Token nicht NULL, Text ≤ 2000 Zeichen (intern auf 500 gekürzt) | `status`, `attempts`, `retry_in` |
| `rw_worker_roster` | Instanz ≥ 1 | `[{id, name, grundklasse, pfad, tier}]` |
| `rw_worker_start_fight` | Instanz ≥ 1, Zustand ein JSON-Objekt ≤ 256 KiB | `status`, `fight`, `fight_no` |
| `rw_ops_stuck_list` | keine Eingabe | offene stuck-Alarme mit Kampf, Runde, Instanz, Versuchen, letzter Fehlermeldung |
| `rw_ops_resume` | Kampf ≥ 1, Runde 1–100000, Betreiber = Konto-UUID (Pflicht, kein Freitext), Begründung ≤ 4000 (die Funktion verlangt zusätzlich 10–1000 Zeichen → sonst `{status: invalid_input}`), optionale Engine-Version ≤ 200 | `status` (`resumed`, `not_operator`, `stale`, `not_stuck`, `unknown_engine`, `incompatible_engine`, …), bei `resumed` alte und neue Engine-Version |
| `rw_ops_register_engine` | Betreiber-UUID (Umfang `engine`), Version 1–200 Zeichen (Funktion: 1–80), Zustandsschema 1–1000, Notiz ≤ 4000 | `status` (`registered`, `exists`, `not_operator`, `invalid_input`) |
| `rw_ops_terminate` | wie resume, Umfang `terminate` | `status` (`terminated`, `not_operator`, `not_stuck`, `not_active`, …) |

Fachliche Ablehnung (z. B. unbekannter Kampf, falscher Token) kommt als normale Antwort mit `status`, **nicht** als Fehler. Ein Fehler bedeutet immer einen Programmierfehler des Aufrufers.

## Wie der Worker die Wrapper benutzt
`server/instance/worker/a1.mjs` bildet die Datenbank-Schnittstelle des Worker-Kerns (`core.mjs`) auf diese Wrapper ab. Der Transport (`rpc(name, args)`) ist austauschbar: PostgREST-RPC mit dem Service-Schlüssel aus den Secrets der Laufzeit oder eine direkte Datenbankverbindung. Der Test `worker-a1.mjs` führt einen kompletten Tick (Watchdog → Rundenliste → Claim → Engine → Commit) ausschließlich über die Wrapper aus.

## Was damit **nicht** belegt ist
- Es gibt keinen echten HTTP-Pfad (PostgREST). Die Aufrufe laufen lokal als Datenbankrolle über psql. Rechte und Funktionen sind echt, das Verhalten von PostgREST (z. B. Fehlerabbildung, `Prefer`-Header, Rollenumschaltung) nicht.
- **Offen:** Ob `rwi` in den „Exposed schemas“ der Data API des Dev-Projekts steht, ist nur im Dashboard sichtbar. Vor einer Installation muss dort gelten: nur `public` (und was schon exponiert ist), **nicht** `rwi`. Selbst wenn `rwi` versehentlich exponiert wäre, hätten `anon` und `authenticated` kein `USAGE` auf das Schema (Katalogtest).
- **Offen:** Der `service_role`-Schlüssel darf nur in der Laufzeit des Workers liegen. Er umgeht RLS und hat Rechte auf alle `public`-Tabellen. Ein Leck des Schlüssels ist durch die Wrapper nicht abgedeckt.
- **Offen:** Ratenbegrenzung und Aufruf-Authentisierung der Edge Function (`x-rw-secret`-Entwurf in `docs/INSTANZKAMPF_WORKER_ARCHITEKTUR.md`) sind nicht gebaut.


## Betreiberidentität (Änderung 18.11.2026)
Alle drei `rw_ops_*`-Wrapper, die etwas ändern, verlangen eine **Betreiber-Konto-UUID** (`rwi.operators`, Umfang `resume`/`terminate`/`engine`). Unbekannt, deaktiviert oder ohne Umfang → `{status:'not_operator'}`, keine Wirkung, Eintrag `denied` im `rwi.ops_log`. Die Wrapper bleiben nur für `service_role`; die Prüfung, dass die UUID zum eingeloggten Betreiber gehört, muss die aufrufende Schicht leisten (Edge Function, nicht gebaut). Details: `docs/OPERATOREN.md`.

# Betreiberidentität für `resume_stuck`, `terminate_stuck`, `register_engine`

Stand: 18.11.2026. Lokal PG16 getestet (`operatoren.mjs`, 31 Prüfungen, plus angepasste stuck/hotfix/worker-a1/run). PG17 über CI.

## Prinzip
Betreiber = ein **Supabase-Konto** (UUID). Ein Freitext oder eine vom Aufrufer gewählte Kennung gilt nicht. Die Datenbank erzwingt:
- Tabelle `rwi.operators(account_id → auth.users, label, scopes, active)`; Umfänge: `resume`, `terminate`, `engine`.
- `rwi.check_operator`: Betreiber muss existieren, aktiv sein und den Umfang haben; sonst Status `not_operator`, **keine Wirkung**, Eintrag `denied` im Protokoll.
- Begründung Pflicht (≥ 10 Zeichen), sonst `invalid_input`.
- `rwi.ops_log` (nur anhängen; UPDATE/DELETE per Trigger verboten): Art, Zeit, Betreiber-ID, Name, Instanz, Kampf, Runde, alte/neue Engine-Version, Begründung. Auch Betreiberänderungen (`operator_change`) und abgewiesene Aufrufe (`denied`).
- Verwaltung der Betreiber **nur per SQL/Migration** (`rwi.set_operator`, kein Wrapper, kein öffentliches Admin-Interface). Konto gelöscht → Betreiberzeile entfällt (FK cascade), Protokoll behält die ID.
- Wrapper `public.rw_ops_*` bleiben **nur service_role**; Normalclients (anon/authenticated) kommen an Wrapper, `rwi.operators`, `set_operator` und `resume_stuck` nicht heran (getestet).

## Edge Function `operator` (neu, nicht bereitgestellt)
`supabase/functions/operator/` (`handler.mjs` Kernlogik, `index.ts` Deno-Einstieg, `keys.mjs` Schlüsselwahl und Body-Limit; die Einstellung `verify_jwt = true` steht in `supabase/config.toml` unter `[functions.operator]`). Aktionen: `resume`, `terminate` (kein `register_engine`: nicht ausdrücklich freigegeben, bleibt SQL/service_role).
- **Identität:** Das `Authorization: Bearer`-JWT wird bei GoTrue geprüft (`GET /auth/v1/user`: Signatur, Ablauf, Sitzung); zusätzlich Rolle `authenticated`, `sub` = von GoTrue gelieferte ID, Ablauf in der Zukunft. Nur diese ID geht als `p_operator` an die Wrapper. Felder `operator`, `operator_id`, `account_id` im Body machen die Anfrage **ungültig (400)**.
- **MFA:** Standard erzwingt `aal2` (`OPERATOR_REQUIRE_MFA=false` nur für Dev).
- **Berechtigung:** durch `rwi.check_operator` (aktiv, Umfang); Antwort an den Aufrufer nur `403 forbidden` ohne Grund; Grund und geprüfte Konto-ID stehen im `ops_log` (`denied`).
- **Eingaben:** strenge Validierung (Kampf, Runde, Begründung 10–1000 Zeichen, Engine-Name, unbekannte Felder abgelehnt, Body ≤ 4096 Byte, nur POST).
- **Schlüssel:** `SUPABASE_SECRET_KEYS` (neues Format, Name `default`) bzw. das alte `SUPABASE_SERVICE_ROLE_KEY` wird nur serverseitig aus der Umgebung gelesen, nie zurückgegeben oder protokolliert. Aufruf der A1-Wrapper über PostgREST (`/rest/v1/rpc/rw_ops_*`) mit diesem Schlüssel; die internen `rwi`-Funktionen werden nie freigegeben. `rwi` bleibt nicht exponiert.
- **Fehler:** `401` (kein/ungültiges/abgelaufenes JWT), `403` (nicht berechtigt / MFA fehlt), `400` (Eingabe), `405`, `502` (Backend-Fehler ohne Details).
- **Tests:** `operator-edge.mjs` (34): gültiger Betreiber, ungültige Signatur, abgelaufen, falscher Schlüssel, Anon-Key, Rolle service_role, normaler Spieler, Betreiber ohne Umfang, fehlende/zu kurze Begründung, manipulierte Betreiber-ID, doppelte Wiederaufnahme, beendete Instanz, MFA, Backend-Fehler, keine Schlüssel in Antworten/Logs, `rwi.operators` über Data API weder lesbar noch beschreibbar.
- **Simuliert vs. echt:** GoTrue ist ein lokaler Stub (HS256-Prüfung); die Datenbankwrapper sind echt (lokales PG mit Rollenstub). **Nicht bewiesen:** echtes GoTrue/JWT (Signatur-Schlüssel, Sitzungssperre), echte Edge-Runtime (Deno), Gateway-`verify_jwt`, MFA-Claims (`aal`) eines echten Tokens.
- **Echte Dev-Prüfung (nach Freigabe):** Funktion auf Dev bereitstellen; Betreiberkonto mit MFA anlegen und per SQL `rwi.set_operator`; Aufrufe mit gültigem Token, abgelaufenem Token, normalem Spielerkonto, Konto ohne Umfang; `ops_log` prüfen.

## Was NICHT bewiesen ist
Die Datenbank prüft die **Berechtigung der übergebenen Konto-UUID**. Dass diese UUID wirklich vom eingeloggten Betreiber stammt, stellt die Edge Function `operator` sicher (siehe oben): sie ist **gebaut, aber nicht bereitgestellt** und mit echtem GoTrue nicht geprüft. Bis zur Bereitstellung und Dev-Prüfung: Wrapper nur mit dem service_role-Schlüssel, nur durch Pascal von einem sicheren Ort. Der Datenbank-Eigentümer (postgres) kann technisch weiterhin das Protokoll leeren (TRUNCATE) — nur Rechte schützen, nicht der Trigger.

## Berechtigungsmatrix
| Aktion | anon | authenticated | service_role (Wrapper) | Betreiber nötig |
|---|---|---|---|---|
| `rw_ops_resume` | ✗ | ✗ | ✓ | Umfang `resume` |
| `rw_ops_terminate` | ✗ | ✗ | ✓ | Umfang `terminate` |
| `rw_ops_register_engine` | ✗ | ✗ | ✓ | Umfang `engine` |
| `rw_ops_stuck_list` | ✗ | ✗ | ✓ | – (nur lesen) |
| `rwi.set_operator` | ✗ | ✗ | ✗ (nur Eigentümer/Migration) | – |
| `rwi.operators`, `rwi.ops_log` lesen/schreiben | ✗ | ✗ | ✗ | – |

## Einen Betreiber anlegen (SQL, nur nach Freigabe)
`select rwi.set_operator('<auth.users.id>', 'Pascal', array['resume','terminate','engine']);`

## Nachkorrektur (Stand 18.11.2026, Details in `docs/DEV_FREIGABE_NACHKORREKTUR.md`)
- Body wird erst nach der Authentifizierung und mit hartem Byte-Limit (4096) gelesen (`keys.mjs: readBodyLimited`).
- Schlüsselformate: neue Schlüssel (`sb_secret_…`) nur im Header `apikey`, alte JWT-Schlüssel in `apikey` und `Authorization`. Ob das echte Supabase-Gateway beides wie erwartet akzeptiert, ist NICHT getestet.
- Protokollschutz: je Konto höchstens 20 einzelne `denied`-Einträge pro Stunde (+ ein Sammeleintrag), insgesamt höchstens 1000 pro Stunde (`rwi.check_operator`).

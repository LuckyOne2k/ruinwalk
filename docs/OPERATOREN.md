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

## Was NICHT bewiesen ist
Die Datenbank prüft die **Berechtigung der übergebenen Konto-UUID**. Dass diese UUID wirklich vom eingeloggten Betreiber stammt, muss die aufrufende Schicht sicherstellen: eine vertrauenswürdige Edge Function (service_role) verifiziert das Betreiber-JWT (GoTrue; optional MFA) und reicht `sub` weiter. Diese Funktion ist **nicht gebaut** und lokal nicht beweisbar (kein GoTrue). Bis dahin: Wrapper nur mit dem service_role-Schlüssel, nur durch Pascal von einem sicheren Ort. Der Datenbank-Eigentümer (postgres) kann technisch weiterhin das Protokoll leeren (TRUNCATE) — nur Rechte schützen, nicht der Trigger.

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

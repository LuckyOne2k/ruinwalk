# Quest-System Paket 2: Server-Grundgerüst

Stand 23.11.2026 · Zweig `quest/paket1-client-grundlage` (Basis `986d1d6`) · **nicht committet, nicht installiert, nicht live**.
Grundlage: abgestimmter Quest-Gesamtplan (korrigierte Abschnitte 1–7) und E9; Entscheidungen K1–K4 von Pascal (23.11.2026).

## 1. Entscheidungen K1–K4
| | Entscheidung (Pascal) | Umsetzung |
|---|---|---|
| K1 | Queststufe ausschließlich aus serverseitig bestätigtem Level. Ohne bestätigtes Level keine Tages-/Wochenaktivierung. | `character_confirmed.level`; `quest_stufe(level)` mit den Level-Grenzen 1/8/16/26/38 (`BAND_LO`). Trigger `character_quests_guard`: Tag-/Wochenzeilen nur mit bestätigtem Level und genau der daraus abgeleiteten Stufe (`level_unconfirmed`). `quest_state` meldet die Stufe nur aus dem bestätigten Level. |
| K2 | Tages-/Wochenaktivierung erst in Paket 3; `character_confirmed` nicht ungeprüft aus Client-Daten initialisieren. | `quest_state` aktiviert nichts (`aktivierung.tag_woche = false`, Grund `gesperrt_bis_paket_3`) und schreibt keine Questzeilen, Gutschriften oder bestätigten Werte. Keine Migration füllt `character_confirmed`; Schreiben nur Server (heute niemand). Tabellenregel `character_quests_fest`: Tag/Woche nie ohne festgeschriebene Stufe, Menge und Startstand. |
| K3 | (abschließend 23.11.2026) Je Periode grundsätzlich drei verschiedene Quests, gewichtet und deterministisch aus dem Periodenschlüssel; zuerst aus Vorlagen, die nicht in der Vorperiode vorkamen; reicht das nicht, gewichtet aus den Vorperioden-Quests auffüllen; bei weniger als drei aktiven Vorlagen nur die verfügbaren, ohne Duplikate; gespeicherte Rotation unveränderlich, für alle gleich und reproduzierbar. | `quest_rotation_wahl(typ, datum)` in zwei Stufen: (1) aktive Vorlagen ohne die der gespeicherten Vorperiode, (2) die der Vorperiode zum Auffüllen. Platz k (1–3) zieht gewichtet ohne Zurücklegen, rein ganzzahlig: `hashtextextended(typ|datum|k) mod Restgewicht` über die nach `quest_key` sortierten Kandidaten der aktuellen Stufe; ist Stufe 1 erschöpft, geht es mit Stufe 2 weiter. `quest_rotation_sichern` speichert einmalig (`on conflict do nothing`), danach unveränderlich. |
| K4 | Mengenfaktor je Questdefinition (`ziele[].faktor[1..5]`), Werte folgen mit den Inhalten. | Prüfung `quest_ziele_ok`: `faktor` optional, wenn vorhanden genau 5 Zahlen > 0 (≤ 1000); ohne `faktor` keine Skalierung. Keine Werte angelegt. |

## 2. Neue Objekte (`supabase/schema.sql`, Migration `supabase/migration_q1_quest_grundlage.sql`, Rücknahme `supabase/rollback_q1_quest_grundlage.sql`)
**Tabellen (alle mit RLS):**

| Tabelle | Schlüssel | Regeln |
|---|---|---|
| `quest_events` | `event_key` | Ende > Beginn; Clients sehen nur begonnene Events |
| `quest_defs` | (`quest_key`, `version`) | Präfix ↔ Bereich (st/pr/nb/tg/wo/ev), Ziele (K4), Versionen unveränderlich (nur `aktiv`) und nur ohne Verweis löschbar, Event-Quests nur zu vorhandenem Event, Stufe nur bei Prüfungen; Clients lesen alles außer Klassenprüfungen und noch nicht begonnene Event-Quests |
| `quest_pools` | (`periode_typ`, `quest_key`) | nur Vorlagen des Typs, Gewicht 1–1.000.000; für Clients nicht lesbar |
| `quest_rotation` | (`periode_typ`, `periode_datum`) | 1–3 verschiedene Vorlagen des Typs, Woche = Montag, nie leer, unveränderlich und nicht löschbar; lesbar |
| `npc_defs`, `npc_seed` | `npc_typ` bzw. `fenster_id` | Ablage für Paket 8 (Vorlagen müssen Nebenquests sein); Seeds nicht lesbar |
| `character_confirmed` | `character_id` (Kaskade) | Level, Zähler (flach: Schlüssel → ganze Zahl ≥ 0) und Story-Abschlüsse steigen nur; nicht löschbar außer mit dem Charakter; eigene lesbar |
| `character_quests` | (`character_id`, `quest_key`, `inst_key`) (Kaskade) | `inst_key` je Bereich (einmalig, `n:fenster:x:y`, `d:YYYY-MM-DD`, `w:Montag`, `e:event`), `periode_datum` passend, K1-Regel, festgeschriebene Werte unveränderlich, Status nur vorwärts, Anfangsstatus: Nicht-Story-Zeilen nur `aktiv`, Story-Zeilen mit jedem gültigen Status (`aktiv`, `abschlussbereit`, `abgeschlossen`, `verfallen`; gedacht für den Story-Sync, Trigger `character_quests_guard`), nicht löschbar außer mit dem Charakter; eigene lesbar |
| `quest_rewards` | (`character_id`, `rid`), `rid = quest_key || '|' || inst_key` (berechnete Spalte) | nur zu vorhandener Questzeile (Kaskade), Inhalt und Frist unveränderlich, neu nur `offen`/`im_spielstand`, `offen ⇄ im_spielstand` nur bis `gueltig_bis` (Standard 14 Tage), danach nur `im_spielstand → endgueltig` bzw. `offen → verfallen`, beides endgültig; nicht löschbar außer mit dem Charakter; eigene lesbar |
| `quest_audit` | `id` (Kaskade) | nur service_role |

**Funktionen (18):** Prüffunktionen `quest_bereich`, `quest_ziele_ok`, `quest_inst_ok`, `quest_inst_datum`, `quest_zaehler_ok`; Perioden `quest_periode_datum(typ, t)`, `quest_periode_start(datum)`, `quest_stufe(level)`; Rotation `quest_rotation_wahl`, `quest_rotation_sichern`; sieben Triggerfunktionen; Client-RPC **`quest_state(p_character uuid)`**. Nur `quest_state` ist für `authenticated` ausführbar, nichts für `anon`.

**Perioden:** Berliner Ortszeit (`Europe/Berlin`), Wechsel 09:00, Woche ab Montag 09:00. Gerechnet in Ortszeit, daher korrekt bei Sommer-/Winterzeit (Tage mit 23/25 Stunden, getestet; Woche mit Sommerzeitumstellung 167 Stunden, getestet), unabhängig von der Zeitzone der Sitzung.

**`quest_state` (liest; schreibt nur die globale Rotation, daher keine schreibgeschützte Transaktion – PostgREST POST, nicht GET):** Serverzeit (`clock_timestamp`), Tages- und Wochenperiode (Datum, Beginn, Ende), Rotation beider Perioden (legt sie bei Bedarf einmalig an), Aktivierungsstatus (gesperrt), Stufe aus bestätigtem Level, bestätigte Werte, laufende Events, eigene Questzeilen, eigene Gutschriften mit verzögert berechnetem Status nach Fristende (geschrieben wird der Status erst in Paket 3). Fremde/unbekannte Charaktere: `not_found`; Platz 3 ohne Berechtigung: `character_locked`; nur unter READ COMMITTED.

**TRUNCATE:** für `service_role` auf `quest_defs`, `quest_rotation`, `character_confirmed`, `character_quests` und `quest_rewards` entzogen (umginge die Zeilentrigger). Der Tabelleneigentümer (`postgres`) bleibt davon ausgenommen.

## 3. Sperrreihenfolge und Schutz B-4/B-6
`quest_state`: Rotation (eigene Anweisungen, vor jeder Charaktersperre) → Profil `for key share` → Charakterzeile `for key share` → Lesen ohne Sperre. Keine Beratungssperre (rwi), keine Schreibsperre auf Quest-Tabellen. Das entspricht der Pr-Torregel aus B-4 (Profil zuerst wie `save_character`/`delete_character`), `delete_account` (Profil exklusiv) wartet am Profil bzw. `quest_state` wartet dort; mit `save_character`, `delete_character` und Mehrzeilen-DELETE (B-6) wartet jeweils eine Seite an der Charakterzeile, ein Zyklus entsteht nicht (Tests QS-1 … QS-9). Bestehende Funktionen sind unverändert. Die Löschkaskade (Profil → Charakter → `character_confirmed`/`character_quests` → `quest_rewards`) folgt derselben Reihenfolge; die Lösch-Sperren der Trigger lassen nur die Kaskade durch.

## 4. Tests
| Test | Inhalt | Ergebnis |
|---|---|---|
| `supabase/tests/10_tests.sql`, Abschnitt 20 (beide Rechte-Modi) | Perioden (09:00, Woche, Sommer-/Winterzeit, Jahreswechsel, Sitzungszeitzone), Stufe, Katalogregeln, Pool, Rotation nach K3 (Determinismus, 3 verschiedene Quests, zuerst Vorlagen außerhalb der Vorperiode, gewichtete Auffüllung aus der Vorperiode, Poolgrößen 1–7 über drei Perioden, wiederholte Aufrufe, inaktive Vorlagen, Gewichte, < 3 Vorlagen ohne Duplikate, keine Zeile ohne aktive Vorlage, Unveränderlichkeit), bestätigte Werte, Questzeilen, Gutschriften, RLS/Rechte, `quest_state`, Sperrfolge statisch, Kaskade, TRUNCATE/Löschschutz | 432/432 je Modus (PG16, PG17) |
| `server/instance/tests/quest-sperren.mjs` (neu, in `run-all-db.sh` und CI) | QS-1–QS-7 Sperrfolge mit Haltepunkten gegen `delete_account`, `save_character`, `delete_character`, Mehrzeilen-DELETE (beide Reihenfolgen), QS-8 gleichzeitiges Anlegen der Rotation, QS-9 Mischlast, QS-10 Migration/Rollback Q1 = `schema.sql` (Katalogvergleich, beide Rechte-Modi) | 15/15 auf PG16 und PG17, 0 × 40P01 |
| angepasst | `rechte-audit.mjs` (17 Client-Funktionen, Lese-Rechte/Policies/Trigger der Quest-Tabellen), `installation.mjs` (16/56 Objekte in public), `supabase/dev/rollback_dev.sql` (Manifest 174 Einträge, Tabellenlisten), Erwartungsliste in `10_tests.sql` | |

Gesamtlauf `run-all-db.sh` auf PG17 und PG16 (Stand **vor** der letzten K3-Änderung, Auffüllregel): alle 34 Suiten grün (u. a. `b2-sperren` 59, `installation` 273, `rechte-audit` 29, `produktion` 222, `k2-compare` ohne Deadlock, Dungeon-Läufe ohne Probleme); `quest-sperren` nach einer Testkorrektur (Filter für das alte Schema) einzeln 15/15 auf beiden Versionen. Nach der K3-Änderung liefen die betroffenen Tests einzeln auf PG17 und PG16: SQL-Tests 432/432 (beide Modi), `quest-sperren` 15/15, `installation` 273/273, `rechte-audit` 29/29; der vollständige Gesamtlauf auf dem Endstand folgt in der CI. Nicht gelaufen: Browser-Tests (`npm test`), weil `index.html` in Paket 2 unverändert ist.

Mutationsproben (je in einer Kopie, vor der K3-Auffüllregel; die aktuellen K3-Proben stehen in Abschnitt 7): 13 gegen die SQL-Tests (Vorperiode, damals strikter Ausschluss, Rotation änderbar, Wechsel 08:00, Zeitzone UTC, K1 aus, Frist aus, Profilsperre aus, Prüfungen lesbar, bestätigtes Level sinkt, Festschreibung aus, Gewichte aus, Version änderbar, Gutschrift löschbar) und 1 gegen den Migrationsvergleich (fehlender `revoke`), dazu nach der Sicherheitsprüfung 2 weitere (TRUNCATE erlaubt, Version trotz Rotation löschbar): alle rot.

**Installationsdatei:** `install_dev.sql` SHA-256 `45abc5a0ca5480c8a8cf30c076004b94c915db0606e52ab7567cf70eea8a5bf2` (2654 Zeilen, zweimal identisch erzeugt); maßgeblich erst nach dem Merge (`docs/DEV_INSTALLATIONSFREIGABE.md`).

## 5. Auslegungen ohne eigene Architekturentscheidung
- Ohne verfügbare Vorlage wird für die Periode **keine** Rotationszeile gespeichert (statt einer leeren); eine später ergänzte Vorlage kann die Periode dann noch füllen. Sobald eine Zeile gespeichert ist, bleibt sie fest.
- Die Vorperiode zählt nur, wenn für sie eine Rotation gespeichert ist; sonst stehen alle Vorlagen in Stufe 1.
- `character_confirmed.zaehler` ist ein flaches Objekt (Schlüssel wie im Client-Zählerregister, z. B. `kills`, `col.stock`).
- Clients lesen `quest_pools` (Gewichte), `npc_seed` und `quest_audit` nicht.

## 6. Sicherheitsprüfung (rw-backend-security)
Kein Blocker; K1, K2 und K4 korrekt, K3 inzwischen abschließend entschieden und umgesetzt (Auffüllung aus der Vorperiode, siehe 7). Umgesetzt: TRUNCATE für `service_role` auf den geschützten Tabellen entzogen; Löschen einer Version, die in einer gespeicherten Rotation steht, gesperrt; Volatilität der Datumsprüfung (`make_date` statt `to_date`); Kommentare (`quest_state` schreibt die Rotation, Testdatei-Verweis). Als Hinweis festgehalten: Wettlauf beim Periodenwechsel, wenn die Vorperiode erst um 08:59:59 angelegt und noch nicht festgeschrieben ist (sehr selten, dann kann eine Wiederholung vorkommen); Vorhersagbarkeit der Rotation für jemanden, der die Pools kennt (spielerisch harmlos); Paket 3 muss `character_confirmed` vor dem Anlegen einer Questzeile sperren (K1-Prüfung liest ohne Sperre).

## 7. K3 – Nachtrag Auffüllung (Entscheidung Pascal, 23.11.2026)
Die Prüfung zeigte: Der strikte Ausschluss der Vorperiode ergab bei kleinen Pools wechselnd dünne oder leere Perioden (3 Vorlagen: 3 / 0 / 3). Jetzt wird aufgefüllt:

| Aktive Vorlagen | je Periode | nach Periodenwechsel: neu / aus der Vorperiode aufgefüllt |
|---|---|---|
| 1 | 1 | 0 / 1 |
| 2 | 2 | 0 / 2 |
| 3 | 3 | 0 / 3 |
| 4 | 3 | 1 / 2 |
| 5 | 3 | 2 / 1 |
| ≥ 6 | 3 | 3 / 0 |

Tests (Abschnitt 20c): Poolgrößen 1–7 mit je drei aufeinanderfolgenden Perioden (Anzahl, keine Duplikate, alle nicht wiederholten Vorlagen zuerst, Rest aufgefüllt, Reihenfolge neu vor aufgefüllt nur für Platz 1 bei Poolgröße 4 geprüft), Wiederholungsaufruf = gespeicherte Auswahl, erneutes Anlegen ändert nichts, gewichtete Auffüllung (schwere Vorlage kehrt in ≥ 55 von 60 Fällen zurück), Woche mit 2 Vorlagen (2 / 2, keine leere Woche), keine Zeile ohne aktive Vorlage. Mutationsproben: ohne Auffüllung, Vorperiode zuerst, ohne Ausschluss, Auffüllung ungewichtet – alle rot.

## 8. Abhängigkeiten und offene Punkte
- **Paket 3:** schreibender Teil (Pflege von `character_confirmed` in `save_character` mit Plausibilität, Aktivierung Tag/Woche mit festgeschriebenen Werten, `quest_complete`, Gutschrift-Abgleich, verzögertes Schreiben von `endgueltig`/`verfallen`).
- Konkrete Questinhalte, Pool-Gewichte und Faktorwerte folgen mit den Inhalten (`rw-gamedesign`, `rw-welt-ki`).
- Produktionsmigrationen B2/B4 stehen weiter aus; Q1 ändert keine bestehende Funktion und kann unabhängig davon eingespielt werden (nur mit Freigabe).
- Dev-Installation mit neuem Hash braucht eine eigene Freigabe.
- Nicht live geprüft: echtes Supabase (`auth.uid()`, PostgREST, Standardrechte), Laufzeiten.

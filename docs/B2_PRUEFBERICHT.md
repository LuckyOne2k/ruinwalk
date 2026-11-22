# Prüfbericht B-2/B-3: Sperrreihenfolge Beitritt ↔ Charakter-/Kontolöschung

Stand 21.11.2026 (Nachträge: PG17 und B-5 Abschnitt 8, unabhängige B-5-Prüfung Abschnitt 9, Nacharbeiten Abschnitt 10, Dokumentationsabschluss Abschnitt 11, Integrationsabschluss Abschnitt 12) · Arbeitsbereich `ruinwalk-pr1` (Zweig `integration/nacht-nach-main`) · **nicht committet, nicht installiert, nicht live**.
Grundlage (nicht Teil von PR 1, unveränderliche Fassungen auf Zweig `ccr-2e014f58-1i6nm4`):
- B2-Analyse: [https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/b6bc3c56988a0426f72035511aebeef11f327c56/docs/B2_ANALYSE_BEITRITT_CHARAKTERLOESCHUNG.md](https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/b6bc3c56988a0426f72035511aebeef11f327c56/docs/B2_ANALYSE_BEITRITT_CHARAKTERLOESCHUNG.md)
- V5-Gegenprüfung: [https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/2581c57f96f4cc141e3855ea451f15431b01988f/docs/B2_V5_GEGENPRUEFUNG.md](https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/2581c57f96f4cc141e3855ea451f15431b01988f/docs/B2_V5_GEGENPRUEFUNG.md)
- V6-Prüfung: [https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/de37014f6f5e78be41738e832b551ac5c14759b0/docs/B2_V6_PRUEFUNG.md](https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/de37014f6f5e78be41738e832b551ac5c14759b0/docs/B2_V6_PRUEFUNG.md)
.

## 1. Freigegebener Umfang und Umsetzung
| Punkt | Umgesetzt in |
|---|---|
| V5 mit K-a (sortierte, entdoppelte Sperrschleife) | `05_produktion.sql` `rwi.on_profile_deleting`, `04_gruppe.sql` `rwi.create_group` |
| K-b (Sperre in `on_character_deleted` vor der Schleife) | `05_produktion.sql` `rwi.on_character_deleted` |
| K-c (READ COMMITTED Pflicht, SQLSTATE 25000) | alle fünf Funktionen |
| K-d (Eigentum vor Sperre, keine Sperre fremder Schlüssel) | `public.group_join` (nach `own_character`), `public.delete_character` (nach Eigentumsprüfung) |
| K-e (`create_group` nie unter gehaltener Instanzsperre) | Kommentar `04_gruppe.sql`; Aufrufer geprüft (rw-instanzkampf: keiner hält I) |
| V6′ `public.delete_character`: Profil `for key share` → Eigentum → A → Löschen; **seit Abschnitt 8:** Eigentum als Zeilensperre `for update` **vor** A (B-5) | `supabase/schema.sql`, Migration/Rollback neu |
| `create_group` einbezogen | `04_gruppe.sql` |
| Gleicher Schlüssel `hashtextextended('rwi.char:' \|\| lower(<id>), 0)` in public und rwi | alle fünf Stellen, Test V6-9 |
| **Nicht umgesetzt:** V6+ für `save_character`/`move_character` | B-4 bleibt offen (Abschnitt 5) |

**Sperrregel (Stand nach B-5, Abschnitt 9):** Es gilt keine einfache globale Ordnung mehr, sondern die **Pr-Torregel**: Wer A → C nimmt (D `delete_account`, D_adm Admin-Löschung: Kaskade nach `on_profile_deleting`), hält vorher Pr exklusiv. Wer C → A nimmt (D′ `delete_character`, D_dir direktes DELETE), hält vorher Pr(ks) als **allererste** Sperre (D′) bzw. hält kein Pr (D_dir). J/CG nehmen A → I ohne Zeilensperre auf `characters`; P nimmt nur I. Instanzen immer nach A und aufsteigend. Die Profilsperre muss in `delete_character` die erste Sperre bleiben (Mutation „Profilsperre nach C“ → 40P01).

## 2. Exakte Dateideltas (gegen Index, `git diff` + neue Dateien)
| Datei | Änderung |
|---|---|
| `supabase/schema.sql` | +9: Kommentar (Z. 340–343), `delete_character` RC-Prüfung, Profilsperre, Eigentumsprüfung, Beratungssperre (Z. 349–353) |
| `supabase/migration_b2_loeschreihenfolge.sql` | neu, 27 Z.: `begin` · Funktion wörtlich wie `schema.sql` · revoke public/anon · grant authenticated · `commit` |
| `supabase/rollback_b2_loeschreihenfolge.sql` | neu, 16 Z.: Fassung vor B2 wörtlich (= `migration_d3_konto_loeschen.sql`) + Rechte |
| `server/instance/sql/04_gruppe.sql` | +8/−1: `create_group` `kk bigint`, RC-Prüfung, sortierte Sperrschleife, Kommentar K-e (Z. 177–186) |
| `server/instance/sql/05_produktion.sql` | +21/−1: `group_join` (Z. 50–61), `on_character_deleted` (Z. 215–218), `on_profile_deleting` (Z. 245–254) |
| `supabase/tests/10_tests.sql` | +14: Reihenfolge, Schlüssel, RC-Prüfung, Rechte von `delete_character` |
| `supabase/dev/rollback_dev.sql` | 5 Fingerabdrücke (Z. 104, 124, 127, 168, 171) |
| `server/instance/tests/b2-sperren.mjs` | neu, 420 Z. (44 Prüfungen) |
| `server/instance/tests/loesch-trigger.mjs:123`, `slot3-f9.mjs:81` | `on_profile_deleting` liest jetzt `public.characters` (Erwartung ergänzt) |
| `server/instance/tests/run-all-db.sh:12` | `b2-sperren` aufgenommen |
| `.github/workflows/instance-tests.yml` | Z. 4 Pfadfilter `supabase/migration_*.sql`, `rollback_*.sql`; Z. 65/70 Schritt + `b2-sperren.mjs` |
| `docs/LOESCHVORGANG.md` | Abschnitt Sperrreihenfolge, RC-Pflicht, B-4, B-5 |
| `docs/DEV_INSTALLATIONSFREIGABE.md` | neuer SHA-256 |

md5 Endstand: schema `3e057fc2…`, 04 `68831fcb…`, 05 `983479f1…`, Test `3b8314a7…`, Migration `2537f88f…`, Rollback `f64bc1fb…`.
SHA-256 `install_dev.sql`: `52303b159fb2e2059f9e36f500b6ece81a3ab636acbd9e4489bed9d74ec506e8` (Stand vor Abschnitt 8, überholt; aktuell siehe Abschnitt 8).

## 3. Testergebnisse (lokal, PostgreSQL 16.15, Supabase-Attrappe)
| Suite | Ergebnis |
|---|---|
| `run-all-db.sh` (31 Einzeltests inkl. b2-sperren, installation 273, produktion 222, gruppe 157, supabase-schema) | **ALLES BESTANDEN** |
| `b2-sperren.mjs` mit `B2_MIX=200` (Endstand) | **44 bestanden, 0 fehlgeschlagen** |
| `supabase/tests/run.sh` beide Rechte-Modi | 249/249 neu, 249/249 legacy |
| Determinismus (Node, Bun; Deno lokal nicht installiert) | identische Digests |
| golden / combat / struktur / trennung / offen | grün |
| `npm test` | 229 bestanden, 0 fehlgeschlagen |
| k2-compare skip 15 / nosweep | 0 Deadlocks, 0 Fehler |
| Migration/Rollback (V6-11, beide Modi) | Migration ergibt exakt `schema.sql`; Rollback stellt Quelltext, SECURITY DEFINER, search_path, ACL wieder her; Rollback = D3-Fassung |
| **PostgreSQL 17** | siehe Abschnitt 8: **lokal geprüft, alles bestanden** |

## 4. Deadlock-Nachweise (echte Zwei-Sitzungs-Tests mit Haltepunkten; Wartezustand je Fall über `pg_stat_activity` belegt)
- K1-9g1–g3, B2-1 (Dungeon/Weltboss), B2-2, B2-3/3b, B2-8 (create_group), B2-9 (direktes Löschen ∥ Beitritt), B2-10 (create_character ∥ Admin-Löschung, beide Reihenfolgen), B2-12 (Beitritt hält A vor I ∥ Kontolöschung).
- GP-1/V6-1, V6-2 (D′ ∥ D, beide Reihenfolgen), V6-3 (D′ ∥ Admin-Löschung, beide), V6-4, V6-7 (save/move ∥ D′, vier Fälle), GP-3 (RR/SERIALIZABLE abgewiesen), GP-4/V6-12 (fremder Schlüssel blockiert nicht, < 3 s), GP-5, GP-6 (getrennte Schlüsselräume objsubid 1/2).
- Belastungsmischung V6-13, je 200 Durchläufe: **A: 0 × 40P01, INV-1 = 0**; **B: 0 × 40P01 außerhalb B-4, 262 bekannte B-4-Fälle**, INV-1 = 0.
- **Mutationsproben (12, alle ROT, Dateien per md5 wiederhergestellt):** M1 group_join ohne Sperre · M2 ohne Profilsperre · M3 Sperre vor Eigentum · M4 Sperre vor own_character · M5 ohne RC · M6 on_profile_deleting ohne A · M7 on_character_deleted ohne A · M8 create_group ohne A · M9 Profilsperre nach A · M10 abweichender Schlüssel · M11 unsortierte Schleife (nur strukturell) · M12 A nach I in on_profile_deleting. Zusätzlich QA (in einer Kopie): Seed-Abweichung je Stelle, `delete_character` ohne A – alle rot. Überlebt nur: RC-Prüfung allein in `on_profile_deleting` entfernt (äquivalent, `on_character_deleted` prüft dasselbe).

## 5. Offene Risiken und bekannte Fehler
| Nr. | Befund | Bewertung |
|---|---|---|
| **B-4** | `delete_account` ∥ `save_character`/`move_character` desselben Kontos: genau ein 40P01 (C → Pr). Unter Last häufig (262 in 200 Durchläufen der Mischung B). Atomar, kein Datenverlust; Client meldet „nicht durchgeführt“. | **offen** laut Auftrag; V6+ zu entscheiden |
| **B-5 (neu durch V6′)** | Direktes `delete from public.characters` ∥ `delete_character` desselben Charakters: genau ein 40P01. | **behoben** (Abschnitt 8) |
| RC-Pflicht | Konto-/Charakterlöschung in REPEATABLE READ/SERIALIZABLE bricht vollständig ab (auch GoTrue/Admin, falls dort andere Isolation gesetzt wäre). Nur Datenbanken mit `rwi` (Dev). | mittel; vor Dev-Installation `default_transaction_isolation` (DB + `supabase_auth_admin`) lesend prüfen |
| Groß-/Kleinschreibung | `create_group` speichert Schlüssel unverändert, Bereinigung vergleicht kleingeschrieben – bestand vorher. | niedrig, Vorschlag offen |
| K-e | nur Kommentar, kein Strukturtest | niedrig |
| Nicht geprüft | echte Supabase-Rollen, PostgREST-/GoTrue-Isolation, Produktionsstand von `delete_character`, Advisors | Freigabepunkte |

## 6. Unabhängige Prüfung
- **rw-backend-security:** kein kritischer/hoher Befund. Kein DoS über Beratungssperren (Sperre erst nach Eigentumsprüfung, 64-Bit-Schlüssel, serverseitige IDs). Mittel: RC-Pflicht in Triggern (→ Abschnitt 5), Prüfbericht fehlte (→ dieser Bericht, `LOESCHVORGANG.md`). Niedrig: Testlücke create_character ∥ Admin-Löschung → **behoben (B2-10)**.
- **rw-instanzkampf:** eingefrorene Architektur unberührt, kein Pfad I → A. **Hoch:** V6-11 wäre nach dem Commit/in der flachen CI rot geworden (`git show HEAD`) → **behoben** (Altstand aus Rollback-Datei, zusätzlich Vergleich mit D3-Migration). Niedrig: B-5 → **Test B2-11 + Doku**; schwache Ergebnisprüfungen in B2-3, V6-3, V6-7 → **verschärft**; Groß-/Kleinschreibung, K-e → dokumentiert.
- **rw-qa:** kein kritischer/hoher Befund. Mittel: Position „A vor I“ in `on_profile_deleting` nicht verhaltensgeprüft → **behoben (B2-12, Mutation M12 rot)**; B-5 als Regression → dokumentiert. Niedrig: Pfadfilter CI → **ergänzt**; V6-11 zirkulär → **Vergleich mit D3 ergänzt**; tote Verweise → Verweis auf Zweig in diesem Bericht; Aufräumfehler sichtbar gemacht (dabei Fehler „rename to join“ gefunden und behoben).

## 7. Freigabepunkte für Pascal
1. Commit/Push von PR 1 inkl. B2 (danach CI inkl. `database-pg17`).
2. B-4: V6+ für `save_character`/`move_character` umsetzen?
3. B-5: technisch behoben (Abschnitt 8); Restfall direktes Löschen ∥ Kontolöschung gehört zu B-4.
4. Dev-Installation mit neuem SHA-256 (vorher Isolationsstufe lesend prüfen).
5. Produktionsmigration `migration_b2_loeschreihenfolge.sql` als eigener Schritt (vorher Live-Stand von `delete_character` gegen die Rollback-Fassung prüfen).

## 8. Nachtrag 21.11.2026: PostgreSQL 17 lokal und B-5 technisch abgesichert

### 8.1 PG17-Umgebung
PostgreSQL **17.12** (Server `initdb`/`pg_ctl`/`postgres` aus dem Paket `embedded-postgres-linux-x64-17.12.0-beta.19`, SHA-256 `f9d4f8a4…69ec9`, mit pgcrypto) lokal unter `/usr/lib/postgresql/17` eingerichtet (nur Container, nicht im Repository). Clientprogramme (`psql`, `pgbench`) aus PG 16.15 – mit Server 17 kompatibel. Die Tests wählen die Version über `PG_MAJOR` (kein stilles Ausweichen). Supabase-Ziel: ruinwalk 17.11, ruinwalk-dev 17.12. **Hinweis:** Da jetzt 17 die höchste installierte Version ist, laufen Tests ohne `PG_MAJOR` lokal auf 17; PG16 mit `PG_MAJOR=16`.

### 8.2 Ergebnisse
| Lauf | PG 17.12 | PG 16.15 |
|---|---|---|
| `run-all-db.sh` vor der B-5-Änderung (Stand Abschnitt 1–7) | **ALLES BESTANDEN** (b2-sperren 44/44, Mischung B 278 × B-4) | ALLES BESTANDEN (Abschnitt 3) |
| `run-all-db.sh` nach der B-5-Änderung (31 Suites: run 45, fenster 39, gruppe 157, eventende 32, semantik 27, produktion 222, dev-umgebung 22, konto-integration 63, konto-regel 48, loesch-trigger 59, b2-sperren 46 (vor V6-8c; Endstand 47), installation 273, rechte-audit 29, worker 25, worker-a1 26, stuck 46, hotfix-resume 34, slot3-f9 26, profil-ableitung 33, operatoren 31, operator-edge 34, operator-korrekturen 30, operatoren-limit 13, operatoren-parallel 30, sa-untersuchung 15, diagnose-test 19, k2-compare/nosweep 0 Deadlocks, Dungeon 3/4/5 + Weltboss-Ende ohne Probleme) | **ALLES BESTANDEN** | **ALLES BESTANDEN** |
| Supabase-Schema, Modus neu / legacy | 249/249 · 249/249 | 249/249 · 249/249 |
| Migration/Rollback (V6-11, beide Modi, Rollback = D3-Fassung) | bestanden | bestanden |
| b2-sperren Endstand (mit V6-8c), `B2_MIX=20` | 47/47 | 47/47 |
| b2-sperren, Belastungsmischung je 200 Durchläufe (in run-all-db) | A: 0 × 40P01 · B: 0 außerhalb B-4 (286 × B-4) | A: 0 · B: 0 außerhalb B-4 (245 × B-4) |
| Mutationsproben (PG17), 14 Proben | alle ROT, Dateien per md5 wiederhergestellt | – |

Mutationen neu: **M3** Beratungssperre vor Eigentum/Zeilensperre → B2-11 rot; **M13** ursprüngliches V6′ (Eigentum ohne Zeilensperre) → B2-11 rot (40P01); **M14** Zeilensperre ohne Eigentumsfilter → V6-12/V6-12b rot (fremde Zeile würde gesperrt). Übrige M1–M12 wie Abschnitt 4, alle rot.

### 8.3 B-5-Prüfung am Rechte- und SQL-Modell
**Direkte DELETE-Möglichkeiten auf `public.characters`:**
| Rolle | Recht | Quelle | Einschränkbar? |
|---|---|---|---|
| `anon` | keines | `schema.sql:373` revoke all | – |
| `authenticated` | nur SELECT (RLS `char_own_read`) | `schema.sql:373, 384, 389` | – |
| `service_role` (PostgREST mit Service-Key, Edge Functions) | ALL inkl. DELETE | `schema.sql:380` `grant all on all tables … to service_role` | ja, per `revoke delete` |
| `postgres` (Dashboard Table Editor / SQL-Editor), Tabelleneigentümer | immer (Eigentümer prüft keine GRANTs, kann Trigger abschalten) | Eigentümerschaft | **nein**, nicht per Rechten |
| `supabase_admin` (Superuser) | immer | Plattform | nein |
Code-Aufrufer eines direkten DELETE: **keine** (`index.html` liest nur per REST; Edge Function `operator` und Worker fassen `characters` nicht an). Direkte DELETEs nur in Tests (22 Stellen) und im Betrieb.

**Löschpfade und Sperrfolgen (nach B-5-Anpassung):**
| Pfad | Folge |
|---|---|
| D′ `delete_character` | Pr(ks) → C(for update, eigene Zeile) → A → Löschen (BEFORE `backup_character`: Pr(ks) bereits gehalten) → AFTER `on_character_deleted` (A gehalten) → I |
| D_dir direktes DELETE | C → Pr(ks) (Sicherung) → A (Trigger) → I |
| D `delete_account` | Pr(upd) → U → Pr-Löschung: `on_profile_deleting` A(alle, sortiert) → I → Kaskade C |
| D_adm `delete from auth.users` | U → Pr → A(alle) → I → C |
| J `group_join` / CG `create_group` | A → I bzw. A → 7001 → I (keine Zeilensperre auf `characters`; kein rwi-Code sperrt `characters`-Zeilen) |
| S/M `save`/`move` | C → Pr(ks) |
D′ und D_dir nehmen C jetzt beide vor A → serialisiert an C, kein Zyklus. D′ ↔ D/D_adm bleiben über Pr serialisiert (D′ nimmt Pr(ks) als allererste Sperre). Kein Pfad hält A und wartet danach auf eine `characters`-Zeile außer der Kaskade in D/D_adm, die vorher Pr exklusiv hält (D′ kann dann Pr(ks) nicht erhalten, bevor D fertig ist). J/CG sperren keine Charakterzeilen.

**Bewertete Absicherungen:**
| Option | Ergebnis |
|---|---|
| **a) Sperrreihenfolge in `delete_character`: Zeile (`for update`) vor A** | **umgesetzt.** Beseitigt den Zyklus für alle Rollen (auch Dashboard/postgres), ohne Rechteänderung, ohne neue Fehlercodes. Fremde/fehlende IDs: `for update` mit Filter `account_id = uid` sperrt keine fremde Zeile (V6-12b: gesperrte fremde Zeile → sofort `not_found`, 15 ms). |
| b) `revoke delete on public.characters from service_role` | **nicht umgesetzt.** Wirkt nur gegen PostgREST/Service-Key, nicht gegen Dashboard/postgres; ändert Produktionsrechte (`schema.sql`) ohne Not, da (a) den Deadlock für alle Rollen behebt. Kein Codeaufrufer würde brechen, Betriebs-/Supportlöschungen per Service-Key aber schon. Option für später, wenn direkte Löschungen grundsätzlich unterbunden werden sollen. |
| c) BEFORE-DELETE-Trigger, der direkte Löschungen abweist | **nicht umgesetzt.** Feuert erst nach der Zeilensperre (kein Schutz vor dem Zyklus nötig nach a), bricht Betriebs- und Testlöschungen (22 Stellen), Eigentümer kann ihn abschalten – Funktionsverlust ohne Sicherheitsgewinn. |
| d) Beratungssperre im BEFORE-Trigger | **nicht möglich**: Row-Trigger laufen nach `GetTupleForTrigger` (Zeile schon gesperrt) → gleicher Zyklus. |

**Restfall (unverändert, B-4-Mechanismus):** D_dir ∥ D desselben Kontos (direktes Löschen eines Charakters, während das Konto gelöscht wird): D_dir hält C und braucht Pr(ks) für die Sicherung, D hält Pr(upd) und wartet in der Kaskade auf C → genau ein 40P01 (neuer Test V6-8c, als bekannter Fehler gezählt). Gleicher Mechanismus wie B-4 (C → Pr); laut V6-Analyse bestand er vor B2 („D ↔ D_dir“), gegen den Altstand nicht eigens gemessen. Wird mit V6+ (B-4) mit entschieden; bis dahin Betriebsregel.

### 8.4 Änderungen dieses Nachtrags (exakt)
| Datei | Änderung |
|---|---|
| `supabase/schema.sql` | `delete_character`: `if not exists (…)` ersetzt durch `perform 1 from public.characters where character_id = p_id and account_id = uid for update;` + `if not found then not_found`; Kommentar (Sperrreihenfolge B-2/B-3/B-5) |
| `supabase/migration_b2_loeschreihenfolge.sql` | Funktion identisch zu `schema.sql` (diff leer), Wirkungskommentar ergänzt. Rollback unverändert (= D3-Fassung). |
| `supabase/tests/10_tests.sql` | Reihenfolgeprüfung: key share < `account_id = uid for update` < Beratungssperre < delete |
| `supabase/dev/rollback_dev.sql:168` | Fingerabdruck `delete_character` `2629c6d3…` (V6′-Zwischenstand, nicht committet; Index vor B2: `2befe643…`) → `b294227d6510bfd96be2ce779cf0750d` |
| `server/instance/tests/b2-sperren.mjs` | B2-11 jetzt Regression (beide Reihenfolgen, kein 40P01); V6-12b (gesperrte fremde Zeile); V6-8c (Restfall, bekannt); Mischung V6-13 zusätzlich `delete_character` und direktes DELETE desselben Charakters (D′2, Ddir) |
| `docs/LOESCHVORGANG.md`, `docs/DEV_INSTALLATIONSFREIGABE.md` | Sperrfolge D′, B-5 behoben, Restfall; neuer SHA-256 |

md5: schema `14f34608…`, Migration `8a8bdbe5…`, Test `54f18b62…`, 10_tests `cfadef56…`; 04/05 unverändert (`68831fcb…`, `983479f1…`).
**SHA-256 `install_dev.sql` (Stand Abschnitt 8, überholt; aktuell `5170374fbb9ea58c1f07bac065368e991144916e4fbd267a18a98a5c389f667d`, Abschnitt 11):** `1ac9264d5583e4bc63079e6d0f69a937b4fbf39f932e200db3167a5bc59b92bf` (2139 Zeilen, zwei Builds gleich).

### 8.5 Offene Risiken nach dem Nachtrag
- **B-4** (`delete_account` ∥ save/move) und Restfall **V6-8c** (direktes Löschen ∥ Kontolöschung): offen, gleicher Mechanismus, V6+ zu entscheiden.
- RC-Pflicht in den Triggern (Abschnitt 5) unverändert.
- Abweichung von V6′ wie freigegeben: Eigentumsprüfung ist jetzt eine Zeilensperre vor A. Kein neuer Zyklus gefunden (Analyse 8.3, Tests beider Versionen, Mutationen M3/M13). Nicht erneut durch die drei Reviewer geprüft.
- PG17 lokal mit Server 17.12 aus `embedded-postgres` und psql 16; CI (`database-pg17`, PGDG-Pakete) nicht gelaufen.
- Weiterhin nicht live geprüft: Supabase-Rollen, PostgREST/GoTrue-Isolation, Produktionsstand.

## 9. Unabhängige Prüfung der B-5-Änderung (21.11.2026, nur lesend und testend)

Geprüft in `ruinwalk-pr1` (die Änderung liegt nur dort). Alle drei Prüfer arbeiteten in eigenen Kopien; Original per md5/`git status` unverändert. Keine SQL- oder Codeänderung in diesem Schritt.

### 9.1 Altstand-Nachweis V6-8c (Punkt 4)
Kopie des Arbeitsbaums mit `schema.sql`, `04_gruppe.sql`, `05_produktion.sql` aus dem Index (= Stand vor B2; `schema.sql` identisch mit `main` `c9b351a`, keine einzige `rwi.char`-Beratungssperre). Darauf `b2-sperren.mjs` (`B2_MIX=0`):
| Version | V6-8c (direktes DELETE ∥ `delete_account` desselben Kontos) | B2-11 (direktes DELETE ∥ `delete_character`) |
|---|---|---|
| PG 17.12 Altstand | **genau ein 40P01** (`deadlock detected`) | kein 40P01 (`not_found`) – B-5 bestand vor B2 nicht |
| PG 16.15 Altstand | **genau ein 40P01** | kein 40P01 |
| Endstand (PG17/16) | genau ein 40P01 (unverändert) | kein 40P01 (B-5 behoben) |
**Ergebnis:** V6-8c bestand bereits vor B2 (B-4-Mechanismus C → Pr gegen Pr → C); rw-qa hat das unabhängig bestätigt. B-5 war eine Regression des ursprünglichen V6′ und ist mit der Zeilensperre behoben.

### 9.2 Sperrpfade (Punkte 2 und 3; rw-instanzkampf, rw-backend-security)
Zeilensperren auf `public.characters` gibt es nur in `public.*` (save, move, delete_character, Kaskaden). Kein Fremdschlüssel zeigt auf `characters` (keine KEY-SHARE-Sperren auf C). rwi (`own_character`, `account_of`, `derive_profile`, `profile_of`, `eligible`, `on_profile_deleting`) liest `characters` nur ohne Sperre; Worker, Edge Function `operator`, `commit_round`, Belohnungen, Watchdog und Operatoren schreiben nie nach `public.*`.
| Pfad | Folge | Zyklus mit C → A? | Beleg |
|---|---|---|---|
| D′ `delete_character` | RC → Pr(ks) → C(eigene) → A → Löschen → Trigger A (gehalten) → I | – | – |
| D `delete_account` | Pr(upd) → A(alle) → I → Kaskade C (**A → C**) | nein: Pr-Tor (D hält Pr exklusiv; D′ wartet an Pr, bevor es C nimmt) | Probe R1, GP-1/V6-1, V6-2 |
| D_adm `delete from auth.users` | U → Pr → A(alle) → I → C (**A → C**) | nein: Pr-Tor | R1 admin, V6-3 beide |
| J `group_join` | Eigentum lesen → A → I → 7002 | nein (keine C-/Pr-Sperre) | R2, B2-2, B2-3 |
| P Nachrücken | I → 7002 | nein | K1-9g1–g3 |
| CG `create_group` | A(sortiert) → 7001 → I → 7002 | nein (keine C-Sperre) | R3, B2-8 |
| `on_character_deleted` | (C gehalten) → A → I | nein | B2-9, B2-11 |
| D_dir direktes DELETE | C → Pr(ks) → A → I | nein gegen D′ (beide C vor A) | B2-11 beide |
| D′ ∥ D′ gleicher Charakter | jetzt an C serialisiert | nein | R4, QA-3 (0 × 40P01) |
| S `save_character` | C → Pr(ks) | nein gegen D′ (ks ∥ ks verträglich); B-4 gegen D bleibt | V6-7 |
| M `move_character` | C → Eindeutigkeit → Pr(ks) | nein | R5, V6-7 |
| `create_character` | Pr(ks, FK) → neue C | nein | B2-10 |
| Worker/commit/Belohnung/Operatoren/Watchdog | nur rwi | nein | k2-compare 0 Deadlocks |
Gezielt **C → A gegen A → C**: Die einzigen A → C-Pfade sind die Kaskaden in D/D_adm; beide halten Pr exklusiv, D′ nimmt Pr(ks) zuerst → serialisiert. D_dir hält kein Pr vor C; gegen D gibt es den alten Fall V6-8c (9.1), gegen D′ keinen Zyklus. **Kein neuer Deadlock-Zyklus.** Mutationsbeleg für die Torregel: Profilsperre entfernt oder nach C → R1 2 × 40P01, b2-sperren 7 rot, 10_tests rot.

### 9.3 V5/V6′-Garantien und Regression (Punkt 5)
B-2 geschlossen (INV-1 = 0 in allen Läufen), B-3 (D′ ∥ D) ohne Deadlock, K-a/K-b/K-e unverändert, K-c (RC vor jeder Sperre), K-d (Sperre nur auf eigene Zeile; Filter im Scan vor dem Sperrschritt, auch bei gehaltener fremder Zeile per UPDATE/DELETE/FOR UPDATE/KEY SHARE, fremder Beratungs- und Profilsperre: `not_found` nach 13–20 ms). Rechte, SECURITY DEFINER, search_path, Fehlercodes (PT401/PT404/25000, anon 42501) unverändert; `account_id` unveränderlich (`guard_character`). Abweichung von V6′ ist die Zeilensperre vor A – durch die Torregel abgedeckt.
| Lauf (Prüfer) | Ergebnis |
|---|---|
| `run-all-db.sh` PG17, B2_MIX=200 (rw-qa, rw-instanzkampf je eigene Kopie) | alle 31 Instanzkampf-Suites grün; `supabase-schema` in der Kopie nur wegen Dateirechten im Scratchpad nicht startbar → nachgeholt |
| `supabase/tests/run.sh` PG17 und PG16, beide Modi (alle drei Prüfer) | 249/249 × 4 |
| b2-sperren 3 × B2_MIX=50 je PG17/PG16 (Flackerprobe, rw-qa) | 47/47 × 6, kein Flackern |
| Mischung 200 (rw-qa PG17) | A: 0 × 40P01; B: 0 außerhalb B-4 (273 × B-4) |
| Engine golden/combat/struktur/trennung/offen, Determinismus Node/Bun | grün, identisch |
| Manifest, Migration = schema, Rollback = D3, md5, SHA-256 `1ac9264d…92bf` (Stand Abschnitt 9, inzwischen überholt) | alles stimmig |
| Eigene Proben: rev-sec 24/24, rev-b5 7/7 (PG17+16), QA-3 (40 × drei gleichzeitige `delete_character`) 0 × 40P01 | grün |
**Mutationen der Prüfer:** rot: Filter `account_id` entfernt, Zeilensperre nach A, zurück zu V6′, Eigentum entfernt, `skip locked`/`nowait`, Profilsperre entfernt/nach C, Beratungssperre entfernt. **Überlebt in b2-sperren:** `for share` und `for key share` (nur 10_tests und QA-3 rot: 28 bzw. 32 × 40P01), `for no key update` (fachlich gleichwertig, kein FK auf `characters`).

### 9.4 Befunde der Prüfer
| Schwere | Befund | Prüfer | Behandlung |
|---|---|---|---|
| mittel (Doku) | Globale Ordnung Pr < A < I < C gilt nicht mehr; Sicherheit beruht auf der Pr-Torregel | rw-instanzkampf, rw-qa | Abschnitt 1 ersetzt; `LOESCHVORGANG.md` und SQL-Kommentar **erledigt in Abschnitt 10** |
| mittel (Test) | Kein Verhaltenstest für zweimal gleichzeitiges `delete_character` desselben Charakters; `for share`/`for key share` überleben b2-sperren | rw-qa | **erledigt in Abschnitt 10** (V6-14a/b) |
| niedrig | V6-8c prüft keinen Endzustand (gemessen: Opfer ist die Kontolöschung, Charakter gelöscht, Konto bleibt) | rw-qa | **erledigt in Abschnitt 10** |
| niedrig (vor B-5 vorhanden, entstanden mit V5/B2) | Direktes DELETE mehrerer Zeilen bzw. Admin-Löschung mehrerer Konten ∥ `create_group`: A in Zeilen- statt sortierter Reihenfolge → 40P01 (zwei Charaktere eines Kontos reproduziert, PG16/17; mehrere Konten nur analysiert). D′ nicht beteiligt | rw-instanzkampf | Betriebsregel oder mit V6+/B-4 lösen |
| niedrig | Textprüfung in 10_tests allein schwach; Verhalten durch B2-11/V6-12b belegt | rw-backend-security | – |
| Hinweis | `docs/B2_V6_PRUEFUNG.md` fehlt in diesem Zweig (liegt auf `ccr-2e014f58-1i6nm4`) | rw-qa | **erledigt:** feste Raw-Links im Kopf dieses Berichts (Commits `b6bc3c5`, `2581c57`, `de37014`) |
| Hinweis | Bericht 8.2/8.4 Kleinigkeiten (46 → 47, alter Fingerabdruck) | rw-qa | korrigiert |
| info | D′ hält die eigene Zeile, während es auf A wartet (A nur kurz durch J/CG belegt) | rw-instanzkampf, rw-backend-security | unkritisch |
Kritische oder hohe Befunde: **keine**. Voten: rw-backend-security **freigabefähig ja**; rw-instanzkampf **freigabefähig, mit Doku-Auflage**; rw-qa **freigabefähig** (Testlücke vor Commit nachziehen empfohlen).

### 9.5 Entscheidung
**B-5 ist freigabefähig.** Kein neuer Deadlock-Zyklus (Analyse aller Pfade + Proben + Mutationen), keine verletzte V5/V6′-Garantie, alle Regressionen grün auf PG17 und PG16; V6-8c bestand nachweislich vor B2. Vor dem Commit empfohlen (eigener Auftrag, Codeänderung): QA-3 übernehmen, V6-8c-Endzustand prüfen, Kommentar in `delete_character` und `LOESCHVORGANG.md:17` auf die Pr-Torregel umstellen.

## 10. Nacharbeiten aus Abschnitt 9 (21.11.2026)
Umfang laut Auftrag: nur die drei offenen Nacharbeiten. Keine Architektur-, Rechte- oder Funktionsänderung; der Funktionstext von `delete_character` ist unverändert (Manifest-Fingerabdruck weiterhin `b294227d6510bfd96be2ce779cf0750d`, Migration = `schema.sql`, diff leer). B-4 nicht umgesetzt.

### 10.1 Neue bzw. erweiterte Tests (`server/instance/tests/b2-sperren.mjs`)
- **V6-14a (gesteuert, aus QA-Probe abgeleitet):** Die Beratungssperre A(X) wird von einer Fremdsitzung gehalten; dann starten drei `delete_character(X)` desselben Kontos. Gefordert: erster wartet auf A (`Lock:advisory`), **zweiter und dritter warten an der Charakterzeile** (`Lock:transactionid|tuple`), nach Freigabe 0 × 40P01, genau ein Erfolg, zwei `not_found`, Charakter gelöscht, INV-1 = 0. Deterministisch: mit einer nicht exklusiven Zeilensperre erhalten alle drei die Zeile und warten auf A → der Gewinner verklemmt sich beim Löschen.
- **V6-14b (ungesteuert, QA-3 übernommen):** `B2_DOPPEL` (Standard 40) Durchläufe mit je drei gleichzeitigen `delete_character` desselben Charakters, jeder zweite Charakter in einer Instanz. Gefordert: 0 × 40P01, je genau ein Erfolg, Rest `not_found`, INV-1 = 0.
- **V6-8c (Endzustand):** zusätzlich geprüft: Ergebnis der Kontolöschung (Erfolg oder 40P01), Konto (`auth.users`), Profil, Charakter X (direkt gelöscht) und zweiter Charakter Y. Zulässig sind nur die zwei atomaren Endzustände: Opfer Kontolöschung → Konto, Profil und Y bestehen, X gelöscht, direktes DELETE erfolgreich; Opfer direktes DELETE → Kontolöschung erfolgreich, Konto, Profil, X und Y gelöscht. Jede andere Kombination ist rot. Gemessen in allen Läufen (PG16/17): **Opfer Kontolöschung**, Konto = 1, Profil = 1, X = 0, Y = 1.

### 10.2 Doku und SQL-Kommentar
- `supabase/schema.sql` (Kommentar vor `delete_character`, Z. 340–346) und `supabase/migration_b2_loeschreihenfolge.sql` (Kopfkommentar Z. 7–8): Pr-Torregel im Wortlaut von Abschnitt 1, ausdrücklich „DIE PROFILSPERRE MUSS DIE ERSTE SPERRE BLEIBEN“. Nur Kommentare außerhalb des Funktionstexts.
- `docs/LOESCHVORGANG.md:17–18`: „Global gilt: Pr < A < I < C“ ersetzt durch Abkürzungen und die Pr-Torregel wie Abschnitt 1.

### 10.3 Testergebnisse
| Lauf | PG 17.12 | PG 16.15 |
|---|---|---|
| `run-all-db.sh` (31 Suites, b2-sperren mit `B2_MIX=200`) | **ALLES BESTANDEN**; b2-sperren **49/49**, installation 273, produktion 222, loesch-trigger 59 | **ALLES BESTANDEN**; b2-sperren **49/49**, installation 273, produktion 222, loesch-trigger 59 |
| Supabase-Schema, Modus neu / legacy | 249/249 · 249/249 | 249/249 · 249/249 |
| V6-14b (40 × 3) | 0 × 40P01 | 0 × 40P01 |
| Mischung V6-13 | A: 0 × 40P01; B: 0 außerhalb B-4 (256 × B-4) | A: 0; B: 0 außerhalb B-4 (257 × B-4) |
| Bekannte Fehler bestätigt | B-4 save, B-4 move, B-4 Mischung, B-4c (V6-8c) | gleich |

### 10.4 Mutationsnachweise (nur `schema.sql` mutiert, danach per md5 wiederhergestellt: OK)
| Mutation | PG17 | PG16 | Nachweis |
|---|---|---|---|
| M15 `for share` statt `for update` | **ROT** (4 Tests) | **ROT** (4) | V6-14a: zweiter/dritter warten auf A statt an der Zeile, beide 40P01; V6-14b: 56–62 × 40P01 in 40 Durchläufen |
| M16 `for key share` statt `for update` | **ROT** (4) | **ROT** (4) | wie M15 (V6-14a 2 × 40P01, V6-14b ≥ 28 abweichende Durchläufe) |
| M3 A vor der Zeilensperre | ROT (7) | ROT (6) | B2-11, V6-14a |
| M13 ursprüngliches V6′ (ohne Zeilensperre) | ROT (5) | ROT (6) | B2-11, V6-14a |
| M17 `for no key update` (Information) | nur V6-11 rot (Migration ≠ schema, Folge der einseitigen Mutation) | ebenso | verhaltensgleich, da kein Fremdschlüssel auf `characters` zeigt (wie rw-qa); kein Befund |
`for share` und `for key share` werden damit **verhaltensbasiert und zuverlässig** erkannt (vorher nur über die Textprüfung in `10_tests.sql`).

### 10.5 Dateideltas dieses Schritts
| Datei | Delta |
|---|---|
| `server/instance/tests/b2-sperren.mjs` | +38/−3 (477 Z.): V6-8c Endzustand (Z. 260–276), V6-14a/b (Z. ~278–310), Kopfzeile |
| `supabase/schema.sql` | Kommentar vor `delete_character` neu gefasst (7 statt 6 Zeilen), Funktion unverändert |
| `supabase/migration_b2_loeschreihenfolge.sql` | +2 Kommentarzeilen (30 Z.), Funktion unverändert |
| `docs/LOESCHVORGANG.md` | Z. 17–18 Pr-Torregel |
| `docs/B2_PRUEFBERICHT.md` | Abschnitt 9.4 Status, Abschnitt 10 |
md5: schema `56db7581…`, Migration `1b41ae63…`, Test `85802642…`, LOESCHVORGANG `1012ab11…`; 04/05 unverändert.

**SHA-256 `install_dev.sql` neu (Stand Abschnitt 10, überholt; aktuell Abschnitt 12):** `5170374fbb9ea58c1f07bac065368e991144916e4fbd267a18a98a5c389f667d` (2140 Zeilen, zwei Builds gleich; geändert nur durch die Kommentarzeilen in `schema.sql`). → in `docs/DEV_INSTALLATIONSFREIGABE.md` nachgetragen (Abschnitt 11).

### 10.6 Stand
Alle drei Nacharbeiten aus Abschnitt 9 erledigt, keine Testabschwächung. B-5 bleibt freigabefähig. Offen unverändert: B-4 inkl. V6-8c (V6+), Mehrzeilen-DELETE/Admin-Löschung mehrerer Konten ∥ `create_group` (Betriebsregel oder mit V6+), RC-Pflicht vor Dev-Installation prüfen, Commit/Push, Dev-Installation, Produktionsmigration.

## 11. Dokumentationsabschluss vor der PR-1-Freigabe (21.11.2026)
Keine SQL-, Funktions- oder Teständerung in diesem Schritt.

### 11.1 Maßgebliche Prüfsumme
`install_dev.sql` aus dem aktuellen Build (`bash supabase/dev/build.sh`, zweimal erzeugt, byte-gleich, 2140 Zeilen):
**SHA-256 `5170374fbb9ea58c1f07bac065368e991144916e4fbd267a18a98a5c389f667d`** (Stand Abschnitt 11, überholt durch Abschnitt 12)
Eingetragen im Kopf von `docs/DEV_INSTALLATIONSFREIGABE.md` als einziger maßgeblicher Hash. Alle früheren Werte (`447b53c0…`, `33c2d0e9…`, `8a8c3d74…946fb`, `2206042d…adebf3`, `52303b15…ec506e8`, `1ac9264d…92bf`) sind in `DEV_INSTALLATIONSFREIGABE.md`, `K6_PARALLELITAET_NACHKORREKTUR.md` und diesem Bericht ausdrücklich als „überholt“/„damals“ gekennzeichnet; die Bedienanleitung (Schritt 5) verweist auf den Kopf statt auf einen festen alten Wert. Prüfung: kein früherer Hash steht mehr ohne Kennzeichnung in `docs/*.md` (grep: 0 Treffer). `install_dev.sh` enthält keinen fest eingetragenen Hash (Wert wird beim Aufruf übergeben).

### 11.2 Betriebsregel B-6 (Mehrzeilen-Löschungen ∥ `create_group`)
In `docs/LOESCHVORGANG.md` ergänzt: Ursache (A in Zeilenreihenfolge gegen sortierte A in `create_group`), reproduzierter Fall (rw-instanzkampf R6: `delete from public.characters where account_id = <K>` mit zwei Charakteren ∥ `create_group` mit beiden → genau ein 40P01, PG16/17, atomar), analysierter Fall (Löschung mehrerer Konten in einer Anweisung, z. B. `cleanup_test_accounts.sql`), nicht betroffene Pfade (`delete_character`, `delete_account`, Löschung eines Kontos) und die geltende Einschränkung: keine Mehrzeilen-DELETEs auf `characters`, Konten einzeln löschen, Mehrkonten-Bereinigung nur bei angehaltener Gruppenbildung, bei 40P01 wiederholen. Entstanden mit den Beratungssperren aus V5/B2 (vor B2 nahm `create_group` keine Beratungssperren), unabhängig von B-5. Technische Lösung offen.

### 11.3 Konsistenzprüfung der Artefakte
| Prüfung | Ergebnis |
|---|---|
| Manifest neu erzeugt (`rollback-manifest.mjs`) gegen `supabase/dev/rollback_dev.sql` | 146 Einträge, **0 fehlend, 0 abweichend**; `delete_character` = `b294227d6510bfd96be2ce779cf0750d` |
| `delete_character` in Migration = `schema.sql` | identisch |
| Rollback-Fassung = `migration_d3_konto_loeschen.sql` = `main` (`c9b351a`) | identisch |
| `install_dev.sql` enthält `schema.sql`, `01_proto.sql`, `05_produktion.sql` byte-genau | ja |
| Pfadverweise in `LOESCHVORGANG.md`, `B2_PRUEFBERICHT.md`, `DEV_INSTALLATIONSFREIGABE.md` | alle vorhanden außer `install_dev.sql` (erzeugte Datei, bewusst nicht im Repository); die drei B2-Analysen sind über feste Raw-Links (Kopf dieses Berichts) referenziert – **erledigt** |

### 11.4 Tests dieses Schritts (gezielt, keine volle Matrix)
| Test | Ergebnis |
|---|---|
| `installation.mjs` (Installation, Rollback, Manifest, Wrapper) PG17 | 273/273 |
| `supabase/tests/run.sh` PG17 / PG16, Modus neu und legacy | 249/249 × 4 |
| `rechte-audit.mjs` PG17 | 29/29 |
| `.claude/tests/team-check.js` (KI-Team-/Doku-Struktur) | 522/522 |
| Hash-Gegenprobe (zwei Builds) | gleich `5170374f…389f667d` (Stand Abschnitt 11, überholt) |
Letzte volle Matrix (Abschnitt 10.3): PG17 und PG16 alles bestanden; seitdem nur Dokumentation geändert.

### 11.5 Status aller offenen Befunde
| Befund | Status |
|---|---|
| B-2 (Beitritt ∥ Charakterlöschung) | behoben (V5) |
| B-2b (`create_group`) | behoben |
| B-3 (Charakter- ∥ Kontolöschung) | behoben (V6′) |
| B-5 (direktes DELETE ∥ `delete_character`) | behoben, unabhängig geprüft, freigabefähig (Abschnitte 8–10) |
| B-4 (`delete_account` ∥ save/move) | **behoben** (Nachtrag 22.11.2026, `docs/B4_BERICHT.md`: Profilsperre zuerst in save/move) |
| B-4c / V6-8c (direktes DELETE ∥ `delete_account`) | **offen**, per RPC nicht lösbar, Betriebsregel; bekannter Fehler in den Tests, atomar |
| B-6 (Mehrzeilen-DELETE / Mehrkonten-Löschung ∥ `create_group`) | **offen**, Betriebsregel in `LOESCHVORGANG.md` |
| RC-Pflicht in den Triggern | offen: vor Dev-Installation `default_transaction_isolation` (DB, `supabase_auth_admin`) lesend prüfen |
| Groß-/Kleinschreibung der Spielerschlüssel in `create_group` | offen (bestand vorher), niedrig |
| K-e nur als Kommentar | offen, niedrig |
| Testlücken QA (Doppel-/Dreifachlöschung, V6-8c-Endzustand) | erledigt (Abschnitt 10) |
| Doku Pr-Torregel | erledigt (Abschnitt 10) |
| Veraltete Prüfsummen in der Doku | erledigt (11.1) |
| Verweise auf B2-Analysen anderer Zweig | erledigt (feste Raw-Links im Kopf) |
| Nicht live geprüft (Supabase-Rollen, PostgREST/GoTrue, Produktionsstand, CI `database-pg17`) | offen |

### 11.6 Freigabepunkte für Pascal
1. Commit/Push von PR 1 (danach CI inkl. `database-pg17` auf PGDG-Paketen).
2. B-4/V6-8c/B-6: V6+ bzw. technische Lösung beauftragen oder Betriebsregeln bestätigen.
3. Dev-Installation mit dem Hash aus Abschnitt 12 (vorher Isolationsstufe lesend prüfen).
4. Produktionsmigration `migration_b2_loeschreihenfolge.sql` als eigener Schritt (vorher Live-Stand von `delete_character` gegen die Rollback-Fassung prüfen).

## 12. Integrationsabschluss PR 1 (21.11.2026)
**Referenzen:** Die drei B2-Grundlagen sind im Kopf über unveränderliche Raw-Links eingebunden (Commits `b6bc3c5…`, `2581c57…`, `de37014…`, lokal per `git cat-file` bestätigt). Code-Kommentare in `04_gruppe.sql:180`, `05_produktion.sql:50`, `10_tests.sql:515`, `b2-sperren.mjs:1`, Migration Z. 1 nennen weiter `docs/B2_V6_PRUEFUNG.md` (kein Laufzeiteffekt; Nachpflege durch rw-projektpflege).

**Blocker-Prüfung** (rw-architekt, rw-backend-security, rw-instanzkampf, rw-qa; nur gezielt, vorhandene Ergebnisse genutzt):
| Befund | Prüfer | Behandlung |
|---|---|---|
| **K.2-Verstoß:** `rwi.terminate_stuck` (`04_gruppe.sql`) prüfte nach der Instanzsperre nur `status`, nicht `ends_at`; ein stuck-Weltboss nach Eventende wurde `aborted` statt `event_ended` (K.3 „ends_at schlägt alles“, A.6.4) | rw-instanzkampf | **behoben:** Prüfung `clock_timestamp() >= ends_at` → `end_instance` + `sweep_event` → `event_ended`, wörtlich wie `rwi.leave`. Test `stuck.mjs` Abschnitt 10 (Weltboss stuck, ends_at vorbei, Watchdog noch nicht gelaufen). **Mutationsprobe:** alte Fassung → `terminated / aborted`, Test rot. Manifest `terminate_stuck` `97998765…` → `8a49dc11de62381c5d46a639d845fff7` (`rollback_dev.sql:153`) |
| Commit-Umfang: Index ≠ Arbeitsbaum; `b2-sperren.mjs` und B2-Dateien ungetrackt, aber von CI/`run-all-db.sh` referenziert | alle vier | **Bedingung für den Commit:** gesamten Arbeitsbaum übernehmen (`git add` der 4 neuen und aller geänderten Dateien), danach `git status` ohne `??` und ohne ungestagte Änderungen |
| `supabase/config.toml` mit `[functions.operator]`: bei aktiver Supabase-GitHub-Integration „Deploy to production“ würde ein Merge auf `main` die Edge Function automatisch bereitstellen | rw-backend-security | **vor dem Merge prüfen (Pascal, Dashboard):** Integration für `malbiahllucctiafzydv` aus → kein Blocker; sonst `config.toml` aus PR 1 nehmen. Kein Workflow deployt |
| Kein `schema.sql`-Unterschied außer `delete_character`; Client-RPCs unverändert; keine Secrets; `a-k1.mjs`/`docs/quests/` nicht enthalten; Fast-Forward auf `main` ohne Konflikt; Phase 2 gesperrt; Rechteklassen vollständig | alle | kein Blocker |
| Nach dem Merge weicht `schema.sql` vom Live-Stand ab, bis die B2-Migration freigegeben ist | rw-architekt | in PR-Beschreibung nennen |
| CI: md5-Schritt ohne `pipefail`, keine `timeout-minutes`, `pages.yml` deployt ohne auf Tests zu warten; `.gitignore` ohne `install_dev.sql`/`results/` | rw-qa, rw-architekt | nicht blockierend, Folgeaufgaben |
| V2 A.5/A.6.3 widersprechen dem stuck-Beschluss (offene Frage 14); D1 (Belohnungsfolge `technical_end`) offen | rw-instanzkampf | dokumentiert, Phase 1 zulässig |

**CI-Schritte lokal** (GitHub-CI erst nach Push, Freigabe nötig):
| Schritt | Ergebnis |
|---|---|
| pages-positivliste (`site.test.mjs`, `site.mjs pruefen`) | 19/19; 815 Dateien freigegeben |
| determinism Node+Bun, `operator-index.bun.mjs`, golden/combat/struktur/trennung/offen | gleicher Digest; 9/9; 12/12, 38, 57, 12, ok |
| Deno (`deno check`, Deno-Determinismus) | lokal nicht möglich (nicht installiert) |
| Reproduzierbarkeit `run-dungeon --seed 3` × 2, PG16 und PG17 | md5 gleich (`642ea1ef…`) |
| `npm test` | 229/229 |
| Nach der K.2-Korrektur, PG17 und PG16: stuck 49, hotfix-resume 34, operatoren 31, operator-edge 34, operator-korrekturen 30, operatoren-limit 13, operatoren-parallel 30, eventende 32, installation 273, rechte-audit 29 | alle bestanden, 0 fehlgeschlagen |
| Manifest neu erzeugt gegen `rollback_dev.sql` | 146/146, 0 fehlend |

**SHA-256 `install_dev.sql` (Stand PR 1, überholt durch B-4; aktuell siehe Kopf von `docs/DEV_INSTALLATIONSFREIGABE.md`):** `5fa6b99fe4bb6a5065b4c2eb52e5140703ac42b0b7abaec66540cff273a7e1e3` (2142 Zeilen, zwei Builds gleich). Eingetragen im Kopf von `docs/DEV_INSTALLATIONSFREIGABE.md`; `5170374f…` ist überholt.

**Bekannte Restfehler (blockieren PR 1 nicht):** B-4 und V6-8c (genau ein 40P01, atomar, getrennt gezählt), B-6 (Betriebsregel), RC-Pflicht vor Dev-Installation prüfen, Groß-/Kleinschreibung in `create_group`, K-e nur Kommentar, CI `database-pg17` noch nie auf GitHub gelaufen, nicht live geprüft (Supabase-Rollen, PostgREST/GoTrue, Produktionsstand).

## 13. Nachtrag B-4 (22.11.2026)
B-4 ist behoben (`docs/B4_BERICHT.md`, Zweig `fix/b4-speichern-kontoloeschung`): `save_character`/`move_character` nehmen das eigene Profil (for key share) als erste Sperre. Aussagen in den Abschnitten 1–12, die B-4 als offen oder als „bekannten Fehler“ zählen, gelten für den Stand vor diesem Nachtrag. Offen bleiben **B-4c/V6-8c** (direktes DELETE ∥ `delete_account`, Betriebsregel) und **B-6** (Mehrzeilen-Löschungen ∥ `create_group`, Betriebsregel), siehe `docs/LOESCHVORGANG.md`.

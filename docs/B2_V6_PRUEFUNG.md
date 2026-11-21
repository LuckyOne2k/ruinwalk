# V6 als Lösung für B-2 und B-3 – Prüfung (21.11.2026)

> Nur lesende Prüfung. Committet wird ausschließlich dieser Bericht (Arbeitszweig `ccr-2e014f58-1i6nm4`). Keine Implementierung, keine Test-, Code-, SQL- oder Workflow-Änderung, keine Datenbankaktion, keine Installation.
> Grundlage: `docs/B2_ANALYSE_BEITRITT_CHARAKTERLOESCHUNG.md` (`b6bc3c5`, V5/V6), `docs/B2_V5_GEGENPRUEFUNG.md` (`2581c57`, G-1 bis G-7, GP-1 bis GP-6).
> Code: `/home/user/ruinwalk-pr1` (`schema:Zeile` = `supabase/schema.sql`, `0X:Zeile` = `server/instance/sql/0X_*.sql`). PostgreSQL-Quellen (REL_16_STABLE, github.com/postgres/postgres): `src/backend/commands/trigger.c`, `src/backend/utils/adt/ri_triggers.c`, `src/backend/utils/adt/lockfuncs.c`.

## 1. Ergebnis

- **Empfehlung: V5 (mit den Korrekturen K-a bis K-e aus der Gegenprüfung) + V6 in angepasster Form („V6′“).** Damit sind B-2 und B-3 geschlossen, ohne neuen Deadlock-Zyklus zwischen D, D′, J, P, S, M und CG.
- **V6 in der Form der Gegenprüfung („A vor dem Löschen“) reicht nicht.** Grund: Der Sicherungs-Trigger `backup_character` schreibt beim Löschen in `character_backups`; die Fremdschlüssel-Prüfung sperrt dabei die **Profilzeile** (`FOR KEY SHARE`). `delete_account` hält genau diese Zeile `FOR UPDATE`. Deshalb muss `delete_character` die Profilzeile **zuerst** sperren.
- **V6′ für `public.delete_character`:** (1) Profilzeile `for key share` → (2) Eigentum lesen → (3) Beratungssperre A(X) → (4) `delete from characters` (Trigger wie bisher). `delete_account` und alle `rwi`-Teile bleiben wie in V5.
- **Korrektur einer früheren Aussage:** Die Gegenprüfung (G-5) behauptete, ohne V5 verklemmten sich `delete_character` und `delete_account` desselben Kontos nur bei Instanzbezug. Das ist **falsch**: Über die Profilsperre des Sicherungs-Triggers entsteht der Zyklus **schon heute bei jedem Charakter** (Abschnitt 3). V5 erweitert B-3 also nicht; B-3 war von Anfang an breiter dokumentiert als nötig.
- **Neuer Befund B-4 (bestehend):** Dasselbe Muster besteht zwischen `delete_account` und `save_character` (wenn eine Sicherung geschrieben wird) bzw. `move_character` (Audit-Eintrag). V6′ behebt B-4 nicht. Eine Erweiterung „V6+“ (Profilsperre zuerst auch in `save_character` und `move_character`) behebt B-4 ohne neue Zyklen; eigene Entscheidung.
- V6′ ändert eine **`public`-Funktion** aus `supabase/schema.sql` → Produktion betroffen: eigene Migration mit Rollback nach Skill `ruinwalk-db-aenderung`, Tests in beiden Rechte-Modi, Prüfung des Produktionsstands, ausdrückliche Freigabe.

## 2. Aufruf- und Triggerpfade (Punkt 1)

| Weg | Einstieg | Ablauf | Beleg |
|---|---|---|---|
| D′ | `public.delete_character(p_id)` (RPC, `authenticated`, `schema:385`), aufgerufen aus `index.html` | Delete C → BEFORE-Trigger `characters_backup_del` → `backup_character` (bei vorhandenem Profil: Einfügen in `character_backups`) → AFTER-Trigger `characters_rwi_cleanup` → `rwi.on_character_deleted` → Audit-Eintrag → `purge_account_backups` | `schema:340–349`, `schema:150–168`, `05:202–227` |
| D | `public.delete_account(p_confirm)` (RPC, `schema:389`), aus `index.html` | Profil `for update` → Zahlungen/Audit → `delete from auth.users` → Kaskade `profiles` (BEFORE `rwi.on_profile_deleting`) → Kaskade `characters` (BEFORE `backup_character`: kein Profil mehr sichtbar → keine Sicherung, `schema:152`; AFTER `on_character_deleted`) → AFTER `on_profile_deleted` | `schema:221–247`, `05:232–249` |
| D_adm | Löschen eines Nutzers über Supabase Auth (Admin/Dashboard) bzw. `cleanup_test_accounts.sql` (nur Dev) | direkt `delete from auth.users` → Kaskade wie D, aber **ohne** vorherige Profilsperre `for update` | `supabase/dev/cleanup_test_accounts.sql:31`, `schema:16` |
| D_dir | direktes `delete from public.characters` durch `service_role`/`postgres` | wie D′ ohne Audit/Purge | kein Code-Aufrufer gefunden; nur Betrieb |

Weitere Lösch- oder Aufrufstellen: keine im Code (Suche über `*.sql`, `*.js`, `*.mjs`, `*.ts`, `*.html`; Treffer nur Migration/Rollback D3 und Manifest `rollback_dev.sql:167–168`).

## 3. Warum V6 „A vor dem Löschen“ nicht genügt (Beleg)

1. **BEFORE-DELETE-Trigger sperren die Zeile vor dem Trigger:** `trigger.c` (REL_16_STABLE, `ExecBRDeleteTrigger`, ca. Z. 2735) ruft `GetTupleForTrigger(…, LockTupleExclusive, …)` auf, bevor die Triggerfunktion läuft. D′ hält also C(X) exklusiv, wenn `backup_character` startet.
2. **Fremdschlüssel-Prüfung sperrt die Profilzeile:** `backup_character` fügt in `character_backups` ein (`schema:155`); `character_backups.account_id` verweist auf `profiles` (`schema:64`). Die RI-Prüfung führt `… FOR KEY SHARE OF x` aus (`ri_triggers.c`, ca. Z. 417). Dasselbe gilt für den Audit-Eintrag (`audit_log.account_id`, `schema:75`).
3. **`delete_account` hält die Profilzeile `FOR UPDATE`** (`schema:226`); `FOR KEY SHARE` und `FOR UPDATE` schließen sich aus.

**Zwei-Transaktions-Szenario (heutiger Code, ohne V5/V6):**

| Schritt | T1 = `delete_account` (Konto K) | T2 = `delete_character` (X von K, X ohne Instanz) |
|---|---|---|
| 1 | Profil(K) `for update` (`schema:226`) | – |
| 2 | – | Delete C(X): Zeile exklusiv gesperrt (Schritt 1 oben) |
| 3 | – | `backup_character` → Einfügen in `character_backups` → wartet auf `FOR KEY SHARE` Profil(K) (T1) |
| 4 | Kaskade erreicht `characters` → wartet auf C(X) (T2) | – |
| → | **Deadlock** | |

Folge: B-3 besteht heute für **jeden** Charakter des Kontos (Zeitfenster: T1 hat das Profil gesperrt, bevor T2 seine Sicherung geschrieben hat). Die Instanzsperre ist nur ein zweiter möglicher Wartepunkt. Mit V6 „A vor dem Löschen“ würde T2 in Schritt 2 vorher A(X) nehmen; T1 nimmt A(X) erst in `on_profile_deleting` (nach dem Profil) – der Zyklus über das Profil bliebe bestehen.

## 4. V6′: Ablauf und Sperrfolgen (Punkte 2–4)

### 4.1 V6′ für `public.delete_character` (Plan)
1. `perform 1 from public.profiles where account_id = uid for key share;` – erste Sperre; schließt sich mit `delete_account`/`D_adm` aus, verträgt sich mit allen anderen (auch `touch_login`, das `FOR NO KEY UPDATE` nimmt, `schema:192`).
2. Eigentum lesen: `if not exists (select 1 from public.characters where character_id = p_id and account_id = uid) then raise 'not_found'` (ohne Sperre).
3. `perform pg_advisory_xact_lock(<Schlüssel A(p_id)>)` – identischer Schlüssel wie in `rwi` (V5).
4. `delete from public.characters where character_id = p_id and account_id = uid;` (wie bisher; findet nichts → `not_found`). Trigger wie bisher: `backup_character` (Profilsperre bereits gehalten), `on_character_deleted` (A wiedereintrittsfähig, dann Instanzen aufsteigend).
5. Audit, `purge_account_backups` wie bisher.

Damit gilt für D′: **Pr(ks) → A → C → I**. Unverändert bleiben `delete_account`, `save_character`, `move_character`, `create_character` und alle `rwi`-Teile aus V5.

### 4.2 Sperrfolgen aller Abläufe mit V5 + V6′

Globale Ordnung: **Profil (Pr) < Beratungssperre A < Instanz I < Charakter C**; danach K (7002) bzw. 7001.

| Ablauf | Reihenfolge | ordnungstreu? |
|---|---|---|
| D′ (V6′) | Pr(ks) → A(X) → C(X) → I (aufsteigend) | ja |
| D | Pr(upd) → U → A(alle, sortiert, K-a) → I (aufsteigend) → C(alle) | ja (U nur hier und in D_adm) |
| D_adm | U → Pr (Löschsperre) → A(alle) → I → C | ja (Pr vor A) |
| J (V5, K-b) | [Eigentum lesen] → A(W) → I → K | ja |
| P | I → K | ja |
| CG (V5, K-a) | A(sortiert) → 7001 → neue I → K | ja |
| create_character | Pr(ks, FK) → C(neu) | ja |
| S `save_character` | C → Pr(ks, nur wenn Sicherung geschrieben wird) | **nein** (C vor Pr) |
| M `move_character` | C → Pr(ks, Audit) | **nein** (C vor Pr) |
| D_dir (Betrieb) | C → Pr(ks, Sicherung) → A → I | **nein** (nur Betrieb, nicht im Code) |

### 4.3 Paarweise Prüfung

| Paar | Zyklus? | Begründung |
|---|---|---|
| D′ ↔ D (gleiches Konto, beliebiger Charakter) | **nein** | beide sperren zuerst das Profil; `ks` und `upd` schließen sich aus → strikte Reihenfolge; der Verlierer hält nichts. Wartet D′ auf D, findet D′ danach kein Profil/keinen Charakter → `not_found`. **B-3 und G-5 geschlossen** |
| D′ ↔ D_adm | **nein** | D_adm hält U, dann Pr (Löschsperre); D′ wartet an Pr, bevor es A/C/I hält |
| D′ ↔ D′ (gleiches Konto, verschiedene Charaktere) | **nein** | `ks` ↔ `ks` verträglich; verschiedene A und C; gemeinsame Instanzen werden aufsteigend gesperrt |
| D′ ↔ D′ (gleicher Charakter) | **nein** | zweiter wartet an A; danach `not_found` |
| D′ ↔ J | **nein** | J sperrt weder Pr noch C; beide A vor I (B-2 geschlossen wie in V5) |
| D′ ↔ P | **nein** | P wartet nie auf A, Pr oder C |
| D′ ↔ CG | **nein** | CG: A sortiert, dann nur 7001/K/neue I; D′ hält höchstens ein A und wartet danach nur auf C/I, die CG nicht hält |
| D′ ↔ S, D′ ↔ M (gleicher Charakter) | **nein** | D′ hält Pr(ks), A und wartet auf C(X); S/M halten C(X) und nehmen danach höchstens Pr(ks) – verträglich mit D′s `ks` → S/M beenden, D′ löscht danach |
| D ↔ J, D ↔ CG, D ↔ P | **nein** | wie in V5 (Gegenprüfung Abschnitt 3) |
| D ↔ D (verschiedene Konten) | **nein** | A sortiert und dedupliziert (K-a); I aufsteigend; C disjunkt |
| **D ↔ S, D ↔ M (gleiches Konto)** | **ja – B-4, bestehend** | S/M halten C(X) und warten auf Pr(ks); D hält Pr(upd) und wartet in der Kaskade auf C(X). Unabhängig von V5/V6′; heute schon vorhanden |
| D_adm ↔ S/M | **ja – wie B-4** | gleiche Ursache |
| D ↔ D_dir | **ja (Betrieb)** | wie heutiges B-3; nur bei direktem Löschen durch Betreiber |

### 4.4 Mehrere Charaktere und parallele Löschungen (Punkt 4)
- Mehrfachsperren gibt es nur in D/D_adm (A aller Charaktere des Kontos) und CG (A aller Spieler). Beide sortiert nach dem 64-Bit-Schlüssel und dedupliziert (K-a); D′ und J nehmen genau eine A.
- Kollisionen zweier Charaktere auf denselben Schlüssel führen nur zu zusätzlicher Serialisierung; durch die Sortierung nach Schlüssel kann daraus kein Zyklus entstehen.
- Neue Charaktere können während D nicht entstehen (FK-Sperre `ks` auf das von D `upd` gesperrte Profil); die A-Menge in `on_profile_deleting` ist vollständig.
- Mehrere Instanzen: alle Instanzsperren aufsteigend (`05:210`, `05:238`); `group_tick` mit `skip locked`.

## 5. Migration, Rechte, Rückwärtskompatibilität (Punkt 5)

- **Migration (Produktion):** neue Datei nach dem Muster `supabase/migration_d3_konto_loeschen.sql` / `supabase/rollback_d3_konto_loeschen.sql`, z. B. `supabase/migration_b2_loeschreihenfolge.sql` mit `create or replace function public.delete_character(uuid)`; Rollback stellt die heutige Fassung (`schema:340–349`) **wörtlich** wieder her. `supabase/schema.sql` wird gleich mitgeändert (eine Quelle der Wahrheit).
- **Vorher prüfen:** dass die Produktionsfassung von `public.delete_character` der heutigen `schema.sql` entspricht (Bedingung aus E11: Produktionsstand separat prüfen). Nur lesend, nur mit Freigabe.
- **Rechte:** `create or replace` behält Eigentümer, `SECURITY DEFINER`, `search_path` und ACL; `grant execute … to authenticated` (`schema:385`) bleibt gültig. Keine neuen Objekte, wenn der Schlüssel als identischer Ausdruck in `public` und `rwi` steht (`hashtextextended('rwi.char:' || <id als Text>, 0)`, nur `pg_catalog`). Alternative: gemeinsame Hilfsfunktion in `public` (neues Objekt, Rechte entziehen, Rechte-Audit). Empfehlung: identischer Ausdruck + Test auf Gleichheit (V6-9).
- **Produktion ohne `rwi`:** Auf Produktion ist `rwi` nicht installiert. V6′ verweist nicht auf `rwi`; die Beratungssperre ist dort wirkungslos, aber harmlos; die Profilsperre wirkt sofort (behebt B-3 auf Produktion auch ohne `rwi`).
- **Rückwärtskompatibilität:** gleiche Signatur, gleiche Rückgabe, gleiche Fehlercodes (`PT401`, `PT404`). Neu ist nur Warten statt Verklemmen bei gleichzeitiger Kontolöschung; danach `not_found`. Client (`index.html`, `tests/cases/kontoloeschen.js`, `cloudsync.js`, `datenfluss.js`) unverändert.
- **Dev/Werkzeuge:** `install_dev.sql`-Prüfsumme, Manifest in `rollback_dev.sql` (Fingerabdruck `delete_character`, `rollback_dev.sql:168`), `installation.mjs`, `rechte-audit.mjs`, Supabase-Schema-Tests (`supabase/tests/run.sh`, beide Rechte-Modi).

## 6. Regressionstests (Punkt 6)

Zwei Sitzungen, Wartezustände über `pg_stat_activity` und `pg_locks` belegt, Deadlock-Wächter, INV-1 (Stand 6, 2.7.5).

| Nr | Fall | Erwartung |
|---|---|---|
| V6-1 (= GP-1/G-5) | D ∥ D′ gleiches Konto, X **ohne** Instanz, beide Reihenfolgen (D hält Profil zuerst / D′ hält Profil zuerst) | kein 40P01; D zuerst → D′ endet mit `not_found`; D′ zuerst → X gelöscht, danach Konto gelöscht |
| V6-2 | wie V6-1, X **mit** Instanz (bisheriges B-3) | kein 40P01; INV-1 = 0 |
| V6-3 | D_adm (`delete from auth.users`) ∥ D′ | kein 40P01 |
| V6-4 | zwei D′ desselben Kontos, beide Charaktere in derselben Instanz | kein 40P01; beide aufgeräumt |
| V6-5 | D′ ∥ J (B2-1, B2-2 aus dem V5-Bericht) über den V6′-Weg | kein Geist, INV-1 = 0 |
| V6-6 | D′ ∥ P (K1-9g1–g3 aus Stand 6) | unverändert grün |
| V6-7 | D′ ∥ S und D′ ∥ M (gleicher Charakter, S mit geschriebener Sicherung) | kein 40P01, S/M zuerst fertig, dann Löschung |
| V6-8 (B-4, Ist-Fehler) | D ∥ S, D ∥ M gleiches Konto | ohne V6+: genau ein 40P01, als „bekannter Fehler bestätigt“ getrennt gezählt; mit V6+: kein 40P01 |
| V6-9 | Schlüsselgleichheit `public`/`rwi` für Beispiel-IDs | identische Werte |
| V6-10 | Rechte `delete_character` | ACL nur `authenticated` (+ Eigentümer), `SECURITY DEFINER`, `search_path` unverändert |
| V6-11 | Migration und Rollback in den Schema-Tests (beide Modi) | Rollback stellt den alten Fingerabdruck her |
| V6-12 | fremder Charakter | `not_found`; **keine** Advisory-Sperre und keine fremde Profilsperre (Eigentum vor A; Profilsperre nur auf das eigene Profil `uid`) |
| GP-2 | Schlüsselsortierung mit erzwungenen Kollisionen (D/CG) | kein 40P01 |
| GP-3 | Isolationsstufe ≠ READ COMMITTED | Abbruch (K-c) – gilt auch für V6′, falls die Prüfung dort ebenfalls eingebaut wird |
| GP-4 | J mit fremdem Charakter | `forbidden`, keine Advisory-Sperre (K-b) |
| GP-5 | Charakter zwischen `own_character` und Sperre gelöscht | `not_eligible`, INV-1 = 0 |
| GP-6 | Schlüsselraum | `objsubid` 1 (neu) bzw. 2 (7001–7003) |
| V6-13 | Belastungsmischung, 200 Durchläufe: D, D_adm, D′, J, P, CG, S, M, `create_character` auf wenigen Konten | 40P01 = 0 außer B-4-Paaren (ohne V6+) bzw. 0 (mit V6+); INV-1 = 0 nach jedem Durchlauf |
| Client | `npm test` (`kontoloeschen.js`, `cloudsync.js`, `datenfluss.js`) | unverändert grün |

**Mutationsproben:** Profilsperre in V6′ entfernt → V6-1 rot; Profilsperre **nach** A statt davor → V6-1 rot (Zyklus über Profil); A in V6′ entfernt → V6-5 rot; Eigentumsprüfung nach A → V6-12 rot; Schlüsselausdruck in `public` abweichend → V6-9 rot.

## 7. Empfehlung

1. **V5 + V6′ umsetzen** (V5 mit K-a bis K-e; V6′ wie Abschnitt 4.1). B-2, G-5 und B-3 sind damit geschlossen, ohne neuen Zyklus.
2. **B-4 (bestehend)** als offenen Fehler aufnehmen; **V6+** (Profilsperre `for key share` als erste Anweisung auch in `save_character` und `move_character`) als eigene Entscheidung – technisch ordnungstreu und nach Abschnitt 4.3 ohne neuen Zyklus; Kosten: eine verträgliche Zeilensperre je Speichervorgang.
3. **Reihenfolge:** zuerst Dev (beide Pakete gemeinsam testen), danach getrennte Produktionsmigration für V6′ (und ggf. V6+) mit Rollback, nach Prüfung des Produktionsstands und Freigabe.
4. Die Aussage „ohne V5 kein Deadlock bei Charakter ohne Instanz“ in `docs/B2_V5_GEGENPRUEFUNG.md` (G-5, Abschnitt 6) ist durch Abschnitt 3 dieses Berichts überholt.

## 8. Offene Entscheidungen

- **V6-E1:** V5 + V6′ als Fix für B-2/B-3 freigeben?
- **V6-E2:** V6+ für B-4 (`save_character`, `move_character`) mit aufnehmen oder getrennt?
- **V6-E3:** Schlüssel als identischer Ausdruck (empfohlen) oder gemeinsame Hilfsfunktion in `public`?
- **V6-E4:** Umsetzung in PR 1 (nur Dev) und Produktionsmigration als eigener, gesondert freizugebender Schritt (empfohlen)?
- Weiterhin offen aus der Gegenprüfung: B2-E2 (`create_group`), B2-E4′ (Sperre nach Eigentumsprüfung), B2-E5 (Isolationsprüfung).

Phase 2 bleibt gesperrt. E11, E12 und E14 sind nicht berührt.

# Gegenprüfung des B-2-Fixvorschlags V5 (21.11.2026)

> Nur lesende Prüfung. Committet wird ausschließlich dieser Bericht (Arbeitszweig `ccr-2e014f58-1i6nm4`). Keine Implementierung, keine Test-, Code-, SQL- oder Workflow-Änderung, keine Datenbankaktion.
> Geprüft: `docs/B2_ANALYSE_BEITRITT_CHARAKTERLOESCHUNG.md` (Commit `b6bc3c5`, „V5“). Code: `/home/user/ruinwalk-pr1` (`0X:Zeile` = `server/instance/sql/0X_*.sql`, `schema:Zeile` = `supabase/schema.sql`). PostgreSQL-Quellen: `src/backend/utils/adt/lockfuncs.c` und `src/include/storage/lock.h` (REL_16_STABLE und REL_17_STABLE, von github.com/postgres/postgres), `src/backend/executor/spi.c` (REL_16_STABLE).

## 1. Ergebnis

| Nr | Prüfpunkt | Urteil |
|---|---|---|
| G-1 | Sortierung der Advisory-Schlüssel bei mehreren Charakteren | **bestätigt als Lücke im Vorschlag:** für `on_profile_deleting` als „Schlüsselreihenfolge“ gefordert, für `create_group` nur „aufsteigend“ (unklar); die Reihenfolge von Sperraufrufen in einer `SELECT … ORDER BY`-Anweisung ist zudem nicht garantiert → Umsetzung nur per Schleife über deduplizierte, nach 64-Bit-Schlüssel sortierte Werte |
| G-2 | D, D′, CG mit überlappenden Charakterlisten | **Gegenbeispiel gefunden (G-5)**; übrige Kombinationen ohne Zyklus bei korrekter Umsetzung von G-1; CG nur unter der Bedingung, dass kein Aufrufer bereits Instanzsperren hält (G-7) |
| G-3 | Sperre in `group_join` vor allen relevanten Lesevorgängen, READ COMMITTED | **bestätigt mit Bedingung:** gilt nur unter READ COMMITTED; unter REPEATABLE READ/SERIALIZABLE bleibt B-2 bestehen → Isolationsprüfung nötig |
| G-4 | Trennung der Schlüsselräume | **bestätigt** (Quelltext): `bigint`-Sperren tragen `locktag_field4 = 1`, `(int4,int4)`-Sperren `= 2`; Rest ungeklärt nur für fremde Software im selben Datenbankschema |
| G-5 | B-3 nur bestehend? | **widerlegt:** V5 **erweitert** B-3. Ohne V5 verklemmen sich `delete_character` und `delete_account` desselben Kontos nur, wenn der Charakter in einer vom Konto gesperrten Instanz steht; **mit V5 bei jedem Charakter des Kontos**, auch ohne jeden Instanzbezug. Die Behauptung „keine neue Deadlock-Klasse“ ist damit **nicht haltbar** |
| G-6 | Missbrauchsschutz bei Sperre vor der Eigentumsprüfung | **bestätigt als Schwäche** (gering): fremde Schlüssel können kurz gesperrt werden; **Empfehlung B2-E4 umgekehrt:** Sperre **nach** der Eigentumsprüfung ist ebenso sicher, weil `eligible` den Charakter nach der Sperre erneut liest |
| G-7 | Weitere Bedingung `create_group` | **derzeit kein Problem** (kein SQL-Aufrufer), aber als Bedingung festhalten |

**Gesamturteil:** V5 schließt B-2 weiterhin, ist aber **in der vorgeschlagenen Form nicht freigabefähig**. Erforderlich sind die Korrekturen K-a bis K-d (Abschnitt 8). Für die neue Deadlock-Konstellation aus G-5 gibt es keine Lösung nur im Schema `rwi`; sie verschwindet erst mit **V6** (Sperre in `public.delete_character` vor dem Löschen).

## 2. G-1: Sortierung der Schlüssel

**Befund im Vorschlag:**
- `on_profile_deleting`: „A(C) für alle Charaktere des Kontos in aufsteigender Schlüsselreihenfolge“ (Bericht 4.1) – richtig gemeint.
- `create_group`: „A(C) für alle Spieler mit UUID-Schlüssel, aufsteigend“ – unklar, ob nach Charakter-ID oder nach Schlüssel.
- Tabelle Abschnitt 5: „A(alle C des Kontos, aufsteigend)“ – ebenfalls ohne Bezug.

**Warum es auf den Schlüssel ankommt:** Der Schlüssel ist `hashtextextended(…)`, seine Reihenfolge entspricht nicht der Reihenfolge der IDs. Sortieren zwei Transaktionen nach ID, kann eine Schlüssel-Kollision die Reihenfolge umkehren:
- T1 (Konto 1, Charaktere a1 < b1 nach ID), T2 (Konto 2, Charaktere a2 < b2 nach ID), mit `key(a1) = key(b2)` und `key(b1) = key(a2)`.
- T1 sperrt `key(a1)`, dann `key(b1)`; T2 sperrt `key(a2) = key(b1)`, dann `key(b2) = key(a1)` → Zyklus.
- Wahrscheinlichkeit: zwei gleichzeitige 64-Bit-Kollisionen, praktisch null – aber vermeidbar.

**Zweiter Befund:** Eine Anweisung wie `perform pg_advisory_xact_lock(k) from (select … order by k) s` legt die Ausführungsreihenfolge der Sperraufrufe nicht verbindlich fest (die Auswertung der Ausgabeliste ist nicht an die Sortierreihenfolge gebunden). Die bestehende Instanzsperre `05:236–238` ist davon nicht betroffen (`for update` sperrt Zeilen in Ausgabereihenfolge); für Advisory-Aufrufe gilt das nicht.

**Korrektur K-a:** Umsetzung ausschließlich per PL/pgSQL-Schleife: `for k in select distinct <schlüssel> from … order by 1 loop perform pg_advisory_xact_lock(k); end loop;` – sortiert nach dem **berechneten 64-Bit-Schlüssel**, dedupliziert. Gilt für `on_profile_deleting` und `create_group`.

## 3. G-2/G-5: Kombinationen D, D′, CG (mit überlappenden Charakteren)

Sperrfolgen mit V5 (Kurzzeichen wie im Bericht: **A** Beratungssperre je Charakter, **Pr** Profilzeile, **U** `auth.users`, **I** Instanz, **C** Charakterzeile):

| Ablauf | Reihenfolge |
|---|---|
| J | A(W) → I → 7002 |
| D′ `delete_character` | **C(X) → A(X)** → I (nur bei Bezug) |
| D `delete_account` | Pr → U → **A(alle C des Kontos)** → I (des Kontos) → **C(alle)** |
| CG `create_group` | A(Spieler) → (7001) → neue I → 7002 |
| P, S, M | unverändert (P: I; S, M: C) |

Entscheidend: **D′ sperrt C vor A, D sperrt A vor C.** Damit entsteht ein Zyklus, sobald beide denselben Charakter betreffen.

### G-5 – Gegenbeispiel (neue Konstellation), Zwei-Transaktions-Szenario
Voraussetzung: Konto K mit Charakter X; **X steht in keiner Instanz**.

| Schritt | T1 = `delete_account` (K) | T2 = `delete_character` (X) |
|---|---|---|
| 1 | Pr(K) `for update` (`schema:226`), `delete from auth.users` (`schema:247`) | – |
| 2 | Kaskade auf `profiles` → `on_profile_deleting`: **A(X)** erhalten (V5) | – |
| 3 | – | `delete from characters` → **C(X)** exklusiv erhalten (T1 hat C(X) noch nicht) |
| 4 | – | Trigger `on_character_deleted`: wartet auf **A(X)** (hält T1) |
| 5 | Kaskade auf `characters`: wartet auf **C(X)** (hält T2) | – |
| → | **Deadlock** (40P01 nach `deadlock_timeout`, eine Transaktion wird abgebrochen) | |

**Ohne V5** läuft dasselbe Szenario durch: T2 findet in Schritt 4 keine Instanz (`05:206–210`), wartet auf nichts und bestätigt; T1 löscht danach (Zeile schon weg). Die bestehende B-3-Verklemmung entsteht heute nur, wenn X in einer Instanz steht, die T1 in `on_profile_deleting` gesperrt hat (dann wartet T2 auf I statt auf A).

**Reproduktion (Testdatenbank):** T1 nach `on_profile_deleting` anhalten (Ersatzfassung mit Warten auf eine Test-Beratungssperre), T2 starten und per `pg_stat_activity`/`pg_locks` belegen, dass T2 auf die Advisory-Sperre wartet, dann T1 freigeben → 40P01.

**Folge:** gleiche Beteiligte wie B-3 (dasselbe Konto, gleichzeitig Charakter- und Kontolöschung), aber deutlich häufigere Konstellation. Konsistenz bleibt erhalten (eine Transaktion wird vollständig zurückgerollt, kann wiederholt werden). Die Aussage „keine neue Deadlock-Klasse“ in `docs/B2_ANALYSE_BEITRITT_CHARAKTERLOESCHUNG.md` (Abschnitte 1, 5, 8) ist **zu korrigieren**.

**Lösungsmöglichkeiten nur in `rwi`: keine gefunden.**
- A in D′ erst später? Nicht möglich – der Trigger läuft immer nach dem Sperren von C(X).
- A in D erst in `on_character_deleted` (pro Charakter, nach C)? Dann D: … → I → C → A. J hält A(W) und wartet auf I, das D hält; D wartet auf A(W) → **neuer Zyklus J ↔ D** (wenn J einer Instanz beitritt, in der das Konto schon einen anderen Charakter hat). Schlechter.
- Profilsperre in D′ (`for share`) im Trigger? D′: C → Pr; D: Pr → … → C → Zyklus wie vorher.

**Lösung mit V6:** `public.delete_character` nimmt A(X) **vor** `delete from characters` (`schema:345`). Dann D′: A(X) → C(X) → I. D′ und D konkurrieren zuerst um A(X); wer verliert, hält noch nichts, was der andere braucht → kein Zyklus. Damit verschwindet **auch** das bestehende B-3 (D′ hält dann A vor C und vor I; D wartet auf A, bevor es I sperrt). V6 ändert eine `public`-Funktion aus `supabase/schema.sql` → betrifft Produktion (eigene Migration, Skill `ruinwalk-db-aenderung`, ausdrückliche Freigabe).

### Weitere Kombinationen (ohne Gegenbeispiel bei Umsetzung von K-a)

| Paar | Ergebnis | Begründung |
|---|---|---|
| D ↔ D (verschiedene Konten) | kein Zyklus | A-Mengen disjunkt bis auf Kollisionen; beide sortiert nach Schlüssel (K-a) |
| CG ↔ CG, CG ↔ D | kein Zyklus | alle Mehrfachsperren nach Schlüssel sortiert; CG wartet danach nur auf 7001/7002 und die eigene neue Instanz; D wartet danach auf I/C, die CG nicht hält |
| CG ↔ D′ | kein eigener Zyklus | D′ hält C(X) und wartet auf A(X) (CG); CG hält A und wartet höchstens auf weitere A (sortiert) oder 7001/7002 – nie auf C oder I einer anderen Transaktion. Ketten schließen sich nur über G-5 (D′ ↔ D desselben Kontos) |
| J ↔ D (anderer Charakter Z desselben Kontos) | kein Zyklus | J: A(Z) → I; D: A(alle, inkl. Z) vor I; wer A(Z) zuerst hat, gewinnt; J braucht Pr/U nicht (keine FK auf `profiles` in `rwi.members`, `account_of` liest nur) |
| J ↔ D′ | kein Zyklus | J sperrt kein C |
| D′ ↔ D′ (gleicher Charakter) | kein Zyklus | zweites Löschen wartet auf C(X); danach ist die Zeile weg |
| J, CG ↔ S, M, P | kein Zyklus | S/M sperren nur C, P nur I; keine A |
| `create_character` während D | ausgeschlossen | Einfügen in `characters` braucht die FK-Sperre `for key share` auf die Profilzeile (`schema:26`), die D `for update` hält (`schema:226`) → neue Charaktere können während D nicht entstehen; die A-Menge von `on_profile_deleting` ist vollständig |

## 4. G-3: Lesereihenfolge in `group_join` und Isolationsstufe

- `public.group_join` (`05:50–52`) ist PL/pgSQL ohne Volatilitätsangabe → VOLATILE. In V5 steht die Sperre in einer eigenen ersten Anweisung; `own_character` (`05:19`, STABLE) und `rwi.join` laufen in der folgenden Anweisung.
- Unter READ COMMITTED holt sich PL/pgSQL (nicht nur lesend) je Anweisung einen neuen Stand: `spi.c:1770–1775` (`CommandCounterIncrement(); snapshot = GetTransactionSnapshot();`). STABLE-Funktionen nutzen den Stand der aufrufenden Anweisung. → `own_character`, `eligible` (`04:208`) und das Einfügen sehen den Stand **nach** dem Erhalt der Sperre. **Bestätigt.**
- Dasselbe gilt für die Schleife in `on_character_deleted` (VOLATILE, `05:202–203`) und die Instanzsperre in `on_profile_deleting` (VOLATILE, `05:232–233`), sofern die Advisory-Sperre jeweils in einer **eigenen vorangehenden Anweisung** steht.
- **Bedingung:** Unter REPEATABLE READ oder SERIALIZABLE liefert `GetTransactionSnapshot()` für die ganze Transaktion denselben Stand (ab der ersten Anweisung, also **vor** dem Erhalt der Sperre). Dann sieht J eine bereits bestätigte Löschung nicht, und B-2 bleibt bestehen. Der Clientweg (PostgREST, Standard READ COMMITTED) ist nicht betroffen; Serverwege mit anderer Isolationsstufe wären es. Das Projekt kennt diese Prüfung schon (`03:137`, `check_operator`).
- **Korrektur K-c:** In `group_join`, `on_character_deleted`, `on_profile_deleting` und `create_group` die Isolationsstufe prüfen und bei Abweichung abbrechen (nicht nur warnen), oder die Bedingung verbindlich dokumentieren und testen.

## 5. G-4: Trennung der Schlüsselräume

- `lockfuncs.c:697–704` (REL_16_STABLE, identisch in REL_17_STABLE):
  - `SET_LOCKTAG_INT64(tag, key64)` → `SET_LOCKTAG_ADVISORY(tag, MyDatabaseId, key64 >> 32, (uint32) key64, 1)`
  - `SET_LOCKTAG_INT32(tag, key1, key2)` → `SET_LOCKTAG_ADVISORY(tag, MyDatabaseId, key1, key2, 2)`
- `lock.h:270–276`: das vierte Feld wird als `locktag_field4` Teil des Sperrschlüssels.
- → Eine `bigint`-Sperre kann **nie** mit den bestehenden `(int4,int4)`-Sperren 7001 (`04:190`), 7002 (`04:59`), 7003 (`03:138`) zusammenfallen. **Bestätigt.** Sichtbar in `pg_locks.objsubid` (1 bzw. 2). Sperren gelten je Datenbank (`MyDatabaseId`).
- **Ungeklärt (gering):** Andere Software in derselben Datenbank (Supabase-Komponenten, Erweiterungen, Migrationswerkzeuge), die eigene `bigint`-Advisory-Sperren nutzt, könnte zufällig denselben Schlüssel treffen. Folge wäre nur zusätzliches Warten, kein Fehlentscheid. Der Präfix `rwi.char:` im Hash senkt die Wahrscheinlichkeit nicht unter ~2⁻⁶⁴ je Paar, ist aber ausreichend.

## 6. G-5 im Detail: B-3 vorher und nachher

| | ohne V5 | mit V5 | mit V5 + V6 |
|---|---|---|---|
| D′ ∥ D, X in vom Konto gesperrter Instanz | Deadlock (B-3) | Deadlock | **kein Deadlock** |
| D′ ∥ D, X ohne Instanzbezug | kein Deadlock | **Deadlock (neu, G-5)** | **kein Deadlock** |
| Datenkonsistenz | erhalten | erhalten | erhalten |

## 7. G-6: Missbrauchsschutz (Sperre vor der Eigentumsprüfung)

- Mit V5 wie vorgeschlagen sperrt `group_join` A(p_character) **vor** `own_character`. Jeder angemeldete Client kann damit die Sperre eines **fremden** Charakters (auch eines nicht existierenden Schlüssels) für die Dauer seiner eigenen Anfrage halten; die Anfrage endet sofort mit `forbidden`, die Sperre wird mit dem Rollback frei.
- Länger halten geht über PostgREST nicht (eine Transaktion je Anfrage, kein direkter Datenbankzugang für Clients). Ein Strom solcher Anfragen kann aber eine Löschung oder einen Beitritt des Opfers wiederholt kurz verzögern; ein Rate-Limit gibt es nicht (Befund G9 der früheren Sicherheitsprüfung). Risiko: gering, aber unnötig.
- **Sperre nach der Eigentumsprüfung ist gleich sicher:**
  - Eigentum ändert sich nie: `account_id` ist unveränderlich (`guard_character`, `schema:135–136`).
  - Existenz wird nach der Sperre ohnehin neu gelesen: `eligible` in `rwi.join` (`04:208`) läuft in einer späteren Anweisung, also nach der Sperre; ein inzwischen gelöschter Charakter ergibt `not_eligible` (statt `forbidden`).
  - Berechtigung Platz 3 wird wie heute beim Eintritt geprüft (F9); ein Entzug genau dazwischen ist dieselbe Lage wie heute.
- **Korrektur K-b (B2-E4 umgekehrt):** `k := rwi.own_character(p_character, null, true); perform <A(k)>; return rwi.join(p_instance, k);` – drei getrennte Anweisungen. Test: Fremder Charakter → `forbidden`, **keine** Advisory-Sperre in `pg_locks` während der Anfrage.

## 8. Notwendige Korrekturen am V5-Vorschlag

- **K-a:** Mehrfachsperren nur per Schleife, dedupliziert, sortiert nach dem berechneten 64-Bit-Schlüssel (`on_profile_deleting`, `create_group`).
- **K-b:** In `group_join` die Sperre **nach** `own_character` nehmen (B2-E4 neu: „nach“).
- **K-c:** Isolationsstufe READ COMMITTED in allen V5-Funktionen prüfen (Abbruch bei Abweichung) oder als verbindliche Bedingung dokumentieren und testen.
- **K-d:** Aussage „keine neue Deadlock-Klasse“ zurücknehmen; G-5 als neue Konstellation dokumentieren. Entscheidung nötig:
  - **V5 allein:** B-2 geschlossen; B-3 erweitert (jede gleichzeitige Charakter- und Kontolöschung desselben Kontos kann 40P01 auslösen); als bekannter Fehler mit Test dokumentieren.
  - **V5 + V6:** B-2 und B-3 geschlossen; erfordert Änderung an `public.delete_character` (Produktion, eigene Migration und Freigabe).
- **K-e:** Bedingung für `create_group`: darf nicht in einer Transaktion aufgerufen werden, die bereits Instanzsperren hält (sonst I → A gegen J: A → I). Heute gibt es keinen SQL-Aufrufer (geprüft: nur Tests und die Funktionsliste `05:355`).

## 9. Zusätzliche Tests (zu Abschnitt 7 des V5-Berichts)

| Nr | Fall | Erwartung |
|---|---|---|
| GP-1 | G-5 reproduziert: `delete_account` hält A(X) (angehalten nach `on_profile_deleting`), gleichzeitig `delete_character(X)`, X ohne Instanz | mit V5 allein: genau ein 40P01, die andere Transaktion erfolgreich, INV-1 = 0 (dokumentierter bekannter Fehler); mit V5 + V6: kein 40P01 |
| GP-2 | Schlüsselsortierung: zwei `delete_account` bzw. `create_group` mit erzwungen kollidierenden Schlüsseln (Testversion der Schlüsselfunktion) in umgekehrter ID-Reihenfolge | kein 40P01 |
| GP-3 | Isolationsstufe: `group_join` unter REPEATABLE READ | Abbruch mit klarer Meldung (K-c) |
| GP-4 | Missbrauch: `group_join` mit fremdem Charakter | `forbidden`, keine Advisory-Sperre sichtbar (K-b) |
| GP-5 | Charakter wird zwischen `own_character` und Sperre gelöscht (Hook) | `not_eligible`, kein Eintrag, INV-1 = 0 |
| GP-6 | Schlüsselraum: `pg_locks` während J | neue Sperre mit `objsubid = 1`, 7002 mit `objsubid = 2` |

## 10. Offene Entscheidungen

- **B2-E1′:** V5 mit den Korrekturen K-a bis K-e – allein (B-3 erweitert, dokumentiert) oder zusammen mit V6 (B-3 behoben, Produktionsänderung)?
- **B2-E4′:** Sperre in `group_join` **nach** der Eigentumsprüfung (neue Empfehlung).
- **B2-E5:** Isolationsprüfung als Abbruch (empfohlen) oder nur Dokumentation?
- Unverändert offen: B2-E2 (`create_group` einbeziehen, weiterhin empfohlen), B2-E3 (PR 1 oder eigener PR).

Phase 2 bleibt gesperrt. E11, E12 und E14 sind nicht berührt.

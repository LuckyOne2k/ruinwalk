# B-2: Wettlauf zwischen Beitritt und Charakterlöschung – Analyse und Fix-Vorschlag (21.11.2026)

> Nur Analyse. Committet wird ausschließlich dieser Bericht (Arbeitszweig `ccr-2e014f58-1i6nm4`). Keine Code-, SQL-, Test- oder Workflow-Änderung, keine Datenbankaktion, keine Installation, keine Umsetzung.
> Bezug: `docs/PR1_KORREKTURPLAN_STAND6.md` (Commit `49ac8f8`), Abschnitte 2.7.3–2.7.5 und 14.4.
> Geprüfter Code: lokaler Zweig `integration/nacht-nach-main` in `/home/user/ruinwalk-pr1`. Fundstellen: `0X:Zeile` = `server/instance/sql/0X_*.sql`, `schema:Zeile` = `supabase/schema.sql`.

## 1. Ergebnis in Kürze

- **B-2 ist real** und entsteht, weil der Beitritt die Existenz des Charakters nur **liest**, die Charakterlöschung den Beitritt aber nur dann bemerkt, wenn der Charakter **schon** in der Instanz steht. Dasselbe Muster besteht bei `rwi.create_group` (B-2b, nur Serverweg).
- **Empfehlung: Variante V5** – eine **Beratungssperre je Charakter** (`pg_advisory_xact_lock(bigint)`), ausschließlich im Schema `rwi`:
  - im Beitritt (`public.group_join`, `05:50`) als **erste** Anweisung, vor `own_character`;
  - in `rwi.on_character_deleted` (`05:202`) als **erste** Anweisung, vor der Schleife;
  - in `rwi.on_profile_deleting` (`05:232`) für alle Charaktere des Kontos (aufsteigend), **vor** den Instanzsperren;
  - optional in `rwi.create_group` (`04:176`) für alle Spieler (aufsteigend), vor `eligible`.
- V5 schließt B-2 und B-2b, führt **keine neue Deadlock-Klasse** ein (Abschnitt 5) und braucht **keine** Änderung an `supabase/schema.sql` (also keine Änderung an den auf Produktion installierten `public`-Funktionen).
- **Neuer Befund B-3 (bestehend, unabhängig von B-2):** Gleichzeitige `delete_character` und `delete_account` **desselben Kontos** können sich heute schon verklemmen (40P01, eine Transaktion wird abgebrochen, Daten bleiben konsistent). V5 ändert daran nichts. Ein Fix (V6) bräuchte eine Änderung an `public.delete_character` und ist eine eigene Entscheidung.
- Der früher erwogene Ansatz `FOR SHARE` vor der Instanzsperre (V1) bleibt verworfen (Deadlock mit der Kontolöschung, Stand 6, 2.7.4). Auch alle anderen `FOR SHARE`/`NOWAIT`-Varianten sind schlechter als V5 (Abschnitt 4).

## 2. Tatsächliche Sperr- und Transaktionsabläufe (Ist-Code)

Jeder Client-Aufruf ist eine eigene Transaktion (PostgREST). Isolationsstufe READ COMMITTED: In VOLATILE-PL/pgSQL arbeitet jede Anweisung auf einem neuen Stand; nach dem Warten auf eine Zeilensperre wird die gesperrte Zeile neu gelesen.

| Kürzel | Ablauf | Sperren in Reihenfolge | Belege |
|---|---|---|---|
| **S** | `public.save_character` | Charakterzeile C `for update` → Update C (Trigger `backup_character` schreibt `character_backups`) | `schema:277–298`, `schema:285`, `schema:167` |
| **M** | `public.move_character` | C `for update` → Update C (eindeutiger Index `(account_id, slot_number)`, `schema:56`) → Audit | `schema:317–338` |
| **D′** | `public.delete_character` | Delete C (C exklusiv; vorher `backup_character`) → Trigger `rwi.on_character_deleted`: Schleife über aktive Instanzen, in denen C aktives Mitglied **oder** wartend ist (`05:206–210`, aufsteigend) → je Instanz `leave` mit Instanzsperre (`04:232`) → `delete from rwi.players` (`05:224`) → Audit, Sicherungen | `schema:340–349`, `05:202–226` |
| **D** | `public.delete_account` | Profilzeile `for update` (`schema:226`) → Zahlungen, Audit → `delete from auth.users` (`schema:247`) → Kaskade `profiles` (`schema:16`): **vor** dem Löschen `rwi.on_profile_deleting` sperrt alle aktiven Instanzen des Kontos aufsteigend (`05:232–240`) → Kaskade `characters` (`schema:26`): alle C des Kontos exklusiv, je C `on_character_deleted` → `on_profile_deleted` leert `account` (`05:242–243`) | `schema:221–247`, `05:232–249` |
| **J** | `public.group_join` → `rwi.own_character` → `rwi.join` | `own_character` **liest** C ohne Sperre (`05:25–29`) → Instanz I `for update` (`04:203`) → `eligible` liest C (`04:208`) → weitere Prüfungen → Einfügen in `members` (`04:218`) bzw. `waitlist` (`04:222`); dabei `account_guard`: Beratungssperre `7002(I, Konto)` (`04:59`) | `05:50–52`, `04:200–225` |
| **P** | Nachrücken (alle acht Wege) | I `for update` (bzw. `skip locked` in `group_tick`) → C nur lesen → Beratungssperre 7002 beim Einfügen | Stand 6, 2.4/2.7 |
| **CG** | `rwi.create_group` (nur `service_role`) | `eligible` je Spieler liest C (`04:187`) → bei Weltboss Beratungssperre `7001(Event)` (`04:190`) → **neue** Instanz einfügen → Mitglieder einfügen (7002) | `04:176–198` |

Bestehende Beratungssperren nutzen die Form `(int4, int4)`: 7001 (Event, `04:190`), 7002 (Instanz/Konto, `04:59`), 7003 (Betreiberprotokoll, `03:138`).

## 3. Ursache von B-2 (Beleg)

1. J liest C in `own_character` und in `eligible` (`04:208`) – **ohne Sperre**.
2. Ist W in I weder Mitglied noch wartend, enthält die Schleife von D′ die Instanz I nicht (`05:206–210`). D′ braucht I nicht und wartet auf nichts, was J hält.
3. D′ kann deshalb **zwischen** `eligible` (`04:208`) und dem Einfügen (`04:218`/`04:222`) bestätigen.
4. J fügt danach W ein: bei Einkampf-Instanzen ein aktives Mitglied mit `profile` NULL (Trigger `04:73`: `profile_of` findet weder Charakter noch `rwi.players`) und `account` NULL (`account_of` findet keinen Charakter), bei Mehrkampf-Dungeons ein Wartender mit `account` NULL.
5. Niemand räumt das auf: Die Lösch-Schleife ist bereits gelaufen.

**B-2b (gleiches Muster):** `rwi.create_group` liest C in `eligible` (`04:187`) und fügt Mitglieder in eine **neue** Instanz ein. Eine gleichzeitige D′ sieht die neue Instanz nicht (nicht bestätigt) und räumt sie nicht auf. Nur über `service_role` erreichbar.

## 4. Lösungsvarianten

Sperrklassen: **A** = neue Beratungssperre je Charakter, **Pr** = Profilzeile, **U** = `auth.users`, **I** = Instanzzeile(n), **C** = Charakterzeile, **K** = Beratungssperre 7002.

| Variante | Idee | Sperrfolge J | Bewertung |
|---|---|---|---|
| **V1** | C `for share` im Beitritt **vor** I | C(share) → I | **verworfen:** D hält I (aus `on_profile_deleting`) und will C exklusiv; J hält C und will I → Zyklus mit D (Stand 6, 2.7.4) |
| **V2** | C `for share` im Beitritt **nach** I | I → C(share) | **unsicher:** D′ hält C und will I, sobald W zum Zeitpunkt ihrer Schleife in I steht (wartend oder Mitglied). Szenario: W verlässt I (bestätigt), D′ startet mit älterem Stand der Schleife (W noch wartend) und will I; gleichzeitig tritt W I erneut bei (J hält I, will C) → Zyklus D′/J. Zusätzlich blockiert jedes laufende `save_character` (Autospeichern) den Beitritt |
| **V3** | wie V2, aber `for share nowait` | I → C(share, ohne Warten) | **kein Deadlock** (J wartet nie auf C), aber **unechte Fehler**: Jedes gleichzeitige S oder M desselben Charakters (Autospeichern) lässt den Beitritt sofort mit 55P03 scheitern → Client braucht Wiederholung; Spielerfahrung schlechter |
| **V4** | nach dem Einfügen erneut prüfen, ob C existiert | – | **unwirksam:** D′ kann nach der Nachprüfung, aber vor dem Commit von J bestätigen; ihre Schleife sieht W nicht (nicht bestätigt) → Geist bleibt |
| **V5** | Beratungssperre **A(C)** als **erste** Sperre in J, in `on_character_deleted`, in `on_profile_deleting` (alle C des Kontos, aufsteigend) und optional in CG | **A → I → K** | **empfohlen** (Abschnitt 5): schließt B-2/B-2b, keine neue Deadlock-Klasse, nur Schema `rwi` |
| **V6** | wie V5, zusätzlich A(C) in `public.delete_character` (vor dem Löschen) und `public.delete_account` (vor der Profilsperre) | A → I → K | schließt zusätzlich B-3; **aber** Änderung an `supabase/schema.sql` → betrifft die auf Produktion installierten `public`-Funktionen → eigene Migration nach Skill `ruinwalk-db-aenderung` und ausdrückliche Freigabe für Produktion |

### 4.1 Technische Ausgestaltung von V5 (Plan, nicht umgesetzt)
- Sperre: `pg_advisory_xact_lock(hashtextextended('rwi.char:' || <character_id als Text in Kleinbuchstaben>, 0))` – 64-Bit-Schlüssel. Advisory-Sperren mit einem `bigint` liegen in einem anderen Schlüsselraum als die bestehenden `(int4, int4)`-Sperren 7001–7003 (PostgreSQL unterscheidet die beiden Formen in `pg_locks.objsubid`); Kollisionen mit ihnen sind ausgeschlossen. Kollisionen zweier Charaktere untereinander bewirken nur zusätzliche Serialisierung, keine Fehlentscheidung.
- **J** (`public.group_join`, `05:50–52`, VOLATILE PL/pgSQL): erste Anweisung `perform pg_advisory_xact_lock(…p_character…)`, danach unverändert `return rwi.join(p_instance, rwi.own_character(p_character, null, true))`. Weil `own_character` und `eligible` in späteren Anweisungen laufen, lesen sie den Stand **nach** dem Erhalt der Sperre.
- **D′** (`rwi.on_character_deleted`, `05:202`, VOLATILE): erste Anweisung `perform pg_advisory_xact_lock(…old.character_id…)`, danach die Schleife (eigene Anweisung → neuer Stand).
- **D** (`rwi.on_profile_deleting`, `05:232`): zuerst A(C) für **alle** Charaktere des Kontos in **aufsteigender Schlüsselreihenfolge**, danach (eigene Anweisung, neuer Stand) die bestehende Instanzsperre. In der Kaskade nimmt `on_character_deleted` die bereits gehaltene Sperre erneut (wiedereintrittsfähig, kein Warten).
- **CG** (`rwi.create_group`, `04:176`, optional): A(C) für alle Spieler mit UUID-Schlüssel, aufsteigend, vor `eligible` (`04:187`).
- Unverändert: S, M, P, `save_character`, `move_character`, alle `public`-Funktionen in `schema.sql`.

## 5. Prüfung von V5 gegen alle Abläufe

**Sperrfolgen mit V5:**

| Ablauf | Reihenfolge |
|---|---|
| J | **A(W)** → I → K |
| D′ | C(W) → **A(W)** → I (nur bei Bezug) |
| D | Pr → U → **A(alle C des Kontos, aufsteigend)** → I (alle des Kontos) → C (alle) |
| P | I → K (keine A, keine C-Sperre) |
| S | C |
| M | C (ggf. Warten auf eindeutigen Index desselben Kontos) |
| CG | **A(Spieler, aufsteigend)** → (7001) → neue I → K |

**Paarweise Prüfung:**

| Paar | Möglicher Zyklus? | Begründung |
|---|---|---|
| J ↔ D′ | **nein** | J wartet nie auf C. D′ wartet auf A nur, während J A hält; J wartet danach höchstens auf I, und I hält D′ erst nach A. Ergebnis: Hält J zuerst A, bestätigt J (W in I), danach erfasst die Schleife von D′ (neuer Stand nach A) W und räumt auf. Hält D′ zuerst A, wartet J vor `own_character`; danach findet `own_character` den Charakter nicht → `forbidden`. **B-2 geschlossen.** |
| J ↔ D | **nein** | Beide nehmen A vor I. D hält vor A nur Pr und U; die braucht J nicht. Hält J A(W): D wartet in `on_profile_deleting`, J bestätigt, D sperrt danach (neuer Stand) auch die Instanz, in die W eingetreten ist, und räumt auf. Hält D A(W): J wartet, danach `forbidden`. |
| J ↔ P | **nein** | P nimmt keine A und keine C-Sperre; beide konkurrieren nur um I (eine Sperre, kein Zyklus). |
| J ↔ S / M | **nein** | J sperrt C nicht mehr, nur A; S/M sperren nur C. Kein gegenseitiges Warten, kein Leistungsnachteil beim Autospeichern (anders als V2/V3). |
| D′ ↔ P | **nein** | unverändert gegenüber heute (Stand 6, 2.7.3): P wartet nie auf etwas, das D′ hält. |
| D′ ↔ S / M | **nein** | wie heute: Konkurrenz nur um C. |
| D ↔ P, D ↔ S/M | **nein** | wie heute. |
| D′ ↔ D (verschiedene Konten) | **nein** | keine gemeinsamen A oder C. |
| D′ ↔ D (**dasselbe** Konto) | **ja, aber schon heute (B-3)** | Heute: D hält I, will C(X); D′ hält C(X), will I → Zyklus. Mit V5: D′ hält C(X), will A(X); D hält A(X), will C(X) → weiterhin Zyklus. V5 **verschlimmert** B-3 nicht (gleiche Beteiligte, gleiche Folge: 40P01, eine Transaktion zurückgerollt), behebt es aber auch nicht. |
| D ↔ D, D′ ↔ D′ | **nein** | mehrere A nur in D, dort aufsteigend; D′ nimmt genau eine A. |
| CG ↔ J/D′/D | **nein** | CG nimmt A aufsteigend vor allem anderen; die neue Instanz ist bis zum Commit für niemanden sichtbar. |

**Kein aktives Mitglied ohne Charakter mehr:** In jedem Weg, der einen Charakter neu in eine Instanz bringt (J, CG), liegt zwischen Existenzprüfung und Commit die Sperre A(C); jede Löschung des Charakters (D′, D) nimmt A(C) vor ihrer Schleife bzw. Instanzsperre. Damit sieht entweder der Beitritt die Löschung (→ `forbidden` bzw. `not_eligible`) oder die Löschung den Beitritt (→ Aufräumen). Der Nachrückweg P war schon ohne V5 sicher (Stand 6, 2.7.3).

## 6. Risiken und Nebenwirkungen von V5

- **Wartezeit:** J kann kurz auf eine laufende Löschung desselben Charakters warten (und umgekehrt). Beides betrifft nur denselben Charakter und ist selten.
- **Fremde Schlüssel:** Der Beitritt nimmt A(C) **vor** der Eigentumsprüfung. Ein Client kann so die Sperre eines fremden Charakters für die Dauer seiner eigenen (sofort mit `forbidden` endenden) Transaktion halten. Wirkung: höchstens Millisekunden Verzögerung einer fremden Löschung. Alternative: A erst nach der Eigentumsprüfung – dann müsste `own_character` danach erneut prüfen (zwei Lesevorgänge). Empfehlung: Sperre zuerst, Risiko vernachlässigbar; im Test messen.
- **B-3 bleibt** (bestehend): Gleichzeitiges `delete_character` und `delete_account` desselben Kontos kann 40P01 auslösen. Folge: eine der beiden Löschungen scheitert und kann wiederholt werden; keine Inkonsistenz. Fix nur mit V6 (Änderung an `public`, Produktion).
- **`hashtextextended`-Kollisionen:** nur zusätzliche Serialisierung.
- **Wiedereintritt:** In der Kaskade von D nimmt `on_character_deleted` dieselbe A erneut; Advisory-Sperren derselben Sitzung warten nicht auf sich selbst.
- **Testhilfen:** Tests, die mit direkten Einfügungen oder `rwi.join` (Testfunktion) arbeiten, nehmen keine A; das ist gewollt (Serverweg), muss aber in den Tests bekannt sein.
- **Auswirkung auf Stand 6:** K1-9g4 (dokumentierter Ist-Fehler B-2) müsste **bewusst** auf die neue Erwartung umgestellt werden (Regel aus Stand 6, 2.7.5). INV-1 bleibt als Überwachung sinnvoll.
- **Rechte:** keine neuen Objekte, keine neuen Rechte. Die geänderten Funktionen behalten Eigentümer, `SECURITY DEFINER` und `search_path`; der Rechte-Audit und das Rollback-Manifest (`rollback_dev.sql`) müssen den geänderten Quelltext erfassen (neues Manifest).

## 7. Notwendige Regressionstests (Plan)

Zwei Sitzungen, Wartezustände über `pg_stat_activity.wait_event_type = 'Lock'` und `pg_locks` (`locktype = 'advisory'` bzw. `tuple`) belegt, Deadlock-Wächter mit Zeitlimit, Invariante INV-1 (Stand 6, 2.7.5).

| Nr | Fall | Erwartung |
|---|---|---|
| B2-1 | J hält A(W) (Hook nach `eligible`), D′ startet | D′ wartet nachweislich auf die Advisory-Sperre; J bestätigt (W in I); D′ räumt W auf (`left/freiwillig` bzw. Warteliste `cancelled`); INV-1 = 0; kein 40P01 |
| B2-2 | D′ hält A(W) (Hook im Trigger nach der Sperre), J startet | J wartet nachweislich vor `own_character`; danach `forbidden`; kein Eintrag für W; INV-1 = 0 |
| B2-3 | wie B2-1/B2-2 mit D (Kontolöschung) statt D′ | wie oben; zusätzlich `account` NULL in allen Zeilen des Kontos |
| B2-4 | K1-9g4 in neuer Form (Einkampf und Mehrkampf) | **kein** Geist mehr: INV-1 = 0, kein Wartender mit `account` NULL ohne Charakter (bewusste Umstellung des bisherigen Ist-Fehler-Tests) |
| B2-5 | J während laufendem S (offene Transaktion mit `update public.characters`) | J wartet **nicht** (Laufzeit gemessen) |
| B2-6 | J während laufendem M | J wartet nicht |
| B2-7 | K1-9g1–K1-9g3 (Stand 6) | unverändert grün |
| B2-8 | CG ↔ D′ (falls CG Teil des Fixes) | kein Mitglied ohne Charakter in der neuen Instanz |
| B2-9 | Belastungsmischung: 200 Durchläufe mit zufällig gleichzeitigen J, D′, D, S, M, P auf wenigen Charakteren und Instanzen | 0 × 40P01 außer den als B-3 bekannten Paaren (D′ + D desselben Kontos), die getrennt gezählt werden; INV-1 = 0 am Ende jedes Durchlaufs |
| B2-10 | Schlüsselraum | `pg_locks` zeigt die neue Sperre mit `objsubid = 1` (bigint), die bestehenden 7001–7003 mit `objsubid = 2`; keine Überschneidung |
| B2-11 | Wiedereintritt | in der Kaskade von D kein Warten von `on_character_deleted` auf die eigene Sperre |
| B3-1 | dokumentierter Ist-Fehler B-3: D′ und D desselben Kontos gleichzeitig | genau eine Transaktion mit 40P01, die andere erfolgreich; Daten konsistent (INV-1 = 0); als „bekannter Fehler bestätigt“ getrennt gezählt |

**Mutationsproben:** Sperre in `group_join` entfernt → B2-1/B2-4 rot; Sperre in `on_character_deleted` entfernt → B2-2 rot; Sperre in `on_profile_deleting` entfernt oder nicht aufsteigend → B2-3 bzw. B2-9 rot; Sperre in `group_join` **nach** `own_character` statt davor → B2-2 rot.

## 8. Empfehlung

1. **V5 umsetzen** (nur Schema `rwi`: `group_join`, `on_character_deleted`, `on_profile_deleting`; optional `create_group`), mit den Tests aus Abschnitt 7. V5 schließt B-2 (und B-2b) ohne neue Deadlock-Klasse und ohne Änderung an den `public`-Funktionen der Produktion.
2. **B-3** als eigenen, bestehenden Befund in Stand 6 (14.4) aufnehmen; Test B3-1 dokumentiert den Ist-Zustand. Ein Fix (V6) nur nach eigener Entscheidung, weil er `supabase/schema.sql` und damit Produktion betrifft.
3. V1–V4 nicht weiter verfolgen.

**Einordnung in PR 1:** V5 ist **nicht** Teil der bisher freigegebenen Korrekturen (K-1, M-1, M-2, M-4). Er kann als Ergänzung zu PR 1 (gleiche Dateien 04/05, gleiche Testdatei) oder als eigener PR umgesetzt werden – das ist eine Entscheidung.

## 9. Offene Entscheidungen

- **B2-E1:** V5 als Fix für B-2 freigeben (ja/nein)?
- **B2-E2:** `create_group` (B-2b) einbeziehen (empfohlen: ja)?
- **B2-E3:** Umsetzung in PR 1 oder als eigener PR?
- **B2-E4:** Sperre in `group_join` vor oder nach der Eigentumsprüfung (empfohlen: vor)?
- **B-3:** als offenen, bestehenden Fehler aufnehmen; V6 später gesondert entscheiden (Produktionsmigration)?
- Bei Freigabe: Stand 7 des Korrekturplans mit angepasstem K1-9g4, den Tests B2-1 bis B3-1 und den Mutationsproben.

Phase 2 bleibt gesperrt. E11, E12 und E14 sind nicht berührt.

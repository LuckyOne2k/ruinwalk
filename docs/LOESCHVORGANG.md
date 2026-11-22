# Lösch­vorgang (Charakter / Konto) und Instanzdaten: was abgefangen wird, was alles abbricht

Umgesetzt in `server/instance/sql/05_produktion.sql` (`rwi.on_character_deleted`, `rwi.on_profile_deleting`, `rwi.on_profile_deleted`). Tests: `server/instance/tests/loesch-trigger.mjs` (59 Prüfungen), `b2-sperren.mjs` (Sperrreihenfolge B-2/B-3), `konto-regel.mjs`, `konto-integration.mjs`.

## Beschluss
Eine Charakter- oder Kontolöschung wird **vollständig zurückgerollt**, wenn auch die minimale Instanzbereinigung scheitert. **Ein Geistermitglied (aktives Mitglied ohne Charakter) darf nie als akzeptierter Endzustand zurückbleiben.**

## Ablauf je gelöschtem Charakter (eine Transaktion mit der Löschung selbst)
1. Kontolöschung: `BEFORE DELETE` auf `public.profiles` nimmt zuerst die Beratungssperre je Charakter des Kontos (aufsteigend nach Schlüssel, entdoppelt) und sperrt danach alle aktiven Instanzen des Kontos in aufsteigender ID (verhindert Deadlocks zwischen gleichzeitigen Löschungen, Beitritten und Gruppenanlagen).
2. `AFTER DELETE` auf `public.characters` je Charakter (nur `OLD.character_id`; Konto, Profil und Charakterzeile sind zu diesem Zeitpunkt nicht mehr sichtbar, `rwi.leave` braucht sie nicht).
3. **Stufe 1:** `rwi.leave` (reguläre Spiellogik, freiwilliger Austritt).
4. **Stufe 2** (nur wenn Stufe 1 einen Fehler wirft): minimale Bereinigung ohne Spiellogik: Wartelisteneintrag stornieren, Mitglied auf `left`/`freiwillig`, ausstehende Beute entfällt, Alarm `char_cleanup_failed`.
5. **Folgeprüfung** `rwi.after_auto_removal` (Mindestgröße, Abbruch, Nachrücken).
6. Spielerprofil `rwi.players` entfernen. Am Ende `AFTER DELETE` auf `profiles`: Kontokennung aus Mitglieds-/Wartelistenzeilen entfernen (Zeilen bleiben als anonymer Verlauf).

## Sperrreihenfolge (B-2/B-3, Stand 21.11.2026, nur lokal getestet)
Grundlage: Prüfbericht `docs/B2_PRUEFBERICHT.md`. Abkürzungen: Pr = Profilzeile, A = Beratungssperre je Charakter, I = Instanz, C = Charakterzeile.
**Sperrregel (Pr-Torregel, wie `docs/B2_PRUEFBERICHT.md` Abschnitt 1):** Es gilt keine einfache globale Ordnung, sondern: Wer A → C nimmt (D `delete_account`, D_adm Admin-Löschung: Kaskade nach `on_profile_deleting`), hält vorher Pr exklusiv. Wer C → A nimmt (D′ `delete_character`, D_dir direktes DELETE), hält vorher Pr(ks) als **allererste** Sperre (D′) bzw. hält kein Pr (D_dir). Wer nur C sperrt und danach Pr braucht (S `save_character`, M `move_character`), nimmt seit B-4 ebenfalls Pr(ks) als **allererste** Sperre. J/CG nehmen A → I ohne Zeilensperre auf `characters`; P nimmt nur I. Instanzen immer nach A und aufsteigend. **Die Profilsperre muss in `delete_character`, `save_character` und `move_character` die erste Sperre bleiben** (Mutation „Profilsperre nach C“ → 40P01).
- **Beratungssperre je Charakter:** `pg_advisory_xact_lock(hashtextextended('rwi.char:' || lower(<character_id>), 0))` – identischer Ausdruck in `public.delete_character`, `public.group_join`, `rwi.create_group`, `rwi.on_character_deleted`, `rwi.on_profile_deleting`.
- `public.delete_character`: Profil `for key share` → eigene Charakterzeile `for update` (prüft zugleich das Eigentum; fremde/fehlende IDs werden nicht gesperrt) → A → Löschen → Trigger (I). Zeile vor A entspricht der Reihenfolge eines direkten DELETE (B-5).
- `public.group_join`: Eigentumsprüfung (`own_character`) → A → Beitritt (I). Ein Beitritt und das Löschen desselben Charakters laufen damit nacheinander; ein gelöschter Charakter bleibt nie aktives Mitglied oder Wartender (B-2).
- `rwi.create_group`: A für alle Spieler (sortiert, entdoppelt) → Gruppensperre → neue Instanz. Nie aufrufen, während der Aufrufer schon Instanzsperren hält.
- **READ COMMITTED Pflicht:** Die fünf Funktionen brechen in REPEATABLE READ/SERIALIZABLE mit `read_committed_required` (SQLSTATE 25000) ab, weil die Neuprüfung nach dem Warten einen neuen Schnappschuss je Anweisung braucht. Folge: Auch eine Konto- oder Charakterlöschung aus einer Transaktion mit höherer Isolation (z. B. Admin-/Betreiberlöschung) bricht vollständig ab. **Vor einer Dev-Installation lesend prüfen**, dass `default_transaction_isolation` für Datenbank und Rolle `supabase_auth_admin` auf `read committed` steht.
- **B-5 behoben (21.11.2026):** Direktes `delete from public.characters` (Dashboard, `service_role`, `postgres`) ∥ `delete_character` desselben Charakters verklemmt sich nicht mehr, weil `delete_character` die Charakterzeile vor der Beratungssperre nimmt (Test B2-11, beide Reihenfolgen). Rechte unverändert. **Einziger verbleibender Restfall dieses Musters (B-4c, bestand vorher, nicht per RPC lösbar):** direktes Löschen eines Charakters ∥ `delete_account` desselben Kontos → genau ein 40P01 (Test V6-8c), weil PostgreSQL beim direkten DELETE die Zeile vor jedem Trigger sperrt. Betriebsempfehlung bleibt: Charaktere über `delete_character`, Konten über `delete_account`/`auth.users` löschen.
- **Betriebsregel B-6: Mehrzeilen-Löschungen ∥ `create_group` (entstanden mit den Beratungssperren aus V5/B2, unabhängig von B-5; gilt bis zu einer technischen Lösung).**
  - *Ursache:* Ein einzelnes DELETE über mehrere Charakterzeilen nimmt die Beratungssperren A in der Reihenfolge der gelöschten Zeilen (AFTER-Trigger `on_character_deleted` je Zeile). `rwi.create_group` nimmt A dagegen sortiert nach Schlüssel. Liegen die Zeilen in anderer Reihenfolge als die Schlüssel, hält jede Seite eine Sperre, die die andere braucht.
  - *Reproduziert* (rw-instanzkampf, Probe R6, PG16 und PG17): `delete from public.characters where account_id = <K>` (zwei Charaktere) ∥ `rwi.create_group('dungeon', array[<beide Charaktere>], 2)` → genau ein 40P01. Atomar: die abgebrochene Seite wird vollständig zurückgerollt; `create_group` wäre hier ohnehin mit `account_duplicate` gescheitert.
  - *Nur analysiert, nicht getestet:* Löschung **mehrerer Konten in einer Anweisung/Transaktion** (z. B. `delete from auth.users where …` über mehrere Konten, `supabase/dev/cleanup_test_accounts.sql`, Mehrfachauswahl im Dashboard) ∥ `create_group` mit Spielern aus diesen Konten: `on_profile_deleting` sperrt sortiert **je Konto**, nicht über alle Konten → gleicher Zyklus möglich.
  - *Nicht betroffen:* `delete_character`, `delete_account` und die Löschung **eines** Kontos (je eine sortierte Sperrmenge, keine zweite Sperrfolge).
  - **Einschränkung bis zur Lösung:** (1) Charaktere nie per Mehrzeilen-DELETE löschen – je Charakter eine eigene Transaktion, bevorzugt `delete_character`, Konten über `delete_account` oder `delete from auth.users` **je Konto einzeln**. (2) Mehrere Konten gleichzeitig (z. B. `cleanup_test_accounts.sql` auf Dev) nur löschen, wenn keine Gruppenbildung (`create_group`) laufen kann, also bei angehaltenem Gruppen-/Worker-Betrieb. (3) Tritt dennoch 40P01 auf: nichts reparieren, der Vorgang ist atomar – einfach wiederholen.
  - *Technische Lösung offen* (z. B. Sperren vorab sortiert in einem BEFORE-STATEMENT-Weg, gemeinsam mit B-4c (V6-8c) zu entscheiden).
- **Bestand, nicht durch B2:** `rwi.create_group` übernimmt Spielerschlüssel unverändert; die Löschbereinigung vergleicht kleingeschrieben. Übergibt ein Serverpfad UUID-Schlüssel in Großbuchstaben, fände die Bereinigung das Mitglied nicht. Vorschlag (offen): Schlüssel in `create_group` normalisieren oder abweisen.
- **B-4 behoben (21.11.2026, `docs/B4_BERICHT.md`):** `delete_account` ∥ `save_character`/`move_character` desselben Kontos verklemmt sich nicht mehr. save/move sperren zuerst das eigene Profil (for key share), dann die Charakterzeile; `delete_account` hält das Profil (for update), der jeweils Zweite wartet am Profil, ohne eine Schreibsperre zu halten. Nach einer Kontolöschung endet save mit `version_conflict` (PT409), move mit `not_found` (PT404) – wie bisher bei fehlendem Charakter. Tests V6-8 (beide Reihenfolgen), V6-15 (Migration/Rollback), Mischung V6-13 B (0 × 40P01). Migration `supabase/migration_b4_speichern_reihenfolge.sql` (nicht angewendet).

## Fehlerklassen (so getestet, Fehlerinjektion)
| Fehler | Wirkung |
|---|---|
| Fehler in `rwi.leave` (Stufe 1) | **abgefangen**, Stufe 2 übernimmt, Alarm `char_cleanup_failed`. Das Löschen gelingt, das Mitglied ist `left/freiwillig`. |
| Fehler in Stufe 2 (minimale Bereinigung) | **bricht alles ab**: Charakter bzw. Konto, Profil, Löschsicherung, Protokoll, Zahlungsereignisse und Instanzdaten bleiben unverändert; auch der Alarm der Stufe 1 wird zurückgerollt. Wiederholbar nach Behebung. |
| Fehler in der Folgeprüfung (nach Stufe 1 oder 2) | **bricht alles ab** (wie oben). Vorher wurde er nur protokolliert; das konnte eine Instanz unter Mindestgröße zurücklassen. |
| Fehler beim Entfernen des Spielerprofils, Sperrfehler, Deadlock, Timeout | **bricht alles ab** (nicht abgefangen). |
| Fehler außerhalb der Instanzbereinigung (z. B. Löschsicherung, Kaskade) | **bricht alles ab**. |

Merksatz: Es wird genau **ein** Fehler abgefangen (Stufe 1, `rwi.leave`), und nur, weil Stufe 2 danach denselben Endzustand ohne Spiellogik erzeugt. Alles andere rollt die gesamte Löschung zurück.

## Verhalten in laufenden Situationen (getestet)
- Laufende Runde / Gruppenpause: Austritt wie regulär; die Pause bleibt, endet die Instanz mangels Mitgliedern, ist sie `aborted`.
- Bereits bestätigte Aktion: bleibt als Verlauf stehen; der Spieler gilt im nächsten Snapshot als ausgetreten.
- Laufende Rundenauflösung: Snapshot bleibt gültig, der Commit gelingt; sind danach alle ausgetreten, wird der späte Commit abgewiesen.
- Gleichzeitige Löschungen in gegenläufiger Instanzreihenfolge: kein Deadlock (Kontrollversuch ohne Vorab-Sperre zeigt den Deadlock).
- Konto mit mehreren Charakteren in mehreren Instanzen: alle werden bereinigt, oder nichts.

## Grenzen
Echtes `delete_account` mit GoTrue-Sitzung, PostgREST und der Supabase-Datenbankkonfiguration ist nur gegen die lokale Attrappe belegt, nicht gegen ein echtes Dev-Projekt.

# Lösch­vorgang (Charakter / Konto) und Instanzdaten: was abgefangen wird, was alles abbricht

Umgesetzt in `server/instance/sql/05_produktion.sql` (`rwi.on_character_deleted`, `rwi.on_profile_deleting`, `rwi.on_profile_deleted`). Tests: `server/instance/tests/loesch-trigger.mjs` (59 Prüfungen), `konto-regel.mjs`, `konto-integration.mjs`.

## Beschluss
Eine Charakter- oder Kontolöschung wird **vollständig zurückgerollt**, wenn auch die minimale Instanzbereinigung scheitert. **Ein Geistermitglied (aktives Mitglied ohne Charakter) darf nie als akzeptierter Endzustand zurückbleiben.**

## Ablauf je gelöschtem Charakter (eine Transaktion mit der Löschung selbst)
1. Kontolöschung: `BEFORE DELETE` auf `public.profiles` sperrt alle aktiven Instanzen des Kontos in aufsteigender ID (verhindert Deadlocks zwischen gleichzeitigen Löschungen).
2. `AFTER DELETE` auf `public.characters` je Charakter (nur `OLD.character_id`; Konto, Profil und Charakterzeile sind zu diesem Zeitpunkt nicht mehr sichtbar, `rwi.leave` braucht sie nicht).
3. **Stufe 1:** `rwi.leave` (reguläre Spiellogik, freiwilliger Austritt).
4. **Stufe 2** (nur wenn Stufe 1 einen Fehler wirft): minimale Bereinigung ohne Spiellogik: Wartelisteneintrag stornieren, Mitglied auf `left`/`freiwillig`, ausstehende Beute entfällt, Alarm `char_cleanup_failed`.
5. **Folgeprüfung** `rwi.after_auto_removal` (Mindestgröße, Abbruch, Nachrücken).
6. Spielerprofil `rwi.players` entfernen. Am Ende `AFTER DELETE` auf `profiles`: Kontokennung aus Mitglieds-/Wartelistenzeilen entfernen (Zeilen bleiben als anonymer Verlauf).

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

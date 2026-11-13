# Phase 3 – Cloud-Spielbetrieb: Analyse und Entwicklungsplan

Stand: Analyse von Commit e2eb942 (13.11.2026). Es ist **nichts implementiert**; keine Schemaänderung ohne Freigabe.

## 1. Ist-Zustand (aus dem Code)
- **Spielstand** = ein Objekt `S` im Speicher (`def()`/`sanitize()`), gemessen: Grundzustand 0,6 KB, ein vollgepackter Test (alle Items ×999, 400 Cooldowns, 60 Quests) 13 KB; Ausrüstung kommt hinzu. Serverlimit 1 MB, Client-Grenze 900 KB.
- **Laden beim Start ist synchron**: `KEY = slotKey(SLOT)` (Konstante), `tryLoad()` → `S`, danach läuft der ganze Rest des Skripts auf diesem `S`. Cloud-Daten sind asynchron → müssen *vor* dem Spielstart bzw. über einen lokalen Zwischenspeicher kommen.
- **Speichern**: `save()` schreibt `S` mit rollender Sicherung (`_bak`, `_corrupt`) in `KEY`. Aufgerufen an ~23 Stellen, alle 5 s vom Sekundentakt, bei `visibilitychange`/`pagehide`.
- **Unruhige Felder**: `S.last`, `S.played`, `S.lp`, `hp`, `en` ändern sich jede Sekunde. Der Stand ist deshalb nie „unverändert“ → für die Cloud braucht es eine eigene Änderungserkennung.
- **Charakterwechsel** = `save()` + `noSave` + Neuladen (`switchSlot`): hält Charaktere vollständig getrennt. Das bleibt so.
- **Slot 3**: lokal nur Platzhalter `ENT`; die echte Absicherung liegt im Schema (RLS verbirgt Platz-3-Zeile ohne aktive Berechtigung, `save_character` → `character_locked`, Trigger blockiert Anlegen).
- **Konto-Code (Phase 2)**: `sbAuthed` mit Token-Erneuerung, `list_characters`, `create_character`, `cloudmap`. Cloud-Charaktere werden nur angezeigt/hochgeladen.
- **Schema**: `save_character(id, erwartete_version, daten)` mit Versionsprüfung und Sicherung (letzte 10). Lesen der Daten: direkter `select` auf `characters` (RLS: nur eigene, Platz 3 nur mit Berechtigung). Keine Änderung nötig, **eine empfohlen** (siehe 4).

## 2. Architektur (Empfehlung)
**Offline-first mit lokalem Zwischenspeicher („Outbox“):** Der Cloud-Charakter wird gespielt wie ein lokaler. Jedes Gerät hält pro Cloud-Charakter eine Kopie im Browser; ein Sync-Modul gleicht sie mit dem Server ab. Das Spiel selbst merkt davon nur den neuen „Speicherort“.
- **Aktiver Charakter** wird eine Beschreibung statt nur einer Zahl: `{lokal, Platz n}` oder `{cloud, cloudId}`. `KEY` leitet sich daraus ab (lokal unverändert; Cloud: `ruinwalk_cc_<cloudId>` mit eigenem `_bak`/`_corrupt`). Dadurch gilt die bestehende, getestete Speicher-/Backup-Logik unverändert auch für Cloud-Charaktere.
- **Meta je Cloud-Charakter** (`ruinwalk_cm_<cloudId>`): Konto-ID, Platz, `baseVersion` (letzte vom Server bestätigte Version), `dirty`, Zeit der letzten Synchronisierung, Hash des zuletzt bestätigten Stands.
- **Start eines Cloud-Charakters:** (1) lokale Kopie laden, (2) kurzer Abgleich mit dem Server (Zeitlimit ~6 s, Ladehinweis), (3) Fälle: Server = Basis & lokal sauber → weiterspielen; Server neuer & lokal sauber → Serverstand übernehmen (geprüft per `sanitize`); Server gleich & lokal dirty → weiterspielen, später hochladen; **beide verändert → Konfliktdialog**; kein Netz → mit lokaler Kopie spielen, Status „nicht synchronisiert“. Spielstart wird nie durch fehlendes Netz verhindert (außer Platz 3, siehe 5).
- **Speichern in die Cloud:** `save_character` mit `baseVersion`; eine Anfrage gleichzeitig; Änderungen während der Anfrage bleiben dirty. Auslöser: Wichtige Ereignisse (Levelaufstieg, Ausrüstung, Quest, Herstellen, Boss) nach ~3 s Verzögerung; sonst höchstens alle 60 s, nur wenn sich außer den unruhigen Feldern etwas geändert hat; beim Verlassen/Verstecken der Seite (best effort, `keepalive`); vor Charakterwechsel/Abmelden; Knopf „Jetzt speichern“.
- **Fehler:** Netz/5xx/429 → dirty bleibt, Wiederholung mit wachsendem Abstand (15 s → 5 min), Statusanzeige (☁️ ok / ⏳ wartet / ⚠️ offline). Abgelaufene Anmeldung → **ohne Neuladen** neu anmelden, Spielstand bleibt im Speicher. `version_conflict` → Konfliktdialog. `character_locked` → Spiel sofort in den Sperrzustand.
- **Konfliktdialog** (nie stillschweigend): „Dieses Gerät behalten“ (überschreibt Cloud; der Cloud-Stand bleibt über die serverseitige Sicherung erhalten) oder „Cloud-Stand laden“ (lokaler Stand wird als lokale Kopie gesichert, nicht gelöscht). Beide Stände sind danach noch vorhanden.
- **Unabhängigkeit:** Jeder Charakter hat eigene Schlüssel, eigene Version, eigenen Zwischenspeicher; Wechsel bleibt Speichern + Neuladen. Kein gemeinsamer Zustand zwischen Charakteren.

## 3. Betroffene Stellen im Code (klein halten)
1. Platzlogik (`SLOT`, `KEY`, `slotInfo`, `switchSlot`, `charsUI`): Beschreibung `{lokal|cloud}` statt Zahl. Rest des Spiels nutzt weiter `KEY`/`save()`.
2. Neues Modul `Sync` (Meta, Änderungserkennung, Warteschlange, Konflikte, Statusanzeige). Spielmechanik, GPS, Kampf, Inventar, Crafting, Quests: **keine Änderung**.
3. Konto-Bildschirm: Cloud-Charakter „Spielen“, „Neuer Cloud-Charakter“ (Platz 1/2), Status, Konfliktdialog, „Jetzt speichern“.
4. Hochgeladene lokale Charaktere (siehe Entscheidung A).
5. Kleine Statuszeile im HUD (nur bei Cloud-Charakteren).

## 4. Schema
- **Keine Änderung nötig** für Laden/Speichern/Konflikte.
- **Empfohlen (S1) – Sicherungen ausdünnen:** Jede Cloud-Speicherung legt per Trigger eine Sicherung ab, es bleiben 10. Bei Speichern alle 1–2 Minuten deckt das nur ~10–20 Minuten ab – zu wenig, um einen später bemerkten Fehler zurückzurollen. Vorschlag: neue Sicherung nur, wenn die letzte älter als 10 Minuten ist (plus Sicherung beim Löschen wie bisher). Wirkung: ≥ 100 Minuten Verlauf, weniger Speicherverbrauch. Braucht Migration + angepasste SQL-Tests + Live-Prüfung; ohne Freigabe nicht umgesetzt.
- Nicht geplant: serverseitige Plausibilitätsprüfung des Fortschritts (Anti-Cheat). Aktuell vertraut der Server den Clientdaten (nur Form/Größe/Level-Klammer). Für ein Einzelspieler-GPS-Spiel akzeptabel; vor Handel/Ranglisten neu bewerten.

## 5. Platz 3 (nur serverseitig echte Sperre)
- Der Client berechnet nie selbst, ob Platz 3 offen ist. Maßgeblich ist nur `list_characters().locked` und die Serverantworten. `ENT` bleibt Platzhalter; keine Kauffunktion.
- Ohne Berechtigung liefert der Server die Zeile nicht (RLS) und lehnt Speichern ab. Tests prüfen das gegen die echte Datenbank.
- **Ehrliche Grenze:** Eine lokale Kopie lässt sich im Browser nie wirklich schützen. Daher: Platz-3-Charakter startet nur nach erfolgreicher Server-Prüfung (kein Offline-Spiel), und `character_locked` bei einer Speicherung sperrt sofort. Die Daten auf dem Server bleiben ohne Berechtigung unerreichbar und unverändert.

## 6. Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| `KEY` ist eine Konstante, die überall gilt | zentral ableiten, alle bestehenden Speichertests laufen weiter; Cloud-Schlüssel nutzen dieselbe Logik |
| Zwei Geräte/Tabs spielen denselben Charakter | Versionsprüfung + Konfliktdialog; optional Tab-Sperre per `localStorage` |
| Serverdaten beschädigt/manipuliert | immer durch `sanitize()`, ungültig → nicht übernehmen, lokale Kopie behalten |
| Speichern beim Schließen unzuverlässig (Mobil) | lokale Kopie ist sofort aktuell; Sync beim nächsten Start (Outbox) |
| Anmeldung läuft mitten im Spiel ab | stiller Refresh; sonst Hinweis + Neuanmeldung ohne Neuladen |
| Browser-Speicher voll (Kopie + Backup je Charakter) | Größenprüfung, Warnhinweis, bestehende Fehlerbehandlung von `save()` |
| Zu viele Serveranfragen/Speicherverbrauch | Drosselung (60 s), Änderungserkennung, Ausdünnung S1; ~10 Sicherungen × Größe je Charakter einplanen |
| Doppelte Wahrheit lokal ↔ Cloud nach Upload | Entscheidung A |
| Abmelden mit ungesendeten Änderungen | vorher Sync-Versuch, sonst Warnung; Änderungen bleiben auf dem Gerät und gehen beim nächsten Login nach oben, nie löschen |

## 7. Testplan
- **Spieltests (bestehend):** alle 122 müssen grün bleiben.
- **Neue Sync-Tests** (Attrappe wie in Phase 2, erweitert um Laden/Speichern/Versionen): Start online/offline/Zeitüberschreitung · Erstspeichern, Folgespeichern, Drosselung, Änderungserkennung (unruhige Felder lösen keinen Upload aus) · Wiederherstellung nach Neuladen und auf „zweitem Gerät“ · Konflikt (beide Varianten, nichts geht verloren) · Netz weg/zurück, Wiederholung, 429/5xx · Token abgelaufen mitten im Spiel · `character_locked`, Platz-3-Pfad · Charakterunabhängigkeit (zwei Cloud- + ein lokaler Charakter) · beschädigte Serverdaten · Abmelden mit offenen Änderungen · lokale Spielstände byte-identisch.
- **Datenbank:** SQL-Tests bleiben; neue Live-Prüfung (`live_rls_test.sql` erweitert): `select` der eigenen Charakterdaten, Platz 3 ohne Berechtigung nicht lesbar/speicherbar, Versionsfolgen, Sicherungsanzahl (falls S1).
- **Manuell (du):** zwei Geräte/Browser, Flugmodus-Test, Konflikt, Platz-3-Sperre über die Datenbank simuliert.

## 8. Reihenfolge
1. **3a Fundament:** aktive-Charakter-Beschreibung, Cloud-Schlüssel, Meta (ohne Netz, rein lokal getestet).
2. **3b Laden/Spielen:** Cloud-Charakter starten (Abgleich beim Start), „Neuer Cloud-Charakter“.
3. **3c Speichern:** Änderungserkennung, Auslöser, Wiederholung, Statusanzeige.
4. **3d Konflikte & Sitzung:** Konfliktdialog, stille Neuanmeldung, Abmelden mit offenen Änderungen.
5. **3e Platz 3 & Sperrzustand:** `locked`-Pfade, Verschieben gesperrter Charaktere in der Oberfläche.
6. **3f Härtung:** Tab-Sperre (optional), Live-Prüfung, Bericht. Pro Schritt: Tests grün, Commit, kurzer Bericht.

## 9. Offene Entscheidungen
- **A – Hochgeladene lokale Charaktere:** (1) lokales Original bleibt unabhängig spielbar (Kopien driften auseinander), (2) Original wird als „in Cloud“ markiert, Spielen läuft über die Cloud-Version, das Original bleibt als Sicherung unangetastet *(empfohlen)*.
- **B – Schema S1** (Sicherungen ausdünnen) freigeben?
- **C – Platz 3:** nur online spielbar *(empfohlen)* oder auch mit lokaler Kopie offline?
- **D – Neuer Cloud-Charakter** direkt in Phase 3 (Platz 1/2) oder zunächst nur Upload bestehender?

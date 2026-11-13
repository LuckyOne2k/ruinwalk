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

## 9. Entscheidungen (13.11.2026, vom Auftraggeber bestätigt)
- **A:** Hochgeladene lokale Charaktere werden als „in Cloud“ markiert; Spielen läuft über die Cloud-Version, das lokale Original bleibt unangetastet als Sicherung.
- **B:** Schema-Änderung S1 ist freigegeben (neue Sicherung nur, wenn die letzte älter als 10 Minuten ist). Umsetzung mit Migration, angepassten SQL-Tests und Live-Prüfung, vor dem produktiven Einspielen kurz berichten.
- **C:** Platz 3 nur online spielbar (Start nur nach erfolgreicher Server-Prüfung).
- **D:** Neue Cloud-Charaktere können in Phase 3 direkt auf Platz 1/2 angelegt werden.
- Status: Plan freigegeben, Umsetzung beginnt mit 3a nach ausdrücklichem Start.

## 10. Fortschritt
### 3a Fundament – erledigt (13.11.2026)
- **Aktiver Charakter** ist jetzt `ACTIVE` = `{type:'local', slot}` oder `{type:'cloud', id}`; `SLOT` bleibt der lokale Platz (0, wenn ein Cloud-Charakter aktiv ist). Auswahl in `ruinwalk_slot` (`1`–`3` wie bisher oder `c:<uuid>`).
- **Eigene Schlüssel für Cloud-Charaktere:** `ruinwalk_cc_<id>` (Zwischenspeicher, mit eigenem `_bak`/`_corrupt` über die unveränderte `save()`-Logik) und `ruinwalk_cm_<id>` (Sync-Daten: Konto, Platz, `baseVersion`, `dirty`, `syncedAt`). Kein Schlüssel- oder Präfix-Überschneidung mit `ruinwalk_v1*`.
- **Sicherheitsregeln im Code:** ungültige/unvollständige Cloud-Auswahl → lokaler Platz 1 (nur im Speicher, nichts überschrieben); unlesbarer Cloud-Zwischenspeicher ohne Backup → `noSave`, Rohdaten nach `_corrupt`, Ausweichen auf Platz 1, nie ein leerer Stand gespeichert; `S.cid` = Cloud-ID erzwungen; `cloudCachePut` überschreibt nie Vorhandenes; Zwischenspeicher werden nie automatisch gelöscht; `save()` ändert die Sync-Daten nicht.
- **Neue Hilfen (noch ohne Oberfläche/Netz):** `readMeta`, `writeMeta`, `cloudCachePut`, `cloudCaches`, `switchCloud`.
- **Tests:** 13 neue (`tests/cases/cloudbase.js`), gesamt **135/135**. Absichtlich eingebaute Fehler (Cloud schreibt in lokalen Schlüssel; Identität nicht erzwungen) werden von den Tests erkannt.
- Nicht geändert: Live-Supabase, Schema, Spielmechanik, GPS, Kampf, Inventar, Quests, Konto-Code.

### 3b Cloud-Charaktere laden, starten, anlegen – erledigt (13.11.2026)
- **Starten (`acPlay`)** nur nach vollständiger Serverprüfung: frische `list_characters` (Zeile vorhanden, `locked === false`) → Lesen der Zeile aus `characters` (RLS) → `character_id`, `account_id` (= angemeldetes Konto), Platz und Version müssen zur Liste passen → Spielstand muss plausibel sein (`cloudState`: Level ≥ 1, `inv`/`stats` Objekte, `tools` Liste; nie ein per `sanitize` erfundener Leerstand). Danach Entscheidung `cloudStartPlan`:
  - kein Zwischenspeicher → anlegen (`cloudCachePut`, überschreibt nie);
  - Zwischenspeicher passt zur Serverversion → damit weiterspielen (bei Änderungen `dirty:true`);
  - Server neuer und Zwischenspeicher unverändert (`baseHash`) → Ersetzen, alter Stand bleibt als `ruinwalk_cc_<id>_replaced_<zeit>`;
  - Server neuer, Zwischenspeicher verändert (Konflikt), Server älter, fremdes Konto/Platz, beschädigt, unvollständig → **Abbruch ohne jede Änderung** mit verständlicher Meldung.
- **Neu anlegen (`acCreateCloud`)** nur Platz 1 und 2 (Platz 3 wird clientseitig immer abgelehnt; serverseitig sperrt zusätzlich RLS/`create_character`). Ablauf: `create_character` → Nachprüfung per Lesen (ID, Konto, Platz, Version, Spielstand) → Zwischenspeicher → Start. Schlägt etwas fehl, bleibt der Charakter ggf. auf dem Server und lässt sich später per „Spielen“ starten; lokal ändert sich nichts.
- **Offline/Fehler:** ohne erfolgreiche Serverprüfung wird nie ein Cloud-Charakter gestartet (auch nicht aus vorhandenem Zwischenspeicher).
- **Oberfläche:** Konto → Cloud-Plätze: „▶ Spielen“/„Weiterspielen“ + „aktiv“, Namensfeld + „Neuen Cloud-Charakter erstellen“ auf freien Plätzen 1/2, Hinweis zum Geräte-Fortschritt; Charakterbildschirm: lokale Charaktere mit Cloud-Kopie tragen den Vermerk „☁️ Kopie liegt in der Cloud“ (Entscheidung A, nur Anzeige).
- **Hash:** `syncHash` ignoriert `last/played/lp/hp/en` und den Migrationsmarker `gv`.
- **Tests:** 23 neue (`tests/cases/cloudplay.js`), gesamt **158/158**. Eingebaute Fehler (Kontoprüfung, Sperrprüfung, Überschreiben bei Konflikt, Plausibilitätsprüfung, Platz 3) werden erkannt.
- **Bekannte Einschränkungen:** (1) Kein Offline-Start von Cloud-Charakteren. (2) Der Fortschritt eines Cloud-Charakters liegt bis 3c nur auf dem Gerät (Hinweis in der Oberfläche); der Server wird in 3b nie beschrieben. (3) Konflikte/beschädigte/unvollständige Zwischenspeicher werden nur verweigert, die Auflösung folgt in 3d. (4) Verschieben von Platz 3 (3e) ist nicht behandelt. (5) Echtes Supabase ist aus der Testumgebung nicht erreichbar → Tests laufen gegen die Attrappe; praktischer Test durch dich nötig.
- Nicht geändert: Live-Supabase/Schema (S1 weiterhin nicht angewendet), Spielmechanik, GPS, Kampf, Inventar, Quests, Passwortregeln, lokale Spielstände/Backups.

### 3c Cloud-Speichern und Synchronisierung – erledigt (13.11.2026)
- **Prinzip:** Ein aktiver Cloud-Charakter wird wie bisher lokal gesichert (`save()`, unverändert); zusätzlich lädt das neue Modul (`SY`, `syncTick/syncPush/syncFlush`) den Stand per `save_character(id, erwartete_version, daten)` hoch. Der Server wird nie blind überschrieben: jede Anfrage trägt die zuletzt bestätigte Version (`baseVersion`).
- **Änderungserkennung:** `syncHash` (ohne `last/played/lp/hp/en/gv`) alle 5 s und bei Schlüsselereignissen (Level, Ausrüstung, Quests, Herstellen, Boss, Klasse). Sekündliche Statusänderungen lösen nie einen Upload aus. `meta.dirty` wird sofort persistiert, damit offene Änderungen Neuladen/Schließen überleben.
- **Drosselung:** normale Änderungen höchstens alle 60 s, Schlüsselereignisse nach 3 s (mindestens 10 s Abstand), nur eine Anfrage gleichzeitig; Änderungen während einer Anfrage bleiben „dirty“. Die erste Änderung nach dem Start wird ohne Wartezeit (nach 5 s Startpuffer) gesendet.
- **Bestätigung:** nur eine ganzzahlige, höhere Version vom Server zählt; dann `baseVersion/baseHash/syncedAt` aktualisieren, `dirty` nur löschen, wenn der Stand inzwischen unverändert ist.
- **Verlorene Antworten:** vor jedem Senden steht `meta.pend = {h, from}`. Kommt ein Speichern an, ohne dass der Client es erfährt (Netz weg, Seite geschlossen), erkennt `syncAdopt` es beim nächsten Versuch bzw. beim Start (auch in 3b `acPlay`) an Version `from+1` und gleichem Fingerabdruck und übernimmt es als eigenen Stand – kein falscher Konflikt, keine Doppelversion.
- **Seite verlassen/verstecken:** `syncFlush` markiert offene Änderungen und sendet best effort per `keepalive` (Grenze 60 KB).
- **Fehler (alle sichtbar, nichts geht verloren):** Netz/408 → „offline“, 5xx/429/unerwartete Antwort → „Serverfehler“, jeweils Wiederholung 15 s → 5 min (verdoppelnd), online-Ereignis setzt zurück. 409 `version_conflict` → erst Selbst-Prüfung (`syncVerify`), sonst Status „Konflikt“, keine weiteren Versuche, nichts überschrieben. `character_locked` → „gesperrt“, Stopp. Abgelaufene Anmeldung / anderes Konto / unbestätigte E-Mail → „Anmeldung nötig“, Fortschritt bleibt lokal, Fortsetzung nach Anmeldung des richtigen Kontos (Konto-Prüfung `meta.uid`). Sonstige 4xx und zu große Stände (> 900 KB) → „abgelehnt“.
- **Anzeige:** Statuszeile oben links (nur bei Cloud-Charakteren, Tippen = „Jetzt speichern“), im Konto ein Block „Speicherstatus“ mit Hilfetext und Knopf.
- **Tests:** 19 neue (`tests/cases/cloudsync.js`), gesamt **177/177**. Absichtlich eingebaute Fehler (flüchtige Felder im Hash, kein Übernehmen eigener Speicherungen, Weitersenden im Konflikt, kein Schnellpfad, keine Kontoprüfung) werden erkannt.
- **Offene Punkte / Grenzen:** (1) Konflikt-Dialog und stille Neuanmeldung (3d), Sperrzustand/Verschieben (3e), Tab-Sperre/Live-Prüfung (3f) fehlen bewusst – im Konfliktfall zeigt das Spiel nur den Status. (2) Zwei Tabs/Geräte am selben Charakter werden nur über die Versionsprüfung abgefangen. (3) `keepalive` ist auf ~64 KB begrenzt; größere Stände werden beim nächsten Start gesendet (lokal sicher). (4) Schema-Änderung S1 (Sicherungen ausdünnen) ist weiterhin **nicht** angewendet; bis dahin überschreiben Uploads alle 60 s die letzten 10 Sicherungen schnell (≈ 10–20 Min Verlauf). (5) Client gegen das echte Supabase ist aus der Testumgebung nicht prüfbar – praktischer Test durch dich nötig (Flugmodus, zwei Browser).

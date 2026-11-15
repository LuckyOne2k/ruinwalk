# D4 – Plan: Kontolöschung im Client (Entwurf, nichts umgesetzt, nichts live)

Stand: 15.11.2026 · Voraussetzung: D3 abgeschlossen (`docs/D3_PRUEFBERICHT.md`). Server (`delete_account`) bleibt unverändert.

## 1. Grundsätze
- Server entscheidet (Sitzung ≤ 2 Min, Methode `password`, Benutzername). Der Client macht nur den Ablauf sicher und verständlich.
- Kontolöschung ≠ Charakterlöschung ≠ Abmelden. Eigener, getrennter Bereich im Konto-Bildschirm („Konto löschen“, abgesetzt, nicht neben „Abmelden“).
- Lokale Charaktere (`ruinwalk_v1*`), lokale Backups, Gerätekopien (`ruinwalk_cc_*_srvcopy_*`/`_replaced_*`) und `ruinwalk_hab` werden **nie** ungefragt angefasst. Spielmechanik unverändert.

## 2. Ablauf (Ansicht `acV='delete'`)
**Schritt 1 – Warnung (verständlich, ohne Juristendeutsch)**
- Was gelöscht wird: Konto (E-Mail, Benutzername), alle Cloud-Charaktere inkl. Platz 3, Server-Sicherungen, Berechtigungen, Protokolleinträge. Endgültig, keine Wiederherstellung, auch nicht durch uns.
- Was bleibt: alle lokalen Charaktere und Sicherungen auf diesem Gerät; Zahlungsdaten (falls es je welche gibt) nur anonym (Betrag/Währung) wegen Aufbewahrungspflichten.
- Was mit Cloud-Charakteren auf diesem Gerät passiert (siehe 4).
- Nicht gespeicherte Änderungen (`acOpenChanges`) werden aufgelistet: sie gehen für die Cloud verloren.
- Knopf „Meine Daten als JSON herunterladen“ (siehe 5) und „Abbrechen“.

**Schritt 2 – Bestätigung (alles Pflicht)**
1. Häkchen: „Mir ist klar, dass die Löschung endgültig ist.“
2. Benutzernamen eintippen (Vergleich ohne Groß-/Kleinschreibung wie der Server).
3. Passwort eingeben (`autocomplete="current-password"`).
4. Optional, **Standard aus**: „Auch meine lokalen Erkundungsdaten (besuchte Kartenbereiche) auf diesem Gerät löschen.“ mit Erklärung: betrifft nur die Karte, keine Charaktere.
5. Knopf „Konto endgültig löschen“ ist deaktiviert, bis 1–3 erfüllt sind.

**Schritt 3 – Ausführung (`acDelGo`, nur ein Durchlauf gleichzeitig)**
1. Sperre: `acDelRun=true`, Knopf deaktiviert, Sync und Tab-Lebenszeichen pausieren (kein Schreiben in die Cloud während der Löschung).
2. Passwort aus dem Feld lesen, Feld sofort leeren, Variable nach dem Aufruf überschreiben.
3. **Frische Anmeldung direkt bei Supabase Auth:** `POST /auth/v1/token?grant_type=password` mit E-Mail der aktuellen Sitzung. Die neue Sitzung liegt **nur im Arbeitsspeicher** (nicht in `ruinwalk_auth`).
4. Client-Gegenprobe (zusätzlich, nicht maßgeblich): `user.id` gleich der angemeldeten Konto-ID; JWT-`amr` enthält `password`; sonst Abbruch.
5. `POST /rest/v1/rpc/delete_account` mit **dem frischen Token** (nicht über `sbAuthed`, das die gespeicherte Sitzung nähme) und `p_confirm` = eingetippter Benutzername. Abstand zwischen 3 und 5 so kurz wie möglich (Server-Fenster 2 Min.).
6. Ergebnis auswerten (Tabelle unten).

| Antwort | Bedeutung | Verhalten (nichts wird lokal gelöscht, außer bei Erfolg) |
|---|---|---|
| Login 400 `invalid_credentials` | Passwort falsch | Meldung, Feld leer, Sitzung bleibt, nichts gelöscht |
| Login 429/Netz/5xx | Server/Verbindung | „Nichts wurde gelöscht“, erneut versuchen |
| Login ok, `amr` ≠ `password` oder fremde ID | unerwartet | Abbruch, nichts gelöscht |
| RPC 403 `reauth_required` | Fenster abgelaufen oder keine Passwort-Sitzung | „Bitte Passwort erneut eingeben“, nichts gelöscht |
| RPC 22023 `confirm_mismatch` | Name falsch | Meldung am Namensfeld |
| RPC 401/42501 | Token ungültig | Meldung, nichts gelöscht |
| RPC 404 `not_found` | Konto existiert nicht mehr | wie Erfolg behandeln (Aufräumen), Hinweis |
| RPC Netzfehler/Timeout/5xx | **Ausgang unklar** | Prüfung: `GET /auth/v1/user` mit frischem Token. 200 → Konto besteht, „nicht gelöscht, bitte erneut“. 401/403/404 → Konto ist weg → Erfolgsweg. Prüfung selbst scheitert → Zustand „unklar“: Sitzung bleibt, Hinweis „Melde dich neu an; bei „E-Mail oder Passwort falsch“ ist das Konto gelöscht“ |
| RPC 204 | gelöscht | Erfolgsweg |

## 3. Erfolgsweg (lokal)
- `authStore(null)` (entfernt `ruinwalk_auth`), Konto-Zuordnungen dieses Kontos aus `ruinwalk_cloudmap` entfernen (nur Zuordnungstabelle, keine Spielstände), Sync/Timer stoppen, Fenster-Sperren (`ruinwalk_tl_*`) dieses Kontos freigeben.
- Optional (nur bei Häkchen): `ruinwalk_hab` löschen.
- Wenn der aktive Charakter ein Cloud-Charakter dieses Kontos ist: nur den Zeiger `ruinwalk_slot` auf lokalen Platz 1 setzen (keine Daten löschen), Seite neu laden.
- Start im Gast-/Startbildschirm mit klarer Meldung „Dein Konto wurde gelöscht. Deine lokalen Spielstände sind unverändert.“ (Hinweis über `sessionStorage`, nur einmal anzeigen).
- Nach Erfolg: gleiche E-Mail/gleicher Benutzername lassen sich neu registrieren; Anmeldung mit altem Konto scheitert.

## 4. Cloud-Charaktere auf diesem Gerät
Die Zwischenspeicher `ruinwalk_cc_<id>` / `ruinwalk_cm_<id>` bleiben **unverändert** erhalten (Regel: nie automatisch löschen). Danach gehören sie zu keinem Konto mehr. Vorschlag: Sie erscheinen im Konto-Bereich unter „Gerätekopien“ wie die bestehenden Sicherungskopien und können nur durch eine ausdrückliche Aktion gelöscht werden. Die Übernahme als lokaler Charakter ist **nicht** Teil von D4 (eigener Schritt, falls gewünscht). Der JSON-Export (Abschnitt 5) ist der empfohlene Weg, die Daten mitzunehmen.
**Offene Entscheidung A:** Reicht das (Kopien bleiben, kein Auto-Löschen, Export vorhanden) oder soll „als lokalen Charakter übernehmen“ (braucht freien Platz) in D4?

## 5. JSON-Export (vor der Löschung)
- Quelle: eigene Zeilen über die vorhandenen Lesezugriffe (RLS) – Profil, Cloud-Charaktere (Platz, Name, Daten, Version, Zeitstempel), Berechtigungen. Server-Sicherungen sind für den Client nicht lesbar; sie werden mit dem Konto gelöscht und sind nicht Teil des Exports (wird im Text gesagt).
- Download per Blob, Dateiname `ruinwalk_konto_export_<Datum>.json`, enthält Hinweis, dass die Datei persönliche Daten enthält.
- Kein Zwang: Der Export ist angeboten und im Bestätigungstext ausdrücklich erwähnt. **Offene Entscheidung B:** Soll der Löschknopf erst nach einem Exportklick (oder einem „Export nicht nötig“-Häkchen) freigeschaltet werden?

## 6. Sicherheit und Datenschutz im Client
- Passwort nie in `localStorage`/`sessionStorage`, nie in Zustandsvariablen (`acF`), nie in URL, nie in `console.*`, nie in Fehlertexten; Anfragekörper nur an `/auth/v1/token`.
- Frische Sitzung nur im Speicher, nach dem Aufruf verworfen (bei Fehlschlag mit `POST /auth/v1/logout?scope=local` beenden, damit keine unnötige Sitzung offen bleibt).
- Kein Rate-Limit im Client (Supabase begrenzt Anmeldeversuche); der Client zeigt dafür eine verständliche Meldung.
- Doppelklick/Mehrfachtouch: Ein Durchlauf (`acDelRun`), Knopf deaktiviert, zweiter Aufruf wird ignoriert.
- Zweiter Browser-Tab mit derselben Sitzung: läuft in den vorhandenen Ablauf „Sitzung abgelaufen“ (kein Absturz, keine Löschung lokaler Daten).
- Datenfluss-Test (D1) wird um die neuen Aufrufe erweitert (`/rest/v1/rpc/delete_account`, `/auth/v1/user`, GET der eigenen Zeilen); Host-Whitelist unverändert.

## 7. Betroffene Dateien
- `index.html`: Konto-Bereich (`acHome`: Abschnitt „Konto löschen“), neue Ansicht `delete` in `acctUI`, Funktionen `acDelStart`, `acDelGo`, `acExport`, Aktionen `acdel`/`acdelgo`/`acdelx`/`acexport`, Notiz-Anzeige im Startbildschirm, kleine CSS-Ergänzungen. Keine Änderung an Spielmechanik, Speicherlogik und Charakterplätzen.
- `tests/fake_supabase.js`: Passwort-Login mit konfigurierbaren Fehlern, `delete_account` (Erfolg, 403, 22023, 404, 5xx, Verbindungsabbruch nach Löschung), `/auth/v1/user`, GET der eigenen Zeilen.
- `tests/cases/kontoloeschen.js` (neu), `tests/cases/datenfluss.js` (Pfad-Whitelist), `tests/run.js`.
- `docs/PLAN_DATENSCHUTZ_KONTOLOESCHUNG.md` (Stand D4).
- Keine Server-/Schemaänderung, keine Migration.

## 8. Tests (Playwright gegen Fake-Supabase, Ziel: alle 212 bisherigen + neue grün)
1. Erfolg: Reihenfolge der Aufrufe (Login → RPC), `ruinwalk_auth` weg, lokale Plätze/Backups/Cloud-Zwischenspeicher **byte-gleich**, `ruinwalk_hab` unverändert (Option aus) bzw. gelöscht (Option an), Zeiger auf Platz 1, Startbildschirm mit Hinweis.
2. Falsches Passwort → kein RPC-Aufruf, Sitzung bleibt, Meldung.
3. Fehlende Bestätigung (kein Häkchen / Name leer / Passwort leer) → Knopf gesperrt, keine Anfrage.
4. Falscher Benutzername → RPC antwortet 22023, nichts gelöscht, verständliche Meldung.
5. Sitzung ohne Passwort-Methode (Login liefert `amr=otp`) → Client-Abbruch; zusätzlich Server 403 → Meldung.
6. Abgelaufenes Fenster (RPC 403) → nichts gelöscht, erneute Eingabe möglich.
7. Netzfehler vor Login, bei Login, bei RPC (Ausgang unklar) mit den drei Prüfungsergebnissen (Konto besteht / Konto weg / Prüfung scheitert).
8. 429 und 5xx.
9. Doppelklick und Mehrfachtouch: genau 1 Login und 1 RPC.
10. Passwort-Schutz: nach jedem Lauf `localStorage`, `sessionStorage`, URL, Konsolenmeldungen und alle Anfragen außer `/auth/v1/token` enthalten das Passwort nicht.
11. Erneute Anmeldung nach Erfolg (alter Zugang scheitert), erneute Registrierung mit gleichem Namen möglich.
12. Zweiter Tab mit alter Sitzung nach Löschung.
13. Export: Inhalt, Dateiname, kein Passwort, kein Token.
14. Regression: alle bestehenden Suiten unverändert grün; Datenfluss-Test mit erweiterter Whitelist.

## 9. Echter OTP-Nachweis (Prüfung der Machbarkeit)
- **Sinnvoll:** ja, als Abschlussnachweis, dass eine per E-Mail-Link entstandene Sitzung (`amr=otp`, wie bei deinem echten Konto) von `delete_account` abgelehnt wird. Der echte Client verwendet immer eine frische Passwort-Anmeldung; der Server-Nachweis ist die zweite Verteidigungslinie.
- **Ohne Eingriff in dein echtes Konto möglich:** Neues Wegwerfkonto 3 mit Plus-Adresse in deinem Postfach (z. B. `pascal.ludwig24+d4otp@gmail.com`; Supabase sendet einen echten Bestätigungslink; der Klick erzeugt eine echte `otp`-Sitzung). Danach `delete_account` mit diesem Token und **falschem** Namen aufrufen (erwartet `reauth_required`, keine Löschung).
- **Voraussetzungen (Freigaben nötig):** (a) ein Weg für den HTTP-Aufruf: Claude in Chrome am Rechner (bevorzugt) oder wieder `pg_net` (nur nach deiner ausdrücklichen Freigabe); (b) Lesezugriff auf dein Postfach für die Bestätigungsmail über den Gmail-Connector, oder du klickst den Link selbst und schickst mir nichts außer „Sitzung ist da“; (c) ein Wegwerfkonto mehr, das anschließend wieder gelöscht wird (am besten mit dem neuen Client-Ablauf).
- Empfehlung: nach D4-Umsetzung, am Rechner mit Chrome, ohne `pg_net`.

## 10. Bereinigung Wegwerfkonto 2 und `d3b_test_evt` (eigener Schritt „D4-Abschluss“)
- Vorschlag: **Löschung mit dem neuen Client** als echter Ende-zu-Ende-Test (Anmeldung als `D3_Wegwerf2`, Dialog, Passwort, Löschen). Das testet D4 live und anonymisiert dabei `d3b_test_evt` korrekt über `delete_account`.
- Danach lesende Kontrolle: Konto 2 und seine Daten weg, `d3b_test_evt` ohne Konto und anonymisiert, echtes Konto unverändert, `d3_test_evt` unverändert.
- Direktes Löschen in der Datenbank wird nicht empfohlen (würde die Anonymisierung der Zahlungsdaten umgehen).
- Nicht Teil der Umsetzung; nur nach ausdrücklicher Freigabe, mit den Zugangsdaten des Wegwerfkontos (nicht im Repo).

## 11. Reihenfolge der Umsetzung (nach Freigabe)
1. Fake-Supabase erweitern, Tests zuerst (rot).
2. Client-Ablauf und Oberfläche, Tests grün, alle 212 bisherigen weiter grün.
3. Datenfluss-Test erweitern, Screenshots der Dialoge.
4. Commit, Veröffentlichung auf GitHub Pages **nur** nach separater Freigabe (der Löschknopf wäre dann live).
5. D4-Abschluss (Abschnitt 10) und OTP-Nachweis (Abschnitt 9) als getrennte Freigaben.

## 12. Offene Entscheidungen
A. Cloud-Zwischenspeicher nach Löschung: nur als Gerätekopien behalten (Vorschlag) oder „als lokalen Charakter übernehmen“ in D4?
B. Export verpflichtend vor dem Löschknopf oder nur angeboten?
C. Zusätzliche Wartezeit/Schutzfrist beim Knopf (z. B. 3 Sekunden gedrückt halten) – Vorschlag: nein, bleibt bei den drei Pflichtschritten.
D. Veröffentlichung des Löschknopfs erst zusammen mit den Rechtstexten (D6) oder sofort nach D4?

---

## 13. Stand der Umsetzung (15.11.2026)

Entscheidungen: A) Cloud-Zwischenspeicher bleiben als Gerätekopien, im Bildschirm „Charaktere“ gekennzeichnet als „Lokale Kopie ohne aktive Cloud-Verbindung“ (nur Ansehen und JSON-Export, kein Löschen, keine Übernahme). B) Export optional. C) Keine Schutzfrist. D) Funktion implementiert, aber im normalen Spiel **ausgeblendet** (`DEL_ON` hängt nur am Test-Schalter `window.__RW_TEST`); Freischalten gemeinsam mit D6.

Umgesetzt in `index.html`: Bereich „Konto löschen“ (nur Tests sichtbar), Dialog mit Warnung, Pflichtbestätigung, Benutzername, Passwort, optionaler Löschung der Erkundungsdaten; frische Passwort-Anmeldung direkt bei Supabase Auth, Gegenprobe (Konto-ID, `amr=password`), `delete_account` mit genau diesem Token; JSON-Export; Erfolgsweg ohne Berührung lokaler Spielstände; Hinweis auf dem Startbildschirm.

Abweichungen zum Plan: (1) `PT404 not_found` gilt als **Fehler** (nichts gelöscht), nicht als Erfolg – ein gültiges Token mit fehlendem Profil heißt, dass das Konto noch existiert. (2) Bei unklarem Ausgang gilt das Konto nur als gelöscht, wenn `GET /auth/v1/user` mit dem frischen Token mit 401/403/404 **und** `user_not_found`/`session_not_found` antwortet; andernfalls Meldung „nicht sicher“ und die Sitzung bleibt. Die echten Fehlercodes von GoTrue für ein gelöschtes Konto sind noch nicht live bestätigt; im Zweifel wird konservativ „unklar“ gemeldet, nie „gelöscht“.

Tests: 7 neue (`tests/cases/kontoloeschen.js`), gesamt 219 grün. Kein Server-/Schemaänderung, nichts live.

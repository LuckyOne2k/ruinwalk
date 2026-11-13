# Phase 2 – Registrierung, Login, Cloud-Plätze (Frontend)

Stand: 13.11.2026 · Schema und Datenbank unverändert (siehe SUPABASE_TESTBERICHT.md).

## Umsetzung (index.html, Abschnitt „Konto“)
- Reiner `fetch`-Client gegen Supabase Auth (GoTrue) und die vorhandenen Datenbankfunktionen. Keine Bibliothek, kein CDN.
- Im Browser nur URL und **Publishable Key**. Anmeldung sendet den Nutzer-Token als `Authorization`, der Publishable Key geht nie als Bearer. Kein service_role, kein Datenbankpasswort (per Test geprüft).
- Registrierung: Benutzername (vom Schema verlangt), E-Mail, Passwort (+ Wiederholung). Passwortregeln wie in Supabase gesetzt: ≥ 8 Zeichen, Klein-/Großbuchstabe, Ziffer, Sonderzeichen (höchstens 72). Prüfung vor dem Absenden. Eine eventuell mitgelieferte Sitzung wird verworfen; Anmeldung erst nach Bestätigung, zusätzlich prüft der Client `email_confirmed_at`, und der Server verlangt Bestätigung beim Speichern.
- Neutrale Meldungen: bekannte/unbekannte E-Mail bei Registrierung und Passwort-Reset sehen gleich aus. Login-Fehler ebenso.
- Login, Sitzung (localStorage `ruinwalk_auth`), automatische Token-Erneuerung (vor Ablauf und bei 401, einmalig), Logout (lokal + Server). Ungültiger Refresh-Token → Hinweis, lokaler Spielstand unberührt. Verbindungsfehler behalten die Sitzung.
- Links aus Mails (`#access_token=…` bzw. `#error=…`): Bestätigung meldet an, Recovery öffnet „Neues Passwort“; Token wird sofort aus der Adresszeile entfernt.
- Nach Login: `touch_login`, Benutzername (profiles), `list_characters`. Drei Cloud-Plätze mit den bestehenden Regeln: Platz 3 gesperrt, **keine** Kauf-/Freischaltfunktion; gesperrte Cloud-Charaktere sind markiert.
- Hochladen („In die Cloud kopieren“, nur freie Plätze 1/2): liest den lokalen Charakter nur, ruft `create_character` auf und markiert ihn (`ruinwalk_cloudmap`) erst, wenn `list_characters` ihn bestätigt. Bei jedem Fehler bleibt lokal alles unverändert und nichts wird markiert. Cloud-Charaktere werden in dieser Phase weder gespielt noch laufend gespeichert.
- Unverändert: Spielmechanik, Karte/GPS, Kampf, Inventar, Crafting, Quests, Grafik, Charakterplätze, Speicher-/Backup-Logik. Neue Schlüssel nur `ruinwalk_auth`, `ruinwalk_cloudmap`.

## Tests
- Spieltests 95 + neue Konto-Tests 27 = **122/122** (`node tests/run.js`). Konto-Tests laufen gegen eine Attrappe (`tests/fake_supabase.js`), die GoTrue/PostgREST-Fehlercodes nachbildet; alle anderen Tests blocken Supabase komplett.
- Abgedeckt: Registrierung (Pflichtfelder, jede Passwortregel, vergebener Name, doppelte E-Mail), Login vor/nach Bestätigung, falsches Passwort, Offline, Enter-Taste, Sitzung nach Neuladen, Token-Erneuerung (Ablauf, 401, ungültig), Logout, Passwort vergessen/zurücksetzen (Link, schwach, gleiches Passwort, abgelaufen, manipuliert), Bestätigungslink, Cloud-Plätze (Platz 3 gesperrt, XSS-Escaping), Upload (Erfolg, Server-/Netzfehler, ausbleibende Bestätigung, zwischenzeitlich belegter Platz, mehrere lokale Charaktere), keine Geheimnisse im Quelltext, Spielstände byte-identisch.

## Grenzen / noch zu prüfen
- Die Tests laufen nicht gegen das echte Supabase (aus der Entwicklungsumgebung ist kein Zugriff möglich). Die echte Mail-Bestätigung und der echte Passwort-Reset müssen einmal manuell geprüft werden (Checkliste im Bericht).
- Eingebauter Supabase-Mailversand: 2 Mails/Stunde, nur Teammitglieder → für echte Spieler eigenen SMTP einrichten.
- Später: Cloud-Charakter spielen/laufend speichern, Verschieben gesperrter Charaktere in der Oberfläche, CAPTCHA/Rate-Limits, Zahlung/Platz 3.

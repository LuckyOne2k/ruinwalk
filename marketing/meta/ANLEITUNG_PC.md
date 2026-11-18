# Instagram-Zugang für den Agenten – Schritt für Schritt (PC)

Ziel: Ein Zugriffsschlüssel, mit dem `rw-marketing` auf **@ruinwalk.official** posten und Statistiken lesen kann.
Kein Unternehmen nötig: Die App bleibt im **Entwicklungsmodus** und verwaltet nur dein eigenes Konto. Dauer ca. 20 Minuten.
Meta ändert Menünamen öfter – sinngemäß suchen. Bei Fehlermeldungen: Screenshot an Claude.

## Teil A – Business-Portfolio anlegen (ohne Verifizierung)
1. **business.facebook.com/overview** öffnen, mit deinem persönlichen Facebook-Konto anmelden.
2. **„Business-Portfolio erstellen“** (bzw. „Konto erstellen“).
3. Eintragen: Name **Ruin Walk**, dein Vor- und Nachname, deine E-Mail → Erstellen.
4. E-Mail-Bestätigung im Postfach anklicken.
5. Fragt Meta nach **Unternehmensverifizierung**: **überspringen** („Später“ / Fenster schließen). Nichts hochladen.

## Teil B – App mit dem Portfolio verbinden
6. **developers.facebook.com/apps** öffnen → deine App (z. B. „Ruin Walk Team“) anklicken.
   Falls es noch keine gibt: „App erstellen“ → Anwendungsfall „Nachrichten und Inhalte auf Instagram verwalten“ → Name „Ruin Walk Team“ → Portfolio **Ruin Walk** wählen.
7. Oben prüfen: App-Modus = **Entwicklung / Development**. Nicht auf „Live“ schalten.
8. Links **Anwendungsfälle** (Stift-Symbol) → bei **Instagram API** auf **„Anpassen“**.
9. Links **„API setup with Unified login“** (oder „API-Einrichtung mit Instagram-Login“) wählen.
10. Erscheint „Business-Portfolio auswählen“: **Ruin Walk** auswählen und bestätigen. Eine Anfrage zur App-Eigentümerschaft: annehmen (über business.facebook.com → Anfragen, falls nötig).

## Teil C – Instagram-Konto verbinden und Schlüssel erzeugen
11. Auf derselben Seite den Abschnitt **„Zugriffsschlüssel generieren“** suchen → **„Konto hinzufügen“**.
12. Im Instagram-Fenster mit **@ruinwalk.official** anmelden.
13. Berechtigungen – nur diese erlauben:
    - `instagram_business_basic`
    - `instagram_business_content_publish`
    - `instagram_business_manage_insights` (optional, für Statistiken)
    **Nicht** erlauben: Nachrichten (`…_manage_messages`), Kommentare (`…_manage_comments`).
14. Falls Meta meldet, das Konto müsse erst **Instagram-Tester** sein:
    - In der App links **App-Rollen → Rollen** → „Personen hinzufügen“ → **Instagram-Tester** → `ruinwalk.official`
    - In der Instagram-App: Einstellungen → **Website-Berechtigungen / Apps und Websites → Tester-Einladungen** → annehmen
    - Zurück zu Schritt 11.
15. Neben dem Konto erscheint **„Token generieren“** → anklicken → Schlüssel wird angezeigt (lange Zeichenkette).

## Teil D – Schlüssel sicher an Claude übergeben
16. Schlüssel **nicht** in den Chat, keine Mail, keine Datei im Repo.
17. In Claude schreiben: **„Token ist bereit“**. Claude öffnet ein sicheres Formular für `graph.instagram.com` → Schlüssel dort einfügen.
18. Claude prüft die Verbindung (`meta-api.js status`), postet den ersten Beitrag und richtet die Postingzeiten ein.

## Danach
- Schlüssel gilt **60 Tage** → Claude erinnert dich rechtzeitig, dann Schritt 15–17 wiederholen.
- Zugriff entziehen: Instagram → Einstellungen → Apps und Websites → App entfernen, oder in der App den Schlüssel widerrufen.

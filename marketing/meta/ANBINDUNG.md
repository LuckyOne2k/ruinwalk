# Anleitung: Instagram und Facebook mit dem KI-Team verbinden

Für Pascal. Du legst alles selbst an; das KI-Team bekommt nur die Rechte, die es braucht. Kein Passwort wird je an Claude gegeben.
Stand der Recherche: November 2026 (Meta-Entwicklerdoku). Meta ändert Oberflächen häufig – Menünamen können leicht abweichen.

## Weg A (aktuell gewählt): nur Instagram, ohne Facebook-Seite
Voraussetzung: Instagram-Konto ist ein Business-Konto (erledigt, 18.11.2026).
1. **developers.facebook.com** → mit deinem Facebook-Konto anmelden → als Entwickler registrieren (einmalig).
2. **Meine Apps → App erstellen** → Anwendungsfall „Nachrichten und Inhalte auf Instagram verwalten“ (Instagram API) → Name z. B. „Ruin Walk Team“.
3. Im Anwendungsfall **„API-Einrichtung mit Instagram-Login“** → Abschnitt „Zugriffsschlüssel generieren“ → **Konto hinzufügen** → mit dem Ruin-Walk-Instagram anmelden und nur diese Rechte erlauben: `instagram_business_basic`, `instagram_business_content_publish`, optional `instagram_business_manage_insights` (Statistiken). **Nicht** erlauben: Nachrichten, Kommentare.
   Falls Meta das Konto erst als Tester verlangt: App-Rollen → Instagram-Tester hinzufügen → in Instagram unter Einstellungen → Apps und Websites → Tester-Einladungen annehmen.
4. Der angezeigte **Zugriffsschlüssel** (gilt 60 Tage) **nicht in den Chat kopieren**. Sag Claude „Instagram-Token hinterlegen“ → es öffnet sich ein sicheres Formular für `graph.instagram.com`, dort einfügen.
5. Claude prüft mit `meta-api.js status` (zeigt Konto, Typ, Tageskontingent) und macht einen ersten Testbeitrag.
6. Alle ~50 Tage neuen Schlüssel erzeugen und im Formular ersetzen (Claude kann dich per geplanter Erinnerung daran erinnern).

Bilder müssen für Instagram unter einer öffentlichen https-Adresse liegen (siehe offene Entscheidung im Chat: GitHub Pages oder anderer Ort).

## Weg B (Facebook-Seite + Business Suite, nötig sobald auch Facebook bespielt wird)

## Stufe 1 – Accounts und Business Suite (Pflicht, ca. 30 Minuten)
1. **Facebook-Seite anlegen** „Ruin Walk“ (Kategorie Videospiel) mit deinem persönlichen Facebook-Konto (du bist Admin).
2. **Instagram-Konto anlegen** (Wunsch-Handle siehe `04_instagram.md`) und in den Einstellungen auf **Professionelles Konto** umstellen (Kategorie Videospiel, Typ „Unternehmen“ – „Creator“ geht auch, Unternehmen ist für die API am einfachsten).
3. **Meta Business Suite** öffnen (business.facebook.com) → **Business-Portfolio** „Ruin Walk“ anlegen.
4. Im Portfolio unter Einstellungen → Konten: **Seite hinzufügen** und **Instagram-Konto verknüpfen** (Seite ↔ Instagram verbinden).
5. Zwei-Faktor-Anmeldung für Facebook und Instagram aktivieren.
6. Impressum/Kontakt in Seite und Bio klären (siehe `01_strategie.md`, Rechtliches).

**Ab hier arbeitet das Team schon voll:** Entwürfe kommen fertig aus `freigabe/entwuerfe/`, du planst sie in der Business Suite (Planer) ein. Kennzahlen: Business Suite → Insights → Export (CSV) nach `analyse/` legen.

## Stufe 2 – API-Zugriff für Kennzahlen und Veröffentlichen per Freigabe (optional, ca. 45 Minuten)
1. **Meta-Entwicklerkonto**: developers.facebook.com mit deinem Facebook-Konto, als Entwickler registrieren.
2. **App erstellen**: Typ „Business“, Name z. B. „Ruin Walk Team“, mit dem Business-Portfolio „Ruin Walk“ verknüpfen. Produkte/Anwendungsfälle hinzufügen: Instagram (Instagram API) und Facebook-Seiten (Pages API).
3. **System-User anlegen**: Business-Einstellungen → Nutzer → System-User → „Ruin Walk Bot“, Rolle *Mitarbeiter* (nicht Admin).
4. **Assets zuweisen**: dem System-User die Seite „Ruin Walk“ und das Instagram-Konto zuweisen, nur mit den Aufgaben „Inhalte erstellen“, „Statistiken ansehen“ (und optional „Community-Aktivität verwalten“ für Kommentare).
5. **Token erzeugen**: beim System-User → Token generieren → App wählen → nur die Berechtigungen aus `BERECHTIGUNGEN.md` (Stufe 2a und ggf. 2b) anhaken → Ablauf „nie“ oder 60 Tage (60 Tage ist sicherer, dann regelmäßig erneuern).
6. **Token sicher übergeben**: Den Token **nicht** in den Chat kopieren. Sag Claude „Meta-Token hinterlegen“ – Claude öffnet ein sicheres Formular für den Host `graph.facebook.com`; dort fügst du den Token ein. Er wird als Netzwerk-Geheimnis der Umgebung gespeichert, Claude sieht ihn nie.
7. **IDs eintragen** (keine Geheimnisse): `marketing/meta/config.json` aus `config.beispiel.json` erstellen mit `page_id` (Seite → Info → Seiten-ID) und `ig_user_id` (Claude ermittelt sie mit `meta-api.js status`).
8. **Test**: `node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js status` → zeigt Seite, verknüpftes Instagram, Berechtigungen.

**App Review:** Für deine eigenen Konten, die über das eigene Business-Portfolio und einen System-User verwaltet werden, reicht nach aktueller Doku der Standardzugriff; App Review ist erst nötig, wenn die App Konten anderer verwalten soll. Falls Meta beim Token-Erzeugen etwas anderes verlangt: Stopp, Claude prüft die aktuelle Doku.

## Was danach automatisch passiert – und was nicht
| Aktion | Ohne deine Freigabe? |
|---|---|
| Entwürfe, Grafiken, Kalender, Analysen erstellen | ja |
| Kennzahlen lesen (Insights) | ja (nur lesend) |
| Beitrag veröffentlichen | Instagram: **ja im Modus `autonom`** (Qualitätsprüfung, Limits, Protokoll); Facebook und Modus `freigabe`: nur nach deiner Freigabe |
| Kommentare beantworten, liken, folgen, Nachrichten | **nein** – derzeit gar nicht vorgesehen |
| Anzeigen schalten | **nein** – nicht eingerichtet, separater Auftrag |

## Zugriff entziehen
Business-Einstellungen → System-User → Token widerrufen bzw. System-User löschen. Zusätzlich in der Claude-Umgebung das Netzwerk-Geheimnis löschen.

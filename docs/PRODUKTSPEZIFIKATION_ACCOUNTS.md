Ruinwalk – Technische Produktspezifikation

Accountsystem, Charakterauswahl und Charakterplätze

Status: Produktentscheidung getroffen – Phase 1 (Datenmodell, Datenbank-Tests) umgesetzt, Rückerstattungsregel festgelegt (Abschnitt 6.3)
Projekt: Ruinwalk
Ziel: Spieler können ein Konto erstellen, sich anmelden und bis zu drei voneinander unabhängige Charaktere verwalten.

---

1. Verbindliche Produktentscheidungen

Bereich| Festlegung
Charakterplätze pro Account| Maximal 3
Kostenlose Plätze| 2
Dritter Charakterplatz| Einmalig käuflich erwerbbar
Charakterverwaltung| Jeder Charakter ist vollständig individuell
Spielstände| Separat pro Charakter
Inventar und Ausrüstung| Separat pro Charakter
Fortschritt und Erfahrung| Separat pro Charakter
Quests und Entdeckungen| Separat pro Charakter
GPS-Fortschritt| Separat pro Charakter

Ein Charakterplatz-Kauf gilt dauerhaft für den Account und darf nicht an einen einzelnen Charakter gebunden sein.

2. Accountsystem

2.1 Registrierung

Spieler können ein Konto mit folgenden Angaben erstellen:

- Benutzername
- E-Mail-Adresse
- Passwort
- Passwortbestätigung

Anforderungen:

- Benutzername muss eindeutig sein.
- E-Mail-Adresse muss eindeutig sein.
- E-Mail-Adresse muss verifiziert werden.
- Passwörter dürfen niemals im Klartext gespeichert werden.
- Registrierung muss gegen automatisierte Massenanmeldungen geschützt sein.

2.2 Anmeldung

- Anmeldung über E-Mail-Adresse oder Benutzername und Passwort.
- Sitzung bleibt nach einem Browserneustart erhalten, sofern der Spieler nicht abgemeldet wurde oder die Sitzung abgelaufen ist.
- Abmelden muss jederzeit möglich sein.
- Ungültige Anmeldedaten dürfen keine sensiblen Informationen preisgeben.
- Passwort zurücksetzen muss über einen sicheren E-Mail-Prozess möglich sein.

2.3 Accountschutz

- Sichere Passwort-Hashverfahren.
- Serverseitige Sitzungs- und Berechtigungsprüfung.
- Schutz vor Brute-Force-Anmeldeversuchen.
- Keine Passwörter oder dauerhaften Zugangstoken im normalen Spielstand speichern.
- Accountdaten und Charakterdaten müssen getrennt verwaltet werden.

3. Charakterauswahl

Nach erfolgreicher Anmeldung gelangt der Spieler auf den Charakterbildschirm.

3.1 Darstellung

Der Bildschirm zeigt drei Charakterplätze:

Platz 1 – Kostenlos

- Neuen Charakter erstellen.
- Vorhandenen Charakter auswählen.

Platz 2 – Kostenlos

- Neuen Charakter erstellen.
- Vorhandenen Charakter auswählen.

Platz 3 – Premium

- Bei gesperrtem Platz: Kaufoption anzeigen.
- Bei freigeschaltetem Platz: Neuen Charakter erstellen oder vorhandenen Charakter auswählen.

Jeder belegte Platz zeigt mindestens:

- Charaktername
- Charakterbild beziehungsweise Sprite
- Level
- Klasse
- Spielzeit
- Letzter Spielstand
- Datum der letzten Aktivität

3.2 Charakteraktionen

Für jeden belegten Platz:

- Spielen
- Charakterdetails ansehen
- Charakter löschen

Ein gesperrter Charakter auf Platz 3 (siehe 6.3) zeigt statt „Spielen" den Hinweis „Gesperrt" und die Aktion „Auf freien Platz verschieben" (nur wenn Platz 1 oder 2 frei ist). Löschen bleibt eine bewusste Aktion des Spielers.

Vor dem endgültigen Löschen ist eine zusätzliche Bestätigung erforderlich.

Das Löschen eines Charakters darf niemals andere Charaktere oder den Account betreffen.

Ein gelöschter Charakter wird nicht automatisch wiederhergestellt. Eine spätere Wiederherstellungsfunktion kann separat ergänzt werden.

4. Individuelle Charakterdaten

Jeder Charakter erhält eine eindeutige, unveränderliche Charakter-ID.

Die Charakterdaten werden unabhängig voneinander gespeichert.

Folgende Daten gehören ausschließlich zum jeweiligen Charakter:

- Name und Aussehen
- Klasse und Fähigkeiten
- Level und Erfahrungspunkte
- Attribute und Fortschritt
- Lebenspunkte und Energie
- Inventar und Gegenstände
- Ausrüstung
- Ressourcen und Materialien
- Crafting-Fortschritt
- Quests und Questfortschritt
- Bossfortschritt
- Entdeckte Orte und Weltfortschritt
- GPS-bezogene Erkundungsdaten
- Spielzeit und Zeitstempel
- Individueller Spielstand

Es gibt kein gemeinsames Inventar, keine gemeinsame Ausrüstung und keinen gemeinsamen Spielfortschritt zwischen Charakteren.

5. Technische Architektur

Das bisherige lokale Speichersystem reicht für diese Anforderungen nicht aus.

Die neue Architektur besteht aus vier Bereichen:

5.1 Frontend

Das bestehende Ruinwalk-Spiel bleibt die Spieloberfläche.

Ergänzt werden:

- Registrierungsbildschirm
- Login-Bildschirm
- Passwort-zurücksetzen-Bildschirm
- Charakterauswahl
- Charaktererstellung
- Charakterdetails
- Kaufoberfläche für Platz 3
- Accountmenü und Abmeldung

5.2 Backend

Das Backend übernimmt:

- Registrierung und Anmeldung
- Sitzungsverwaltung
- Accountzuordnung
- Charakterverwaltung
- Speichern und Laden
- Berechtigungsprüfung
- Kaufstatus und Freischaltung des dritten Platzes

Das Backend muss bei jeder Anfrage prüfen, ob der angemeldete Account tatsächlich Zugriff auf den angeforderten Charakter hat.

5.3 Datenbank

Vorgesehene Datenstruktur:

Accounts

- account_id
- username
- email
- password_hash beziehungsweise Auth-Anbieterreferenz
- email_verified
- created_at
- last_login

Characters

- character_id
- account_id
- slot_number
- character_name
- character_class
- level
- character_data
- created_at
- updated_at
- last_played

Account_Entitlements

- entitlement_id
- account_id
- entitlement_type
- status
- granted_at
- payment_reference

Der dritte Platz wird über eine dauerhafte Berechtigung ("third_character_slot") freigeschaltet.

Die Berechtigung wird serverseitig geprüft. Eine Änderung im Browser darf den Kaufstatus nicht manipulieren können.

5.4 Speicherung

- Charakterdaten werden serverseitig gespeichert.
- Jeder Charakter besitzt einen eigenen Spielstand.
- Speichern und Laden erfolgt über authentifizierte Backend-Anfragen.
- Ein Charakter darf niemals den Spielstand eines anderen Charakters überschreiben.
- Bei fehlgeschlagener Speicherung muss der Spieler eine verständliche Warnung erhalten.
- Bereits gespeicherte Daten dürfen bei Netzwerkproblemen nicht durch einen leeren oder ungültigen Spielstand ersetzt werden.
- Die bestehende lokale Speicherung bleibt während der Umstellung als Migrationsquelle erhalten.

6. Kauf des dritten Charakterplatzes

6.1 Kaufmodell

- Einmalzahlung.
- Kein Abonnement.
- Freischaltung dauerhaft für den Account.
- Keine erneute Zahlung bei Gerätewechsel oder erneuter Anmeldung.
- Der Kauf ist unabhängig davon, ob der dritte Platz bereits mit einem Charakter belegt ist.

6.2 Technische Anforderungen

Die Zahlungsabwicklung muss über einen geeigneten Zahlungsanbieter erfolgen.

Ablauf:

1. Spieler öffnet den gesperrten dritten Charakterplatz.
2. Preis und Kaufbedingungen werden angezeigt.
3. Spieler startet den Kauf.
4. Zahlungsanbieter verarbeitet die Zahlung.
5. Backend überprüft die Zahlung serverseitig.
6. Erst nach erfolgreicher Bestätigung wird die Berechtigung freigeschaltet.
7. Der dritte Platz steht dauerhaft zur Verfügung.

Wichtig: Ein erfolgreicher Rücksprung vom Zahlungsanbieter allein reicht nicht als Kaufnachweis. Die Freischaltung muss anhand einer verifizierten Zahlungsbestätigung erfolgen.

Kaufvorgänge müssen gegen doppelte Verarbeitung geschützt werden. Rückerstattungen und fehlgeschlagene Zahlungen müssen einen definierten Status erhalten.

Der konkrete Zahlungsanbieter und der Verkaufspreis werden später festgelegt.

6.3 Rückerstattung und Entzug der Berechtigung (verbindlich)

- Bei bestätigter Rückerstattung wird die Berechtigung für Charakterplatz 3 entzogen (Status „refunded").
- Ein bereits vorhandener Charakter auf Platz 3 wird unter keinen Umständen automatisch gelöscht. Weder die Rückerstattung noch das Entfernen der Berechtigung noch eine Wartungsroutine dürfen Charakterdaten löschen.
- Der Charakter ist gesperrt, solange keine gültige Berechtigung besteht: Er kann nicht gespielt und nicht gespeichert werden, sein Spielstand wird nicht ausgeliefert. Name, Klasse, Level und der Hinweis „gesperrt" bleiben in der Charakterauswahl sichtbar.
- Ist Platz 1 oder Platz 2 frei, kann der Spieler den gesperrten Charakter dorthin verschieben. Spielstand, Charakter-ID und Sicherungen bleiben dabei unverändert; der Charakter ist danach ohne Berechtigung spielbar. Verschieben ist nur von Platz 3 auf einen freien kostenlosen Platz möglich und überschreibt nie einen belegten Platz.
- Sind beide kostenlosen Plätze belegt, bleibt der Charakter samt Spielstand sicher gespeichert. Nach erneuter Freischaltung (erneuter Kauf oder Wiederherstellung der Berechtigung) ist er ohne Datenverlust wieder zugänglich.
- Ohne gültige Berechtigung kann auf Platz 3 kein neuer Charakter erstellt werden, auch dann nicht, wenn der Platz gerade leer ist.
- Der Besitzer darf einen gesperrten Charakter manuell löschen (bestätigt): es gelten die normalen Löschregeln mit ausdrücklicher Bestätigung, Protokoll und erhaltener letzter Sicherung. Eine automatische Löschung bleibt ausgeschlossen.
- Verschieben und Berechtigungsänderungen werden protokolliert.

7. Übernahme bestehender Spielstände

Ein besonders wichtiger Punkt ist der Übergang vom bisherigen lokalen Spielstand zum neuen Accountsystem.

Beim ersten Login auf einem Gerät muss Ruinwalk prüfen, ob ein gültiger lokaler Spielstand existiert.

Wenn ein Spielstand vorhanden ist:

1. Spieler erhält die Möglichkeit, den vorhandenen Spielstand zu übernehmen.
2. Der bisherige Charakter wird in den ersten freien kostenlosen Charakterplatz übertragen.
3. Der Server speichert und validiert die übertragenen Daten.
4. Erst nach erfolgreicher Bestätigung gilt die Migration als abgeschlossen.
5. Der ursprüngliche lokale Spielstand bleibt zunächst als Sicherheitskopie erhalten.

Ungültige oder unvollständige lokale Spielstände dürfen nicht ungeprüft importiert werden.

Die Migration darf keinen bestehenden Fortschritt stillschweigend überschreiben.

8. Sicherheit und Datenintegrität

Folgende Regeln sind verbindlich:

- Der Server ist die maßgebliche Instanz für Accountrechte und Charakterzuordnung.
- Der Browser darf keine Charaktere anderer Accounts laden oder verändern.
- Der dritte Charakterplatz darf nicht durch lokale Änderungen freigeschaltet werden.
- Charakter-IDs müssen eindeutig sein.
- Ein Charakter darf nur einem Account zugeordnet sein.
- Speichervorgänge müssen gegen parallele Änderungen abgesichert werden.
- Fehlerhafte Daten müssen erkannt und abgefangen werden.
- Regelmäßige serverseitige Backups sind erforderlich.
- Kritische Aktionen wie Löschen und Kauf müssen nachvollziehbar protokolliert werden.

9. Umsetzung in Phasen

Phase 1 – Architektur und Datenmodell

- Backend und Datenbank auswählen.
- Account- und Charakterdatenmodell implementieren.
- Bestehende Spielstandstruktur analysieren.
- Sichere Schnittstellen definieren.

Phase 2 – Registrierung und Login

- Registrierung
- E-Mail-Verifizierung
- Anmeldung und Abmeldung
- Passwort zurücksetzen
- Sitzungsverwaltung

Phase 3 – Charakterverwaltung

- Charakterauswahl mit drei Plätzen
- Zwei kostenlose Plätze
- Charakter erstellen, auswählen und löschen
- Individuelle Charakterdaten
- Serverseitiges Speichern und Laden

Phase 4 – Migration und Cloud-Speicherung

- Bestehenden lokalen Spielstand übernehmen
- Sicheres Speichern und Laden
- Fehlerbehandlung bei Verbindungsabbrüchen
- Backup- und Wiederherstellungsverfahren

Phase 5 – Premium-Charakterplatz

- Kaufoberfläche
- Zahlungsanbieter integrieren
- Serverseitige Zahlungsprüfung
- Dauerhafte Freischaltung
- Kauf- und Wiederherstellungstests

10. Abnahmekriterien

Die Umsetzung gilt erst dann als erfolgreich, wenn folgende Tests bestanden sind:

1. Ein Spieler kann ein Konto erstellen und sich anmelden.
2. Ein Spieler kann sich auf einem anderen Gerät anmelden und seine Charaktere laden.
3. Zwei kostenlose Charaktere können unabhängig erstellt werden.
4. Der dritte Platz bleibt ohne Kauf gesperrt.
5. Nach verifiziertem Kauf bleibt der dritte Platz dauerhaft freigeschaltet.
6. Alle drei Charaktere können unterschiedliche Klassen und Fortschritte besitzen.
7. Inventar, Ausrüstung, Quests und Erkundung bleiben strikt getrennt.
8. Das Wechseln zwischen Charakteren überschreibt keine Daten.
9. Das Löschen eines Charakters verändert keine anderen Charaktere.
10. Ein Spieler kann keine Charakterdaten eines fremden Accounts abrufen oder verändern.
11. Ein fehlgeschlagener Speichervorgang verursacht keinen unbemerkten Datenverlust.
12. Ein bestehender lokaler Spielstand kann sicher übernommen werden.
13. Die bisherigen Spielmechaniken funktionieren nach der Umstellung weiterhin.
14. Nach einer Rückerstattung bleibt ein vorhandener Charakter auf Platz 3 vollständig erhalten, ist aber gesperrt (nicht spiel-, nicht speicher- und nicht lesbar).
15. Ein gesperrter Charakter lässt sich auf einen freien kostenlosen Platz verschieben, ohne Datenverlust.
16. Sind beide kostenlosen Plätze belegt, scheitert das Verschieben ohne Änderung, und nach erneuter Freischaltung ist der Charakter wieder vollständig verfügbar.
17. Ohne Berechtigung kann auf Platz 3 kein neuer Charakter erstellt werden.

11. Bewusst noch nicht Bestandteil

- Gemeinsames Inventar oder gemeinsamer Fortschritt
- Charakterhandel
- Charakterübertragung zwischen Accounts
- Mehrere zusätzliche Premiumplätze
- Automatische Löschung oder Archivierung von Charakteren nach Rückerstattung (ausdrücklich ausgeschlossen)
- Abonnements
- Ingame-Währung für Charakterplätze
- Soziale Funktionen oder Multiplayer
- Mobile App und native Accountverwaltung

Diese Funktionen können später separat geplant werden.

---

Technische Leitentscheidung

Ruinwalk erhält ein Accountsystem mit serverseitiger Speicherung und einer klaren Trennung zwischen Account, Charakter und Kaufberechtigung.

Die beiden kostenlosen Plätze sind direkt verfügbar. Der dritte Platz wird durch eine einmalige, dauerhaft dem Account zugeordnete Kaufberechtigung freigeschaltet.

Priorität: Erst ein sicheres und zuverlässiges Account- und Charaktersystem aufbauen. Die Zahlungsabwicklung folgt als eigene Phase. Das bestehende Spiel und seine Fortschrittsdaten müssen dabei erhalten bleiben.
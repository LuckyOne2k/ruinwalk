# Architekturuntersuchung: serverseitig autoritativer Charakterfortschritt

Stand: 18.11.2026. Reine Analyse. Es wurden weder `supabase/schema.sql` noch eine Migration noch `index.html` geändert. Quellen: `index.html` (Zeilenangaben beziehen sich auf den Stand von `main`/`b53647d`), `supabase/schema.sql`, `server/instance/sql/05_produktion.sql`.

## 1. Ist-Zustand

### 1.1 Wer entscheidet heute über den Fortschritt?
**Allein der Client.** Der gesamte Spielstand `S` lebt im Browser (`localStorage`, Schlüssel `ruinwalk_v1*` bzw. Cloud-Zwischenspeicher) und wird bei Cloud-Charakteren als JSON nach `public.characters.character_data` geschrieben.

| Bereich | Ort | Server prüft |
|---|---|---|
| Spielstand-Form | `sanitize()` (Z. 842–885, **nur Client**) | nur: Objekt, nicht leer (`save_character`), Größe clientseitig ≤ 900 000 Zeichen |
| Klasse/Level in der Tabelle | `safe_class(d)`, `safe_level(d)` (schema.sql) | begrenzt Level auf 1..50, Klasse aus Liste; **leitet nur ab, was der Client schrieb** |
| Version | `save_character(p_id, p_expected_version, p_data)` | optimistische Sperre (Überschreiben durch zweites Gerät), Besitz, Slot-3-Berechtigung, E-Mail bestätigt |
| Unveränderlich | Trigger `guard_character` | `character_id`, `account_id`, `created_at`, Slotwechsel nur über `move_character` |
| Sicherung | Trigger `backup_character` | letzte 10 Update-Sicherungen (höchstens eine je 10 Minuten), Löschen immer gesichert |

`create_character(p_slot, p_name, p_data)` übernimmt **beliebige** `p_data` (nur Objektform), setzt `cid` und `name` und leitet Klasse/Level ab. Ein neuer Charakter kann also schon bei der Erstellung mit `lv 50`, `tier 3` oder beliebigem Inventar angelegt werden.

### 1.2 XP und Level (Client, deterministisch)
- `LV_CAP = 50`; Aufstieg bei `xp >= lv * 40` (`addXP`, Z. 954). Quellen: `m.xp` je besiegtem Monster (mit Abschlag bei Übersteigung der Empfehlung `rec` um mehr als 6 Level), `NODES[].xp` je Sammelpunkt, Quest-Belohnungen (`q.reward()`).
- Level ≥ 5 (`CLASS_LV`) erlaubt die Klassenwahl; Klasse `wanderer` → `krieger | bogen | magier | heiler` (`clsok`).
- Pfadstufen: `UP_LV = [15, 30, 50]`; Aufstieg (`canUp`) verlangt Level, die Klassenprüfung `UPQ` (Zähler `kills`, `rare`, `elite`, `boss`, `walk` seit letztem Aufstieg) und ab Stufe 3 eine geheime Bedingung `SECRET[path]` (z. B. 5 Elite-Kills, 20 000 m gelaufen, 150 Sammelpunkte, 10 Nächte).
- Alle Zähler (`S.stats.*`, `walk` aus GPS) entstehen im Client; `walk` basiert auf GPS-Positionen und ist **fälschbar**.
- Der Testmodus (`S.test`, `?dev=1`) enthält Werkzeuge, die Level/Stufe setzen (Z. ~3040). Sie schreiben normalen Spielstand.

### 1.3 Folgerung
Der Server kann heute nur die **Form** prüfen, nie die **Herkunft**. Jede Zahl im Spielstand (Level, Stufe, Pfad, Inventar, Ausrüstung, Münzen) kann vom Browser frei gesetzt werden. Das ist für das Einzelspiel akzeptabel, für Instanzkämpfe mit anderen Spielern nicht (siehe F5-Grenze in `docs/PROFILABLEITUNG.md`).

## 2. Was „autoritativ“ hier realistisch heißt
Die GPS-Echtzeitkämpfe laufen im Client und bleiben unverändert (Vorgabe). Ein Kill, eine gelaufene Strecke oder ein Sammelpunkt entsteht also nie auf dem Server. Der Server kann daher **nicht beweisen**, dass ein Ereignis stattfand, sondern nur:
1. **Plausibilität begrenzen** (Rate-Limits, Obergrenzen je Zeit, erlaubte Übergänge),
2. **Ereignisse festhalten** (Ledger) und den Fortschritt daraus ableiten,
3. **Unmögliche Zustände ablehnen** (Level 50 ohne XP-Weg, Stufe 3 ohne Stufe 2).

Echte Autorität (Beweis) gäbe es nur, wenn Kampf und XP serverseitig simuliert würden (wie bei Instanzkämpfen). Das widerspricht der Vorgabe „keine Änderung der Echtzeitkämpfe“ und ist hier nur als Zielbild A beschrieben.

## 3. Variante A – Vollständige serverseitige Fortschrittsverwaltung
**Idee:** Der Server besitzt Level, XP, Klasse, Pfad, Inventar, Ausrüstung. Der Client sendet nur Absichten („greife Monster X an“, „stelle Gegenstand her“) und erhält Ergebnisse.
- Neue Tabellen (Konto-/Charakterbezug): Fortschritt (lv, xp, cls, path, tier, stats), Inventar, Ausrüstung, Münzen, Quests; Regel-Funktionen für Kampf/Drops/Crafting/Upgrade auf dem Server.
- Voraussetzung: **serverseitige Kampf- und Weltsimulation** (Drops, Würfe, Zeit, Monsterzustände `S.mh`, Respawn). GPS-Position bleibt Client-Eingabe (Spoofing nicht ausschließbar).
- **Sicherheit:** höchste. Gegenstände/Level nicht frei setzbar. Restrisiko GPS-Fälschung.
- **Aufwand:** sehr hoch (praktisch Neubau von Kampf, Loot, Crafting, Händler, Quests als Serverlogik, plus Client-Umbau auf Absichten). Realistisch viele Wochen.
- **Kompatibilität:** bricht den Offline-/lokalen Modus (Plätze 1–3 in localStorage) und die bisherige Kampfmechanik im Client. Widerspricht „Echtzeitkämpfe unverändert“.
- **Migrationsrisiko:** hoch. Jeder bestehende Charakter müsste in das neue Modell übernommen werden; Ungültiges müsste verworfen oder korrigiert werden → Gefahr, legitime Spielstände zu beschädigen.
- **Bewertung:** richtiges Langzeitziel, falls das Spiel stark kompetitiv/wirtschaftlich wird; **nicht** als nächster Schritt.

## 4. Variante B – Schrittweise Umstellung mit Fortschrittsledger und kontrollierter Übernahme
**Idee:** Der Client bleibt Quelle der Ereignisse, aber der Server führt ein **Ledger** und leitet daraus den *anerkannten* Fortschritt ab, der für Mehrspieler-Inhalte zählt (Instanzprofil). Lokale Einzelspielfunktionen bleiben unberührt.

**Bausteine (Entwurf, nicht gebaut):**
1. `character_progress` (Server): anerkannter Stand `lv`, `xp`, `cls`, `path`, `tier`, `recognized_at`, `source` (`imported`/`earned`).
2. `character_progress_events` (anhängend): Ereignisse des Clients als **Meldungen** (`xp_gain {amount, cause, mob_tier}`, `class_chosen`, `tier_up`), je mit Zeit und Version; Server prüft Übergänge und Raten.
3. Regeln des Servers: XP je Ereignis höchstens Tabellenwert (`m.xp` je Tier), Gesamtrate je Stunde begrenzt (z. B. aus tatsächlicher Kampfzeit), Level folgt nur aus `xp` nach der Formel `lv*40`, Klasse erst ab Level 5, Pfadstufe nur bei erfüllten `UP_LV` und vorhandener Vorstufe. Unbekannte/zu schnelle Meldungen werden abgelehnt oder auf „anerkannt bis X“ gekürzt.
4. `rwi.derive_profile` liest künftig `character_progress` statt `character_data`. Der Spielstand `character_data` bleibt unverändert als Client-Speicher.

**Kontrollierte Übernahme bestehender Charaktere (Stufenplan):**
- **B0 (kein Risiko):** nur *beobachten*: Ledger/Anerkannt-Stand wird aus vorhandenen Cloud-Spielständen **berechnet und gespeichert**, ohne Wirkung. Auffälligkeiten (Level ohne passende Statistik, Stufe ohne Stufenquest) werden nur gemeldet.
- **B1:** Bestandscharaktere werden **einmalig mit `source='imported'` anerkannt**, wenn die Plausibilitätsprüfung besteht (Stufe ↔ Level ↔ Klasse konsistent, Zähler passend zu `UPQ`). Auffällige bleiben „nicht anerkannt“ und sind nur im Einzelspiel nutzbar; kein Löschen, kein Zurücksetzen.
- **B2:** neue Fortschritte laufen als Ereignisse (`earned`); Rate-Limits aktiv.
- **B3 (optional, später):** schrittweise einzelne Bereiche (Ausrüstung, siehe `docs/AUSRUESTUNG_INSTANZPROFIL.md`) in serverseitige Belege überführen.
- **Sicherheit:** mittel. Begrenzt Schaden (kein Level 50 aus dem Nichts, keine Stufe-3-Fälschung ohne Zeitaufwand), beweist aber keine einzelne Tat. GPS/Kills bleiben Behauptung des Clients.
- **Aufwand:** mittel (zwei Tabellen, Meldefunktion, Prüfregeln, Import, kleine Client-Anbindung: Ereignisse mitsenden). Der Kampfcode des Clients ändert sich nicht.
- **Kompatibilität:** hoch. Lokales Spiel und Cloud-Speichern unverändert; `save_character` bleibt.
- **Migrationsrisiko:** niedrig bis mittel. B0 ist rein lesend. Das Hauptrisiko ist die Fehlklassifizierung ehrlicher Spieler in B1; Gegenmittel: Auffällige werden **nicht bestraft**, sondern nur nicht für Instanzen anerkannt, mit Hinweis und manueller Prüfmöglichkeit.

## 5. Vergleich
| Kriterium | A Vollständig | B Ledger, schrittweise |
|---|---|---|
| Sicherheit gegen Spielstand-Fälschung | sehr hoch | mittel (Plausibilität, keine Tatbeweise) |
| GPS-Fälschung | offen | offen |
| Aufwand | sehr hoch | mittel |
| Echtzeitkampf unverändert | nein | ja |
| Lokaler/Offline-Modus | entfällt | bleibt |
| Migrationsrisiko | hoch | niedrig–mittel |
| Zeit bis erster Nutzen | lang | kurz (B0 sofort lesend) |

## 6. Empfehlung
**Variante B**, beginnend mit B0 (reine Beobachtung). Vor B1 braucht es eine Entscheidung zu Rate-Limits und zum Umgang mit auffälligen Bestandscharakteren. Variante A bleibt Zielbild für den Fall, dass Wirtschaft/Wettbewerb echte Beweisbarkeit verlangen.

## 7. Auswirkungen auf bestehende Spieler
- Lokale Spieler ohne Konto: keine Änderung.
- Cloud-Spieler: B0/B1 ändern ihren Spielstand nicht; nur der Status „für Instanzen anerkannt“ kommt dazu. Ein Auffälliger kann weiter alles im Einzelspiel tun.
- Neue Charaktere: `create_character` müsste später (B2) mit Startstand (Level 1) statt freiem `p_data` anlegen. Änderung an `schema.sql` → betrifft Produktion → eigene Freigabe.

## 8. Offene Entscheidungen
1. Variante A oder B (Empfehlung B).
2. Rate-Limits (XP je Stunde, Pfadstufe-Mindestzeit).
3. Umgang mit auffälligen Bestandscharakteren (Empfehlung: nicht bestrafen, nur nicht anerkennen).
4. Ob `create_character` künftig freie `p_data` ablehnt (Produktionsänderung).
5. Aufbewahrung des Ledgers (Datenschutz, Kontolöschung kaskadiert).

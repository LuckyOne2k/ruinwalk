# Phase A: Gebietsstufen (umgesetzt)

**Weltstufe** (`worldBand`, index.html): je Region (12×12 Zellen) fest 1–5, rein aus der Regionsnummer (periodisches Dreieckswellenfeld, danach geglättet: Nachbarregionen höchstens 1 Stufe Unterschied). Kein Server, keine GPS-Daten.

**Heimat-Schutzring** (`effBand`): effektive Stufe = `min(Weltstufe, 1 + floor(Chebyshev-Abstand / 2))`. Heimat und Nachbarregionen = 1, ab 8 Regionen volle Weltstufe. Gespeichert wird nur `S.home={rx,ry,t}` (grobe Regionsnummer). Gesetzt beim ersten echten GPS-Fix (Genauigkeit ≤ 100 m), Testmodus nutzt eine virtuelle Heimat (Augsburg) und speichert nichts. Umzug: Mehr → Heimatgebiet, alle 7 Tage, mit zweitem Tipp als Bestätigung, nur mit echtem GPS.

**Spawn** (`cellEnts`, `areaEnts`): Normal/Selten ab 1, Elite ab 2, Boss ab 3, Gebietsboss ab 4 – jeweils nach effektiver Stufe.

**Skalierung** (`BSC`, `mobOf`): vorhandene Monster, Leben und Schaden je Stufe und Art; XP nach Empfehlung; Münzen ×[1, 1.6, 2.6, 4, 6]; Ausrüstungsstufe der Drops mindestens II ab Stufe 3, III ab Stufe 4. XP sinken, wenn das Level mehr als 6 über dem Monster liegt (min. 25 %).

**Ressourcen** nach Lebensraum (`HABW`). **Anzeige** oben rechts (Stufe, Name, Level-Bereich, Warnung). **Tutorial**: 4 Schritte beim ersten Start (Gerät, `ruinwalk_tut`).

Erreichbarkeit: von jedem Heimatort sind alle 5 effektiven Stufen innerhalb von 9 Regionen (getestet bis 10) erreichbar.

Datenschutz (D6): Heimatregion = grober Standortbezug (ca. 2×3 km), liegt im Spielstand/Cloud-Spielstand.

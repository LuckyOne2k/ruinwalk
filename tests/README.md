# Ruin Walk – Tests

Die Tests laden das echte Spiel (`index.html`) in Chrome, ersetzen die Karte durch eine Attrappe
(`tests/leaflet-stub.js`) und prüfen Spielstand, Ausrüstung, Crafting, Kampf, Welt, GPS und Bedienung.

    npm i -D playwright        # einmalig
    CHROME_PATH=/usr/bin/google-chrome npm test

Die Schnittstelle `window.__RW` existiert nur, wenn vor dem Laden `window.__RW_TEST=true` gesetzt wird.
Im normalen Spiel hat sie keine Wirkung.

Dateien: `harness.js` (Server, Browser), `util.js` (Helfer im Browser), `cases/*.js` (Tests).

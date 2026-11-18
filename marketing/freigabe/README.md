# Freigabeprozess

```
entwuerfe/  ──(Pascal gibt frei)──►  freigegeben/  ──(veröffentlicht)──►  veroeffentlicht/
```

1. Agent legt den Beitrag als `entwuerfe/JJJJ-MM-TT_<kanal>_<thema>.md` nach `VORLAGE_BEITRAG.md` an (`status: entwurf`), Grafik in `../grafiken/entwuerfe/`.
2. Pascal prüft Text, Bild, Fakten. Freigabe durch:
   - Eintrag im Kopf `status: freigegeben`, `freigegeben_von: Pascal`, `freigegeben_am: JJJJ-MM-TT`, oder
   - ausdrückliche Freigabe im Chat („Beitrag 001 freigegeben“) → der Agent trägt das mit Vermerk „im Chat“ ein.
   Änderungswünsche: `status: ueberarbeiten` + Notiz.
3. Datei nach `freigegeben/` verschieben. Veröffentlichung manuell (Business Suite) oder per Skript (Bestätigungsabfrage).
4. Nach Veröffentlichung nach `veroeffentlicht/` verschieben, `veroeffentlicht_am` und Link eintragen.

Ein Agent setzt **nie** selbst `status: freigegeben` ohne Pascals ausdrückliche Aussage. Eine Freigabe gilt nur für genau diesen Inhalt – nach inhaltlicher Änderung ist eine neue Freigabe nötig.

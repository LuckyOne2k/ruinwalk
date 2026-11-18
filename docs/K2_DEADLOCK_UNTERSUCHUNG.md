# k2-compare: Deadlock auf PG16 in CI-Lauf 44279099804

Stand: Untersuchung, keine Ursache bewiesen.

## Befund
- CI-Lauf 44279099804, PG16: `k2-compare skip 15` exit=1, `deadlocks:1`. PG17 und der alte Lauf zu afc5dfb: kein Deadlock.
- Vergleich afc5dfb..15f5d2e: `01_proto.sql`, `k2-compare.mjs`, `pg.mjs` sind **unverändert** (leere Diff). k2-compare lädt nur `01_proto.sql`. K1–K10 (Operator, Edge Function, Dev-Workflow, K6-Limit in 03_windows.sql) können diesen Test daher nicht beeinflussen.
- Die Deadlock-Meldung der CI-Runde wurde nicht gesichert (Artefakt-Download: 403), der volle Text liegt nicht vor.

## Wiederholungen lokal (mit Diagnose-Kopie des Tests, die den Deadlock-Text ausgibt; Testlogik unverändert)
- Variante `skip` (wie CI): 12 Läufe x 15 = 180 Durchläufe, 0 Deadlocks, exit 0.
- Variante `eigene`: 2 x 15, 0 Deadlocks.
- Variante `old` (absichtlich schlechte Vergleichsvariante): 124 bzw. 97 Deadlocks in 15 Durchläufen. Typ: Zyklus aus vier Sitzungen auf `select * from rwi.instances where id = nxt for update` in `rwi.commit_round`, Tupel-Sperre auf derselben Zeile.

## Bewertung
- Nicht reproduzierbar mit `skip`; also kein Beweis, dass der CI-Deadlock harmlos ist. Wahrscheinlich ein seltenes Timing-Fenster (Runner unter Last, gleiche Sperrreihenfolge wie in `old`), aber das ist Vermutung.
- Nächster Schritt: Der CI-Lauf gibt den vollständigen Deadlock-Text jetzt aus (siehe Workflow-Log), falls er erneut auftritt.

## Nachtrag: CI-Lauf 44282298325 (Commit 4370b84)
- `k2-compare` (Variante `skip`, 15 Durchläufe) und `k2-compare-nosweep`: auf **PG16 und PG17** jeweils `exit=0`, `deadlocks:0`, `fehler_gesamt:0`.
- Das ist **keine Behebung**. Der Deadlock aus Lauf 44279099804 trat einmal auf PG16 auf; über seine Häufigkeit ist nichts bekannt, ein einzelner grüner Lauf (und die 210 lokalen Durchläufe ohne Treffer) belegt weder, dass er nicht mehr auftritt, noch, dass er nie mit dem Test zusammenhing. Der Code, den der Test ausführt, hat sich zwischen den beiden Läufen nicht geändert (`01_proto.sql`, `k2-compare.mjs` Testlogik, `pg.mjs`); geändert wurde nur die zusätzliche Diagnoseausgabe des Deadlock-Textes.
- Status bleibt: **Ursache ungeklärt, nicht reproduziert, nicht als behoben anzusehen.** Tritt er erneut auf, steht der volle PostgreSQL-Text jetzt im Testprotokoll.

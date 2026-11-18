#!/usr/bin/env bash
# Führt alle Datenbanktests der Instanzkampf-/Supabase-Integration nacheinander aus, schreibt je Test ein Protokoll nach $RESULTS (Standard: results/)
# und eine Zusammenfassung mit PostgreSQL-Version. Läuft weiter, wenn ein Test scheitert; Ausgang ungleich 0, wenn mindestens einer scheitert.
# Aufruf: [PG_MAJOR=17] bash server/instance/tests/run-all-db.sh
set -u
cd "$(dirname "$0")/../../.."
R="${RESULTS:-results}"; mkdir -p "$R"; : > "$R/summary.txt"; bad=0
V="${PG_MAJOR:-$(ls /usr/lib/postgresql | sort -n | tail -1)}"
echo "PostgreSQL-Hauptversion der Testläufe: ${V}" | tee -a "$R/summary.txt"
run() { local name="$1"; shift; "$@" > "$R/$name.log" 2>&1; local rc=$?; local ok nok; ok=$(grep -c '^ok' "$R/$name.log"); nok=$(grep -c 'NICHT OK' "$R/$name.log")
  printf '%-22s exit=%s  ok=%s  nicht_ok=%s  | %s\n' "$name" "$rc" "$ok" "$nok" "$(grep -v '^ *$' "$R/$name.log" | tail -1 | cut -c1-70)" | tee -a "$R/summary.txt"; [ "$rc" -eq 0 ] || bad=1; }
for t in run fenster gruppe eventende semantik produktion dev-umgebung konto-integration konto-regel loesch-trigger installation rechte-audit worker worker-a1 stuck; do run "$t" node server/instance/tests/$t.mjs; done
run k2-compare node server/instance/tests/k2-compare.mjs skip 15
run k2-compare-nosweep node server/instance/tests/k2-compare.mjs skip 15 nosweep
run dungeon-3 node server/instance/sim/run-dungeon.mjs --seed 3 --ruhig
run dungeon-4 node server/instance/sim/run-dungeon.mjs --seed 4 --ruhig
run dungeon-5 node server/instance/sim/run-dungeon.mjs --seed 5 --ruhig
run weltboss-ende node server/instance/sim/run-dungeon.mjs --seed 3 --weltboss-ende --ruhig
run supabase-schema bash supabase/tests/run.sh
echo "Gesamtergebnis: $([ $bad -eq 0 ] && echo ALLES BESTANDEN || echo FEHLER)" | tee -a "$R/summary.txt"
exit $bad

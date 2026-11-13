#!/usr/bin/env bash
# Führt die SQL-Tests gegen ein ECHTES, FRISCHES Supabase-Testprojekt aus (Schema muss bereits eingespielt sein).
# NIE gegen ein Projekt mit echten Spielerdaten: die Tests legen Testkonten an und zählen Zeilen (leere Datenbank vorausgesetzt).
# Aufruf: PGURL='postgresql://postgres:PASSWORT@db.PROJEKT.supabase.co:5432/postgres' bash supabase/tests/run_remote.sh
set -euo pipefail
: "${PGURL:?PGURL setzen (Dashboard > Connect > Direct connection)}"
D="$(cd "$(dirname "$0")" && pwd)"
psql "$PGURL" -X -q -v ON_ERROR_STOP=1 -f "$D/01_tap.sql" >/dev/null
psql "$PGURL" -X -q -v ON_ERROR_STOP=1 -f "$D/10_tests.sql" | grep -v '^ *$' | tee /tmp/rw_remote.out || true
grep -q 'NICHT OK\|ERROR' /tmp/rw_remote.out && { echo FEHLER; exit 1; } || tail -1 /tmp/rw_remote.out
echo "Aufräumen: drop schema tap cascade;  (Testkonten wurden von den Tests selbst gelöscht bzw. in auth.users prüfen)"

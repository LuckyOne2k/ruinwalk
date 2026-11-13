#!/usr/bin/env bash
# Startet ein temporäres PostgreSQL, spielt Attrappe + Schema + Tests ein. Aufruf: bash supabase/tests/run.sh
set -euo pipefail
# Ohne RW_MODE werden beide Supabase-Standardmodi nacheinander getestet (neue Projekte ohne Standardrechte / ältere mit Standardrechten).
if [ -z "${RW_MODE:-}" ]; then
  echo "== Modus: neue Projekte (keine automatischen Rechte) =="; o=$(RW_MODE=new bash "$0") || { echo "$o" | grep -v '^ok'; exit 1; }; echo "$o" | tail -1
  echo "== Modus: ältere Projekte (automatische Rechte für API-Rollen) =="; o=$(RW_MODE=legacy LEGACY=1 bash "$0") || { echo "$o" | grep -v '^ok'; exit 1; }; echo "$o" | tail -1
  exit 0
fi
D="$(cd "$(dirname "$0")" && pwd)"; BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1); PORT=${PGTESTPORT:-54329}
RUN=""; TMP=$(mktemp -d); chmod 755 "$TMP"
if [ "$(id -u)" = 0 ]; then id postgres >/dev/null; chown postgres "$TMP"; chmod 755 "$D" "$D/.." ; RUN="runuser -u postgres --"; fi
$RUN $BIN/initdb -D "$TMP/data" -A trust -U postgres >/dev/null
$RUN $BIN/pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
trap '$RUN $BIN/pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1; rm -rf "$TMP"' EXIT
P="$BIN/psql -h $TMP -p $PORT -U postgres -X -q -v ON_ERROR_STOP=1"
$RUN $P -d postgres -c "create database rw" >/dev/null
$RUN $P -d rw ${LEGACY:+-v legacy=1} -f "$D/00_stub.sql" >/dev/null
$RUN $P -d rw -f "${SCHEMA:-$D/../schema.sql}" >/dev/null
$RUN $P -d rw -f "$D/01_tap.sql" >/dev/null
set +e
$RUN $P -d rw -f "$D/10_tests.sql" 2>&1 | grep -v '^ *$' | tee "$TMP/out"
set -e
if grep -q 'NICHT OK\|ERROR\|fehlgeschlagen' "$TMP/out"; then echo "FEHLER"; exit 1; fi
tail -1 "$TMP/out"

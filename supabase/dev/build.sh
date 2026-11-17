#!/usr/bin/env bash
# Erzeugt supabase/dev/install_dev.sql: Preflight + schema.sql + rwi 01..05 in der festen Reihenfolge. Die Datei ist ERZEUGT (nicht einchecken, kein Handedit).
# Ausführung nur in EINER Transaktion: psql -1 -v ON_ERROR_STOP=1 -f install_dev.sql (oder als eine Migration über den Supabase-Migrationsweg).
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; OUT="${1:-$D/install_dev.sql}"
{
  echo "-- ERZEUGT von supabase/dev/build.sh - nicht von Hand ändern. Reihenfolge: preflight, schema.sql, rwi 01..05."
  for f in "$D/00_preflight.sql" "$R/supabase/schema.sql" "$R/server/instance/sql/01_proto.sql" "$R/server/instance/sql/02_actions.sql" "$R/server/instance/sql/03_windows.sql" "$R/server/instance/sql/04_gruppe.sql" "$R/server/instance/sql/05_produktion.sql"; do
    echo; echo "-- ===== $(basename "$f") ====="; cat "$f"; echo
  done
} > "$OUT"
echo "geschrieben: $OUT ($(wc -l < "$OUT") Zeilen, sha256 $(sha256sum "$OUT" | cut -c1-16))"

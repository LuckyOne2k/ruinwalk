#!/usr/bin/env bash
# Erzeugt supabase/dev/install_dev.sql: Preflight + schema.sql + rwi 01..05 in der festen Reihenfolge. Die Datei ist ERZEUGT (nicht einchecken, kein Handedit).
# Die Datei steht in EINER eigenen Transaktion (genau ein begin am Anfang, genau ein commit am Ende; die eingebundenen Dateien enthalten keine Transaktionssteuerung).
# Ausführung: bash supabase/dev/install_dev.sh <sha256> (psql -v ON_ERROR_STOP=1 -f -, ohne -1). Auch bei fehlendem ON_ERROR_STOP kann ein Fehler keine halbe Installation hinterlassen.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; OUT="${1:-$D/install_dev.sql}"
{
  echo "-- ERZEUGT von supabase/dev/build.sh - nicht von Hand ändern. Reihenfolge: preflight, schema.sql, rwi 01..05."
  echo "-- Eigene Transaktion: begin vor der Zielprüfung, commit nach 05. Ein Fehler irgendwo macht alles rückgängig (auch ohne psql -1 und ohne ON_ERROR_STOP)."
  echo "begin;"
  echo "-- Sperr-Wartezeit begrenzen, BEVOR die erste Sperre angefordert wird (schema.sql legt Fremdschlüssel und Trigger auf auth.users an: SHARE ROW EXCLUSIVE)."
  echo "-- 5 s: Eine wartende Sperranforderung blockiert in PostgreSQL auch alle später ankommenden Schreibzugriffe auf auth.users (GoTrue) – lieber schnell"
  echo "-- abbrechen (alles wird zurückgenommen) und erneut starten als Anmeldungen hängen zu lassen. Auf Dev (0 Nutzer) wird die Sperre normalerweise sofort gewährt."
  echo "set local lock_timeout = '5s';"
  for f in "$D/00_preflight.sql" "$R/supabase/schema.sql" "$R/server/instance/sql/01_proto.sql" "$R/server/instance/sql/02_actions.sql" "$R/server/instance/sql/03_windows.sql" "$R/server/instance/sql/04_gruppe.sql" "$R/server/instance/sql/05_produktion.sql"; do
    echo; echo "-- ===== $(basename "$f") ====="; cat "$f"; echo
  done
  echo "commit;"
} > "$OUT"
echo "geschrieben: $OUT ($(wc -l < "$OUT") Zeilen, sha256 $(sha256sum "$OUT" | cut -c1-16))"

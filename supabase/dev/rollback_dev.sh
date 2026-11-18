#!/usr/bin/env bash
# Führt supabase/dev/rollback_dev.sql aus - ausschließlich gegen ruinwalk-dev, nur auf ausdrückliche Freigabe.
# Aufruf:  RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='<Verbindung zu ruinwalk-dev, Port 5432>' RW_ROLLBACK_CONFIRM=ja-loeschen \
#            bash supabase/dev/rollback_dev.sh <erwarteter-SHA-256-der-rollback_dev.sql>      (SHA-256: sha256sum supabase/dev/rollback_dev.sql)
# Zulässige Verbindung exakt wie bei install_dev.sh (ohne Passwort in der URL, Passwort über PGPASSWORD, nur Port 5432). Gemeinsame Schutzlogik: supabase/dev/_ziel_wrapper.sh
# Projektreferenz UND Bestätigung werden als  set local  in der Transaktion der Datei gesetzt (gemeinsame Schutzlogik: supabase/dev/_ziel_wrapper.sh).
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; RW_SKRIPT=rollback_dev.sh
source "$D/_ziel_wrapper.sh"
rw_pruefe_ziel
[ "${RW_ROLLBACK_CONFIRM:-}" = "ja-loeschen" ] || fail "RW_ROLLBACK_CONFIRM=ja-loeschen fehlt (ausdrückliche Bestätigung für das Löschen der Dev-Installation)"
rw_fuehre_aus "${1:-}" "${RW_ROLLBACK_FILE:-$D/rollback_dev.sql}" rollback_dev.sql "der Rollback" "set local rw.rollback_confirm = 'ja-loeschen';"

#!/usr/bin/env bash
# Führt supabase/dev/cleanup_test_accounts.sql aus (löscht NUR Testkonten @rwtest.invalid) - ausschließlich gegen ruinwalk-dev, nur auf ausdrückliche Freigabe.
# Aufruf:  RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='<Verbindung zu ruinwalk-dev, Port 5432>' RW_ROLLBACK_CONFIRM=ja-loeschen \
#            bash supabase/dev/cleanup_dev.sh <erwarteter-SHA-256-der-cleanup_test_accounts.sql>
# Zulässige Verbindung exakt wie bei install_dev.sh (ohne Passwort in der URL, Passwort über PGPASSWORD, nur Port 5432). Gemeinsame Schutzlogik: supabase/dev/_ziel_wrapper.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; RW_SKRIPT=cleanup_dev.sh
source "$D/_ziel_wrapper.sh"
rw_pruefe_ziel
[ "${RW_ROLLBACK_CONFIRM:-}" = "ja-loeschen" ] || fail "RW_ROLLBACK_CONFIRM=ja-loeschen fehlt (ausdrückliche Bestätigung für das Löschen der Testkonten)"
rw_fuehre_aus "${1:-}" "${RW_CLEANUP_FILE:-$D/cleanup_test_accounts.sql}" cleanup_test_accounts.sql "das Cleanup" "set local rw.rollback_confirm = 'ja-loeschen';"

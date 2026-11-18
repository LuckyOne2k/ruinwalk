#!/usr/bin/env bash
# Führt supabase/dev/install_dev.sql aus - ausschließlich gegen ruinwalk-dev. Wird NICHT automatisch gestartet (nur auf ausdrückliche Freigabe).
# Aufruf:  RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='<Verbindung zu ruinwalk-dev, Port 5432>' bash supabase/dev/install_dev.sh <erwarteter-SHA-256-der-install_dev.sql>
# Zulässige Verbindung (exakt, OHNE Passwort): postgresql://postgres@db.jlkqktmvqxibqdcobbhf.supabase.co:5432/postgres (direkt) oder
#   postgresql://postgres.jlkqktmvqxibqdcobbhf@aws-<n>-<region>.pooler.supabase.com:5432/postgres (Session-Pooler), optional ?sslmode=require|verify-ca|verify-full.
#   NICHT Port 6543. Passwort nur über PGPASSWORD (z. B.  read -rs PGPASSWORD; export PGPASSWORD ) - nie in die URL.
# Es gibt KEINE Voreinstellung und keinen Ersatzwert: fehlt eine Angabe oder weicht sie ab, bricht das Skript ab, bevor psql aufgerufen wird.
# Gemeinsame Schutzlogik (Ziel, Port, Umgebung, Hash, Referenz in der Transaktion): supabase/dev/_ziel_wrapper.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; RW_SKRIPT=install_dev.sh
source "$D/_ziel_wrapper.sh"
rw_pruefe_ziel
rw_fuehre_aus "${1:-}" "${RW_INSTALL_FILE:-$D/install_dev.sql}" install_dev.sql "die Installation"

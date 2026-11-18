#!/usr/bin/env bash
# Führt supabase/dev/install_dev.sql aus - ausschließlich gegen ruinwalk-dev. Wird NICHT automatisch gestartet (nur auf ausdrückliche Freigabe).
# Aufruf:  RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='<Verbindungszeichenfolge von ruinwalk-dev>' bash supabase/dev/install_dev.sh <erwarteter-SHA-256-der-install_dev.sql>
# Es gibt KEINE Voreinstellung und keinen Ersatzwert: fehlt eine Angabe oder weicht sie ab, bricht das Skript ab, bevor psql aufgerufen wird.
# Die Verbindungszeichenfolge ist ein Geheimnis: sie wird nur aus der Umgebung gelesen, nie ausgegeben und nie in eine Datei geschrieben.
set -euo pipefail
DEV_REF='jlkqktmvqxibqdcobbhf'; PROD_REF='malbiahllucctiafzydv'
D="$(cd "$(dirname "$0")" && pwd)"; FILE="${RW_INSTALL_FILE:-$D/install_dev.sql}"
fail() { echo "install_dev.sh: ABBRUCH - $1" >&2; exit 2; }
[ -n "${RW_PROJECT_REF:-}" ] || fail "RW_PROJECT_REF ist nicht gesetzt (erwartet: $DEV_REF)"
[ "$RW_PROJECT_REF" != "$PROD_REF" ] || fail "Produktion ist ausdrücklich ausgeschlossen"
[ "$RW_PROJECT_REF" = "$DEV_REF" ] || fail "RW_PROJECT_REF weicht von ruinwalk-dev ab"
[ -n "${RW_DB_URL:-}" ] || fail "RW_DB_URL ist nicht gesetzt"
case "$RW_DB_URL" in *"$PROD_REF"*) fail "die Verbindung nennt die Produktionsreferenz" ;; esac
# Verbindung muss als URL vorliegen und Host ODER Benutzer von ruinwalk-dev nennen; Überschreibungen über Abfrageparameter (host=, hostaddr=, user=, service= ...) sind nicht erlaubt
re='^postgres(ql)?://([^:@/?]+)(:[^@/?]*)?@([^:/?]+)(:[0-9]+)?(/[^?]*)?(\?.*)?$'
[[ "$RW_DB_URL" =~ $re ]] || fail "RW_DB_URL ist keine URL der Form postgresql://benutzer:passwort@host:port/datenbank"
CONN_USER="${BASH_REMATCH[2]}"; CONN_HOST="${BASH_REMATCH[4]}"; CONN_QUERY="${BASH_REMATCH[7]}"
case "$CONN_QUERY" in *host=*|*hostaddr=*|*user=*|*service=*|*dbname=*|*Host=*|*HOST=*) fail "Überschreibungen von Host/Benutzer/Dienst in der Verbindung sind nicht erlaubt" ;; esac
if [ "$CONN_HOST" = "db.$DEV_REF.supabase.co" ]; then :
elif [ "$CONN_USER" = "postgres.$DEV_REF" ] && [[ "$CONN_HOST" == *.pooler.supabase.com ]]; then :
else fail "die Verbindung nennt die Referenz von ruinwalk-dev nicht als Host (db.<ref>.supabase.co) oder als Benutzer an einem Supabase-Pooler (postgres.<ref>)"; fi
EXPECT="${1:-}"; [ -n "$EXPECT" ] || fail "erwarteter SHA-256 der install_dev.sql fehlt (1. Argument)"
[ -f "$FILE" ] || fail "install_dev.sql fehlt (erst build.sh ausführen)"
# EINE private Kopie: genau diese Bytes werden hier gehasht und gleich danach ausgeführt (kein zweites Lesen der Originaldatei, keine Lücke dazwischen)
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT; chmod 600 "$TMP"; cp "$FILE" "$TMP"
HAVE="$(sha256sum "$TMP" | cut -d' ' -f1)"
[ "$HAVE" = "$EXPECT" ] || fail "SHA-256 der auszuführenden install_dev.sql weicht vom erwarteten Wert ab"
echo "install_dev.sh: SHA-256 der auszuführenden Datei stimmt ($HAVE), Ziel ruinwalk-dev ($DEV_REF)" >&2
# Die Datei enthält ihre eigene Transaktion (begin ... commit), deshalb KEIN psql -1 (keine verschachtelte Steuerung). Abbruch beim ersten Fehler (ON_ERROR_STOP=1).
# Die Referenz wird VOR der Datei gesetzt (Sitzungseinstellung); die Zielprüfung in der Datenbank prüft sie gegen die Datenbankkennung.
if ! { echo "set rw.project_ref = '$RW_PROJECT_REF';"; cat "$TMP"; } | psql "$RW_DB_URL" -v ON_ERROR_STOP=1 -f -; then
  fail "psql ist mit einem Fehler beendet worden - die Installation gilt als FEHLGESCHLAGEN (die Transaktion wurde zurückgerollt, nichts bleibt installiert)"
fi
echo "install_dev.sh: Installation ohne Fehler abgeschlossen (SHA-256 $HAVE)" >&2

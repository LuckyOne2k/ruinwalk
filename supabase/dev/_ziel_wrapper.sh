#!/usr/bin/env bash
# Gemeinsamer Schutz für install_dev.sh, rollback_dev.sh und cleanup_dev.sh (wird per  source  eingebunden, nie direkt ausgeführt).
# Garantien: (1) nur ruinwalk-dev (Referenz + Verbindungsziel), nie Produktion; (2) nur Port 5432 (Direktverbindung oder Session-Pooler),
# kein Transaktions-Pooler; (3) die libpq-/psql-Umgebung kann das geprüfte Ziel nicht verändern; (4) genau die gehashte Datei wird ausgeführt;
# (5) Projektreferenz und Bestätigung werden als  set local  INNERHALB der Transaktion der Datei gesetzt (direkt nach dem einleitenden begin;) –
# Zielprüfung (Datenbankkennung) und Aktion laufen damit garantiert in derselben Transaktion auf demselben Server-Backend, auch hinter einem Pooler.
# (6) Das Passwort steht NICHT in der URL (Prozessliste), sondern kommt aus PGPASSWORD und erreicht psql nur über eine private pgpass-Datei,
# die an genau den geprüften Host gebunden ist - an einen anderen Host gibt libpq es nicht heraus. Die URL wird nie ausgegeben.
set -euo pipefail
# libpq-/psql-Umgebung neutralisieren, BEVOR irgendetwas geprüft oder verbunden wird: PGHOSTADDR, PGHOST, PGPORT, PGSERVICE(FILE), PGOPTIONS,
# PGSSLMODE, PGTARGETSESSIONATTRS, PSQLRC usw. könnten sonst Ziel, Port, Sitzungsoptionen oder TLS der geprüften URL unterlaufen (die URL nennt z. B. keinen hostaddr,
# den libpq dann aus PGHOSTADDR nähme). Einzige Ausnahme: PGPASSWORD (enthält nur das Passwort, lenkt die Verbindung nicht um).
for v in $(compgen -e); do case "$v" in PGPASSWORD) ;; PG*|PSQLRC|PSQL_HISTORY) unset "$v" ;; esac; done
shopt -u nocasematch   # Mustervergleiche strikt nach Groß-/Kleinschreibung
export PGSSLMODE=require
DEV_REF='jlkqktmvqxibqdcobbhf'; PROD_REF='malbiahllucctiafzydv'
: "${RW_SKRIPT:?RW_SKRIPT fehlt (nur über install_dev.sh, rollback_dev.sh oder cleanup_dev.sh aufrufen)}"
fail() { echo "$RW_SKRIPT: ABBRUCH - $1" >&2; exit 2; }

rw_pruefe_ziel() {
  local LC_ALL=C   # Zeichenbereiche wie [a-z] strikt nach Byte-Werten (unabhängig von der Locale des Aufrufers)
  [ -n "${RW_PROJECT_REF:-}" ] || fail "RW_PROJECT_REF ist nicht gesetzt (erwartet: $DEV_REF)"
  [ "$RW_PROJECT_REF" != "$PROD_REF" ] || fail "Produktion ist ausdrücklich ausgeschlossen"
  [ "$RW_PROJECT_REF" = "$DEV_REF" ] || fail "RW_PROJECT_REF weicht von ruinwalk-dev ab"
  [ -n "${RW_DB_URL:-}" ] || fail "RW_DB_URL ist nicht gesetzt"
  case "$RW_DB_URL" in *"$PROD_REF"*) fail "die Verbindung nennt die Produktionsreferenz" ;; esac
  # POSITIVLISTE statt Sperrliste (libpq 16 belegt: dekodiert %xx in Parameternamen UND -werten, nimmt bei doppelten Parametern den letzten,
  # trennt mit &, kennt kein #-Fragment, verbindet bei  h1,h2  nacheinander zu mehreren Hosts, behandelt POSTGRESQL:// nicht als URL).
  # 1) Zeichenvorrat: nur Kleinbuchstaben, Ziffern und . : / @ ? = -  -> ausgeschlossen sind u. a. %, #, &, Komma, [ ], \, Leer- und Steuerzeichen, Großbuchstaben.
  [[ "$RW_DB_URL" =~ ^[a-z0-9.:/@?=-]+$ ]] || fail "unzulässige Zeichen in RW_DB_URL (erlaubt: a-z 0-9 . : / @ ? = -; keine Prozentkodierung, kein #, &, Komma, Klammern, Großbuchstaben)"
  # 2) Grobzerlegung nur für verständliche Meldungen; entscheidend ist die exakte Form in Schritt 3.
  local re='^postgres(ql)?://([^:@/?]+)(:[^@/?]*)?@([^:/?@]+)(:[0-9]*)?(/[^?]*)?(\?.*)?$'
  [[ "$RW_DB_URL" =~ $re ]] || fail "RW_DB_URL ist keine URL der Form postgresql://benutzer@host:5432/postgres"
  local CONN_USER="${BASH_REMATCH[2]}" CONN_PW="${BASH_REMATCH[3]}" CONN_HOST="${BASH_REMATCH[4]}" CONN_PORT="${BASH_REMATCH[5]}" CONN_QUERY="${BASH_REMATCH[7]}"
  [ -z "$CONN_PW" ] || fail "das Passwort gehört nicht in RW_DB_URL (sonst in der Prozessliste sichtbar) - Passwort über PGPASSWORD übergeben"
  [ -z "$CONN_PORT" ] || [ "$CONN_PORT" = ":5432" ] || fail "nur Port 5432 (Direktverbindung oder Session-Pooler) ist erlaubt, nicht ${CONN_PORT#:} (Transaktions-Pooler oder unbekannt)"
  case "$CONN_QUERY" in ''|'?sslmode=require'|'?sslmode=verify-ca'|'?sslmode=verify-full') ;; *) fail "als Abfrageteil ist nur ?sslmode=require, ?sslmode=verify-ca oder ?sslmode=verify-full erlaubt (keine weiteren, doppelten oder leeren Parameter)" ;; esac
  if [ "$CONN_HOST" = "db.$DEV_REF.supabase.co" ] && [ "$CONN_USER" = "postgres" ]; then :
  elif [ "$CONN_USER" = "postgres.$DEV_REF" ] && [[ "$CONN_HOST" =~ ^aws-[0-9]+-[a-z]{2}-[a-z]+-[0-9]+\.pooler\.supabase\.com$ ]]; then :
  else fail "die Verbindung nennt die Referenz von ruinwalk-dev nicht als Host (postgres@db.<ref>.supabase.co) oder als Benutzer an einem Supabase-Session-Pooler (postgres.<ref>@aws-N-<region>.pooler.supabase.com)"; fi
  # 3) Exakte Gesamtform (zweite, unabhängige Sicherung): genau ein Host, genau ein Benutzer, kein Passwort, Port 5432 oder keiner, Datenbank postgres.
  local TLS='(\?sslmode=(require|verify-ca|verify-full))?'
  local DIREKT="^postgres(ql)?://postgres@db\.${DEV_REF}\.supabase\.co(:5432)?/postgres${TLS}\$"
  local POOLER="^postgres(ql)?://postgres\.${DEV_REF}@aws-[0-9]+-[a-z]{2}-[a-z]+-[0-9]+\.pooler\.supabase\.com(:5432)?/postgres${TLS}\$"
  [[ "$RW_DB_URL" =~ $DIREKT || "$RW_DB_URL" =~ $POOLER ]] || fail "RW_DB_URL entspricht nicht exakt der erlaubten Form (postgresql://postgres@db.<ref>.supabase.co:5432/postgres oder postgresql://postgres.<ref>@aws-N-<region>.pooler.supabase.com:5432/postgres, optional ?sslmode=require|verify-ca|verify-full)"
  RW_HOST="$CONN_HOST"; RW_USER="$CONN_USER"
  # Passwort: nur aus PGPASSWORD (Umgebung ist unter Linux nur für den eigenen Benutzer lesbar, die Kommandozeile für alle).
  [ -n "${PGPASSWORD:-}" ] || fail "PGPASSWORD ist nicht gesetzt (Passwort von ruinwalk-dev; nicht in die URL schreiben)"
  [[ "$PGPASSWORD" != *[[:cntrl:]]* ]] || fail "PGPASSWORD enthält Steuerzeichen"
}

# rw_fuehre_aus <erwarteter-SHA-256> <datei> <dateiname-für-meldungen> <aktion-für-meldungen> [zusätzliche set-local-Zeilen ...]
rw_fuehre_aus() {
  local EXPECT="$1" FILE="$2" NAME="$3" AKTION="$4"; shift 4
  [ -n "$EXPECT" ] || fail "erwarteter SHA-256 der $NAME fehlt (1. Argument)"
  [ -f "$FILE" ] || fail "$NAME fehlt"
  # EINE private Kopie: genau diese Bytes werden hier gehasht und gleich danach ausgeführt (kein zweites Lesen der Originaldatei, keine Lücke dazwischen)
  TMP="$(mktemp)"; PASSF="$(mktemp)"; trap 'rm -f "$TMP" "$PASSF"' EXIT; chmod 600 "$TMP" "$PASSF"; cp "$FILE" "$TMP"
  local HAVE; HAVE="$(sha256sum "$TMP" | cut -d' ' -f1)"
  [ "$HAVE" = "$EXPECT" ] || fail "SHA-256 der auszuführenden $NAME weicht vom erwarteten Wert ab"
  echo "$RW_SKRIPT: SHA-256 der auszuführenden Datei stimmt ($HAVE), Ziel ruinwalk-dev ($DEV_REF)" >&2
  # Die Datei enthält ihre eigene Transaktion (begin ... commit), deshalb KEIN psql -1. Abbruch beim ersten Fehler (ON_ERROR_STOP=1). -X: keine ~/.psqlrc. -w: nie nach einem Passwort fragen (ohne Terminal läse psql es sonst aus stdin = aus dem SQL-Strom).
  local FIRST; FIRST="$(awk '!/^[[:space:]]*--/ && !/^[[:space:]]*$/ { print; exit }' "$TMP")"   # awk statt grep|head: kein SIGPIPE unter pipefail
  [ "$FIRST" = "begin;" ] || fail "$NAME beginnt nicht mit  begin;  (erste Anweisung) - Referenz kann nicht sicher in die Transaktion gesetzt werden"
  local EXTRA; EXTRA="$(printf '%s\n' "set local rw.project_ref = '$DEV_REF';" "$@")"
  # Passwort in eine private pgpass-Datei (600), gebunden an GENAU den geprüften Host, Port 5432, Datenbank postgres und Benutzer: libpq gibt es
  # nur an diesen Host heraus. printf ist ein Shell-Builtin (kein eigener Prozess, nichts in der Prozessliste). psql bekommt PGPASSWORD nicht mit.
  local PW="${PGPASSWORD//\\/\\\\}"; PW="${PW//:/\\:}"
  printf '%s:5432:postgres:%s:%s\n' "$RW_HOST" "$RW_USER" "$PW" > "$PASSF"
  if ! ( unset PGPASSWORD; export PGPASSFILE="$PASSF"
         awk -v extra="$EXTRA" '!done && $0 == "begin;" { print; print extra; done = 1; next } { print }' "$TMP" \
           | psql "$RW_DB_URL" -X -w -v ON_ERROR_STOP=1 -f - ); then
    fail "psql ist mit einem Fehler beendet worden - $AKTION gilt als FEHLGESCHLAGEN (die Transaktion wurde zurückgerollt, nichts wurde verändert)"
  fi
  echo "$RW_SKRIPT: $AKTION ohne Fehler abgeschlossen (SHA-256 $HAVE)" >&2
}

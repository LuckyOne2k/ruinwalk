#!/usr/bin/env bash
# Vergleicht den Digest der Engine über alle verfügbaren JavaScript-Laufzeiten (Node/V8, Bun/JavaScriptCore, Deno/V8).
cd "$(dirname "$0")"; fail=0; ref=""; n=0
for rt in node bun deno; do
  command -v $rt >/dev/null || { echo "übersprungen (nicht installiert): $rt"; continue; }
  if [ $rt = deno ]; then out=$(deno run --allow-none determinism.mjs 2>&1) || out=$(deno run determinism.mjs 2>&1); else out=$($rt determinism.mjs 2>&1); fi
  echo "$rt: $out"; d=$(echo "$out" | sed -n 's/.*"digest":"\([0-9a-f]*\)".*/\1/p'); [ -z "$d" ] && { fail=1; continue; }
  echo "$out" | grep -q '"vectors_ok":true' || fail=1
  n=$((n+1)); if [ -z "$ref" ]; then ref=$d; elif [ "$ref" != "$d" ]; then echo "ABWEICHUNG bei $rt"; fail=1; fi
done
[ $n -lt 2 ] && { echo "weniger als 2 Laufzeiten verfügbar"; fail=1; }
[ $fail = 0 ] && echo "DETERMINISMUS OK ($n Laufzeiten, identischer Digest)" || { echo "DETERMINISMUS FEHLER"; exit 1; }

// Diagnoseausgabe für Datenbanktests (K.2-Deadlock-Bericht, Prio 1): macht PostgreSQL-Fehler und das Serverlog der
// temporären Testinstanz in den CI-Protokollen sichtbar. Ändert keine Testlogik – nur zusätzliche Ausgaben auf stderr.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// psql-Schalter: Fehlermeldung mit SQLSTATE, DETAIL, HINT, CONTEXT (PL/pgSQL-Zeile) und LOCATION.
export const PSQL_VERBOSE = ['-v', 'VERBOSITY=verbose', '-v', 'SHOW_CONTEXT=always'];
// Serverschalter: SQLSTATE und Quellort auch im Serverlog. Das Log enthält bei Deadlocks die Anweisungen aller beteiligten Prozesse.
// lc_messages=C: Meldungen immer englisch ("deadlock detected", "still waiting"), unabhängig von der Sprache der Umgebung.
export const SERVER_VERBOSE = '-c log_error_verbosity=verbose -c lc_messages=C';

// Ein fehlgeschlagener psql-Aufruf als zusammenhängender, klar abgegrenzter Block.
export function formatPgError(label, res) {
  const err = (res.err || '').trim() || '(keine Fehlermeldung auf stderr)';
  return [`----- PostgreSQL-Fehler: ${label} (psql-Exit ${res.code}) -----`, err, '----- Ende Fehler -----'].join('\n');
}

// Serverlog der Testinstanz. Ist es länger als maxLines, erscheinen alle Abschnitte um "deadlock detected" vollständig,
// dazu das Ende des Logs – so geht die Deadlock-Meldung mit den Anweisungen der beteiligten Prozesse nie verloren.
export function serverLogReport(tmpDir, maxLines = 4000, around = 40) {
  const p = join(tmpDir, 'log');
  if (!existsSync(p)) return `----- PostgreSQL-Serverlog: nicht gefunden (${p}) -----`;
  let text;
  try { text = readFileSync(p, 'utf8'); } catch (e) { return `----- PostgreSQL-Serverlog: nicht lesbar (${e.message}) -----`; }
  const lines = text.split('\n');
  const out = [`----- PostgreSQL-Serverlog der Testinstanz (${lines.length} Zeilen) -----`];
  if (lines.length <= maxLines) out.push(text.trimEnd());
  else {
    const keep = new Set();
    lines.forEach((l, i) => { if (/deadlock detected/i.test(l)) for (let k = Math.max(0, i - around); k <= Math.min(lines.length - 1, i + around); k++) keep.add(k); });
    const tail = Math.max(0, lines.length - Math.floor(maxLines / 4));
    for (let k = tail; k < lines.length; k++) keep.add(k);
    let prev = -1;   // Zeilennummern in der Meldung 1-basiert
    for (const k of [...keep].sort((a, b) => a - b)) { if (k !== prev + 1) out.push(`[… Zeilen ${prev + 2}–${k} ausgelassen …]`); out.push(lines[k]); prev = k; }
  }
  out.push('----- Ende Serverlog -----');
  return out.join('\n');
}

// Prüft die Diagnoseausgabe für PostgreSQL-Fehler (K.2-Deadlock-Bericht, Prio 1): node server/instance/tests/diagnose-test.mjs
// Erzeugt in einer eigenen, temporären Testinstanz einen echten Deadlock (zwei Sitzungen, zwei Zeilen, gekreuzte Reihenfolge) und
// prüft, dass psql-Meldung und Serverlog alle Angaben enthalten. Der K.2-Vergleich selbst wird dafür nicht verändert.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCluster } from './pg.mjs';
import { PSQL_VERBOSE, SERVER_VERBOSE, formatPgError, serverLogReport } from './diagnose.mjs';
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };

// 1) Echter Deadlock in einer PL/pgSQL-Funktion (wie commit_round/sweep_event): A sperrt 1 dann 2, B sperrt 2 dann 1.
//    Synchronisierung über prüfbare Bedingungen statt fester Pausen (keine Zeitannahme für die Entstehung des Deadlocks):
//    - Jede Sitzung setzt nach dem Sperren ihrer ersten Zeile ein Signal (Advisory-Lock 41 = A, 42 = B), sichtbar in pg_locks.
//    - A greift erst auf Zeile 2 zu, wenn B nachweislich Zeile 2 hält (Signal 42 vergeben) – A wartet dann auf B.
//    - B greift erst auf Zeile 1 zu, wenn A nachweislich auf eine Transaktion wartet UND der Sperrwarte-Eintrag von A im Serverlog steht.
//      Damit hat die Deadlock-Prüfung von A schon ohne Zyklus stattgefunden; erst B schließt den Zyklus und wird sicher das Opfer.
//    Die Wartedauer zwischen zwei Abfragen (10 ms) und die Obergrenze (30 s, dann klarer Fehler statt Hängen) sind keine Bedingung für den Deadlock.
const cl = await startCluster(54402, SERVER_VERBOSE);
try {
  const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err); return r.out; };
  await q(`create table dl (id int primary key, v int); insert into dl values (1, 0), (2, 0);
    create function kreuz(a int, b int, rolle text, logdatei text) returns void language plpgsql as $$
    declare bis timestamptz := clock_timestamp() + interval '30 seconds'; gegner int;
    begin
      update dl set v = v + 1 where id = a;                                                        -- erste Zeile sperren
      perform pg_advisory_lock_shared(case rolle when 'A' then 41 else 42 end);                    -- Signal: erste Zeile gehalten
      loop
        if rolle = 'A' then
          exit when exists (select 1 from pg_locks where locktype = 'advisory' and classid = 0 and objid = 42 and objsubid = 1 and granted);
        else
          select pid into gegner from pg_locks where locktype = 'advisory' and classid = 0 and objid = 41 and objsubid = 1 and granted;
          exit when gegner is not null
            and exists (select 1 from pg_locks where pid = gegner and locktype = 'transactionid' and not granted)
            and position('process ' || gegner || ' still waiting' in pg_read_file(logdatei)) > 0;
        end if;
        if clock_timestamp() > bis then raise exception 'Synchronisierung %: Bedingung nach 30 s nicht erfüllt', rolle; end if;
        perform pg_sleep(0.01);
      end loop;
      update dl set v = v + 1 where id = b;                                                        -- zweite Zeile: A wartet auf B, B schließt den Zyklus
    end $$;`);
  const logdatei = join(cl.tmp, 'log').replaceAll("'", "''");
  const r = await Promise.all([cl.psql(`select kreuz(1, 2, 'A', '${logdatei}');`, 'rwi', PSQL_VERBOSE), cl.psql(`select kreuz(2, 1, 'B', '${logdatei}');`, 'rwi', PSQL_VERBOSE)]);
  const bad = r.filter((x) => x.code), msg = bad.map((x, k) => formatPgError(`Sitzung ${r.indexOf(x) + 1}`, x)).join('\n');
  ok(bad.length === 1 && !r[0].code && r[1].code, 'genau eine Sitzung (B, schließt den Zyklus) wird als Deadlock-Opfer abgebrochen, A läuft durch', `Fehler=${bad.length}, Opfer=Sitzung ${r.indexOf(bad[0]) + 1}`);
  ok(/deadlock/i.test(msg), 'Erkennung wie im K.2-Vergleich (/deadlock/i) greift weiterhin');
  ok(/ERROR:\s+40P01: deadlock detected/.test(msg), 'psql-Meldung enthält SQLSTATE 40P01');
  ok(/DETAIL:\s+Process \d+ waits for \w+ on transaction \d+; blocked by process \d+\.\s*\n\s*Process \d+ waits for \w+ on transaction \d+; blocked by process \d+\./.test(msg), 'DETAIL nennt beide beteiligten Prozesse und ihre Sperren');
  ok(/HINT:\s+See server log for query details\./.test(msg), 'HINT vorhanden');
  ok(/CONTEXT:[\s\S]*PL\/pgSQL function kreuz\(integer,integer,text,text\) line \d+/.test(msg), 'CONTEXT nennt Funktion und Zeile der wartenden Anweisung');
  ok(/LOCATION:/.test(msg), 'LOCATION (Quellort in PostgreSQL) vorhanden');
  ok(/----- PostgreSQL-Fehler: Sitzung 2 \(psql-Exit [1-9]\d*\) -----/.test(msg) && /----- Ende Fehler -----/.test(msg), 'Fehlerblock klar abgegrenzt und beschriftet');
  const log = serverLogReport(cl.tmp);
  ok(/ERROR:\s+40P01: deadlock detected/.test(log), 'Serverlog enthält den Deadlock mit SQLSTATE');
  ok(/Process \d+: select kreuz\(1, 2, 'A', '[^']+'\);/.test(log) && /Process \d+: select kreuz\(2, 1, 'B', '[^']+'\);/.test(log), 'Serverlog nennt die Anweisungen der beteiligten Prozesse (fehlt in der psql-Meldung)');
  ok(/process \d+ still waiting for \w+Lock on transaction \d+ after/.test(log), 'Serverlog enthält Sperrwartezeiten (log_lock_waits)');
  ok(/----- PostgreSQL-Serverlog der Testinstanz \(\d+ Zeilen\) -----/.test(log) && /----- Ende Serverlog -----/.test(log), 'Serverlog klar abgegrenzt');
} finally { cl.stop(); }

// 2) Kürzen langer Logs: Deadlock-Abschnitt und Logende bleiben erhalten (ohne Datenbank)
const d = mkdtempSync(join(tmpdir(), 'rwi-diag-'));
try {
  const L = Array.from({ length: 10000 }, (_, i) => `zeile ${i + 1}`); L[4999] = 'ERROR:  40P01: deadlock detected';
  writeFileSync(join(d, 'log'), L.join('\n'));
  const rep = serverLogReport(d, 400, 5);
  ok(rep.includes('ERROR:  40P01: deadlock detected') && rep.includes('zeile 4995') && rep.includes('zeile 5005') && !rep.includes('zeile 4994\n'), 'langes Log: Deadlock-Abschnitt (±5 Zeilen) vollständig');
  ok(rep.includes('zeile 10000') && rep.includes('zeile 9901') && !rep.includes('zeile 9900\n'), 'langes Log: Ende (100 Zeilen) vollständig');
  ok(/\[… Zeilen 1–4994 ausgelassen …\]/.test(rep) && /\[… Zeilen 5006–9900 ausgelassen …\]/.test(rep), 'ausgelassene Bereiche mit richtigen Zeilennummern markiert');
  writeFileSync(join(d, 'log'), Array.from({ length: 3000 }, (_, i) => `mittel ${i + 1}`).join('\n'));
  const mittel = serverLogReport(d);
  ok(mittel.includes('mittel 1\nmittel 2\n') && mittel.includes('mittel 3000') && !mittel.includes('ausgelassen'), 'Log unter der Grenze (3000 von 4000 Zeilen): vollständig, nichts ausgelassen');
  writeFileSync(join(d, 'log'), 'kurz 1\nkurz 2\n');
  const kurz = serverLogReport(d);
  ok(kurz.includes('kurz 1\nkurz 2') && !kurz.includes('ausgelassen'), 'kurzes Log: vollständig, nichts ausgelassen');
  rmSync(join(d, 'log'));
  ok(/Serverlog: nicht gefunden/.test(serverLogReport(d)), 'fehlendes Log: klare Meldung statt Absturz');
  ok(/keine Fehlermeldung auf stderr/.test(formatPgError('leer', { code: 3, err: '' })), 'leere Fehlermeldung: klarer Hinweis');
} finally { rmSync(d, { recursive: true, force: true }); }

console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);

// Ausführbarer Dungeon-Kampf über die echte Auftragskette (temporäres Postgres, Schema rwi, keine Spielerdaten):
//   Bots -> submit_action -> Fälligkeit (simulierte Uhr) -> watchdog_tick -> Worker: claim_resolution -> Engine -> commit_round
// Aufruf: node server/instance/sim/run-dungeon.mjs [--seed N] [--team 4|3|noheal|notank] [--weltboss-ende] [--ruhig]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from '../tests/pg.mjs';
import { newFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
import { decide } from './bots.mjs';
import { describe, TEAM4 } from './fight.mjs';
import { CLASSES, BOSS } from '../engine/content.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SEEDN = +arg('seed', 1), TEAM = arg('team', '4'), WB = !!arg('weltboss-ende', false), QUIET = !!arg('ruhig', false);
const here = dirname(fileURLToPath(import.meta.url)), sqlDir = join(here, '../sql');
const players = TEAM === 'noheal' ? TEAM4.slice(0, 3) : TEAM === 'notank' ? TEAM4.slice(1) : TEAM === '3' ? [TEAM4[0], TEAM4[1], TEAM4[3]] : TEAM4;
const seedHex = ((SEEDN * 2654435761 >>> 0).toString(16).padStart(8, '0')).repeat(8);
const out = (s = '') => { if (!QUIET) console.log(s); };
const cl = await startCluster(54360 + (SEEDN % 20));
const q = async (sql) => { const r = await cl.psql(sql); if (r.code) throw new Error(r.err + '\n' + sql.slice(0, 200)); return r.out; };
const J = (s) => JSON.parse(s);
let problems = 0; const fail = (m) => { problems++; console.log('PROBLEM: ' + m); };
try {
  await q(readFileSync(join(sqlDir, '01_proto.sql'), 'utf8')); await q(readFileSync(join(sqlDir, '02_actions.sql'), 'utf8'));
  await q(`update rwi.cfg set v = 1 where k = 'lease_seconds'; update rwi.cfg set v = 30 where k = 'round_seconds'`);
  const S0 = newFight(players);
  const ev = WB ? `, 5000, clock_timestamp() + interval '2600 milliseconds'` : `, null, null`;
  const ids = (await q(`with i as (insert into rwi.instances(id, event_id, ends_at, seed) overriding system value select 1 ${ev}, decode('${seedHex}', 'hex') returning id),
      m as (insert into rwi.members(instance_id, key, last_seen_at) select i.id, k, clock_timestamp() from i, unnest(array[${players.map((p) => `'${p.id}'`).join(',')}]) k),
      f as (insert into rwi.fights(instance_id, due_at, state) select id, clock_timestamp() + interval '30 seconds', $j$${JSON.stringify(S0)}$j$::jsonb from i returning id) select (select id from f)`));
  const FID = +ids;
  const memberDb = Object.fromEntries((await q(`select key || ':' || id from rwi.members order by id`)).split('\n').map((x) => x.split(':')));
  // simulierte Uhr: V in Millisekunden ab einem Startzeitpunkt in der Nähe der echten Zeit
  const V0 = +(await q(`select (extract(epoch from clock_timestamp()) * 1000)::bigint`)); let V = V0;
  const vts = (ms) => `to_timestamp(${ms} / 1000.0)`; const mmss = (ms) => { const s = Math.floor((ms - V0) / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  await q(`update rwi.members set last_seen_at = ${vts(V)}; select rwi.advance_clock(1, ${vts(V)})`);
  const heal = players.find((p) => p.cls === 'quell'), offline = heal ? { [heal.id]: [4, 5, 6] } : {};                                   // Spieler 4 ist in den Runden 4–6 nicht erreichbar
  out(`══ DUNGEON „${BOSS.name}“ · ${players.length} Testspieler · Seed ${SEEDN} · Engine ${ENGINE_VERSION} ══`);
  out('Gruppe: ' + players.map((p) => `${p.name || p.id} (${CLASSES[p.cls].name})`).join(', ') + '\n');
  const worker = async (fid) => {                                      // Stellvertreter der Edge Function: claim -> Engine -> commit
    const c = J(await q(`select rwi.claim_resolution(${fid}, (select round_no from rwi.fights where id=${fid}))`)); if (c.status !== 'ok') return { claim: c };
    const res = resolveClaim(c.input);
    const k = J(await q(`select rwi.commit_round(${fid}, ${c.input.round_no}, '${c.token}', ${c.round_version}, '${c.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`));
    return { claim: c, res, commit: k };
  };
  let final = null, lastLogRound = 0, replayIn = [];
  for (let guard = 0; guard < 80; guard++) {
    const f = J(await q(`select row_to_json(f) from (select id, round_no, phase, status, state, actions from rwi.fights where id=${FID}) f`));
    if (f.status !== 'active') { final = f; break; }
    const r = f.round_no, S = f.state, wd0 = J(await q(`select rwi.watchdog_tick()`));
    // Planungsphase: Bots geben ihre Aktionen ab (ausgefallene Spieler nicht); Zeitpunkte nur zur Anzeige
    if (r === 8) { V += 300000; out(`  ⚠ Plattform-Ausfall: ${mmss(V - 300000)} → ${mmss(V)} (5 Minuten ohne Lebenszeichen)`); }
    await q(`select rwi.advance_clock(1, ${vts(V)})`);
    if (r === 8) {
      const gaps = await q(`select count(*) from rwi.system_gaps`);
      const dc = await q(`select rwi.permanently_disconnected(${memberDb[players[0].id]}, ${vts(V + 10000)})`);
      out(`    Störungsfenster erkannt (${gaps}), niemand gilt als getrennt: ${dc === 'f' ? 'ja' : 'NEIN'}; nach Ablauf der 20 s: ${await q(`select rwi.permanently_disconnected(${memberDb[players[0].id]}, ${vts(V + 25000)})`) === 't' ? 'getrennt' : 'verbunden'}`);
      if (dc !== 'f') fail('Störungsfenster wirkt nicht');
    }
    const submitted = [];
    for (const m of S.members) { if (!m.alive) continue; if ((offline[m.id] || []).includes(r)) continue;
      const a = decide(S, m); const res = J(await q(`select rwi.submit_action(${FID}, '${m.id}', ${r}, $j$${JSON.stringify(a)}$j$::jsonb)`));
      if (res.status !== 'ok') fail(`Aktion von ${m.id} abgelehnt: ${res.status}`); else { submitted.push(m.id); await q(`update rwi.members set last_seen_at = ${vts(V + 5000)} where key='${m.id}'`); } }
    V += 30000; await q(`select rwi.advance_clock(1, ${vts(V)})`);
    const off = heal && (offline[heal.id] || []).includes(r) ? J(await q(`select to_json(rwi.permanently_disconnected(${memberDb[heal.id]}, ${vts(V)}))`)) : false;
    // Runde fällig machen (simulierte Uhr: wir springen zum Rundenende), danach Watchdog + Worker
    await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${FID}`);
    const wd = J(await q(`select rwi.watchdog_tick()`)); if (!wd.due.includes(FID)) fail(`Runde ${r} nicht als fällig gemeldet`);
    if (r === 10) {                                                    // Worker-Absturz: claimt, stirbt vor dem Commit
      const c = J(await q(`select rwi.claim_resolution(${FID}, ${r})`)); out(`  ⚠ Worker-Absturz nach Claim (Token ${c.token.slice(0, 8)}…); Lease läuft ab`);
      const busy = J(await q(`select rwi.claim_resolution(${FID}, ${r})`)); if (busy.status !== 'busy') fail('zweiter Claim während Lease nicht „busy“');
      await new Promise((s) => setTimeout(s, 1250)); const wd2 = J(await q(`select rwi.watchdog_tick()`)); out(`    Watchdog meldet Auftrag zur Wiederaufnahme: ${wd2.redispatch.includes(FID) ? 'ja' : 'NEIN'}`); if (!wd2.redispatch.includes(FID)) fail('Watchdog meldet abgelaufene Lease nicht');
      const w = await worker(FID); const late = J(await q(`select rwi.commit_round(${FID}, ${r}, '${c.token}', ${c.round_version}, '${c.input_hash}', 'x', $j$${JSON.stringify(w.res)}$j$::jsonb)`));
      out(`    neuer Worker löst die Runde auf (${w.commit.status}); verspäteter Commit des abgestürzten Workers: ${late.status}`); if (w.commit.status !== 'committed' || late.status !== 'already_resolved') fail('Wiederaufnahme nach Absturz fehlerhaft');
    } else {
      if (WB) await new Promise((s) => setTimeout(s, 330));            // Weltboss-Demo: Runden brauchen „echte“ Zeit, bis das Event endet
      const w = await worker(FID);
      if (!w.commit) { out(`  Runde ${r}: ${w.claim.status}`); if (w.claim.status === 'event_ended') { final = J(await q(`select row_to_json(f) from (select id, round_no, phase, status, state from rwi.fights where id=${FID}) f`)); break; } fail('Claim: ' + w.claim.status); break; }
      if (w.commit.status === 'event_ended') { out(`  Runde ${r}: Event ist abgelaufen – kein Ergebnis gespeichert`); final = J(await q(`select row_to_json(f) from (select id, round_no, phase, status, state from rwi.fights where id=${FID}) f`)); break; }
      if (w.commit.status !== 'committed') { fail(`Commit Runde ${r}: ${w.commit.status}`); break; }
    }
    // Ausgabe der Runde aus der Datenbank
    const row = J(await q(`select row_to_json(x) from (select result, input from rwi.round_results where fight_id=${FID} and round_no=${r}) x`)); replayIn.push(r);
    const rs = row.result, pre = row.input.snapshot.state;
    out(`── Runde ${r} · ${mmss(V)} ──` + (off ? '   (' + heal.name + ' ist offline → automatisch)' : '')); if (pre.telegraph) out(`  Ankündigung: ${pre.telegraph === 'schwerer_schlag' ? 'SCHWERER SCHLAG' : 'FLAMMENWELLE'} steht bevor`);
    for (const e of rs.log) out(describe(pre, e));
    const bs = rs.state.monster; out(`  [Boss ${Math.max(0, bs.hp)}/${bs.maxhp}${rs.state.adds.length ? ' + ' + rs.state.adds.length + ' Brut' : ''} · ` + rs.state.members.map((m) => `${m.name} ${m.alive ? m.hp + '/' + m.maxhp : '✝'}`).join(', ') + ']');
    if (rs.outcome !== 'continue') { final = J(await q(`select row_to_json(f) from (select id, round_no, phase, status, state from rwi.fights where id=${FID}) f`)); break; }
  }
  // Abschluss: Ergebnis, Belohnungen, Replay aller Runden aus den gespeicherten Eingaben
  const rows = J(await q(`select coalesce(json_agg(json_build_object('n', round_no, 'in', input, 'res', result, 'ev', engine_version) order by round_no), '[]') from rwi.round_results where fight_id=${FID}`));
  let same = 0; for (const x of rows) { const re = resolveClaim(x.in); if (re.result_hash === x.res.result_hash) same++; }
  const rew = +(await q(`select count(*) from rwi.rewards`)), istat = await q(`select status from rwi.instances where id=1`), cnt = await q(`select count(*) from rwi.round_results where fight_id=${FID} and completed_at >= (select ends_at from rwi.instances where id=1)`);
  const last = rows[rows.length - 1];
  console.log(`\n══ ERGEBNIS: ${final.status.toUpperCase()}${last && last.res.reason && final.status !== 'event_ended' ? ' (' + last.res.reason + ')' : ''} nach ${rows.length} gespeicherten Runden ${istat === 'event_ended' ? ' · Instanz event_ended' : ''} ══`);
  console.log(`Belohnungen (nur Testeinträge, einmalig je Spieler): ${rew}`);
  console.log(`Replay aus der Datenbank: ${same}/${rows.length} Runden bitgleich nachgerechnet`);
  if (same !== rows.length) fail('Replay stimmt nicht');
  if (WB && +cnt !== 0) fail('Ergebnis nach Eventende gespeichert');
  if (!WB && final.status === 'won' && rew !== players.length) fail('Belohnungen ≠ Spielerzahl');
  if (final.status !== 'won' && rew !== 0) fail('Belohnung ohne Sieg');
  console.log(problems ? `\n${problems} PROBLEM(E)` : '\nKEINE PROBLEME');
} finally { cl.stop(); }
process.exit(problems ? 1 : 0);

// Audit Eventende-Rennen (kein Test, keine Regeländerung): misst, wie weit „completed_at vor ends_at“ und „Ergebnis sichtbar“ auseinanderliegen können.
// Aufruf: node server/instance/sim/eventende-audit.mjs   (temporäres Postgres mit track_commit_timestamp=on, keine Spielerdaten)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from '../tests/pg.mjs';
import { newFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const cl = await startCluster(54399, '-c track_commit_timestamp=on');
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 300)); return r.out; };
const J = (s) => JSON.parse(s), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CFG = { bossHp: 150, bossAtk: 8 };
try {
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe']) await q(readFileSync(join(here, `../sql/${f}.sql`), 'utf8'));
  // ---------- A. Abstand zwischen clock_timestamp() in der Transaktion und dem tatsächlichen Commit-Zeitpunkt ----------
  await q(`create table audit(id serial primary key, t timestamptz not null, pad text)`);
  const burst = (n) => Array.from({ length: n }, () => `insert into audit(t, pad) values (clock_timestamp(), repeat('x', 200));`).join('\n');
  const stats = async (label) => {
    const r = J(await q(`select json_build_object('n', count(*), 'p50', round((percentile_cont(0.5) within group (order by d))::numeric, 3), 'p99', round((percentile_cont(0.99) within group (order by d))::numeric, 3), 'max', round(max(d)::numeric, 3))
      from (select extract(epoch from (pg_xact_commit_timestamp(xmin) - t)) * 1000 as d from audit) x`));
    console.log(`${label}: n=${r.n}, Abstand clock_timestamp() -> Commit: p50=${r.p50} ms, p99=${r.p99} ms, max=${r.max} ms`);
  };
  await q(burst(1500)); await stats('A1 ruhig (Einzelverbindung)');
  await q('truncate audit');
  const load = Array.from({ length: 6 }, () => cl.psql(`create temp table l(x text); insert into l select repeat('y', 500) from generate_series(1, 200000); select pg_sleep(0.1);`));
  await sleep(300);
  const loaded = await Promise.all([cl.psql(burst(1500)), cl.psql(burst(1500))]); await Promise.all(load);
  await stats('A2 unter Schreiblast (6 Lastverbindungen, 2 messende)');

  // ---------- B. Die Tatsache: commit_round prüft das Ende unter der Sperre, wird aber erst beim COMMIT sichtbar ----------
  const KL = [['krieger', 'ritter'], ['bogenschuetze', 'jaeger'], ['magier', 'feuer'], ['heiler', 'priester'], ['heiler', 'natur'], ['krieger', 'berserker']];
  for (let n = 1; n <= 6; n++) await q(`insert into rwi.players values ('u${n}', 10, '${KL[n - 1][0]}', '${KL[n - 1][1]}', 3)`);
  const SEC = 14;
  const g = J(await q(`select rwi.create_group('weltboss', array['u1','u2','u3','u4','u5','u6']::text[], 1, 1, clock_timestamp() + interval '${SEC} seconds')`)); const I = g.instance;
  for (let n = 1; n <= 6; n++) await q(`select rwi.set_ready(${I}, 'u${n}')`);
  const roster = J(await q(`select rwi.roster(${I})`));
  await q(`select rwi.start_fight(${I}, $j$${JSON.stringify(newFight(roster, CFG))}$j$::jsonb)`);
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${I}`));
  await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid}`);
  const c = J(await q(`select rwi.claim_resolution(${fid}, 1)`));
  const res = resolveClaim(c.input); res.outcome = 'won'; res.reason = 'boss_dead';                      // synthetischer Sieg: es geht nur um Zeitpunkte, nicht um Kampfmechanik
  res.state.monster.hp = 0;
  const left = +(await q(`select extract(epoch from (ends_at - clock_timestamp())) from rwi.instances where id=${I}`));
  if (left < 5) throw new Error('Aufbau zu langsam, ends_at zu nah: ' + left);
  const sleepFor = left + 3;                                                                            // Commit bewusst 3 s nach dem Eventende
  const tStart = Date.now();
  const X = cl.psql(`begin; select rwi.commit_round(${fid}, 1, '${c.token}', ${c.round_version}, '${c.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb); select pg_sleep(${sleepFor}); commit;`);
  await sleep(1000);
  const endsAtMs = (left * 1000) + tStart;
  await sleep(Math.max(0, endsAtMs - Date.now()) + 800);                                                 // 0,8 s nach dem Eventende, Transaktion X noch offen
  const view = J(await q(`select rwi.instance_view(${I}, 'u1')`));
  const during = J(await q(`select json_build_object('status', status, 'stage', stage, 'outcome', outcome) from rwi.instances where id=${I}`));
  const swStart = Date.now();
  const SW = cl.psql(`select rwi.sweep_events()`).then((r) => ({ ms: Date.now() - swStart, r }));      // Sweep wartet auf die Instanzsperre von X
  const xr = await X; const sw = await SW;
  const fin = J(await q(`select json_build_object('status', i.status, 'stage', i.stage, 'outcome', i.outcome, 'ends_at', i.ends_at, 'completed_at', rr.completed_at,
      'commit_ts', pg_xact_commit_timestamp(rr.xmin), 'rewards', (select count(*) from rwi.rewards where instance_id = i.id))
    from rwi.instances i join rwi.fights f on f.instance_id = i.id join rwi.round_results rr on rr.fight_id = f.id where i.id = ${I}`));
  const ms = (a, b) => Math.round(new Date(a) - new Date(b));
  console.log('\nB. Interaktive Transaktion über das Eventende hinaus (commit_round, dann 3 s offen, dann COMMIT)');
  console.log('   commit_round-Antwort in der Transaktion:', xr.out.split('\n')[0].slice(0, 90));
  console.log('   Sicht anderer Sitzungen 0,8 s nach ends_at, Transaktion noch offen: Tabelle status=%s outcome=%s; instance_view meldet status=%s outcome=%s', during.status, during.outcome, view.instance.status, view.instance.outcome);
  console.log(`   sweep_events wartete ${sw.ms} ms auf die Sperre und fand danach nichts mehr zu beenden`);
  console.log(`   Endergebnis: status=${fin.status}, completed_at=${fin.completed_at}`);
  console.log(`   ends_at          = ${fin.ends_at}`);
  console.log(`   Commit-Zeitpunkt = ${fin.commit_ts}`);
  console.log(`   completed_at liegt ${ms(fin.ends_at, fin.completed_at)} ms VOR ends_at, der Commit ${ms(fin.commit_ts, fin.ends_at)} ms NACH ends_at; Belohnungen angelegt: ${fin.rewards}`);
} finally { cl.stop(); }

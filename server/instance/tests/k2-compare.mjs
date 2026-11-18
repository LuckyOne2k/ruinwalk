// K.2-Nachweis: alte Variante (Claim/Commit rufen den Massen-Sweep des ganzen Events auf, während sie die eigene Instanzsperre halten)
// gegen neue Variante (Claim/Commit beenden nur die eigene Instanz).  Aufruf: node k2-compare.mjs old|eigene|skip [Durchläufe] [nosweep]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { resolveRound, ENGINE_VERSION } from '../engine/engine.mjs';
import { makeFight } from './scenarios.mjs';
const variant = process.argv[2] || 'skip', N = +(process.argv[3] || 20), here = dirname(fileURLToPath(import.meta.url));
let sql = readFileSync(join(here, '../sql/01_proto.sql'), 'utf8');
// Varianten: skip = Stand der Datei (eigene Instanz + SKIP-LOCKED-Sweep); eigene = nur die eigene Instanz; old = Phase-0-Stand (blockierender Sweep unter eigener Sperre)
if (variant === 'old') sql = sql.replaceAll('perform rwi.end_instance(i.id); perform rwi.sweep_event(i.event_id, true);', 'perform rwi.sweep_event(i.event_id);');
if (variant === 'eigene') sql = sql.replaceAll(' perform rwi.sweep_event(i.event_id, true);', '');
const NOSWEEP = process.argv[4] === 'nosweep';   // ohne zusätzliche Sweeps im Lauf: misst, wie viele Instanzen ohne Watchdog noch „aktiv“ bleiben
const cl = await startCluster(54350 + { old: 1, eigene: 2, skip: 3 }[variant]);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err); return r.out; };
let activeBefore = 0, dead = 0, errs = 0, late = 0, winAndEnded = 0, rewardNoWin = 0, notEnded = 0, runs = 0;
try {
  await q(sql);
  for (let it = 0; it < N; it++) {
    const ev = 100 + it, cs = [];
    for (let k = 0; k < 12; k++) {
      const f = makeFight(k + 1);
      const r = await q(`with i as (insert into rwi.instances(event_id, ends_at) values (${ev}, clock_timestamp() + interval '1 hour') returning id),
        m as (insert into rwi.members(instance_id, last_seen_at) select id, clock_timestamp() from i),
        f as (insert into rwi.fights(instance_id, due_at, state) select id, clock_timestamp() - interval '1 s', $j$${JSON.stringify(f.state)}$j$::jsonb from i returning id) select id from f`);
      const fid = +r, c = JSON.parse(await q(`select rwi.claim_resolution(${fid},1)`)), inp = c.input;
      const res = resolveRound({ fight_id: inp.fight_id, round_no: 1, seed: inp.seed, state: inp.snapshot.state, actions: inp.snapshot.actions, conn: {}, cfg: { crit_pct: 15, burn_turns: 3, burn_dmg: 6 } });
      res.outcome = 'won'; res.state.monster.hp = 0; cs.push({ fid, c, res });
    }
    // gemeinsames Eventende X; Commits starten gestreut um X (vor und nach dem Ende), damit mehrere gleichzeitig das Ende sehen
    const X = await q(`update rwi.instances set ends_at = date_trunc('milliseconds', clock_timestamp()) + interval '1500 milliseconds' where event_id=${ev} returning to_char(ends_at, 'YYYY-MM-DD HH24:MI:SS.US')`).then((o) => o.split('\n')[0]);
    const at = await q(`select to_char('${X}'::timestamp ${NOSWEEP ? '+ interval \'5 milliseconds\'' : `- interval '${(it % 9) * 2} milliseconds'`}, 'YYYY-MM-DD HH24:MI:SS.US')`);
    const w = (NOSWEEP ? cs.slice(0, 3) : cs).map((x) => `select pg_sleep_until('${at}'::timestamp::timestamptz); select rwi.commit_round(${x.fid},1,'${x.c.token}',${x.c.round_version},'${x.c.input_hash}','p',$j$${JSON.stringify(x.res)}$j$::jsonb);`);
    if (!NOSWEEP) for (let k = 0; k < 4; k++) w.push(`select pg_sleep_until('${at}'::timestamp::timestamptz + interval '${k * 8} milliseconds'); select rwi.sweep_event(${ev});`);
    const r = await Promise.all(w.map((s) => cl.psql(s))); runs++;
    for (const x of r) if (/deadlock/i.test(x.err)) console.error('DEADLOCK Durchlauf', it, '\n' + x.err);   // nur Diagnose-Ausgabe, Zählung unverändert
    dead += r.filter((x) => /deadlock/i.test(x.err)).length; errs += r.filter((x) => x.code).length;
    await new Promise((s) => setTimeout(s, 1700));
    activeBefore += +(await q(`select count(*) from rwi.instances where event_id=${ev} and status='active' and ends_at <= clock_timestamp()`));   // Zustand vor dem Watchdog
    await q(`select rwi.sweep_event(${ev})`);   // Watchdog nach dem Ende
    late += +(await q(`select count(*) from rwi.round_results rr join rwi.fights f on f.id=rr.fight_id join rwi.instances i on i.id=f.instance_id where i.event_id=${ev} and rr.completed_at >= i.ends_at`));
    winAndEnded += +(await q(`select count(*) from rwi.instances i join rwi.fights f on f.instance_id=i.id where i.event_id=${ev} and exists (select 1 from rwi.round_results rr where rr.fight_id=f.id) and i.status='event_ended'`));
    rewardNoWin += +(await q(`select count(*) from rwi.rewards r join rwi.instances i on i.id=r.instance_id where i.event_id=${ev} and not exists (select 1 from rwi.round_results rr join rwi.fights f on f.id=rr.fight_id where f.instance_id=i.id)`));
    notEnded += +(await q(`select count(*) from rwi.instances where event_id=${ev} and status='active'`));
  }
} finally { cl.stop(); }
console.log(JSON.stringify({ variante: variant, durchlaeufe: runs, deadlocks: dead, fehler_gesamt: errs, ergebnis_nach_eventende: late, sieg_und_event_ended: winAndEnded, belohnung_ohne_sieg: rewardNoWin, nach_watchdog_noch_aktiv: notEnded, aktiv_nach_ende_vor_watchdog: activeBefore }));
process.exit(dead || errs || late || winAndEnded || rewardNoWin || notEnded ? 1 : 0);

// Worker-Kern für die Rundenauflösung (Architekturentscheidung: docs/INSTANZKAMPF_WORKER_ARCHITEKTUR.md).
// Transport-unabhängig: der Kern kennt weder HTTP noch Secrets noch eine Datenbankverbindung. Er arbeitet gegen eine kleine Schnittstelle `db`:
//   db.watchdog()                      -> rwi.watchdog_tick()  { due: [fight_id], redispatch: [fight_id], ... }
//   db.rounds(ids)                     -> [{ id, round_no }]   (aktuelle Runde der Kämpfe; Zustand liegt in der Datenbank)
//   db.claim(fight, round)             -> rwi.claim_resolution(...)
//   db.commit(fight, round, token, roundVersion, inputHash, engineVersion, result) -> rwi.commit_round(...)
//   db.reportFailure(fight, round, token, message) -> rwi.report_failure(...)   (optional; ohne sie läuft die Lease nur ab)
// Die Datenbank ist die einzige Wahrheit: jede Antwort, jeder Absturz, jeder doppelte Aufruf wird über Lease, Token und round_version in der Datenbank
// entschieden. Der Kern wiederholt NICHTS selbst; Wiederholung heißt: der nächste Tick findet den Kampf wieder in due/redispatch.
// Der Kern wirft nie nach außen: Fehler werden je Kampf gesammelt, damit ein Fehler die übrigen Kämpfe nicht blockiert.

export async function processFight(db, engine, fight, round) {
  const base = { fight, round };
  let c;
  try { c = await db.claim(fight, round); } catch (e) { return { ...base, step: 'claim', status: 'db_error', error: String(e.message || e).split('\n')[0] }; }
  if (c.status !== 'ok') return { ...base, step: 'claim', status: c.status };            // busy | not_due | already_resolved | event_ended | unknown_fight: nichts zu tun
  let res;
  try { res = engine.resolveClaim(c.input); }
  catch (e) {                                                                              // kein Commit; Fehler in die Datenbank melden (Zähler, Wartezeit, stuck)
    const msg = String(e.message || e).split('\n')[0]; let rep = null;
    try { if (db.reportFailure) rep = await db.reportFailure(fight, c.input.round_no, c.token, msg); } catch (e2) { rep = { status: 'report_failed' }; }   // geht die Meldung verloren, endet die Lease von selbst
    return { ...base, step: 'engine', status: 'engine_error', error: msg, report: rep };
  }
  try {
    const k = await db.commit(fight, c.input.round_no, c.token, c.round_version, c.input_hash, engine.ENGINE_VERSION, res);
    return { ...base, step: 'commit', status: k.status };                                 // committed | event_ended | already_resolved | superseded | input_mismatch | invalid
  } catch (e) { return { ...base, step: 'commit', status: 'db_error', error: String(e.message || e).split('\n')[0] }; }
}

export async function runTick(db, engine, { maxJobs = 20, concurrency = 4 } = {}) {
  const out = { due: [], redispatch: [], results: [], error: null };
  let w;
  try { w = await db.watchdog(); } catch (e) { out.error = 'watchdog: ' + String(e.message || e).split('\n')[0]; return out; }
  out.due = w.due || []; out.redispatch = w.redispatch || [];
  const ids = [...new Set([...out.due, ...out.redispatch])].slice(0, maxJobs);
  if (!ids.length) return out;
  let rows;
  try { rows = await db.rounds(ids); } catch (e) { out.error = 'rounds: ' + String(e.message || e).split('\n')[0]; return out; }
  const queue = [...rows];
  const lane = async () => { for (let r = queue.shift(); r; r = queue.shift()) out.results.push(await processFight(db, engine, r.id, r.round_no)); };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, lane));
  out.results.sort((a, b) => a.fight - b.fight);
  return out;
}

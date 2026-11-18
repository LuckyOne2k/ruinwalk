// Adapter: bildet die Datenbank-Schnittstelle des Worker-Kerns (core.mjs) auf die A1-Wrapper in Schema public ab.
// Transportunabhängig: rpc(name, namedArgs) -> Promise<Ergebnis (geparstes JSON)>. Kein Netzwerk, keine Zugangsdaten in dieser Datei;
// der Transport (PostgREST-RPC mit service_role-Schlüssel aus den Secrets der Laufzeit, oder direkte DB-Verbindung) wird außerhalb eingesetzt.
export function a1Db(rpc) {
  return {
    watchdog: () => rpc('rw_worker_tick', {}),
    rounds: (ids) => rpc('rw_worker_rounds', { p_fights: ids }),
    claim: (fight, round) => rpc('rw_worker_claim', { p_fight: fight, p_round: round }),
    commit: (fight, round, token, version, inputHash, engineVersion, result) => rpc('rw_worker_commit', { p_fight: fight, p_round: round, p_token: token, p_version: version, p_input_hash: inputHash, p_engine: engineVersion, p_result: result }),
    reportFailure: (fight, round, token, message) => rpc('rw_worker_report_failure', { p_fight: fight, p_round: round, p_token: token, p_error: message }),
    roster: (instance) => rpc('rw_worker_roster', { p_instance: instance }),
    startFight: (instance, state) => rpc('rw_worker_start_fight', { p_instance: instance, p_state: state }),
  };
}
export const opsA1 = (rpc) => ({
  stuckList: () => rpc('rw_ops_stuck_list', {}),
  resume: (fight, round, operator, note, engine = null) => rpc('rw_ops_resume', { p_fight: fight, p_round: round, p_operator: operator, p_note: note, ...(engine ? { p_engine: engine } : {}) }),
  registerEngine: (version, stateSchema, note = null) => rpc('rw_ops_register_engine', { p_version: version, p_state_schema: stateSchema, ...(note ? { p_note: note } : {}) }),
  terminate: (fight, operator, note) => rpc('rw_ops_terminate', { p_fight: fight, p_operator: operator, p_note: note }),
});

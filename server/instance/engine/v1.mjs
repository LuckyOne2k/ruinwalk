// Instanzkampf-Engine, Phase 1. Reine Funktion: gleiche Eingabe -> gleiche Ausgabe. Nur Ganzzahlen, keine Uhr, kein Math.random.
// Rundenablauf: (1) Phasenprüfung -> (2) Handelnde nach Initiative (absteigend, Gleichstand nach ID) -> (3) Rundenende:
// Statuswirkungen ticken (zuerst Boss/Zusatzgegner, dann Spieler), Abklingzeiten sinken -> (4) Ausgang.
// Ausgang: Boss tot -> won; alle Spieler tot -> lost (reason 'wipe'); Rundenlimit erreicht -> lost (reason 'zeit'); sonst continue.
// Stirbt der Boss durch einen Rundenende-Tick gleichzeitig mit dem letzten Spieler, gewinnt die Gruppe (Boss wird zuerst getickt).
import { drawInt, hashOf, fromHex } from './rng.mjs';
import { ABILITIES, CLASSES, BOSS, CONTENT_VERSION, REVIVE_LIMIT } from './content.mjs';
export const ENGINE_VERSION = 'v1-0.1+' + CONTENT_VERSION;

export function newFight(players, cfg = {}) {                 // Ausgangszustand aus Klassen-Wahl; players: [{id, cls}]
  const members = players.map((p) => { const c = CLASSES[p.cls]; return { id: p.id, name: p.name || p.id, cls: p.cls, hp: c.hp, maxhp: c.hp, atk: c.atk, def: c.def, init: c.init, alive: true, cd: {}, st: [], threat: 0, revives: 0, final: false }; });
  return { members, monster: { id: 'boss', name: BOSS.name, hp: BOSS.hp, maxhp: BOSS.hp, atk: BOSS.atk, def: BOSS.def, init: BOSS.init, alive: true, st: [], phase: 1, cds: { heavy: BOSS.heavy.every, wave: 0 } }, adds: [], telegraph: null };
}
export const DEFAULT_CFG = { crit_pct: 15, crit_mult: 200, spread: 4, round_limit: 30, swipe_pct: 25 };

export function resolveRound(input) {
  const cfg = { ...DEFAULT_CFG, ...(input.cfg || {}) }, seed = fromHex(input.seed), fid = input.fight_id, rn = input.round_no;
  const S = JSON.parse(JSON.stringify(input.state)), A = input.actions || {}, boss = S.monster, log = []; let n = 0;
  const reviveOk = new Set(input.revive_ok || []), revivedNow = new Set();   // reviveOk: Ziele, für die der Server die Wiederbelebung vor Fensterablauf gültig angenommen hat
  const rnd = (stream, max) => drawInt(seed, stream, fid, rn, n++, max);
  const alive = () => S.members.filter((m) => m.alive);
  const foes = () => [boss, ...S.adds.filter((a) => a.alive)];
  const byId = (id) => S.members.find((m) => m.id === id) || S.adds.find((a) => a.id === id) || (id === 'boss' ? boss : null);
  const sv = (u, id) => u.st.find((s) => s.id === id);
  const atkOf = (u) => { let a = u.atk; const w = sv(u, 'weak'); if (w) a = Math.floor(a * (100 - w.power) / 100); if (u.id === 'boss' && boss.phase >= 3) a = Math.floor(a * BOSS.enrage_atk_pct / 100); return a; };
  const defOf = (u) => u.def + (sv(u, 'guard') ? sv(u, 'guard').power : 0);
  const addSt = (u, e) => { const c = sv(u, e.st); if (c) { c.turns = Math.max(c.turns, e.turns); c.power = Math.max(c.power, e.power); } else u.st.push({ id: e.st, turns: e.turns, power: e.power }); };
  const ended = () => !boss.alive || alive().length === 0;
  // Schaden: Schild nimmt zuerst auf, der Rest geht von den Lebenspunkten ab. Ergibt den tatsächlich verlorenen Lebenspunktwert.
  const hurt = (u, v) => { const sh = sv(u, 'shield'); let abs = 0; if (sh && sh.power > 0) { abs = Math.min(sh.power, v); sh.power -= abs; if (sh.power === 0) u.st = u.st.filter((s) => s !== sh); } const real = Math.min(u.hp, v - abs); u.hp -= real; if (u.hp === 0) { u.alive = false; u.st = []; } return { real, abs }; };
  const hit = (att, tgt, power) => { // ein Treffer; zieht immer genau zwei Zufallszahlen (crit, spread)
    const crit = rnd('crit', 100) < cfg.crit_pct, spr = rnd('spread', cfg.spread + 1);
    let v = Math.max(1, Math.floor(atkOf(att) * power / 100) - Math.floor(defOf(tgt) / 2)); if (crit) v = Math.floor(v * cfg.crit_mult / 100); v += spr;
    const r = hurt(tgt, v); return { v, ...r, crit };
  };
  const threatAdd = (u, v) => { if (u.threat !== undefined) u.threat += v; };
  const checkPhase = () => {                                   // Phasenwechsel einmalig und nur aufwärts
    if (!boss.alive) return; const pct = Math.floor(boss.hp * 100 / boss.maxhp);
    const np = BOSS.phases.reduce((p, ph, i) => (pct < ph.from || i === 0 ? i + 1 : p), 1);
    while (boss.phase < np) {
      boss.phase++; log.push({ e: 'phase', p: boss.phase, name: BOSS.phases[boss.phase - 1].name });
      if (boss.phase === 2) { boss.cds.wave = BOSS.wave.every[2]; for (let i = 1; i <= BOSS.adds.count; i++) S.adds.push({ id: 'add' + (S.adds.length + 1), name: 'Funkenbrut', hp: BOSS.adds.hp, maxhp: BOSS.adds.hp, atk: BOSS.adds.atk, def: BOSS.adds.def, init: BOSS.adds.init, alive: true, st: [] }); log.push({ e: 'spawn', n: BOSS.adds.count }); }
      if (boss.phase === 3) boss.cds.wave = Math.min(boss.cds.wave, BOSS.wave.every[3]);
    }
  };
  const pickBossTarget = () => {                               // Spott zwingt; sonst 25 % zufällig, sonst höchste Bedrohung (Gleichstand: ID)
    const al = alive(); const tk = al.find((m) => sv(m, 'taunt')); if (tk) return tk;
    if (rnd('swipe', 100) < cfg.swipe_pct) return al[rnd('swipe_t', al.length)];
    return [...al].sort((a, b) => b.threat - a.threat || (a.id < b.id ? -1 : 1))[0];
  };
  for (const id of input.left || []) { const m = S.members.find((x) => x.id === id); if (m && !m.gone) { m.gone = true; m.alive = false; m.hp = 0; m.st = []; log.push({ e: 'left', u: id }); } }   // ausgetreten/entfernt: zählt als dauerhaft ausgefallen
  checkPhase();
  // --- Aktionsliste dieser Runde
  const actors = [...alive().map((m) => ({ t: 'm', u: m })), { t: 'b', u: boss }, ...S.adds.filter((a) => a.alive).map((a) => ({ t: 'a', u: a }))];
  actors.sort((a, b) => b.u.init - a.u.init || (a.u.id < b.u.id ? -1 : 1));
  for (const ac of actors) {
    if (ended()) break; const u = ac.u; if (!u.alive || revivedNow.has(u.id)) continue;   // Wiederbelebte handeln erst ab der nächsten Runde
    const stun = sv(u, 'stun'); if (stun) { log.push({ e: 'stun', a: u.id }); continue; }
    if (ac.t === 'm') memberAct(u); else if (ac.t === 'b') bossAct(); else addAct(u);
  }
  function memberAct(m) {
    const cls = CLASSES[m.cls], req = A[m.id]; let abId = cls.abilities[0], origin = 'automatisch', tgtId = 'boss', ok = false;
    if (req && cls.abilities.includes(req.ability) && (m.cd[req.ability] || 0) === 0) { abId = req.ability; tgtId = req.target; origin = 'bestätigt'; ok = true; }
    else if (req) origin = 'ungültig→automatisch';
    const ab = ABILITIES[abId];
    if (ab.revive && ok) { const dead = S.members.find((x) => x.id === tgtId && !x.alive);       // Zielwahl entscheidet über den Modus (Plan 1b)
      if (dead) {
        const why = dead.gone ? 'verlassen' : dead.revives >= REVIVE_LIMIT ? 'limit' : !reviveOk.has(dead.id) ? 'fenster' : null;
        if (why) { log.push({ e: 'verfall', a: m.id, ab: abId, t: dead.id, why }); return; }   // Aktion verfällt, Abklingzeit wird nicht gesetzt (Erstattung)
        dead.alive = true; dead.hp = Math.max(1, Math.floor(dead.maxhp * ab.revive.pct / 100)); dead.revives++; dead.st = []; dead.final = false; revivedNow.add(dead.id);
        for (const e of ab.revive.apply) addSt(dead, e);
        log.push({ e: 'revive', a: m.id, ab: abId, t: dead.id, hp: dead.hp, n: dead.revives }); threatAdd(m, Math.floor(dead.hp / 2));
        if (ab.cd > 0) m.cd[abId] = ab.cd; return;
      } }
    let tgt = null;
    if (ab.kind === 'damage') { tgt = byId(tgtId); if (!tgt || !tgt.alive || (tgt.id !== 'boss' && !tgt.id.startsWith('add'))) tgt = boss; }
    else if (ab.kind === 'heal' || ab.kind === 'shield') { tgt = byId(tgtId); if (!tgt || !tgt.alive || !S.members.includes(tgt)) tgt = [...alive()].sort((a, b) => a.hp * b.maxhp - b.hp * a.maxhp || (a.id < b.id ? -1 : 1))[0]; }
    const L = { e: 'act', a: m.id, ab: abId, o: origin }; if (tgt) L.t = tgt.id;
    if (ab.kind === 'damage') {
      const r = hit(m, tgt, ab.power); L.v = r.v; L.c = r.crit; if (r.abs) L.abs = r.abs; threatAdd(m, r.real); log.push(L);
      if (tgt.alive && ab.apply) for (const e of ab.apply) addSt(tgt, e);
      if (!tgt.alive) log.push({ e: 'down', u: tgt.id });
    } else if (ab.kind === 'aoe') {
      const hits = []; for (const f of foes().sort((a, b) => (a.id < b.id ? -1 : 1))) { const r = hit(m, f, ab.power); hits.push({ t: f.id, v: r.v, c: r.crit }); threatAdd(m, r.real); if (!f.alive) hits.push({ down: f.id }); }
      L.hits = hits; log.push(L);
    } else if (ab.kind === 'heal') {
      const amt = Math.floor(atkOf(m) * ab.power / 100), real = Math.min(amt, tgt.maxhp - tgt.hp); tgt.hp += real; L.v = real; threatAdd(m, Math.floor(real / 2)); log.push(L);
    } else if (ab.kind === 'shield') { for (const e of ab.apply) addSt(tgt, e); log.push(L);
    } else if (ab.kind === 'self' || ab.kind === 'taunt') { for (const e of ab.apply) addSt(m, e); log.push(L);
    } else if (ab.kind === 'allies') { for (const x of alive()) for (const e of ab.apply) addSt(x, e); log.push(L); }
    if (ab.cd > 0) m.cd[abId] = ab.cd;
    checkPhase();
  }
  function bossAct() {
    const al = alive(); if (!al.length) return;
    if (boss.cds.wave === 0 && boss.phase >= 2) {              // Flammenwelle: alle lebenden Spieler, feste Reihenfolge nach ID
      const hits = []; for (const t of [...al].sort((a, b) => (a.id < b.id ? -1 : 1))) { const r = hit(boss, t, BOSS.wave.power); hits.push({ t: t.id, v: r.v, c: r.crit }); if (!t.alive) hits.push({ down: t.id }); if (ended()) break; }
      log.push({ e: 'boss', k: 'flammenwelle', hits }); boss.cds.wave = BOSS.wave.every[Math.min(boss.phase, 3)]; return;
    }
    const t = pickBossTarget(); const heavy = boss.cds.heavy === 0;
    const r = hit(boss, t, heavy ? BOSS.heavy.power : 100);
    log.push({ e: 'boss', k: heavy ? 'schwerer_schlag' : 'angriff', t: t.id, v: r.v, c: r.crit, ...(r.abs ? { abs: r.abs } : {}) }); if (!t.alive) log.push({ e: 'down', u: t.id });
    if (heavy) boss.cds.heavy = BOSS.heavy.every;
  }
  function addAct(a) {
    const al = alive(); if (!al.length) return; const t = al[rnd('add_t', al.length)]; const r = hit(a, t, 100);
    log.push({ e: 'add', a: a.id, t: t.id, v: r.v, c: r.crit }); if (!t.alive) log.push({ e: 'down', u: t.id });
  }
  // --- Rundenende (nur wenn der Kampf nicht schon entschieden ist)
  if (!ended()) {
    const tick = (u) => { for (const s of [...u.st]) { if (!u.alive) break;
        if (s.id === 'burn' || s.id === 'bleed') { const r = hurt(u, s.power); log.push({ e: 'dot', u: u.id, st: s.id, v: r.real }); if (!u.alive) { log.push({ e: 'down', u: u.id }); if (u.id === 'boss') break; } }
        if (s.id === 'regen') { const real = Math.min(s.power, u.maxhp - u.hp); u.hp += real; if (real > 0) log.push({ e: 'hot', u: u.id, v: real }); }
        s.turns--; } u.st = u.st.filter((s) => s.turns > 0); };
    tick(boss); checkPhase();
    for (const a of S.adds) if (a.alive) tick(a);
    if (boss.alive) for (const m of alive()) tick(m);
  }
  for (const m of S.members) for (const k of Object.keys(m.cd)) { if (m.cd[k] > 0) m.cd[k]--; if (m.cd[k] === 0) delete m.cd[k]; }
  if (boss.cds.heavy > 0) boss.cds.heavy--; if (boss.cds.wave > 0) boss.cds.wave--;
  S.adds = S.adds.filter((a) => a.alive);
  for (const m of S.members) m.final = !m.alive && (m.gone === true || m.revives >= REVIVE_LIMIT);
  S.telegraph = boss.alive ? (boss.phase >= 2 && boss.cds.wave === 0 ? 'flammenwelle' : (boss.cds.heavy === 0 ? 'schwerer_schlag' : null)) : null;   // gleiche Rangfolge wie bossAct
  const won = !boss.alive, wipe = alive().length === 0;
  const outcome = won ? 'won' : wipe ? 'lost' : rn >= cfg.round_limit ? 'lost' : 'continue';
  const reason = won ? 'sieg' : wipe ? 'wipe' : outcome === 'lost' ? 'zeit' : null;
  const result = { state: S, log, outcome, reason, draws: n };
  return { ...result, result_hash: hashOf(result) };
}
export const inputHash = (input) => hashOf(input);

// Brücke zwischen Datenbank und Engine: wandelt die Eingabe von claim_resolution in einen Engine-Aufruf um.
// cfg_version verweist auf eine feste Konfiguration; ältere Versionen bleiben für Replay erhalten.
export const CFG_VERSIONS = { 1: DEFAULT_CFG };
export function resolveClaim(claimInput) {
  const cfg = CFG_VERSIONS[claimInput.cfg_version]; if (!cfg) throw new Error('unbekannte cfg_version ' + claimInput.cfg_version);
  return resolveRound({ fight_id: claimInput.fight_id, round_no: claimInput.round_no, seed: claimInput.seed, cfg, state: claimInput.snapshot.state, actions: claimInput.snapshot.actions || {}, conn: claimInput.snapshot.conn || {}, revive_ok: claimInput.snapshot.revive_ok || [], left: claimInput.snapshot.left || [] });
}

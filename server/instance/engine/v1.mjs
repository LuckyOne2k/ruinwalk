// Instanzkampf-Engine, Phase 1. Reine Funktion: gleiche Eingabe -> gleiche Ausgabe. Nur Ganzzahlen, keine Uhr, kein Math.random.
// Rundenablauf: (1) Phasenprüfung -> (2) Handelnde nach Initiative (absteigend, Gleichstand nach ID) -> (3) Rundenende:
// Statuswirkungen ticken (zuerst Boss/Zusatzgegner, dann Spieler), Abklingzeiten sinken -> (4) Ausgang.
// Ausgang: Boss tot -> won; alle Spieler tot -> lost (reason 'wipe'); Rundenlimit erreicht -> lost (reason 'zeit'); sonst continue.
// Stirbt der Boss durch einen Rundenende-Tick gleichzeitig mit dem letzten Spieler, gewinnt die Gruppe (Boss wird zuerst getickt).
import { drawInt, hashOf, fromHex } from './rng.mjs';
import { ABILITIES, LEGACY_ABILITIES, GRUNDKLASSEN, PFADE, LEGACY_CLASSES, BOSS, CONTENT_VERSION, REVIVE_LIMIT, abilitiesOf } from './content.mjs';
export const ENGINE_VERSION = 'v1-0.1+' + CONTENT_VERSION;

// players: [{id, name?, grundklasse, pfad, tier}] (Struktur laut Architekturbericht) oder – nur für die Regressionsreferenz – [{id, cls: 'waechter'|…}] (alte Testprofile)
// Trennung der Referenzprofile: Die alten Testprofile (legacy.mjs) laufen nur nach ausdrücklicher Freischaltung durch ein Regressions-Werkzeug
// (Referenzkämpfe, Kernregeltests). Der reguläre Pfad (Server, Edge Function, Gruppenkämpfe) schaltet sie nie frei und lehnt sie ab.
let LEGACY_OK = false;
export const enableLegacyReference = () => { LEGACY_OK = true; };
export const legacyReferenceEnabled = () => LEGACY_OK;
export function newFight(players, cfg = {}) {
  if (!LEGACY_OK && players.some((p) => p.cls)) throw new Error('Referenzprofil (legacy) im regulären Engine-Pfad nicht erlaubt');
  const members = players.map((p) => {
    let base, abilities, auto, cls;
    if (p.cls && LEGACY_CLASSES[p.cls]) { base = LEGACY_CLASSES[p.cls]; abilities = [...base.abilities]; auto = abilities[0]; cls = p.cls; }
    else { const g = GRUNDKLASSEN[p.grundklasse]; if (!g) throw new Error('unbekannte Grundklasse ' + p.grundklasse); const pf = p.pfad ? PFADE[p.pfad] : null;
      abilities = abilitiesOf(p.grundklasse, p.pfad || null, p.tier || 0); auto = 'standard'; cls = p.pfad || p.grundklasse; base = { ...g, init: g.init + (pf ? pf.init : 0) }; }
    const m = { id: p.id, name: p.name || p.id, cls, hp: base.hp, maxhp: base.hp, atk: base.atk, def: base.def, init: base.init, alive: true, cd: {}, st: [], threat: 0, revives: 0, deaths: 0, final: false, abilities, auto };
    if (p.cls && LEGACY_CLASSES[p.cls]) m.legacy = true;
    if (!(p.cls && LEGACY_CLASSES[p.cls])) { m.grundklasse = p.grundklasse; m.pfad = p.pfad || null; m.tier = p.tier || 0; }
    return m; });
  const bhp = cfg.bossHp || BOSS.hp;
  return { members, monster: { id: 'boss', name: BOSS.name, hp: bhp, maxhp: bhp, atk: cfg.bossAtk || BOSS.atk, def: BOSS.def, init: BOSS.init, alive: true, st: [], phase: 1, cds: { heavy: BOSS.heavy.every, wave: 0 } }, adds: [], telegraph: null };
}
export const DEFAULT_CFG = { crit_pct: 15, crit_mult: 200, spread: 4, round_limit: 30, swipe_pct: 25 };

export function resolveRound(input) {
  const cfg = { ...DEFAULT_CFG, ...(input.cfg || {}) }, seed = fromHex(input.seed), fid = input.fight_id, rn = input.round_no;
  if (!LEGACY_OK && (input.state.members || []).some((m) => m.legacy)) throw new Error('Referenzprofil (legacy) im regulären Engine-Pfad nicht erlaubt');
  const S = JSON.parse(JSON.stringify(input.state)), A = input.actions || {}, boss = S.monster, log = []; let n = 0;
  const reviveOk = new Set(input.revive_ok || []), revivedNow = new Set();   // reviveOk: Ziele, für die der Server die Wiederbelebung vor Fensterablauf gültig angenommen hat
  const rnd = (stream, max) => drawInt(seed, stream, fid, rn, n++, max);
  const alive = () => S.members.filter((m) => m.alive);
  const foes = () => [boss, ...S.adds.filter((a) => a.alive)];
  const byId = (id) => S.members.find((m) => m.id === id) || S.adds.find((a) => a.id === id) || (id === 'boss' ? boss : null);
  const sv = (u, id) => u.st.find((s) => s.id === id);
  const atkOf = (u) => { let a = u.atk; const w = sv(u, 'weak'); if (w) a = Math.floor(a * (100 - w.power) / 100); const bf = sv(u, 'buff'); if (bf) a = Math.floor(a * (100 + bf.power * (bf.n || 1)) / 100); if (u.id === 'boss' && boss.phase >= 3) a = Math.floor(a * BOSS.enrage_atk_pct / 100); return a; };
  const defOf = (u) => { const rs = sv(u, 'ruest'); return u.def + (sv(u, 'guard') ? sv(u, 'guard').power : 0) - (rs ? Math.floor(u.def * 10 * (rs.n || 1) / 100) : 0); };
  const addSt = (u, e) => { const c = sv(u, e.st); if (c) { c.turns = Math.max(c.turns, e.turns); c.power = Math.max(c.power, e.power); } else u.st.push({ id: e.st, turns: e.turns, power: e.power }); };
  const MAXN = { gift: 3, bleed: 3, burn: 3, slow: 2, ruest: 3, buff: 2, regen: 3 };
  const NEG = ['gift', 'bleed', 'burn', 'slow', 'ruest'];                           // reinigbare negative Status (Betäubung/-resistenz nie)
  const addStack = (u, e) => {                                                       // Stapelregeln des Plans (2.2); Betäubung: nicht stapelbar, danach zwei Runden Resistenz
    if (e.id === 'stun') { if (sv(u, 'stun') || sv(u, 'stunres')) return false; u.st.push({ id: 'stun', turns: 2, power: 0 }); u.st.push({ id: 'stunres', turns: 3, power: 0 }); return true; }
    const c = sv(u, e.id), mx = MAXN[e.id] || 1;
    if (c) { c.n = Math.min(mx, (c.n || 1) + 1); c.turns = Math.max(c.turns, e.turns); c.power = Math.max(c.power, e.power); } else u.st.push({ id: e.id, turns: e.turns, power: e.power, n: 1 });
    return true; };
  const setCd = (m, id, base) => { let c = base; if (c > 0) { const sl = sv(m, 'slow'); if (sl) c += sl.n || 1; } m.cd[id] = c; };   // Verlangsamung: +1 Runde je Stapel auf neu begonnene Abklingzeiten
  const lowestMember = () => [...alive()].sort((a, b) => a.hp * b.maxhp - b.hp * a.maxhp || (a.id < b.id ? -1 : 1))[0];
  const healTo = (m, t, pct) => { const real = Math.min(Math.floor(t.maxhp * pct / 100), t.maxhp - t.hp); t.hp += real; const b = sv(t, 'bleed'); if (b) { if ((b.n || 1) > 1) b.n--; else t.st = t.st.filter((x) => x !== b); } threatAdd(m, Math.floor(real / 2)); return real; };   // Direktheilung entfernt einen Blutungsstapel
  const shieldTo = (t, pct, turns) => { const v = Math.min(Math.floor(t.maxhp * pct / 100), Math.floor(t.maxhp * 35 / 100)), c = sv(t, 'shield'); if (c) { c.power = Math.max(c.power, v); c.turns = Math.max(c.turns, turns); } else t.st.push({ id: 'shield', turns, power: v }); };
  const cleanse = (t, n) => { let k = 0; const seen = new Set(); for (const s of [...t.st]) { if (k >= n) break; if (!NEG.includes(s.id) || seen.has(s.id)) continue; seen.add(s.id); if ((s.n || 1) > 1) s.n--; else t.st = t.st.filter((x) => x !== s); k++; } return k; };
  const ended = () => !boss.alive || alive().length === 0;
  // Schaden: Schild nimmt zuerst auf, der Rest geht von den Lebenspunkten ab. Ergibt den tatsächlich verlorenen Lebenspunktwert.
  const hurt = (u, v) => { const sh = sv(u, 'shield'); let abs = 0; if (sh && sh.power > 0) { abs = Math.min(sh.power, v); sh.power -= abs; if (sh.power === 0) u.st = u.st.filter((s) => s !== sh); } const real = Math.min(u.hp, v - abs); u.hp -= real; if (u.hp === 0) { u.alive = false; u.st = []; if (u.deaths !== undefined) u.deaths++; } return { real, abs }; };
  const hit = (att, tgt, power, o = {}) => { // ein Treffer; zieht immer genau zwei Zufallszahlen (crit, spread); o.sure: sicherer Krit (Zufallszahl wird trotzdem gezogen); o.fx: Mindestschaden 25 % des Rohschadens (Plan 2.2)
    const roll = rnd('crit', 100), spr = rnd('spread', cfg.spread + 1), crit = o.sure || roll < cfg.crit_pct;
    const raw = Math.floor(atkOf(att) * power / 100);
    let v = o.fx ? Math.max(1, Math.floor(raw / 4), raw - Math.floor(defOf(tgt) / 2)) : Math.max(1, raw - Math.floor(defOf(tgt) / 2)); if (crit) v = Math.floor(v * cfg.crit_mult / 100); v += spr;
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
  for (const id of input.item_ok || []) {                                      // Wiederbelebungsitem: Sonderreaktion, vom Server vor Fensterablauf angenommen; verbraucht wird nur bei Erfolg (Ergebnis im Protokoll)
    const m = S.members.find((x) => x.id === id);
    if (m && !m.alive && !m.gone && m.revives < REVIVE_LIMIT) { m.alive = true; m.hp = Math.max(1, Math.floor(m.maxhp * 25 / 100)); m.revives++; m.st = []; m.final = false; revivedNow.add(m.id); log.push({ e: 'item_revive', u: id, hp: m.hp, n: m.revives }); }
    else log.push({ e: 'item_verfall', u: id });
  }
  checkPhase();
  // --- Aktionsliste dieser Runde
  const actors = [...alive().map((m) => ({ t: 'm', u: m })), { t: 'b', u: boss }, ...S.adds.filter((a) => a.alive).map((a) => ({ t: 'a', u: a }))];
  actors.sort((a, b) => b.u.init - a.u.init || (a.u.id < b.u.id ? -1 : 1));
  const resume = !!input.wipe_resume;                                          // Wiederaufnahme aus dem Wipe-Zustand: nur Item-Wiederbelebungen, niemand handelt, keine Ticks (der Kampf stand still)
  if (resume) log.push({ e: 'wipe_resume' });
  for (const ac of actors) {
    if (resume || ended()) break; const u = ac.u; if (!u.alive || revivedNow.has(u.id)) continue;   // Wiederbelebte handeln erst ab der nächsten Runde
    const stun = sv(u, 'stun'); if (stun) { log.push({ e: 'stun', a: u.id }); u.st = u.st.filter((x) => x !== stun); continue; }     // Betäubung kostet genau eine Aktion
    if (ac.t === 'm') memberAct(u); else if (ac.t === 'b') bossAct(); else addAct(u);
  }
  function memberAct(m) {
    const req = A[m.id], AB = m.legacy ? LEGACY_ABILITIES : ABILITIES; let abId = m.auto, origin = 'automatisch', tgtId = 'boss', ok = false;
    if (req && AB[req.ability] && (req.ability === 'standard' || m.abilities.includes(req.ability)) && (m.cd[req.ability] || 0) === 0 && !(req.mode === 'revive' && !AB[req.ability].revive)) { abId = req.ability; tgtId = req.target; origin = 'bestätigt'; ok = true; }
    else if (req) origin = 'ungültig→automatisch';
    const ab = AB[abId];
    if (ab.fx) return fxAct(m, ab, abId, tgtId, origin, ok ? req : null);
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
    if (ab.cd > 0) setCd(m, abId, ab.cd);
    checkPhase();
  }
  // Fähigkeiten mit Wirkbausteinen (Struktur laut Plan). Aktionsart (normal/Wiederbelebung) und Todesfall legt die BESTÄTIGUNG fest (req.mode, req.death), nie der Zustand bei der Ausführung.
  function fxAct(m, ab, abId, tgtId, origin, req) {
    const mode = req && req.mode === 'revive' ? 'revive' : 'normal'; let tgt = null;
    if (ab.tgt === 'ally' || ab.tgt === 'allyDead') {
      const t = S.members.find((x) => x.id === tgtId);
      if (t && !t.alive) {
        if (mode !== 'revive' || !ab.revive) { log.push({ e: 'verfall', a: m.id, ab: abId, t: t.id, why: 'ziel_tot' }); return; }     // normale Heilung/Schild wirkt nie auf Tote, kein Umlenken, Erstattung
        const why = t.gone ? 'verlassen' : req.death !== t.deaths ? 'anderer_todesfall' : t.revives >= REVIVE_LIMIT ? 'limit' : !reviveOk.has(t.id) ? 'fenster' : null;
        if (why) { log.push({ e: 'verfall', a: m.id, ab: abId, t: t.id, why }); return; }                                           // Aktion verfällt, Abklingzeit wird nicht gesetzt
        t.alive = true; t.hp = Math.max(1, Math.floor(t.maxhp * ab.revive.pct / 100)); t.revives++; t.st = []; t.final = false; revivedNow.add(t.id);
        const L = { e: 'revive', a: m.id, ab: abId, t: t.id, hp: t.hp, n: t.revives }; applyFx(m, ab.revive.fx, t, L); log.push(L); threatAdd(m, Math.floor(t.hp / 2));
        if (ab.cd > 0) setCd(m, abId, ab.cd); return;
      }
      if (mode === 'revive') { log.push({ e: 'verfall', a: m.id, ab: abId, t: tgtId, why: 'ziel_lebt' }); return; }                // anderer war schneller: kein Schild, keine Abklingzeit
      tgt = t && t.alive ? t : lowestMember();
    } else if (ab.tgt === 'foe') { tgt = byId(tgtId); if (!tgt || !tgt.alive || (tgt.id !== 'boss' && !tgt.id.startsWith('add'))) tgt = boss; }
    const L = { e: 'act', a: m.id, ab: abId, o: origin }; if (tgt) L.t = tgt.id;
    applyFx(m, ab.fx, tgt, L); log.push(L);
    for (const h of L.hits || []) if (h.down) log.push({ e: 'down', u: h.down });
    if (ab.cd > 0) setCd(m, abId, ab.cd);
    checkPhase();
  }
  function applyFx(m, fx, tgt, L) {
    const who = (w) => (w === 'self' ? [m] : w === 'allies' ? alive() : w === 'weakest' ? [lowestMember()] : [tgt]).filter((x) => x && x.alive);
    for (const f of fx) {
      if (f.t === 'dmg') {
        const hits = L.hits || (L.hits = []), hitSet = new Map(), order = foes();
        const nextFoe = () => (boss.alive ? boss : foes()[0]);
        const one = (t, pw) => { if (f.bossBonus && t.id === 'boss') pw = Math.floor(pw * (100 + f.bossBonus) / 100); const r = hit(m, t, pw, { sure: f.sure, fx: true }); const h = { t: t.id, v: r.v, c: r.crit }; if (r.abs) h.abs = r.abs; hits.push(h); threatAdd(m, r.real); hitSet.set(t.id, t); if (!t.alive) hits.push({ down: t.id }); };
        if (f.mode === 'one') { let t = tgt; for (let i = 0; i < f.hits; i++) { if (!t || !t.alive) t = nextFoe(); if (!t) break; one(t, f.power); } }
        else if (f.mode === 'all') { const n = order.length; for (const t of order) one(t, f.split ? Math.floor(f.power / n) : f.power); }
        else { const lst = order; for (let i = 0; i < f.hits; i++) { let t = lst[i % lst.length]; if (!t.alive) t = lst.find((x) => x.alive); if (!t) break; one(t, f.power); } }
        for (const t of hitSet.values()) if (t.alive && f.st) for (const e of f.st) { if (e.ifHas && !sv(t, e.ifHas)) continue; addStack(t, e); }
      } else if (f.t === 'heal') { const hs = (L.heals || (L.heals = [])); for (const t of who(f.who)) hs.push({ t: t.id, v: healTo(m, t, f.pct) });
      } else if (f.t === 'shield') { for (const t of who(f.who)) shieldTo(t, f.pct, f.turns);
      } else if (f.t === 'st') { for (const t of who(f.who)) addStack(t, f.st);
      } else if (f.t === 'cleanse') { for (const t of who(f.who)) cleanse(t, f.n); }
    }
  }
  function bossAct() {
    const al = alive(); if (!al.length) return;
    if (boss.cds.wave === 0 && boss.phase >= 2) {              // Flammenwelle: alle lebenden Spieler, feste Reihenfolge nach ID
      const hits = []; for (const t of [...al].sort((a, b) => (a.id < b.id ? -1 : 1))) { const r = hit(boss, t, BOSS.wave.power); hits.push({ t: t.id, v: r.v, c: r.crit }); if (!t.alive) hits.push({ down: t.id }); if (ended()) break; }
      log.push({ e: 'boss', k: 'flammenwelle', hits }); boss.cds.wave = BOSS.wave.every[Math.min(boss.phase, 3)] + (sv(boss, 'slow') ? 1 : 0); return;
    }
    const t = pickBossTarget(); const heavy = boss.cds.heavy === 0;
    const r = hit(boss, t, heavy ? BOSS.heavy.power : 100);
    log.push({ e: 'boss', k: heavy ? 'schwerer_schlag' : 'angriff', t: t.id, v: r.v, c: r.crit, ...(r.abs ? { abs: r.abs } : {}) }); if (!t.alive) log.push({ e: 'down', u: t.id });
    if (heavy) boss.cds.heavy = BOSS.heavy.every + (sv(boss, 'slow') ? 1 : 0);
  }
  function addAct(a) {
    const al = alive(); if (!al.length) return; const t = al[rnd('add_t', al.length)]; const r = hit(a, t, 100);
    log.push({ e: 'add', a: a.id, t: t.id, v: r.v, c: r.crit }); if (!t.alive) log.push({ e: 'down', u: t.id });
  }
  // --- Rundenende (nur wenn der Kampf nicht schon entschieden ist)
  if (!ended() && !resume) {
    const tick = (u) => { for (const s of [...u.st]) { if (!u.alive) break;
        if (s.id === 'gift') { const real = Math.min(u.hp, s.power * (s.n || 1)); u.hp -= real; log.push({ e: 'dot', u: u.id, st: 'gift', v: real }); if (u.hp === 0) { u.alive = false; u.st = []; if (u.deaths !== undefined) u.deaths++; log.push({ e: 'down', u: u.id }); if (u.id === 'boss') break; } }   // Gift ignoriert Schild und Verteidigung
        if (s.id === 'burn' || s.id === 'bleed') { const r = hurt(u, s.power * (s.n || 1)); log.push({ e: 'dot', u: u.id, st: s.id, v: r.real }); if (!u.alive) { log.push({ e: 'down', u: u.id }); if (u.id === 'boss') break; } }
        if (s.id === 'regen') { const real = Math.min(s.power * (s.n || 1), u.maxhp - u.hp); u.hp += real; if (real > 0) log.push({ e: 'hot', u: u.id, v: real }); }
        s.turns--; } u.st = u.st.filter((s) => s.turns > 0); };
    tick(boss); checkPhase();
    for (const a of S.adds) if (a.alive) tick(a);
    if (boss.alive) for (const m of alive()) tick(m);
  }
  if (!resume) { for (const m of S.members) for (const k of Object.keys(m.cd)) { if (m.cd[k] > 0) m.cd[k]--; if (m.cd[k] === 0) delete m.cd[k]; }
  if (boss.cds.heavy > 0) boss.cds.heavy--; if (boss.cds.wave > 0) boss.cds.wave--; }
  S.adds = S.adds.filter((a) => a.alive);
  for (const m of S.members) m.final = !m.alive && (m.gone === true || m.revives >= REVIVE_LIMIT);
  S.telegraph = boss.alive ? (boss.phase >= 2 && boss.cds.wave === 0 ? 'flammenwelle' : (boss.cds.heavy === 0 ? 'schwerer_schlag' : null)) : null;   // gleiche Rangfolge wie bossAct
  const won = !boss.alive, wipe = alive().length === 0;
  const outcome = won ? 'won' : wipe ? 'lost' : rn >= cfg.round_limit && !resume ? 'lost' : 'continue';
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
  return resolveRound({ fight_id: claimInput.fight_id, round_no: claimInput.round_no, seed: claimInput.seed, cfg, state: claimInput.snapshot.state, actions: claimInput.snapshot.actions || {}, conn: claimInput.snapshot.conn || {}, item_ok: claimInput.snapshot.item_ok || [], wipe_resume: !!claimInput.snapshot.wipe_resume, revive_ok: claimInput.snapshot.revive_ok || [], left: claimInput.snapshot.left || [] });
}

// Anfangszustand des nächsten Kampfes (Plan 1b, Übergang): Lebende behalten ihre HP, Tote kehren mit kleinem Anteil zurück (keine Wiederbelebung), alle temporären Zustände
// entfallen, Abklingzeiten bleiben, das Wiederbelebungslimit wird zurückgesetzt. Nachrücker (nicht im vorherigen Zustand) starten mit einem Anteil ihrer HP und ohne Abklingzeiten.
// Die Anteile sind PLATZHALTER (Balance, noch nicht festgelegt). Der Gegner ist unabhängig vom vorherigen Kampf konfiguriert.
export const NEXT_FIGHT_PLACEHOLDERS = { returnHpPct: 10, joinerHpPct: 50 };
export function nextFight(prev, roster, cfg = {}) {
  const ret = cfg.returnHpPct ?? NEXT_FIGHT_PLACEHOLDERS.returnHpPct, join = cfg.joinerHpPct ?? NEXT_FIGHT_PLACEHOLDERS.joinerHpPct;
  const before = Object.fromEntries(((prev && prev.members) || []).map((m) => [m.id, m]));
  const S = newFight(roster, cfg);
  S.members = S.members.map((m) => {
    const o = before[m.id];
    if (!o) return { ...m, hp: Math.max(1, Math.floor((m.maxhp * join) / 100)) };
    const hp = o.alive ? o.hp : Math.max(1, Math.floor((o.maxhp * ret) / 100));
    return { ...m, hp: Math.min(hp, m.maxhp), cd: { ...o.cd } };
  });
  return S;
}

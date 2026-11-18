// F5: serverseitige Profilableitung aus public.characters: node server/instance/tests/profil-ableitung.mjs
// Geprüft: vier Grundklassen, zwölf Spezialisierungen, Level/Stufen, ungültige/unvollständige Daten (Ablehnung ohne Rückgriff auf andere Werte), Übereinstimmung mit den Engine-Kampfwerten,
// Lebenszyklus (Eintritt, Änderung vor Ready, Ready, Freeze, Kampf, neue Instanz), Ausrüstungsangaben ohne Wirkung. Lokal (Attrappe der Supabase-Rollen, kein echtes JWT).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setup, counter, J, charData } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { GRUNDKLASSEN, PFADE, UP_LV } from '../engine/content.mjs';
const { ok, done } = counter();
const here = dirname(fileURLToPath(import.meta.url));
const E = await setup(54493); const { q, as, rpcAs } = E;
const CLI = { krieger: 'krieger', bogenschuetze: 'bogen', magier: 'magier', heiler: 'heiler' };
const PCLI = { scharfschuetze: 'scharf', fallensteller: 'falle' };
let n = 0;
const mkChar = async (acc, slot, data, cls = null, lv = null) => {            // legt einen Charakter mit beliebigen (auch ungültigen) Spielstanddaten direkt an (Testzugriff)
  const id = `dddd${String(++n).padStart(4, '0')}-0000-4000-8000-000000000000`; const d = typeof data === 'string' ? data : JSON.stringify(data);
  const c = cls ?? (JSON.parse(d).cls ?? 'wanderer'), l = lv ?? (Number.isInteger(JSON.parse(d).lv) ? JSON.parse(d).lv : 1);
  await q(`insert into public.characters(character_id,account_id,slot_number,character_name,character_class,level,character_data) values ('${id}','${acc.id}',${slot},'T${n}','${c}',${l},$cd$${d}$cd$)`);
  return id;
};
const derive = async (id) => { const r = await E.cl.psql(`select rwi.derive_profile('${id}')`); return r.code ? { err: r.err.split('\n')[0] } : J(r.out); };
const group = (a, b) => E.group([a, b], 2);
const joinAs = async (acct, inst, ch) => { const r = await as('authenticated', acct.id, `select public.group_join(${inst}, '${ch}')`); return r.code ? { err: r.err.split('\n')[0] } : J(r.out); };

try {
  console.log('PostgreSQL', await q('show server_version'));
  const acc0 = (nm) => E.account(nm, 0);
  const O = await E.account('PfO'), P = await E.account('PfP');   // (je ein Charakter)

  // ---- 1. alle zwölf Spezialisierungen x Stufen 1..3 (gültige Level), alle vier Grundklassen ohne Pfad ----
  let bad = [], cnt = 0;
  let slot = 0, a2 = await acc0('PfB');
  const take = () => { slot++; if (slot > 2) { slot = 1; return acc0('Pf' + (++n)).then((x) => { a2 = x; return [a2, 1]; }); } return Promise.resolve([a2, slot]); };
  for (const [pf, def] of Object.entries(PFADE)) for (let t = 1; t <= 3; t++) {
    const [ac, sl] = await take(); const lv = UP_LV[t - 1];
    const id = await mkChar(ac, sl, charData(def.grundklasse, pf, t, lv));
    const r = await derive(id); cnt++;
    if (!(r.grundklasse === def.grundklasse && r.pfad === pf && r.tier === t && r.lv === lv && r.src === 'derived')) bad.push(`${pf}/${t}:${JSON.stringify(r)}`);
  }
  ok(cnt === 36 && bad.length === 0, 'alle 12 Spezialisierungen x Stufen 1–3 (Level 15/30/50) werden korrekt abgeleitet (Engine-Namen, Pfad gehört zur Grundklasse)', bad.slice(0, 2).join(' | '));
  bad = []; for (const g of Object.keys(GRUNDKLASSEN)) { const [ac, sl] = await take(); const id = await mkChar(ac, sl, charData(g, null, 0, 5)); const r = await derive(id); if (!(r.grundklasse === g && r.pfad === null && r.tier === 0 && r.lv === 5)) bad.push(g + JSON.stringify(r)); }
  ok(bad.length === 0, 'alle 4 Grundklassen ohne Spezialisierung (Stufe 0, Level 5)', bad.join('|'));

  // ---- 2. Abbildung Client -> Engine gegen die tatsächlichen Client-Definitionen (index.html) ----
  const html = readFileSync(join(here, '../../../index.html'), 'utf8');
  const cp = [...html.matchAll(/^ ([a-z]+):\{b:'([a-z]+)',t:'/gm)].map((m) => [m[1], m[2]]);
  const cc = [...html.matchAll(/^  (wanderer|krieger|bogen|magier|heiler):\{cd:/gm)].map((m) => m[1]);
  const toEngine = Object.fromEntries(Object.entries({ ...PCLI }).map(([e, c]) => [c, e]));
  ok(cp.length === 12 && cc.join() === 'wanderer,krieger,bogen,magier,heiler', 'index.html definiert 12 Pfade und die Klassen wanderer/krieger/bogen/magier/heiler', `${cp.length} ${cc.join()}`);
  ok(cp.every(([pid, base]) => { const e = toEngine[pid] || pid; return PFADE[e] && PFADE[e].grundklasse === Object.keys(CLI).find((k) => CLI[k] === base); }), 'jeder Client-Pfad ist über die Abbildung (scharf/falle/bogen) ein Engine-Pfad der richtigen Grundklasse');
  ok(Object.keys(PFADE).every((e) => cp.some(([pid]) => (toEngine[pid] || pid) === e)), 'und jeder Engine-Pfad kommt im Client vor (keine Lücke in der Abbildung)');
  ok(JSON.stringify(UP_LV) === JSON.stringify([15, 30, 50]) && /UP_LV=\[15,30,50\]/.test(html.replace(/\s/g, '')), 'Level-Schwellen der Stufen (15/30/50) stimmen mit index.html überein');

  // ---- 3. abgeleitetes Profil == Kampfwerte der Engine ----
  const grp = await group(O.chars[0], P.chars[0]);
  const [aj] = [await acc0('PfJ')]; const idj = await mkChar(aj, 1, charData('magier', 'sturm', 2, 33));
  const j1 = await joinAs(aj, grp.instance, idj);
  ok(j1.status === 'joined', 'Charakter (Magier/Sturm, Stufe 2, Level 33) tritt über den Client-Wrapper bei', JSON.stringify(j1));
  const prof = J(await q(`select profile from rwi.members where instance_id=${grp.instance} and player='${idj}'`));
  ok(prof.grundklasse === 'magier' && prof.pfad === 'sturm' && prof.tier === 2 && prof.lv === 33 && prof.src === 'derived' && prof.char_version === 1, 'gespeichertes Instanzprofil ist das abgeleitete (Quelle derived, Charakterversion)', JSON.stringify(prof));
  { const ro = J(await q(`select rwi.roster(${grp.instance})`)); const me = ro.find((x) => x.name === idj); const S = engine.newFight([me], {}); const m = S.members[0];
    const g = GRUNDKLASSEN.magier;
    ok(m.maxhp === g.hp && m.atk === g.atk && m.def === g.def && m.init === g.init + PFADE.sturm.init && m.pfad === 'sturm' && m.tier === 2, 'Engine-Kampfwerte aus dem abgeleiteten Profil = Grundwerte der Klasse + Pfadinitiative (Leben 130, Angriff 28, Verteidigung 4, Initiative 6+2)', JSON.stringify({ hp: m.maxhp, atk: m.atk, def: m.def, init: m.init })); }
  // alle 12 Pfade/Stufe 3: Engine-Kampfwerte
  { let ok12 = 0; for (const [pf, def] of Object.entries(PFADE)) { const m = engine.newFight([{ id: 'x', grundklasse: def.grundklasse, pfad: pf, tier: 3 }], {}).members[0]; const g = GRUNDKLASSEN[def.grundklasse];
      if (m.maxhp === g.hp && m.atk === g.atk && m.def === g.def && m.init === g.init + def.init) ok12++; }
    ok(ok12 === 12, 'für alle 12 Spezialisierungen entspricht der Engine-Kampfwert den Tabellenwerten (content.mjs): kein Widerspruch zwischen Ableitung und Engine'); }

  // ---- 4. ungültige / unvollständige Daten: Ablehnung, kein Rückgriff ----
  const BADS = [
    ['Klasse fehlt', {}, 'wanderer', 1, /profile_invalid:class/], ['Klasse unbekannt', { cls: 'pirat', lv: 20 }, 'pirat', 20, /profile_invalid:class/],
    ['Klasse im JSON passt nicht zur Spalte', { cls: 'magier', lv: 20 }, 'krieger', 20, /profile_invalid:class/], ['Level fehlt', { cls: 'krieger' }, 'krieger', 20, /profile_invalid:level/],
    ['Level im JSON passt nicht zur Spalte', { cls: 'krieger', lv: 40 }, 'krieger', 20, /profile_invalid:level/], ['Level als Text', { cls: 'krieger', lv: '20' }, 'krieger', 20, /profile_invalid:level/],
    ['Stufe 4', { cls: 'krieger', lv: 50, path: 'ritter', tier: 4 }, 'krieger', 50, /profile_invalid:tier/], ['Stufe als Text', { cls: 'krieger', lv: 50, path: 'ritter', tier: '2' }, 'krieger', 50, /profile_invalid:tier/],
    ['Stufe 1 unter Level 15', { cls: 'krieger', lv: 14, path: 'ritter', tier: 1 }, 'krieger', 14, /profile_invalid:tier_level/], ['Stufe 2 unter Level 30', { cls: 'krieger', lv: 29, path: 'ritter', tier: 2 }, 'krieger', 29, /profile_invalid:tier_level/],
    ['Stufe 3 unter Level 50', { cls: 'magier', lv: 49, path: 'feuer', tier: 3 }, 'magier', 49, /profile_invalid:tier_level/], ['Pfad unbekannt', { cls: 'krieger', lv: 50, path: 'pirat', tier: 1 }, 'krieger', 50, /profile_invalid:path/],
    ['Pfad gehört zu anderer Klasse', { cls: 'krieger', lv: 50, path: 'feuer', tier: 1 }, 'krieger', 50, /profile_invalid:path_class_mismatch/], ['Pfad ohne Stufe', { cls: 'krieger', lv: 50, path: 'ritter', tier: 0 }, 'krieger', 50, /profile_invalid:path_without_tier/],
    ['Stufe ohne Pfad', { cls: 'krieger', lv: 50, tier: 2 }, 'krieger', 50, /profile_invalid:path/], ['Wanderer mit Pfad', { cls: 'wanderer', lv: 20, path: 'ritter', tier: 1 }, 'wanderer', 20, /profile_invalid:wanderer_with_path/],
    ['Pfad kein Text', { cls: 'krieger', lv: 50, path: 5, tier: 1 }, 'krieger', 50, /profile_invalid:path/],
  ];
  const T = await acc0('PfT'); const rej = []; let sl2 = 0;
  for (const [name, d, c, l, re] of BADS) {
    const a = await acc0('PfX' + (++n)); const id = await mkChar(a, 1, d, c, l); const r = await derive(id);
    // zusätzlich: eine passende, „gute“ rwi.players-Zeile darf NICHT als Ersatz dienen
    await q(`insert into rwi.players values ('${id}', 50, 'krieger', 'ritter', 3) on conflict (player) do update set lv=50, grundklasse='krieger', pfad='ritter', tier=3`);
    const j = await joinAs(a, grp.instance, id);
    if (!(r.err && re.test(r.err) && j.err && /profile_invalid/.test(j.err))) rej.push(`${name}: ${JSON.stringify(r).slice(0, 80)} / ${JSON.stringify(j).slice(0, 80)}`);
  }
  ok(rej.length === 0, `${BADS.length} ungültige/unvollständige Charakterdaten werden mit dem erwarteten Grund abgeleitet-abgelehnt UND der Eintritt scheitert, obwohl eine passende rwi.players-Zeile existiert (kein stiller Rückgriff)`, rej.slice(0, 2).join(' || '));
  ok((await q(`select count(*) from rwi.members where instance_id=${grp.instance}`)) === '3', 'durch abgelehnte Eintritte entstanden keine Mitglieder');
  { const a = await acc0('PfW'); const idw = await mkChar(a, 1, { cls: 'wanderer', lv: 30 }); const r = await derive(idw); const j = await joinAs(a, grp.instance, idw);
    ok(r.grundklasse === null && r.tier === 0 && j.status === 'not_eligible', 'Wanderer (gültig, ohne Klasse): kein Fehler, aber nicht instanzfähig (not_eligible)', JSON.stringify(j)); }
  { const a = await acc0('PfL'); const idl = await mkChar(a, 1, charData('krieger', null, 0, 4)); const j = await joinAs(a, grp.instance, idl);
    ok(j.status === 'not_eligible', 'Level 4 mit Klasse: not_eligible (Instanzzugang ab Level 5, bestehende Regel)', JSON.stringify(j)); }

  // ---- 5. manipulierte Clientwerte ----
  ok((await as('authenticated', T.id, `insert into rwi.players values ('${T.chars[0]}', 50, 'krieger', 'ritter', 3)`)).err.includes('permission denied'), 'Client kann rwi.players nicht schreiben (kein Recht auf das Schema)');
  ok((await as('authenticated', T.id, `update public.characters set level = 50 where account_id='${T.id}'`)).err.includes('permission denied'), 'Client kann public.characters nicht direkt ändern (nur über create_/save_character)');
  ok(!(await q(`select has_function_privilege('authenticated','rwi.derive_profile(uuid)','execute') or has_function_privilege('anon','rwi.derive_profile(uuid)','execute') or has_function_privilege('authenticated','rwi.profile_of(text)','execute')`)).startsWith('t'), 'derive_profile/profile_of sind für anon und authenticated nicht ausführbar');
  { const a = await acc0('PfM'); const idm = await mkChar(a, 1, charData('krieger', 'ritter', 1, 20));
    // Der Client versucht, beim Beitritt Werte mitzugeben (Wrapper kennt nur Instanz und Charakter); Profilangaben in character_data außerhalb der bekannten Felder bleiben wirkungslos
    await q(`update public.characters set character_data = character_data || '{"hp":99999,"atk":99999,"maxhp":99999,"profile":{"grundklasse":"magier","tier":3},"grundklasse":"magier","pfad":"sturm"}'::jsonb where character_id='${idm}'`);
    const j = await joinAs(a, grp.instance, idm); const pr = J(await q(`select profile from rwi.members where instance_id=${grp.instance} and player='${idm}'`));
    ok(j.status === 'joined' && pr.grundklasse === 'krieger' && pr.pfad === 'ritter' && pr.tier === 1 && pr.lv === 20 && !JSON.stringify(pr).includes('99999'), 'frei mitgegebene Felder (hp, atk, profile, grundklasse, pfad) im Spielstand werden ignoriert: Profil kommt nur aus cls/path/tier/lv', JSON.stringify(pr)); }
  // dokumentierte Grenze: formal gültige, aber gefälschte Spielstanddaten (z. B. Level 50 Stufe 3) kann der Server nicht erkennen
  { const a = await acc0('PfF'); const sv = await as('authenticated', a.id, `select * from public.create_character(1, 'Faelscher', '${JSON.stringify({ cls: 'magier', path: 'feuer', tier: 3, lv: 50 })}'::jsonb)`);
    const cid = sv.out.split('\n').pop().split('|')[0]; const d = await derive(cid);
    ok(!sv.code && d.lv === 50 && d.tier === 3 && d.pfad === 'feuer', 'GRENZE (dokumentiert, nicht gelöst): ein formal gültiger, aber vom Client frei erfundener Spielstand (Level 50, Stufe 3) wird übernommen – der Server kennt keinen autoritativen Fortschritt (siehe docs/PROFILABLEITUNG.md)', JSON.stringify(d)); }

  // ---- 6. Lebenszyklus ----
  { const a = await acc0('PfC'); const G = await group(O.chars[0], P.chars[0]); const id = await mkChar(a, 1, charData('heiler', 'priester', 2, 30));
    const jj = await joinAs(a, G.instance, id); const p0 = J(await q(`select profile from rwi.members where instance_id=${G.instance} and player='${id}'`));
    ok(jj.status === 'joined' && p0.grundklasse === 'heiler' && p0.pfad === 'priester' && p0.tier === 2 && p0.char_version === 1, 'Eintritt erzeugt das serverseitige Profil', JSON.stringify(p0));
    // Änderung VOR Ready (Ausrüstung/Stufe): wird beim Ready abschließend übernommen
    await q(`update public.characters set version = version + 1, character_data = $cd$${charData('heiler', 'natur', 3, 50)}$cd$::jsonb || '{"gear":[{"u":1,"b":"w|heilstab|3","q":4,"p":5}],"eq":{"waffe":1}}'::jsonb, level = 50 where character_id='${id}'`);
    ok((await q(`select profile->>'pfad' from rwi.members where instance_id=${G.instance} and player='${id}'`)) === 'priester', 'Änderung vor Ready: Profil bis zum Ready unverändert gespeichert');
    const rd = await as('authenticated', a.id, `select public.group_ready(${G.instance}, '${id}')`);
    const p1 = J(await q(`select profile from rwi.members where instance_id=${G.instance} and player='${id}'`));
    ok(!rd.code && p1.pfad === 'natur' && p1.tier === 3 && p1.lv === 50 && p1.char_version === 2, 'Ready: abschließende Aktualisierung aus dem aktuellen Charakter (Pfad, Stufe, Level, Version)', JSON.stringify(p1));
    ok(!JSON.stringify(p1).includes('gear') && !JSON.stringify(p1).includes('heilstab'), 'Ausrüstungsangaben aus dem Spielstand sind NICHT Teil des Instanzprofils (die Engine kennt keine Ausrüstung)');
    // nach Ready: Freeze
    await q(`update public.characters set version = version + 1, character_data = $cd$${charData('heiler', 'moench', 1, 20)}$cd$, level = 20 where character_id='${id}'`);
    await as('authenticated', a.id, `select public.group_ready(${G.instance}, '${id}')`);
    for (const m of [O, P]) await q(`select rwi.set_ready(${G.instance}, '${m.chars[0]}')`);
    { const pf = J(await q(`select profile from rwi.members where instance_id=${G.instance} and player='${id}'`)); ok(JSON.stringify(pf) === JSON.stringify(p1), 'Änderung nach Ready (auch erneutes Ready): Profil bleibt exakt eingefroren (inkl. Charakterversion)', JSON.stringify(pf)); }
    // Kampf
    const S = engine.newFight(J(await q(`select rwi.roster(${G.instance})`)), { bossHp: 4000, bossAtk: 8 });
    const me0 = S.members.find((x) => x.id === id); ok(me0 && me0.pfad === 'natur' && me0.tier === 3, 'Aufstellung/Kampfzustand beim Start nutzt das eingefrorene Profil (Natur, Stufe 3)', JSON.stringify({ p: me0?.pfad, t: me0?.tier }));
    await q(`select rwi.start_fight(${G.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
    await q(`update public.characters set version = version + 1, character_data = $cd$${charData('heiler', 'priester', 1, 15)}$cd$, level = 15 where character_id='${id}'`);
    ok((await q(`select (select count(*) from jsonb_array_elements(state->'members') x where x->>'id'='${id}' and x->>'pfad'='natur' and (x->>'tier')::int=3) from rwi.fights where instance_id=${G.instance}`)) === '1', 'Profil-Freeze während des Kampfes: Charakteränderung wirkt nicht auf den laufenden Kampf');
    ok((await q(`select mstate from rwi.members where instance_id=${G.instance} and player='${id}'`)) === 'active', 'Teilnahme bleibt bestehen');
    // neue Instanz: neu abgeleitet
    const G2 = await group(O.chars[0], P.chars[0]).catch(() => null);
    const G3 = await E.group([(await E.account('PfN1')).chars[0], (await E.account('PfN2')).chars[0]], 2); await as('authenticated', a.id, `select public.group_leave(${G.instance}, '${id}')`);
    const j3 = await joinAs(a, G3.instance, id); const p3 = J(await q(`select profile from rwi.members where instance_id=${G3.instance} and player='${id}'`));
    ok(j3.status === 'joined' && p3.pfad === 'priester' && p3.tier === 1 && p3.lv === 15 && p3.char_version > p1.char_version, 'NEUE Instanz nach der Änderung: Profil wird neu abgeleitet (aktueller Stand)', JSON.stringify(p3));
    ok((await q(`select profile->>'pfad' from rwi.members where instance_id=${G.instance} and player='${id}'`)) === 'natur', 'und die alte Instanz behält ihr eingefrorenes Profil');
    // Charakter wird nach Eintritt ungültig: Ready wird abgelehnt (kein Fallback)
    await q(`update public.characters set character_data = '{"cls":"krieger"}'::jsonb where character_id='${id}'`);
    const rd3 = await as('authenticated', a.id, `select public.group_ready(${G3.instance}, '${id}')`);
    ok(rd3.code !== 0 && /profile_invalid/.test(rd3.err), 'Charakterdaten nach dem Eintritt ungültig: Ready wird abgelehnt (profile_invalid)', rd3.err.split('\n')[0]);
    ok((await q(`select ready::text from rwi.members where instance_id=${G3.instance} and player='${id}'`)) === 'false', 'Mitglied bleibt unbereit'); }

  // ---- 7. echter Client-Weg: create_character / save_character -> Beitritt ----
  { const a = await acc0('PfR'); const G = await group(O.chars[0], P.chars[0]);
    const cr = await as('authenticated', a.id, `select * from public.create_character(1, 'Weg', '${JSON.stringify({ cls: 'bogen', path: 'falle', tier: 1, lv: 16, hp: 5, gear: [], eq: {} })}'::jsonb)`);
    const cid = cr.out.split('\n').pop().split('|')[0]; const jj = await joinAs(a, G.instance, cid);
    const p = J(await q(`select profile from rwi.members where instance_id=${G.instance} and player='${cid}'`));
    ok(!cr.code && jj.status === 'joined' && p.grundklasse === 'bogenschuetze' && p.pfad === 'fallensteller' && p.tier === 1 && p.lv === 16, 'Weg über create_character: Client-Namen (bogen/falle) werden zu Engine-Namen (bogenschuetze/fallensteller)', JSON.stringify(p));
    const sv = await as('authenticated', a.id, `select public.save_character('${cid}', 1, '{"x":1}'::jsonb)`); const G2 = await group(O.chars[0], P.chars[0]);
    const j2 = await joinAs(a, G2.instance, cid);
    ok(!sv.code && j2.err && /profile_invalid/.test(j2.err), 'save_character mit unbrauchbarem Spielstand ist erlaubt (bestehendes Verhalten), der Beitritt wird danach aber abgelehnt', JSON.stringify(j2)); }
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { E.stop(); }
process.exit(done());

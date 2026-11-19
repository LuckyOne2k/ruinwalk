#!/usr/bin/env node
/* Ruin Walk – Positivliste für GitHub Pages (Roadmap Phase 2A).
 *
 * Nur Dateien aus tools/pages/allowlist.txt dürfen veröffentlicht werden. Das Skript
 *   - prüft jeden Eintrag der Liste (Pfadform, erlaubter Bereich, Dateityp, echte Datei, kein Symlink),
 *   - leitet aus dem Spielcode ab, welche Dateien das Spiel lädt (statisch und dynamisch),
 *     und verlangt Gleichheit: nichts fehlt, nichts ist zusätzlich freigegeben,
 *   - bricht ab, wenn der Code einen unbekannten dynamischen Ladepfad enthält,
 *   - baut das Veröffentlichungsverzeichnis nur aus der Liste und prüft es danach erneut.
 * Neue Dateien im Repository werden nie automatisch freigegeben.
 *
 * Aufruf (vom Repository-Wurzelverzeichnis):
 *   node tools/pages/site.mjs pruefen              – Liste gegen Repository und Spielcode prüfen
 *   node tools/pages/site.mjs bauen <ziel>         – prüfen, <ziel> (darf nicht existieren) befüllen, Ergebnis prüfen
 *   node tools/pages/site.mjs pruefe-ziel <ziel>   – ein bestehendes Veröffentlichungsverzeichnis prüfen
 *   node tools/pages/site.mjs vorschlag            – aus dem Spielcode abgeleitete Liste ausgeben (zum Pflegen der Liste)
 * Optionen: --root <pfad> (Repository-Wurzel, Standard: aktuelles Verzeichnis)
 * Exit-Code: 0 = in Ordnung, 1 = Prüfung fehlgeschlagen, 2 = falscher Aufruf.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const LISTE = 'tools/pages/allowlist.txt';

// Bereiche und Dateitypen, die überhaupt veröffentlicht werden dürfen (Wurzel nur einzeln benannte Muster)
const WURZEL = [/^index\.html$/, /^landingpage\.html$/, /^pxdom\.js$/, /^sprites(_[a-z]+)?\.js$/];
const BEREICHE = {
  'figs/': /^figs\/(manifest\.js|[a-z0-9_]+\.png|lay\/[a-z0-9_]+\.png)$/,
  'items/': /^items\/(manifest\.js|[a-z0-9_]+\.png)$/,
  'status/': /^status\/[a-z0-9_]+\.png$/,
  'assets/': /^assets\/[a-z0-9_]+\.(png|jpg)$/,
};
// Ausdrücklich verbotene Bereiche (zusätzliche Sicherung; sie sind ohnehin nicht erlaubt)
const VERBOTEN = ['.claude/', '.github/', '.git/', 'docs/', 'marketing/', 'server/', 'supabase/', 'tests/', 'tools/', 'kunst/', 'node_modules/'];
// Bekannte dynamische Ladepfade im Spielcode: Präfix → Herkunft der Namen
const DYNAMISCH = new Set(['status/', 'items/', 'figs/', 'figs/lay/']);

class Fehler extends Error {}

function lies(root, rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

/** Form eines Listeneintrags prüfen; gibt Fehlertext oder null zurück. */
export function pfadFehler(p) {
  if (typeof p !== 'string' || p.length === 0) return 'leerer Eintrag';
  if (p.length > 200) return 'Pfad zu lang';
  if (/[\0-\x1f\x7f]/.test(p)) return 'Steuerzeichen im Pfad';
  if (p.includes('\\')) return 'Backslash im Pfad';
  if (p.startsWith('/')) return 'absoluter Pfad';
  if (!/^[A-Za-z0-9._\/-]+$/.test(p)) return 'unerlaubte Zeichen im Pfad';
  const seg = p.split('/');
  if (seg.some(s => s === '' || s === '.' || s === '..')) return 'ungültiges Pfadsegment (leer, . oder ..)';
  if (seg.some(s => s.startsWith('.'))) return 'versteckte Datei oder versteckter Ordner';
  if (path.posix.normalize(p) !== p) return 'Pfad nicht normalisiert';
  if (VERBOTEN.some(v => p.startsWith(v))) return 'verbotener Bereich';
  const b = Object.keys(BEREICHE).find(k => p.startsWith(k));
  if (b) return BEREICHE[b].test(p) ? null : 'Dateityp oder Name im Bereich ' + b + ' nicht erlaubt';
  if (p.includes('/')) return 'Bereich nicht freigebbar';
  return WURZEL.some(r => r.test(p)) ? null : 'Datei in der Wurzel nicht freigebbar';
}

/** Positivliste lesen: eine Datei je Zeile, # = Kommentar. */
export function leseListe(root) {
  const f = path.join(root, LISTE);
  if (!fs.existsSync(f)) throw new Fehler('Positivliste fehlt: ' + LISTE);
  const fehler = [], liste = [], gesehen = new Set();
  lies(root, LISTE).split('\n').forEach((zeile, i) => {
    const t = zeile.replace(/\r$/, '');
    if (t.trim() === '' || t.trimStart().startsWith('#')) return;
    const e = pfadFehler(t);
    if (e) { fehler.push(`Zeile ${i + 1} „${t}“: ${e}`); return; }
    if (gesehen.has(t)) { fehler.push(`Zeile ${i + 1} „${t}“: doppelt`); return; }
    gesehen.add(t); liste.push(t);
  });
  return { liste, fehler };
}

/** Prüft, dass ein Eintrag eine echte, reguläre Datei innerhalb des Repositorys ist (kein Symlink). */
function quellFehler(root, p) {
  const f = path.join(root, p);
  let st; try { st = fs.lstatSync(f); } catch { return 'Datei fehlt'; }
  if (st.isSymbolicLink()) return 'symbolischer Link';
  if (!st.isFile()) return 'keine reguläre Datei';
  // jeder Ordner auf dem Weg darf ebenfalls kein Symlink sein
  const teile = p.split('/'); let akt = root;
  for (const t of teile.slice(0, -1)) { akt = path.join(akt, t); if (fs.lstatSync(akt).isSymbolicLink()) return 'Ordner ist symbolischer Link'; }
  const echt = fs.realpathSync(f), wurzel = fs.realpathSync(root);
  if (!echt.startsWith(wurzel + path.sep)) return 'liegt außerhalb des Repositorys';
  if (st.size === 0) return 'leere Datei';
  return null;
}

function manifest(root, rel, name) {
  const code = lies(root, rel);
  const wert = vm.runInNewContext(code + `\n;typeof ${name}!=='undefined'?${name}:undefined`, { window: {} }, { timeout: 1000 });
  if (!Array.isArray(wert) || wert.some(n => typeof n !== 'string' || !/^[a-z0-9_]+$/.test(n))) throw new Fehler(`${rel}: ${name} nicht lesbar`);
  return wert;
}

/** Leitet aus dem Spielcode ab, welche Dateien das Spiel lädt. */
export function benoetigt(root) {
  const soll = new Map();   // pfad → Grund
  const add = (p, grund) => { if (!soll.has(p)) soll.set(p, grund); };
  const fehler = [];

  // 1. Statische Verweise in den beiden HTML-Seiten (src, href, CSS url(...))
  for (const seite of ['index.html', 'landingpage.html']) {
    add(seite, 'Einstiegsseite');
    const h = lies(root, seite);
    const funde = [...h.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)].map(m => m[1])
      .concat([...h.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]));
    for (let u of funde) {
      if (/^(https?:|data:|mailto:|javascript:|#|\/\/)/i.test(u)) continue;
      if (/['"+`$]/.test(u)) continue;               // dynamisch zusammengesetzt: siehe Punkt 3
      u = u.split('#')[0].split('?')[0].replace(/^\.\//, '');
      if (u === '') continue;
      const e = pfadFehler(u);
      if (e) { fehler.push(`${seite} verweist auf „${u}“: ${e}`); continue; }
      add(u, `Verweis in ${seite}`);
    }
  }

  // 2. Dynamische Ladewege mit bekannter Namensquelle
  for (const n of manifest(root, 'items/manifest.js', 'PX_ITEMS')) add(`items/${n}.png`, 'PX_ITEMS (items/manifest.js)');
  const figuren = manifest(root, 'figs/manifest.js', 'PX_PNG');
  for (const n of figuren) add(`figs/${n}.png`, 'PX_PNG (figs/manifest.js)');
  const fxBlock = /const FX=\{([\s\S]*?)\n\};/.exec(lies(root, 'index.html'));
  if (!fxBlock) fehler.push('index.html: Status-Definition FX nicht gefunden');
  else for (const m of fxBlock[1].matchAll(/^\s*([a-z0-9_]+):\{/gm)) add(`status/${m[1]}.png`, 'Status-Symbol (FX in index.html)');
  // Ebenen der Figuren (pxdom.js, PX_LAY): Codeweg vorhanden, derzeit über PX_EQ abgeschaltet → als Spielgrafik mit freigegeben
  const lay = /const PX_LAY=(\{[^}]*\})/.exec(lies(root, 'pxdom.js'));
  if (!lay) fehler.push('pxdom.js: PX_LAY nicht gefunden');
  else {
    const klassen = Object.keys(vm.runInNewContext('(' + lay[1] + ')', {}, { timeout: 1000 }));
    const layDir = path.join(root, 'figs/lay');
    const layDateien = fs.existsSync(layDir) ? fs.readdirSync(layDir) : [];
    for (const k of klassen) {
      for (const s of ['_base', '_down']) if (fs.existsSync(path.join(root, `figs/${k}${s}.png`))) add(`figs/${k}${s}.png`, 'Figuren-Ebene (PX_LAY, derzeit abgeschaltet)');
      for (const f of layDateien) if (f.startsWith(k + '_w_') || f.startsWith(k + '_o_')) add(`figs/lay/${f}`, 'Figuren-Ebene (PX_LAY, derzeit abgeschaltet)');
    }
  }

  // 3. Unbekannte dynamische Ladepfade erkennen: 'figs/…' + / "items/…" + usw. in Spielcode
  const code = ['index.html', 'pxdom.js', ...fs.readdirSync(root).filter(f => /^sprites(_[a-z]+)?\.js$/.test(f))];
  for (const f of code) {
    for (const m of lies(root, f).matchAll(/(['"`])((?:figs|items|status|assets)\/[^'"`]*)\1\s*\+/g)) {
      const praefix = m[2].replace(/[^/]*$/, '');
      if (!DYNAMISCH.has(praefix)) fehler.push(`${f}: unbekannter dynamischer Ladepfad „${m[2]}…“ – Prüfskript und Positivliste erweitern`);
    }
  }
  return { soll, fehler };
}

/** Vollständige Prüfung der Positivliste gegen Repository und Spielcode. */
export function pruefen(root) {
  const fehler = [], hinweise = [];
  const { liste, fehler: lf } = leseListe(root); fehler.push(...lf);
  for (const p of liste) { const e = quellFehler(root, p); if (e) fehler.push(`„${p}“: ${e}`); }
  let soll = new Map();
  try { const b = benoetigt(root); soll = b.soll; fehler.push(...b.fehler); } catch (e) { fehler.push('Ableitung aus dem Spielcode: ' + e.message); }
  const set = new Set(liste);
  for (const [p, grund] of soll) {
    if (!set.has(p)) fehler.push(`Pflichtdatei fehlt in der Positivliste: „${p}“ (${grund})`);
    else if (!fs.existsSync(path.join(root, p))) fehler.push(`Pflichtdatei fehlt im Repository: „${p}“ (${grund})`);
  }
  for (const p of liste) if (!soll.has(p)) fehler.push(`„${p}“ ist freigegeben, wird vom Spiel aber nicht geladen`);
  // neue Dateien in Spielbereichen, die nicht freigegeben sind: nur Hinweis (werden nicht veröffentlicht)
  for (const b of Object.keys(BEREICHE)) {
    const dir = path.join(root, b);
    if (!fs.existsSync(dir)) continue;
    for (const f of walk(dir)) { const rel = path.relative(root, f).split(path.sep).join('/'); if (!set.has(rel)) hinweise.push(`nicht freigegeben (wird nicht veröffentlicht): ${rel}`); }
  }
  return { liste, fehler, hinweise };
}

function walk(dir) {
  const aus = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) aus.push(...walk(f)); else aus.push(f);
  }
  return aus;
}

const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** Prüft ein Veröffentlichungsverzeichnis: genau die Positivliste, nur reguläre Dateien, gleicher Inhalt wie die Quelle. */
export function pruefeZiel(root, ziel, liste) {
  const fehler = [];
  const st = fs.lstatSync(ziel);
  if (!st.isDirectory() || st.isSymbolicLink()) return ['Ziel ist kein Ordner'];
  const gefunden = new Set();
  (function lauf(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name), rel = path.relative(ziel, f).split(path.sep).join('/');
      const s = fs.lstatSync(f);
      if (s.isSymbolicLink()) { fehler.push(`Ziel enthält symbolischen Link: ${rel}`); continue; }
      if (s.isDirectory()) { lauf(f); continue; }
      if (!s.isFile()) { fehler.push(`Ziel enthält Sonderdatei: ${rel}`); continue; }
      gefunden.add(rel);
      if (VERBOTEN.some(v => rel.startsWith(v)) || rel.split('/').some(t => t.startsWith('.'))) fehler.push(`Ziel enthält verbotenen Pfad: ${rel}`);
      if (!liste.includes(rel)) fehler.push(`Ziel enthält nicht freigegebene Datei: ${rel}`);
      else if (sha(f) !== sha(path.join(root, rel))) fehler.push(`Inhalt weicht von der Quelle ab: ${rel}`);
    }
  })(ziel);
  for (const p of liste) if (!gefunden.has(p)) fehler.push(`Ziel fehlt freigegebene Datei: ${p}`);
  return fehler;
}

/* nachKopie: nur für Tests – wird zwischen Kopieren und Nachprüfung aufgerufen (z. B. um eine Manipulation zu simulieren). */
export function bauen(root, ziel, { nachKopie } = {}) {
  const r = pruefen(root);
  if (r.fehler.length) return r;
  if (fs.existsSync(ziel)) { r.fehler.push(`Ziel existiert bereits: ${ziel}`); return r; }
  fs.mkdirSync(ziel, { recursive: true });
  for (const p of r.liste) {
    const z = path.join(ziel, p);
    fs.mkdirSync(path.dirname(z), { recursive: true });
    fs.copyFileSync(path.join(root, p), z, fs.constants.COPYFILE_EXCL);
  }
  if (nachKopie) nachKopie(ziel);
  r.fehler.push(...pruefeZiel(root, ziel, r.liste));
  return r;
}

function main(argv) {
  const args = argv.slice(2);
  let root = process.cwd();
  const i = args.indexOf('--root');
  if (i >= 0) { root = path.resolve(args[i + 1] || ''); args.splice(i, 2); }
  const [befehl, ziel] = args;
  const raus = (r, ok) => {
    for (const h of r.hinweise || []) console.log('Hinweis: ' + h);
    for (const f of r.fehler) console.error('FEHLER: ' + f);
    console.log(r.fehler.length ? `Positivliste: ${r.fehler.length} Fehler – Veröffentlichung gesperrt.` : ok);
    return r.fehler.length ? 1 : 0;
  };
  try {
    if (befehl === 'pruefen') { const r = pruefen(root); return raus(r, `Positivliste in Ordnung: ${r.liste.length} Dateien freigegeben.`); }
    if (befehl === 'bauen' && ziel) { const r = bauen(root, path.resolve(root, ziel)); return raus(r, `Veröffentlichungsverzeichnis gebaut und geprüft: ${r.liste.length} Dateien.`); }
    if (befehl === 'pruefe-ziel' && ziel) { const { liste, fehler } = leseListe(root); const f = fehler.concat(pruefeZiel(root, path.resolve(root, ziel), liste)); return raus({ fehler: f }, `Veröffentlichungsverzeichnis in Ordnung: ${liste.length} Dateien.`); }
    if (befehl === 'vorschlag') { const { soll, fehler } = benoetigt(root); if (fehler.length) return raus({ fehler }, ''); console.log([...soll.keys()].sort().join('\n')); return 0; }
  } catch (e) { console.error('FEHLER: ' + e.message); return 1; }
  console.error('Aufruf: node tools/pages/site.mjs pruefen | bauen <ziel> | pruefe-ziel <ziel> | vorschlag [--root <pfad>]');
  return 2;
}

if (import.meta.url === new URL('file://' + path.resolve(process.argv[1] || '')).href) process.exitCode = main(process.argv);

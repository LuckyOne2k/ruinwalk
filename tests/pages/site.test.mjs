/* Tests für die Pages-Positivliste (tools/pages/site.mjs). Aufruf: node --test tests/pages/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pruefen, bauen, pruefeZiel, pfadFehler, leseListe } from '../../tools/pages/site.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '../..');
const SKRIPT = path.join(REPO, 'tools/pages/site.mjs');

/* Kleines Beispiel-Repository mit allen Ladewegen des Spiels */
function fixture(anpassen) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-pages-'));
  const w = (rel, inhalt) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), inhalt); };
  w('index.html', `<html><body style="background:url(assets/bg.jpg)"><img src="assets/logo.png">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="sprites.js?v=1"></script><script src="figs/manifest.js?v=1"></script><script src="items/manifest.js?v=1"></script><script src="pxdom.js?v=1"></script>
<script>
const FX={
  gift:{n:'Gift',d:'x',g:0},
  schutz:{n:'Schutz',d:'y',g:1}
};
const chip=x=>'<i style="background-image:url(status/'+x.id+'.png)"></i>';
</script></body></html>`);
  w('landingpage.html', '<a href="index.html">Spiel</a><div style="background:url(\'assets/bg.jpg\')"></div>');
  w('sprites.js', 'const PX_SPR={};');
  w('pxdom.js', "const PX_LAY={held:'w'};\nconst u=n=>'items/'+n+'.png';const f=n=>'figs/'+n+'.png';const l=n=>'figs/lay/'+n+'.png';");
  w('figs/manifest.js', "const PX_PNG=['held'];");
  w('items/manifest.js', "const PX_ITEMS=['axt'];");
  for (const p of ['figs/held.png', 'figs/held_base.png', 'figs/lay/held_w_1.png', 'items/axt.png', 'status/gift.png', 'status/schutz.png', 'assets/logo.png', 'assets/bg.jpg']) w(p, 'PNG');
  w('docs/geheim.md', 'intern'); w('.claude/settings.json', '{}'); w('tools/pages/x.txt', 'x');
  const liste = ['index.html', 'landingpage.html', 'sprites.js', 'pxdom.js', 'figs/manifest.js', 'items/manifest.js', 'figs/held.png', 'figs/held_base.png', 'figs/lay/held_w_1.png', 'items/axt.png', 'status/gift.png', 'status/schutz.png', 'assets/logo.png', 'assets/bg.jpg'];
  const ctx = { root, w, liste };
  if (anpassen) anpassen(ctx);
  w('tools/pages/allowlist.txt', '# Kommentar\n' + ctx.liste.join('\n') + '\n');
  return root;
}
const fehlerVon = root => pruefen(root).fehler.join('\n');

test('erlaubte Dateien: gültige Liste wird angenommen und genau so gebaut', () => {
  const root = fixture();
  assert.deepEqual(pruefen(root).fehler, []);
  const ziel = path.join(root, '_site');
  const r = bauen(root, ziel);
  assert.deepEqual(r.fehler, []);
  const gebaut = execFileSync('find', ['.', '-type', 'f'], { cwd: ziel }).toString().trim().split('\n').map(s => s.slice(2)).sort();
  assert.deepEqual(gebaut, [...r.liste].sort());
  assert.ok(!fs.existsSync(path.join(ziel, 'docs')) && !fs.existsSync(path.join(ziel, '.claude')) && !fs.existsSync(path.join(ziel, 'tools')));
});

test('verbotene Dateien in der Liste werden abgelehnt (.claude, docs, marketing, server, supabase, tests, tools)', () => {
  for (const p of ['.claude/settings.json', 'docs/geheim.md', 'marketing/x.md', 'server/x.mjs', 'supabase/schema.sql', 'tests/x.js', 'tools/pages/x.txt', 'kunst/a.png', 'CLAUDE.md', 'package.json']) {
    const root = fixture(c => c.liste.push(p));
    assert.match(fehlerVon(root), /verbotener Bereich|nicht freigebbar|nicht erlaubt|versteckte/, p);
  }
});

test('problematische Pfade werden abgelehnt', () => {
  for (const p of ['/etc/passwd', '../geheim.png', 'figs/../docs/geheim.md', 'figs//held.png', './index.html', 'figs\\held.png', 'figs/.hidden.png', 'figs/held.png ', 'figs/HELD.PNG', 'assets/x.svg', 'items/a.png\u0000']) {
    assert.ok(pfadFehler(p), `nicht abgelehnt: ${JSON.stringify(p)}`);
  }
  const root = fixture(c => c.liste.push('figs/../docs/geheim.md'));
  assert.match(fehlerVon(root), /ungültiges Pfadsegment/);
});

test('doppelte Einträge werden abgelehnt', () => {
  const root = fixture(c => c.liste.push('items/axt.png'));
  assert.match(fehlerVon(root), /doppelt/);
});

test('fehlende Pflichtdatei: im Manifest genannt, aber nicht in der Liste', () => {
  const root = fixture(c => { c.w('items/manifest.js', "const PX_ITEMS=['axt','schwert'];"); c.w('items/schwert.png', 'PNG'); });
  assert.match(fehlerVon(root), /Pflichtdatei fehlt in der Positivliste: „items\/schwert\.png“/);
});

test('fehlende Pflichtdatei: in der Liste, aber nicht im Repository', () => {
  const root = fixture(c => { c.w('items/manifest.js', "const PX_ITEMS=['axt','schwert'];"); c.liste.push('items/schwert.png'); });
  assert.match(fehlerVon(root), /„items\/schwert\.png“: Datei fehlt/);
});

test('fehlende Pflichtdatei: Status-Symbol aus FX und Verweis aus HTML', () => {
  const r1 = fixture(c => { c.liste = c.liste.filter(p => p !== 'status/schutz.png'); });
  assert.match(fehlerVon(r1), /Pflichtdatei fehlt in der Positivliste: „status\/schutz\.png“/);
  const r2 = fixture(c => { c.liste = c.liste.filter(p => p !== 'assets/logo.png'); });
  assert.match(fehlerVon(r2), /Pflichtdatei fehlt in der Positivliste: „assets\/logo\.png“/);
});

test('neu hinzugekommene Datei wird nicht automatisch veröffentlicht', () => {
  const root = fixture(c => { c.w('figs/neu.png', 'PNG'); c.w('assets/entwurf.jpg', 'JPG'); });
  const r = pruefen(root);
  assert.deepEqual(r.fehler, []);
  assert.ok(r.hinweise.some(h => h.includes('figs/neu.png')) && r.hinweise.some(h => h.includes('assets/entwurf.jpg')));
  const ziel = path.join(root, '_site');
  assert.deepEqual(bauen(root, ziel).fehler, []);
  assert.ok(!fs.existsSync(path.join(ziel, 'figs/neu.png')) && !fs.existsSync(path.join(ziel, 'assets/entwurf.jpg')));
});

test('freigegeben, aber vom Spiel nicht geladen → Fehler (Liste bleibt minimal)', () => {
  const root = fixture(c => { c.w('figs/alt.png', 'PNG'); c.liste.push('figs/alt.png'); });
  assert.match(fehlerVon(root), /„figs\/alt\.png“ ist freigegeben, wird vom Spiel aber nicht geladen/);
});

test('symbolische Links werden abgelehnt (Datei und Ordner)', () => {
  const r1 = fixture(c => { fs.rmSync(path.join(c.root, 'items/axt.png')); fs.symlinkSync(path.join(c.root, 'docs/geheim.md'), path.join(c.root, 'items/axt.png')); });
  assert.match(fehlerVon(r1), /„items\/axt\.png“: symbolischer Link/);
  const r2 = fixture(c => { fs.rmSync(path.join(c.root, 'status'), { recursive: true }); fs.mkdirSync(path.join(c.root, 'echt')); fs.writeFileSync(path.join(c.root, 'echt/gift.png'), 'P'); fs.writeFileSync(path.join(c.root, 'echt/schutz.png'), 'P'); fs.symlinkSync(path.join(c.root, 'echt'), path.join(c.root, 'status')); });
  assert.match(fehlerVon(r2), /Ordner ist symbolischer Link/);
});

test('unbekannter dynamischer Ladepfad im Spielcode bricht ab', () => {
  const root = fixture(c => c.w('sprites.js', "const PX_SPR={};const b=n=>'assets/'+n+'.png';"));
  assert.match(fehlerVon(root), /unbekannter dynamischer Ladepfad „assets\/…/);
});

test('Ziel wird geprüft: zusätzliche, fehlende, veränderte Dateien und Symlinks', () => {
  const root = fixture();
  const ziel = path.join(root, '_site');
  assert.deepEqual(bauen(root, ziel).fehler, []);
  const { liste } = leseListe(root);
  fs.mkdirSync(path.join(ziel, 'docs')); fs.writeFileSync(path.join(ziel, 'docs/geheim.md'), 'x');
  fs.writeFileSync(path.join(ziel, '.env'), 'x');
  fs.rmSync(path.join(ziel, 'status/gift.png'));
  fs.writeFileSync(path.join(ziel, 'items/axt.png'), 'verändert');
  fs.symlinkSync('/etc/hostname', path.join(ziel, 'assets/link.png'));
  const f = pruefeZiel(root, ziel, liste).join('\n');
  for (const m of [/nicht freigegebene Datei: docs\/geheim\.md/, /verbotenen Pfad: docs\/geheim\.md/, /\.env/, /fehlt freigegebene Datei: status\/gift\.png/, /Inhalt weicht.*items\/axt\.png/, /symbolischen Link: assets\/link\.png/]) assert.match(f, m);
});

test('bestehendes Ziel wird nicht überschrieben', () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, '_site'));
  assert.match(bauen(root, path.join(root, '_site')).fehler.join('\n'), /Ziel existiert bereits/);
});

test('Bau prüft das fertige Ziel nach dem Kopieren erneut', () => {
  const root = fixture();
  const r = bauen(root, path.join(root, '_site'), { nachKopie: z => fs.writeFileSync(path.join(z, 'CLAUDE.md'), 'eingeschleust') });
  assert.match(r.fehler.join('\n'), /nicht freigegebene Datei: CLAUDE\.md/);
});

test('ausdrückliche Verbotsliste greift unabhängig von den Bereichsregeln', () => {
  for (const p of ['.claude/a.png', 'docs/a.png', 'marketing/a.png', 'server/a.png', 'supabase/a.png', 'tests/a.png', 'tools/a.png', 'kunst/a.png', '.github/a.png'])
    assert.match(pfadFehler(p) || '', /verbotener Bereich|versteckte/, p);
  for (const p of ['docs/a.png', 'marketing/a.png', 'server/a.png', 'supabase/a.png', 'tests/a.png', 'tools/a.png', 'kunst/a.png'])
    assert.equal(pfadFehler(p), 'verbotener Bereich', p);
});

test('Befehlszeile: Exit-Code 1 bei Fehlern, 0 bei Erfolg, 2 bei falschem Aufruf', () => {
  const ok = fixture();
  assert.equal(spawnSync('node', [SKRIPT, 'pruefen', '--root', ok]).status, 0);
  const schlecht = fixture(c => c.liste.push('docs/geheim.md'));
  assert.equal(spawnSync('node', [SKRIPT, 'pruefen', '--root', schlecht]).status, 1);
  assert.equal(spawnSync('node', [SKRIPT, 'bauen', path.join(schlecht, '_site'), '--root', schlecht]).status, 1);
  assert.ok(!fs.existsSync(path.join(schlecht, '_site')), 'bei Fehlern wird nichts gebaut');
  assert.equal(spawnSync('node', [SKRIPT, 'unbekannt']).status, 2);
});

test('echtes Repository: Liste gültig, Bau enthält nur Spieldateien', () => {
  const r = pruefen(REPO);
  assert.deepEqual(r.fehler, []);
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-site-')) + '/site';
  const b = bauen(REPO, ziel);
  assert.deepEqual(b.fehler, []);
  const gebaut = execFileSync('find', ['.', '-type', 'f'], { cwd: ziel }).toString().trim().split('\n').map(s => s.slice(2));
  assert.equal(gebaut.length, b.liste.length);
  for (const v of ['.claude/', 'docs/', 'marketing/', 'server/', 'supabase/', 'tests/', 'tools/', '.github/', 'kunst/'])
    assert.ok(!gebaut.some(p => p.startsWith(v)), `verbotener Bereich im Bau: ${v}`);
  for (const p of ['index.html', 'landingpage.html', 'pxdom.js', 'figs/manifest.js', 'items/manifest.js']) assert.ok(gebaut.includes(p), p);
  assert.ok(!gebaut.some(p => /^[^/]+\.(md|json|sql|txt|yml|mjs)$/.test(p)), 'keine Projektdateien in der Wurzel');
});

test('Workflow: Prüfung und Bau vor dem Hochladen, nur _site wird veröffentlicht, kein Weiterlaufen bei Fehlern', () => {
  const wf = fs.readFileSync(path.join(REPO, '.github/workflows/pages.yml'), 'utf8');
  const pos = s => { const i = wf.indexOf(s); assert.ok(i >= 0, `fehlt im Workflow: ${s}`); return i; };
  const tests = pos('node --test tests/pages/site.test.mjs'), bau = pos('node tools/pages/site.mjs bauen _site');
  const upload = pos('actions/upload-pages-artifact@'), deploy = pos('actions/deploy-pages@');
  assert.ok(tests < bau && bau < upload && upload < deploy, 'Reihenfolge: Tests → Bau → Hochladen → Veröffentlichen');
  assert.match(wf.slice(upload, deploy), /path:\s*['"]?_site['"]?/);
  assert.doesNotMatch(wf, /path:\s*['"]?\.['"]?\s*$/m, 'kein path: . mehr');
  assert.doesNotMatch(wf, /continue-on-error/);
  assert.doesNotMatch(wf, /if:\s*always\(\)/);
});

test('PR-CI: Positivliste wird über den Baustein spieltests.yml in instance-tests geprüft, Pfadfilter lösen bei relevanten Änderungen aus', () => {
  const wf = fs.readFileSync(path.join(REPO, '.github/workflows/instance-tests.yml'), 'utf8');
  assert.match(wf, /\n  spieltests:\n(?:.*\n)*?\s+uses: \.\/\.github\/workflows\/spieltests\.yml/, 'Job spieltests fehlt');
  const job = fs.readFileSync(path.join(REPO, '.github/workflows/spieltests.yml'), 'utf8');
  assert.match(job, /node --test tests\/pages\/site\.test\.mjs/);
  assert.match(job, /node tools\/pages\/site\.mjs pruefen/);
  assert.doesNotMatch(job, /continue-on-error|if:\s*always\(\)/);
  const filter = wf.slice(wf.indexOf('push:'), wf.indexOf('pull_request:'));
  for (const p of ['tools/pages/**', 'tests/pages/**', '.github/workflows/pages.yml', 'landingpage.html', 'figs/**', 'items/**', 'status/**', 'assets/**'])
    assert.ok(filter.includes(`'${p}'`), `Pfadfilter fehlt: ${p}`);
  assert.match(wf, /\n  pull_request:\n(?!\s+paths)/, 'Pull Requests müssen ohne Pfadfilter laufen');
});

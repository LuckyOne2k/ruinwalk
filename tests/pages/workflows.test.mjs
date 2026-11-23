/* Regeln für die CI-Workflows: Pages veröffentlicht nur nach grünen Spieltests (auch beim manuellen Start), Rechte je Job minimal.
   Aufruf: node --test tests/pages/workflows.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lies = f => fs.readFileSync(path.join(REPO, '.github/workflows', f), 'utf8');
/* Abschnitte einer Ebene: Schlüssel mit genau `ind` Leerzeichen Einzug -> Text bis zum nächsten Schlüssel derselben Ebene */
function bloecke(text, ind) {
  const re = new RegExp(`^ {${ind}}([A-Za-z0-9_-]+):`, 'gm'), out = {}; let m, last = null;
  while ((m = re.exec(text))) { if (last) out[last.k] = text.slice(last.i, m.index); last = { k: m[1], i: m.index }; }
  if (last) out[last.k] = text.slice(last.i); return out;
}
const jobs = wf => bloecke(wf.slice(wf.indexOf('\njobs:\n') + 7), 2);
const top = wf => bloecke(wf.slice(0, wf.indexOf('\njobs:\n') + 1), 0);
const MAIN_IF = "github.ref == 'refs/heads/main'";

/* Nachbildung der GitHub-Regeln für die beiden Jobs von pages.yml (Semantik laut GitHub-Doku):
   - ein Job mit needs läuft nur, wenn die Bedingung wahr ist; enthält die Bedingung keine Statusfunktion, gilt zusätzlich success()
     (alle needs erfolgreich);
   - ohne if gilt nur success().
   Ausgewertet wird ausschließlich die im Workflow stehende Bedingung; andere Ausdrücke lehnt der Test ab, statt sie zu raten. */
function deployLaeuft(wf, { ref, event, spieltests }) {
  const j = jobs(wf), t = top(wf);
  if (!new RegExp(`^ {2}${event}:`, 'm').test(t.on)) return false;                       // Ereignis startet den Workflow nicht
  if (event === 'push' && ref !== 'refs/heads/main') return false;                        // push nur auf branches: ["main"]
  const needs = (j.deploy.match(/^ {4}needs: (.*)$/m) || [])[1];
  const cond = (j.deploy.match(/^ {4}if: (.*)$/m) || [])[1];
  const success = needs === 'spieltests' ? spieltests === 'success' : true;
  if (cond === undefined) return success;
  if (cond.trim() !== MAIN_IF) throw new Error(`unbekannte Bedingung am deploy-Job: ${cond}`);
  return success && ref === 'refs/heads/main';
}

test('pages.yml: deploy hängt immer von den Spieltests ab, keine Umgehung', () => {
  const wf = lies('pages.yml'), j = jobs(wf), t = top(wf);
  assert.deepEqual(Object.keys(j), ['spieltests', 'deploy'], 'genau zwei Jobs: spieltests und deploy');
  assert.match(j.spieltests, /^\s+uses: \.\/\.github\/workflows\/spieltests\.yml\s*$/m);
  assert.match(j.deploy, /^ {4}needs: (spieltests|\[\s*spieltests\s*\])\s*$/m, 'deploy braucht spieltests');
  const ifs = [...j.deploy.matchAll(/^ {4}if: (.*)$/gm)].map(m => m[1].trim());
  assert.deepEqual(ifs, [MAIN_IF], 'deploy hat genau die Zweig-Bedingung (ohne always()/!cancelled(), damit success() gilt)');
  assert.doesNotMatch(wf, /continue-on-error|always\(\)|failure\(\)|cancelled\(\)/);
  assert.match(t.on, /^ {2}push:\n {4}branches: \["main"\]/m);
  assert.match(t.on, /^ {2}workflow_dispatch:/m, 'manueller Start bleibt möglich – läuft aber ebenfalls über spieltests');
});

test('pages.yml: Rechte je Job minimal, nur deploy darf veröffentlichen', () => {
  const wf = lies('pages.yml'), j = jobs(wf), t = top(wf);
  assert.match(t.permissions, /^permissions: \{\}\s*$/m, 'keine globalen Rechte');
  assert.match(j.spieltests, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(j.spieltests, /pages: write|id-token: write|contents: write/);
  for (const r of ['contents: read', 'pages: write', 'id-token: write']) assert.ok(j.deploy.includes(r), `deploy braucht ${r}`);
  assert.doesNotMatch(j.deploy, /contents: write/);
});

test('spieltests.yml: nur als Baustein aufrufbar, nur Leserechte, Browser-Tests und Positivliste ohne Fehlerunterdrückung', () => {
  const wf = lies('spieltests.yml'), j = jobs(wf), t = top(wf);
  assert.match(t.on, /^ {2}workflow_call:/m);
  assert.doesNotMatch(t.on, /push:|pull_request:|workflow_dispatch:/, 'läuft nie allein');
  assert.match(t.permissions, /^ {2}contents: read\s*$/m);
  assert.doesNotMatch(wf, /write|continue-on-error|always\(\)|^\s+if:/m);
  assert.match(j.browser, /^\s+run: npm test\s*$/m, 'npm test als ganze Zeile (kein || true)');
  assert.match(j.positivliste, /node --test tests\/pages\/site\.test\.mjs tests\/pages\/workflows\.test\.mjs/);
  assert.match(j.positivliste, /^\s+run: node tools\/pages\/site\.mjs pruefen\s*$/m);
});

test('instance-tests.yml: nutzt denselben Spieltest-Baustein, Pfadfilter enthält ihn, PRs ohne Filter', () => {
  const wf = lies('instance-tests.yml'), j = jobs(wf);
  assert.match(j.spieltests, /uses: \.\/\.github\/workflows\/spieltests\.yml/);
  assert.match(j.spieltests, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(j['bestehende-tests'], /npm test/, 'Browser-Tests nur einmal (im Baustein)');
  // Pflichtprüfungen im Ruleset (protect-main): Namen bleiben; beide hängen an spieltests und werden nur bei Erfolg grün
  for (const n of ['pages-positivliste', 'bestehende-tests']) {
    assert.ok(j[n], `Pflichtjob ${n} fehlt`);
    assert.match(j[n], /^ {4}needs: spieltests\s*$/m, `${n} braucht spieltests`);
    assert.match(j[n], /ERGEBNIS: \$\{\{ needs\.spieltests\.result \}\}/, `${n} prüft das Ergebnis von spieltests`);
    assert.match(j[n], /^\s+\[ "\$ERGEBNIS" = "success" \]\s*$/m, `${n} schlägt fehl, wenn spieltests nicht erfolgreich war`);
    assert.doesNotMatch(j[n], /always\(\)|continue-on-error/);
  }
  for (const n of ['determinism', 'database']) assert.ok(j[n], `Pflichtjob ${n} fehlt`);
  assert.match(j['bestehende-tests'], /bash supabase\/tests\/run\.sh/);
  const filter = wf.slice(wf.indexOf('push:'), wf.indexOf('pull_request:'));
  for (const p of ['index.html', 'tests/**', '.github/workflows/spieltests.yml', '.github/workflows/pages.yml']) assert.ok(filter.includes(`'${p}'`), `Pfadfilter fehlt: ${p}`);
  assert.match(wf, /\n  pull_request:\n(?!\s+paths)/);
});

test('pages.yml: Zweig-Schutz – erfolgreicher manueller Lauf auf einem anderen Zweig deployt nicht, auf main schon', () => {
  const wf = lies('pages.yml');
  const fall = (ref, event, spieltests) => deployLaeuft(wf, { ref, event, spieltests });
  assert.equal(fall('refs/heads/quest/paket1-client-grundlage', 'workflow_dispatch', 'success'), false, 'manuell, anderer Zweig, Tests grün → kein Deployment');
  assert.equal(fall('refs/heads/main', 'workflow_dispatch', 'success'), true, 'manuell auf main, Tests grün → Deployment');
  assert.equal(fall('refs/heads/main', 'workflow_dispatch', 'failure'), false, 'manuell auf main, Tests rot → kein Deployment');
  assert.equal(fall('refs/heads/main', 'push', 'success'), true, 'Push auf main, Tests grün → Deployment');
  assert.equal(fall('refs/heads/main', 'push', 'failure'), false, 'Push auf main, Tests rot → kein Deployment');
  assert.equal(fall('refs/heads/feature', 'push', 'success'), false, 'Push auf anderen Zweig startet pages.yml nicht');
  assert.equal(fall('refs/tags/v1', 'workflow_dispatch', 'success'), false, 'manuell auf einem Tag → kein Deployment');
  // Gegenprobe: ohne Zweig-Bedingung würde der manuelle Lauf auf einem anderen Zweig deployen (der Test erkennt das)
  const ohne = wf.replace(/^ {4}if: .*\n/m, '');
  assert.equal(deployLaeuft(ohne, { ref: 'refs/heads/quest/x', event: 'workflow_dispatch', spieltests: 'success' }), true);
  // Die Spieltests selbst haben keine Zweig-Bedingung: sie laufen auch auf anderen Zweigen
  assert.doesNotMatch(jobs(wf).spieltests, /^ {4}if:/m);
});

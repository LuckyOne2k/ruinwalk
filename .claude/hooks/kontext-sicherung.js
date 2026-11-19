#!/usr/bin/env node
/* Ruin Walk – Kontextsicherung beim Komprimieren.
   Aufruf: node kontext-sicherung.js vorher   (PreCompact: schreibt einen Schnappschuss und gibt der Zusammenfassung Anweisungen mit; stdout ≤ 10.000 Zeichen)
           node kontext-sicherung.js nachher  (SessionStart/compact: lädt Übergabe + Schnappschuss als additionalContext wieder ein)
   Blockiert nie. Liest nur git und Dateien; schreibt nur .claude/arbeitsstand/schnappschuss.md (nicht eingecheckt). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const modus = process.argv[2];
let inp = {}; try { inp = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
const ROOT = process.env.CLAUDE_PROJECT_DIR || inp.cwd || process.cwd();
const git = (a, cwd = ROOT) => { try { return cp.execSync('git ' + a, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const UEBERGABE = path.join(ROOT, 'docs/ki-team/ARBEITSSTAND.md'), DIR = path.join(ROOT, '.claude/arbeitsstand'), SNAP = path.join(DIR, 'schnappschuss.md');
const lies = (f, max) => { try { const t = fs.readFileSync(f, 'utf8'); return t.length > max ? t.slice(0, max) + '\n…(gekürzt)' : t; } catch { return ''; } };

function schnappschuss() {
  const z = [`# Automatischer Schnappschuss vor dem Komprimieren (${new Date().toISOString()}, Auslöser: ${inp.trigger || '?'})`, ''];
  for (const block of git('worktree list --porcelain').split('\n\n')) {
    const wt = (block.match(/^worktree (.+)$/m) || [])[1]; if (!wt) continue;
    const br = ((block.match(/^branch (.+)$/m) || [])[1] || 'losgelöst').replace('refs/heads/', '');
    const st = git('status --porcelain', wt).split('\n').filter(Boolean);
    z.push(`## Worktree ${wt} – Zweig ${br} @ ${git('rev-parse --short HEAD', wt)}`, `Letzte Commits:`, ...git('log --oneline -3', wt).split('\n').map((l) => '- ' + l),
      `Nicht committet (${st.length}):`, ...st.slice(0, 25).map((l) => '- ' + l), '');
  }
  return z.join('\n');
}

if (modus === 'vorher') {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(SNAP, schnappschuss()); } catch {}
  // stdout = Anweisung für die Zusammenfassung (laut Claude-Code-Doku), höchstens 10.000 Zeichen
  const anweisung = [
    'Beim Zusammenfassen unbedingt erhalten: laufender Auftrag und sein genauer Schritt, offene Entscheidungen für Pascal, Freigaben/Verbote,',
    'Arbeitsordner und Zweige (alle Worktrees, besonders solche mit nicht committeten Änderungen – siehe ARBEITSSTAND.md), Testergebnisse mit Zahlen,',
    'Hashes, Hintergrundaufgaben, die noch laufen. Nach dem Komprimieren werden docs/ki-team/ARBEITSSTAND.md und .claude/arbeitsstand/schnappschuss.md automatisch nachgeladen.',
    '', 'Aktuelle Übergabe (Auszug):', lies(UEBERGABE, 7000)].join('\n');
  process.stdout.write(anweisung.slice(0, 9800));
} else if (modus === 'nachher') {
  const ctx = ['Kontext wurde komprimiert. Übergabe und automatischer Schnappschuss (vor dem Komprimieren):', '', lies(UEBERGABE, 12000), '', lies(SNAP, 6000)].join('\n');
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }));
}

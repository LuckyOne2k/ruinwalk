#!/usr/bin/env node
/* Ruin Walk – PostToolUse-Hinweise nach Datei-Änderungen: erinnert an die passenden Tests und Schutzregeln.
   Blockiert nie, fügt nur Kontext für Claude hinzu. */
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let inp; try { inp = JSON.parse(raw); } catch { return; }
  const f = String((inp.tool_input || {}).file_path || '').replace(/\\/g, '/');
  const t = [];
  if (/\/server\/instance\//.test(f)) t.push('Instanzkampf-Datei geändert: Prüfliste im Skill ruinwalk-instanzkampf beachten (eingefrorene Architektur!), danach alle Instanzkampf-Suites inkl. Determinismus laufen lassen; neue rwi-Funktionen in sql/05_produktion.sql einordnen.');
  if (/\/supabase\/.*\.sql$/.test(f)) t.push('Supabase-SQL geändert: Ablauf ruinwalk-db-aenderung (Migration + Rollback + schema.sql + Tests in beiden Rechte-Modi: bash supabase/tests/run.sh). Nichts live einspielen ohne Freigabe.');
  if (/\/index\.html$/.test(f)) t.push('index.html geändert: npm test laufen lassen (CI prüft index.html-Änderungen nicht automatisch, pages.yml deployt main ohne Tests). Bei UI/CSS zusätzlich die Mobile-Prüfung (ruinwalk-mobile-check).');
  if (/\/marketing\/freigabe\//.test(f)) t.push('Marketing-Freigabedatei geändert: status „freigegeben“ darf nur mit ausdrücklicher Freigabe von Pascal gesetzt werden.');
  if (/\/\.claude\/(skills|agents)\//.test(f)) t.push('KI-Team-Datei geändert: Frontmatter prüfen (node .claude/tests/team-check.js) und docs/ki-team/UEBERSICHT.md aktuell halten.');
  if (t.length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: t.join(' ') } }));
});

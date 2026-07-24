#!/usr/bin/env node
/**
 * check-claude-md.mjs — instruction-file health gate.
 *
 * Root CLAUDE.md reached 2,256 lines one reasonable-seeming addition at a time. This script is
 * what converts "keep it small and accurate" from an intention into a property of the repo.
 *
 * Checks:
 *   1. COMPLETENESS   every pre-refactor section has a destination; every destination exists;
 *                     every deletion carries a reason. This is the "we lost nothing" evidence.
 *   2. BUDGET         root CLAUDE.md stays under its committed line/byte ceiling.
 *   3. REFERENCES     every markdown link + backticked path in every instruction file resolves.
 *   4. ROUTING        every CLAUDE.md on disk appears in root's routing table.
 *   5. RULES          every .claude/rules/*.md has valid frontmatter and live globs.
 *   6. GUIDES         every guide on disk is indexed in guides/README.md.
 *
 * Usage:  node .github/scripts/check-claude-md.mjs [--root <dir>] [--quiet]
 * Exit:   0 = all checks pass, 1 = at least one failure.
 */

import { readFileSync, existsSync, globSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--root');
const ROOT =
  rootFlag !== -1 && argv[rootFlag + 1]
    ? resolve(argv[rootFlag + 1])
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUIET = argv.includes('--quiet');

const failures = [];
const notes = [];
const fail = (check, msg) => failures.push({ check, msg });
const log = (s) => { if (!QUIET) console.log(s); };

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p) => existsSync(join(ROOT, p));

/** All CLAUDE.md files in the repo, excluding build output and dependencies. */
function findClaudeMds() {
  return globSync('**/CLAUDE.md', {
    cwd: ROOT,
    exclude: (p) => p.includes('node_modules') || p.includes(`${'dist'}/`) || p.includes('.claude/worktrees'),
  }).filter((p) => !p.includes('node_modules') && !p.split('/').includes('dist'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. COMPLETENESS — the "nothing was lost" guarantee
// ─────────────────────────────────────────────────────────────────────────────
const MANIFEST_PATH = '.claude/claude-md-manifest.json';
let manifest = null;

if (!exists(MANIFEST_PATH)) {
  fail('completeness', `${MANIFEST_PATH} is missing — the refactor's evidence file.`);
} else {
  try {
    manifest = JSON.parse(read(MANIFEST_PATH));
  } catch (e) {
    fail('completeness', `${MANIFEST_PATH} is not valid JSON: ${e.message}`);
  }
}

if (manifest) {
  const sections = manifest.sections ?? [];
  if (sections.length === 0) fail('completeness', 'manifest has no sections');

  for (const s of sections) {
    const where = `section "${s.title}"`;
    const dests = s.destinations ?? [];
    if (dests.length === 0) {
      fail('completeness', `${where} has no destinations — every section must be accounted for.`);
      continue;
    }
    for (const d of dests) {
      if (d === 'root') {
        if (!exists('CLAUDE.md')) fail('completeness', `${where} -> root, but CLAUDE.md is missing`);
      } else if (d === 'deleted') {
        if (!s.reason || !s.reason.trim()) {
          fail('completeness', `${where} is marked deleted with no reason. A deletion without a stated reason is indistinguishable from content that was simply lost.`);
        }
      } else {
        const m = d.match(/^(rule|nested|guide|skill):(.+)$/);
        if (!m) {
          fail('completeness', `${where} has unrecognized destination "${d}"`);
          continue;
        }
        const [, kind, target] = m;
        const path = kind === 'skill' ? `.claude/skills/${target}/SKILL.md` : target;
        if (!exists(path)) fail('completeness', `${where} -> ${d}, but ${path} does not exist`);
      }
    }
  }
  log(`  completeness: ${sections.length} sections accounted for`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BUDGET — prevent regrowth
// ─────────────────────────────────────────────────────────────────────────────
if (exists('CLAUDE.md') && manifest?.budget) {
  const txt = read('CLAUDE.md');
  const lines = txt.split('\n').length;
  const bytes = Buffer.byteLength(txt, 'utf8');
  const { maxLines, maxBytes } = manifest.budget;

  if (maxLines && lines > maxLines) {
    fail('budget', `root CLAUDE.md is ${lines} lines, over the ${maxLines}-line ceiling. Route the new content instead — see "Where new guidance goes" in CLAUDE.md.`);
  }
  if (maxBytes && bytes > maxBytes) {
    fail('budget', `root CLAUDE.md is ${bytes} bytes, over the ${maxBytes}-byte ceiling.`);
  }
  const pct = manifest.baseline?.bytes ? Math.round((1 - bytes / manifest.baseline.bytes) * 100) : null;
  log(`  budget:       ${lines}/${maxLines} lines, ${bytes}/${maxBytes} bytes` + (pct !== null ? ` (${pct}% below the ${manifest.baseline.lines}-line baseline)` : ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REFERENCES — every link and backticked path resolves
// ─────────────────────────────────────────────────────────────────────────────
const instructionFiles = [
  ...findClaudeMds(),
  ...globSync('.claude/rules/*.md', { cwd: ROOT }),
  ...globSync('.claude/skills/*/SKILL.md', { cwd: ROOT }),
  'guides/README.md',
].filter(exists);

let refsChecked = 0;
for (const f of instructionFiles) {
  const txt = read(f);
  const base = dirname(join(ROOT, f));

  // Strip fenced code blocks — examples inside them are illustrative, not real paths.
  const body = txt.replace(/```[\s\S]*?```/g, '');

  // Markdown links to local files
  for (const m of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    let target = m[1].split('#')[0];
    if (!target || /^(https?|mailto):/.test(target)) continue;
    refsChecked++;
    if (!existsSync(resolve(base, target))) {
      fail('references', `${f}: broken link -> ${target}`);
    }
  }
}
log(`  references:   ${refsChecked} links checked across ${instructionFiles.length} instruction files`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROUTING — every CLAUDE.md is discoverable from root
// ─────────────────────────────────────────────────────────────────────────────
if (exists('CLAUDE.md')) {
  const rootTxt = read('CLAUDE.md');
  const nested = findClaudeMds().filter((p) => p !== 'CLAUDE.md');
  for (const p of nested) {
    if (!rootTxt.includes(p)) {
      fail('routing', `${p} is not listed in root CLAUDE.md's routing table — it will only ever load by accident.`);
    }
  }
  log(`  routing:      ${nested.length} nested CLAUDE.md files, all listed`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RULES — frontmatter parses and globs are live
// ─────────────────────────────────────────────────────────────────────────────
const ruleFiles = globSync('.claude/rules/*.md', { cwd: ROOT });
for (const f of ruleFiles) {
  const txt = read(f);
  if (!txt.startsWith('---\n')) {
    notes.push(`${f}: no frontmatter — loads at launch like root CLAUDE.md (unscoped). Intentional?`);
    continue;
  }
  const end = txt.indexOf('\n---\n', 3);
  if (end === -1) { fail('rules', `${f}: frontmatter is not terminated`); continue; }
  const fm = txt.slice(4, end);
  if (!/^paths:/m.test(fm)) {
    notes.push(`${f}: has frontmatter but no paths: — loads at launch (unscoped). Intentional?`);
    continue;
  }
  const globs = [...fm.matchAll(/^\s*-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1].trim());
  if (globs.length === 0) { fail('rules', `${f}: paths: present but no globs parsed`); continue; }
  for (const g of globs) {
    let hits = 0;
    try {
      hits = globSync(g, { cwd: ROOT, exclude: (p) => p.includes('node_modules') }).length;
    } catch (e) {
      fail('rules', `${f}: glob "${g}" is invalid (${e.message})`);
      continue;
    }
    if (hits === 0) {
      fail('rules', `${f}: glob "${g}" matches no files. A typo'd glob fails SILENTLY — the rule simply never loads.`);
    }
  }
}
log(`  rules:        ${ruleFiles.length} path-scoped rules validated`);

// ─────────────────────────────────────────────────────────────────────────────
// 6. GUIDES — every guide is indexed
// ─────────────────────────────────────────────────────────────────────────────
if (exists('guides/README.md')) {
  const idx = read('guides/README.md');
  const guides = globSync('guides/*.md', { cwd: ROOT }).filter((p) => !p.endsWith('README.md'));
  for (const g of guides) {
    const name = g.replace('guides/', '');
    if (!idx.includes(name)) {
      fail('guides', `guides/${name} is not indexed in guides/README.md — root CLAUDE.md points at that index, so an unlisted guide is invisible.`);
    }
  }
  log(`  guides:       ${guides.length} guides, all indexed`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
if (notes.length && !QUIET) {
  console.log('\nNotes (non-failing):');
  for (const n of notes) console.log(`  · ${n}`);
}

if (failures.length === 0) {
  console.log('\n✅ check:claude-md — all checks passed');
  process.exit(0);
}

console.error(`\n❌ check:claude-md — ${failures.length} failure(s)\n`);
const byCheck = {};
for (const f of failures) (byCheck[f.check] ??= []).push(f.msg);
for (const [check, msgs] of Object.entries(byCheck)) {
  console.error(`  [${check}]`);
  for (const m of msgs) console.error(`    · ${m}`);
}
console.error('');
process.exit(1);

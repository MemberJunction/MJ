#!/usr/bin/env node
/**
 * Spec anti-pattern lint (Phase 4 guardrails — tooling-roadmap #4).
 *
 * Scans every `*.test.ts` under the given root for test-theater patterns, so they
 * fail CI instead of surviving to a human review. Two rule sets:
 *
 * DOM specs (`*.dom.test.ts`) — the Phase-3 review rules, unchanged:
 *   - Vacuous assertions: `expect(true)…`, `expect(x || true)…` — cannot fail, prove nothing.
 *   - Disabled tests: `it.skip` / `describe.skip` / `xit(` / `xdescribe(` — DOM specs are
 *     either real or deleted/deferred via the register; a skipped spec reads as coverage.
 *   - Blanket schemas: `NO_ERRORS_SCHEMA` / `CUSTOM_ELEMENTS_SCHEMA` — silence unknown-element
 *     errors wholesale, so a renamed child selector passes unnoticed. Stub the child instead.
 *   - Weak typing: `as any` / `: any` / `<any>` — banned repo-wide (CLAUDE.md); `as never` —
 *     erases all type-checking of the double (use `satisfies Pick<…>` + a seam cast).
 *
 * Node specs (every other `*.test.ts`) — the same spirit, tuned for plain vitest specs:
 *   - Vacuous assertions: `expect(true)…`, `expect(1).toBe(1)`, `expect(x || true)…`.
 *   - Disabled tests WITHOUT an adjacent `// KNOWN LIMITATION` comment (same line or the
 *     3 lines above) — a documented deferral is fine; a bare skip reads as coverage.
 *     (`it.skipIf(cond)` is conditional execution, not a disabled test — it never matches.)
 *   - Weak typing: `as any` — banned repo-wide (CLAUDE.md).
 *
 * Line comments are stripped before matching so prose ABOUT an anti-pattern doesn't trip it.
 *
 * Exit codes: 0 = clean, 1 = findings. Self-test:
 *   npx vitest run --config .github/scripts/vitest.config.mts
 */
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Temporary per-file grace for PRE-EXISTING node-spec findings in files that concurrent
 * workstreams own (or that predate the node rule set). Entries are repo-relative paths
 * with forward slashes. DOM findings are never allowlisted. Burn this list down — do not
 * add to it for new code.
 */
export const ALLOWLIST = new Set([
  // TODO(next-pass): files owned by concurrent workstreams at gate introduction — their
  // owners burn these down; do not edit them from this lint's PR.
  'packages/AI/Agents/src/__tests__/parallel-subagents.test.ts',
  'packages/AI/Agents/src/__tests__/bridge-room-transcript-sink.test.ts',
  'packages/AI/Agents/src/__tests__/pipeline-step-finalization.test.ts',
  'packages/AI/Agents/tests/payload-manager-array-operations.test.ts',
  'packages/Actions/CoreActions/src/__tests__/write-entity-fields.action.test.ts',
  'packages/Actions/CoreActions/src/__tests__/lists-phase1.actions.test.ts',
  'packages/Actions/CoreActions/src/__tests__/lists-phase2.actions.test.ts',
  'packages/Actions/CoreActions/src/__tests__/lists-phase5.actions.test.ts',
  'packages/Actions/CoreActions/src/__tests__/search-entity.action.test.ts',
  'packages/Actions/CoreActions/src/__tests__/resolve-audience.action.test.ts',
  'packages/Actions/CoreActions/src/__tests__/api-rate-limiter.action.test.ts',
  'packages/Actions/CoreActions/src/__tests__/vectorize-entity.action.test.ts',
  'packages/Actions/CoreActions/src/__tests__/execute-code.action.test.ts',
  'packages/CodeGenLib/src/__tests__/integration/pg-view-fallback.integration.test.ts',
  'packages/CodeGenLib/src/__tests__/integration/pg-view-regen.integration.test.ts',
  'packages/CodeGenLib/src/__tests__/integration/pg-view-dependency-capture.integration.test.ts',
  'packages/CodeGenLib/src/__tests__/integration/pg-entity-phased.integration.test.ts',
  'packages/CodeGenLib/src/__tests__/integration/pg-codegen-sprocs.integration.test.ts',
  // TODO(next-pass): pre-existing `as any` corpora too large to retype safely in the
  // gate-introduction PR. Fix by re-typing the doubles (satisfies Pick<…> + seam casts).
  'packages/Angular/Generic/dashboard-viewer/src/lib/dashboard-viewer/dashboard-viewer.component.test.ts',
  'packages/MJStorage/src/__tests__/util.test.ts',
  'packages/AI/Engine/src/__tests__/AIEngine.test.ts',
  'packages/AI/RemoteBrowser/Server/src/__tests__/engine-goal-pause.test.ts',
  'packages/LiveKitRoomServer/src/__tests__/livekit-coordinator-egress.test.ts',
  'packages/LiveKitRoomCore/src/__tests__/livekit-room-controller.test.ts',
  'packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/dashboard-resource.component.test.ts',
]);

export const DOM_RULES = [
  { re: /expect\(\s*true\s*\)/, why: 'vacuous assertion — expect(true) cannot fail' },
  { re: /expect\([^)]*\|\|\s*true\s*\)/, why: 'vacuous assertion — `x || true` is always true' },
  { re: /\b(?:it|describe|test)\.skip\b|\bxit\s*\(|\bxdescribe\s*\(/, why: 'disabled test — fix it or defer via the register, don\'t skip' },
  { re: /\bNO_ERRORS_SCHEMA\b|\bCUSTOM_ELEMENTS_SCHEMA\b/, why: 'blanket schema — stub the child component instead' },
  { re: /\bas\s+any\b|:\s*any\b|<any>/, why: '`any` — banned repo-wide (CLAUDE.md)' },
  { re: /\bas\s+never\b/, why: '`as never` — erases type-checking of the double; use `satisfies Pick<…>` + a seam cast' },
];

export const NODE_RULES = [
  { re: /expect\(\s*true\s*\)/, why: 'vacuous assertion — expect(true) cannot fail' },
  { re: /expect\(\s*1\s*\)\.toBe\(\s*1\s*\)/, why: 'vacuous assertion — expect(1).toBe(1) cannot fail' },
  { re: /expect\([^)]*\|\|\s*true\s*\)/, why: 'vacuous assertion — `x || true` is always true' },
  {
    re: /\b(?:it|describe|test)\.skip\b|\bxit\s*\(|\bxdescribe\s*\(/,
    why: 'disabled test — document it with an adjacent `// KNOWN LIMITATION` comment or fix it',
    needsKnownLimitation: true,
  },
  { re: /\bas\s+any\b/, why: '`as any` — banned repo-wide (CLAUDE.md)' },
];

/** How many raw lines above a skip the `KNOWN LIMITATION` marker may sit. */
const KNOWN_LIMITATION_WINDOW = 3;

export function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.test.ts')) acc.push(p);
  }
  return acc;
}

/** Strip `// …` line comments and (crudely, line-wise) `/* … *​/` block-comment interiors. */
/**
 * Blanks comment bodies AND string-literal contents so a rule only ever matches real code.
 *
 * Comments were stripped from the start, for the reason the tests state: prose describing an
 * anti-pattern must not trip the rule that bans it. String literals need the same treatment and
 * did not get it, so a test TITLE was enough to fail the gate — `it('is false as soon as any
 * count is positive')` matched the `as any` rule inside its own description. Same class of false
 * positive for `: any` and `as never` in any sentence that happens to contain them.
 *
 * `${ ... }` inside a template literal is kept: that is code, and `` `${x as any}` `` is a real
 * violation. Line count and order are preserved, so reported line numbers stay accurate.
 *
 * KNOWN LIMITATION: a template literal legitimately spans lines, so an unpaired backtick carries
 * the "inside a literal" state to the end of the file and can mask findings after it. Single and
 * double quotes get the opposite treatment — see skipQuoted — because those cannot span a line, so
 * an unterminated one is an apostrophe rather than an opening. Erring toward a false NEGATIVE only
 * where the language forces it.
 */
export function stripCommentsAndStrings(lines) {
  let inBlock = false;
  let inTemplate = false;
  return lines.map((line) => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) return out; // rest of line is comment
        inBlock = false;
        i = end + 2;
      } else if (inTemplate) {
        const scan = scanTemplate(line, i);
        out += scan.out;
        i = scan.next;
        inTemplate = scan.stillOpen;
      } else if (line.startsWith('//', i)) {
        return out;
      } else if (line.startsWith('/*', i)) {
        inBlock = true;
        i += 2;
      } else if (line[i] === "'" || line[i] === '"') {
        const close = skipQuoted(line, i + 1, line[i]);
        if (close === -1) {
          // Never closed on this line, so it was not a string literal — an apostrophe in a
          // regex (/don't/) or in an identifier reads this way. Emit it and keep scanning, or
          // one stray quote would blank the rest of the line and hide a real violation.
          out += line[i++];
        } else {
          i = close;
        }
      } else if (line[i] === '`') {
        const scan = scanTemplate(line, i + 1);
        out += scan.out;
        i = scan.next;
        inTemplate = scan.stillOpen;
      } else {
        out += line[i++];
      }
    }
    return out;
  });
}

/**
 * Index just past the closing `quote`, or -1 when it never closes on this line.
 *
 * A backslash escapes the next character, so `'it\'s as any'` is one string, not two. The -1 case
 * matters as much as the success case: a single-quoted or double-quoted literal cannot span a line
 * in practice, so an unterminated quote is an apostrophe in something else — a regex, a word — and
 * treating it as a string opening would blank the remainder of the line and hide any real
 * violation after it. The caller emits the character instead and carries on.
 */
function skipQuoted(line, start, quote) {
  let i = start;
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line[i] === quote) return i + 1;
    i++;
  }
  return -1;
}

/**
 * Walks a template literal from `start`, dropping its literal text but KEEPING the contents of
 * every `${ ... }` — real code lives in there, so `` `${x as any}` `` must still be flagged.
 * `stillOpen` is true when the backtick did not close on this line, so the caller carries the
 * state to the next one.
 */
function scanTemplate(line, start) {
  let i = start;
  let out = '';
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line[i] === '`') return { out, next: i + 1, stillOpen: false };
    if (line[i] === '$' && line[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < line.length) {
        const c = line[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        out += c;
        i++;
      }
      continue;
    }
    i++;
  }
  return { out, next: i, stillOpen: true };
}

/** Is a `KNOWN LIMITATION` marker on the raw line itself or within the window above it? */
export function hasAdjacentKnownLimitation(rawLines, idx) {
  for (let i = Math.max(0, idx - KNOWN_LIMITATION_WINDOW); i <= idx; i++) {
    if (rawLines[i].includes('KNOWN LIMITATION')) return true;
  }
  return false;
}

/**
 * Lint one spec file's text. `kind` is 'dom' for `*.dom.test.ts`, 'node' otherwise.
 * Returns findings as `{ line, why }` (1-based line numbers).
 */
export function lintText(text, kind) {
  const rules = kind === 'dom' ? DOM_RULES : NODE_RULES;
  const raw = text.split('\n');
  const code = stripCommentsAndStrings(raw);
  const findings = [];
  code.forEach((line, idx) => {
    for (const rule of rules) {
      if (!rule.re.test(line)) continue;
      if (rule.needsKnownLimitation && hasAdjacentKnownLimitation(raw, idx)) continue;
      findings.push({ line: idx + 1, why: rule.why });
    }
  });
  return findings;
}

export function run(root) {
  const findings = [];
  let graced = 0;
  const gracedFiles = new Set();
  for (const file of walk(root)) {
    const kind = file.endsWith('.dom.test.ts') ? 'dom' : 'node';
    const fileFindings = lintText(readFileSync(file, 'utf-8'), kind).map((f) => ({ file, ...f }));
    if (fileFindings.length === 0) continue;
    // The allowlist only graces pre-existing node-spec findings; DOM findings always gate.
    if (kind === 'node' && ALLOWLIST.has(file.split('\\').join('/'))) {
      graced += fileFindings.length;
      gracedFiles.add(file);
      continue;
    }
    findings.push(...fileFindings);
  }
  return { findings, graced, gracedFiles };
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const ROOT = process.argv[2] ?? 'packages';
  const { findings, graced, gracedFiles } = run(ROOT);

  if (graced > 0) {
    console.log(`⚠️  ${graced} pre-existing finding(s) graced in ${gracedFiles.size} allowlisted file(s) — burn the ALLOWLIST down, don't grow it.`);
  }
  if (findings.length > 0) {
    console.error(`❌ ${findings.length} spec anti-pattern(s) found:\n`);
    for (const f of findings) console.error(`   ${f.file}:${f.line} — ${f.why}`);
    console.error('\n   See scripts/check-spec-antipatterns.mjs for the rule list and rationale.');
    process.exit(1);
  }
  console.log(`✅ Spec anti-pattern lint clean (scanned ${ROOT}).`);
}

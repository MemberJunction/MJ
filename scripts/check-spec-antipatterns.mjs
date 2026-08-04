#!/usr/bin/env node
/**
 * DOM-spec anti-pattern lint (Phase 4 guardrails — tooling-roadmap #4).
 *
 * Scans every `*.dom.test.ts` for the test-theater patterns the Phase-3 reviews caught,
 * so they fail CI instead of surviving to a human review:
 *
 *   - Vacuous assertions: `expect(true)…`, `expect(x || true)…` — cannot fail, prove nothing.
 *   - Disabled tests: `it.skip` / `describe.skip` / `xit(` / `xdescribe(` — DOM specs are
 *     either real or deleted/deferred via the register; a skipped spec reads as coverage.
 *   - Blanket schemas: `NO_ERRORS_SCHEMA` / `CUSTOM_ELEMENTS_SCHEMA` — silence unknown-element
 *     errors wholesale, so a renamed child selector passes unnoticed. Stub the child instead.
 *   - Weak typing: `as any` / `: any` / `<any>` — banned repo-wide (CLAUDE.md); `as never` —
 *     erases all type-checking of the double (use `satisfies Pick<…>` + a seam cast).
 *
 * Line comments are stripped before matching so prose ABOUT an anti-pattern doesn't trip it.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.argv[2] ?? 'packages';

const RULES = [
  { re: /expect\(\s*true\s*\)/, why: 'vacuous assertion — expect(true) cannot fail' },
  { re: /expect\([^)]*\|\|\s*true\s*\)/, why: 'vacuous assertion — `x || true` is always true' },
  { re: /\b(?:it|describe|test)\.skip\b|\bxit\s*\(|\bxdescribe\s*\(/, why: 'disabled test — fix it or defer via the register, don\'t skip' },
  { re: /\bNO_ERRORS_SCHEMA\b|\bCUSTOM_ELEMENTS_SCHEMA\b/, why: 'blanket schema — stub the child component instead' },
  { re: /\bas\s+any\b|:\s*any\b|<any>/, why: '`any` — banned repo-wide (CLAUDE.md)' },
  { re: /\bas\s+never\b/, why: '`as never` — erases type-checking of the double; use `satisfies Pick<…>` + a seam cast' },
];

function walk(dir, acc = []) {
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
    else if (e.name.endsWith('.dom.test.ts')) acc.push(p);
  }
  return acc;
}

/** Strip `// …` line comments and (crudely, line-wise) `/* … *​/` block-comment interiors. */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) return out; // rest of line is comment
        inBlock = false;
        i = end + 2;
      } else if (line.startsWith('//', i)) {
        return out;
      } else if (line.startsWith('/*', i)) {
        inBlock = true;
        i += 2;
      } else {
        out += line[i++];
      }
    }
    return out;
  });
}

const findings = [];
for (const file of walk(ROOT)) {
  const lines = stripComments(readFileSync(file, 'utf-8').split('\n'));
  lines.forEach((code, idx) => {
    for (const rule of RULES) {
      if (rule.re.test(code)) findings.push({ file, line: idx + 1, why: rule.why });
    }
  });
}

if (findings.length > 0) {
  console.error(`❌ ${findings.length} DOM-spec anti-pattern(s) found:\n`);
  for (const f of findings) console.error(`   ${f.file}:${f.line} — ${f.why}`);
  console.error('\n   See scripts/check-spec-antipatterns.mjs for the rule list and rationale.');
  process.exit(1);
}
console.log(`✅ DOM-spec anti-pattern lint clean (scanned ${ROOT}).`);

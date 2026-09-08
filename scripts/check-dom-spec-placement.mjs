#!/usr/bin/env node
/**
 * DOM-spec placement guard (Phase 4 of the Angular DOM testing rollout).
 *
 * The dual-preset vitest split routes specs by path + name:
 *   - node project: excludes `**\/*.dom.test.ts`
 *   - dom  project: includes `src\/**\/*.dom.test.ts` but excludes `**\/__tests__\/**`
 *
 * A `*.dom.test.ts` placed INSIDE a `__tests__/` directory therefore matches NEITHER
 * project — it silently never runs, and `passWithNoTests: true` hides the silence.
 * (Phase 3 hit the inverse of this: an Angular-importing test living in `__tests__/`
 * crashed on the node preset — see omnibar.dom.test.ts's relocation.)
 *
 * This guard fails CI when any `.dom.test.ts` sits under a `__tests__/` directory.
 * Correct placement: next to the component (`src/lib/<feature>/x.component.dom.test.ts`),
 * per guides/ANGULAR_TESTING_GUIDE.md §3d.
 */
import { readdirSync } from 'fs';
import { join, sep } from 'path';

const ROOT = process.argv[2] ?? 'packages';

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc; // unreadable dir — skip
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.dom.test.ts') && p.split(sep).includes('__tests__')) acc.push(p);
  }
  return acc;
}

const offenders = walk(ROOT);
if (offenders.length > 0) {
  console.error('❌ DOM spec(s) placed inside a __tests__/ directory:\n');
  for (const f of offenders) console.error(`   - ${f}`);
  console.error('\n   In a DUAL-preset package this file matches NEITHER vitest project (it silently never');
  console.error('   runs); in a single-preset package it runs today but silently drops out the moment the');
  console.error('   package converts to dual. Either way it violates the documented placement convention.');
  console.error('   Fix: move each file next to its source (src/lib/<feature>/x.component.dom.test.ts).');
  console.error('   See guides/ANGULAR_TESTING_GUIDE.md §3d and scripts/check-dom-spec-placement.mjs.');
  process.exit(1);
}
console.log(`✅ DOM-spec placement OK — no *.dom.test.ts under __tests__/ (scanned ${ROOT}).`);

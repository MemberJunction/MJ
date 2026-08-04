/**
 * Fail-fast guard for `npm start`: verifies every @memberjunction workspace dependency
 * has its BUILT entrypoint on disk before the dev server boots. Without this, starting
 * MJExplorer while a sibling package is mid-rebuild (its dist briefly deleted) produces a
 * confusing storm of TS2307 "Cannot find module" / NG1010 errors. With it, you get one
 * clear message: build (or wait for) the listed packages, then start again.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rootNodeModules = join(here, '..', '..', 'node_modules');
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

const missing = [];
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  if (!dep.startsWith('@memberjunction/')) {
    continue;
  }
  const depPkgPath = join(rootNodeModules, dep, 'package.json');
  if (!existsSync(depPkgPath)) {
    continue; // not installed/hoisted — npm's problem, with its own clearer error
  }
  const depPkg = JSON.parse(readFileSync(depPkgPath, 'utf8'));
  const entry = depPkg.main ?? depPkg.module ?? null;
  if (entry && !existsSync(join(dirname(depPkgPath), entry))) {
    missing.push(`  - ${dep} (missing ${entry})`);
  }
}

if (missing.length > 0) {
  console.error(
    `\n[MJExplorer] ${missing.length} workspace dependenc${missing.length === 1 ? 'y is' : 'ies are'} not built (dist missing):\n` +
    missing.join('\n') +
    '\n\nA build may be in progress (package builds briefly clear dist) — wait for it to finish,' +
    '\nor build the package(s) and start again.\n'
  );
  process.exit(1);
}

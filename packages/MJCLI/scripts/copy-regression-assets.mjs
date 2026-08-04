/**
 * Bundle non-TypeScript regression assets into the published CLI package so
 * external (`npm i -g @memberjunction/cli`) users — who don't have the monorepo —
 * still have everything they need at runtime.
 *
 * Two things get copied:
 *
 *  1. Standalone compose files → <pkg>/regression-compose/
 *     Used by `mj test regression remote --overlay` (Mode D) and
 *     `mj test regression up --bacpac` (external). Source of truth lives in
 *     docker/regression/. resolveStandaloneCompose() in
 *     lib/regression/docker-helpers.ts prefers the live monorepo copy and
 *     falls back to this bundled one.
 *
 *  2. `mj test regression init` templates → dist/init-templates/
 *     Source lives at src/init-templates/, intentionally OUTSIDE src/commands/
 *     so oclif's manifest builder doesn't try to register the template files
 *     as CLI commands. `tsc` doesn't copy non-.ts files, so this script
 *     mirrors them into dist/. init.ts resolves them via
 *     `path.join(__dirname, '../../../init-templates')` from
 *     dist/commands/test/regression/init.js.
 */
import { mkdirSync, copyFileSync, existsSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));        // packages/MJCLI/scripts
const pkgRoot = path.resolve(here, '..');                         // packages/MJCLI
const repoRoot = path.resolve(pkgRoot, '..', '..');               // monorepo root

// ── 1. Standalone compose files → <pkg>/regression-compose/ ──────────────────
{
  const srcDir = path.join(repoRoot, 'docker', 'regression');
  const destDir = path.join(pkgRoot, 'regression-compose');
  const FILES = ['docker-compose.standalone.yml', 'docker-compose.bacpac-standalone.yml'];

  mkdirSync(destDir, { recursive: true });
  let copied = 0;
  for (const f of FILES) {
    const src = path.join(srcDir, f);
    if (existsSync(src)) {
      copyFileSync(src, path.join(destDir, f));
      copied++;
    } else {
      console.warn(`  [copy-regression-assets] source not found, skipped: ${src}`);
    }
  }
  console.log(`[copy-regression-assets] bundled ${copied}/${FILES.length} compose file(s) into ${path.relative(pkgRoot, destDir)}/`);
}

// ── 2. init-templates → dist/init-templates/ ────────────────────────────────
// Templates intentionally live OUTSIDE src/commands/ so oclif's manifest
// builder doesn't try to register them as CLI commands. init.ts resolves
// the destination via path.join(__dirname, '../../../init-templates') from
// dist/commands/test/regression/init.js.
{
  const srcDir = path.join(pkgRoot, 'src', 'init-templates');
  const destDir = path.join(pkgRoot, 'dist', 'init-templates');
  if (existsSync(srcDir)) {
    cpSync(srcDir, destDir, { recursive: true });
    console.log(`[copy-regression-assets] copied init-templates → ${path.relative(pkgRoot, destDir)}/`);
  } else {
    console.warn(`  [copy-regression-assets] init-templates source not found, skipped: ${srcDir}`);
  }
}

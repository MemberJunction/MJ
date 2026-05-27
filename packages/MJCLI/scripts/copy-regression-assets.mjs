/**
 * Copy the standalone regression compose files into the published CLI package so
 * external (`npm i -g @memberjunction/cli`) users — who don't have the monorepo —
 * still have them for `mj test regression remote --overlay` (Mode D) and
 * `mj test regression up --bacpac` (external). Single source of truth lives in
 * docker/regression/; this copies it to <pkg>/regression-compose/ at build.
 *
 * resolveStandaloneCompose() in lib/regression/docker-helpers.ts prefers the
 * live monorepo copy and falls back to this bundled one.
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));        // packages/MJCLI/scripts
const pkgRoot = path.resolve(here, '..');                         // packages/MJCLI
const repoRoot = path.resolve(pkgRoot, '..', '..');               // monorepo root
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

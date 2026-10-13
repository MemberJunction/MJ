/**
 * Copy the repo-root LICENSE into every publishable package immediately before
 * `changeset publish`.
 *
 * Why this is necessary under the BUSL and was not under ISC: npm ships only
 * what a package's `files` allowlist names, and almost every MJ package sets
 * `"files": ["/dist"]`. npm does make one exception — a file literally named
 * LICENSE at the package root is always included — but no package has one, so
 * today's tarballs carry no license text at all.
 *
 * With ISC that was survivable: the SPDX id "ISC" names a short, fixed,
 * universally-known text. "BUSL-1.1" does not. The Business Source License is
 * PARAMETERIZED — the Change Date, Change License, and the entire Additional
 * Use Grant (internal use, the nonprofit grant, the Certified Program path)
 * live only in the LICENSE file. A consumer reading `"license": "BUSL-1.1"`
 * in package.json has no way to learn any of them.
 *
 * The LICENSE itself also requires it: "You must conspicuously display this
 * License on each original or modified copy of the Licensed Work."
 *
 * Copies are generated at publish time and never committed — the repo keeps a
 * single source of truth at the root, so the 300 copies cannot drift from it.
 *
 * usage: node .github/scripts/stage-package-licenses.mjs [--check]
 *   --check  report what would be staged, write nothing (exit 1 if any missing)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const ROOT_LICENSE = join(REPO_ROOT, 'LICENSE');
const checkOnly = process.argv.includes('--check');

if (!existsSync(ROOT_LICENSE)) {
  console.error('FATAL: no LICENSE at the repository root — nothing to stage.');
  process.exit(1);
}
const licenseText = readFileSync(ROOT_LICENSE, 'utf8');

const manifests = execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '--', '*package.json'], {
  encoding: 'utf8',
})
  .trim().split('\n').filter(Boolean)
  .filter((f) => !f.endsWith('package-lock.json'))
  .filter((f) => !f.endsWith('ng-package.json'))
  .filter((f) => f.startsWith('packages/'));

let staged = 0;
let skipped = 0;
const missing = [];

for (const rel of manifests) {
  const pkgDir = join(REPO_ROOT, dirname(rel));
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));
  } catch (err) {
    console.error(`FATAL: ${rel} is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  // A private package is never published, so it needs no tarball license.
  if (pkg.private === true) { skipped++; continue; }

  const dest = join(pkgDir, 'LICENSE');
  if (checkOnly) {
    if (readSafe(dest) !== licenseText) missing.push(dirname(rel));
    continue;
  }
  writeFileSync(dest, licenseText);
  staged++;
}

function readSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

if (checkOnly) {
  console.log(`publishable packages missing an up-to-date LICENSE: ${missing.length}`);
  missing.slice(0, 20).forEach((d) => console.log('  ' + d));
  if (missing.length > 20) console.log(`  … and ${missing.length - 20} more`);
  process.exit(missing.length === 0 ? 0 : 1);
}

console.log(`staged LICENSE into ${staged} publishable packages (${skipped} private, skipped)`);

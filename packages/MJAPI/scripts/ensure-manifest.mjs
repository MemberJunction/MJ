/**
 * Guarantees `src/generated/class-registrations-manifest.ts` exists.
 *
 * The manifest is gitignored and produced by `mj codegen manifest`, which needs the workspace's
 * built dists to resolve the dependency tree it scans. That makes it unavailable in two ordinary
 * situations: a fresh checkout that has not built yet, and a CI job whose FILTERED build did not
 * include this package (or the packages the generator reads). `src/index.ts` imports the manifest
 * unconditionally, so when it is absent the import fails and every MJAPI test errors on a file
 * that was never anyone's responsibility to create.
 *
 * The generator's own fallback — `|| echo 'using existing manifest'` — assumes an existing file,
 * which is exactly the assumption a fresh checkout breaks. This closes that: if the generator did
 * not produce one, write the empty manifest, which is a CORRECT manifest rather than a placeholder.
 * The array is legitimately empty here because `--exclude-packages @memberjunction` excludes every
 * package in this repo, so a real run emits the same shape. A later real run overwrites it.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/generated/class-registrations-manifest.ts');

if (existsSync(target)) {
    process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(
    target,
    `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Written by scripts/ensure-manifest.mjs because 'mj codegen manifest' could not run
 * (no built workspace dists — a fresh checkout, or a filtered CI build that skipped them).
 *
 * Empty is the CORRECT content here, not a placeholder: the generator is invoked with
 * --exclude-packages @memberjunction, which excludes every package in this repository, so a
 * real run emits this same empty array. A later real run overwrites this file.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Runtime references to every @RegisterClass decorated class.
 * This array creates a static code path the bundler cannot tree-shake.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CLASS_REGISTRATIONS: any[] = [
];

/** Marker constant indicating the manifest has been loaded. */
export const CLASS_REGISTRATIONS_MANIFEST_LOADED = true;

/** Total @RegisterClass decorated classes discovered in dependency tree */
export const CLASS_REGISTRATIONS_COUNT = 0;
`,
    'utf8'
);
console.log('[ensure-manifest] wrote the empty class-registrations manifest (generator unavailable).');

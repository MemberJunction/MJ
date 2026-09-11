// Every relative import this package emits must carry a .js extension.
//
// These packages are true ESM, and Node's ESM resolver does NOT do extension guessing: a relative
// specifier without one throws ERR_MODULE_NOT_FOUND at LOAD time. Not on first use — at load. So a
// single missing extension does not degrade a feature, it stops the API process from booting, and
// it does so on every tenant at once the moment the build is shipped.
//
// It reached the built dist unnoticed because nothing on the way here looks for it: `tsc` accepts
// the extensionless form (that is what `moduleResolution: bundler`-style configs are for), the
// unit tests run through a loader that resolves it happily, and the fleet-patch gate ladder checks
// for parse errors and undefined SYMBOLS — a missing MODULE is neither. This test is the check
// that was missing, and it reads the emitted .js rather than the .ts, because the emitted file is
// what production loads.
//
// If this fails, the fix is to add `.js` to the specifier it names. TypeScript maps `./X.js` back
// to `./X.ts` at compile time, so the extension is correct in source as well as in output.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

function jsFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...jsFiles(full));
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Relative specifiers in `import`/`export ... from` and dynamic `import()`.
 *
 * Bare specifiers (`@memberjunction/core`, `node:fs`) are resolved by the package graph and are
 * correctly extensionless — only relative ones are the resolver's problem.
 */
const SPECIFIER = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;

describe('emitted ESM specifiers', () => {
  it('has a dist to check — otherwise this test proves nothing', () => {
    // A silently empty sweep is the failure mode this whole file exists to prevent, so say so.
    expect(jsFiles(DIST).length, `no emitted .js found under ${DIST} — build first`).toBeGreaterThan(0);
  });

  it('gives every relative import an extension Node can resolve', () => {
    const offenders: string[] = [];
    for (const file of jsFiles(DIST)) {
      const body = readFileSync(file, 'utf8');
      for (const [, spec] of body.matchAll(SPECIFIER)) {
        // A directory specifier ('./foo/') has no extension by design and resolves through the
        // package's own exports; only file-shaped specifiers are checked.
        if (spec.endsWith('/')) {
          continue;
        }
        if (!/\.(js|mjs|cjs|json|node)$/.test(spec)) {
          offenders.push(`${file.slice(DIST.length + 1)} -> ${spec}`);
        }
      }
    }
    expect(
      offenders,
      `relative imports missing an extension (each one is an ERR_MODULE_NOT_FOUND at boot)`
    ).toEqual([]);
  });
});

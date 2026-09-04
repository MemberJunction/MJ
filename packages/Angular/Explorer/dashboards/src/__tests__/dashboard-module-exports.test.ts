/**
 * Every lazy-loadable dashboard module must be reachable through this package's `exports` map.
 *
 * ── THE FAILURE THIS PREVENTS ──
 *
 * Explorer loads these modules by subpath (`@memberjunction/ng-dashboards/archiving-dashboards.module`).
 * A module whose subpath is missing from `exports` compiles, ships in `dist`, and is then unreachable:
 * the consumer's bundler fails with `Could not resolve "…/<name>-dashboards.module"`, and it fails at
 * the CONSUMER, not here — so the package that is actually wrong looks fine, and whoever hits it is
 * looking at their own app.
 *
 * Worse, it can hide for a long time. A bundler that pre-bundles dependencies keeps serving the last
 * good copy, so the break surfaces whenever someone clears that cache — which is how this was found:
 * a stale dep cache had been masking a missing subpath, and clearing it took Explorer's dev server
 * down with an error that named none of this.
 *
 * A module file is the only input; adding one and forgetting the export entry is a two-line mistake
 * with a cross-repo symptom, which is exactly the shape worth a guard rather than a convention.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface PackageManifest {
    exports?: Record<string, { types?: string; default?: string }>;
}

function manifest(): PackageManifest {
    return JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as PackageManifest;
}

/** Every `*-dashboards.module.ts` in `src` — the modules Explorer loads by subpath. */
function moduleNames(): string[] {
    return readdirSync(resolve(packageRoot, 'src'))
        .filter(f => f.endsWith('-dashboards.module.ts'))
        .map(f => f.replace(/\.ts$/, ''));
}

describe('dashboard module exports', () => {
    it('exports a subpath for every dashboard module in src', () => {
        const exports = manifest().exports ?? {};
        const missing = moduleNames().filter(name => exports[`./${name}`] === undefined);
        expect(missing).toEqual([]);
    });

    it('points each subpath at the built file and its types', () => {
        const exports = manifest().exports ?? {};
        for (const name of moduleNames()) {
            // Both halves, because a subpath with types and no `default` resolves for the compiler and
            // fails for the bundler — the confusing half of this failure mode.
            expect(exports[`./${name}`]?.default).toBe(`./dist/${name}.js`);
            expect(exports[`./${name}`]?.types).toBe(`./dist/${name}.d.ts`);
        }
    });

    it('has a guard that cannot pass vacuously', () => {
        // If the naming convention changes, the two tests above would pass by checking nothing.
        expect(moduleNames().length).toBeGreaterThan(5);
    });
});

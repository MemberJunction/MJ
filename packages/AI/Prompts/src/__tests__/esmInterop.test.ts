/**
 * esmInterop.test.ts — guards the CJS-namespace-import-under-native-ESM failure class.
 *
 * THE SHIPPED BUG (fixed in PR #2732): `import * as JSON5 from 'json5'` made `JSON5.parse`
 * undefined under this package's native-ESM build — silently disabling the local JSON-repair
 * tier so every malformed payload escalated to paid AI repair. The pre-existing unit test for
 * the repair tier PASSED THE WHOLE TIME because vitest's CJS interop exposes namespace members
 * that plain Node does not; and the repo's `check:esm` guard only gates extensionless-specifier
 * failures, not member-missing-at-call-time. Neither gate could catch a reintroduction — these
 * two checks can (2026-07-21 coverage study, recommendation #5).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * CJS dependencies of this package whose namespace form is a known runtime trap under native
 * ESM (only the default export carries the API). Extend when adding a CJS dep with the same
 * shape. json5 is the one that already shipped a production bug.
 */
const CJS_DEFAULT_ONLY_DEPS = ['json5'];

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name !== '__tests__' && name !== 'node_modules') {
                walkSourceFiles(p, acc);
            }
        } else if (name.endsWith('.ts')) {
            acc.push(p);
        }
    }
    return acc;
}

describe('native-ESM interop guards (the JSON5.parse-undefined bug class)', () => {
    it('no source file namespace-imports a default-only CJS dep (import * as X is the trap)', () => {
        const offenders: string[] = [];
        for (const file of walkSourceFiles(path.join(pkgRoot, 'src'))) {
            const src = readFileSync(file, 'utf-8');
            for (const dep of CJS_DEFAULT_ONLY_DEPS) {
                const pattern = new RegExp(String.raw`import\s*\*\s*as\s+\w+\s+from\s+['"]${dep}['"]`);
                if (pattern.test(src)) {
                    offenders.push(`${path.relative(pkgRoot, file)} (namespace-imports '${dep}')`);
                }
            }
        }
        expect(offenders, `namespace imports of default-only CJS deps — under native ESM their members are undefined at call time: ${offenders.join(', ')}`).toEqual([]);
    });

    it('the BUILT dist imports under plain Node and json5 default-import carries parse (the exact interop the repair tier relies on)', () => {
        const distEntry = path.join(pkgRoot, 'dist', 'index.js');
        if (!existsSync(distEntry)) {
            // Unbuilt checkout (e.g. fresh clone running only unit tests) — an environment gap,
            // not a pass: fail loudly so CI (which always builds first) keeps the guard armed,
            // but explain the remedy.
            throw new Error(`dist/index.js not found — build @memberjunction/ai-prompts before running this guard (npm run build)`);
        }
        // Child PLAIN-Node process: no vitest CJS interop to mask anything. Probes both the
        // package entry (module-graph resolution) and the exact json5 usage shape the repair
        // tier depends on (default import .parse of lenient JSON).
        const probe = [
            `const mod = await import(${JSON.stringify(pathToFileURL(distEntry).href)});`,
            `if (!mod.AIPromptRunner) { throw new Error('AIPromptRunner missing from built dist exports'); }`,
            `const { default: JSON5 } = await import('json5');`,
            `const parsed = JSON5.parse("{a:1,}");`,
            `if (parsed.a !== 1) { throw new Error('json5 default-import parse failed'); }`,
            `console.log('OK');`
        ].join('\n');
        const out = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
            cwd: pkgRoot,
            encoding: 'utf-8',
            timeout: 60000
        });
        expect(out).toContain('OK');
    });
});

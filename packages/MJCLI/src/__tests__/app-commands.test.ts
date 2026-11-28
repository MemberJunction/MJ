/**
 * Tests for `mj app *` command wiring.
 *
 * Covers two things from recent branch work:
 *   1. Regression guard for the dynamic-import-of-undeclared-dep bug that
 *      shipped in 5.29.0: every `@memberjunction/*` package that any
 *      `src/commands/app/*.ts` file imports MUST be declared in this
 *      package's `dependencies`. The bug was that `@memberjunction/open-app-engine`
 *      was loaded via `await import()` but never listed as a dep, so global
 *      installs of the CLI crashed at runtime with ERR_MODULE_NOT_FOUND.
 *   2. The undocumented `--dangerously-ignore-dbl-underscore-schema-rule`
 *      flag on `app install` and `app upgrade`: hidden from help, defaults
 *      to false.
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const commandsDir = join(here, '..', 'commands', 'app');
const packageJsonPath = join(here, '..', '..', 'package.json');

/** Return the source text of every .ts file in src/commands/app/. */
function readAppCommandSources(): Array<{ name: string; source: string }> {
    return readdirSync(commandsDir)
        .filter((f) => f.endsWith('.ts'))
        .map((name) => ({
            name,
            source: readFileSync(join(commandsDir, name), 'utf8'),
        }));
}

describe('app command dependency declarations (regression for 5.29.0 open-app-engine bug)', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        dependencies: Record<string, string>;
    };
    const declaredDeps = new Set(Object.keys(pkg.dependencies));
    const sources = readAppCommandSources();

    it('every @memberjunction/* package imported by app commands is declared in dependencies', () => {
        const missing: string[] = [];
        const mjImportRegex = /from ['"](@memberjunction\/[^'"]+)['"]/g;
        for (const { name, source } of sources) {
            for (const match of source.matchAll(mjImportRegex)) {
                const pkgName = match[1].split('/').slice(0, 2).join('/'); // @memberjunction/foo
                if (!declaredDeps.has(pkgName)) {
                    missing.push(`${name}: ${pkgName}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it('@memberjunction/open-app-engine is declared (the original missing dep)', () => {
        expect(declaredDeps.has('@memberjunction/open-app-engine')).toBe(true);
    });

    it('no app command uses dynamic `await import(\'@memberjunction/...\')` for first-party packages', () => {
        const offenders: string[] = [];
        const dynamicMjImport = /await\s+import\(\s*['"]@memberjunction\//;
        for (const { name, source } of sources) {
            if (dynamicMjImport.test(source)) {
                offenders.push(name);
            }
        }
        expect(offenders).toEqual([]);
    });
});

/**
 * Budget for the one cold load of the eight `app/*` command modules (the whole open-app transitive graph through Vite's
 * transform): ~21 s alone on a dev machine, over 180 s inside a full-repo test run (PR 5 wave-4 full mirror). It is a hook
 * timeout, so the load is never counted against a test's own timeout (D-091 item 13).
 */
const MODULE_LOAD_TIMEOUT_MS = 300_000;

/** Loads every `app/*` command module, each settled on its own so one failed load fails only the tests that read it. */
function LoadAppCommands() {
    return Promise.allSettled([
        import('../commands/app/list.js'),
        import('../commands/app/info.js'),
        import('../commands/app/install.js'),
        import('../commands/app/upgrade.js'),
        import('../commands/app/remove.js'),
        import('../commands/app/enable.js'),
        import('../commands/app/disable.js'),
        import('../commands/app/check-updates.js'),
    ]);
}

/** A settled load's module, or the load's own error. */
function Loaded<T>(result: PromiseSettledResult<T>): T {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
}

let appCommands: Awaited<ReturnType<typeof LoadAppCommands>>;

// The modules load once, here: the tests below assert on what the load produced, not on how long it took.
beforeAll(async () => {
    appCommands = await LoadAppCommands();
}, MODULE_LOAD_TIMEOUT_MS);

describe('app command modules load cleanly', () => {
    /**
     * If a static import in a command file points at an undeclared or
     * unresolvable package, importing the module throws. This is the
     * strongest end-to-end guard against the 5.29.0 bug.
     */
    it('loads every `app/*` command module without throwing', () => {
        for (const result of appCommands) {
            const mod = Loaded(result);
            expect(mod.default).toBeDefined();
            expect(typeof mod.default).toBe('function'); // command class
        }
    });
});

describe('hidden --dangerously-ignore-dbl-underscore-schema-rule flag', () => {
    const FLAG = 'dangerously-ignore-dbl-underscore-schema-rule';

    it('install command declares the flag as hidden with default false', () => {
        const { default: AppInstall } = Loaded(appCommands[2]);
        const flag = AppInstall.flags[FLAG];
        expect(flag).toBeDefined();
        expect(flag.hidden).toBe(true);
        expect(flag.default).toBe(false);
        expect(flag.type).toBe('boolean');
    });

    it('upgrade command declares the flag as hidden with default false', () => {
        const { default: AppUpgrade } = Loaded(appCommands[3]);
        const flag = AppUpgrade.flags[FLAG];
        expect(flag).toBeDefined();
        expect(flag.hidden).toBe(true);
        expect(flag.default).toBe(false);
        expect(flag.type).toBe('boolean');
    });

    it('the flag carries no description (intentionally undocumented)', () => {
        const { default: AppInstall } = Loaded(appCommands[2]);
        const { default: AppUpgrade } = Loaded(appCommands[3]);
        expect(AppInstall.flags[FLAG].description).toBeUndefined();
        expect(AppUpgrade.flags[FLAG].description).toBeUndefined();
    });
});

/**
 * There is ONE resolver for the three config-named context users — issue #4209, second half.
 *
 * The bug was not that a lookup used the wrong column; it was that the lookup was written out by
 * hand at every consumer. Six copies existed across MJServer in three mutually inconsistent
 * variants, and two of them could not resolve the value MJ itself ships. `auth/principals.ts`
 * exists to make that impossible, and this test is what keeps it that way: any file that reads
 * one of the three settings must go through the ladder rather than growing a fourth variant.
 *
 * Source-scanning rather than behavioural because the failure mode is *a new call site*, which no
 * behavioural test of the existing call sites can see. Same technique as
 * `AdhocQueryResolver.scopeGuard.test.ts` and `serverExtensionReservedRoots.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The three settings that name a principal in config. `config.ts` DEFINES them; it does not resolve them. */
const CONTEXT_USER_SETTINGS = [
    'contextUserForNewUserCreation',
    'contextUserForProvisioning',
    'contextUserForLookup',
] as const;

/**
 * Files that legitimately mention a setting without resolving it, as paths RELATIVE TO `src/`.
 * Deliberately not basenames: exempting every file called `config.ts` anywhere under `src/` would
 * let a future `realtimeWidget/config.ts` hand-roll a lookup and still pass this guard.
 */
const NOT_CONSUMERS = ['config.ts', 'auth/principals.ts'];

/** `src/`-relative, forward-slashed, so the assertions below read the same on every platform. */
function relativeToSrc(absolutePath: string): string {
    return relative(SRC_ROOT, absolutePath).split(sep).join('/');
}

function everyTsFileUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            return name === '__tests__' || name === 'generated' ? [] : everyTsFileUnder(full);
        }
        return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [full] : [];
    });
}

/** Files that READ one of the settings — i.e. resolve it to a user, rather than declaring it. */
function consumersOfAContextUserSetting(): { path: string; source: string }[] {
    return everyTsFileUnder(SRC_ROOT)
        .filter((p) => !NOT_CONSUMERS.includes(relativeToSrc(p)))
        .map((path) => ({ path: relativeToSrc(path), source: readFileSync(path, 'utf8') }))
        .filter(({ source }) => CONTEXT_USER_SETTINGS.some((s) => source.includes(`.${s}`)));
}

describe('context-user resolution has exactly one implementation', () => {
    it('finds the known consumers, so the scan itself is not silently matching nothing', () => {
        const found = consumersOfAContextUserSetting().map((c) => c.path);

        expect(found).toContain('auth/newUsers.ts');
        expect(found).toContain('auth/magicLink/MagicLinkService.ts');
    });

    it('routes every consumer through auth/principals.ts', () => {
        const handRolled = consumersOfAContextUserSetting()
            .filter(({ source }) => !source.includes('ResolveConfiguredPrincipal'))
            .map(({ path }) => path);

        expect(handRolled).toEqual([]);
    });

    it('leaves no consumer matching the setting against a single column by hand', () => {
        // The two shapes that produced #4209: `UserByName(candidate)` and `u.Email === candidate`.
        //
        // Scoped to the statement that READS the setting, not the whole file: MagicLinkService
        // also resolves the INVITEE by Email (`provisionUser`, ~270 lines away), which is tier-1
        // identity and correct. A file-wide grep would condemn it, and a guard that cries wolf
        // gets deleted.
        const COLUMN_MATCH = /UserByName\s*\(|\.(Email|Name)\b[^\n]*===/;
        const handRolled = consumersOfAContextUserSetting()
            .filter(({ source }) =>
                source.split('\n').some(
                    (line) => CONTEXT_USER_SETTINGS.some((s) => line.includes(`.${s}`)) && COLUMN_MATCH.test(line),
                ),
            )
            .map(({ path }) => path);

        expect(handRolled).toEqual([]);
    });
});

describe('the ladder is reachable by the integrators the example is written for', () => {
    // `exampleNewUserSubClass.ts` exists to be COPIED into a deployment's own package — its header
    // says so, and it tells you to uncomment `@RegisterClass` in your code. Now that it resolves
    // through `ResolveConfiguredPrincipal`, an integrator who copies it needs to be able to import
    // that. `package.json` publishes only `"."`, so the package index is the whole public surface,
    // and this guard cannot see downstream code — it can only make sure the door exists.
    it('exports ResolveConfiguredPrincipal from the package index', () => {
        const index = readFileSync(join(SRC_ROOT, 'index.ts'), 'utf8');

        expect(index).toMatch(/ResolveConfiguredPrincipal/);
    });

    it('exports the types a caller needs to hold the result', () => {
        const index = readFileSync(join(SRC_ROOT, 'index.ts'), 'utf8');

        expect(index).toMatch(/ResolvablePrincipal/);
        expect(index).toMatch(/PrincipalResolution/);
    });
});

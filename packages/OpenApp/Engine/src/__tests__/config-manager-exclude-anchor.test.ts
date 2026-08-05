/**
 * Regression tests for the `excludeSchemas` removal being anchored to its own array.
 *
 * `RemoveSchemaFromExcludeArray` originally ran three fallback regexes GLOBALLY over the entire
 * `mj.config.cjs` and applied the first that matched. The last fallback is a bare
 * `['"]<schema>['"]`, which matches the schema name ANYWHERE — including the `entityPackageName`
 * key that `HandleServerConfig` writes twenty lines earlier, and including unrelated keys such as
 * `includeSchemas`.
 *
 * That was latent while the only caller was the app-REMOVE path (where `RemoveEntityPackageMapping`
 * runs first and deletes the colliding key). Issue #3457's fix calls it on the INSTALL/UPGRADE
 * default path, where the `entityPackageName` key is guaranteed to be present — so the fallback
 * would eat it and produce `: "@caliber/app-entities"`, which is invalid JavaScript.
 *
 * These tests use REAL temp files rather than a mocked `node:fs`, deliberately: the orchestrator
 * tests mock the whole config-manager module, so they cannot see this class of failure at all.
 *
 * The sibling `RemoveEntityPackageEntry` was already hardened this way ("A global replace would
 * delete an identically-named key ANYWHERE else in the config — B5"); this is the same treatment.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    AddEntityPackageMapping,
    AddExcludeSchema,
    RemoveExcludeSchema,
    AddIncludeSchema,
    RemoveIncludeSchema,
} from '../install/config-manager.js';

const SCHEMA = '__mj_BizAppsCaliber';
const MANIFEST = {
    name: 'caliber',
    schema: { name: SCHEMA, entityPackage: '@caliber/app-entities' },
} as unknown as Parameters<typeof AddEntityPackageMapping>[1];

let repo: string;
let configPath: string;

const write = (content: string): void => writeFileSync(configPath, content);
const read = (): string => readFileSync(configPath, 'utf-8');

/** Evaluates the emitted config the way Node's `require` would, proving it is still valid JS. */
function evaluate(): Record<string, unknown> {
    const module = { exports: {} as Record<string, unknown> };
    // eslint-disable-next-line no-new-func -- deliberate: the config IS executed by every mj command
    new Function('module', 'exports', read())(module, module.exports);
    return module.exports;
}

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-cfg-'));
    configPath = join(repo, 'mj.config.cjs');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('RemoveExcludeSchema is anchored to the excludeSchemas array', () => {
    it('does not touch entityPackageName when the schema is not excluded (fresh install)', () => {
        // The real HandleServerConfig order: AddEntityPackageMapping, then the default-path removal.
        write(`module.exports = {\n  excludeSchemas: ['sys', 'staging'],\n};\n`);
        expect(AddEntityPackageMapping(repo, MANIFEST).Success).toBe(true);

        const result = RemoveExcludeSchema(repo, SCHEMA);

        expect(result.Success).toBe(true);
        const cfg = evaluate();
        expect((cfg.entityPackageName as Record<string, string>)[SCHEMA]).toBe('@caliber/app-entities');
        expect(cfg.excludeSchemas).toEqual(['sys', 'staging']);
    });

    it('survives a repeated install/upgrade run — the mapping write happens every time', () => {
        // HandleServerConfig runs AddEntityPackageMapping AND the removal on EVERY install and
        // upgrade. The first run heals; the second must not then trip over the key it just wrote.
        write(`module.exports = {\n  excludeSchemas: ['sys', 'staging', '${SCHEMA}'],\n};\n`);

        for (const pass of [1, 2, 3]) {
            expect(AddEntityPackageMapping(repo, MANIFEST).Success, `mapping pass ${pass}`).toBe(true);
            expect(RemoveExcludeSchema(repo, SCHEMA).Success, `removal pass ${pass}`).toBe(true);
        }

        const cfg = evaluate();
        expect(cfg.excludeSchemas).toEqual(['sys', 'staging']);
        expect((cfg.entityPackageName as Record<string, string>)[SCHEMA]).toBe('@caliber/app-entities');
    });

    it('leaves an unrelated includeSchemas positive scope alone', () => {
        // includeSchemas is a live CodeGenLib key resolved INTO excludeSchemas. Emptying it silently
        // inverts the host's scope — and the unanchored version did exactly that, returning success.
        write(`module.exports = {\n  excludeSchemas: [],\n  includeSchemas: ['crm', 'sales'],\n};\n`);

        expect(RemoveExcludeSchema(repo, 'crm').Success).toBe(true);

        expect(evaluate().includeSchemas).toEqual(['crm', 'sales']);
    });

    it('does not mangle a comment that mentions the schema name', () => {
        write(`module.exports = {\n  excludeSchemas: ['${SCHEMA}'],\n  // the '${SCHEMA}' schema is app-owned\n};\n`);

        expect(RemoveExcludeSchema(repo, SCHEMA).Success).toBe(true);

        expect(read()).toContain(`// the '${SCHEMA}' schema is app-owned`);
        expect(evaluate().excludeSchemas).toEqual([]);
    });

    it('does not touch an excludeTables entry that names the same schema', () => {
        write(
            `module.exports = {\n  excludeSchemas: ['crm', 'sys'],\n` +
            `  excludeTables: [{ schema: 'crm', table: 'staging_load' }],\n};\n`,
        );

        expect(RemoveExcludeSchema(repo, 'crm').Success).toBe(true);

        const cfg = evaluate();
        expect(cfg.excludeSchemas).toEqual(['sys']);
        expect(cfg.excludeTables).toEqual([{ schema: 'crm', table: 'staging_load' }]);
    });

    // The arrangement matrix — the original smoke test only covered "middle of many", which was
    // the one shape that happened to work, so every other shape shipped unverified.
    const arrangements: Array<[string, string, string[]]> = [
        ['sole entry', `['${SCHEMA}']`, []],
        ['first of many', `['${SCHEMA}', 'sys', 'staging']`, ['sys', 'staging']],
        ['middle of many', `['sys', '${SCHEMA}', 'staging']`, ['sys', 'staging']],
        ['last of many', `['sys', 'staging', '${SCHEMA}']`, ['sys', 'staging']],
        ['absent', `['sys', 'staging']`, ['sys', 'staging']],
    ];

    for (const [label, literal, expected] of arrangements) {
        it(`removes correctly and keeps the config valid — ${label}`, () => {
            write(`module.exports = {\n  excludeSchemas: ${literal},\n};\n`);
            expect(AddEntityPackageMapping(repo, MANIFEST).Success).toBe(true);

            expect(RemoveExcludeSchema(repo, SCHEMA).Success).toBe(true);

            const cfg = evaluate();
            expect(cfg.excludeSchemas).toEqual(expected);
            expect((cfg.entityPackageName as Record<string, string>)[SCHEMA]).toBe('@caliber/app-entities');
        });
    }

    // ── The config editors must read the config the way Node does: comments are not code, ──
    // ── and `excludeSchemas` nested under another key is a different setting entirely.     ──

    it('ignores a commented-out excludeSchemas and creates a real one (shipped template shape)', () => {
        // distribution.config.cjs ships excludeSchemas commented out. Writing into the comment
        // reports success while CodeGen sees nothing — so the opt-in silently does nothing.
        write(`module.exports = {\n  dbHost: 'localhost',\n  // excludeSchemas: ['sys', 'staging'],\n};\n`);

        expect(AddExcludeSchema(repo, SCHEMA).Success).toBe(true);

        expect(evaluate().excludeSchemas).toEqual([SCHEMA]);
        expect(read()).toContain(`// excludeSchemas: ['sys', 'staging'],`); // comment left intact
    });

    it('does not remove from a commented-out excludeSchemas', () => {
        write(`module.exports = {\n  excludeSchemas: ['${SCHEMA}'],\n  // excludeSchemas: ['${SCHEMA}'],\n};\n`);

        expect(RemoveExcludeSchema(repo, SCHEMA).Success).toBe(true);

        expect(evaluate().excludeSchemas).toEqual([]);
        expect(read()).toContain(`// excludeSchemas: ['${SCHEMA}'],`); // comment untouched
    });

    it('targets the TOP-LEVEL excludeSchemas, not a nested one that appears first', () => {
        // dbSchemaJSONOutput.excludeSchemas and bundles[].excludeSchemas are different settings.
        // Only the top-level array gates entity discovery.
        write(
            `module.exports = {\n  dbSchemaJSONOutput: {\n    excludeSchemas: ['sys', 'dbo'],\n  },\n` +
            `  excludeSchemas: ['sys'],\n};\n`,
        );

        expect(AddExcludeSchema(repo, SCHEMA).Success).toBe(true);

        const cfg = evaluate();
        expect(cfg.excludeSchemas).toEqual(['sys', SCHEMA]);
        expect((cfg.dbSchemaJSONOutput as { excludeSchemas: string[] }).excludeSchemas).toEqual(['sys', 'dbo']);
    });

    it('removes from the TOP-LEVEL excludeSchemas when a nested one appears first', () => {
        write(
            `module.exports = {\n  dbSchemaJSONOutput: {\n    excludeSchemas: ['sys', 'dbo'],\n  },\n` +
            `  excludeSchemas: ['sys', '${SCHEMA}'],\n};\n`,
        );

        expect(RemoveExcludeSchema(repo, SCHEMA).Success).toBe(true);

        const cfg = evaluate();
        expect(cfg.excludeSchemas).toEqual(['sys']);
        expect((cfg.dbSchemaJSONOutput as { excludeSchemas: string[] }).excludeSchemas).toEqual(['sys', 'dbo']);
    });

    // ── Callers must be able to tell "I deleted the host's entry" from "there was nothing there". ──
    // Without it the installer cannot warn a host that its hand-written exclusion just disappeared,
    // and a silently-failing edit is indistinguishable from a successful no-op (which is how the
    // comment/nesting bugs above went unnoticed).

    it('reports Changed=true when it actually removed an entry', () => {
        write(`module.exports = {\n  excludeSchemas: ['sys', '${SCHEMA}'],\n};\n`);

        expect(RemoveExcludeSchema(repo, SCHEMA).Changed).toBe(true);
    });

    it('reports Changed=false when the schema was not present', () => {
        write(`module.exports = {\n  excludeSchemas: ['sys'],\n};\n`);

        expect(RemoveExcludeSchema(repo, SCHEMA).Changed).toBe(false);
    });

    it('reports Changed=false when there is no live excludeSchemas to remove from', () => {
        write(`module.exports = {\n  dbHost: 'localhost',\n  // excludeSchemas: ['${SCHEMA}'],\n};\n`);

        const result = RemoveExcludeSchema(repo, SCHEMA);

        expect(result.Success).toBe(true);
        expect(result.Changed).toBe(false);
    });

    it('still adds and then removes cleanly (round trip)', () => {
        write(`module.exports = {\n  excludeSchemas: ['sys'],\n};\n`);

        expect(AddExcludeSchema(repo, SCHEMA).Success).toBe(true);
        expect(evaluate().excludeSchemas).toEqual(['sys', SCHEMA]);

        expect(RemoveExcludeSchema(repo, SCHEMA).Success).toBe(true);
        expect(evaluate().excludeSchemas).toEqual(['sys']);
    });
});

/**
 * `includeSchemas` is an opt-in POSITIVE scope. CodeGen resolves it INTO `excludeSchemas` by
 * excluding every schema in the database that is not named in it, so on a host that uses one,
 * clearing `excludeSchemas` is NOT enough to make an app's schema discoverable — the app schema
 * must be named in the include list too, or it gets re-excluded and the app still registers zero
 * entities.
 *
 * The dangerous direction is creating an include list that did not exist: an absent or empty
 * `includeSchemas` means "no positive scope, everything is in play". Writing one entry into it
 * would suddenly scope CodeGen to that single schema and silently drop every other schema in the
 * host's database. So these operations act ONLY on a list that is already live and non-empty.
 */
describe('includeSchemas positive scope', () => {
    it('adds the app schema when the host has a live, non-empty include list', () => {
        write(`module.exports = {\n  includeSchemas: ['__mj', 'crm_host'],\n};\n`);

        const result = AddIncludeSchema(repo, SCHEMA);

        expect(result.Success).toBe(true);
        expect(result.Changed).toBe(true);
        expect(evaluate().includeSchemas).toEqual(['__mj', 'crm_host', SCHEMA]);
    });

    it('does NOT create an include list when the host has none', () => {
        // Creating one would scope CodeGen to this schema alone and drop every other schema.
        write(`module.exports = {\n  excludeSchemas: ['sys'],\n};\n`);

        const result = AddIncludeSchema(repo, SCHEMA);

        expect(result.Success).toBe(true);
        expect(result.Changed).toBe(false);
        expect(evaluate().includeSchemas).toBeUndefined();
    });

    it('does NOT populate an empty include list (empty means no scope in force)', () => {
        write(`module.exports = {\n  includeSchemas: [],\n};\n`);

        const result = AddIncludeSchema(repo, SCHEMA);

        expect(result.Changed).toBe(false);
        expect(evaluate().includeSchemas).toEqual([]);
    });

    it('is idempotent across repeated installs and upgrades', () => {
        write(`module.exports = {\n  includeSchemas: ['__mj'],\n};\n`);

        AddIncludeSchema(repo, SCHEMA);
        const second = AddIncludeSchema(repo, SCHEMA);

        expect(second.Changed).toBe(false);
        expect(evaluate().includeSchemas).toEqual(['__mj', SCHEMA]);
    });

    it('removes the app schema again for a self-managed app', () => {
        write(`module.exports = {\n  includeSchemas: ['__mj', '${SCHEMA}'],\n};\n`);

        expect(RemoveIncludeSchema(repo, SCHEMA).Changed).toBe(true);

        expect(evaluate().includeSchemas).toEqual(['__mj']);
    });

    it('ignores a commented-out include list', () => {
        write(`module.exports = {\n  // includeSchemas: ['__mj'],\n  excludeSchemas: [],\n};\n`);

        expect(AddIncludeSchema(repo, SCHEMA).Changed).toBe(false);
        expect(evaluate().includeSchemas).toBeUndefined();
    });
});

/**
 * The `module.exports = {` anchor itself must skip comments (issue #3301).
 *
 * MJ's own default MJAPI config scaffold documents an example `module.exports = {…}` inside its
 * header comment, and `String.match` returns the FIRST hit — so an anchor that ignores comments
 * selects the commented example and every subsequent edit lands somewhere inert. The operation
 * reports success and the host is silently misconfigured, which is the same class of failure as
 * #3457 arriving by a different route.
 */
describe('the exported-object anchor skips commented-out module.exports (#3301)', () => {
    const SCAFFOLD = `/**
 * MJ API configuration.
 * Example:
 *   module.exports = {
 *     dbHost: 'localhost',
 *   };
 */
module.exports = {
  dbHost: 'localhost',
  excludeSchemas: ['sys', 'acme_crm'],
};
`;

    it('adds to the REAL excludeSchemas, not the commented example', () => {
        write(SCAFFOLD);

        expect(AddExcludeSchema(repo, SCHEMA).Success).toBe(true);

        expect(evaluate().excludeSchemas).toEqual(['sys', 'acme_crm', SCHEMA]);
    });

    it('removes from the REAL excludeSchemas', () => {
        write(SCAFFOLD);

        const result = RemoveExcludeSchema(repo, 'acme_crm');

        expect(result.Changed).toBe(true);
        expect(evaluate().excludeSchemas).toEqual(['sys']);
    });

    it('leaves the documentation comment untouched', () => {
        write(SCAFFOLD);

        AddExcludeSchema(repo, SCHEMA);

        expect(read()).toContain("*     dbHost: 'localhost',");
        expect(read()).toContain(' *   module.exports = {');
    });
});

/**
 * A QUOTED key is still a key. `"excludeSchemas": [...]` is legal in a `.cjs` and is the natural
 * shape when a config is copied out of JSON.
 *
 * The string-awareness that stops the scanner treating comments as config also made it blind to
 * these, so the key looked absent. `EnsureExcludeSchemasSection` then appended a SECOND, unquoted
 * `excludeSchemas` — and last-key-wins in an object literal means the host's real list stops
 * applying entirely, `sys` included. That is destructive, not merely ineffective: CodeGen would
 * start adopting system tables on its next run.
 */
describe('quoted config keys are found, not shadowed', () => {
    for (const quote of ['"', "'"]) {
        const label = quote === '"' ? 'double' : 'single';

        it(`adds into an existing ${label}-quoted excludeSchemas rather than appending a duplicate`, () => {
            write(`module.exports = {\n  ${quote}excludeSchemas${quote}: ['sys', 'acme_crm'],\n};\n`);

            expect(AddExcludeSchema(repo, SCHEMA).Success).toBe(true);

            // The host's own entries must survive — losing 'sys' is the destructive part.
            expect(evaluate().excludeSchemas).toEqual(['sys', 'acme_crm', SCHEMA]);
            // Exactly one key, not a shadowing pair.
            expect(read().match(/excludeSchemas/g)?.length).toBe(1);
        });

        it(`removes from a ${label}-quoted excludeSchemas`, () => {
            write(`module.exports = {\n  ${quote}excludeSchemas${quote}: ['sys', '${SCHEMA}'],\n};\n`);

            const result = RemoveExcludeSchema(repo, SCHEMA);

            expect(result.Changed).toBe(true);
            expect(evaluate().excludeSchemas).toEqual(['sys']);
        });
    }

    it('finds a quoted includeSchemas too', () => {
        write(`module.exports = {\n  "includeSchemas": ['__mj', 'crm_host'],\n};\n`);

        expect(AddIncludeSchema(repo, SCHEMA).Changed).toBe(true);

        expect(evaluate().includeSchemas).toEqual(['__mj', 'crm_host', SCHEMA]);
    });

    it('still ignores a quoted key that only appears inside a comment', () => {
        write(`module.exports = {\n  // "excludeSchemas": ['sys'],\n  excludeSchemas: ['staging'],\n};\n`);

        expect(AddExcludeSchema(repo, SCHEMA).Success).toBe(true);

        expect(evaluate().excludeSchemas).toEqual(['staging', SCHEMA]);
    });
});

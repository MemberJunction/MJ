/**
 * Property sweep over realistic `mj.config.cjs` SHAPES.
 *
 * Every config-editor defect found in this area so far was the same failure: the editors were
 * correct for the shapes someone thought to write a test for, and silently wrong for a shape a real
 * host happened to use. The list is long enough to be a pattern rather than a coincidence —
 * an unanchored regex that ate `entityPackageName`, an anchor that selected a `module.exports`
 * inside a header comment, a key nested under `dbSchemaJSONOutput` winning because it appeared
 * first, and a quoted `"excludeSchemas"` reading as absent and being shadowed by an appended
 * duplicate. Each was found one at a time, by review, after the previous one was declared fixed.
 *
 * So this stops enumerating cases and enumerates the SHAPE SPACE instead: key quoting × position ×
 * header comment × nested same-name keys × export form × array state × positive-scope state. Each
 * generated config is driven through the real `HandleServerConfig` sequence
 * (`AddEntityPackageMapping` → exclude → include), three times, and checked against invariants that
 * must hold for ANY shape.
 *
 * The invariants are the point. They are what "the editor works" actually means:
 *   - the file still evaluates as JavaScript
 *   - the host's own entries survive (nothing is collaterally deleted OR shadowed)
 *   - unrelated keys and nested same-name keys are untouched
 *   - the operation's intent is reflected in the EVALUATED config, not merely in the text
 *   - running it three times is indistinguishable from running it once
 *
 * Shadowing is caught without counting text: if an appended duplicate key won, the host's original
 * entries would be missing from the evaluated value.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
const PKG = '@caliber/app-entities';
const MANIFEST = {
    name: 'caliber',
    schema: { name: SCHEMA, entityPackage: PKG },
} as unknown as Parameters<typeof AddEntityPackageMapping>[1];

/** Host entries that must survive every operation. Losing `sys` is the destructive case. */
const HOST_EXCLUDES = ['sys', 'staging'];
const HOST_INCLUDES = ['__mj', 'crm_host'];

type Shape = {
    quote: '' | '"' | "'";
    position: 'first' | 'middle' | 'last';
    header: 'none' | 'moduleExportsExample';
    nested: 'none' | 'before' | 'after';
    exportForm: 'inline' | 'variable';
    array: 'empty' | 'sole' | 'multi' | 'trailingComma';
    scope: 'absent' | 'empty' | 'populated';
};

const DIMENSIONS = {
    quote: ['', '"', "'"] as const,
    position: ['first', 'middle', 'last'] as const,
    header: ['none', 'moduleExportsExample'] as const,
    nested: ['none', 'before', 'after'] as const,
    exportForm: ['inline', 'variable'] as const,
    array: ['empty', 'sole', 'multi', 'trailingComma'] as const,
    scope: ['absent', 'empty', 'populated'] as const,
};

function allShapes(): Shape[] {
    const out: Shape[] = [];
    for (const quote of DIMENSIONS.quote)
        for (const position of DIMENSIONS.position)
            for (const header of DIMENSIONS.header)
                for (const nested of DIMENSIONS.nested)
                    for (const exportForm of DIMENSIONS.exportForm)
                        for (const array of DIMENSIONS.array)
                            for (const scope of DIMENSIONS.scope)
                                out.push({ quote, position, header, nested, exportForm, array, scope });
    return out;
}

/** The host's excludeSchemas entries for a given array state. */
function seedExcludes(shape: Shape): string[] {
    switch (shape.array) {
        case 'empty': return [];
        case 'sole': return ['sys'];
        default: return HOST_EXCLUDES;
    }
}

function renderConfig(shape: Shape): string {
    const k = (name: string) => (shape.quote ? `${shape.quote}${name}${shape.quote}` : name);
    const entries = seedExcludes(shape);
    const excludeLiteral = shape.array === 'trailingComma' && entries.length
        ? `[${entries.map((e) => `'${e}'`).join(', ')},]`
        : `[${entries.map((e) => `'${e}'`).join(', ')}]`;

    const excludeLine = `  ${k('excludeSchemas')}: ${excludeLiteral},`;
    const scopeLine = shape.scope === 'absent'
        ? null
        : `  ${k('includeSchemas')}: [${shape.scope === 'populated' ? HOST_INCLUDES.map((s) => `'${s}'`).join(', ') : ''}],`;
    const nestedBlock = shape.nested === 'none'
        ? null
        : `  dbSchemaJSONOutput: {\n    excludeSchemas: ['sys', 'dbo'],\n  },`;

    // Filler keys so `position` is meaningful.
    const before = `  dbHost: 'localhost',`;
    const after = `  dbDatabase: 'MJ',`;

    const body: string[] = [];
    if (shape.nested === 'before' && nestedBlock) body.push(nestedBlock);
    if (shape.position !== 'first') body.push(before);
    body.push(excludeLine);
    if (scopeLine) body.push(scopeLine);
    if (shape.position !== 'last') body.push(after);
    if (shape.position === 'first') body.push(before);
    if (shape.nested === 'after' && nestedBlock) body.push(nestedBlock);

    const header = shape.header === 'moduleExportsExample'
        ? `/**\n * MJ configuration.\n * Example:\n *   module.exports = {\n *     dbHost: 'localhost',\n *   };\n */\n`
        : '';

    return shape.exportForm === 'inline'
        ? `${header}module.exports = {\n${body.join('\n')}\n};\n`
        : `${header}const cfg = {\n${body.join('\n')}\n};\nmodule.exports = cfg;\n`;
}

/** Evaluates the config the way Node's `require` would. Throws if the edit produced invalid JS. */
function evaluate(text: string): Record<string, unknown> {
    const module = { exports: {} as Record<string, unknown> };
    // eslint-disable-next-line no-new-func -- deliberate: the config IS executed by every mj command
    new Function('module', 'exports', text)(module, module.exports);
    return module.exports;
}

let repo: string;
let configPath: string;
beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-fuzz-'));
    configPath = join(repo, 'mj.config.cjs');
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

/** Drives the real HandleServerConfig sequence `runs` times against a freshly-seeded config. */
function drive(shape: Shape, selfManaged: boolean, runs = 3) {
    writeFileSync(configPath, renderConfig(shape));
    const results = [];
    for (let i = 0; i < runs; i++) {
        results.push(
            AddEntityPackageMapping(repo, MANIFEST),
            selfManaged ? AddExcludeSchema(repo, SCHEMA) : RemoveExcludeSchema(repo, SCHEMA),
            selfManaged ? RemoveIncludeSchema(repo, SCHEMA) : AddIncludeSchema(repo, SCHEMA),
        );
    }
    const text = readFileSync(configPath, 'utf-8');
    return { results, text, cfg: evaluate(text) };
}

const shapes = allShapes();
const describeShape = (s: Shape) =>
    `quote=${s.quote || 'none'} pos=${s.position} header=${s.header} nested=${s.nested} ` +
    `export=${s.exportForm} array=${s.array} scope=${s.scope}`;

describe('mj.config.cjs shape sweep', () => {
    it(`generates only valid JavaScript seeds (${shapes.length} shapes)`, () => {
        // If a seed is malformed the sweep below would be testing garbage, so pin it first.
        for (const shape of shapes) {
            expect(() => evaluate(renderConfig(shape)), describeShape(shape)).not.toThrow();
        }
    });

    it('never corrupts the config, whatever the shape (default path)', () => {
        for (const shape of shapes) {
            const label = describeShape(shape);
            const { results, cfg } = drive(shape, false);

            expect(results.every((r) => r.Success), `${label} — all ops succeed`).toBe(true);

            // Host's own exclusions survive. A shadowing duplicate key would drop them.
            for (const kept of seedExcludes(shape)) {
                expect(cfg.excludeSchemas as string[], `${label} — kept '${kept}'`).toContain(kept);
            }
            // Intent is reflected in the EVALUATED config, not merely written somewhere.
            expect(cfg.excludeSchemas as string[], `${label} — schema un-excluded`).not.toContain(SCHEMA);
            // The mapping the installer writes must survive the removal that follows it.
            expect((cfg.entityPackageName as Record<string, string>)?.[SCHEMA], `${label} — mapping`).toBe(PKG);
            // Unrelated keys untouched.
            expect(cfg.dbHost, `${label} — dbHost`).toBe('localhost');
            if (shape.nested !== 'none') {
                expect((cfg.dbSchemaJSONOutput as { excludeSchemas: string[] }).excludeSchemas, `${label} — nested`)
                    .toEqual(['sys', 'dbo']);
            }
        }
    });

    it('honours the positive scope exactly, whatever the shape', () => {
        for (const shape of shapes) {
            const label = describeShape(shape);
            const { cfg } = drive(shape, false);
            const include = cfg.includeSchemas as string[] | undefined;

            if (shape.scope === 'populated') {
                // A live scope must gain the app schema, or CodeGen re-excludes it.
                expect(include, `${label} — schema in scope`).toContain(SCHEMA);
                for (const kept of HOST_INCLUDES) {
                    expect(include, `${label} — kept include '${kept}'`).toContain(kept);
                }
                expect(include?.filter((s) => s === SCHEMA).length, `${label} — no dupes`).toBe(1);
            }
            else {
                // Absent or empty means NO scope is in force. Creating or populating one would
                // scope CodeGen to this single schema and drop every other schema the host owns.
                expect(include ?? [], `${label} — scope not invented`).toEqual([]);
            }
        }
    });

    it('excludes correctly on the self-managed path, whatever the shape', () => {
        for (const shape of shapes) {
            const label = describeShape(shape);
            const { results, cfg } = drive(shape, true);

            expect(results.every((r) => r.Success), `${label} — all ops succeed`).toBe(true);
            expect(cfg.excludeSchemas as string[], `${label} — schema excluded`).toContain(SCHEMA);
            expect((cfg.excludeSchemas as string[]).filter((s) => s === SCHEMA).length, `${label} — no dupes`).toBe(1);
            for (const kept of seedExcludes(shape)) {
                expect(cfg.excludeSchemas as string[], `${label} — kept '${kept}'`).toContain(kept);
            }
            expect(cfg.dbHost, `${label} — dbHost`).toBe('localhost');
        }
    });

    it('is idempotent — three runs are indistinguishable from one', () => {
        for (const shape of shapes) {
            const label = describeShape(shape);
            const once = drive(shape, false, 1).text;
            const thrice = drive(shape, false, 3).text;
            expect(thrice, `${label} — idempotent`).toBe(once);
        }
    });

    it('preserves the documentation comment when one is present', () => {
        for (const shape of shapes.filter((s) => s.header === 'moduleExportsExample')) {
            const { text } = drive(shape, false);
            expect(text, describeShape(shape)).toContain(" *   module.exports = {");
        }
    });
});

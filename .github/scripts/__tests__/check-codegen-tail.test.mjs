import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
    ARTIFACTS,
    NON_ENTITY_TABLES,
    extractSubclassEntities,
    extractServerEntities,
    extractFormEntities,
    extractGeneratedBaseTables,
    scanMigrations,
    findMissingSubclasses,
    stripSqlComments,
    migrationOrderKey,
} from '../check-codegen-tail.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-codegen-tail.mjs');

// ---------------------------------------------------------------------------
// Extractors — each keys on the exact shape CodeGen emits today. If CodeGen's
// output changes, these fail loudly rather than the guard silently reading zero
// entities and passing everything.
// ---------------------------------------------------------------------------

describe('extractSubclassEntities', () => {
    it('collects BaseEntity subclasses and ignores other classes', () => {
        const src = [
            `export class MJAIModelPriceUnitTypeEntity extends BaseEntity<MJAIModelPriceUnitTypeEntityType> {`,
            `export class MJUserEntity extends BaseEntity<MJUserEntityType> {`,
            `export class SomeHelper extends BaseThing {`,
            `class NotExportedEntity extends BaseEntity {`,
        ].join('\n');
        expect(extractSubclassEntities(src)).toEqual(new Set(['MJAIModelPriceUnitTypeEntity', 'MJUserEntity']));
    });
});

describe('extractServerEntities', () => {
    it('reads the roster out of the core-entities import list', () => {
        const src = `import { MJUserEntity, MJAIModelPriceUnitTypeEntity } from '@memberjunction/core-entities';`;
        expect(extractServerEntities(src)).toEqual(new Set(['MJUserEntity', 'MJAIModelPriceUnitTypeEntity']));
    });

    it('accepts double quotes, so a formatter rewrap is not a false "shape changed"', () => {
        const src = `import { MJUserEntity } from "@memberjunction/core-entities";`;
        expect(extractServerEntities(src)).toEqual(new Set(['MJUserEntity']));
    });

    it('returns null when the import is absent, so the caller can fail as misconfigured', () => {
        expect(extractServerEntities('nothing to see here')).toBeNull();
    });
});

describe('extractFormEntities', () => {
    it('maps ./Entities/ form components back to entity class names', () => {
        const src = [
            `import { MJAIModelPriceUnitTypeFormComponent } from "./Entities/MJAIModelPriceUnitType/x.form.component";`,
            `import { SomeSectionFormComponent } from "./sections/other.component";`,
        ].join('\n');
        expect(extractFormEntities(src)).toEqual(new Set(['MJAIModelPriceUnitTypeEntity']));
    });
});

describe('extractGeneratedBaseTables', () => {
    it('reads Base Table out of the generated docblocks, lowercased', () => {
        const src = ` * * Base Table: AIModelPriceUnitType\n * * Base View: vwAIModelPriceUnitTypes\n`;
        expect(extractGeneratedBaseTables(src)).toEqual(new Set(['aimodelpriceunittype']));
    });
});

// ---------------------------------------------------------------------------
// Migration scanning
// ---------------------------------------------------------------------------

describe('stripSqlComments', () => {
    it('blanks line and block comments but leaves executable DDL', () => {
        const src = [
            '-- CREATE TABLE [__mj].[Commented] (ID int)',
            '/* CREATE TABLE [__mj].[AlsoCommented] (ID int) */',
            'CREATE TABLE [__mj].[Real] (ID int)',
        ].join('\n');
        const out = stripSqlComments(src);
        expect(out).toContain('[Real]');
        expect(out).not.toContain('Commented');
        expect(out).not.toContain('AlsoCommented');
    });

    it('does NOT let an apostrophe inside a comment swallow later DDL', () => {
        // The regression that motivated the single-pass scanner. A literal-first strip read
        // `'s mode ... '` as a string literal and consumed the CREATE TABLE below it, silently
        // removing Theme / ContentItemChunk / AIAgentCredential from the real sweep.
        const src = [
            '/*',
            "    light/dark is the user's mode layered under it",
            '*/',
            'CREATE TABLE ${flyway:defaultSchema}.Theme (ID int)',
        ].join('\n');
        expect(stripSqlComments(src)).toContain('Theme');
    });

    it('does not let a -- inside a string literal comment out the rest of the line', () => {
        const src = `INSERT INTO x VALUES ('a -- not a comment'); CREATE TABLE [__mj].[Real] (ID int)`;
        expect(stripSqlComments(src)).toContain('[Real]');
    });

    it('handles doubled quotes as the T-SQL escape', () => {
        const src = `INSERT INTO x VALUES ('it''s fine'); CREATE TABLE [__mj].[Real] (ID int)`;
        expect(stripSqlComments(src)).toContain('[Real]');
    });

    it('handles nested block comments, which a non-greedy regex gets wrong', () => {
        const src = `/* outer /* inner */ still comment */ CREATE TABLE [__mj].[Real] (ID int)`;
        const out = stripSqlComments(src);
        expect(out).toContain('[Real]');
        expect(out).not.toContain('still comment');
    });

    it('preserves bracketed identifiers containing quote characters', () => {
        const src = `CREATE TABLE [__mj].[Real] ([od'd] int)`;
        expect(stripSqlComments(src)).toContain('[Real]');
    });
});

describe('migrationOrderKey', () => {
    it('reads the 12-digit version from V and B filenames', () => {
        expect(migrationOrderKey('migrations/v6/V202608092321__v6.1.x__X.sql')).toBe('202608092321');
        expect(migrationOrderKey('migrations/v5/B202607091514__v5.0__Baseline.sql')).toBe('202607091514');
    });

    it('sorts repeatable and unrecognised names last, as Flyway runs them', () => {
        expect(migrationOrderKey('migrations/R__RefreshMetadata.sql')).toBe('999999999999');
        expect(migrationOrderKey('migrations/v6/whatever.sql')).toBe('999999999999');
    });
});

describe('scanMigrations — last operation wins, in Flyway order', () => {
    const files = {
        'migrations/v6/V202601010000__create_both.sql':
            'CREATE TABLE [${flyway:defaultSchema}].[AIModelPriceUnitType] (ID uniqueidentifier)\n' +
            'CREATE TABLE [__mj].[Workflow] (ID int)',
        'migrations/v6/V202602010000__retire_workflow.sql': 'DROP TABLE [${flyway:defaultSchema}].[Workflow]',
        'migrations/v6/V202603010000__idempotent_guard.sql':
            'DROP TABLE IF EXISTS [__mj].[Snapshot]\nCREATE TABLE [__mj].[Snapshot] (ID int)',
        'migrations/v6/V202604010000__revive_workflow.sql': 'CREATE TABLE [__mj].[Workflow] (ID int)',
    };
    const read = (f) => files[f];
    const names = Object.keys(files);

    it('records both schema spellings', () => {
        const { created } = scanMigrations([names[0]], read);
        expect([...created.keys()].sort()).toEqual(['aimodelpriceunittype', 'workflow']);
    });

    it('treats a table dropped by a later migration as gone', () => {
        const { created } = scanMigrations([names[0], names[1]], read);
        expect(created.has('workflow')).toBe(false);
        expect(created.has('aimodelpriceunittype')).toBe(true);
    });

    it('treats DROP IF EXISTS above a CREATE in the same file as created', () => {
        // The idempotent-guard shape. Under the old global drop-set union this punched a
        // permanent hole: the table was exempt from check 2 forever.
        const { created } = scanMigrations([names[2]], read);
        expect(created.get('snapshot')).toBe(names[2]);
    });

    it('treats a table re-created after being dropped as created again', () => {
        const { created } = scanMigrations(names, read);
        expect(created.get('workflow')).toBe(names[3]);
    });

    it('orders by migration version, not by the order files are handed in', () => {
        const shuffled = [names[3], names[1], names[0]];
        const { created } = scanMigrations(shuffled, read);
        expect(created.get('workflow')).toBe(names[3]);
    });
});

describe('findMissingSubclasses', () => {
    const scan = (created) => ({ created: new Map(created) });

    it('flags a created table with no generated subclass — the #3737 shape', () => {
        const missing = findMissingSubclasses(scan([['aimodelpriceunittype', 'a.sql']]), new Set());
        expect(missing).toEqual([{ table: 'aimodelpriceunittype', file: 'a.sql' }]);
    });

    it('passes once the subclass ships', () => {
        expect(findMissingSubclasses(scan([['aimodelpriceunittype', 'a.sql']]), new Set(['aimodelpriceunittype']))).toEqual([]);
    });

    it('does not flag an allowlisted non-entity table', () => {
        expect(NON_ENTITY_TABLES.has('systemevent')).toBe(true);
        expect(findMissingSubclasses(scan([['systemevent', 'a.sql']]), new Set())).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// End-to-end: build a miniature repo on disk and run the real CLI against it.
// ---------------------------------------------------------------------------

/**
 * Write a minimal repo whose three generated artifacts agree on `entities`, plus one
 * migration per entry in `tables`.
 *
 * Filenames carry real 12-digit Flyway versions so ORDER is explicit rather than resting on
 * the unrecognised-name tiebreak — `extraSql` migrations sort after `tables` migrations, which
 * is what makes the create-then-retire fixture mean what it says.
 */
function makeRepo({ entities, tables = [], extraSql = [] }) {
    const dir = mkdtempSync(join(tmpdir(), 'codegen-tail-'));
    const write = (rel, content) => {
        mkdirSync(dirname(join(dir, rel)), { recursive: true });
        writeFileSync(join(dir, rel), content);
    };
    write(
        ARTIFACTS.subclasses,
        entities
            .map(
                (e) =>
                    `/**\n * * Base Table: ${e.table}\n */\nexport class MJ${e.name}Entity extends BaseEntity<MJ${e.name}EntityType> {}\n`
            )
            .join('\n')
    );
    write(
        ARTIFACTS.server,
        `import { ${entities.map((e) => `MJ${e.name}Entity`).join(', ')} } from '@memberjunction/core-entities';`
    );
    write(
        ARTIFACTS.forms,
        entities.map((e) => `import { MJ${e.name}FormComponent } from "./Entities/MJ${e.name}/f.form.component";`).join('\n')
    );
    tables.forEach((t, i) =>
        write(
            `migrations/v6/V20260101${String(i).padStart(4, '0')}__v6.1.x__create.sql`,
            `CREATE TABLE [\${flyway:defaultSchema}].[${t}] (ID int)`
        )
    );
    extraSql.forEach((sql, i) =>
        write(`migrations/v6/V20260601${String(i).padStart(4, '0')}__v6.1.x__extra.sql`, sql)
    );
    return dir;
}

const run = (dir, ...args) => spawnSync(process.execPath, [SCRIPT, ...args, dir], { encoding: 'utf8' });

describe('CLI end-to-end', () => {
    const dirs = [];
    const repo = (spec) => {
        const d = makeRepo(spec);
        dirs.push(d);
        return d;
    };
    afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

    it('passes when the full codegen tail is committed', () => {
        const r = run(repo({ entities: [{ name: 'AIModelPriceUnitType', table: 'AIModelPriceUnitType' }], tables: ['AIModelPriceUnitType'] }));
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('OK');
    });

    it('fails when a migration ships without its subclass (#3737)', () => {
        const r = run(repo({ entities: [], tables: ['AIModelPriceUnitType'] }));
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('aimodelpriceunittype');
        expect(r.stderr).toContain('no generated entity subclass');
    });

    it('fails on a partial tail — subclass present, resolver and form missing', () => {
        const dir = repo({ entities: [{ name: 'AIModelPriceUnitType', table: 'AIModelPriceUnitType' }], tables: ['AIModelPriceUnitType'] });
        writeFileSync(join(dir, ARTIFACTS.server), `import { } from '@memberjunction/core-entities';`);
        writeFileSync(join(dir, ARTIFACTS.forms), '');
        const r = run(dir);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('no MJServer resolvers entry');
        expect(r.stderr).toContain('no Explorer forms entry');
    });

    it('passes when the table was created and later retired', () => {
        const r = run(repo({ entities: [], tables: ['Workflow'], extraSql: ['DROP TABLE [__mj].[Workflow]'] }));
        expect(r.status).toBe(0);
    });

    it('exits 2 — not 0 — when the artifacts are missing entirely', () => {
        const dir = mkdtempSync(join(tmpdir(), 'codegen-tail-empty-'));
        dirs.push(dir);
        const r = run(dir);
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('cannot find');
    });

    it('--json reports findings on stdout and exits 0, so a caller can diff two trees', () => {
        const r = run(repo({ entities: [], tables: ['AIModelPriceUnitType'] }), '--json');
        expect(r.status).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.failures).toHaveLength(1);
        expect(parsed.failures[0]).toContain('aimodelpriceunittype');
        expect(parsed.entityCount).toBe(0);
        expect(parsed.migrationCount).toBe(1);
    });

    it('--json still exits 2 when misconfigured, so an empty failure list cannot be misread', () => {
        // The delta comparison subtracts one failure list from another. A misconfigured run
        // that printed `{"failures": []}` and exited 0 would read as "this tree is clean".
        const dir = mkdtempSync(join(tmpdir(), 'codegen-tail-empty-json-'));
        dirs.push(dir);
        const r = run(dir, '--json');
        expect(r.status).toBe(2);
    });

    it('a comment mentioning CREATE TABLE does not count as a table', () => {
        const r = run(
            repo({
                entities: [],
                tables: [],
                extraSql: ['-- CREATE TABLE [__mj].[NotReal] (ID int)\nSELECT 1'],
            })
        );
        expect(r.status).toBe(0);
    });
});

describe('CLI --compare-to: fail only on drift the branch introduces', () => {
    const dirs = [];
    const repo = (spec) => {
        const d = makeRepo(spec);
        dirs.push(d);
        return d;
    };
    afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

    it('passes when the only drift is already present at the base', () => {
        // One bad merge onto `next` must not block every subsequent PR — this check is a
        // required context, so a shared failure would be a merge-blocking poison pill.
        const spec = { entities: [], tables: ['AIModelPriceUnitType'] };
        const base = repo(spec);
        const pr = repo(spec);
        const r = run(pr, `--compare-to=${base}`);
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('pre-existing drift');
        expect(r.stdout).toContain('not this PR');
    });

    it('still fails on drift the branch adds on top of pre-existing drift', () => {
        const base = repo({ entities: [], tables: ['AIModelPriceUnitType'] });
        const pr = repo({ entities: [], tables: ['AIModelPriceUnitType', 'BrandNewTable'] });
        const r = run(pr, `--compare-to=${base}`);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('brandnewtable');
        // The inherited one is reported, but does not appear in the failure list.
        expect(r.stderr).toContain('pre-existing drift');
    });

    it('treats every finding as introduced when the base tree cannot be evaluated', () => {
        // Safe direction: an unreadable base must not be read as "it was already broken".
        const emptyBase = mkdtempSync(join(tmpdir(), 'codegen-tail-nobase-'));
        dirs.push(emptyBase);
        const pr = repo({ entities: [], tables: ['AIModelPriceUnitType'] });
        const r = run(pr, `--compare-to=${emptyBase}`);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('could not evaluate the base tree');
        expect(r.stderr).toContain('aimodelpriceunittype');
    });

    it('is clean when neither tree has drift', () => {
        const spec = { entities: [{ name: 'X', table: 'X' }], tables: ['X'] };
        const r = run(repo(spec), `--compare-to=${repo(spec)}`);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('OK');
    });
});

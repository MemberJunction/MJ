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

describe('scanMigrations', () => {
    const read = (f) => ({
        'a.sql': `CREATE TABLE [\${flyway:defaultSchema}].[AIModelPriceUnitType] (ID uniqueidentifier)`,
        'b.sql': `CREATE TABLE [__mj].[Workflow] (ID int)`,
        'c.sql': `DROP TABLE [\${flyway:defaultSchema}].[Workflow]`,
        'd.sql': `DROP TABLE IF EXISTS [__mj].[OutputTriggerType]`,
    })[f];

    it('records both schema spellings and tracks drops', () => {
        const { created, dropped } = scanMigrations(['a.sql', 'b.sql', 'c.sql', 'd.sql'], read);
        expect([...created.keys()].sort()).toEqual(['aimodelpriceunittype', 'workflow']);
        expect(created.get('aimodelpriceunittype')).toBe('a.sql');
        expect(dropped).toEqual(new Set(['workflow', 'outputtriggertype']));
    });
});

describe('findMissingSubclasses', () => {
    const scan = (created, dropped = []) => ({ created: new Map(created), dropped: new Set(dropped) });

    it('flags a created table with no generated subclass — the #3737 shape', () => {
        const missing = findMissingSubclasses(scan([['aimodelpriceunittype', 'a.sql']]), new Set());
        expect(missing).toEqual([{ table: 'aimodelpriceunittype', file: 'a.sql' }]);
    });

    it('passes once the subclass ships', () => {
        expect(findMissingSubclasses(scan([['aimodelpriceunittype', 'a.sql']]), new Set(['aimodelpriceunittype']))).toEqual([]);
    });

    it('does not flag a table a later migration retired', () => {
        expect(findMissingSubclasses(scan([['workflow', 'a.sql']], ['workflow']), new Set())).toEqual([]);
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
 * migration per entry in `tables`. `--all` is used so the run never depends on git.
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
    tables.forEach((t, i) => write(`migrations/v6/V${i}__create.sql`, `CREATE TABLE [\${flyway:defaultSchema}].[${t}] (ID int)`));
    extraSql.forEach((sql, i) => write(`migrations/v6/V9${i}__extra.sql`, sql));
    return dir;
}

const run = (dir) => spawnSync(process.execPath, [SCRIPT, '--all', dir], { encoding: 'utf8' });

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
});

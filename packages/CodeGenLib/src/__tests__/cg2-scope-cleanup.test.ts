/**
 * Scope-aware cleanup and stale-relationship wiring.
 *   - #3384: out of scope means untouched, not deleted. The Angular orphan cleanup keeps form
 *     directories of entities in excluded schemas; the SQL file cleanup only clears in-scope schema
 *     directories; an includeSchemas entry that matches no database schema is reported.
 *   - #2071: the run calls CleanupStaleEntityRelationships report-only unless the
 *     cleanupStaleRelationships option is set, and refreshes metadata only when rows were deleted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const state = vi.hoisted(() => ({
    config: { excludeSchemas: [] as string[], cleanupStaleRelationships: false as boolean },
    metadataEntities: [] as Array<{ ClassName: string; SchemaName: string }>,
    metadataLoaded: true,
    refreshCount: 0,
}));

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../Config/config')>();
    return { ...actual, configInfo: state.config };
});
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeMetadata {
        get Entities() {
            if (!state.metadataLoaded) throw new TypeError("Cannot read properties of undefined (reading 'Entities')");
            return state.metadataEntities;
        }
        async Refresh() { state.refreshCount++; return true; }
    }
    return { ...actual, Metadata: FakeMetadata };
});

import { EntityInfo } from '@memberjunction/core';
import { AngularClientGeneratorBase } from '../Angular/angular-codegen';
import { SQLCodeGenBase, EntitiesNotInExcludedSchemas } from '../Database/sql_codegen';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { FindUnmatchedIncludeSchemas } from '../Database/schema-scope';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

const tempDirs: string[] = [];
function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-cg2-scope-'));
    tempDirs.push(dir);
    return dir;
}

function entity(name: string, schema: string): EntityInfo {
    return new EntityInfo({
        ID: `id-${name}`, Name: name, ClassName: name, SchemaName: schema, BaseTable: name, BaseView: `vw${name}`,
        IncludeInAPI: true,
        EntityFields: [{ ID: `${name}-pk`, Name: 'ID', Type: 'uniqueidentifier', Sequence: 1, IsPrimaryKey: true }],
    });
}

beforeEach(() => {
    state.config.excludeSchemas = [];
    state.config.cleanupStaleRelationships = false;
    state.metadataEntities = [];
    state.metadataLoaded = true;
    state.refreshCount = 0;
});

afterEach(() => {
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
});

describe('FindUnmatchedIncludeSchemas (#3384 item 2)', () => {
    it('returns entries that match no database schema, in their authored spelling', () => {
        expect(FindUnmatchedIncludeSchemas(['__mj', 'app_a'], ['app_a', 'app_typo'])).toEqual(['app_typo']);
    });

    it('matches case-insensitively and trims', () => {
        expect(FindUnmatchedIncludeSchemas(['__MJ_BizApps'], ['  __mj_bizapps '])).toEqual([]);
    });

    it('reports every entry when none match (the "exclude everything" case)', () => {
        expect(FindUnmatchedIncludeSchemas(['__mj'], ['a', 'b'])).toEqual(['a', 'b']);
    });
});

class TestableAngular extends AngularClientGeneratorBase {
    public Cleanup(entityPath: string, entities: EntityInfo[], outOfScope?: EntityInfo[]): void {
        if (outOfScope) {
            this.cleanupOrphanedEntityDirectories(entityPath, entities, outOfScope);
        } else {
            this.cleanupOrphanedEntityDirectories(entityPath, entities);
        }
    }
}

describe('Angular orphan cleanup keeps out-of-scope entity directories (#3384 item 1)', () => {
    function seedDirs(...names: string[]): string {
        const root = makeTempDir();
        for (const n of names) {
            fs.mkdirSync(path.join(root, n, 'nested'), { recursive: true });
        }
        return root;
    }

    it('removes a directory matching no entity but keeps one whose entity is out of scope', () => {
        const root = seedDirs('Orders', 'CoreUsers', 'DeletedThing');
        new TestableAngular().Cleanup(root, [entity('Orders', 'app')], [entity('CoreUsers', '__mj')]);
        expect(fs.readdirSync(root).sort()).toEqual(['CoreUsers', 'Orders']);
    });

    it('by default treats loaded entities in excludeSchemas as out of scope', () => {
        state.config.excludeSchemas = ['__MJ'];
        state.metadataEntities = [entity('CoreUsers', '__mj'), entity('OtherApp', 'other')];
        const root = seedDirs('Orders', 'CoreUsers', 'OtherApp');
        new TestableAngular().Cleanup(root, [entity('Orders', 'app')]);
        // OtherApp's schema is in scope, so a directory absent from this pass's list is still an orphan.
        expect(fs.readdirSync(root).sort()).toEqual(['CoreUsers', 'Orders']);
    });

    it('removes nothing when schemas are excluded but metadata is not loaded', () => {
        state.config.excludeSchemas = ['__mj'];
        state.metadataLoaded = false;
        const root = seedDirs('Orders', 'CoreUsers');
        new TestableAngular().Cleanup(root, [entity('Orders', 'app')]);
        expect(fs.readdirSync(root).sort()).toEqual(['CoreUsers', 'Orders']);
    });

    it('with nothing excluded, behaves as before: only this pass entities survive', () => {
        state.metadataEntities = [entity('CoreUsers', '__mj')];
        const root = seedDirs('Orders', 'CoreUsers');
        new TestableAngular().Cleanup(root, [entity('Orders', 'app')]);
        expect(fs.readdirSync(root)).toEqual(['Orders']);
    });
});

describe('SQL generated-file cleanup only touches in-scope schemas (#3384 item 1)', () => {
    it('leaves an excluded schema directory generated files in place', () => {
        const root = makeTempDir();
        for (const schema of ['app', '__mj']) {
            fs.mkdirSync(path.join(root, schema));
            fs.writeFileSync(path.join(root, schema, 'X.generated.sql'), '--');
            fs.writeFileSync(path.join(root, schema, 'X.permissions.generated.sql'), '--');
        }
        const baseline = [entity('Orders', 'app'), entity('CoreUsers', '__mj')];
        // The run passes the scope-narrowed list, as STEP 2(a) does.
        new SQLCodeGenBase().DeleteGeneratedEntityFiles(root, EntitiesNotInExcludedSchemas(baseline, ['__mj']));
        expect(fs.readdirSync(path.join(root, 'app'))).toEqual([]);
        expect(fs.readdirSync(path.join(root, '__mj')).sort()).toEqual(['X.generated.sql', 'X.permissions.generated.sql']);
    });
});

class TestableSQLCodeGen extends SQLCodeGenBase {
    public RunCleanup(manageMD: ManageMetadataBase): Promise<boolean> {
        return this.CleanupStaleRelationships({} as CodeGenConnection, manageMD);
    }
}

/** A ManageMetadataBase whose cleanup records its call and reports a fixed result. */
class FakeManageMetadata extends ManageMetadataBase {
    public Calls: Array<{ excludeSchemas: string[]; dryRun: boolean | undefined }> = [];
    constructor(private result: boolean, private removed: number) {
        super();
    }
    public override async CleanupStaleEntityRelationships(_pool: CodeGenConnection, excludeSchemas: string[], options: { DryRun?: boolean } = {}): Promise<boolean> {
        this.Calls.push({ excludeSchemas, dryRun: options.DryRun });
        return this.result;
    }
    public override get StaleRelationshipsRemoved(): number {
        return this.removed;
    }
}

describe('stale relationship cleanup in the run (#2071)', () => {
    it('is a dry run by default, scoped to the run exclude list, with no metadata refresh', async () => {
        state.config.excludeSchemas = ['__mj'];
        const mm = new FakeManageMetadata(true, 0);
        expect(await new TestableSQLCodeGen().RunCleanup(mm)).toBe(true);
        expect(mm.Calls).toEqual([{ excludeSchemas: ['__mj'], dryRun: true }]);
        expect(state.refreshCount).toBe(0);
    });

    it('deletes when cleanupStaleRelationships is set and refreshes metadata when rows were removed', async () => {
        state.config.cleanupStaleRelationships = true;
        const mm = new FakeManageMetadata(true, 2);
        expect(await new TestableSQLCodeGen().RunCleanup(mm)).toBe(true);
        expect(mm.Calls[0].dryRun).toBe(false);
        expect(state.refreshCount).toBe(1);
    });

    it('does not refresh when the delete run found nothing stale', async () => {
        state.config.cleanupStaleRelationships = true;
        await new TestableSQLCodeGen().RunCleanup(new FakeManageMetadata(true, 0));
        expect(state.refreshCount).toBe(0);
    });

    it('reports failure when the cleanup fails', async () => {
        expect(await new TestableSQLCodeGen().RunCleanup(new FakeManageMetadata(false, 0))).toBe(false);
    });
});

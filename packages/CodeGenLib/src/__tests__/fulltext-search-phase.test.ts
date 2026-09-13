import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

/**
 * Full-text search on PostgreSQL — the phase, the function name, and the GRANT.
 *
 * Three defects that only make sense together: the phased executor had no
 * full-text phase (so the generated DDL was written to a file and never run),
 * `Entity.FullTextSearchFunction` was stamped with the SQL Server naming scheme
 * before the provider was asked (so the recorded name never existed on PG and
 * could not heal), and the permissions replay then issued a bare `GRANT EXECUTE`
 * on that missing function, whose 42883 failed the entire CodeGen run.
 */

// ─── Metadata write-back capture ─────────────────────────────────────────
// generateEntityFullTextSearchSQL persists the function name through
// Metadata/UserCache. Both are replaced so the write-back is observable
// without a database or a provider.
const writeBack = vi.hoisted(() => {
    const record: { savedName: string | null; saveCount: number; loadedID: string | null } = {
        savedName: null,
        saveCount: 0,
        loadedID: null,
    };
    class FakeEntityObject {
        public FullTextSearchFunction: string | null = null;
        public async Load(id: string): Promise<boolean> {
            record.loadedID = id;
            return true;
        }
        public async Save(): Promise<boolean> {
            record.savedName = this.FullTextSearchFunction;
            record.saveCount++;
            return true;
        }
    }
    class FakeMetadata {
        public async GetEntityObject(): Promise<FakeEntityObject> {
            return new FakeEntityObject();
        }
    }
    return { record, FakeMetadata };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, Metadata: writeBack.FakeMetadata };
});

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return {
        ...actual,
        UserCache: { Instance: { Users: [{ ID: 'user-1', Name: 'codegen' }] } },
    };
});

// ─── Fixtures ────────────────────────────────────────────────────────────

/** A minimal full-text-enabled entity: one PK plus one searchable text field. */
function makeEntity(overrides: Record<string, unknown> = {}, permissions: Record<string, unknown>[] = []): EntityInfo {
    return new EntityInfo({
        ID: 'entity-1',
        Name: 'Test Entity',
        SchemaName: '__mj',
        BaseTable: 'TestEntity',
        BaseTableCodeName: 'TestEntity',
        BaseView: 'vwTestEntities',
        IncludeInAPI: true,
        AllowCreateAPI: false,
        AllowUpdateAPI: false,
        AllowDeleteAPI: false,
        CascadeDeletes: false,
        DeleteType: 'Hard',
        spCreate: '',
        spUpdate: '',
        spDelete: '',
        FullTextSearchEnabled: true,
        FullTextIndexGenerated: false,
        FullTextSearchFunctionGenerated: true,
        FullTextSearchFunction: '',
        EntityFields: [
            {
                ID: 'pk-field-1',
                Name: 'ID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: true,
                AllowsNull: false,
                AllowUpdateAPI: true,
                IsVirtual: false,
                AutoIncrement: false,
                DefaultValue: '',
            },
            {
                ID: 'name-field-1',
                Name: 'Name',
                Type: 'nvarchar',
                Length: 510,
                IsPrimaryKey: false,
                AllowsNull: false,
                AllowUpdateAPI: true,
                IsVirtual: false,
                AutoIncrement: false,
                DefaultValue: '',
                FullTextSearchEnabled: true,
            },
        ],
        EntityPermissions: permissions,
        ...overrides,
    });
}

/** Records every statement the phased executor sends, in order. */
type RecordingClient = {
    query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
    release: () => void;
};

function makeRecordingClient(log: string[]): RecordingClient {
    return {
        query: async (sql: string) => {
            log.push(sql);
            return { rows: [] };
        },
        release: () => undefined,
    };
}

/** Installs `client` in place of the provider's pooled connection. */
function useRecordingClient(provider: PostgreSQLCodeGenProvider, client: RecordingClient): void {
    vi.spyOn(
        provider as unknown as { acquireCodeGenClient: () => Promise<RecordingClient> },
        'acquireCodeGenClient'
    ).mockResolvedValue(client);
}

/** Exposes the phased dispatcher and lets a test replace the full-text generator. */
class CodeGenProbe extends SQLCodeGenBase {
    public fullTextCalls = 0;
    public fullTextResult: { sql: string; functionName: string } | Error = {
        sql: '-- fts ddl',
        functionName: 'fn_search_test_entity',
    };

    public override async generateEntityFullTextSearchSQL(
        _pool: CodeGenConnection,
        _entity: EntityInfo
    ): Promise<{ sql: string; functionName: string }> {
        this.fullTextCalls++;
        if (this.fullTextResult instanceof Error) {
            throw this.fullTextResult;
        }
        return this.fullTextResult;
    }
}

const NO_POOL = {} as unknown as CodeGenConnection;

describe('PostgreSQL full-text search phase', () => {
    let provider: PostgreSQLCodeGenProvider;

    beforeEach(() => {
        vi.restoreAllMocks();
        writeBack.record.savedName = null;
        writeBack.record.saveCount = 0;
        writeBack.record.loadedID = null;
        provider = new PostgreSQLCodeGenProvider();
    });

    // ─── FTS-1: the phase exists, and runs where it must ─────────────────
    describe('executeEntityPhased ordering', () => {
        it('runs the full-text DDL after the view and before the view permissions', async () => {
            const log: string[] = [];
            useRecordingClient(provider, makeRecordingClient(log));

            const result = await provider.executeEntityPhased!({
                entity: makeEntity(),
                tvfSQL: '-- TVF MARKER',
                viewSQL: '-- VIEW MARKER',
                crudCreateSQL: '-- CRUD MARKER',
                crudUpdateSQL: '',
                crudDeleteSQL: '',
                ftsSQL: '-- FTS MARKER',
                viewPermSQL: '-- PERM MARKER',
            });

            expect(result.success).toBe(true);

            const at = (marker: string): number => log.findIndex((sql) => sql.includes(marker));
            expect(at('FTS MARKER')).toBeGreaterThan(-1); // the phase ran at all
            expect(at('FTS MARKER')).toBeGreaterThan(at('VIEW MARKER'));
            expect(at('FTS MARKER')).toBeLessThan(at('PERM MARKER'));
        });

        it('reports a full-text execution failure as its own phase', async () => {
            const client: RecordingClient = {
                query: async (sql: string) => {
                    if (sql.includes('FTS MARKER')) {
                        throw new Error('42P01: relation does not exist');
                    }
                    return { rows: [] };
                },
                release: () => undefined,
            };
            useRecordingClient(provider, client);

            const result = await provider.executeEntityPhased!({
                entity: makeEntity(),
                tvfSQL: '',
                viewSQL: '-- VIEW MARKER',
                crudCreateSQL: '',
                crudUpdateSQL: '',
                crudDeleteSQL: '',
                ftsSQL: '-- FTS MARKER',
                viewPermSQL: '-- PERM MARKER',
            });

            expect(result.success).toBe(false);
            expect(result.phase).toBe('fulltext');
            expect(result.error).toBeInstanceOf(Error);
        });

        it('skips the phase when the entity has no full-text search', async () => {
            const log: string[] = [];
            useRecordingClient(provider, makeRecordingClient(log));

            await provider.executeEntityPhased!({
                entity: makeEntity({ FullTextSearchEnabled: false }),
                tvfSQL: '',
                viewSQL: '-- VIEW MARKER',
                crudCreateSQL: '',
                crudUpdateSQL: '',
                crudDeleteSQL: '',
                ftsSQL: '',
                viewPermSQL: '-- PERM MARKER',
            });

            expect(log).toEqual(['-- VIEW MARKER', '-- PERM MARKER']);
        });
    });

    // ─── FTS-1 (caller side): the DDL reaches the provider ───────────────
    describe('executeEntityInPhases full-text piece', () => {
        it('hands the generated full-text DDL to the provider', async () => {
            const codeGen = new CodeGenProbe();
            codeGen.DBProvider = provider;
            const phased = vi
                .spyOn(provider, 'executeEntityPhased')
                .mockResolvedValue({ success: true, phase: null });

            const result = await codeGen.executeEntityInPhases(NO_POOL, makeEntity(), undefined);

            expect(result.success).toBe(true);
            expect(codeGen.fullTextCalls).toBe(1);
            expect(phased).toHaveBeenCalledTimes(1);
            expect(phased.mock.calls[0][0].ftsSQL).toBe('-- fts ddl');
        });

        it('passes no full-text DDL for an entity without full-text search', async () => {
            const codeGen = new CodeGenProbe();
            codeGen.DBProvider = provider;
            const phased = vi
                .spyOn(provider, 'executeEntityPhased')
                .mockResolvedValue({ success: true, phase: null });

            await codeGen.executeEntityInPhases(NO_POOL, makeEntity({ FullTextSearchEnabled: false }), undefined);

            expect(codeGen.fullTextCalls).toBe(0);
            expect(phased.mock.calls[0][0].ftsSQL).toBe('');
        });

        it('reports a full-text GENERATION failure as its own phase and never executes the entity', async () => {
            const codeGen = new CodeGenProbe();
            codeGen.DBProvider = provider;
            codeGen.fullTextResult = new Error('no fields are marked as FullTextSearchEnabled');
            const phased = vi
                .spyOn(provider, 'executeEntityPhased')
                .mockResolvedValue({ success: true, phase: null });

            const result = await codeGen.executeEntityInPhases(NO_POOL, makeEntity(), undefined);

            expect(result.success).toBe(false);
            expect(result.phase).toBe('fulltext-generate');
            expect(result.error?.message).toContain('FullTextSearchEnabled');
            // Swallowing the throw would have produced an empty ftsSQL and a
            // "successful" entity with no full-text objects in the database.
            expect(phased).not.toHaveBeenCalled();
        });
    });

    // ─── FTS-3: the GRANT cannot kill the run ────────────────────────────
    describe('generateFullTextSearchPermissions', () => {
        const withRoles = (): EntityInfo =>
            makeEntity({}, [
                { RoleSQLName: 'mj_reader', CanRead: true },
                { RoleSQLName: 'mj_admin', CanRead: true },
            ]);

        it('guards every GRANT with a pg_proc existence check', () => {
            const sql = provider.generateFullTextSearchPermissions(withRoles(), 'fn_search_test_entity');

            const blocks = sql.split('DO $mjfts$');
            // Nothing before the first guard block may contain a GRANT.
            expect(blocks[0]).not.toContain('GRANT');
            expect(blocks.length).toBe(3); // two roles, two guarded blocks
            for (const block of blocks.slice(1)) {
                const grantAt = block.indexOf('GRANT EXECUTE ON FUNCTION');
                expect(grantAt).toBeGreaterThan(-1);
                const guard = block.slice(0, grantAt);
                expect(guard).toContain('pg_proc');
                expect(guard).toContain('pg_namespace');
                expect(guard).toContain('IF EXISTS');
            }
            expect(sql).toContain('RAISE NOTICE');
            expect(sql).toContain("n.nspname = '__mj'");
            expect(sql).toContain("p.proname = 'fn_search_test_entity'");
        });

        it('never emits an unguarded GRANT EXECUTE statement', () => {
            const sql = provider.generateFullTextSearchPermissions(withRoles(), 'fn_search_test_entity');

            // Strip the guard blocks; a GRANT surviving that is one PG would run
            // unconditionally, which is the 42883 that failed the whole run.
            const withoutGuards = sql.replace(/DO \$mjfts\$[\s\S]*?END \$mjfts\$;/g, '');
            expect(withoutGuards).not.toContain('GRANT');
        });

        it("single-quote-escapes the schema and function literals", () => {
            const entity = makeEntity({ SchemaName: "o'brien" }, [{ RoleSQLName: 'mj_reader', CanRead: true }]);

            const sql = provider.generateFullTextSearchPermissions(entity, "fn_o'brien");

            expect(sql).toMatch(/n\.nspname = 'o''brien'/);
            expect(sql).toMatch(/p\.proname = 'fn_o''brien'/);
        });

        it('emits nothing when the entity has no roles', () => {
            expect(provider.generateFullTextSearchPermissions(makeEntity(), 'fn_search_test_entity')).toBe('');
        });
    });

    // ─── FTS-2: the recorded function name is the provider's ─────────────
    describe('generateEntityFullTextSearchSQL function-name write-back', () => {
        it('heals a name stamped with another platform\'s scheme', async () => {
            const codeGen = new SQLCodeGenBase();
            codeGen.DBProvider = provider;
            const entity = makeEntity({ FullTextSearchFunction: 'fnSearchTestEntity' });

            const result = await codeGen.generateEntityFullTextSearchSQL(NO_POOL, entity);

            // The provider's name — fn_search_<snake(BaseTable)> — is what PG creates.
            expect(result.functionName).toBe('fn_search_test_entity');
            expect(writeBack.record.saveCount).toBe(1);
            expect(writeBack.record.savedName).toBe('fn_search_test_entity');
            expect(writeBack.record.loadedID).toBe('entity-1');
        });

        it('fills an empty stored name with the provider-derived name', async () => {
            const codeGen = new SQLCodeGenBase();
            codeGen.DBProvider = provider;

            await codeGen.generateEntityFullTextSearchSQL(NO_POOL, makeEntity());

            expect(writeBack.record.saveCount).toBe(1);
            expect(writeBack.record.savedName).toBe('fn_search_test_entity');
        });

        it('writes nothing when the stored name already matches the provider', async () => {
            const codeGen = new SQLCodeGenBase();
            codeGen.DBProvider = provider;
            const entity = makeEntity({ FullTextSearchFunction: 'fn_search_test_entity' });

            await codeGen.generateEntityFullTextSearchSQL(NO_POOL, entity);

            expect(writeBack.record.saveCount).toBe(0);
        });

        it('grants on the same function name the provider created', async () => {
            const codeGen = new SQLCodeGenBase();
            codeGen.DBProvider = provider;
            const entity = makeEntity({ FullTextSearchFunction: 'fnSearchTestEntity' }, [
                { RoleSQLName: 'mj_reader', CanRead: true },
            ]);

            const result = await codeGen.generateEntityFullTextSearchSQL(NO_POOL, entity);

            expect(result.sql).toContain('CREATE OR REPLACE FUNCTION "__mj"."fn_search_test_entity"');
            expect(result.sql).toContain('GRANT EXECUTE ON FUNCTION "__mj"."fn_search_test_entity"');
            expect(result.sql).not.toContain('fnSearchTestEntity');
        });
    });
});

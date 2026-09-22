import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Full-text search residue: a SQL-Server precondition enforced on PostgreSQL, and a
 * write-back whose guard could not fire.
 *
 * 1. `generateEntityFullTextSearchSQL` resolved the table's PHYSICAL primary-key index name
 *    whenever `FullTextIndexGenerated` was set, on every platform. That lookup THROWS when the
 *    table carries no `PRIMARY KEY` constraint — a legitimate shape on PostgreSQL, where MJ's
 *    primary key may be declared in metadata only. Only SQL Server consumes the name
 *    (`CREATE FULLTEXT INDEX … KEY INDEX <name>`); PostgreSQL builds a GIN index over a
 *    `tsvector` column and never mentions it. So a PK-constraint-less PG table could not have
 *    full-text search generated at all, for want of a name nothing was going to use.
 *
 * 2. The function-name write-back read `UserCache.Instance.Users[0]` and then guarded the
 *    ELEMENT (`if (!u) throw`). A cache whose backing array is undefined therefore threw a bare
 *    `TypeError: Cannot read properties of undefined (reading '0')` before the intended message
 *    could be produced — the guard checked the wrong thing. The write-back stays FATAL: it is the
 *    only path that records `Entity.FullTextSearchFunction`, so skipping it would create the
 *    function in the database, record nothing, and report success.
 */

// ─── Metadata write-back capture ─────────────────────────────────────────
// The write-back persists through Metadata + an entity object. Both are replaced so the write is
// observable without a database.
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

// ─── UserCache, with a settable backing array ────────────────────────────
// `users` is deliberately typed to include `undefined`: an undefined backing array is the exact
// runtime state that produced the TypeError, and a test that cannot express it cannot pin the fix.
const cache = vi.hoisted(() => {
    const state: { users: unknown } = { users: [] };
    return { state };
});

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return {
        ...actual,
        UserCache: {
            get Instance() {
                return {
                    get Users() {
                        return cache.state.users;
                    },
                };
            },
        },
    };
});

import { EntityInfo, type UserInfo } from '@memberjunction/core';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLCodeGenBase } from '../Database/sql_codegen';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

// ─── Fixtures ────────────────────────────────────────────────────────────

type Init = Record<string, unknown>;

/** A full-text-enabled entity: one primary key plus one searchable text field. */
function makeEntity(overrides: Init = {}): EntityInfo {
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
        FullTextIndexGenerated: true,
        FullTextSearchFunctionGenerated: true,
        FullTextSearchFunction: 'fnSearchTestEntity',
        EntityFields: [
            {
                ID: 'pk-field-1',
                Name: 'ID',
                CodeName: 'ID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: true,
                AllowsNull: false,
                AllowUpdateAPI: false,
                IsVirtual: false,
                AutoIncrement: false,
                DefaultValue: '',
            },
            {
                ID: 'name-field-1',
                Name: 'Name',
                CodeName: 'Name',
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
        EntityPermissions: [],
        ...overrides,
    });
}

/**
 * A connection standing in for a table with NO `PRIMARY KEY` constraint: the PK-index query
 * returns no rows, which is what makes `getEntityPrimaryKeyIndexName` throw. Every statement is
 * recorded so a test can assert the lookup did not even reach the database.
 */
function makePKLessConnection(log: string[]): CodeGenConnection {
    return {
        query: async (sql: string) => {
            log.push(sql);
            return { recordset: [] };
        },
    } as unknown as CodeGenConnection;
}

/** A connection for a table that does have a PK index. */
function makeIndexedConnection(log: string[], indexName = 'PK_TestEntity'): CodeGenConnection {
    return {
        query: async (sql: string) => {
            log.push(sql);
            return { recordset: [{ IndexName: indexName }] };
        },
    } as unknown as CodeGenConnection;
}

function codeGenFor(provider: PostgreSQLCodeGenProvider | SQLServerCodeGenProvider): SQLCodeGenBase {
    const codeGen = new SQLCodeGenBase();
    codeGen.DBProvider = provider;
    return codeGen;
}

describe('full-text search: the PK-index precondition belongs to SQL Server only', () => {
    beforeEach(() => {
        cache.state.users = [{ ID: 'user-1', Name: 'codegen' } as UserInfo];
        writeBack.record.savedName = null;
        writeBack.record.saveCount = 0;
        writeBack.record.loadedID = null;
    });

    describe('the capability is declared by the provider that consumes the name', () => {
        it('PostgreSQL does not need it', () => {
            expect(new PostgreSQLCodeGenProvider().FullTextIndexNeedsPrimaryKeyIndexName).toBe(false);
        });

        it('SQL Server does need it', () => {
            expect(new SQLServerCodeGenProvider().FullTextIndexNeedsPrimaryKeyIndexName).toBe(true);
        });
    });

    describe('PostgreSQL', () => {
        it('generates full-text search for a table with no PRIMARY KEY constraint', async () => {
            const log: string[] = [];
            const codeGen = codeGenFor(new PostgreSQLCodeGenProvider());

            const result = await codeGen.generateEntityFullTextSearchSQL(makePKLessConnection(log), makeEntity());

            // Before the fix this rejected with `Could not find primary key index for entity Test Entity`.
            expect(result.sql).toContain('__mj_fts_vector');
            expect(result.sql).toContain('USING GIN(__mj_fts_vector)');
            expect(result.sql).toContain('plainto_tsquery');
        });

        it('never issues the PK-index lookup at all', async () => {
            const log: string[] = [];
            const codeGen = codeGenFor(new PostgreSQLCodeGenProvider());

            await codeGen.generateEntityFullTextSearchSQL(makePKLessConnection(log), makeEntity());

            // Not merely "tolerates a failed lookup" — the round trip is not made.
            expect(log).toEqual([]);
        });

        it('emits no reference to a primary-key index name even when handed one', () => {
            const provider = new PostgreSQLCodeGenProvider();
            const entity = makeEntity();

            const result = provider.generateFullTextSearch(entity, entity.Fields.filter((f) => f.FullTextSearchEnabled), 'PK_INDEX_SENTINEL');

            // This is the claim the fix rests on: the PG objects do not reference the PK index, so
            // requiring its name blocked generation for nothing. If PG ever starts consuming the
            // value, this fails and `FullTextIndexNeedsPrimaryKeyIndexName` must be revisited.
            expect(result.sql).not.toContain('PK_INDEX_SENTINEL');
            expect(result.functionName).toBe('fn_search_test_entity');
        });
    });

    describe('SQL Server behaviour is unchanged', () => {
        it('still resolves the PK index name and puts it in KEY INDEX', async () => {
            const log: string[] = [];
            const codeGen = codeGenFor(new SQLServerCodeGenProvider());

            const result = await codeGen.generateEntityFullTextSearchSQL(makeIndexedConnection(log), makeEntity());

            expect(log.length).toBe(1);
            expect(log[0]).toContain('sys.indexes');
            expect(result.sql).toContain('KEY INDEX PK_TestEntity');
        });

        it('still fails loudly when a SQL Server table has no PK index to name', async () => {
            const log: string[] = [];
            const codeGen = codeGenFor(new SQLServerCodeGenProvider());

            await expect(
                codeGen.generateEntityFullTextSearchSQL(makePKLessConnection(log), makeEntity())
            ).rejects.toThrow('Could not find primary key index for entity Test Entity');
            expect(log.length).toBe(1);
        });

        it('skips the lookup when no full-text INDEX is generated', async () => {
            const log: string[] = [];
            const codeGen = codeGenFor(new SQLServerCodeGenProvider());

            await codeGen.generateEntityFullTextSearchSQL(
                makePKLessConnection(log),
                makeEntity({ FullTextIndexGenerated: false })
            );

            expect(log).toEqual([]);
        });
    });
});

describe('full-text search: an empty user cache names the condition and the remedy', () => {
    /** An entity whose stored function name is absent, so the write-back must run. */
    const needsWriteBack = (): EntityInfo =>
        makeEntity({ FullTextIndexGenerated: false, FullTextSearchFunction: '' });

    beforeEach(() => {
        writeBack.record.savedName = null;
        writeBack.record.saveCount = 0;
        writeBack.record.loadedID = null;
    });

    async function captureError(): Promise<Error> {
        const codeGen = codeGenFor(new PostgreSQLCodeGenProvider());
        try {
            await codeGen.generateEntityFullTextSearchSQL(makePKLessConnection([]), needsWriteBack());
        } catch (e) {
            return e as Error;
        }
        throw new Error('expected the write-back to fail, but it succeeded');
    }

    it('an empty cache array produces a named, actionable error', async () => {
        cache.state.users = [];

        const err = await captureError();

        expect(err).not.toBeInstanceOf(TypeError);
        expect(err.message).toContain('Test Entity'); // which entity
        expect(err.message).toContain('FullTextSearchFunction'); // which field could not be written
        expect(err.message).toContain('UserCache.Instance.Refresh'); // why the cache is empty
        expect(err.message).toContain('set FullTextSearchFunction to'); // the remedy
    });

    it('an UNDEFINED cache array produces the same named error, not a TypeError', async () => {
        // The original defect: `.Users[0]` against undefined threw before the guard could speak.
        cache.state.users = undefined;

        const err = await captureError();

        expect(err).not.toBeInstanceOf(TypeError);
        expect(err.message).not.toContain('Cannot read properties of undefined');
        expect(err.message).toContain('FullTextSearchFunction');
        expect(err.message).toContain('set FullTextSearchFunction to');
    });

    it('does not silently skip the write-back — nothing is saved and nothing is returned', async () => {
        cache.state.users = undefined;

        await captureError();

        // A skip would have returned DDL that creates the function while no row records its name.
        expect(writeBack.record.saveCount).toBe(0);
    });

    it('records the name when the cache holds a user', async () => {
        cache.state.users = [{ ID: 'user-1', Name: 'codegen' } as UserInfo];
        const codeGen = codeGenFor(new PostgreSQLCodeGenProvider());

        const result = await codeGen.generateEntityFullTextSearchSQL(makePKLessConnection([]), needsWriteBack());

        expect(writeBack.record.saveCount).toBe(1);
        expect(writeBack.record.loadedID).toBe('entity-1');
        // Which NAME gets recorded is the subject of a separate fix (the provider owns the naming
        // scheme); this test pins only that the write-back happens and writes something.
        expect(writeBack.record.savedName).toBeTruthy();
        expect(result.sql).toContain('__mj_fts_vector');
    });
});

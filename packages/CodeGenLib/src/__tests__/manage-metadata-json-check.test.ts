import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { UserInfo } from '@memberjunction/core';

vi.mock('../Misc/sql_logging', () => ({
    SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) },
}));

import { SQLLogging } from '../Misc/sql_logging';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { CodeGenConnection, CodeGenDatabaseProvider } from '../Database/codeGenDatabaseProvider';
import type { JSONCheckTranslator } from '../Database/json-check-validators';
import { BuildJSONCheckKey, CollectJSONCheckRules, ParseJSONTypeDefinition } from '../Misc/json-type-model';

/**
 * `ManageMetadataBase.manageJSONCheckValidators`: the database-facing half of SQL `@CHECK` on JSONTypes.
 * The resolver logic is covered against stubs in entity-subclass-jsontype-validation.test.ts; this file
 * pins what is specific to the database: the SQL it reads and writes, that reads happen with AI off, and
 * that a database problem never fails the CodeGen run.
 */

const DEFINITION = `/** @mjValidate */
export interface IConfig {
    /** @CHECK (Pct >= 0 AND Pct <= 100) */
    Pct: number;
}`;
const FIELDS = [{ Entity: 'A', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: DEFINITION, Type: 'nvarchar', AllowsNull: true }];
const KEY = (() => {
    const model = ParseJSONTypeDefinition(DEFINITION, 'IConfig')!;
    return BuildJSONCheckKey(model, CollectJSONCheckRules(model)[0], 'A');
})();

class TestMM extends ManageMetadataBase {
    public Translator: JSONCheckTranslator = {
        featureEnabled: () => true,
        ParseJSONCheck: async () => ({ Description: "Percentage isn't out of range", Code: "return value.Pct >= 0 && value.Pct <= 100; // isn't", MethodName: 'M', ModelID: 'model-1', TestCases: [{ Value: { Pct: 5 }, Expected: true }, { Value: { Pct: 500 }, Expected: false }] }),
    };
    protected override get dbProvider(): CodeGenDatabaseProvider {
        return {
            Dialect: new SQLServerDialect(),
            quoteSQLForExecution: (sql: string) => sql,
            conditionalInsertSQL: (check: string, insert: string) => `IF NOT EXISTS (${check}) BEGIN ${insert} END`,
        } as unknown as CodeGenDatabaseProvider;
    }
    protected override createJSONCheckTranslator(): JSONCheckTranslator {
        return this.Translator;
    }
    public Run(pool: CodeGenConnection, generate: boolean): Promise<void> {
        return this.manageJSONCheckValidators(pool, FIELDS, {} as UserInfo, generate);
    }
}

interface FakePool extends CodeGenConnection { Queries: string[] }
function pool(options: { category?: boolean; cached?: Array<Record<string, string>>; failQueries?: boolean } = {}): FakePool {
    const queries: string[] = [];
    return {
        Queries: queries,
        query: async (sql: string) => {
            queries.push(sql);
            if (options.failQueries) throw new Error('connection reset');
            if (/vwGeneratedCodeCategories/.test(sql) && !/GeneratedCode\]/.test(sql.replace(/vwGeneratedCodeCategories/g, ''))) {
                return { recordset: options.category === false ? [] : [{ ID: 'cat-1' }] };
            }
            return { recordset: options.cached ?? [] };
        },
    } as unknown as FakePool;
}

const logged = () => vi.mocked(SQLLogging.LogSQLAndExecute).mock.calls.map((c) => String(c[1]));

beforeEach(() => {
    vi.clearAllMocks();
    (ManageMetadataBase as unknown as { _generatedJSONValidators: unknown[] })._generatedJSONValidators = [];
    (ManageMetadataBase as unknown as { _entitiesWithNewJSONValidators: string[] })._entitiesWithNewJSONValidators = [];
});

describe('manageJSONCheckValidators', () => {
    it('loads cached validators from the JSON-validators category with generation OFF (a --no-ai run keeps them)', async () => {
        const mm = new TestMM();
        mm.Translator = { featureEnabled: () => false, ParseJSONCheck: async () => { throw new Error('must not be called'); } };
        const p = pool({ cached: [{ ID: 'g1', Source: KEY, Name: 'Stored', Code: 'return true;', Description: 'stored description' }] });
        await mm.Run(p, false);
        const published = ManageMetadataBase.GeneratedJSONValidators;
        expect(published).toHaveLength(1);
        expect(published[0].Key).toBe(KEY);
        expect(published[0].FunctionText).toBe('return true;');
        expect(published[0].WasGenerated).toBe(false);
        expect(logged()).toEqual([]); // nothing written
        const read = p.Queries.find((q) => q.includes('[Source]'))!;
        expect(read).toContain("[CategoryID] = (SELECT [ID] FROM [__mj].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: JSON Validators')");
        expect(read).toContain("[Status]='Approved'");
    });

    it('generates a missing rule, publishes it, and writes it to GeneratedCode with a text-derived key and SQL-escaped values', async () => {
        const mm = new TestMM();
        await mm.Run(pool(), true);
        expect(ManageMetadataBase.GeneratedJSONValidators.map((r) => r.Key)).toEqual([KEY]);
        const sql = logged();
        expect(sql).toHaveLength(1);
        expect(sql[0]).toContain('IF NOT EXISTS (SELECT 1 FROM [__mj].[GeneratedCode]');
        expect(sql[0]).toContain(`[Source] = '${KEY}'`);
        // Same Approved scope as LoadCached: a non-Approved row with this key must not suppress the insert.
        expect(sql[0]).toMatch(/\[Source\] = '[^']*' AND \[Status\]='Approved'\)/);
        expect(sql[0]).toContain(`INSERT INTO [__mj].[GeneratedCode]`);
        expect(sql[0]).toContain("'TypeScript', 'Approved'");
        expect(sql[0]).toContain("Percentage isn''t out of range"); // quotes doubled
        expect(sql[0]).toContain("// isn''t");
        expect(sql[0]).not.toMatch(/LinkedEntityID/); // keyed on the type, deliberately not on an entity field
        expect(ManageMetadataBase.GeneratedJSONValidators[0].GeneratedCodeID).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('a newly generated validator marks its entity for file regen; a cached one does not', async () => {
        const mm = new TestMM();
        await mm.Run(pool({ cached: [{ ID: 'g1', Source: KEY, Name: 'Stored', Code: 'return true;', Description: 'd' }] }), true);
        expect(ManageMetadataBase.EntitiesWithNewJSONValidators).toEqual([]);
        await mm.Run(pool(), true);
        expect(ManageMetadataBase.EntitiesWithNewJSONValidators).toEqual(['A']);
    });

    it('does not generate when generateNewCode is false, even if the feature is on', async () => {
        const mm = new TestMM();
        const spy = vi.spyOn(mm.Translator, 'ParseJSONCheck');
        await mm.Run(pool(), false);
        expect(spy).not.toHaveBeenCalled();
        expect(ManageMetadataBase.GeneratedJSONValidators).toEqual([]);
    });

    it('a database with no such category still uses the generated validator for the run, and says how to seed it', async () => {
        const mm = new TestMM();
        await mm.Run(pool({ category: false }), true);
        expect(ManageMetadataBase.GeneratedJSONValidators).toHaveLength(1);
        expect(logged()).toEqual([]); // nothing to insert into
    });

    it('a database failure is logged, not thrown: the run continues without JSON validators', async () => {
        const mm = new TestMM();
        await expect(mm.Run(pool({ failQueries: true }), true)).resolves.toBeUndefined();
        expect(ManageMetadataBase.GeneratedJSONValidators).toEqual([]);
    });

    it('a second run replaces a validator with the same key instead of duplicating it', async () => {
        const mm = new TestMM();
        await mm.Run(pool(), true);
        await mm.Run(pool({ cached: [{ ID: 'g1', Source: KEY, Name: 'Stored', Code: 'return true;', Description: 'd' }] }), false);
        expect(ManageMetadataBase.GeneratedJSONValidators).toHaveLength(1);
        expect(ManageMetadataBase.GeneratedJSONValidators[0].WasGenerated).toBe(false);
    });

    it('does nothing (not even a query) when no opted-in type carries a SQL @CHECK', async () => {
        const mm = new TestMM();
        const p = pool();
        await (mm as unknown as { manageJSONCheckValidators(p: CodeGenConnection, f: unknown[], u: UserInfo, g: boolean): Promise<void> })
            .manageJSONCheckValidators(p, [{ Entity: 'A', Name: 'C', JSONType: 'I', JSONTypeDefinition: '/** @mjValidate */\nexport interface I { N: number }' }], {} as UserInfo, true);
        expect(p.Queries).toEqual([]);
    });
});

/**
 * #6007: concurrent `CreateQueryExtended` calls with the same name.
 *
 * Every request first checks that the name is free, so N requests that arrive together all pass
 * the check and then race to insert. The database's unique index on (Name, CategoryID) lets one
 * win. Before the fix, every loser found the winner's row and returned it as its own result, even
 * with `AutoResolveCollision`, so N callers shared one query. Now:
 *
 * - with `AutoResolveCollision`, a loser picks a new unique name and inserts again (bounded), so
 *   every request gets its own query;
 * - without it, the existing create-or-get behaviour stays: losers get the query that now exists;
 * - the existence lookup reads the database, never a cache.
 *
 * The provider is a stub whose saves yield before inserting, so concurrent saves interleave the
 * way they do against a real database, and whose insert enforces the unique name.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunViewParams } from '@memberjunction/core';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = ['Arg', 'Ctx', 'Field', 'InputType', 'Mutation', 'ObjectType', 'Resolver', 'PubSub', 'Int', 'Float'];
    return { ...Object.fromEntries(exportNames.map((name) => [name, decoratorFactory])), registerEnumType: () => undefined };
});
vi.mock('@memberjunction/core-entities-server', () => ({ MJQueryEntityServer: class {} }));
vi.mock('../generic/DeleteOptionsInput.js', () => ({ DeleteOptionsInput: class {} }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, AssertClientInputWritableForUser: () => undefined, LogStatus: () => undefined };
});
vi.mock('../generated/generated.js', () => ({
    MJQuery_: class {}, MJQueryField_: class {}, MJQueryParameter_: class {}, MJQueryEntity_: class {}, MJQueryPermission_: class {},
    MJQueryResolver: class {
        protected async CheckAPIKeyScopeAuthorization(): Promise<void> { /* authorized */ }
        protected async AfterCreate(): Promise<void> { /* no event */ }
        protected ListenForEntityMessages(): void { /* no pub/sub */ }
        protected async MapFieldNamesToCodeNames(_entityName: string, values: Record<string, unknown>) { return values; }
    },
}));

import { MJQueryResolverExtended, CreateQuerySystemUserInput } from '../resolvers/QuerySystemUserResolver.js';
import type { AppContext } from '../types.js';

/** One stored query row. */
interface StoredQuery { ID: string; Name: string; CategoryID: string | null }

const CATEGORY = 'C0000000-0000-0000-0000-000000000001';
let rows: StoredQuery[];
let lookups: RunViewParams[];
let nextID: number;

/** A query record as the stub provider hands out: its insert yields first and enforces the unique name. */
class StubQueryRecord {
    public ID = '';
    public Name = '';
    public CategoryID: string | null = null;
    public ParameterHints?: Map<string, string>;
    public EntityInfo = {};
    public LatestResult: { Message: string; CompleteMessage: string } | null = null;
    public QueryFields = [];
    public QueryParameters = [];
    public QueryEntities = [];
    public QueryPermissions = [];

    SetMany(values: Record<string, unknown>): void {
        if (typeof values.Name === 'string') this.Name = values.Name;
        if (typeof values.CategoryID === 'string') this.CategoryID = values.CategoryID;
    }

    async Save(): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 1));
        if (rows.some(r => r.Name.toLowerCase() === this.Name.toLowerCase() && r.CategoryID === this.CategoryID)) {
            const message = `Cannot insert duplicate key row in object '__mj.Query' with unique index 'UX_Query_Name_CategoryID'. The duplicate key value is (${this.Name}).`;
            this.LatestResult = { Message: message, CompleteMessage: message };
            return false;
        }
        this.ID = `Q${++nextID}`;
        rows.push({ ID: this.ID, Name: this.Name, CategoryID: this.CategoryID });
        return true;
    }

    async Load(id: string): Promise<boolean> {
        const row = rows.find(r => r.ID === id);
        if (!row) return false;
        Object.assign(this, row);
        return true;
    }

    GetAll(): Record<string, unknown> {
        return { ID: this.ID, Name: this.Name, CategoryID: this.CategoryID };
    }
}

const provider = {
    async GetEntityObject(): Promise<StubQueryRecord> {
        return new StubQueryRecord();
    },
    async RunView(params: RunViewParams) {
        lookups.push(params);
        await new Promise(resolve => setTimeout(resolve, 0));
        const name = /LOWER\(Name\) = LOWER\('(.*)'\)/.exec(params.ExtraFilter ?? '')?.[1]?.replace(/''/g, "'") ?? '';
        const matches = rows.filter(r => r.Name.toLowerCase() === name.toLowerCase() && r.CategoryID === CATEGORY);
        return { Success: true, Results: matches, RowCount: matches.length, TotalRowCount: matches.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    },
};

const context = {
    providers: [{ provider, type: 'Read-Write' }],
    userPayload: { userRecord: { ID: 'user-1', Email: 'u@example.com', UserRoles: [] } },
} as unknown as AppContext;

function input(name: string, autoResolve: boolean): CreateQuerySystemUserInput {
    return Object.assign(new CreateQuerySystemUserInput(), { Name: name, CategoryID: CATEGORY, SQL: 'SELECT 1 AS One', AutoResolveCollision: autoResolve });
}

async function createConcurrently(count: number, name: string, autoResolve: boolean) {
    const resolver = new MJQueryResolverExtended();
    const pubSub = { publish: async () => undefined } as unknown as Parameters<MJQueryResolverExtended['CreateQueryExtended']>[2];
    return Promise.all(Array.from({ length: count }, () => resolver.CreateQueryExtended(input(name, autoResolve), context, pubSub)));
}

beforeEach(() => {
    rows = [];
    lookups = [];
    nextID = 0;
});

describe('CreateQueryExtended — concurrent creates with the same name (#6007)', () => {
    it('with AutoResolveCollision, gives every concurrent request its own query with its own name', async () => {
        const results = await createConcurrently(8, 'Revenue By Region', true);

        expect(results.every(r => r.Success)).toBe(true);
        const ids = new Set(results.map(r => r.Query?.ID));
        const names = new Set(results.map(r => r.Query?.Name));
        expect(ids.size).toBe(8);
        expect(names.size).toBe(8);
        expect(rows).toHaveLength(8);
        expect([...names]).toContain('Revenue By Region');
        expect([...names].filter(n => n !== 'Revenue By Region').every(n => /^Revenue By Region \(\d+\)$/.test(String(n)))).toBe(true);
    });

    it('without AutoResolveCollision, keeps create-or-get: the requests that lose the race get the query that now exists', async () => {
        const results = await createConcurrently(5, 'Orders Today', false);

        expect(results.every(r => r.Success)).toBe(true);
        expect(rows).toHaveLength(1);
        expect(new Set(results.map(r => r.Query?.ID))).toEqual(new Set([rows[0].ID]));
    });

    it('reads every existence check from the database, never a cache', async () => {
        await createConcurrently(3, 'Uncached', true);

        expect(lookups.length).toBeGreaterThan(0);
        expect(lookups.every(l => l.BypassCache === true)).toBe(true);
    });

    it('returns the save failure itself when it is not a name race', async () => {
        vi.spyOn(StubQueryRecord.prototype, 'Save').mockImplementationOnce(async function (this: StubQueryRecord) {
            this.LatestResult = { Message: 'Query "Bad" was not saved: MJQ_TAG_IN_STRING_LITERAL', CompleteMessage: 'Query "Bad" was not saved: MJQ_TAG_IN_STRING_LITERAL' };
            return false;
        });
        const [result] = await createConcurrently(1, 'Bad', true);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('MJQ_TAG_IN_STRING_LITERAL');
        expect(rows).toHaveLength(0);
    });
});

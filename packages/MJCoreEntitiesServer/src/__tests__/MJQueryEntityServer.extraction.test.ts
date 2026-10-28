/**
 * How `MJQueryEntityServer.Save` drives extraction:
 *
 * - E8: the platform extracted for is the saving provider's, not `DB_PLATFORM`;
 * - the trigger: new query, SQL edit, declared children or `ExtractionOverride: 'Force'`; `Skip` skips;
 * - a refusal writes nothing and carries the reasons in the save's result;
 * - the Extraction columns and `UsesTemplate` are set before the row is written (one write);
 * - the child rows are written as the system user, after the query row;
 * - M5: the description pass is queued with `RunAfterCommit` (never run inside the save), only when
 *   a row has no description and the save does not skip AI actions;
 * - M7: `SkipEmbeddings` leaves the stored vector alone;
 * - M6: a dialect variant's save re-extracts the parent read from the database, from the variant's SQL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseProviderBase } from '@memberjunction/core';
import type { DatabasePlatform } from '@memberjunction/core';

const h = vi.hoisted(() => ({
    writes: [] as Array<{ UsesTemplate: boolean | null; ExtractionStatus: string | null }>,
    computed: [] as Array<{ Platform: string; Mode: string; SQL: string }>,
    written: [] as Array<{ User: { ID: string } }>,
    afterCommit: [] as Array<() => Promise<void>>,
    refusal: null as string | null,
    undescribed: ['Name'] as string[],
    dbPlatform: 'postgresql' as string,
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: object) => target };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    class StubQuery {
        public DeclaredParameters = { Items: [] };
        public DeclaredFields = { Items: [] };
        public DeclaredEntities = { Items: [] };
        public ID = 'q-1';
        public Name = 'Q';
        public Status = 'Pending';
        public SQL: string | null = 'SELECT 1 AS One';
        public UsesTemplate: boolean | null = null;
        public ExtractionStatus: string | null = null;
        public ExtractionMessage: string | null = null;
        public ExtractedSQLHash: string | null = null;
        public UserQuestion: string | null = null;
        public Description: string | null = 'Something';
        public EmbeddingVector: string | null = 'stored-vector';
        public EmbeddingVectorBinary: string | null = null;
        public EmbeddingModelID: string | null = null;
        public SQLDialectID: string | null = null;
        public CategoryID: string | null = null;
        public ExternalDataSourceID: string | null = null;
        public SkipEmbeddings = false;
        public IsSaved = false;
        public SQLDirty = true;
        public ContextCurrentUser = { ID: 'caller' };
        public LatestResult = { CompleteMessage: '', Errors: [] as Error[] };
        public RegisterResultHistoryEntry = vi.fn();
        public Provider: object | null = null;
        public get ProviderToUse() { return this.Provider; }
        public get RunViewProviderToUse() { return this.Provider; }
        public GetFieldByName(name: string): { Dirty: boolean } { return { Dirty: name === 'SQL' ? this.SQLDirty : false }; }
        public GetPlatformSQL(_platform: DatabasePlatform): string | null { return this.SQL; }
        public BuildCategoryPath(): string { return ''; }
        public async Save(): Promise<boolean> {
            h.writes.push({ UsesTemplate: this.UsesTemplate, ExtractionStatus: this.ExtractionStatus });
            return true;
        }
    }
    class StubQuerySQL {
        public ID = 'qs-1';
        public QueryID = 'q-1';
        public SQLDialectID = 'dialect-ss';
        public SQL = 'SELECT 3 AS Three';
        public ContextCurrentUser = { ID: 'caller' };
        public Provider: object | null = null;
        public get ProviderToUse() { return this.Provider; }
        public async Save(): Promise<boolean> { return true; }
    }
    return {
        ...actual, MJQueryEntityExtended: StubQuery, MJQuerySQLEntity: StubQuerySQL,
        QueryEngine: { Instance: { Loaded: true, Queries: [], SQLDialects: [{ ID: 'dialect-ss', PlatformKey: 'sqlserver' }, { ID: 'dialect-pg', PlatformKey: 'postgresql' }] } },
    };
});

vi.mock('../custom/query-extraction/extractQuery', () => ({
    ComputeQueryExtraction: vi.fn(async (input: { Platform: string; Mode: string; SQL: string }) => {
        h.computed.push(input);
        return { UsesTemplate: false, Refusal: h.refusal, Status: 'OK', Messages: [], Hash: 'hash-1', Fields: [], Parameters: [], Entities: [], Dependencies: [] };
    }),
    ExtractionSQLHash: vi.fn(() => 'hash-1'),
}));
vi.mock('../custom/query-extraction/childRowWriter', () => ({
    WriteExtractedChildRows: vi.fn(async (context: { User: { ID: string } }) => {
        h.written.push(context);
        return { Added: 0, Updated: 0, Removed: 0, FieldsWithoutDescription: h.undescribed, ParametersWithoutDescription: [] };
    }),
}));
vi.mock('../custom/query-extraction/descriptionPass', () => ({ RunDescriptionPass: vi.fn(async () => undefined) }));
vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return { ...actual, UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system' }) } }, resolveDbPlatformFromEnv: () => h.dbPlatform };
});
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('../custom/util', () => ({ EmbedTextLocalHelper: vi.fn().mockResolvedValue({ vector: [1, 2], modelID: 'm' }) }));
vi.mock('../custom/approvalStamp', () => ({ ApplyApprovalRulesAsync: vi.fn().mockResolvedValue(false), ApprovalRefusalResult: vi.fn() }));

import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';
import { MJQuerySQLEntityServer } from '../custom/MJQuerySQLEntityServer.server';
import { RunDescriptionPass } from '../custom/query-extraction/descriptionPass';

/** A SQL Server database provider stub: a real `DatabaseProviderBase` prototype, so the entity treats it as one. */
function sqlServerProvider(): DatabaseProviderBase {
    const provider: DatabaseProviderBase = Object.create(DatabaseProviderBase.prototype);
    Object.defineProperty(provider, 'PlatformKey', { get: () => 'sqlserver' });
    Object.defineProperty(provider, 'Entities', { get: () => [] });
    Object.assign(provider, {
        RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        GetEntityObject: vi.fn(),
        CapturePostCommitToken: () => ({ Epoch: 1, FrameIds: [1] }),
        RunAfterCommit: (task: () => Promise<void>) => { h.afterCommit.push(task); },
    });
    return provider;
}

function createQuery(): MJQueryEntityServer & { Provider: object | null; SQLDirty: boolean; IsSaved: boolean } {
    const query = Reflect.construct(MJQueryEntityServer, []) as MJQueryEntityServer & { Provider: object | null; SQLDirty: boolean; IsSaved: boolean };
    query.Provider = sqlServerProvider();
    return query;
}

beforeEach(() => {
    h.writes.length = 0; h.computed.length = 0; h.written.length = 0; h.afterCommit.length = 0;
    h.refusal = null; h.undescribed = ['Name'];
});
afterEach(() => vi.clearAllMocks());

describe('MJQueryEntityServer Save — extraction', () => {
    it('E8: extracts for the saving provider\'s platform, not DB_PLATFORM', async () => {
        h.dbPlatform = 'postgresql';
        await createQuery().Save();
        expect(h.computed[0].Platform).toBe('sqlserver');
    });

    it('writes the query row once, with the Extraction columns set, then the child rows as the system user', async () => {
        const query = createQuery();
        expect(await query.Save()).toBe(true);
        expect(h.writes).toEqual([{ UsesTemplate: false, ExtractionStatus: 'OK' }]);
        expect(query.ExtractedSQLHash).toBe('hash-1');
        expect(h.written.map(w => w.User.ID)).toEqual(['system']);
    });

    it('refuses with the reasons in the result, writing nothing', async () => {
        h.refusal = 'Query "Q" was not saved:\nMJQ_SYNTAX: bad';
        const query = createQuery();
        expect(await query.Save()).toBe(false);
        expect(h.writes).toEqual([]);
        expect(h.written).toEqual([]);
        expect(vi.mocked(query.RegisterResultHistoryEntry).mock.calls[0][0].Message).toContain('MJQ_SYNTAX');
    });

    it('does not extract an unchanged query, extracts it with Force in refresh mode, and Skip skips an edited one', async () => {
        const query = createQuery();
        query.IsSaved = true; query.SQLDirty = false;
        await query.Save();
        expect(h.computed).toHaveLength(0);
        query.ExtractionOverride = 'Force';
        await query.Save();
        expect(h.computed.map(c => c.Mode)).toEqual(['Refresh']);
        expect(query.ExtractionOverride).toBe('Auto');
        query.SQLDirty = true; query.ExtractionOverride = 'Skip';
        await query.Save();
        expect(h.computed).toHaveLength(1);
    });

    it('M5: queues the description pass after commit, and only when a save does not skip AI actions', async () => {
        await createQuery().Save();
        expect(RunDescriptionPass).not.toHaveBeenCalled();
        expect(h.afterCommit).toHaveLength(1);
        await h.afterCommit[0]();
        expect(RunDescriptionPass).toHaveBeenCalledTimes(1);

        await createQuery().Save({ SkipEntityAIActions: true });
        expect(h.afterCommit).toHaveLength(1);

        h.undescribed = [];
        await createQuery().Save();
        expect(h.afterCommit).toHaveLength(1);
    });

    it('M7: SkipEmbeddings leaves the stored vector alone', async () => {
        const query = createQuery();
        query.SkipEmbeddings = true;
        await query.Save();
        expect(query.EmbeddingVector).toBe('stored-vector');
        const embedded = createQuery();
        await embedded.Save();
        expect(embedded.EmbeddingVector).toBe('[1,2]');
    });

    it('M6: RerunExtraction forces a refresh from the SQL it is given', async () => {
        const query = createQuery();
        query.IsSaved = true; query.SQLDirty = false;
        await query.RerunExtraction(true, 'SELECT 2 AS Two');
        expect(h.computed).toEqual([expect.objectContaining({ Mode: 'Refresh', SQL: 'SELECT 2 AS Two' })]);
        expect(h.afterCommit).toHaveLength(0);
    });
});

describe('MJQuerySQLEntityServer Save — re-extraction of the parent (M6)', () => {
    function variant(dialectID: string) {
        const provider = sqlServerProvider();
        const parent = createQuery();
        const load = vi.fn(async () => true);
        const rerun = vi.fn(async () => undefined);
        Object.assign(parent, { Load: load, RerunExtraction: rerun });
        vi.mocked(provider.GetEntityObject).mockResolvedValue(parent);
        const record = Reflect.construct(MJQuerySQLEntityServer, []) as MJQuerySQLEntityServer & { Provider: object | null };
        record.Provider = provider;
        record.SQLDialectID = dialectID;
        return { record, load, rerun };
    }

    it('loads the parent from the database on its own provider and re-extracts it from the variant\'s SQL', async () => {
        const { record, load, rerun } = variant('dialect-ss');
        expect(await record.Save()).toBe(true);
        expect(load).toHaveBeenCalledWith('q-1');
        expect(rerun).toHaveBeenCalledWith(false, 'SELECT 3 AS Three');
    });

    it('does nothing for a variant of another platform than the provider\'s', async () => {
        const { record, rerun } = variant('dialect-pg');
        expect(await record.Save()).toBe(true);
        expect(rerun).not.toHaveBeenCalled();
    });
});

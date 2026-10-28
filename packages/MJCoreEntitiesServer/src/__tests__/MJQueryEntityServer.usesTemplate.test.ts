/**
 * `UsesTemplate` on `MJ: Queries` is a lexical fact about the SQL: any template tag (an expression, a
 * `{% %}` block, a `{{query:"..."}}` composition reference) makes it true. It must never be derived from
 * whether extraction succeeded or found parameters, because `QueryParameterProcessor` skips Nunjucks
 * entirely when it is false, leaving the tags in the SQL sent to the database.
 *
 * The generated base class is replaced with a stub whose `Save` records the `UsesTemplate` value of each
 * write. The extraction pipeline runs for real; only its database writes and the LLM call are stubbed, and
 * `QueryEngine.Instance.Queries` is set per test to control what composition references resolve to.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabasePlatform, IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import type { MJQueryEntityExtended } from '@memberjunction/core-entities';
import type { QuerySyncContext } from '../custom/query-extraction/types';

const { writes } = vi.hoisted(() => ({
    writes: [] as Array<{ UsesTemplate: boolean | null }>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: object) => target };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();

    /** Stands in for the generated query base: plain fields and a Save that records each write. */
    class StubQuery {
        /** The query's declared child collections, empty: this save declares no children. */
        public DeclaredParameters = { Items: [] };
        public DeclaredFields = { Items: [] };
        public DeclaredEntities = { Items: [] };
        public ID = 'q-under-test';
        public Name = 'Templated Query';
        public Status = 'Pending';
        public SQL: string | null = null;
        public UsesTemplate: boolean | null = null;
        public UserQuestion: string | null = null;
        public Description: string | null = null;
        public EmbeddingVector: string | null = null;
        public EmbeddingVectorBinary: string | null = null;
        public EmbeddingModelID: string | null = null;
        public SQLDialectID: string | null = null;
        public IsSaved = false;
        public ContextCurrentUser = { ID: 'user-1' };
        public LatestResult = { CompleteMessage: '', Errors: [] as Error[] };
        public RegisterResultHistoryEntry = vi.fn();
        public get ProviderToUse() { return { Entities: [] }; }
        public get RunViewProviderToUse() { return {}; }
        public GetFieldByName(): { Dirty: boolean } { return { Dirty: true }; }
        public GetPlatformSQL(_platform: DatabasePlatform): string | null { return this.SQL; }
        public async Save(): Promise<boolean> {
            writes.push({ UsesTemplate: this.UsesTemplate });
            return true;
        }
    }

    return { ...actual, MJQueryEntityExtended: StubQuery };
});

vi.mock('../custom/query-extraction/sync', () => ({
    SyncParameters: vi.fn().mockResolvedValue(undefined),
    SyncFields: vi.fn().mockResolvedValue(undefined),
    SyncEntities: vi.fn().mockResolvedValue(undefined),
    SyncDependencies: vi.fn().mockResolvedValue(undefined),
    RemoveAllRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../custom/query-extraction/enrich', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../custom/query-extraction/enrich')>();
    return { ...actual, RunLLMEnrichment: vi.fn().mockResolvedValue(null) };
});

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('../custom/util', () => ({ EmbedTextLocalHelper: vi.fn().mockResolvedValue(null) }));
vi.mock('../custom/approvalStamp', () => ({
    ApplyApprovalRulesAsync: vi.fn().mockResolvedValue(false),
    ApprovalRefusalResult: vi.fn(),
}));

import { QueryEngine } from '@memberjunction/core-entities';
import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';
import { RunExtractionPipeline } from '../custom/query-extraction/pipeline';

/** The generated base's constructor takes an EntityInfo; the stub takes none, so construct without arguments. */
function createQuery(): MJQueryEntityServer {
    const query: MJQueryEntityServer = Reflect.construct(MJQueryEntityServer, []);
    return query;
}

type DependencyShape = Pick<MJQueryEntityExtended, 'ID' | 'Name' | 'CategoryPath' | 'Reusable' | 'QueryParameters' | 'QueryFields'>;

/** A reusable dependency query with no parameters and no fields. */
function dependency(name: string, categoryPath: string): MJQueryEntityExtended {
    const shape: DependencyShape = {
        ID: `dep-${name}`,
        Name: name,
        CategoryPath: categoryPath,
        Reusable: true,
        QueryParameters: [],
        QueryFields: [],
    };
    return shape as MJQueryEntityExtended;
}

function useQueries(queries: MJQueryEntityExtended[]): void {
    vi.spyOn(QueryEngine.Instance, 'Queries', 'get').mockReturnValue(queries);
}

async function saveQuery(sql: string): Promise<MJQueryEntityServer> {
    const query = createQuery();
    query.SQL = sql;
    expect(await query.Save()).toBe(true);
    return query;
}

function pipelineCtx(sql: string): QuerySyncContext {
    return {
        queryID: 'q-under-test',
        queryName: 'Templated Query',
        sql,
        isSaved: true,
        contextUser: { ID: 'user-1' } as UserInfo,
        metadataProvider: { Entities: [] } as Pick<IMetadataProvider, 'Entities'> as IMetadataProvider,
        runViewProvider: {} as IRunViewProvider,
    };
}

const MISSING_REF_SQL = 'SELECT m.* FROM {{query:"Shared/Membership Base"}} m WHERE m.JoinYear = {{ Year | sqlNumber }}';
const COMPOSITION_ONLY_SQL = 'SELECT b.* FROM {{query:"Shared/Membership Base"}} b';
const IF_BLOCK_ONLY_SQL = "SELECT m.ID FROM ext.Members m WHERE 1 = 1 {% if true %}AND m.Status = 'Active'{% endif %}";

beforeEach(() => {
    writes.length = 0;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MJQueryEntityServer Save — UsesTemplate after an extraction failure (E9)', () => {
    it('protect: when the composition reference resolves, the templated query saves UsesTemplate=true', async () => {
        useQueries([dependency('Membership Base', 'Shared')]);
        const query = await saveQuery(MISSING_REF_SQL);
        expect(query.UsesTemplate).toBe(true);
        expect(writes.at(-1)?.UsesTemplate).toBe(true);
    });

    // Pinned: an extraction failure never flips UsesTemplate to false; UsesTemplate is a lexer fact
    // (DISCUSSION §6, 2026-10-27; DISCUSSION Topic 3a "extractAndSyncDataAsync sets UsesTemplate = false
    // and saves when extraction throws"). E9 / S12.
    // Observed today: the pipeline throws on the missing composition reference, the catch in
    // extractAndSyncDataAsync sets UsesTemplate=false and saves it (expected true, received false).
    it.fails('keeps UsesTemplate=true when extraction throws on a missing composition reference', async () => {
        useQueries([]);
        const query = await saveQuery(MISSING_REF_SQL);
        expect(writes.at(-1)?.UsesTemplate).toBe(true);
        expect(query.UsesTemplate).toBe(true);
    });
});

describe('UsesTemplate is a lexer fact, not "has deterministic parameters" (S12)', () => {
    it('protect: a tag that yields a parameter reports UsesTemplate=true from the pipeline', async () => {
        const result = await RunExtractionPipeline(pipelineCtx('SELECT m.ID FROM ext.Members m WHERE m.JoinYear = {{ Year | sqlNumber }}'));
        expect(result.UsesTemplate).toBe(true);
    });

    it('protect: plain SQL reports UsesTemplate=false from the pipeline', async () => {
        const result = await RunExtractionPipeline(pipelineCtx('SELECT m.ID FROM ext.Members m'));
        expect(result.UsesTemplate).toBe(false);
    });

    // Pinned: UsesTemplate = any tag present (DISCUSSION §6, 2026-10-27). S12. pipeline.ts derives it
    // from `AllDeterministicParams.length > 0`, so a composition with no parameters reads as untemplated.
    // Observed today: expected true, received false.
    it.fails('a parameterless composition reference makes the pipeline report UsesTemplate=true', async () => {
        useQueries([dependency('Membership Base', 'Shared')]);
        const result = await RunExtractionPipeline(pipelineCtx(COMPOSITION_ONLY_SQL));
        expect(result.UsesTemplate).toBe(true);
    });

    // Pinned: UsesTemplate = any tag present (DISCUSSION §6, 2026-10-27). S12. A `{% if %}` block whose
    // condition names no parameter yields no deterministic parameters.
    // Observed today: expected true, received false.
    it.fails('an {% if %} block with no parameter makes the pipeline report UsesTemplate=true', async () => {
        const result = await RunExtractionPipeline(pipelineCtx(IF_BLOCK_ONLY_SQL));
        expect(result.UsesTemplate).toBe(true);
    });

    // Pinned: UsesTemplate = any tag present, as saved on the query (DISCUSSION §6, 2026-10-27). S12.
    // Observed today: the save writes UsesTemplate=false (expected true, received false).
    it.fails('saving a query whose only tag is a parameterless composition stores UsesTemplate=true', async () => {
        useQueries([dependency('Membership Base', 'Shared')]);
        const query = await saveQuery(COMPOSITION_ONLY_SQL);
        expect(writes.at(-1)?.UsesTemplate).toBe(true);
        expect(query.UsesTemplate).toBe(true);
    });
});

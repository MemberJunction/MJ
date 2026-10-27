/**
 * Save-time rules of the MJ Query language, enforced by `MJQueryEntityServer.Save`.
 *
 * R10 / S10: a query whose output has two columns with the same name (compared case-insensitively, as
 * SQL Server and MJ's field rows do) is refused, because `MJ: Query Fields` keys on the output name and
 * one of the two columns would silently lose its field row.
 *
 * The generated base class is replaced with a stub whose `Save` records each write; the extraction
 * pipeline's database writes and LLM call are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabasePlatform } from '@memberjunction/core';

const { writes } = vi.hoisted(() => ({
    writes: [] as Array<{ SQL: string | null }>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: object) => target };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();

    /** Stands in for the generated query base: plain fields and a Save that records each write. */
    class StubQuery {
        public ID = 'q-under-test';
        public Name = 'Account Balances';
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
            writes.push({ SQL: this.SQL });
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

import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';

/** The generated base's constructor takes an EntityInfo; the stub takes none, so construct without arguments. */
function createQuery(sql: string): MJQueryEntityServer {
    const query: MJQueryEntityServer = Reflect.construct(MJQueryEntityServer, []);
    query.SQL = sql;
    return query;
}

beforeEach(() => {
    writes.length = 0;
});

describe('MJQueryEntityServer Save — duplicate output column names (R10 / S10)', () => {
    it('protect: a query whose output names are distinct saves', async () => {
        const query = createQuery('SELECT a.ID, b.ID AS BalanceID FROM ext.Accounts a JOIN ext.Balances b ON b.AccountID = a.ID');
        expect(await query.Save()).toBe(true);
        expect(writes.length).toBeGreaterThan(0);
    });

    // Pinned: saving a query with duplicate output names (case-insensitive) is refused (DISCUSSION §6,
    // 2026-10-27: spec save rules; side finding "stale-column queries saved silently"). R10 / S10.
    // Observed today: Save returns true and writes the row (expected false, received true).
    it.fails('refuses a query whose output repeats a column name in a different case', async () => {
        const query = createQuery('SELECT a.ID, b.id FROM ext.Accounts a JOIN ext.Balances b ON b.AccountID = a.ID');
        expect(await query.Save()).toBe(false);
        expect(writes).toHaveLength(0);
    });

    // Pinned: as above; an alias that collides with another output column counts as a duplicate. R10 / S10.
    // Observed today: Save returns true (expected false, received true).
    it.fails('refuses a query whose alias collides with another output column', async () => {
        const query = createQuery('SELECT a.Total AS Amount, b.amount FROM ext.Accounts a JOIN ext.Balances b ON b.AccountID = a.ID');
        expect(await query.Save()).toBe(false);
        expect(writes).toHaveLength(0);
    });
});

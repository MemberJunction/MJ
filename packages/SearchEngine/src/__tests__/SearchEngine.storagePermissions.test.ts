/**
 * Tests for the storage half of SearchEngine's late permission filter (`filterByPermissions`).
 *
 * `storage-file` results used to pass straight through this filter ("already checked by StorageSearchProvider").
 * `ResultType` is provider output, so any provider could have emitted `storage-file` and skipped every check. The
 * filter now keeps a storage hit only when the ENGINE-stamped `ProviderId` names a configured StorageSearchProvider
 * entry AND the account in `RawMetadata.accountId` is readable by the user, per the storage evaluator, now.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAccessibleAccountIDs } = vi.hoisted(() => ({
    mockAccessibleAccountIDs: vi.fn(),
}));

vi.mock('@memberjunction/storage', () => ({
    StorageAccessEvaluator: { Instance: { AccessibleAccountIDs: mockAccessibleAccountIDs } },
    FileStorageEngine: { Instance: { Config: vi.fn(), AccountsWithProviders: [] } },
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { NormalizeUUID } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SearchEngine } from '../generic/SearchEngine';
import { StorageSearchProvider } from '../generic/StorageSearchProvider';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import type { SearchResultItem, SearchSource } from '../generic/search.types';

const STORAGE_PROVIDER_ID = 'AAAAAAAA-0000-4000-8000-000000000001';
const VECTOR_PROVIDER_ID = 'BBBBBBBB-0000-4000-8000-000000000002';
const ACCOUNT_OPEN = 'CCCCCCCC-0000-4000-8000-000000000003';
const ACCOUNT_CLOSED = 'DDDDDDDD-0000-4000-8000-000000000004';

/** A non-storage provider that could emit `storage-file` results if the type were trusted. */
class ImpostorProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'vector';
    public async Search(): Promise<SearchResultItem[]> {
        return [];
    }
}

interface ProviderEntry {
    Provider: BaseSearchProvider;
    ID: string;
    DisplayName: string;
    Icon: string;
    Priority: number;
    SupportsPreview: boolean;
    MaxResultsOverride: number | null;
    Record: object;
}

/** The private field the harness sets to bypass Config(), narrowed structurally rather than through `any`. */
interface SearchEngineTestState {
    _providerEntries: ProviderEntry[];
}

class TestSearchEngine extends SearchEngine {
    public InjectEntries(entries: Array<{ ID: string; Provider: BaseSearchProvider }>): void {
        (this as unknown as SearchEngineTestState)._providerEntries = entries.map((e, i) => ({
            Provider: e.Provider, ID: e.ID, DisplayName: e.Provider.SourceType, Icon: 'fa-solid fa-circle',
            Priority: i, SupportsPreview: false, MaxResultsOverride: null, Record: {},
        }));
    }
    public async TestFilterByPermissions(results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser);
    }
    protected override get ProviderToUse(): IMetadataProvider {
        return { EntityByName: () => undefined, Entities: [] } as unknown as IMetadataProvider;
    }
}

const user = { ID: 'EEEEEEEE-0000-4000-8000-000000000005', Name: 'Reader', UserRoles: [] } as unknown as UserInfo;

function storageHit(path: string, opts: { accountId?: string; providerId?: string; rawMetadata?: string }): SearchResultItem {
    return {
        ID: `storage-${path}`,
        EntityName: 'Shared Drive',
        RecordID: path,
        SourceType: 'storage',
        ResultType: 'storage-file',
        Title: path,
        Snippet: '',
        Score: 0.5,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ProviderId: opts.providerId,
        RawMetadata: opts.rawMetadata ?? (opts.accountId ? JSON.stringify({ accountId: opts.accountId, path }) : undefined),
    };
}

describe('SearchEngine.filterByPermissions — storage-file results are re-checked, not passed through', () => {
    let engine: TestSearchEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
        engine.InjectEntries([
            { ID: STORAGE_PROVIDER_ID, Provider: new StorageSearchProvider() },
            { ID: VECTOR_PROVIDER_ID, Provider: new ImpostorProvider() },
        ]);
        // Only ACCOUNT_OPEN is readable by the user.
        mockAccessibleAccountIDs.mockImplementation(async (ids: string[]) =>
            new Set(ids.map(id => NormalizeUUID(id)).filter(id => id === NormalizeUUID(ACCOUNT_OPEN))));
    });

    it('drops a storage-file result with no engine-stamped ProviderId, without consulting the evaluator', async () => {
        const out = await engine.TestFilterByPermissions([storageHit('a.pdf', { accountId: ACCOUNT_OPEN })], user);
        expect(out).toHaveLength(0);
        expect(mockAccessibleAccountIDs).not.toHaveBeenCalled();
    });

    it('drops a storage-file result stamped with a NON-storage provider, even for a readable account', async () => {
        const forged = storageHit('a.pdf', { accountId: ACCOUNT_OPEN, providerId: VECTOR_PROVIDER_ID });
        const out = await engine.TestFilterByPermissions([forged], user);
        expect(out).toHaveLength(0);
    });

    it('drops a storage-file result whose ProviderId names no configured entry', async () => {
        const stray = storageHit('a.pdf', { accountId: ACCOUNT_OPEN, providerId: 'FFFFFFFF-0000-4000-8000-000000000006' });
        expect(await engine.TestFilterByPermissions([stray], user)).toHaveLength(0);
    });

    it('drops a storage hit whose account metadata is missing, unparseable, or not a UUID', async () => {
        const out = await engine.TestFilterByPermissions([
            storageHit('none.pdf', { providerId: STORAGE_PROVIDER_ID }),
            storageHit('garbage.pdf', { providerId: STORAGE_PROVIDER_ID, rawMetadata: '{not json' }),
            storageHit('not-uuid.pdf', { providerId: STORAGE_PROVIDER_ID, rawMetadata: JSON.stringify({ accountId: 'abc' }) }),
            storageHit('array.pdf', { providerId: STORAGE_PROVIDER_ID, rawMetadata: '[1,2]' }),
        ], user);
        expect(out).toHaveLength(0);
    });

    it('keeps hits on a readable account and drops hits on an unreadable one, preserving input order', async () => {
        const results = [
            storageHit('1.pdf', { accountId: ACCOUNT_OPEN, providerId: STORAGE_PROVIDER_ID }),
            storageHit('2.pdf', { accountId: ACCOUNT_CLOSED, providerId: STORAGE_PROVIDER_ID }),
            storageHit('3.pdf', { accountId: ACCOUNT_OPEN.toLowerCase(), providerId: STORAGE_PROVIDER_ID.toLowerCase() }),
            storageHit('4.pdf', { accountId: ACCOUNT_CLOSED, providerId: STORAGE_PROVIDER_ID }),
            storageHit('5.pdf', { accountId: ACCOUNT_OPEN, providerId: STORAGE_PROVIDER_ID }),
        ];
        const out = await engine.TestFilterByPermissions(results, user);
        expect(out.map(r => r.RecordID)).toEqual(['1.pdf', '3.pdf', '5.pdf']);
    });

    it('asks the evaluator for READ access, for the calling user, about the accounts the hits name', async () => {
        await engine.TestFilterByPermissions([
            storageHit('1.pdf', { accountId: ACCOUNT_OPEN, providerId: STORAGE_PROVIDER_ID }),
            storageHit('2.pdf', { accountId: ACCOUNT_CLOSED, providerId: STORAGE_PROVIDER_ID }),
        ], user);
        expect(mockAccessibleAccountIDs).toHaveBeenCalledTimes(1);
        const [ids, calledUser, access] = mockAccessibleAccountIDs.mock.calls[0] as [string[], UserInfo, string];
        expect(ids).toEqual([ACCOUNT_OPEN, ACCOUNT_CLOSED]);
        expect(calledUser).toBe(user);
        expect(access).toBe('Read');
    });

    it('drops every storage hit when the evaluator throws (fail closed)', async () => {
        mockAccessibleAccountIDs.mockRejectedValue(new Error('permission read exploded'));
        const out = await engine.TestFilterByPermissions([
            storageHit('1.pdf', { accountId: ACCOUNT_OPEN, providerId: STORAGE_PROVIDER_ID }),
        ], user);
        expect(out).toHaveLength(0);
    });

    it('drops every storage hit when the evaluator denies everything (e.g. a failed permission read)', async () => {
        mockAccessibleAccountIDs.mockResolvedValue(new Set<string>());
        const out = await engine.TestFilterByPermissions([
            storageHit('1.pdf', { accountId: ACCOUNT_OPEN, providerId: STORAGE_PROVIDER_ID }),
        ], user);
        expect(out).toHaveLength(0);
    });
});

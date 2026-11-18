/**
 * When an optional SDK cannot be loaded, the error must name it as an optional dependency of
 * this package and must not tell the user to add it to their own project: under pnpm a bare
 * import resolves from @memberjunction/search-engine, so a host-level install does not help (#3741).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogError } = vi.hoisted(() => ({ mockLogError: vi.fn() }));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return { ...actual, LogError: mockLogError, LogStatus: vi.fn() };
});

vi.mock('@elastic/elasticsearch', () => {
    throw new Error("Cannot find package '@elastic/elasticsearch'");
});

vi.mock('@huggingface/transformers', () => {
    throw new Error("Cannot find package '@huggingface/transformers'");
});

import { ElasticsearchSearchProvider, ResetElasticsearchClientLoaderForTests } from '../providers/ElasticsearchSearchProvider';
import { BGEReRanker, ResetBGEPipelineCacheForTests } from '../rerankers/BGEReRanker';
import type { SearchResultItem } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

function loggedMessages(): string {
    return mockLogError.mock.calls.map(c => String(c[0])).join('\n');
}

describe('optional SDK load failures', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ResetElasticsearchClientLoaderForTests();
        ResetBGEPipelineCacheForTests();
    });

    it('Elasticsearch names @elastic/elasticsearch as an optional dependency of search-engine', async () => {
        const p = new ElasticsearchSearchProvider();
        await p.Initialize(
            {
                Name: 'TestES',
                ProviderConfig: { node: 'https://es.example/', apiKey: 'fake' },
                CredentialID: null,
                MaxResultsOverride: null,
                SupportsPreview: false,
                Priority: 100,
            },
            fakeUser,
        );
        const logged = loggedMessages();
        expect(logged).toContain("could not load '@elastic/elasticsearch', an optional dependency of @memberjunction/search-engine");
        expect(logged).not.toContain("Add it to your project's dependencies");
    });

    it('BGE names @huggingface/transformers as an optional dependency of search-engine', async () => {
        const item: SearchResultItem = {
            ID: 'a', EntityName: 'E', RecordID: 'a', SourceType: 'vector', ResultType: 'entity-record',
            Title: 'A', Snippet: 's', Score: 1, ScoreBreakdown: { Vector: 1 }, Tags: [], MatchedAt: new Date(),
        };
        const result = await new BGEReRanker().ReRank('q', [item], 1, fakeUser);
        expect(result).toEqual([item]);
        const logged = loggedMessages();
        expect(logged).toContain("could not load '@huggingface/transformers', an optional dependency of @memberjunction/search-engine");
        expect(logged).not.toContain("Add it to your project's dependencies");
    });
});

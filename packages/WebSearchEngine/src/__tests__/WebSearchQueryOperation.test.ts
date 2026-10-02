import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { WebSearchQueryServerOperation } from '../operations/WebSearchQueryOperation';
import { WebSearchEngine } from '../WebSearchEngine';
import type { WebSearchResult } from '../types';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    BaseSingleton: class BaseSingleton {
        private static _instances = new Map<string, unknown>();
        public static getInstance<T>(this: new () => T): T {
            const key = (this as unknown as { name: string }).name;
            if (!BaseSingleton._instances.has(key)) {
                BaseSingleton._instances.set(key, new this());
            }
            return BaseSingleton._instances.get(key) as T;
        }
    },
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn(),
                GetAllRegistrations: () => [],
            },
        },
    },
}));

vi.mock('@memberjunction/core', () => ({
    BaseRemotableOperation: class {},
    BaseEngine: class {
        public async Config() {}
    },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: {
        Instance: {
            Config: vi.fn(),
            getCredentialById: vi.fn(),
            getCredential: vi.fn(),
        },
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    WebSearchQueryOperation: class {
        public readonly OperationKey = 'WebSearch.Query';
        public readonly RequiredScope = 'websearch:execute';
    },
}));

describe('WebSearchQueryServerOperation', () => {
    let operation: WebSearchQueryServerOperation;
    const mockProvider = {} as IMetadataProvider;
    const mockUser = { ID: 'user-1', Email: 'test@example.com' } as unknown as UserInfo;

    beforeEach(() => {
        operation = new WebSearchQueryServerOperation();
        vi.restoreAllMocks();
    });

    it('throws when query is empty or whitespace', async () => {
        // @ts-expect-error - protected method invocation in unit test
        await expect(operation.InternalExecute({ query: '' }, mockProvider, mockUser)).rejects.toThrow('query is required');
        // @ts-expect-error - protected method invocation in unit test
        await expect(operation.InternalExecute({ query: '   ' }, mockProvider, mockUser)).rejects.toThrow('query is required');
    });

    it('delegates to WebSearchEngine.Search and maps the output', async () => {
        const publishedDate = new Date('2026-09-14T12:00:00Z');
        const mockResult: WebSearchResult = {
            Success: true,
            ResultCode: 'SUCCESS',
            Hits: [
                {
                    Title: 'Test Hit',
                    URL: 'https://example.com/test',
                    Snippet: 'A test result snippet',
                    DisplayURL: 'example.com',
                    PublishedAt: publishedDate,
                    Score: 0.95,
                },
            ],
            Answer: 'Synthesized answer here',
            ProviderUsed: 'Brave',
            Attempts: [
                {
                    ProviderName: 'Brave',
                    DriverClass: 'BraveWebSearchProvider',
                    Succeeded: true,
                    DurationMs: 150,
                    HitCount: 1,
                },
            ],
        };

        vi.spyOn(WebSearchEngine.Instance, 'Config').mockResolvedValue(undefined);
        const searchSpy = vi.spyOn(WebSearchEngine.Instance, 'Search').mockResolvedValue(mockResult);

        // @ts-expect-error - protected method invocation in unit test
        const output = await operation.InternalExecute(
            {
                query: 'memberjunction docs',
                maxResults: 5,
                includeAnswer: true,
            },
            mockProvider,
            mockUser,
        );

        expect(searchSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                Query: 'memberjunction docs',
                MaxResults: 5,
                IncludeAnswer: true,
            }),
            mockUser,
        );

        expect(output.providerUsed).toBe('Brave');
        expect(output.answer).toBe('Synthesized answer here');
        expect(output.hits).toHaveLength(1);
        expect(output.hits[0]).toEqual({
            title: 'Test Hit',
            url: 'https://example.com/test',
            snippet: 'A test result snippet',
            displayUrl: 'example.com',
            publishedAt: publishedDate.toISOString(),
            score: 0.95,
        });
        expect(output.attempts).toHaveLength(1);
        expect(output.attempts[0].providerName).toBe('Brave');
        expect(output.attempts[0].succeeded).toBe(true);
    });

    it('throws when WebSearchEngine.Search fails', async () => {
        const mockResult: WebSearchResult = {
            Success: false,
            ResultCode: 'ALL_PROVIDERS_FAILED',
            ErrorMessage: 'Rate limited by all providers',
            Hits: [],
            Attempts: [],
        };

        vi.spyOn(WebSearchEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(WebSearchEngine.Instance, 'Search').mockResolvedValue(mockResult);

        // @ts-expect-error - protected method invocation in unit test
        await expect(operation.InternalExecute({ query: 'hello' }, mockProvider, mockUser)).rejects.toThrow(
            'ALL_PROVIDERS_FAILED: Rate limited by all providers',
        );
    });
});

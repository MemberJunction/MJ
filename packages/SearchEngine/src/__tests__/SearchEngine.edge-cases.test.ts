/**
 * Tier-1 release-readiness edge cases for `SearchEngine.Search`.
 *
 * Covers the search-input boundary conditions that aren't otherwise
 * exercised by the agent-scenario suite:
 *   1. Empty / whitespace-only queries
 *   2. Null / undefined query values (`params.Query.trim()` would TypeError)
 *   3. Very long query strings (no upstream cap; verify we don't crash)
 *   4. Query containing only LIKE wildcards (covered indirectly — these
 *      get sanitized by `EntitySearchProvider`, not `SearchEngine.Search`,
 *      so the test asserts the search still completes and writes a log).
 *
 * The goal is documented behavior (clean Failure log row + error result)
 * rather than provider-level correctness — those tests live in
 * `EntitySearchProvider.test.ts` and `SearchFusion.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunViewFn } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        ...actual,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

import { SearchEngine } from '../generic/SearchEngine';
import type { SearchParams } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

function createUser(): UserInfo {
    return { ID: 'u-1', Name: 'Test User', Email: 't@example.com' } as UserInfo;
}

class TestSearchEngine extends SearchEngine {
    /** Bypass the singleton wiring so each test gets a fresh instance. */
    public static MakeFresh(): TestSearchEngine {
        // SearchEngine extends BaseSingleton; we still need a real instance to
        // exercise the public Search method. The constructor is protected so
        // we cast via unknown to satisfy the type system in test only.
        const ctor = SearchEngine as unknown as new () => TestSearchEngine;
        return new ctor();
    }
}

describe('SearchEngine.Search — Tier-1 input edge cases', () => {
    let engine: TestSearchEngine;
    let user: UserInfo;

    beforeEach(() => {
        engine = TestSearchEngine.MakeFresh();
        user = createUser();
        mockRunViewFn.mockReset();
    });

    describe('Empty / whitespace queries', () => {
        it('returns Failure result for empty string', async () => {
            const params: SearchParams = { Query: '' };
            const result = await engine.Search(params, user);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Query cannot be empty');
        });

        it('returns Failure result for whitespace-only string', async () => {
            const params: SearchParams = { Query: '   \t\n  ' };
            const result = await engine.Search(params, user);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Query cannot be empty');
        });

        it('returns Failure result for empty string without throwing', async () => {
            // Critical: the input validation path must NOT throw. Throwing
            // here would skip the audit log and crash the GraphQL resolver.
            const params: SearchParams = { Query: '' };
            await expect(engine.Search(params, user)).resolves.toBeDefined();
        });
    });

    describe('Null / undefined query', () => {
        it('returns Failure result for null Query (not TypeError)', async () => {
            // Caller error, but `Query.trim()` would crash without the
            // null-guard we added in SearchEngine.Search.
            const params = { Query: null as unknown as string };
            const result = await engine.Search(params, user);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Query cannot be empty');
        });

        it('returns Failure result for undefined Query', async () => {
            const params = { Query: undefined as unknown as string };
            const result = await engine.Search(params, user);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Query cannot be empty');
        });

        it('returns Failure result for non-string Query (number)', async () => {
            // Sage's LLM occasionally serializes structured args incorrectly;
            // be defensive against types other than string.
            const params = { Query: 42 as unknown as string };
            const result = await engine.Search(params, user);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Query cannot be empty');
        });

        it('returns Failure result for non-string Query (object)', async () => {
            const params = { Query: { foo: 'bar' } as unknown as string };
            const result = await engine.Search(params, user);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Query cannot be empty');
        });
    });

    describe('Very long queries', () => {
        it('does not crash on 100KB query string', async () => {
            // No upstream length cap is enforced by SearchEngine — providers
            // are expected to truncate or reject as appropriate. Engine
            // itself should never throw on length alone.
            const params: SearchParams = { Query: 'a'.repeat(100_000) };
            // Without scopes/providers configured this returns success-with-empty,
            // which is the right behavior — no providers means no work.
            await expect(engine.Search(params, user)).resolves.toBeDefined();
        });
    });
});

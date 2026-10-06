/**
 * Tests for `SearchEngine.ResolvePermissionOverfetchFactor`: the caller's `PermissionOverfetchFactor`
 * wins; else the largest `permissionOverfetchFactor` declared by a resolved scope's `ScopeConfig`;
 * else the engine default. Never below 1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { SearchEngine } from '../generic/SearchEngine';
import type { SearchParams } from '../generic/search.types';
import type { ScopeBundle } from '@memberjunction/core-entities';

class TestSearchEngine extends SearchEngine {
    public TestResolve(params: SearchParams, scopes: ScopeBundle[]): number {
        return this.ResolvePermissionOverfetchFactor(params, scopes);
    }
}

/** A bundle whose scope carries only what the resolver reads: its `ScopeConfig` JSON. */
function scopeWithConfig(config: Record<string, unknown> | string | null): ScopeBundle {
    const scopeConfig = typeof config === 'string' || config === null ? config : JSON.stringify(config);
    return { Scope: { ScopeConfig: scopeConfig } } as unknown as ScopeBundle;
}

const query: SearchParams = { Query: 'budget' };

describe('SearchEngine.ResolvePermissionOverfetchFactor', () => {
    let engine: TestSearchEngine;

    beforeEach(() => {
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
    });

    it('uses the engine default (2) with no caller value and no scopes', () => {
        expect(engine.TestResolve(query, [])).toBe(2);
    });

    it('uses the engine default when the resolved scopes declare nothing', () => {
        expect(engine.TestResolve(query, [scopeWithConfig({ rrfK: 60 }), scopeWithConfig(null)])).toBe(2);
    });

    it('reads a scope\'s declared factor', () => {
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 4 })])).toBe(4);
    });

    it('takes the largest factor across the resolved scopes', () => {
        const scopes = [
            scopeWithConfig({ permissionOverfetchFactor: 3 }),
            scopeWithConfig({}),
            scopeWithConfig({ permissionOverfetchFactor: 5 }),
        ];
        expect(engine.TestResolve(query, scopes)).toBe(5);
    });

    it('lets the caller\'s value win over every scope', () => {
        const scopes = [scopeWithConfig({ permissionOverfetchFactor: 5 })];
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: 3 }, scopes)).toBe(3);
    });

    it('never goes below 1, for a caller value or a scope value — a value below 1 means "no over-fetch", not "ignored"', () => {
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: 0.25 }, [])).toBe(1);
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 0.5 })])).toBe(1);
    });

    it('never exceeds the ceiling (20), for a caller value or a scope value', () => {
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: 1000 }, [])).toBe(20);
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 1000 })])).toBe(20);
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 20 })])).toBe(20);
    });

    it('ignores a scope value that is not a finite number', () => {
        const scopes = [
            scopeWithConfig({ permissionOverfetchFactor: '4' }),
            scopeWithConfig({ permissionOverfetchFactor: Number.NaN }),
            scopeWithConfig({ permissionOverfetchFactor: Number.POSITIVE_INFINITY }),
            scopeWithConfig({ permissionOverfetchFactor: null }),
            scopeWithConfig('{not json'),
        ];
        expect(engine.TestResolve(query, scopes)).toBe(2);
    });

    it('falls through to the scopes when the caller\'s value is not a finite number', () => {
        const scopes = [scopeWithConfig({ permissionOverfetchFactor: 3 })];
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: Number.NaN }, scopes)).toBe(3);
    });
});

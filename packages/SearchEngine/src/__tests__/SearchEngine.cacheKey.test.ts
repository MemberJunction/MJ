/**
 * Tests for SearchEngine's result-cache key.
 *
 * The cache key must include every input that can change the result set. Two were
 * previously missing, and both are tenancy/authorization-relevant:
 *
 *   - `SearchContext` — carries `PrimaryScopeRecordID` (the TENANT) and the
 *     `SecondaryScopes` dimensions. Omitting it meant a user with access to two
 *     tenants could be served the OTHER tenant's results for up to the 30s TTL, and
 *     that two searches differing only by dimension (channel, skill, …) collided.
 *   - `ScopeIDs` — determines which corpora are searched at all.
 *
 * These tests assert the key *discriminates* on those inputs (no collisions) while
 * still *coalescing* logically-identical ones (no needless misses), which is the
 * property that makes the cache both safe and useful.
 */
import { describe, it, expect } from 'vitest';

import { SearchEngine } from '../generic/SearchEngine';
import type { SearchParams } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

class TestSearchEngine extends SearchEngine {
    public Key(params: SearchParams, contextUser: UserInfo): string {
        return this.buildCacheKey((params.Query ?? '').trim(), params, contextUser);
    }
}

const user = (id = 'user-1'): UserInfo => ({ ID: id, Name: 'T', Email: 't@e.com' }) as UserInfo;
const base = (over: Partial<SearchParams> = {}): SearchParams => ({ Query: 'refund policy', ...over });

const engine = new TestSearchEngine();
const k = (over: Partial<SearchParams> = {}, u: UserInfo = user()) => engine.Key(base(over), u);

describe('buildCacheKey — must discriminate on tenancy and scope', () => {
    it('DISCRIMINATES on AISkillID (regression — the same leak, reintroduced)', () => {
        // Found in adversarial review. `AISkillID` was added to SearchParams when the skill
        // became a search principal, and the cache key was not updated — the exact omission this
        // whole test file exists for. It matters because a skill can reach a scope the user's own
        // roles do not grant and binds into expansion queries, so two searches differing only by
        // active skill are NOT interchangeable.
        expect(k({ AISkillID: 'skill-a' })).not.toBe(k({ AISkillID: 'skill-b' }));
        expect(k({ AISkillID: 'skill-a' })).not.toBe(k({}));
        // …but the same skill must still coalesce, or the cache stops earning its keep.
        expect(k({ AISkillID: 'skill-a' })).toBe(k({ AISkillID: 'skill-a' }));
    });

    it('DISCRIMINATES on AISkillID INDEPENDENTLY of AIAgentID', () => {
        // Guards against a "fix" that folds both principals into one field.
        expect(k({ AIAgentID: 'a', AISkillID: 'x' })).not.toBe(k({ AIAgentID: 'a', AISkillID: 'y' }));
        expect(k({ AIAgentID: 'a', AISkillID: 'x' })).not.toBe(k({ AIAgentID: 'b', AISkillID: 'x' }));
    });

    it('DISCRIMINATES on PrimaryScopeRecordID (the cross-tenant leak)', () => {
        const tenantA = k({ SearchContext: { PrimaryScopeRecordID: 'org-a' } });
        const tenantB = k({ SearchContext: { PrimaryScopeRecordID: 'org-b' } });
        expect(tenantA).not.toBe(tenantB);
    });

    it('DISCRIMINATES between having a tenant context and having none', () => {
        expect(k({ SearchContext: { PrimaryScopeRecordID: 'org-a' } })).not.toBe(k());
    });

    it('DISCRIMINATES on a SecondaryScopes dimension value (channel/skill collision)', () => {
        const asPublic = k({ SearchContext: { SecondaryScopes: { EffectiveChannelID: 'public' } } });
        const asMember = k({ SearchContext: { SecondaryScopes: { EffectiveChannelID: 'member' } } });
        expect(asPublic).not.toBe(asMember);
    });

    it('DISCRIMINATES when an extra dimension is added', () => {
        const tierOnly = k({ SearchContext: { SecondaryScopes: { EffectiveChannelID: 'member' } } });
        const tierPlusSkill = k({
            SearchContext: { SecondaryScopes: { EffectiveChannelID: 'member', NarrowingSkillID: 'skill-1' } },
        });
        expect(tierOnly).not.toBe(tierPlusSkill);
    });

    it('DISCRIMINATES on ScopeIDs membership', () => {
        expect(k({ ScopeIDs: ['a'] })).not.toBe(k({ ScopeIDs: ['a', 'b'] }));
        expect(k({ ScopeIDs: ['a'] })).not.toBe(k());
    });

    it('DISCRIMINATES on ScopeIDs ORDER, because order is behaviourally significant', () => {
        // Cross-scope reranker config and budget are taken from the first scope in the
        // array that supplies one, so two orderings can yield different results.
        expect(k({ ScopeIDs: ['a', 'b'] })).not.toBe(k({ ScopeIDs: ['b', 'a'] }));
    });

    it('DISCRIMINATES on PrimaryScopeEntityID', () => {
        expect(k({ SearchContext: { PrimaryScopeEntityID: 'e1', PrimaryScopeRecordID: 'r' } }))
            .not.toBe(k({ SearchContext: { PrimaryScopeEntityID: 'e2', PrimaryScopeRecordID: 'r' } }));
    });
});

describe('buildCacheKey — other result-affecting inputs', () => {
    it('DISCRIMINATES on Mode, FusionWeightsOverride, PermissionOverfetchFactor and AIAgentID', () => {
        const ref = k();
        expect(k({ Mode: 'preview' as SearchParams['Mode'] })).not.toBe(ref);
        expect(k({ PermissionOverfetchFactor: 4 })).not.toBe(ref);
        expect(k({ AIAgentID: 'agent-1' })).not.toBe(ref);
        expect(k({ FusionWeightsOverride: { Vector: 2 } as SearchParams['FusionWeightsOverride'] })).not.toBe(ref);
    });

    it('still DISCRIMINATES on the pre-existing inputs (no regression)', () => {
        const ref = k();
        expect(k({}, user('user-2'))).not.toBe(ref);
        expect(engine.Key(base({ Query: 'something else' }), user())).not.toBe(ref);
        expect(k({ MaxResults: 5 })).not.toBe(ref);
        expect(k({ MinScore: 0.5 })).not.toBe(ref);
        expect(k({ Filters: { Tags: ['x'] } })).not.toBe(ref);
    });
});

describe('buildCacheKey — must still coalesce logically-identical inputs', () => {
    it('COALESCES SecondaryScopes written in a different key order', () => {
        // Callers commonly build this bag by spreading, so insertion order varies.
        // JSON.stringify would fragment the cache here; stableStringify must not.
        const one = k({ SearchContext: { SecondaryScopes: { A: '1', B: '2' } } });
        const two = k({ SearchContext: { SecondaryScopes: { B: '2', A: '1' } } });
        expect(one).toBe(two);
    });

    it('COALESCES Filters arrays given in a different order', () => {
        expect(k({ Filters: { Tags: ['a', 'b'] } })).toBe(k({ Filters: { Tags: ['b', 'a'] } }));
    });

    it('COALESCES identical calls (key is deterministic)', () => {
        const params = base({ ScopeIDs: ['s1'], SearchContext: { PrimaryScopeRecordID: 'org-a', SecondaryScopes: { X: 'y' } } });
        expect(engine.Key(params, user())).toBe(engine.Key(params, user()));
    });

    it('distinguishes an array value from the equivalent joined string', () => {
        const asArray = k({ SearchContext: { SecondaryScopes: { Src: ['a', 'b'] } } });
        const asString = k({ SearchContext: { SecondaryScopes: { Src: 'a,b' } } });
        expect(asArray).not.toBe(asString);
    });
});

describe('stableStringify', () => {
    class S extends SearchEngine { public Stringify(v: unknown) { return this.stableStringify(v); } }
    const s = new S();

    it('sorts object keys recursively', () => {
        expect(s.Stringify({ b: 1, a: { d: 2, c: 3 } })).toBe(s.Stringify({ a: { c: 3, d: 2 }, b: 1 }));
    });

    it('PRESERVES array order', () => {
        expect(s.Stringify(['a', 'b'])).not.toBe(s.Stringify(['b', 'a']));
    });

    it('omits undefined members so absent and explicitly-undefined agree', () => {
        expect(s.Stringify({ a: 1, b: undefined })).toBe(s.Stringify({ a: 1 }));
    });

    it('handles primitives and null', () => {
        expect(s.Stringify(null)).toBe('null');
        expect(s.Stringify(5)).toBe('5');
        expect(s.Stringify('x')).toBe('"x"');
        expect(s.Stringify(true)).toBe('true');
    });
});

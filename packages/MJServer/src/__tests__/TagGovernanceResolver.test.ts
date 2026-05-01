import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for TagGovernanceResolver.
 *
 * type-graphql decorators on the resolver class need a registered TypeGraphQL
 * runtime to instantiate, so we don't construct the resolver directly. Instead
 * we verify the resolver wraps the engines correctly by stubbing the engines
 * and asserting the dispatch contract — what gets called, with what args, and
 * how errors are surfaced.
 */

const { promoteCalls, rejectCalls, rebuildCalls, healthCalls, behaviorFlags } = vi.hoisted(() => ({
    promoteCalls: [] as Array<{ id: string; strategy: unknown; user: unknown }>,
    rejectCalls: [] as Array<{ id: string; notes: string | null; user: unknown }>,
    rebuildCalls: [] as Array<{ user: unknown }>,
    healthCalls: [] as Array<{ thresholds: unknown; user: unknown }>,
    behaviorFlags: { promoteThrows: false, rejectThrows: false, rebuildThrows: false, healthThrows: false },
}));

vi.mock('@memberjunction/tag-engine', () => ({
    TagGovernanceEngine: {
        Instance: {
            PromoteSuggestion: async (id: string, strategy: unknown, user: unknown) => {
                promoteCalls.push({ id, strategy, user });
                if (behaviorFlags.promoteThrows) throw new Error('promote-fail');
                return { ID: 'new-tag-id', Name: 'Resolved Tag' };
            },
            RejectSuggestion: async (id: string, notes: string | null, user: unknown) => {
                rejectCalls.push({ id, notes, user });
                if (behaviorFlags.rejectThrows) throw new Error('reject-fail');
            },
        },
    },
    TagEngine: {
        Instance: {
            RebuildTagEmbeddings: async (user: unknown) => {
                rebuildCalls.push({ user });
                if (behaviorFlags.rebuildThrows) throw new Error('rebuild-fail');
                return { refreshed: 7, total: 100 };
            },
        },
    },
    TagHealthJob: {
        Instance: {
            Run: async (thresholds: unknown, user: unknown) => {
                healthCalls.push({ thresholds, user });
                if (behaviorFlags.healthThrows) throw new Error('health-fail');
                return { mergeCount: 3, lowUsageCount: 2, wideNodeCount: 1, durationMs: 42 };
            },
        },
    },
    DEFAULT_TAG_HEALTH_THRESHOLDS: {
        minCoOccurrence: 5,
        minNameSimilarity: 0.5,
        minEmbeddingSimilarity: 0.85,
        maxUsage: 2,
        maxImplicitChildren: 25,
    },
}));

// Minimal type-graphql shim — we only need the decorators to be no-ops so the
// resolver class can load. Method behavior is what we test.
vi.mock('type-graphql', () => ({
    Resolver:    () => () => undefined,
    Mutation:    () => () => undefined,
    Query:       () => () => undefined,
    Ctx:         () => () => undefined,
    Arg:         () => () => undefined,
    ObjectType:  () => () => undefined,
    Field:       () => () => undefined,
    Int:         () => undefined,
    Float:       () => undefined,
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

// Stub ResolverBase — we only need GetUserFromPayload to return a synthetic user.
vi.mock('../generic/ResolverBase.js', () => ({
    ResolverBase: class {
        GetUserFromPayload(payload: unknown) {
            if (!payload) return null;
            return { ID: 'user-1', Email: 'test@example.com' };
        }
    },
}));

import { TagGovernanceResolver } from '../resolvers/TagGovernanceResolver.js';

describe('TagGovernanceResolver', () => {
    let resolver: TagGovernanceResolver;

    beforeEach(() => {
        promoteCalls.length = 0;
        rejectCalls.length = 0;
        rebuildCalls.length = 0;
        healthCalls.length = 0;
        behaviorFlags.promoteThrows = false;
        behaviorFlags.rejectThrows = false;
        behaviorFlags.rebuildThrows = false;
        behaviorFlags.healthThrows = false;
        resolver = new TagGovernanceResolver();
    });

    const ctx = (withUser = true) => withUser ? { userPayload: { sub: 'u-1' } } : { userPayload: undefined };

    // ---- PromoteTagSuggestion ----------------------------------------------

    describe('PromoteTagSuggestion', () => {
        it('rejects when no current user is resolved from the payload', async () => {
            const r = await resolver.PromoteTagSuggestion('s-1', 'create-new', undefined, ctx(false) as never);
            expect(r.Success).toBe(false);
            expect(r.ErrorMessage).toContain('current user');
            expect(promoteCalls).toHaveLength(0);
        });

        it('rejects unknown strategies', async () => {
            const r = await resolver.PromoteTagSuggestion('s-1', 'wat' as never, undefined, ctx() as never);
            expect(r.Success).toBe(false);
            expect(r.ErrorMessage).toContain('Unknown strategy');
            expect(promoteCalls).toHaveLength(0);
        });

        it('requires targetTagID for merge-into-existing', async () => {
            const r = await resolver.PromoteTagSuggestion('s-1', 'merge-into-existing', undefined, ctx() as never);
            expect(r.Success).toBe(false);
            expect(r.ErrorMessage).toContain('targetTagID is required');
            expect(promoteCalls).toHaveLength(0);
        });

        it('dispatches create-new and returns the resolved tag', async () => {
            const r = await resolver.PromoteTagSuggestion('s-1', 'create-new', undefined, ctx() as never);
            expect(r.Success).toBe(true);
            expect(r.ResolvedTagID).toBe('new-tag-id');
            expect(r.ResolvedTagName).toBe('Resolved Tag');
            expect(promoteCalls[0].id).toBe('s-1');
            expect((promoteCalls[0].strategy as { kind: string }).kind).toBe('create-new');
        });

        it('dispatches merge-into-existing with the target tag ID', async () => {
            const r = await resolver.PromoteTagSuggestion('s-1', 'merge-into-existing', 'target-tag', ctx() as never);
            expect(r.Success).toBe(true);
            expect((promoteCalls[0].strategy as { kind: string; targetTagID: string }).targetTagID).toBe('target-tag');
        });

        it('returns Success=false with the error message when the engine throws', async () => {
            behaviorFlags.promoteThrows = true;
            const r = await resolver.PromoteTagSuggestion('s-1', 'create-new', undefined, ctx() as never);
            expect(r.Success).toBe(false);
            expect(r.ErrorMessage).toBe('promote-fail');
        });
    });

    // ---- RejectTagSuggestion -----------------------------------------------

    describe('RejectTagSuggestion', () => {
        it('rejects without a user', async () => {
            const r = await resolver.RejectTagSuggestion('s-1', undefined, ctx(false) as never);
            expect(r.Success).toBe(false);
            expect(rejectCalls).toHaveLength(0);
        });

        it('passes optional reviewer notes to the engine', async () => {
            const r = await resolver.RejectTagSuggestion('s-1', 'looked spammy', ctx() as never);
            expect(r.Success).toBe(true);
            expect(rejectCalls[0]).toMatchObject({ id: 's-1', notes: 'looked spammy' });
        });

        it('coerces undefined notes to null', async () => {
            await resolver.RejectTagSuggestion('s-1', undefined, ctx() as never);
            expect(rejectCalls[0].notes).toBeNull();
        });

        it('returns the engine error on failure', async () => {
            behaviorFlags.rejectThrows = true;
            const r = await resolver.RejectTagSuggestion('s-1', undefined, ctx() as never);
            expect(r.Success).toBe(false);
            expect(r.ErrorMessage).toBe('reject-fail');
        });
    });

    // ---- RebuildTagEmbeddings ----------------------------------------------

    describe('RebuildTagEmbeddings', () => {
        it('rejects without a user', async () => {
            const r = await resolver.RebuildTagEmbeddings(ctx(false) as never);
            expect(r.Success).toBe(false);
            expect(r.Refreshed).toBe(0);
            expect(r.Total).toBe(0);
        });

        it('returns the refresh counts from the engine', async () => {
            const r = await resolver.RebuildTagEmbeddings(ctx() as never);
            expect(r.Success).toBe(true);
            expect(r.Refreshed).toBe(7);
            expect(r.Total).toBe(100);
            expect(rebuildCalls).toHaveLength(1);
        });

        it('returns 0/0 with an error message when the engine throws', async () => {
            behaviorFlags.rebuildThrows = true;
            const r = await resolver.RebuildTagEmbeddings(ctx() as never);
            expect(r.Success).toBe(false);
            expect(r.ErrorMessage).toBe('rebuild-fail');
            expect(r.Refreshed).toBe(0);
        });
    });

    // ---- RunTagHealth ------------------------------------------------------

    describe('RunTagHealth', () => {
        it('rejects without a user', async () => {
            const r = await resolver.RunTagHealth(undefined, undefined, undefined, undefined, undefined, ctx(false) as never);
            expect(r.Success).toBe(false);
            expect(healthCalls).toHaveLength(0);
        });

        it('falls back to defaults when no thresholds are supplied', async () => {
            const r = await resolver.RunTagHealth(undefined, undefined, undefined, undefined, undefined, ctx() as never);
            expect(r.Success).toBe(true);
            expect(r.MergeCount).toBe(3);
            expect(r.LowUsageCount).toBe(2);
            expect(r.WideNodeCount).toBe(1);
            const t = healthCalls[0].thresholds as Record<string, number>;
            expect(t.minCoOccurrence).toBe(5);     // from DEFAULT
            expect(t.maxImplicitChildren).toBe(25);// from DEFAULT
        });

        it('overrides only the supplied threshold fields', async () => {
            await resolver.RunTagHealth(20, 0.7, undefined, 1, undefined, ctx() as never);
            const t = healthCalls[0].thresholds as Record<string, number>;
            expect(t.minCoOccurrence).toBe(20);
            expect(t.minNameSimilarity).toBe(0.7);
            expect(t.minEmbeddingSimilarity).toBe(0.85); // from DEFAULT
            expect(t.maxUsage).toBe(1);
            expect(t.maxImplicitChildren).toBe(25);      // from DEFAULT
        });

        it('returns the duration alongside the counts', async () => {
            const r = await resolver.RunTagHealth(undefined, undefined, undefined, undefined, undefined, ctx() as never);
            expect(r.DurationMs).toBe(42);
        });

        it('surfaces engine errors with zeroed counts', async () => {
            behaviorFlags.healthThrows = true;
            const r = await resolver.RunTagHealth(undefined, undefined, undefined, undefined, undefined, ctx() as never);
            expect(r.Success).toBe(false);
            expect(r.MergeCount).toBe(0);
            expect(r.ErrorMessage).toBe('health-fail');
        });
    });
});

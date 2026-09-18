/**
 * Tests for TailConversationEvents — the durable, resumable read of an agent run's
 * progress (MJ #4222).
 *
 * The live `statusUpdates` subscription has no replay, so anything published while a
 * socket is half-open is lost and the client cannot tell "nothing happened" from "I
 * missed everything". This query is the durable counterpart. The properties that make
 * it safe to rely on are pinned here: a cursor that never rewinds, a terminal payload
 * that is never handed over early, and an authorization answer that does not leak
 * whether a record exists.
 *
 * Mocking is at the package boundary — `@memberjunction/core`'s RunView, which is the
 * only I/O the resolver performs. The resolver itself runs unmodified.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

// RunView is the resolver's only runtime dependency on core — every other import it
// makes is type-only and erased at compile time, so a narrow mock is sufficient and
// keeps the real package (which loads config at import) out of the test.
vi.mock('@memberjunction/core', () => ({
    RunView: class MockRunView {
        public async RunView(params: RunViewParams, contextUser?: UserInfo): Promise<unknown> {
            return mockRunView(params, contextUser);
        }
    },
}));

import { ConversationRunEventsResolver } from '../resolvers/ConversationRunEventsResolver';

const DETAIL_ID = 'A1111111-1111-1111-1111-111111111111';
const RUN_ID = 'B2222222-2222-2222-2222-222222222222';
const USER = { ID: 'U0000000-0000-0000-0000-000000000000', Email: 'someone@example.com' } as unknown as UserInfo;

const ctxFor = (user?: UserInfo) => ({ userPayload: { userRecord: user } }) as never;

/** Scripts RunView per entity so each test states only what it cares about. */
function scriptRunView(opts: {
    detail?: Record<string, unknown> | null;
    run?: Record<string, unknown> | null;
    steps?: Record<string, unknown>[];
}) {
    mockRunView.mockImplementation(async (params: RunViewParams) => {
        if (params.EntityName === 'MJ: Conversation Details') {
            return { Success: true, Results: opts.detail ? [opts.detail] : [] };
        }
        if (params.EntityName === 'MJ: AI Agent Runs') {
            return { Success: true, Results: opts.run ? [opts.run] : [] };
        }
        if (params.EntityName === 'MJ: AI Agent Run Steps') {
            return { Success: true, Results: opts.steps ?? [] };
        }
        throw new Error(`unexpected entity ${params.EntityName}`);
    });
}

const step = (seq: number, over: Record<string, unknown> = {}) => ({
    StepNumber: seq,
    StepType: 'Actions',
    StepName: `Step ${seq}`,
    Status: 'Completed',
    Success: true,
    StartedAt: new Date('2026-09-16T04:55:12Z'),
    CompletedAt: new Date('2026-09-16T04:55:21Z'),
    ...over,
});

describe('TailConversationEvents', () => {
    let resolver: ConversationRunEventsResolver;

    beforeEach(() => {
        vi.clearAllMocks();
        resolver = new ConversationRunEventsResolver();
    });

    describe('authorization', () => {
        it('refuses an unauthenticated caller', async () => {
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(undefined), 0);
            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(/not authenticated/i);
            expect(mockRunView).not.toHaveBeenCalled();
        });

        it('reads the conversation detail AS THE CALLING USER, so row-level security applies', async () => {
            scriptRunView({ detail: { ID: DETAIL_ID, Status: 'In-Progress' }, run: null });
            await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            const [params, contextUser] = mockRunView.mock.calls[0];
            expect(params.EntityName).toBe('MJ: Conversation Details');
            // Passing the user is the entire authorization mechanism. A system user here
            // would silently expose every conversation in the instance.
            expect(contextUser).toBe(USER);
        });

        it('bypasses the server RunView cache on every read', async () => {
            // This is the last-resort recovery path, and the rows it judges are written by
            // things that never fire a cache invalidation: `spSweepStaleAIAgentRuns` force-fails
            // a run with a direct set-based UPDATE. `TrustServerCacheCompletely` defaults on, so
            // a cached read here would keep reporting the run as Running and the recovery would
            // never fire — the exact failure this resolver exists to end.
            scriptRunView({
                detail: { ID: DETAIL_ID, Status: 'In-Progress' },
                run: { ID: RUN_ID, Status: 'Completed' },
                steps: [],
            });

            await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            expect(mockRunView.mock.calls.length).toBeGreaterThan(0);
            for (const [params] of mockRunView.mock.calls) {
                expect(params.BypassCache, `${params.EntityName} must bypass the cache`).toBe(true);
            }
        });

        it('gives an unreadable detail the same answer as a missing one', async () => {
            scriptRunView({ detail: null });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            // "Exists but denied" would confirm the id to someone probing for one.
            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(/not found/i);
            expect(out.Events).toEqual([]);
        });
    });

    describe('cursor behavior', () => {
        it('asks only for steps beyond the caller cursor', async () => {
            scriptRunView({ detail: { ID: DETAIL_ID }, run: { ID: RUN_ID, Status: 'Running' }, steps: [] });
            await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 7);

            const stepCall = mockRunView.mock.calls.find((c) => c[0].EntityName === 'MJ: AI Agent Run Steps');
            expect(stepCall?.[0].ExtraFilter).toContain('StepNumber > 7');
            expect(stepCall?.[0].OrderBy).toBe('StepNumber ASC');
        });

        it('never rewinds the cursor when nothing new has landed', async () => {
            scriptRunView({ detail: { ID: DETAIL_ID }, run: { ID: RUN_ID, Status: 'Running' }, steps: [] });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 12);

            // Returning 0 here would make a polling client replay the whole run every tick.
            expect(out.LatestSeq).toBe(12);
            expect(out.Events).toEqual([]);
        });

        it('advances the cursor to the last event returned', async () => {
            scriptRunView({
                detail: { ID: DETAIL_ID },
                run: { ID: RUN_ID, Status: 'Running' },
                steps: [step(3), step(4), step(5)],
            });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 2);

            expect(out.Events.map((e) => e.Seq)).toEqual([3, 4, 5]);
            expect(out.LatestSeq).toBe(5);
        });

        it('treats a negative cursor as the start of the run', async () => {
            scriptRunView({ detail: { ID: DETAIL_ID }, run: { ID: RUN_ID, Status: 'Running' }, steps: [] });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), -5);

            const stepCall = mockRunView.mock.calls.find((c) => c[0].EntityName === 'MJ: AI Agent Run Steps');
            expect(stepCall?.[0].ExtraFilter).toContain('StepNumber > 0');
            expect(out.LatestSeq).toBe(0);
        });

        it('bounds how much one call can return', async () => {
            scriptRunView({ detail: { ID: DETAIL_ID }, run: { ID: RUN_ID, Status: 'Running' }, steps: [] });
            await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            // A run can hold hundreds of steps. Unbounded, one tail could return tens of
            // megabytes — the same failure class as #4539.
            const stepCall = mockRunView.mock.calls.find((c) => c[0].EntityName === 'MJ: AI Agent Run Steps');
            expect(stepCall?.[0].MaxRows).toBe(200);
        });
    });

    describe('run lifecycle', () => {
        it('reports an early poll as success, not failure, when the run row does not exist yet', async () => {
            scriptRunView({ detail: { ID: DETAIL_ID, Status: 'In-Progress' }, run: null });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            // Fire-and-forget acks before the run row is written, so this is an ordinary
            // race. Reporting failure would make a client abandon a run that is about to start.
            expect(out.Success).toBe(true);
            expect(out.IsInFlight).toBe(false);
            expect(out.DetailStatus).toBe('In-Progress');
        });

        it('marks a Running run in flight and withholds the payload', async () => {
            scriptRunView({
                detail: { ID: DETAIL_ID, Status: 'In-Progress' },
                run: { ID: RUN_ID, Status: 'Running', Result: '{"partial":true}' },
                steps: [step(1)],
            });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            expect(out.IsInFlight).toBe(true);
            // A partial Result mid-run could be mistaken for the final answer.
            expect(out.FinalPayload).toBeUndefined();
        });

        it('releases the payload once the run is terminal, so one call ends the wait', async () => {
            scriptRunView({
                detail: { ID: DETAIL_ID, Status: 'Complete' },
                run: { ID: RUN_ID, Status: 'Completed', Result: '{"answer":"done"}' },
                steps: [step(1)],
            });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            expect(out.IsInFlight).toBe(false);
            expect(out.FinalPayload).toBe('{"answer":"done"}');
            expect(out.RunStatus).toBe('Completed');
            expect(out.DetailStatus).toBe('Complete');
        });

        it('treats a failed run as terminal so a client stops tailing', async () => {
            scriptRunView({
                detail: { ID: DETAIL_ID, Status: 'Error' },
                run: { ID: RUN_ID, Status: 'Failed', Result: null },
                steps: [step(1, { Status: 'Failed', Success: false, ErrorMessage: 'boom' })],
            });
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            expect(out.IsInFlight).toBe(false);
            expect(out.Events[0].ErrorMessage).toBe('boom');
        });

        it('selects the NEWEST run, so a retried detail does not resolve from a dead run', async () => {
            scriptRunView({ detail: { ID: DETAIL_ID }, run: { ID: RUN_ID, Status: 'Running' }, steps: [] });
            await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

            const runCall = mockRunView.mock.calls.find((c) => c[0].EntityName === 'MJ: AI Agent Runs');
            expect(runCall?.[0].OrderBy).toMatch(/DESC/i);
            expect(runCall?.[0].MaxRows).toBe(1);
        });
    });

    describe('robustness', () => {
        it('returns a failure result rather than throwing when a read blows up', async () => {
            mockRunView.mockRejectedValue(new Error('db unavailable'));
            const out = await resolver.TailConversationEvents(DETAIL_ID, ctxFor(USER), 4);

            // This is a recovery path. Throwing would break the very reconciliation it exists
            // to serve, and would rewind the caller's cursor.
            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(/db unavailable/);
            expect(out.LatestSeq).toBe(4);
        });

        it('escapes quotes in the id instead of interpolating them into the filter', async () => {
            scriptRunView({ detail: null });
            await resolver.TailConversationEvents("x' OR '1'='1", ctxFor(USER), 0);

            const params = mockRunView.mock.calls[0][0];
            expect(params.ExtraFilter).toContain("''");
            expect(params.ExtraFilter).not.toMatch(/ID='x' OR '1'='1'/);
        });
    });
});

/**
 * REGRESSION, found in manual testing. `FinalPayload` read only `AIAgentRun.Result`, which is
 * agent-dependent — null on 16 of 40 completed runs in a real database, including every run of the
 * Loop-type agent used to reproduce #4222. A caller waiting on this field to decide a message was
 * finished would wait forever on those agents.
 */
describe('TailConversationEvents FinalPayload sourcing', () => {
    it('falls back to the conversation detail message when the run has no Result', async () => {
        scriptRunView({
            detail: { ID: DETAIL_ID, Status: 'Complete', Message: 'the answer text' },
            run: { ID: RUN_ID, Status: 'Completed', Result: null },
            steps: [],
        });

        const result = await new ConversationRunEventsResolver().TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

        expect(result.IsInFlight).toBe(false);
        expect(result.FinalPayload).toBe('the answer text');
    });

    it('prefers the run Result when the agent does write one', async () => {
        scriptRunView({
            detail: { ID: DETAIL_ID, Status: 'Complete', Message: 'detail message' },
            run: { ID: RUN_ID, Status: 'Completed', Result: 'run result' },
            steps: [],
        });

        const result = await new ConversationRunEventsResolver().TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

        expect(result.FinalPayload).toBe('run result');
    });

    it('still withholds the payload while the run is in flight', async () => {
        scriptRunView({
            detail: { ID: DETAIL_ID, Status: 'In-Progress', Message: 'partial text' },
            run: { ID: RUN_ID, Status: 'Running', Result: null },
            steps: [],
        });

        const result = await new ConversationRunEventsResolver().TailConversationEvents(DETAIL_ID, ctxFor(USER), 0);

        expect(result.IsInFlight).toBe(true);
        expect(result.FinalPayload).toBeUndefined();
    });
});

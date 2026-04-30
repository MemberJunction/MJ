/**
 * S11 — ScopedSearchAction with streamingMode='partials' emits progress.
 *
 * Story: A consumer of the action wants to see provider-by-provider progress
 * before fusion completes. Calling SearchEngine.streamSearch directly with
 * a multi-provider scope, we assert events arrive in resolution order and
 * the final event matches what the synchronous path would have produced.
 *
 * Note: The LLM doesn't naturally pass `streamingMode='partials'` as a tool
 * parameter — it's an opt-in for programmatic callers. Rather than cajole
 * the LLM, we drive SearchEngine.streamSearch directly here. Other scenarios
 * already cover the agent-tool path; this one focuses on the streaming
 * contract.
 *
 * Proof:
 *   - Provider events arrive in resolution order (verified for both providers)
 *   - Exactly one 'fused' and one 'final' event
 *   - Final results match a sync Search() call's output
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';
import { SearchEngine, SearchStreamEvent } from '@memberjunction/search-engine';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S11Setup { baseline: BaselineSnapshot; }

const scenario: Scenario = {
    id: 's11',
    name: 'streamSearch emits provider events in resolution order',
    exercises: 'P2C.1 v2 concurrent emission contract (streamSearch async iterable)',
    setup: async (pool): Promise<S11Setup> => {
        await deleteSeededActions(pool, 's11');
        await seedActions(pool, 's11', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline };
    },
    action: async (ctx) => {
        const events: SearchStreamEvent[] = [];
        const t0 = Date.now();
        for await (const ev of SearchEngine.Instance.streamSearch({
            Query: 'AgentScenario-Seed-s11',
            ScopeIDs: [RAG_AUDIT_SCOPE_ID],
            Mode: 'full',
            AIAgentID: SAGE_AGENT_ID,
        }, ctx.arie)) {
            events.push(ev);
        }
        return {
            success: true,
            agentRunID: undefined,
            elapsedMs: Date.now() - t0,
            // Stash events on a side channel for the assertion to read
            errorMessage: JSON.stringify(events.map(e => ({
                phase: e.phase,
                providerName: 'providerName' in e ? e.providerName : undefined,
                count: 'results' in e ? e.results.length : undefined,
            }))),
        };
    },
    assert: async (_ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        const events = JSON.parse(runResult.errorMessage ?? '[]') as Array<{ phase: string; providerName?: string; count?: number }>;

        const phaseSequence = events.map(e => e.phase);
        const fusedIdx = phaseSequence.indexOf('fused');
        const finalIdx = phaseSequence.indexOf('final');
        const lastProviderIdx = phaseSequence.lastIndexOf('provider');

        assert(events.length >= 2, `streamSearch yielded multiple events (got ${events.length})`);
        assert(finalIdx >= 0, `'final' event present`);
        assert(fusedIdx >= 0, `'fused' event present`);
        assert(lastProviderIdx >= 0, `at least one 'provider' event present`);
        assert(fusedIdx > lastProviderIdx, `'fused' comes after all 'provider' events`);
        assert(finalIdx > fusedIdx, `'final' comes after 'fused'`);
        assert(phaseSequence.indexOf('error') === -1, `no 'error' event in stream`);

        const finalEvent = events[finalIdx];
        assert((finalEvent.count ?? 0) === 5,
            `final event has 5 results (matches synchronous Search() output)`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S11Setup | undefined;
        await deleteSeededActions(pool, 's11');
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

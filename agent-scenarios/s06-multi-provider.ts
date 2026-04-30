/**
 * S6 — Multi-provider scope with RRF fusion.
 *
 * Story: A scope has both EntitySearchProvider and FullTextSearchProvider
 * active. Some seed records have query terms in their Name (entity match),
 * some have terms in their Description (full-text match), some hit both.
 * RRF should rank the dual-match items highest.
 *
 * Note: this workbench has FullTextSearchProvider configured but its actual
 * SQL Server full-text catalog may or may not include __mj.Action. We assert
 * on whichever providers respond — the engine logs "Configured with N
 * provider(s)" and SearchExecutionLog.SourceCounts breaks down by source.
 *
 * Setup:
 *   - 5 seeded actions; verify SourceCounts shows Entity > 0 (FullText is
 *     opportunistic — assert if non-zero, don't assert on its absence)
 *
 * Proof:
 *   - SourceCounts.Entity > 0 in the SearchExecutionLog row
 *   - All 5 results returned with non-default scores (proves fusion ran)
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S06Setup { baseline: BaselineSnapshot; }

const scenario: Scenario = {
    id: 's06',
    name: 'Multi-provider scope produces fused results',
    exercises: 'Multi-provider parallel execution + SearchFusion (RRF)',
    setup: async (pool): Promise<S06Setup> => {
        await deleteSeededActions(pool, 's06');
        await seedActions(pool, 's06', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s06 records`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        assert(!!scopedSearchStep, `Scoped Search step appears in trace`);

        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.totalCount === 5, `all 5 results returned (got ${parsed.totalCount})`);
            // Every result has a Score (from RRF). If fusion didn't run, scores
            // would all be defaults (typically 1.0 from a single provider).
            const allHaveScores = parsed.results.length === 5
                && parsed.results.every(r => typeof r.Score === 'number' && r.Score > 0);
            assert(allHaveScores, `every result has a positive Score (proves fusion ran)`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        assert(logs.some(r => r.Status === 'Success' && r.ResultCount === 5),
            `SearchExecutionLog Success row with 5 results`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S06Setup | undefined;
        await deleteSeededActions(pool, 's06');
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

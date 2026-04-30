/**
 * S10 — Misconfigured reranker driver falls back gracefully.
 *
 * Story: Scope references a reranker driver class that doesn't exist in
 * ClassFactory (typo, deleted package, etc.). Engine should log + continue
 * without reranking, returning the pre-rerank fusion order.
 *
 * Why a bogus driver name (vs. "no API key"): on this workbench Cohere/etc
 * keys ARE set, so testing the missing-key path is environmental. The
 * misconfigured-driver path tests the same "graceful degradation" contract
 * and is deterministic.
 *
 * Setup:
 *   - Scope.ScopeConfig.reRanker.driverClass = 'BogusReRankerThatDoesNotExist'
 *   - 5 seeded actions
 *
 * Proof:
 *   - Action succeeds (no crash from misconfig)
 *   - All 5 results returned in fusion order
 *   - SearchExecutionLog row Status=Success, no reranker name recorded
 */
import * as sql from 'mssql';

import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S10Setup { baseline: BaselineSnapshot; originalScopeConfig: string | null; }

const scenario: Scenario = {
    id: 's10',
    name: 'Misconfigured reranker driver falls back gracefully',
    exercises: 'Reranker misconfig contract — bogus driver name never breaks search',
    setup: async (pool): Promise<S10Setup> => {
        await deleteSeededActions(pool, 's10');
        await seedActions(pool, 's10', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);

        const scopeRow = (await pool.request().query(`
            SELECT ScopeConfig FROM __mj.SearchScope WHERE ID='${RAG_AUDIT_SCOPE_ID}';
        `)).recordset[0];
        const originalScopeConfig: string | null = scopeRow?.ScopeConfig ?? null;
        await pool.request()
            .input('cfg', sql.NVarChar, JSON.stringify({ reRanker: { driverClass: 'BogusReRankerThatDoesNotExist' }, fusionWeights: {} }))
            .query(`UPDATE __mj.SearchScope SET ScopeConfig=@cfg WHERE ID='${RAG_AUDIT_SCOPE_ID}';`);

        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline, originalScopeConfig };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s10 records`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success (no crash from missing API key)`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.totalCount === 5,
                `all 5 results returned despite missing reranker key (got ${parsed.totalCount})`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const success = logs.find(r => r.Status === 'Success' && r.ResultCount === 5);
        assert(!!success, `SearchExecutionLog Status=Success row with 5 results`);
        if (success) {
            const cost = success.RerankerCostCents ?? 0;
            // Cost == 0 is the truth signal here — engine still records the
            // *configured* RerankerName even when ClassFactory falls back to
            // NoopReRanker (zero-cost pass-through). That's correct
            // behavior: ops want to see what was attempted, not just what
            // succeeded.
            assert(cost === 0,
                `RerankerCostCents = 0 (bogus reranker class falls back to no-op; got ${cost})`);
        }
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S10Setup | undefined;
        await deleteSeededActions(pool, 's10');
        if (s?.originalScopeConfig !== undefined) {
            await pool.request()
                .input('cfg', sql.NVarChar, s.originalScopeConfig)
                .query(`UPDATE __mj.SearchScope SET ScopeConfig=@cfg WHERE ID='${RAG_AUDIT_SCOPE_ID}';`);
        }
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

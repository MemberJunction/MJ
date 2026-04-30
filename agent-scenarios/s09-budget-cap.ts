/**
 * S9 — Budget cap engages, search still completes.
 *
 * Story: Admin caps reranker spend at 1 cent per search; configured reranker
 * (Cohere) would cost more. Budget guard engages, results still return in
 * pre-rerank fusion order, no agent-visible error.
 *
 * Setup:
 *   - Same as S8 + RerankerBudgetCents=1 on the scope
 *
 * Proof:
 *   - Action returns success
 *   - SearchExecutionLog Status=Success, RerankerCostCents <= 1
 *   - Results still returned (search did not abort)
 */
import * as sql from 'mssql';
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S09Setup {
    baseline: BaselineSnapshot;
    originalScopeConfig: string | null;
    originalBudgetCents: number | null;
}

const scenario: Scenario = {
    id: 's09',
    name: 'Reranker budget cap engages, search still completes',
    exercises: 'RerankerBudgetGuard circuit breaker (Phase 2D)',
    skipIfMissingEnv: 'AI_VENDOR_API_KEY__CohereLLM',
    setup: async (pool): Promise<S09Setup> => {
        await deleteSeededActions(pool, 's09');
        await seedActions(pool, 's09', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);

        const scopeRow = (await pool.request().query(`
            SELECT ScopeConfig, RerankerBudgetCents FROM __mj.SearchScope WHERE ID='${RAG_AUDIT_SCOPE_ID}';
        `)).recordset[0];
        const originalScopeConfig: string | null = scopeRow?.ScopeConfig ?? null;
        const originalBudgetCents: number | null = scopeRow?.RerankerBudgetCents ?? null;

        // Configure CohereReRanker + 1-cent budget cap
        await pool.request()
            .input('cfg', sql.NVarChar, JSON.stringify({ reRanker: { driverClass: 'CohereReRanker' }, fusionWeights: {} }))
            .query(`
                UPDATE __mj.SearchScope
                SET ScopeConfig=@cfg, RerankerBudgetCents=1
                WHERE ID='${RAG_AUDIT_SCOPE_ID}';
            `);

        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline, originalScopeConfig, originalBudgetCents };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s09 records`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.success === true && (parsed.totalCount ?? 0) >= 1,
                `Scoped Search action returned results despite budget cap (totalCount=${parsed.totalCount})`);
        }

        await new Promise(r => setTimeout(r, 1500));
        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const success = logs.find(r => r.Status === 'Success');
        assert(!!success, `SearchExecutionLog Status=Success row exists (search did not abort)`);
        if (success) {
            const cost = success.RerankerCostCents ?? 0;
            assert(cost <= 1,
                `RerankerCostCents <= budget cap of 1 (got ${cost})`);
        }
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S09Setup | undefined;
        await deleteSeededActions(pool, 's09');
        if (s?.originalScopeConfig !== undefined) {
            await pool.request()
                .input('cfg', sql.NVarChar, s.originalScopeConfig)
                .input('budget', sql.Int, s.originalBudgetCents)
                .query(`
                    UPDATE __mj.SearchScope
                    SET ScopeConfig=@cfg, RerankerBudgetCents=@budget
                    WHERE ID='${RAG_AUDIT_SCOPE_ID}';
                `);
        }
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

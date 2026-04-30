/**
 * S1 — Direct grant beats agent default.
 *
 * Story: Arie has an explicit Search grant on RAG-Audit-Scope. Sage's
 * SearchScopeAccess='None' would normally block all search, but the resolver
 * lets the direct user grant win.
 *
 * Setup:
 *   - Sage tool list = [Scoped Search]
 *   - Sage.SearchScopeAccess = 'Assigned' + scope listed (so the action
 *     resolves the scope; the "None" variant is covered by S3)
 *   - SearchScopePermission(arie, scope, Search)
 *   - 5 seeded actions with marker
 *
 * Proof:
 *   - Action returns success
 *   - SearchExecutionLog has a row with AIAgentID=Sage, Status=Success,
 *     ResultCount = SEED_COUNT
 *   - Scoped Search step appears in the agent run trace
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

interface S01Setup {
    actionIDs: string[];
    baseline: BaselineSnapshot;
}

const scenario: Scenario = {
    id: 's01',
    name: 'Direct grant beats agent default',
    exercises: 'Resolver Direct-grant path; AIAgentID attribution on Scoped Search action',
    setup: async (pool): Promise<S01Setup> => {
        await deleteSeededActions(pool, 's01');
        const actionIDs = await seedActions(pool, 's01', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, '60010842-AE0A-4866-A34E-849576DEB121', RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { actionIDs, baseline };
    },
    action: async (ctx) => {
        return await runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s01 records and list them`);
    },
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run result');
        assert(runResult.success === true, `agent run reported success`);
        assert(!!runResult.agentRunID, `agent run ID returned`);

        if (!runResult.agentRunID) return;
        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        assert(!!scopedSearchStep, `Scoped Search step appears in agent run trace`);

        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.success === true, `Scoped Search action succeeded (resultCode=${parsed.resultCode})`);
            assert(parsed.totalCount === 5, `Scoped Search returned all 5 seeded records (got ${parsed.totalCount})`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const successWith5 = logs.find(r => r.Status === 'Success' && r.ResultCount === 5);
        assert(!!successWith5, `SearchExecutionLog row with Status=Success ResultCount=5 attributed to Sage`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S01Setup | undefined;
        await deleteSeededActions(pool, 's01');
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

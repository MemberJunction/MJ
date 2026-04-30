/**
 * S13 — Empty results handled cleanly.
 *
 * Story: Sage searches for a token that doesn't match anything in the scope.
 * Engine returns an empty result set; agent responds gracefully; log row
 * records ResultCount=0 with Status=Success (not Failure — empty isn't an error).
 *
 * Setup:
 *   - 5 seeded actions, but the agent's search query uses a unique nonsense
 *     token that doesn't appear anywhere in the seed data
 *
 * Proof:
 *   - Action returns success but with TotalCount=0
 *   - SearchExecutionLog row Status=Success, ResultCount=0
 *   - Agent run terminates cleanly (no crash on empty)
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';
const NONSENSE_TOKEN = 'ZyxqvfblmnoXyz9382Quantum-Marker-Nonsense';

interface S13Setup { baseline: BaselineSnapshot; }

const scenario: Scenario = {
    id: 's13',
    name: 'Empty result set handled cleanly',
    exercises: 'Empty-result path; Status=Success ResultCount=0 contract',
    setup: async (pool): Promise<S13Setup> => {
        await deleteSeededActions(pool, 's13');
        await seedActions(pool, 's13', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Search for "${NONSENSE_TOKEN}" records and tell me what you find`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success (no crash on empty)`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.success === true, `Scoped Search action succeeded`);
            assert(parsed.totalCount === 0, `TotalCount=0 for the nonsense query (got ${parsed.totalCount})`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const empty = logs.find(r => r.Status === 'Success' && r.ResultCount === 0);
        assert(!!empty,
            `SearchExecutionLog Status=Success ResultCount=0 row exists (empty != Failure)`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S13Setup | undefined;
        await deleteSeededActions(pool, 's13');
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

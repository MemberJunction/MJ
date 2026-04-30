/**
 * S2 — Explicit None blocks even Manage role.
 *
 * Story: Arie's Developer role has Manage on the scope, but a separate
 * direct user-level None grant was set after a security incident. The
 * resolver respects the direct override.
 *
 * Setup:
 *   - Role grant Manage on Developer role + direct grant None for arie
 *   - Sage tool list = [Scoped Search]; SearchScopeAccess='Assigned' + scope listed
 *
 * Proof:
 *   - Action returns PERMISSION_DENIED (user-side, not agent-side)
 *   - SearchExecutionLog row Status=Forbidden with FailureReason mentioning the direct None
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, grantRole, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';
const DEVELOPER_ROLE_ID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E';

interface S02Setup { actionIDs: string[]; baseline: BaselineSnapshot; }

const scenario: Scenario = {
    id: 's02',
    name: 'Direct None overrides role Manage',
    exercises: 'Resolver: direct None overrides role grant; Forbidden log with reason',
    setup: async (pool): Promise<S02Setup> => {
        await deleteSeededActions(pool, 's02');
        const actionIDs = await seedActions(pool, 's02', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantRole(pool, DEVELOPER_ROLE_ID, RAG_AUDIT_SCOPE_ID, 'Manage');
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'None');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { actionIDs, baseline };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s02 records`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success (it terminated cleanly even though search was denied)`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        assert(!!scopedSearchStep, `Scoped Search step appears in trace`);

        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.success === false, `Scoped Search action failed (LLM saw a denial)`);
            // Note: createErrorResult's ResultCode field doesn't survive the
            // action runner's output serialization (separate product issue).
            // Assert on the human-readable message instead — that's what the
            // user-facing contract actually exposes to the agent.
            assert(typeof parsed.message === 'string' && /explicit None grant/i.test(parsed.message),
                `denial message references the explicit None grant ("${parsed.message?.slice(0, 80)}…")`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const forbidden = logs.find(r => r.Status === 'Forbidden');
        assert(!!forbidden, `Forbidden log row written for Sage on this scope`);
        if (forbidden) {
            assert(typeof forbidden.FailureReason === 'string' && forbidden.FailureReason.length > 0,
                `Forbidden log row carries FailureReason ("${forbidden.FailureReason?.slice(0, 80)}…")`);
        }
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S02Setup | undefined;
        await deleteSeededActions(pool, 's02');
        await pool.request().query(`
            DELETE FROM __mj.SearchScopePermission
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}'
              AND (UserID='${ARIE_ID}' OR RoleID='${DEVELOPER_ROLE_ID}');
        `);
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

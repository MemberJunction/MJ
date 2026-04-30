/**
 * S14 — Permission revoked between turns reflects on next turn.
 *
 * Story: Turn 1 succeeds; admin revokes user permission; Turn 2 sees Forbidden
 * within ~1 second. The resolver bypasses RunView cache (commit c8804751b8)
 * so the change shows up immediately.
 *
 * Setup:
 *   - Initial: arie has Search on the scope; 5 seeded actions
 *   - Turn 1: agent runs with permission, succeeds
 *   - SQL: DELETE the SearchScopePermission row (no engine restart)
 *   - Turn 2: agent runs again, sees Forbidden
 *
 * Proof:
 *   - Two SearchExecutionLog rows for Sage on this scope:
 *     - First: Status=Success, ResultCount > 0
 *     - Second: Status=Forbidden
 *   - Both attributed to Sage (proves AIAgentID threading)
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S14Setup { baseline: BaselineSnapshot; }

const scenario: Scenario = {
    id: 's14',
    name: 'Permission revoked between turns reflects immediately',
    exercises: 'Resolver cache-bypass on permission state changes (BypassCache:true)',
    setup: async (pool): Promise<S14Setup> => {
        await deleteSeededActions(pool, 's14');
        await seedActions(pool, 's14', 5);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        // Phase='AgentInvoked' (NOT 'Both') so AgentPreExecutionRAG doesn't
        // fire — we want the action's permission gate to be the only search
        // path on turn 2. With Phase='Both', RAG would bypass user-level
        // scope permission (it only checks agent-scope assignment) and feed
        // results to the LLM regardless of the revoke. That's a separate
        // observability concern and is out of scope for this test.
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID], { phase: 'AgentInvoked' });
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline };
    },
    action: async (ctx) => {
        const turn1 = await runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s14 records`);
        await ctx.pool.request().query(`
            DELETE FROM __mj.SearchScopePermission WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}';
        `);
        const turn2 = await runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s14 records again`);
        return [turn1, turn2];
    },
    assert: async (ctx, runResult) => {
        if (!Array.isArray(runResult) || runResult.length !== 2) throw new Error('expected two runs');
        const [turn1, turn2] = runResult;
        assert(turn1.success === true, `turn 1 reported success`);
        assert(turn2.success === true, `turn 2 reported success (terminated cleanly even though search was denied)`);

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const success = logs.find(r => r.Status === 'Success' && r.ResultCount > 0);
        const forbidden = logs.find(r => r.Status === 'Forbidden');
        assert(!!success, `turn 1 produced a Success log row`);
        assert(!!forbidden, `turn 2 produced a Forbidden log row (cache-bypass worked)`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S14Setup | undefined;
        await deleteSeededActions(pool, 's14');
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

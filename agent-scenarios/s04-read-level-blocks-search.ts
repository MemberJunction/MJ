/**
 * S4 — Read-level grants visibility but not search.
 *
 * Story: Junior employee can see scope metadata in the UI but can't run
 * searches. Read = "view scope existence", Search = "actually invoke".
 *
 * Setup:
 *   - Direct grant Read only
 *   - Sage tool list = [Scoped Search]; SearchScopeAccess='Assigned' + scope listed
 *
 * Proof:
 *   - Action returns PERMISSION_DENIED with the Read-level reason
 *   - SearchExecutionLog Status=Forbidden
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';
const DEVELOPER_ROLE_ID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E';

interface S04Setup { baseline: BaselineSnapshot; }

const scenario: Scenario = {
    id: 's04',
    name: 'Read level grants visibility but not search execution',
    exercises: 'Read-level Forbidden gate (commit 544e0247) on the action path',
    setup: async (pool): Promise<S04Setup> => {
        await deleteSeededActions(pool, 's04');
        await seedActions(pool, 's04', 3);
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);

        // Strip ALL prior permissions on this scope (incl. role grants) so
        // arie's only access is the Read row we're about to insert.
        await pool.request().query(`
            DELETE FROM __mj.SearchScopePermission
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}'
              AND (UserID='${ARIE_ID}' OR RoleID='${DEVELOPER_ROLE_ID}');
        `);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Read');

        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s04 records`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run terminated cleanly`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        assert(!!scopedSearchStep, `Scoped Search step appears in trace`);

        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.success === false, `Scoped Search action failed (Read level should not permit invocation)`);
            assert(typeof parsed.message === 'string' && /read/i.test(parsed.message),
                `denial message mentions Read level ("${parsed.message?.slice(0, 80)}…")`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const forbidden = logs.find(r => r.Status === 'Forbidden');
        assert(!!forbidden, `Forbidden log row attributed to Sage on this scope`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S04Setup | undefined;
        await deleteSeededActions(pool, 's04');
        await pool.request().query(`
            DELETE FROM __mj.SearchScopePermission
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND UserID='${ARIE_ID}';
        `);
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

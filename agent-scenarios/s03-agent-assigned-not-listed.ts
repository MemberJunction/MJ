/**
 * S3 — Agent='Assigned' refuses unlisted scopes.
 *
 * Story: Sage is configured Assigned + only allowed Customer-Docs-Scope, but
 * the LLM tries to query Internal-HR-Scope. Resolver should source=AgentAssignedNotListed.
 *
 * Setup:
 *   - We don't have a separate scope handy, so we synthesize one (a freshly
 *     inserted SearchScope that only this scenario uses)
 *   - Sage assigned ONLY to RAG-Audit-Scope (not the synth scope)
 *   - User has Search permission on the synth scope (so the user-level path
 *     wouldn't reject — only the agent-side rule does)
 *   - Force the LLM to call Scoped Search with the synth scope's ID
 *
 * Proof:
 *   - Action returns ACCESS_DENIED (agent-side, not PERMISSION_DENIED)
 *   - SearchExecutionLog Forbidden row references the agent
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S03Setup { actionIDs: string[]; baseline: BaselineSnapshot; synthScopeID: string; }

const scenario: Scenario = {
    id: 's03',
    name: 'Agent=Assigned refuses unlisted scope',
    exercises: 'Resolver Step 1b agent-side deny; ACCESS_DENIED vs PERMISSION_DENIED differentiation',
    setup: async (pool): Promise<S03Setup> => {
        await deleteSeededActions(pool, 's03');
        const actionIDs = await seedActions(pool, 's03', 3);

        // Synth a second scope that's NOT in Sage's assigned list
        const synthIDRow = (await pool.request().query(`
            DELETE FROM __mj.SearchScope WHERE Name='Scenario-S03-Forbidden-Scope';
            INSERT INTO __mj.SearchScope (Name, Description, Status, IsGlobal, IsDefault)
            OUTPUT INSERTED.ID
            VALUES ('Scenario-S03-Forbidden-Scope', 'Forbidden scope for S03', 'Active', 0, 0);
        `)).recordset[0];
        const synthScopeID: string = synthIDRow.ID;

        // Both scopes have actions in them
        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);
        await ensureScopeIncludesActions(pool, synthScopeID);

        // Sage assigned only to RAG-Audit-Scope (not synth)
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);

        // User has Search on both (so denial is purely agent-side)
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await grantUser(pool, ARIE_ID, synthScopeID, 'Search');

        await clearSearchLog(pool, SAGE_AGENT_ID);
        return { actionIDs, baseline, synthScopeID };
    },
    action: async (ctx, setupResult) => {
        const s = setupResult as S03Setup;
        // Tell Sage the explicit scope ID to use, baiting it into hitting
        // the unlisted scope. The Scoped Search action's ScopeID parameter
        // will receive this from the LLM's tool call.
        return runAgent(ctx.sage, ctx.arie,
            `Use the Scoped Search action with ScopeID="${s.synthScopeID}" and Query="AgentScenario-Seed-s03"`);
    },
    assert: async (ctx, runResult, setupResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        const s = setupResult as S03Setup;
        assert(runResult.success === true, `agent run reported success`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        assert(!!scopedSearchStep, `Scoped Search step appears in trace`);

        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.success === false, `Scoped Search action failed (denial as expected)`);
            // resultCode unreliable through the action runner serialization;
            // assert message content (this is the agent-side denial signature).
            assert(typeof parsed.message === 'string'
                && (/not permitted to use scope/i.test(parsed.message) || /assigned scope list/i.test(parsed.message)),
                `denial message identifies it as agent-side (not permitted / assigned-scope-list; got "${parsed.message?.slice(0, 80)}…")`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, s.synthScopeID);
        const forbidden = logs.find(r => r.Status === 'Forbidden');
        assert(!!forbidden, `Forbidden log row written for the unlisted scope`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S03Setup | undefined;
        await deleteSeededActions(pool, 's03');
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
        if (s?.synthScopeID) {
            await pool.request().query(`
                DELETE FROM __mj.SearchScopePermission WHERE SearchScopeID='${s.synthScopeID}';
                DELETE FROM __mj.SearchScopeEntity WHERE SearchScopeID='${s.synthScopeID}';
                DELETE FROM __mj.AIAgentSearchScope WHERE SearchScopeID='${s.synthScopeID}';
                DELETE FROM __mj.SearchExecutionLog WHERE SearchScopeID='${s.synthScopeID}';
                DELETE FROM __mj.SearchScope WHERE ID='${s.synthScopeID}';
            `);
        }
    },
};

runScenario(scenario);

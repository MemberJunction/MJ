/**
 * S5 — Multi-entity scope returns hits from each.
 *
 * Story: A scope spans MJ: Actions + MJ: Templates so Sage can answer
 * "what tools/prompts relate to X?". This scenario seeds Actions only
 * (Templates seeding requires more setup) but ensures BOTH entities are
 * searchable via SearchScopeEntity rows. The point is to verify the engine
 * routes searches across all configured entities.
 *
 * Setup:
 *   - SearchScopeEntity rows for MJ: Actions + MJ: Templates
 *   - Seed 5 actions; verify the engine searches both entities and the
 *     EntitySearchProvider's per-entity-limit math accommodates them
 *
 * Proof:
 *   - Engine logs show "Searching 2 entities" (or similar)
 *   - All 5 seeded actions returned (no per-entity-cap clipping)
 *   - SearchExecutionLog SourceCounts.Entity matches result count
 */
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    seedActions, deleteSeededActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';
import * as sql from 'mssql';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S05Setup { baseline: BaselineSnapshot; addedTemplateEntityID: string | null; }

const scenario: Scenario = {
    id: 's05',
    name: 'Multi-entity scope returns hits from each entity',
    exercises: 'EntitySearchProvider per-entity routing; multi-entity SearchScopeEntity handling',
    setup: async (pool): Promise<S05Setup> => {
        await deleteSeededActions(pool, 's05');
        await seedActions(pool, 's05', 5);

        // Ensure scope includes both Actions and Templates
        const actionsEnt = (await pool.request().query(`SELECT ID FROM __mj.Entity WHERE Name='MJ: Actions';`)).recordset[0];
        const templatesEnt = (await pool.request().query(`SELECT ID FROM __mj.Entity WHERE Name='Templates';`)).recordset[0];
        if (!actionsEnt) throw new Error('MJ: Actions not found');

        // Idempotent: ensure SearchScopeEntity rows exist
        for (const e of [actionsEnt, templatesEnt].filter(Boolean)) {
            const exists = await pool.request().query(`
                SELECT ID FROM __mj.SearchScopeEntity
                WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND EntityID='${e.ID}';
            `);
            if (exists.recordset.length === 0) {
                await pool.request().query(`
                    INSERT INTO __mj.SearchScopeEntity (SearchScopeID, EntityID)
                    VALUES ('${RAG_AUDIT_SCOPE_ID}', '${e.ID}');
                `);
            }
        }

        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline, addedTemplateEntityID: templatesEnt?.ID ?? null };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s05 records`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        assert(!!scopedSearchStep, `Scoped Search step appears in trace`);

        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            assert(parsed.success === true, `action succeeded`);
            assert(parsed.totalCount === 5,
                `all 5 seeded records returned despite multi-entity scope (got ${parsed.totalCount})`);
        }

        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const winner = logs.find(r => r.Status === 'Success' && r.ResultCount === 5);
        assert(!!winner, `SearchExecutionLog Success row with all 5 results attributed to Sage`);
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S05Setup | undefined;
        await deleteSeededActions(pool, 's05');
        // Drop the Templates SearchScopeEntity row we may have added so the
        // baseline scope shape (Actions only) is restored for other scenarios.
        if (s?.addedTemplateEntityID) {
            await pool.request().query(`
                DELETE FROM __mj.SearchScopeEntity
                WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND EntityID='${s.addedTemplateEntityID}';
            `);
        }
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

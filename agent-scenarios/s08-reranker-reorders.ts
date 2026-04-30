/**
 * S8 — Reranker reorders results meaningfully (paid API, gated on key).
 *
 * Story: Scope is configured with CohereReRanker; the reranker promotes
 * the actually-relevant doc to the top.
 *
 * Setup:
 *   - Scope.ScopeConfig.reRanker.driverClass = 'CohereReRanker'
 *   - 5 seeded actions; 2 are highly relevant (description has the keyword
 *     repeated), 3 are noise (only have the keyword once at the end)
 *   - Cohere API key env var present (otherwise SKIPPED)
 *
 * Proof:
 *   - SearchExecutionLog row records RerankerName='CohereReRanker' and
 *     RerankerCostCents > 0
 *   - The top result (by score) is one of the highly-relevant ones
 */
import * as sql from 'mssql';
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    deleteSeededActions, ensureScopeIncludesActions, clearSearchLog,
    grantUser, runAgent, getSearchLogRows, getAgentRunSteps, parseSearchStepResults,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot, SEED_PREFIX, SEED_MARKER,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';

interface S08Setup { baseline: BaselineSnapshot; originalScopeConfig: string | null; }

const scenario: Scenario = {
    id: 's08',
    name: 'CohereReRanker reorders results',
    exercises: 'Reranker pipeline (Phase 2D); RerankerName + cost recorded in log',
    skipIfMissingEnv: 'AI_VENDOR_API_KEY__CohereLLM',
    setup: async (pool): Promise<S08Setup> => {
        await deleteSeededActions(pool, 's08');

        // Hand-seed actions with engineered relevance: highly-relevant ones
        // (idx 1 and 2) have the marker keyword in BOTH Name and Description
        // multiple times; noise ones (idx 3-5) only mention it once.
        const cat = (await pool.request().query(`SELECT TOP 1 ID FROM __mj.ActionCategory ORDER BY Name;`)).recordset[0];
        for (let i = 1; i <= 5; i++) {
            const isRelevant = i <= 2;
            const desc = isRelevant
                ? `${SEED_MARKER} highly relevant ${SEED_MARKER} action describing ${SEED_PREFIX}-s08 in detail. ${SEED_MARKER} again.`
                : `Noise record ${i} that mentions ${SEED_MARKER} once incidentally near the end.`;
            await pool.request()
                .input('cat', sql.UniqueIdentifier, cat.ID)
                .input('name', sql.NVarChar, `${SEED_PREFIX}-s08-${i}${isRelevant ? '-relevant' : '-noise'}`)
                .input('desc', sql.NVarChar, desc)
                .query(`
                    INSERT INTO __mj.Action (CategoryID, Name, Description, Type, Status, IconClass)
                    VALUES (@cat, @name, @desc, 'Custom', 'Pending', 'fa-solid fa-flask');
                `);
        }

        await ensureScopeIncludesActions(pool, RAG_AUDIT_SCOPE_ID);

        // Configure the scope with CohereReRanker
        const scopeRow = (await pool.request().query(`
            SELECT ScopeConfig FROM __mj.SearchScope WHERE ID='${RAG_AUDIT_SCOPE_ID}';
        `)).recordset[0];
        const originalScopeConfig: string | null = scopeRow?.ScopeConfig ?? null;
        const newConfig = JSON.stringify({ reRanker: { driverClass: 'CohereReRanker' }, fusionWeights: {} });
        await pool.request()
            .input('cfg', sql.NVarChar, newConfig)
            .query(`UPDATE __mj.SearchScope SET ScopeConfig=@cfg WHERE ID='${RAG_AUDIT_SCOPE_ID}';`);

        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        return { baseline, originalScopeConfig };
    },
    action: async (ctx) => runAgent(ctx.sage, ctx.arie, `Find AgentScenario-Seed-s08 records and rank by relevance`),
    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        assert(runResult.success === true, `agent run reported success`);
        if (!runResult.agentRunID) return;

        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        if (scopedSearchStep) {
            const parsed = parseSearchStepResults(scopedSearchStep);
            const topResult = parsed.results[0];
            assert(typeof topResult?.Title === 'string' && /-relevant/.test(topResult.Title),
                `top-ranked result is one of the relevant ones (got "${topResult?.Title ?? 'none'}")`);
        }

        // SearchExecutionLog write is fire-and-forget; give it a moment to land.
        await new Promise(r => setTimeout(r, 1500));
        const logs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        const winner = logs.find(r => r.Status === 'Success' && r.RerankerName === 'CohereReRanker');
        assert(!!winner, `SearchExecutionLog row records RerankerName='CohereReRanker'`);
        if (winner) {
            assert(typeof winner.RerankerCostCents === 'number' && winner.RerankerCostCents > 0,
                `RerankerCostCents > 0 (got ${winner.RerankerCostCents})`);
        }
    },
    teardown: async (pool, setupResult) => {
        const s = setupResult as S08Setup | undefined;
        await deleteSeededActions(pool, 's08');
        if (s?.originalScopeConfig !== undefined) {
            await pool.request()
                .input('cfg', sql.NVarChar, s.originalScopeConfig)
                .query(`UPDATE __mj.SearchScope SET ScopeConfig=@cfg WHERE ID='${RAG_AUDIT_SCOPE_ID}';`);
        }
        if (s?.baseline) await revertSageBaseline(pool, s.baseline);
    },
};

runScenario(scenario);

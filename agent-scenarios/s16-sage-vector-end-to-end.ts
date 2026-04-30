/**
 * S16 — Sage agent end-to-end against a vector-configured scope (over Queries).
 *
 * Why Queries, not AIAgentNote?
 *   AIAgentNote is auto-loaded into Sage's preamble by `AgentContextInjector`
 *   (`FindSimilarAgentNotes` runs unconditionally on every agent turn). When
 *   the answer is already in the preamble, Sage's LLM never tool-calls — so
 *   Scoped Search is never invoked, no SearchExecutionLog row gets written,
 *   and the agent → engine → multi-provider path goes untested.
 *
 *   `Queries` has the same `EmbeddingVector`/`EmbeddingModelID` shape (auto-
 *   populated by MJQueryEntityServer.GenerateCompositeEmbedding on Save), but
 *   nothing pre-fetches them into the prompt. Sage has to ACTUALLY call
 *   Scoped Search to find them.
 *
 * What this proves end-to-end:
 *   1. Sage's LLM, given a "do we have a query for X?" question, picks
 *      Scoped Search as its tool.
 *   2. Scoped Search routes to SearchEngine.Search() with the right ScopeID.
 *   3. Vector + Entity providers fan out and RRF blends their rankings.
 *   4. The agent's NEXT turn includes the retrieved Query content (proves
 *      results flowed back to the LLM, not just into a log table).
 *   5. SearchExecutionLog records the multi-provider contribution under
 *      AIAgentID=Sage (proves attribution + observability).
 */
import * as sql from 'mssql';
import { Metadata } from '@memberjunction/core';
import { SearchEngine } from '@memberjunction/search-engine';
import { SearchEngineBase } from '@memberjunction/core-entities';
import { LoadSimpleVectorDatabase } from '@memberjunction/ai-vectors-memory';
LoadSimpleVectorDatabase();

import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    clearSearchLog, grantUser, runAgent,
    getSearchLogRows, getAgentRunSteps,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';
const MPNET_MODEL_ID = '1d45aa65-41ec-4572-9ecd-ab2826c9b059';
const SEMANTIC_PROVIDER_ID = '538cfea3-62c0-4205-996a-199759bf2e28';
const ENTITY_PROVIDER_ID = '5d3f92fe-851a-4eb9-8764-0021753d869c'; // "Database" (EntitySearchProvider)
const SEED_NAME_PREFIX = 'AGENTSCENARIO-S16-Q';

interface S16Setup {
    baseline: BaselineSnapshot;
    vectorDatabaseID: string;
    vectorIndexID: string;
    scopeEntityRowID: string | null;
    scopeExtIndexRowID: string;
    insertedScopeProviderIDs: string[];
    insertedQueryIDs: string[];
    originalApiKeyEnvKey: string | null;
    queryStatusID: string | null;
}

// 10 realistic Queries that an MJ admin might save. The phrasings are
// deliberately literal in their Descriptions, but the Sage question we ask
// uses synonyms ("haven't been touched recently" vs "stale" / "30 days") —
// so the entity LIKE provider can't easily find the right one, but the
// vector provider can. That asymmetry is what proves the vector path is
// load-bearing in the agent → engine → multi-provider chain.
const SEED_QUERIES: { name: string; userQuestion: string; description: string }[] = [
    {
        name: 'Active AI Agents',
        userQuestion: 'Which AI agents are currently active in the system?',
        description: 'Lists every AI agent with Status = Active, including its parent agent if any. Used by the Knowledge Hub dashboard.',
    },
    {
        name: 'Recent Failed Agent Runs',
        userQuestion: 'Show recent agent runs that errored out in the last 24 hours.',
        description: 'Returns AIAgentRun rows where Status=Failed and the run started within the past day. Sorted newest first.',
    },
    {
        name: 'Top Cost AI Models This Month',
        userQuestion: 'Which AI models are costing us the most this billing period?',
        description: 'Aggregates AIPromptRun cost across the current calendar month, grouped by model, ordered by total spend.',
    },
    {
        name: 'User Login Activity Last Week',
        userQuestion: 'How active have users been over the past 7 days?',
        description: 'Daily login counts per user for the trailing week. Drives the User Activity tile on the admin dashboard.',
    },
    {
        name: 'Stale Conversations',
        userQuestion: 'Which conversations have not been touched recently?',
        description: 'Surfaces conversation records whose most recent message is older than 30 days, suggesting candidates for archival.',
    },
    {
        name: 'Entities Missing Knowledge Articles',
        userQuestion: 'Which entities have zero saved knowledge content?',
        description: 'Left-joins Entity to KnowledgeArticle and reports any entity with no associated articles. Used to plan documentation work.',
    },
    {
        name: 'Action Failure Rate Per Agent',
        userQuestion: 'How often does each agent\'s actions error out?',
        description: 'Computes (failed action runs / total action runs) per agent over a configurable window. Used to spot regressions.',
    },
    {
        name: 'Search Scope Usage Trailing 7 Days',
        userQuestion: 'How often has each search scope been queried lately?',
        description: 'Counts SearchExecutionLog rows per SearchScopeID over the trailing 7 days. Used to identify unused scopes.',
    },
    {
        name: 'Oversized AI Prompts',
        userQuestion: 'Which AI prompts are getting too long?',
        description: 'Finds AIPrompt rows whose template would exceed 10,000 tokens at runtime. Used to flag prompts due for refactoring.',
    },
    {
        name: 'Agent Notes Missing Embeddings',
        userQuestion: 'Which agent notes have not yet been vectorized?',
        description: 'Returns AIAgentNote rows where EmbeddingVector is NULL despite Status=Active. Used to find the queue for reembed jobs.',
    },
];

const scenario: Scenario = {
    id: 's16',
    name: 'Sage agent end-to-end against vector-configured scope',
    exercises: 'Agent layer × multi-provider RRF — full composition test (Queries entity)',
    setup: async (pool): Promise<S16Setup> => {
        // ── Idempotent cleanup of prior runs
        await pool.request().query(`
            DELETE FROM __mj.Query WHERE Name LIKE '${SEED_NAME_PREFIX}-%';
            DELETE FROM __mj.SearchScopeExternalIndex WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND ExternalIndexName='S16-Queries-Vector';
            DELETE FROM __mj.VectorIndex WHERE Name='S16-Queries-Vector';
            DELETE FROM __mj.VectorDatabase WHERE Name='S16-Memory-Queries';
        `);

        const originalApiKeyEnvKey = process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE ?? null;
        process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE = 'in-memory-noop';

        // ── VectorDatabase + VectorIndex (in-memory driver, Queries.EmbeddingVector)
        const dbRow = await pool.request().query(`
            INSERT INTO __mj.VectorDatabase (Name, ClassKey, DefaultURL, Description)
            OUTPUT INSERTED.ID
            VALUES ('S16-Memory-Queries', 'SimpleVectorDatabase', 'memory://queries',
                    'In-process vector DB for the S16 scenario over Queries.');
        `);
        const vectorDatabaseID: string = dbRow.recordset[0].ID;

        const providerConfig = JSON.stringify({
            entityName: 'MJ: Queries',
            vectorField: 'EmbeddingVector',
            filter: `Name LIKE '${SEED_NAME_PREFIX}-%'`,
            titleField: 'Name',
            snippetField: 'Description',
        });
        const idxRow = await pool.request()
            .input('cfg', sql.NVarChar, providerConfig)
            .query(`
                INSERT INTO __mj.VectorIndex
                    (Name, Description, VectorDatabaseID, EmbeddingModelID, ExternalID, Dimensions, Metric, ProviderConfig)
                OUTPUT INSERTED.ID
                VALUES
                    ('S16-Queries-Vector',
                     'Test index for S16 over Queries.EmbeddingVector',
                     '${vectorDatabaseID}', '${MPNET_MODEL_ID}',
                     'queries-s16', 768, 'cosine', @cfg);
            `);
        const vectorIndexID: string = idxRow.recordset[0].ID;

        // ── SearchScopeEntity for Queries
        const queriesEntityRow = (await pool.request().query(`
            SELECT ID FROM __mj.Entity WHERE Name='MJ: Queries';
        `)).recordset[0];
        if (!queriesEntityRow) throw new Error('MJ: Queries entity not found');

        let scopeEntityRowID: string | null = null;
        const existingSse = await pool.request().query(`
            SELECT ID FROM __mj.SearchScopeEntity
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND EntityID='${queriesEntityRow.ID}';
        `);
        if (existingSse.recordset.length === 0) {
            const sseInsert = await pool.request().query(`
                INSERT INTO __mj.SearchScopeEntity (SearchScopeID, EntityID)
                OUTPUT INSERTED.ID
                VALUES ('${RAG_AUDIT_SCOPE_ID}', '${queriesEntityRow.ID}');
            `);
            scopeEntityRowID = sseInsert.recordset[0].ID;
        }

        // ── SearchScopeExternalIndex (links scope → vector index)
        const sxiInsert = await pool.request().query(`
            INSERT INTO __mj.SearchScopeExternalIndex
                (SearchScopeID, IndexType, VectorIndexID, ExternalIndexName)
            OUTPUT INSERTED.ID
            VALUES ('${RAG_AUDIT_SCOPE_ID}', 'Vector', '${vectorIndexID}', 'S16-Queries-Vector');
        `);
        const scopeExtIndexRowID: string = sxiInsert.recordset[0].ID;

        // ── SearchScopeProvider rows so the engine routes to Vector + Entity (LIKE)
        const insertedScopeProviderIDs: string[] = [];
        const existingProviders = await pool.request().query(`
            SELECT SearchProviderID FROM __mj.SearchScopeProvider
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}';
        `);
        const existingIDs = new Set(existingProviders.recordset.map((r: { SearchProviderID: string }) => r.SearchProviderID.toLowerCase()));
        for (const providerID of [SEMANTIC_PROVIDER_ID, ENTITY_PROVIDER_ID]) {
            if (existingIDs.has(providerID.toLowerCase())) continue;
            const r = await pool.request().query(`
                INSERT INTO __mj.SearchScopeProvider (SearchScopeID, SearchProviderID)
                OUTPUT INSERTED.ID
                VALUES ('${RAG_AUDIT_SCOPE_ID}', '${providerID}');
            `);
            insertedScopeProviderIDs.push(r.recordset[0].ID);
        }

        // ── Sage baseline: swap Search → Scoped Search, set SearchScopeAccess='Assigned'.
        //    Phase doesn't strictly matter here since AgentContextInjector doesn't touch
        //    Queries, but we keep 'AgentInvoked' (no preamble injection) for parity with
        //    the original test design.
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID], { phase: 'AgentInvoked' });
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);

        return {
            baseline, vectorDatabaseID, vectorIndexID,
            scopeEntityRowID, scopeExtIndexRowID,
            insertedScopeProviderIDs, insertedQueryIDs: [],
            originalApiKeyEnvKey, queryStatusID: null,
        };
    },

    action: async (ctx, setupResult) => {
        const setup = setupResult as S16Setup;

        // Save Query records via Metadata so the BaseEntity-driven embedding
        // hook fires (`MJQueryEntityServer.GenerateCompositeEmbedding`).
        const md = new Metadata();
        for (const seed of SEED_QUERIES) {
            const q = await md.GetEntityObject('MJ: Queries', ctx.arie);
            q.NewRecord();
            q.Set('Name', `${SEED_NAME_PREFIX}-${seed.name}`);
            q.Set('UserQuestion', seed.userQuestion);
            q.Set('Description', seed.description);
            q.Set('SQL', '');                  // empty SQL skips the extraction pipeline
            q.Set('Status', 'Approved');
            q.Set('UsesTemplate', false);
            const ok = await q.Save();
            if (!ok) {
                throw new Error(`Save failed for Query "${seed.name}": ${q.LatestResult?.CompleteMessage ?? '(no message)'}`);
            }
            setup.insertedQueryIDs.push(q.Get('ID') as string);
        }
        console.log(`  [diag] embedded ${setup.insertedQueryIDs.length} queries`);

        // Refresh engines so the new vector index + scope wiring are visible
        await SearchEngineBase.Instance.Config(true, ctx.arie);
        await SearchEngine.Instance.Config({}, ctx.arie);

        // Question is shaped so BOTH providers contribute hits that RRF
        // then fuses:
        //   - "user activity" appears literally in the Query name
        //     "User Login Activity Last Week" → EntitySearchProvider (LIKE)
        //     finds it.
        //   - The semantic meaning ("how active users have been") matches
        //     the same query and a few neighbors → VectorSearchProvider
        //     returns a richer ranked list.
        // The query that's in BOTH provider's rankings gets the RRF rank
        // bonus and rises to the top — that's the evidence of actual
        // fusion (vs. passthrough of a single provider).
        const result = await runAgent(ctx.sage, ctx.arie,
            "We need to know how active our users have been. Do we have a saved query about user activity?");
        return result;
    },

    assert: async (ctx, runResult, setupResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        void setupResult;

        assert(runResult.success === true, `Sage agent run completed (elapsedMs=${runResult.elapsedMs})`);
        assert(!!runResult.agentRunID, `agent run ID returned`);

        if (!runResult.agentRunID) return;

        // ─── Sage end-to-end (deterministic via the agent run trace) ───────
        // 1. Sage invoked the Scoped Search tool
        const steps = await getAgentRunSteps(ctx.pool, runResult.agentRunID);
        const scopedSearchStep = steps.find(s => s.StepType === 'Actions' && /scoped\s*search/i.test(s.StepName));
        assert(!!scopedSearchStep,
            `Sage's LLM picked Scoped Search as its tool ` +
            `(trace: ${steps.map(s => `${s.StepNumber}:${s.StepType}/${s.StepName}`).join(' → ')})`);

        // 2. SearchExecutionLog row attributed to Sage with at least Vector contribution
        await new Promise(r => setTimeout(r, 1500)); // log write is fire-and-forget
        const sageLogs = await getSearchLogRows(ctx.pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);
        assert(sageLogs.length >= 1,
            `SearchExecutionLog has at least one row attributed to Sage on this scope (got ${sageLogs.length})`);

        const sageRowsWithBreakdown = await ctx.pool.request().query(`
            SELECT TOP 5 Status, ResultCount, ProvidersJSON
            FROM __mj.SearchExecutionLog
            WHERE AIAgentID='${SAGE_AGENT_ID}'
              AND SearchScopeID='${RAG_AUDIT_SCOPE_ID}'
              AND __mj_CreatedAt > DATEADD(minute, -5, SYSUTCDATETIME())
            ORDER BY __mj_CreatedAt DESC;
        `);
        let sageVectorContribution = false;
        for (const row of sageRowsWithBreakdown.recordset as Array<{ Status: string; ResultCount: number; ProvidersJSON: string | null }>) {
            if (!row.ProvidersJSON) continue;
            try {
                const sc = JSON.parse(row.ProvidersJSON) as { Vector?: { ResultCount?: number }; Entity?: { ResultCount?: number } };
                console.log(`  [diag] sage log row: Status=${row.Status} ResultCount=${row.ResultCount} ProvidersJSON=${row.ProvidersJSON}`);
                if ((sc.Vector?.ResultCount ?? 0) >= 1) sageVectorContribution = true;
            } catch { /* skip malformed */ }
        }
        assert(sageVectorContribution,
            `Sage's run records Vector contribution (proves the agent → engine → vector path ran)`);

        // 3. The seeded Query content reached Sage's next-turn prompt
        const allCapturedContent = ctx.promptCaptures.flatMap(c => c.chatMessages.map(m => m.content)).join('\n');
        const seedNameFragments = SEED_QUERIES.map(s => s.name);
        const fragmentsInPrompt = seedNameFragments.filter(f => allCapturedContent.includes(f));
        console.log(`  [diag] ${fragmentsInPrompt.length}/${seedNameFragments.length} seed-query names reached the prompt: ${fragmentsInPrompt.join(', ')}`);
        assert(fragmentsInPrompt.length >= 1,
            `at least one seeded query name reached Sage's next-turn prompt (got ${fragmentsInPrompt.length}/${seedNameFragments.length}) ` +
            `— proves the action's results actually flowed back to the LLM`);

        // ─── RRF fusion (deterministic via direct SearchEngine.Search) ─────
        // Sage's LLM is free to phrase its tool call however it likes —
        // sometimes it sends "user activity", sometimes "user activity saved
        // query", and that affects whether the LIKE-based EntitySearchProvider
        // returns hits. To make the multi-provider fusion check deterministic,
        // we drive SearchEngine.Search directly with a query whose tokens are
        // guaranteed to appear literally in our seed corpus.
        const probe = await SearchEngine.Instance.Search(
            { Query: 'user activity', ScopeIDs: [RAG_AUDIT_SCOPE_ID], MaxResults: 20 },
            ctx.arie,
        );
        console.log(`  [diag-rrf] direct probe — SourceCounts=${JSON.stringify(probe.SourceCounts)}, ${probe.Results.length} result(s)`);

        assert((probe.SourceCounts?.Vector ?? 0) >= 1,
            `direct probe: Vector returned hits (${probe.SourceCounts?.Vector ?? 0})`);
        assert((probe.SourceCounts?.Entity ?? 0) >= 1,
            `direct probe: Entity returned hits (${probe.SourceCounts?.Entity ?? 0}) — proves LIKE-based provider runs alongside Vector`);

        // The clincher: at least one record in the fused output has BOTH
        // Vector AND Entity in its ScoreBreakdown — that's the proof RRF
        // actually fused two ranked lists for that record (vs. just
        // concatenating each provider's results).
        const multiProviderHits = probe.Results.filter(r => {
            const bd = r.ScoreBreakdown as { Vector?: number; Entity?: number };
            return (bd.Vector ?? 0) > 0 && (bd.Entity ?? 0) > 0;
        });
        console.log(`  [diag-rrf] ${multiProviderHits.length} fused result(s) have BOTH Vector and Entity scores`);
        for (const h of multiProviderHits) {
            console.log(`  [diag-rrf]   ${h.Title}  score=${h.Score.toFixed(4)}  breakdown=${JSON.stringify(h.ScoreBreakdown)}`);
        }
        assert(multiProviderHits.length >= 1,
            `at least one fused result has BOTH Vector and Entity scores in its breakdown ` +
            `(proves RRF actually merged the two providers' rankings for the same record)`);

        // The fused, multi-provider record should rank ABOVE single-provider
        // records — that's the actual benefit of RRF (boost items the
        // providers agree on). Without this, the fix in SearchFusion would
        // be silently incomplete.
        const target = multiProviderHits[0];
        const targetIdx = probe.Results.indexOf(target);
        const singleProviderAhead = probe.Results.slice(0, targetIdx).filter(r => {
            const bd = r.ScoreBreakdown as { Vector?: number; Entity?: number };
            return !((bd.Vector ?? 0) > 0 && (bd.Entity ?? 0) > 0);
        });
        assert(singleProviderAhead.length === 0,
            `the multi-provider hit "${target.Title}" outranks all single-provider hits ` +
            `(found at #${targetIdx + 1}, with ${singleProviderAhead.length} single-provider hits ranked above it) — ` +
            `proves RRF's boost is actually being applied to fused records`);
    },

    teardown: async (pool, setupResult) => {
        const setup = setupResult as S16Setup | undefined;
        if (!setup) return;

        if (setup.originalApiKeyEnvKey === null) {
            delete process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE;
        } else {
            process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE = setup.originalApiKeyEnvKey;
        }

        // Delete by Name pattern (covers any rows we inserted whose IDs we may not have captured)
        await pool.request().query(`
            DELETE FROM __mj.Query WHERE Name LIKE '${SEED_NAME_PREFIX}-%';
        `);
        if (setup.scopeExtIndexRowID) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeExternalIndex WHERE ID='${setup.scopeExtIndexRowID}';`).catch(() => {});
        }
        if (setup.scopeEntityRowID) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeEntity WHERE ID='${setup.scopeEntityRowID}';`).catch(() => {});
        }
        for (const id of setup.insertedScopeProviderIDs ?? []) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeProvider WHERE ID='${id}';`).catch(() => {});
        }
        if (setup.vectorIndexID) {
            await pool.request().query(`DELETE FROM __mj.VectorIndex WHERE ID='${setup.vectorIndexID}';`).catch(() => {});
        }
        if (setup.vectorDatabaseID) {
            await pool.request().query(`DELETE FROM __mj.VectorDatabase WHERE ID='${setup.vectorDatabaseID}';`).catch(() => {});
        }
        if (setup.baseline) await revertSageBaseline(pool, setup.baseline);
    },
};

runScenario(scenario);

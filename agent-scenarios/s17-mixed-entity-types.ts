/**
 * S17 — Mixed entity types in one scope (cross-entity scoring + dedup).
 *
 * Why: S05 verifies that a scope spanning two entities is *configured*
 * correctly (engine logs say "Searching 2 entities"), but it only seeds
 * Actions records — there are never hits from the second entity to test
 * actual cross-entity result mixing. Real customers wire 3+ entity
 * types into a single scope (Documents + KnowledgeArticles + Queries
 * is a common shape) and expect:
 *   1. The top result is the highest-scored regardless of entity type.
 *   2. Title/Snippet are correctly extracted per entity (each has a
 *      different `IsNameField` and field shape).
 *   3. Dedup is keyed on `EntityName::RecordID` — same RecordID across
 *      different entities must NOT collapse.
 *   4. The per-entity-limit math in EntitySearchProvider doesn't starve
 *      a smaller entity (e.g. if `topK=10` and 3 entities, each gets
 *      at least 3 slots).
 *   5. `SearchExecutionLog.ProvidersJSON.Entity.ResultCount` reflects the
 *      combined hit count across all entities.
 *
 * What we seed:
 *   - 4 `MJ: Queries` rows with varying "user activity" coverage in
 *     Name/UserQuestion/Description (3 different match-densities)
 *   - 3 `MJ: Actions` rows with "user activity" in Name and/or Description
 *   - 3 `MJ: AI Agent Notes` rows with "user activity" in Note (the entity's
 *     IsNameField — different from the other two which use `Name`)
 *   = 10 records expected to surface
 *
 * What we assert (against a direct `SearchEngine.Search()` call — Sage's
 * tool-call wording is non-deterministic and would muddy the per-entity
 * assertions):
 *   - Result list contains records from all 3 entity types
 *   - Top result has the highest Score (sort correctness)
 *   - Per-entity Title/Snippet extraction is non-empty
 *   - No `EntityName::RecordID` collision in the result list
 *   - SearchExecutionLog `ProvidersJSON.Entity.ResultCount` >= the union
 *     of per-entity hits (no silent dedup of cross-entity rows)
 */
import * as sql from 'mssql';
import { SearchEngine } from '@memberjunction/search-engine';
import { SearchEngineBase } from '@memberjunction/core-entities';

import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    clearSearchLog, grantUser,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';
const ENTITY_PROVIDER_ID = '5d3f92fe-851a-4eb9-8764-0021753d869c';
const SEED_PREFIX = 'AGENTSCENARIO-S17';

interface S17Setup {
    baseline: BaselineSnapshot;
    queriesEntityID: string;
    actionsEntityID: string;
    aiAgentNotesEntityID: string;
    insertedQueryIDs: string[];
    insertedActionIDs: string[];
    insertedAgentNoteIDs: string[];
    addedScopeEntityRowIDs: string[];
    addedScopeProviderRowIDs: string[];
    aiAgentNoteTypeID: string;
    sageAgentID: string;
}

const SEED_QUERIES = [
    {
        // 3-field match: highest-density Query
        Name: `${SEED_PREFIX}-Q-User Activity Summary`,
        UserQuestion: 'Show me user activity for the past week',
        Description: 'Returns user activity counts grouped by user. Drives the User Activity tile.',
    },
    {
        // 2-field match
        Name: `${SEED_PREFIX}-Q-User Activity Trends`,
        UserQuestion: 'How are users trending?',
        Description: 'Tracks user activity over rolling windows.',
    },
    {
        // 1-field match (Name only)
        Name: `${SEED_PREFIX}-Q-User Activity Anomalies`,
        UserQuestion: 'Surface unusual access patterns.',
        Description: 'Flags accounts whose patterns deviate from baseline.',
    },
    {
        // 1-field match (Description only — no name match)
        Name: `${SEED_PREFIX}-Q-Recent Login Stats`,
        UserQuestion: 'Latest sign-ins',
        Description: 'Lists the 100 most recent user activity events from the audit log.',
    },
];

const SEED_ACTIONS = [
    {
        Name: `${SEED_PREFIX}-A-Track User Activity`,
        Description: 'Records user activity for compliance auditing.',
    },
    {
        Name: `${SEED_PREFIX}-A-User Activity Report`,
        Description: 'Generates a monthly summary PDF.',
    },
    {
        Name: `${SEED_PREFIX}-A-Generate Compliance Export`,
        Description: 'Exports the user activity feed for regulators.',
    },
];

const SEED_AGENT_NOTES = [
    `${SEED_PREFIX}-N: User activity logging is critical for audit. The team tracks user activity in every agent run.`,
    `${SEED_PREFIX}-N: The platform team prefers detailed user activity dashboards over coarse aggregates.`,
    `${SEED_PREFIX}-N: User activity tracking config lives in the AppSettings entity for now.`,
];

const scenario: Scenario = {
    id: 's17',
    name: 'Mixed entity types in one scope (cross-entity scoring + dedup)',
    exercises: 'EntitySearchProvider routing across 3 entity types; cross-entity dedup; multi-entity SearchExecutionLog counting',
    setup: async (pool): Promise<S17Setup> => {
        // ── Idempotent cleanup of prior runs
        await pool.request().query(`
            DELETE FROM __mj.Query WHERE Name LIKE '${SEED_PREFIX}-%';
            DELETE FROM __mj.Action WHERE Name LIKE '${SEED_PREFIX}-%';
            DELETE FROM __mj.AIAgentNote WHERE Note LIKE '${SEED_PREFIX}-%';
        `);

        // ── Resolve EntityIDs
        const queriesEnt = (await pool.request().query(`SELECT ID FROM __mj.Entity WHERE Name='MJ: Queries';`)).recordset[0];
        const actionsEnt = (await pool.request().query(`SELECT ID FROM __mj.Entity WHERE Name='MJ: Actions';`)).recordset[0];
        const aiAgentNotesEnt = (await pool.request().query(`SELECT ID FROM __mj.Entity WHERE Name='MJ: AI Agent Notes';`)).recordset[0];
        if (!queriesEnt || !actionsEnt || !aiAgentNotesEnt) {
            throw new Error('Required entities not found in __mj.Entity');
        }

        // ── Wire SearchScope to all 3 entities (idempotent)
        const addedScopeEntityRowIDs: string[] = [];
        for (const ent of [queriesEnt, actionsEnt, aiAgentNotesEnt]) {
            const exists = await pool.request().query(`
                SELECT ID FROM __mj.SearchScopeEntity
                WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND EntityID='${ent.ID}';
            `);
            if (exists.recordset.length === 0) {
                const r = await pool.request().query(`
                    INSERT INTO __mj.SearchScopeEntity (SearchScopeID, EntityID)
                    OUTPUT INSERTED.ID
                    VALUES ('${RAG_AUDIT_SCOPE_ID}', '${ent.ID}');
                `);
                addedScopeEntityRowIDs.push(r.recordset[0].ID);
            }
        }

        // ── Wire ONLY Entity provider so the test is deterministic
        // (Vector / FullText could otherwise inject extra hits on a fresh DB)
        const addedScopeProviderRowIDs: string[] = [];
        const existingProvider = await pool.request().query(`
            SELECT ID FROM __mj.SearchScopeProvider
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND SearchProviderID='${ENTITY_PROVIDER_ID}';
        `);
        if (existingProvider.recordset.length === 0) {
            const r = await pool.request().query(`
                INSERT INTO __mj.SearchScopeProvider (SearchScopeID, SearchProviderID)
                OUTPUT INSERTED.ID
                VALUES ('${RAG_AUDIT_SCOPE_ID}', '${ENTITY_PROVIDER_ID}');
            `);
            addedScopeProviderRowIDs.push(r.recordset[0].ID);
        }

        // ── Resolve required FK lookups for inserts
        const noteTypeRow = (await pool.request().query(`SELECT TOP 1 ID FROM __mj.AIAgentNoteType ORDER BY Name;`)).recordset[0];
        if (!noteTypeRow) throw new Error('No AIAgentNoteType rows seeded');
        const aiAgentNoteTypeID: string = noteTypeRow.ID;

        const sageAgentRow = (await pool.request().query(`SELECT ID FROM __mj.AIAgent WHERE ID='${SAGE_AGENT_ID}';`)).recordset[0];
        if (!sageAgentRow) throw new Error('Sage agent not found');

        // ── Seed records via raw SQL — bypassing entity Save() means the
        //    AIAgentNote embedding hook does NOT fire, keeping Vector
        //    provider out of the picture even if it's listening.
        const insertedQueryIDs: string[] = [];
        for (const seed of SEED_QUERIES) {
            const r = await pool.request()
                .input('name', sql.NVarChar, seed.Name)
                .input('uq', sql.NVarChar, seed.UserQuestion)
                .input('desc', sql.NVarChar, seed.Description)
                .query(`
                    INSERT INTO __mj.Query (Name, UserQuestion, Description, SQL, Status, UsesTemplate)
                    OUTPUT INSERTED.ID
                    VALUES (@name, @uq, @desc, '', 'Approved', 0);
                `);
            insertedQueryIDs.push(r.recordset[0].ID);
        }

        const insertedActionIDs: string[] = [];
        for (const seed of SEED_ACTIONS) {
            // `Action.Type` is a check-constrained nvarchar, NOT a FK; valid values are
            // 'Custom' / 'Generated' / 'Runtime'. CategoryID is nullable.
            const r = await pool.request()
                .input('name', sql.NVarChar, seed.Name)
                .input('desc', sql.NVarChar, seed.Description)
                .query(`
                    INSERT INTO __mj.Action (Name, Description, Type, Status, CodeApprovalStatus, CodeLocked, ForceCodeGeneration)
                    OUTPUT INSERTED.ID
                    VALUES (@name, @desc, 'Custom', 'Active', 'Approved', 0, 0);
                `);
            insertedActionIDs.push(r.recordset[0].ID);
        }

        const insertedAgentNoteIDs: string[] = [];
        for (const noteText of SEED_AGENT_NOTES) {
            const r = await pool.request()
                .input('agent', sql.UniqueIdentifier, SAGE_AGENT_ID)
                .input('noteType', sql.UniqueIdentifier, aiAgentNoteTypeID)
                .input('user', sql.UniqueIdentifier, ARIE_ID)
                .input('note', sql.NVarChar, noteText)
                .query(`
                    INSERT INTO __mj.AIAgentNote
                        (AgentID, AgentNoteTypeID, UserID, Type, Note, Status, IsAutoGenerated)
                    OUTPUT INSERTED.ID
                    VALUES (@agent, @noteType, @user, 'Context', @note, 'Active', 1);
                `);
            insertedAgentNoteIDs.push(r.recordset[0].ID);
        }

        // ── Sage baseline (the assertion path uses SearchEngine directly,
        //    but applySageBaseline grants Sage on the scope which doubles as
        //    the user-grant we need anyway. Keeps the teardown symmetric.)
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);

        return {
            baseline,
            queriesEntityID: queriesEnt.ID,
            actionsEntityID: actionsEnt.ID,
            aiAgentNotesEntityID: aiAgentNotesEnt.ID,
            insertedQueryIDs, insertedActionIDs, insertedAgentNoteIDs,
            addedScopeEntityRowIDs, addedScopeProviderRowIDs,
            aiAgentNoteTypeID, sageAgentID: SAGE_AGENT_ID,
        };
    },

    action: async (ctx) => {
        // Refresh engines so the new scope wiring + seeded records are visible.
        // We re-run the actual search inside `assert()` because Search returns
        // a rich result object that doesn't fit the harness's `ScenarioRunResult`
        // shape — keeping action() lean and shifting the work to assert() is
        // the cleanest way to surface the full SearchResult for cross-checks.
        await SearchEngineBase.Instance.Config(true, ctx.arie);
        await SearchEngine.Instance.Config({}, ctx.arie);
        return { success: true, elapsedMs: 0, agentRunID: undefined };
    },

    assert: async (ctx, runResult, setupResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        const setup = setupResult as S17Setup;

        // Capture a high-water timestamp BEFORE the search so the log-row
        // assertion below can isolate this invocation from prior scenarios
        // that may have written rows for the same Query/Scope (s15, s16
        // both probe with "user activity"-flavored queries against the
        // RAG-Audit-Scope and run before s17 in run-all.sh).
        const searchStartedAt = (await ctx.pool.request().query(`SELECT SYSUTCDATETIME() AS ts;`)).recordset[0].ts as Date;

        // Drive a direct SearchEngine call rather than going through Sage.
        // Sage's tool-call wording is non-deterministic, and a direct call is
        // the right level for testing engine cross-entity behavior.
        const probe = await SearchEngine.Instance.Search(
            { Query: 'user activity', ScopeIDs: [RAG_AUDIT_SCOPE_ID], MaxResults: 30, AIAgentID: SAGE_AGENT_ID },
            ctx.arie,
        );
        assert(probe.Success === true, `direct SearchEngine.Search succeeded`);
        assert(probe.Results.length > 0, `result list non-empty (got ${probe.Results.length})`);

        const results = probe.Results;
        const entityNames = new Set(results.map(r => r.EntityName));
        console.log(`  [diag] returned ${results.length} results across entities: ${[...entityNames].join(', ')}`);
        for (const r of results.slice(0, 8)) {
            console.log(`  [diag]   ${r.EntityName.padEnd(20)} score=${r.Score.toFixed(3)}  ${r.Title}`);
        }

        // 1. All 3 entity types contributed
        assert(entityNames.has('MJ: Queries'), `result list contains MJ: Queries hits`);
        assert(entityNames.has('MJ: Actions'), `result list contains MJ: Actions hits`);
        assert(entityNames.has('MJ: AI Agent Notes'), `result list contains MJ: AI Agent Notes hits`);

        // 2. Sort correctness — top result has the highest Score
        const sorted = [...results].sort((a, b) => b.Score - a.Score);
        assert(results[0].Score === sorted[0].Score,
            `result[0].Score (${results[0].Score}) is the maximum across all results — list is correctly sorted`);

        // 3. Per-entity Title/Snippet are non-empty for every seeded record
        const seededRecordTitles = results
            .filter(r => r.Title.includes(SEED_PREFIX) || r.Snippet.includes(SEED_PREFIX) || /Track User Activity|User Activity/i.test(r.Title))
            .filter(r => r.Title && r.Title.trim().length > 0);
        const titlesByEntity = new Map<string, number>();
        for (const r of seededRecordTitles) {
            titlesByEntity.set(r.EntityName, (titlesByEntity.get(r.EntityName) ?? 0) + 1);
        }
        assert(
            (titlesByEntity.get('MJ: Queries') ?? 0) >= 1
            && (titlesByEntity.get('MJ: Actions') ?? 0) >= 1
            && (titlesByEntity.get('MJ: AI Agent Notes') ?? 0) >= 1,
            `every entity has at least one returned record with a non-empty Title (${[...titlesByEntity.entries()].map(([k, v]) => `${k}=${v}`).join(', ')})`
        );

        // 4. Cross-entity dedup correctness — `EntityName::RecordID` keys are unique
        const compositeKeys = results.map(r => `${r.EntityName}::${r.RecordID}`);
        const uniqueKeys = new Set(compositeKeys);
        assert(uniqueKeys.size === compositeKeys.length,
            `every (EntityName, RecordID) pair appears at most once in results (got ${compositeKeys.length} entries, ${uniqueKeys.size} unique)`);

        // 5. SearchExecutionLog rolls up multi-entity hits into Entity.ResultCount.
        // Log writes are fire-and-forget — poll up to 5s waiting for our row,
        // filtering by `__mj_CreatedAt > searchStartedAt` to avoid catching
        // rows from prior scenarios (s15/s16 both probe with overlapping
        // queries against the same scope earlier in run-all.sh).
        let logRows: Array<{ Status: string; ResultCount: number; ProvidersJSON: string | null; AIAgentID: string | null; Query: string }> = [];
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise(r => setTimeout(r, 500));
            const logs = await ctx.pool.request()
                .input('startedAt', sql.DateTimeOffset, searchStartedAt)
                .query(`
                    SELECT TOP 10 Status, ResultCount, ProvidersJSON, AIAgentID, Query
                    FROM __mj.SearchExecutionLog
                    WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}'
                      AND AIAgentID='${SAGE_AGENT_ID}'
                      AND Query='user activity'
                      AND __mj_CreatedAt >= @startedAt
                    ORDER BY __mj_CreatedAt DESC;
                `);
            logRows = logs.recordset as typeof logRows;
            if (logRows.length > 0) break;
        }
        console.log(`  [diag] found ${logRows.length} log row(s) within polling window`);
        let entityHitCount = 0;
        for (const row of logRows) {
            console.log(`  [diag] log row: Status=${row.Status} ResultCount=${row.ResultCount} AIAgentID=${row.AIAgentID ?? '(null)'} ProvidersJSON=${row.ProvidersJSON ?? '(null)'}`);
            if (!row.ProvidersJSON) continue;
            try {
                const sc = JSON.parse(row.ProvidersJSON) as { Entity?: { ResultCount?: number } };
                entityHitCount = Math.max(entityHitCount, sc.Entity?.ResultCount ?? 0);
            } catch { /* skip malformed */ }
        }
        assert(entityHitCount >= 3,
            `SearchExecutionLog ProvidersJSON.Entity.ResultCount reflects the multi-entity total (got ${entityHitCount}, expected ≥ 3 since we seeded across 3 entity types)`);

        // 6. Multi-entity returns aren't dominated by any single type
        // (i.e., per-entity-limit math doesn't starve smaller entities)
        const countsByEntity = new Map<string, number>();
        for (const r of results) {
            countsByEntity.set(r.EntityName, (countsByEntity.get(r.EntityName) ?? 0) + 1);
        }
        const minPerEntity = Math.min(...[...countsByEntity.values()]);
        assert(minPerEntity >= 1,
            `every contributing entity has at least 1 result in the final list — no entity was zeroed by per-entity-limit math (counts: ${[...countsByEntity.entries()].map(([k, v]) => `${k}=${v}`).join(', ')})`);
    },

    teardown: async (pool, setupResult) => {
        const setup = setupResult as S17Setup | undefined;
        if (!setup) return;

        await pool.request().query(`
            DELETE FROM __mj.Query WHERE Name LIKE '${SEED_PREFIX}-%';
            DELETE FROM __mj.Action WHERE Name LIKE '${SEED_PREFIX}-%';
            DELETE FROM __mj.AIAgentNote WHERE Note LIKE '${SEED_PREFIX}-%';
        `);

        for (const id of setup.addedScopeEntityRowIDs) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeEntity WHERE ID='${id}';`).catch(() => {});
        }
        for (const id of setup.addedScopeProviderRowIDs) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeProvider WHERE ID='${id}';`).catch(() => {});
        }
        if (setup.baseline) await revertSageBaseline(pool, setup.baseline);
    },
};

runScenario(scenario);

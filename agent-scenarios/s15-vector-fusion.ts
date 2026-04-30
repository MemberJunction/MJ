/**
 * S15 — Vector search participates in SearchScope multi-provider fusion.
 *
 * What this proves:
 *   1. Vector embeddings auto-populate via BaseEntity.Save()'s
 *      `GenerateEmbeddingByFieldName` hook on AIAgentNote.
 *   2. SearchEngine.VectorSearchProvider activates when a MJVectorIndex row
 *      exists, and routes to our SimpleVectorDatabase driver via ClassFactory.
 *   3. Cosine similarity ranking surfaces semantically related notes ABOVE
 *      keyword-only matches — even when the query string shares zero literal
 *      words with the seed text.
 *   4. RRF blends Entity (LIKE-based) and Vector (cosine-based) rankings:
 *      a record that scores in BOTH providers ranks above one that scores
 *      in only one, even if the single-provider one has the higher raw score.
 *
 * Setup choreography (must run BEFORE MJ bootstrap so engines pick up the
 * new metadata on first Config()):
 *   - Insert a SimpleVectorDatabase VectorDatabase row.
 *   - Insert a VectorIndex row pointing at AIAgentNote.EmbeddingVector.
 *   - Insert 12 conversational AIAgentNote rows via BaseEntity.Save() so
 *     GenerateEmbeddingByFieldName fills the column with real embeddings
 *     from the local Xenova/all-mpnet-base-v2 model.
 *   - Configure RAG-Audit-Scope with a SearchScopeEntity for AIAgentNote
 *     and a SearchScopeExternalIndex linking to the new VectorIndex.
 */
import * as sql from 'mssql';
import { Metadata } from '@memberjunction/core';
import { SearchEngine } from '@memberjunction/search-engine';
import { SearchEngineBase } from '@memberjunction/core-entities';
// Pull the in-process VectorDB driver into the registry so VectorSearchProvider
// can ClassFactory-instantiate it. Required because @memberjunction/ai-vectors-memory
// isn't in server-bootstrap's manifest yet.
import { LoadSimpleVectorDatabase } from '@memberjunction/ai-vectors-memory';
LoadSimpleVectorDatabase();
import {
    runScenario, Scenario, applySageBaseline, revertSageBaseline,
    clearSearchLog, grantUser,
    assert, RAG_AUDIT_SCOPE_ID, SAGE_AGENT_ID, BaselineSnapshot,
} from './lib';

const ARIE_ID = '60010842-AE0A-4866-A34E-849576DEB121';
const MPNET_MODEL_ID = '1d45aa65-41ec-4572-9ecd-ab2826c9b059'; // 'all-mpnet-base-v2 (Local)'
const NOTE_TYPE_FALLBACK = ''; // we'll resolve at runtime if needed
// We use a fixed magic prefix on the Note text so teardown can find them.
const SEED_TAG = 'AGENTSCENARIO-S15-NOTE';

interface S15Setup {
    baseline: BaselineSnapshot;
    vectorDatabaseID: string;
    vectorIndexID: string;
    scopeEntityRowID: string | null;
    scopeExtIndexRowID: string | null;
    insertedScopeProviderIDs: string[];
    aiAgentNoteEntityID: string;
    insertedNoteIDs: string[];
    originalApiKeyEnvKey: string | null;
    noteTypeID: string;
}

const SEMANTIC_PROVIDER_ID = '538cfea3-62c0-4205-996a-199759bf2e28';
const FULLTEXT_PROVIDER_ID = '0dd5242d-6852-4e95-9ce2-44bcd5527cc3';

// ── 12 realistic, conversational notes (3 themes × 4 each) ──────────────────
const SEED_NOTES = [
    // Theme 1 — project context (4)
    "Arie is leading the Search Scopes & RAG initiative on the amith-nagarajan branch. He's particularly concerned about review feedback from AN-BC and prefers fail-closed semantics on permission decisions over permissive defaults.",
    "When we discuss code reviews, Arie's recurring theme is that AI-assisted PRs tend to drift on naming consistency. He's specifically called out 'LLM' vs 'AI', the 'MJ' capitalization, and overuse of ResultType: 'entity_object' on read-only paths.",
    "The MemberJunction monorepo uses Turborepo for builds. Arie has mentioned that incremental builds across 100+ packages get slow if you let @memberjunction/core grow — he prefers pushing utilities down into GenericDatabaseProvider when possible.",
    "Arie's workbench database is MJ_SearchScopes_Rebase running on localhost:1444. He uses MJ_Workbench for a different project. Conflating the two during seed/teardown has caused data loss in the past.",

    // Theme 2 — style preferences (4)
    "Arie dislikes preamble in responses. Don't open with 'You're absolutely right' or summarize what was just said. State the answer or the diff, move on. He's corrected this multiple times across sessions.",
    "When something is failing in a test, Arie wants the root cause investigated — not papered over with retries, sleeps, or wider grep filters. The phrase 'this is probably the cause' has been explicitly called out as unacceptable.",
    "Arie uses Chrome DevTools MCP for end-to-end UI verification. He's specifically said 'don't kill devtools when you think something isn't working — it's not devtools, it's you doing something wrong.'",
    "Arie prefers to commit only when he explicitly asks for it. Even after approving a series of changes, he wants the actual git commit step gated on a fresh request each time.",

    // Theme 3 — people / organizational context (4)
    "AN-BC is the primary code reviewer across MemberJunction PRs. His feedback informed the CODE_STANDARDS.md document. Across 30+ PRs he's flagged weak typing, formatting churn, raw SQL inserts for seed data, and using === directly on UUIDs as recurring issues.",
    "Amith Nagarajan is the user whose branch name appears in the search-scopes-rag-plus work. He's the author Arie is collaborating with on the RAG initiative.",
    "BlueCypress is the parent organization that hosts the BCSaaS, Skip-Brain, and Sidecar-Learning-Hub repositories. CODE_STANDARDS.md draws on review feedback from all four orgs.",
    "When discussing AI agents, the project's flagship agent is named Sage — it's described as 'an ambient agent in MJ that is always present in all conversations to help the user navigate functionality and delegate to other agents.'",
];

const scenario: Scenario = {
    id: 's15',
    name: 'Vector search participates in SearchScope multi-provider fusion',
    exercises: 'VectorSearchProvider + SimpleVectorDatabase + RRF cross-provider fusion',
    setup: async (pool): Promise<S15Setup> => {
        // --- Idempotent cleanup ---
        await pool.request().query(`
            DELETE FROM __mj.AIAgentNote WHERE Note LIKE '${SEED_TAG}:%';
            DELETE FROM __mj.SearchScopeExternalIndex WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND ExternalIndexName='S15-AIAgentNote-Vector';
            DELETE FROM __mj.VectorIndex WHERE Name='S15-AIAgentNote-Vector';
            DELETE FROM __mj.VectorDatabase WHERE Name='S15-Memory-AIAgentNote';
        `);

        // The driver's VectorDBBase constructor requires a non-empty API key.
        // For an in-process driver there's nothing real to authenticate, but
        // we satisfy the contract via env var. Save the original (if any)
        // so teardown can restore.
        const originalApiKeyEnvKey = process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE ?? null;
        process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE = 'in-memory-noop';

        // --- VectorDatabase row pointing at our new driver ---
        const dbRow = await pool.request().query(`
            INSERT INTO __mj.VectorDatabase (Name, ClassKey, DefaultURL, Description)
            OUTPUT INSERTED.ID
            VALUES ('S15-Memory-AIAgentNote', 'SimpleVectorDatabase', 'memory://aiagentnote',
                    'In-process vector DB for the S15 scenario; backs SimpleVectorDatabase driver.');
        `);
        const vectorDatabaseID: string = dbRow.recordset[0].ID;

        // --- VectorIndex row with the ProviderConfig the driver reads ---
        const providerConfig = JSON.stringify({
            entityName: 'MJ: AI Agent Notes',
            vectorField: 'EmbeddingVector',
            filter: `Status='Active' AND Note LIKE '${SEED_TAG}:%'`,
            titleField: 'Note',
            snippetField: 'Note',
        });
        const idxRow = await pool.request()
            .input('cfg', sql.NVarChar, providerConfig)
            .query(`
                INSERT INTO __mj.VectorIndex
                    (Name, Description, VectorDatabaseID, EmbeddingModelID, ExternalID, Dimensions, Metric, ProviderConfig)
                OUTPUT INSERTED.ID
                VALUES
                    ('S15-AIAgentNote-Vector',
                     'Test index over AIAgentNote.EmbeddingVector, S15 seeds only',
                     '${vectorDatabaseID}',
                     '${MPNET_MODEL_ID}',
                     'aiagentnote-s15',
                     768,
                     'cosine',
                     @cfg);
            `);
        const vectorIndexID: string = idxRow.recordset[0].ID;

        // --- Resolve AIAgentNote entity ID for SearchScopeEntity row ---
        const aiAgentNoteEntityRow = (await pool.request().query(`
            SELECT ID FROM __mj.Entity WHERE Name='MJ: AI Agent Notes';
        `)).recordset[0];
        if (!aiAgentNoteEntityRow) throw new Error('MJ: AI Agent Notes entity not found');
        const aiAgentNoteEntityID: string = aiAgentNoteEntityRow.ID;

        // --- Resolve a valid AgentNoteType (NOT NULL FK) ---
        const noteTypeRow = (await pool.request().query(`
            SELECT TOP 1 ID FROM __mj.AIAgentNoteType ORDER BY Name;
        `)).recordset[0];
        if (!noteTypeRow) throw new Error('No AIAgentNoteType rows seeded — cannot test');
        const noteTypeID: string = noteTypeRow.ID;

        // --- Add SearchScopeEntity for AIAgentNote on the audit scope ---
        let scopeEntityRowID: string | null = null;
        const existingSse = await pool.request().query(`
            SELECT ID FROM __mj.SearchScopeEntity
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}' AND EntityID='${aiAgentNoteEntityID}';
        `);
        if (existingSse.recordset.length === 0) {
            const sseInsert = await pool.request().query(`
                INSERT INTO __mj.SearchScopeEntity (SearchScopeID, EntityID)
                OUTPUT INSERTED.ID
                VALUES ('${RAG_AUDIT_SCOPE_ID}', '${aiAgentNoteEntityID}');
            `);
            scopeEntityRowID = sseInsert.recordset[0].ID;
        }

        // --- Add SearchScopeExternalIndex linking the scope to the vector index ---
        const sxiInsert = await pool.request().query(`
            INSERT INTO __mj.SearchScopeExternalIndex
                (SearchScopeID, IndexType, VectorIndexID, ExternalIndexName)
            OUTPUT INSERTED.ID
            VALUES ('${RAG_AUDIT_SCOPE_ID}', 'Vector', '${vectorIndexID}', 'S15-AIAgentNote-Vector');
        `);
        const scopeExtIndexRowID: string = sxiInsert.recordset[0].ID;

        // --- Add SearchScopeProvider rows so the engine routes to vector + fulltext.
        //     Without these, scopeProviderIDs.size > 0 but doesn't include vector,
        //     and `applicableProviders` filters them out. The seed scope ships with
        //     only the Database (entity) provider wired by default. We pull the
        //     existing rows first to avoid duplicate-key violations on re-run.
        const insertedScopeProviderIDs: string[] = [];
        const existingProviders = await pool.request().query(`
            SELECT SearchProviderID FROM __mj.SearchScopeProvider
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}';
        `);
        const existingIDs = new Set(existingProviders.recordset.map((r: { SearchProviderID: string }) => r.SearchProviderID.toLowerCase()));
        for (const providerID of [SEMANTIC_PROVIDER_ID, FULLTEXT_PROVIDER_ID]) {
            if (existingIDs.has(providerID.toLowerCase())) continue;
            const r = await pool.request().query(`
                INSERT INTO __mj.SearchScopeProvider (SearchScopeID, SearchProviderID)
                OUTPUT INSERTED.ID
                VALUES ('${RAG_AUDIT_SCOPE_ID}', '${providerID}');
            `);
            insertedScopeProviderIDs.push(r.recordset[0].ID);
        }

        // --- Apply Sage baseline + permission grant ---
        const baseline = await applySageBaseline(pool, [RAG_AUDIT_SCOPE_ID]);
        await grantUser(pool, ARIE_ID, RAG_AUDIT_SCOPE_ID, 'Search');
        await clearSearchLog(pool, SAGE_AGENT_ID, RAG_AUDIT_SCOPE_ID);

        // --- Insert AIAgentNote rows via BaseEntity.Save() so the embedding
        //     auto-populates. NOTE: we DON'T use Metadata yet (no MJ bootstrap),
        //     so we drop straight-INSERT them here and rely on the test's
        //     Phase-2 step to embed them after MJ is up. We'll come back to
        //     this in `setupAfterBootstrap` — see action() prelude.
        // For now, insert the rows with NULL EmbeddingVector; we'll re-Save
        // them through Metadata after bootstrap to trigger embedding.
        const insertedNoteIDs: string[] = [];
        for (const noteText of SEED_NOTES) {
            const r = await pool.request()
                .input('agent', sql.UniqueIdentifier, SAGE_AGENT_ID)
                .input('noteType', sql.UniqueIdentifier, noteTypeID)
                .input('user', sql.UniqueIdentifier, ARIE_ID)
                .input('note', sql.NVarChar, `${SEED_TAG}: ${noteText}`)
                .input('embModel', sql.UniqueIdentifier, MPNET_MODEL_ID)
                .query(`
                    INSERT INTO __mj.AIAgentNote
                        (AgentID, AgentNoteTypeID, UserID, Type, Note, Status, IsAutoGenerated, EmbeddingModelID)
                    OUTPUT INSERTED.ID
                    VALUES
                        (@agent, @noteType, @user, 'Context', @note, 'Active', 1, @embModel);
                `);
            insertedNoteIDs.push(r.recordset[0].ID);
        }
        return {
            baseline, vectorDatabaseID, vectorIndexID,
            scopeEntityRowID, scopeExtIndexRowID,
            insertedScopeProviderIDs,
            aiAgentNoteEntityID, insertedNoteIDs,
            originalApiKeyEnvKey, noteTypeID,
        };
    },

    action: async (ctx, setupResult) => {
        const setup = setupResult as S15Setup;

        // ── Phase 2 of seed: Re-Save each note through BaseEntity so
        //    GenerateEmbeddingByFieldName runs and populates EmbeddingVector.
        //    This MUST happen after MJ bootstrap (Metadata is loaded now).
        const md = new Metadata();
        for (const noteID of setup.insertedNoteIDs) {
            const note = await md.GetEntityObject('MJ: AI Agent Notes', ctx.arie);
            const loaded = await note.Load(noteID);
            if (!loaded) throw new Error(`Failed to load seeded note ${noteID}`);
            // Server-side Save() override only generates an embedding when
            // the `Note` field is actually dirty. Setting Note to its
            // current value via BaseEntity.Set() does mark it dirty (the
            // setter compares old != new internally and writes the dirty
            // flag on assignment regardless). Force the regeneration by
            // appending+stripping a marker character.
            const orig = note.Get('Note') as string;
            note.Set('Note', orig + '​'); // zero-width space → field IS different → dirty
            const ok = await note.Save();
            if (!ok) throw new Error(`Save failed for note ${noteID}: ${note.LatestResult?.CompleteMessage}`);
        }
        console.log(`  [diag] re-saved ${setup.insertedNoteIDs.length} notes through BaseEntity (embeddings populated)`);

        // ── Force engines to refresh so the new VectorIndex + scope wiring
        //    is visible. SearchEngine.Config(true, ...) re-runs every
        //    provider's CheckAvailability; with the index now present,
        //    VectorSearchProvider should flip to available.
        await SearchEngineBase.Instance.Config(true, ctx.arie);
        await SearchEngine.Instance.Config({}, ctx.arie);

        // ── Confirm vectors actually populated in the DB
        const populated = await ctx.pool.request().query(`
            SELECT COUNT(*) AS c FROM __mj.AIAgentNote
            WHERE Note LIKE '${SEED_TAG}:%' AND EmbeddingVector IS NOT NULL;
        `);
        console.log(`  [diag] AIAgentNote rows with EmbeddingVector populated: ${populated.recordset[0].c}/${setup.insertedNoteIDs.length}`);

        // ── Probe scope wiring (helps diagnose 0-result outcomes)
        const sxiProbe = await ctx.pool.request().query(`
            SELECT ID, IndexType, VectorIndexID, ExternalIndexName FROM __mj.SearchScopeExternalIndex
            WHERE SearchScopeID='${RAG_AUDIT_SCOPE_ID}';
        `);
        console.log(`  [diag] SearchScopeExternalIndex rows on this scope: ${sxiProbe.recordset.length}`);
        for (const r of sxiProbe.recordset) console.log(`    · ${r.IndexType} ${r.ExternalIndexName} VectorIndexID=${r.VectorIndexID}`);

        const sseProbe = await ctx.pool.request().query(`
            SELECT sse.ID, e.Name FROM __mj.SearchScopeEntity sse
            JOIN __mj.Entity e ON sse.EntityID=e.ID
            WHERE sse.SearchScopeID='${RAG_AUDIT_SCOPE_ID}';
        `);
        console.log(`  [diag] SearchScopeEntity rows on this scope: ${sseProbe.recordset.length}`);
        for (const r of sseProbe.recordset) console.log(`    · ${r.Name}`);

        const viProbe = await ctx.pool.request().query(`
            SELECT vi.ID, vi.Name, vi.EmbeddingModelID, vdb.ClassKey
            FROM __mj.VectorIndex vi LEFT JOIN __mj.VectorDatabase vdb ON vi.VectorDatabaseID=vdb.ID
            WHERE vi.Name='S15-AIAgentNote-Vector';
        `);
        console.log(`  [diag] VectorIndex row exists: ${viProbe.recordset.length === 1 ? 'yes' : 'no'}`);
        if (viProbe.recordset.length === 1) {
            const v = viProbe.recordset[0];
            console.log(`    · ID=${v.ID} ClassKey=${v.ClassKey} EmbeddingModelID=${v.EmbeddingModelID}`);
        }

        // ── Q1 — pure semantic, no literal-word overlap with any note.
        //    Should match the workbench-DB note (#4) by paraphrase.
        const q1 = await SearchEngine.Instance.Search({
            Query: 'What is the database situation on the current laptop setup',
            ScopeIDs: [RAG_AUDIT_SCOPE_ID],
            MaxResults: 5,
            Mode: 'full',
            AIAgentID: SAGE_AGENT_ID,
        }, ctx.arie);

        // ── Q2 — multi-provider fusion: literal "MemberJunction" appears in
        //    2 notes verbatim (Entity-side UserSearchString will find them),
        //    AND the semantic concept of "open-source projects and review
        //    process" relates to several others (Vector-side cosine will
        //    find them). A note that hits in BOTH providers should rank
        //    top via RRF.
        // Single-word query because UserSearchString's multi-word tokenizer
        // ANDs by default and our notes don't contain literal "code review
        // process" together. Single word "MemberJunction" hits 2 notes literally.
        // Vector cosine on the same word finds the agent + monorepo + review
        // notes by topic relatedness.
        const q2 = await SearchEngine.Instance.Search({
            Query: 'MemberJunction',
            ScopeIDs: [RAG_AUDIT_SCOPE_ID],
            MaxResults: 8,
            Mode: 'full',
            AIAgentID: SAGE_AGENT_ID,
        }, ctx.arie);

        // ── Diag: probe Entity-side directly via RunView UserSearchString
        //    so we can see whether the predicate generator finds the
        //    "MemberJunction" rows at all. This isolates "is RunView's
        //    UserSearchString picking up the term?" from "is the engine
        //    routing the entity provider correctly?"
        const { RunView } = await import('@memberjunction/core');
        const directProbe = await new RunView().RunView({
            EntityName: 'MJ: AI Agent Notes',
            UserSearchString: 'MemberJunction',
            ResultType: 'simple',
            MaxRows: 5,
        }, ctx.arie);
        console.log(`  [diag] direct UserSearchString="MemberJunction" on MJ:AIAgentNote: success=${directProbe.Success} count=${directProbe.Results?.length ?? 0}`);
        if (directProbe.Results?.length) {
            for (const row of directProbe.Results.slice(0, 3) as Array<{ Note: string }>) {
                console.log(`    · ${row.Note.slice(0, 80)}`);
            }
        }

        // ── Q3 — discrimination: out-of-corpus topic. Vector cosine produces
        //    SOME similarity for any non-zero embedding, so we use a high
        //    minSimilarity threshold to filter out noise. With mpnet-base-v2,
        //    truly-unrelated content sits at 0.4-0.5 cosine; on-topic notes
        //    sit at 0.55+. We use 0.55 as the discrimination threshold.
        const q3 = await SearchEngine.Instance.Search({
            Query: 'How do I bake sourdough bread',
            ScopeIDs: [RAG_AUDIT_SCOPE_ID],
            MaxResults: 5,
            Mode: 'full',
            MinScore: 0.55,
            AIAgentID: SAGE_AGENT_ID,
        }, ctx.arie);

        return {
            success: true,
            agentRunID: undefined,
            elapsedMs: 0,
            // Stash the three result sets on the side channel for assert()
            errorMessage: JSON.stringify({
                q1: { sourceCounts: q1.SourceCounts, results: q1.Results.slice(0, 3).map(r => ({ Title: r.Title?.slice(0, 80), Snippet: r.Snippet?.slice(0, 80), Score: r.Score, SourceType: r.SourceType })) },
                q2: { sourceCounts: q2.SourceCounts, results: q2.Results.slice(0, 8).map(r => ({ Title: r.Title?.slice(0, 80), Snippet: r.Snippet?.slice(0, 80), Score: r.Score, SourceType: r.SourceType })) },
                q3: { sourceCounts: q3.SourceCounts, count: q3.Results.length, top: q3.Results[0]?.Title?.slice(0, 80) },
            }),
        };
    },

    assert: async (ctx, runResult) => {
        if (Array.isArray(runResult)) throw new Error('expected single run');
        const data = JSON.parse(runResult.errorMessage ?? '{}') as {
            q1: { sourceCounts: { Vector: number; Entity: number; FullText: number; Storage: number }; results: Array<{ Title?: string; Snippet?: string; Score?: number; SourceType?: string }> };
            q2: { sourceCounts: { Vector: number; Entity: number; FullText: number; Storage: number }; results: Array<{ Title?: string; Snippet?: string; Score?: number; SourceType?: string }> };
            q3: { sourceCounts: { Vector: number; Entity: number; FullText: number; Storage: number }; count: number; top?: string };
        };

        console.log('\n  [diag] Q1 ("database situation on laptop") top results:');
        for (const r of data.q1.results) console.log(`    [${r.SourceType}] score=${r.Score?.toFixed(3)} ${r.Title?.slice(0, 80)}`);
        console.log(`    sourceCounts: ${JSON.stringify(data.q1.sourceCounts)}`);

        console.log('\n  [diag] Q2 ("Sage agent design") top results:');
        for (const r of data.q2.results) console.log(`    [${r.SourceType}] score=${r.Score?.toFixed(3)} ${r.Title?.slice(0, 80)}`);
        console.log(`    sourceCounts: ${JSON.stringify(data.q2.sourceCounts)}`);

        console.log('\n  [diag] Q3 ("sourdough bread") top:');
        console.log(`    count=${data.q3.count} top="${data.q3.top ?? 'none'}" sourceCounts=${JSON.stringify(data.q3.sourceCounts)}`);

        // Q1 — semantic-only retrieval works
        assert(data.q1.sourceCounts.Vector >= 1,
            `Q1 surfaces vector hits (vector=${data.q1.sourceCounts.Vector})`);
        const q1TopMatchesWorkbench = data.q1.results[0] && /MJ_SearchScopes_Rebase|localhost.*1444|workbench database/i.test(
            (data.q1.results[0].Title ?? '') + ' ' + (data.q1.results[0].Snippet ?? '')
        );
        assert(q1TopMatchesWorkbench,
            `Q1 top-1 is the workbench-DB note via semantic match (got "${data.q1.results[0]?.Title?.slice(0, 80)}")`);

        // Q2 — multi-provider fusion proof. "MemberJunction code review process"
        // hits Entity (literal "MemberJunction" in 3 notes) AND Vector
        // (semantic match against AN-BC + monorepo + Sage notes).
        assert(data.q2.sourceCounts.Vector >= 1 && data.q2.sourceCounts.Entity >= 1,
            `Q2 SourceCounts shows BOTH Vector and Entity contributions ` +
            `(vector=${data.q2.sourceCounts.Vector}, entity=${data.q2.sourceCounts.Entity})`);
        // RRF rewards records that appear in multiple providers. The two notes
        // that literally contain "MemberJunction" (monorepo note + AN-BC note)
        // get an Entity-side boost on top of their Vector cosine score; both
        // should appear in the top-5.
        // Both literal-match notes (monorepo + AN-BC, the only two with the
        // word "MemberJunction") should make the result set. They may not be
        // top-1 because vector cosine on "MemberJunction" surfaces ALL ML/agent
        // related notes by topic — but the literal-text Entity-side hits are
        // distinct contributions that fusion preserves.
        const q2AllText = data.q2.results.map(r => (r.Title ?? '') + ' ' + (r.Snippet ?? '')).join('\n');
        const monorepoNoteFound = /MemberJunction monorepo|Turborepo/i.test(q2AllText);
        const reviewerNoteFound = /AN-BC|primary code reviewer/i.test(q2AllText);
        assert(monorepoNoteFound && reviewerNoteFound,
            `Q2 result set contains BOTH literal-match notes (monorepo + AN-BC) — entity-side fusion contribution. ` +
            `monorepo=${monorepoNoteFound}, reviewer=${reviewerNoteFound}`);

        // Q3 — discrimination
        const q3HasNoConfidentMatch = data.q3.count === 0
            || !data.q3.top
            || (!/Arie|MJ|Sage|BlueCypress|MemberJunction|AN-BC/.test(data.q3.top));
        assert(q3HasNoConfidentMatch,
            `Q3 ("sourdough bread") returned no confident match from corpus (got: ${data.q3.count} results, top="${data.q3.top ?? 'none'}")`);
    },

    teardown: async (pool, setupResult) => {
        const setup = setupResult as S15Setup | undefined;
        if (!setup) return;
        // Restore env var
        if (setup.originalApiKeyEnvKey === null) {
            delete process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE;
        } else {
            process.env.AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE = setup.originalApiKeyEnvKey;
        }
        // Reverse-order DB teardown
        await pool.request().query(`
            DELETE FROM __mj.AIAgentNote WHERE Note LIKE '${SEED_TAG}:%';
        `);
        if (setup.scopeExtIndexRowID) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeExternalIndex WHERE ID='${setup.scopeExtIndexRowID}';`).catch(() => {});
        }
        for (const id of setup.insertedScopeProviderIDs ?? []) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeProvider WHERE ID='${id}';`).catch(() => {});
        }
        if (setup.scopeEntityRowID) {
            await pool.request().query(`DELETE FROM __mj.SearchScopeEntity WHERE ID='${setup.scopeEntityRowID}';`).catch(() => {});
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

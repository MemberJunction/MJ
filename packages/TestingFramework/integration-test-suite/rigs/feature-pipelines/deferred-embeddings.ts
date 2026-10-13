/**
 * deferred-embeddings.ts — save-time AI rig: proves against the real database that every record kind that embeds on
 * save, when saved the way `mj sync push` saves it (`BaseEntity.SkipEmbeddings = true`, MetadataSync PushService), gets
 * no vector from the save — the CLI never loads the embedding model — and then gets one, persisted, from the engine
 * that serves those vectors, through the trigger a server runs:
 *   - Query  → `QueryEngineServer.Config` (the load starts `EmbedMissingQueries`)
 *   - Tag    → `TagEngine.Config` (its load re-embeds tags without a vector)
 *   - AI Agent Note / Example → `AIEngine.HandleStartup` (the server-startup path; starts `EmbedMissingNoteAndExampleVectors`)
 *   - Component → `ComponentMetadataEngineServer.HandleStartup` (the server-startup path, `@RegisterForStartup`;
 *     starts `EmbedMissingComponentVectors`)
 * The engines start those backfills without waiting for them, so the rig polls the database for the vectors.
 *
 * Also checks that a push-style edit of an already-embedded query clears its now-stale vector. Only records this rig
 * creates are touched; they are deleted at the end through their entities.
 *
 * Usage (from the MJ repo root, private env loaded — the DB comes from DB_DATABASE):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/deferred-embeddings.ts
 * Needs SQL Server (reads the physical rows) and the local embedding model (in-process, no credentials). The rig turns
 * every save-time AI prompt off for its own process (`SaveTimeAISettings.WithPromptsDisabled`), so its saves make no
 * live model call; embeddings — the subject of the rig — stay on.
 * Exit: 0 = every expectation held, 1 = an expectation failed, 2 = bootstrap error.
 */
import type sql from 'mssql';
import { RunView, type BaseEntity } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJAIAgentEntity, MJAIAgentExampleEntity, MJAIAgentNoteEntity, MJComponentEntity, MJQueryEntity, MJTagEntity } from '@memberjunction/core-entities';
import { ComponentMetadataEngineServer, QueryEngineServer } from '@memberjunction/core-entities-server';
import { SaveTimeAISettings } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { TagEngine } from '@memberjunction/tag-engine';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { RigCLI, RigSQL, type RigCheck } from '../lib/rig-cli';

/** What every scenario needs: the run's provider, the raw pool, the schema, a stamp and the records to delete. */
interface RigRun {
    Ctx: IntegrationBootstrapContext;
    Pool: sql.ConnectionPool;
    Schema: string;
    Stamp: string;
    /** Every scratch record, in creation order; deleted in reverse at the end. */
    Records: BaseEntity[];
}

/** Saves `entity` the way PushService does (SkipEmbeddings set). @throws Error when the save fails */
async function saveAsPush(entity: BaseEntity, what: string): Promise<void> {
    entity.SkipEmbeddings = true;
    if (!(await entity.Save())) {
        throw new Error(`could not save ${what}: ${entity.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
}

/** `WHERE` text matching the rows among `ids`. */
function idList(ids: string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
}

/** How many rows among `ids` in `table` have no vector in `vectorColumn` (JSON and binary both NULL). */
function nullVectorCount(run: RigRun, table: string, ids: string[], vectorColumn = 'EmbeddingVector'): Promise<number> {
    return RigSQL.Scalar(run.Pool, `SELECT COUNT(*) AS N FROM [${run.Schema}].[${table}] WHERE ID IN (${idList(ids)}) AND ${vectorColumn} IS NULL AND ${vectorColumn}Binary IS NULL`);
}

/** How many rows among `ids` in `table` have a vector in `vectorColumn` and its model ID in `modelColumn`. */
function embeddedCount(run: RigRun, table: string, ids: string[], vectorColumn = 'EmbeddingVector', modelColumn = 'EmbeddingModelID'): Promise<number> {
    return RigSQL.Scalar(run.Pool, `SELECT COUNT(*) AS N FROM [${run.Schema}].[${table}] WHERE ID IN (${idList(ids)}) AND (${vectorColumn} IS NOT NULL OR ${vectorColumn}Binary IS NOT NULL) AND ${modelColumn} IS NOT NULL`);
}

/** How long the rig waits for a backfill it started (the first one loads the local model). */
const BACKFILL_TIMEOUT_MS = 120_000;

/** Polls `count` until it returns `expected` or the timeout passes. @returns the last count read */
async function waitForCount(count: () => Promise<number>, expected: number, timeoutMs = BACKFILL_TIMEOUT_MS): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let n = await count();
    while (n !== expected && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        n = await count();
    }
    return n;
}

/** A new scratch query (SQL `SELECT 1`) with the given name and description. */
async function newQuery(run: RigRun, name: string, description: string): Promise<MJQueryEntity> {
    const q = await run.Ctx.Provider.GetEntityObject<MJQueryEntity>('MJ: Queries', run.Ctx.User);
    q.NewRecord();
    q.Name = name;
    q.Description = description;
    q.SQL = 'SELECT 1 AS X';
    q.Status = 'Approved';
    return q;
}

/** Queries and a tag: QueryEngineServer and TagEngine embed what the push-style saves left without a vector. */
async function queryAndTagScenario(run: RigRun): Promise<RigCheck[]> {
    const edited = await newQuery(run, `deferred-embeddings edited ${run.Stamp}`, 'first text');
    if (!(await edited.Save())) throw new Error(`could not save the edited query: ${edited.LatestResult?.CompleteMessage || 'unknown error'}`);
    run.Records.push(edited);
    const embeddedBefore = await embeddedCount(run, 'Query', [edited.ID]);
    edited.Description = 'second text, pushed';
    await saveAsPush(edited, 'the edited query');

    const pushed = await newQuery(run, `deferred-embeddings pushed ${run.Stamp}`, 'a query created by mj sync push');
    run.Records.push(pushed);
    await saveAsPush(pushed, 'the pushed query');

    const tag = await run.Ctx.Provider.GetEntityObject<MJTagEntity>('MJ: Tags', run.Ctx.User);
    tag.NewRecord();
    tag.Name = `deferred-embeddings tag ${run.Stamp}`;
    tag.DisplayName = tag.Name;
    tag.Description = 'a tag created by mj sync push';
    tag.Status = 'Active';
    run.Records.push(tag);
    await saveAsPush(tag, 'the pushed tag');

    const queryIDs = [edited.ID, pushed.ID];
    const checks: RigCheck[] = [
        { Label: 'a normal save embedded the first query', Pass: embeddedBefore === 1, Detail: `${embeddedBefore}` },
        { Label: 'after the push-style saves, both queries have no vector (new: never computed; edited: stale one cleared)', Pass: (await nullVectorCount(run, 'Query', queryIDs)) === 2 },
        { Label: 'after the push-style save, the tag has no vector', Pass: (await nullVectorCount(run, 'Tag', [tag.ID])) === 1 },
    ];
    await QueryEngineServer.Instance.Config(true, run.Ctx.User);
    const queriesEmbedded = await waitForCount(() => embeddedCount(run, 'Query', queryIDs), 2);
    checks.push({ Label: 'QueryEngineServer embedded and persisted both queries when it loaded', Pass: queriesEmbedded === 2, Detail: `${queriesEmbedded} of 2` });
    await TagEngine.Instance.Config(true, run.Ctx.User);
    const tagEmbedded = await embeddedCount(run, 'Tag', [tag.ID]);
    checks.push({ Label: 'TagEngine embedded and persisted the tag when it loaded', Pass: tagEmbedded === 1, Detail: `${tagEmbedded} of 1` });
    return checks;
}

/** The first agent, for the note's and example's AgentID. @throws Error when there is none */
async function anyAgentID(run: RigRun): Promise<string> {
    const res = await RunView.FromMetadataProvider(run.Ctx.Provider).RunView<Pick<MJAIAgentEntity, 'ID'>>({
        EntityName: 'MJ: AI Agents', Fields: ['ID'], OrderBy: 'Name', MaxRows: 1,
    }, run.Ctx.User);
    const id = res.Success ? res.Results[0]?.ID : undefined;
    if (!id) throw new Error('need at least one AI Agent');
    return id;
}

/** An agent note and example: AIEngine embeds them when its embeddings load (the server-startup path). */
async function noteAndExampleScenario(run: RigRun): Promise<RigCheck[]> {
    const agentID = await anyAgentID(run);
    const note = await run.Ctx.Provider.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', run.Ctx.User);
    note.NewRecord();
    note.AgentID = agentID;
    note.Note = `deferred-embeddings note ${run.Stamp}: prefers concise answers`;
    note.Status = 'Active';
    run.Records.push(note);
    await saveAsPush(note, 'the pushed note');

    const example = await run.Ctx.Provider.GetEntityObject<MJAIAgentExampleEntity>('MJ: AI Agent Examples', run.Ctx.User);
    example.NewRecord();
    example.AgentID = agentID;
    example.ExampleInput = `deferred-embeddings example ${run.Stamp}: how do I reset my password?`;
    example.ExampleOutput = 'Use the reset link on the sign-in page.';
    example.Status = 'Active';
    run.Records.push(example);
    await saveAsPush(example, 'the pushed example');

    const checks: RigCheck[] = [
        { Label: 'after the push-style saves, the note and the example have no vector', Pass: (await nullVectorCount(run, 'AIAgentNote', [note.ID])) === 1 && (await nullVectorCount(run, 'AIAgentExample', [example.ID])) === 1 },
    ];
    // A fresh server process loads the AI metadata from the database, then runs HandleStartup; reload the base
    // metadata here so this process sees the two rows the way such a server would.
    await AIEngine.Instance.Config(true, run.Ctx.User);
    await AIEngine.Instance.HandleStartup(run.Ctx.User);
    const noteEmbedded = await waitForCount(() => embeddedCount(run, 'AIAgentNote', [note.ID]), 1);
    const exampleEmbedded = await waitForCount(() => embeddedCount(run, 'AIAgentExample', [example.ID]), 1);
    checks.push({ Label: 'AIEngine embedded and persisted the note and the example when its embeddings loaded', Pass: noteEmbedded === 1 && exampleEmbedded === 1, Detail: `note ${noteEmbedded}, example ${exampleEmbedded}` });
    return checks;
}

/** A component: ComponentMetadataEngineServer embeds both of its vectors when the server starts it. */
async function componentScenario(run: RigRun): Promise<RigCheck[]> {
    const component = await run.Ctx.Provider.GetEntityObject<MJComponentEntity>('MJ: Components', run.Ctx.User);
    component.NewRecord();
    component.Name = `deferred-embeddings component ${run.Stamp}`;
    component.Version = '1.0.0';
    component.Specification = '{}';
    component.FunctionalRequirements = 'Shows a list of members with their status.';
    component.TechnicalDesign = 'A table bound to a RunView of members.';
    run.Records.push(component);
    await saveAsPush(component, 'the pushed component');

    const before = (await nullVectorCount(run, 'Component', [component.ID], 'FunctionalRequirementsVector'))
        + (await nullVectorCount(run, 'Component', [component.ID], 'TechnicalDesignVector'));
    const checks: RigCheck[] = [{ Label: 'after the push-style save, the component has neither vector', Pass: before === 2, Detail: `${before} of 2 missing` }];
    // What a full-mode server's StartupManager calls for this deferred startup engine.
    await ComponentMetadataEngineServer.Instance.HandleStartup(run.Ctx.User, run.Ctx.Provider);
    const after = await waitForCount(async () =>
        (await embeddedCount(run, 'Component', [component.ID], 'FunctionalRequirementsVector', 'FunctionalRequirementsVectorEmbeddingModelID'))
        + (await embeddedCount(run, 'Component', [component.ID], 'TechnicalDesignVector', 'TechnicalDesignVectorEmbeddingModelID')), 2);
    checks.push({ Label: 'ComponentMetadataEngineServer embedded and persisted both component vectors when the server started it', Pass: after === 2, Detail: `${after} of 2` });
    return checks;
}

/** Deletes every scratch record (newest first) through its entity, so child rows go with it. */
async function cleanup(run: RigRun): Promise<void> {
    for (const record of [...run.Records].reverse()) {
        if (!(await record.Delete())) {
            console.error(`could not delete scratch ${record.EntityInfo.Name} ${record.PrimaryKey.ToString()}: ${record.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
    }
}

async function main(): Promise<number> {
    SaveTimeAISettings.Instance.Config = SaveTimeAISettings.WithPromptsDisabled(SaveTimeAISettings.Instance.Config);
    const ctx = await BootstrapIntegrationServer();
    const pool = ctx.Pool;
    if (!pool) {
        console.error('this rig needs SQL Server (no mssql pool)');
        await ctx.ClosePool();
        return 2;
    }
    const run: RigRun = { Ctx: ctx, Pool: pool, Schema: ctx.Provider.ConfigData.MJCoreSchemaName, Stamp: new Date().toISOString(), Records: [] };
    try {
        const checks = [
            ...(await queryAndTagScenario(run)),
            ...(await noteAndExampleScenario(run)),
            ...(await componentScenario(run)),
        ];
        return RigCLI.ExitCodeOf(checks);
    } finally {
        try {
            await cleanup(run);
        } finally {
            await ctx.ClosePool();
        }
    }
}

void RigCLI.Main(main);

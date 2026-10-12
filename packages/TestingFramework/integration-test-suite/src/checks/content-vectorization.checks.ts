/**
 * content-vectorization.checks.ts — the 'content-vectorization' bundle (CV1–CV10): the
 * ContentSource / autotag vectorization pipeline (AutotagBaseEngine), end-to-end against the live DB.
 *
 * TRANSPORT: **SERVER** — AutotagBaseEngine is a server-side engine with no client surface, so
 * these run in-process against the SQLServerDataProvider (`ctx.Provider`).
 *
 * TIER: deterministic + **RequiresMutation** (each check creates + deletes its own fixtures, so
 * they only fire under RUN_MUTATION_TESTS; a plain deterministic run writes nothing). The two
 * genuine external seams — the embedding call and the vector-DB (Pinecone) upsert/delete — are
 * STUBBED and CAPTURED, exactly as the deterministic tier stubs LLM/embedding calls (ai-embeddings
 * AE5: the local embedder's first call downloads an ONNX model, a dependency the tier must not
 * take). Everything BELOW the stub line — chunking, ContentItemChunk row creation, soft-delete on
 * re-chunk, PurgeDeletedChunks, EmbedPendingChunks, metadata construction, dimensions + namespace
 * threading — runs for real. The stubs are installed lazily (first check) and RESTORED in Teardown.
 *
 * WHAT IS PINNED: CV1 default chunk creation + chunk identity; CV2 multi-chunk + re-vectorize
 * soft-delete; CV3 PurgeDeletedChunks removes the superseded vectors and tombstones the rows;
 * CV4 EmbedPendingChunks backfills a Pending chunk; CV5 explicit metadata strategy is minimal;
 * CV6 dimensions + namespace routing thread through to the (captured) embed + upsert; CV7/CV8 a
 * declared VectorEntityName omits Entity only when the reader can honor it; CV9 a content source
 * another process created after the engine cache loaded still routes, stores and namespaces by its
 * own configuration; CV10 FieldPathResolver queries a related row its engine cache has never seen.
 *
 * CV9/CV10 create that source with a raw INSERT through `ctx.Pool`, so they are SQL Server only and
 * skip loudly without a pool (see insertSourceBehindEngine for why a BaseEntity save cannot do it).
 *
 * ANTI-VACUITY: needs a Vector Index to borrow an embedding model + vector DB from. If the
 * deployment has none, every check SKIPS-AS-PASS LOUDLY. All fixtures are name-prefixed per run
 * and tagged "(mj-integration-test — safe to delete)"; Teardown removes them children-first.
 */
import { RunView, BaseEntity, BaseEngineRegistry, CompositeKey } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual, uuidv4 } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { AutotagBaseEngine, FieldPathResolver } from '@memberjunction/content-autotagging';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    KnowledgeHubMetadataEngine,
    type MJContentItemEntity,
    type MJContentItemChunkEntity,
    type MJContentSourceEntity,
    type MJContentTypeEntity,
    type MJContentSourceTypeEntity,
    type MJContentFileTypeEntity,
    type MJVectorIndexEntity,
} from '@memberjunction/core-entities';

const MARKER = '(mj-integration-test — safe to delete)';
const LONG_TEXT = 'This is a sentence about content that will be chunked. '.repeat(1500); // >30k chars → multi-chunk

interface CapturedRecord { id: string; metadata: Record<string, unknown>; providerTemporaryDirectives?: Record<string, unknown> }
interface CapturedUpsert { providerConfig?: Record<string, unknown>; records: CapturedRecord[] }

/** Bundle-scoped state: stub originals (for restore), capture buffers, borrowed infra, created rows. */
interface BundleState {
    Skip: boolean;
    SkipReason: string;
    Installed: boolean;
    EmbeddingModelID: string;
    VectorDatabaseID: string;
    BaseBuilt: boolean;
    SourceTypeID: string;
    FileTypeID: string;
    VectorIndexID: string;
    Prefix: string;
    Created: { entity: string; id: string }[];   // FK-reverse teardown
    ContentItemIds: string[];                     // for chunk-row sweep
    Upserts: CapturedUpsert[];
    DeletedVectorIds: string[];
    EmbedCalls: Array<{ count: number; dimensions?: number }>;
    OrigCreateVectorDB?: (classKey: string) => unknown;
    OrigRunEmbedding?: typeof AIEmbeddingRunner.prototype.RunEmbedding;
}
let S: BundleState;

function skipNote(id: string, reason: string): void {
    console.warn(`  ⚠ content-vectorization.${id} SKIPPED — ${reason}`);
}
/** Returns true (and logs) when the bundle can't run; each check early-returns on it. */
function guardSkip(id: string): boolean {
    if (S?.Skip) { skipNote(id, S.SkipReason); return true; }
    return false;
}

/** Install the two external-seam stubs (the engine's vector-DB factory and AIEmbeddingRunner.RunEmbedding), idempotently, capturing payloads. */
function installStubs(): void {
    if (S.Installed) return;
    const seams = AutotagBaseEngine.Instance as unknown as {
        createVectorDBInstance: (classKey: string) => unknown;
    };
    S.OrigCreateVectorDB = seams.createVectorDBInstance;
    S.OrigRunEmbedding = AIEmbeddingRunner.prototype.RunEmbedding;

    seams.createVectorDBInstance = () => ({
        // Mimic Pinecone's namespace derivation so namespace routing is exercised for real.
        BuildProviderDirectives: (sourceRecord: Record<string, unknown>, providerConfig: Record<string, unknown>) => {
            const field = typeof providerConfig?.['namespaceField'] === 'string' ? (providerConfig['namespaceField'] as string) : undefined;
            return field && sourceRecord?.[field] != null ? { namespace: String(sourceRecord[field]) } : {};
        },
        // Mirrors PineconeDatabase: a namespaceField naming a field on a RELATED record (the dotted
        // `<FK>.<Field>` form) is declared as a source-record dependency, so the pipeline pre-resolves
        // it through FieldPathResolver and injects it under the full path key. A plain field needs no
        // declaration — it is already on the item — so CV6 keeps short-circuiting exactly as before.
        GetSourceRecordFieldPaths: (providerConfig?: Record<string, unknown>) => {
            const field = typeof providerConfig?.['namespaceField'] === 'string' ? (providerConfig['namespaceField'] as string) : undefined;
            return field && field.includes('.') ? [field] : ([] as string[]);
        },
        CreateRecords: async (records: CapturedRecord[], _indexName?: string, providerConfig?: Record<string, unknown>) => {
            S.Upserts.push({ providerConfig, records: records.map(r => ({ id: r.id, metadata: r.metadata, providerTemporaryDirectives: r.providerTemporaryDirectives })) });
            return { success: true, message: 'stubbed upsert (captured)' };
        },
        DeleteRecords: async (records: Array<{ id: string }>) => {
            S.DeletedVectorIds.push(...records.map(r => r.id));
            return { success: true, message: 'stubbed delete (captured)' };
        },
    });
    // The autotag pipeline embeds through AIEmbeddingRunner (AIModelRunner delegates to it too), so
    // the stub goes on its prototype. It matches RunEmbedding's signature, so no cast is needed.
    AIEmbeddingRunner.prototype.RunEmbedding = async (params: EmbeddingRunParams): Promise<EmbeddingRunResult> => {
        S.EmbedCalls.push({ count: params.Texts.length, dimensions: params.Dimensions });
        return { Success: true, Vectors: params.Texts.map(() => [0.01, 0.02, 0.03]), PromptRunID: null, TokensUsed: 0, Cost: 0, ErrorMessage: null, ExecutionTimeMs: 0 };
    };
    S.Installed = true;
}
function restoreStubs(): void {
    if (!S?.Installed) return;
    const seams = AutotagBaseEngine.Instance as unknown as { createVectorDBInstance: unknown };
    if (S.OrigCreateVectorDB) seams.createVectorDBInstance = S.OrigCreateVectorDB;
    if (S.OrigRunEmbedding) AIEmbeddingRunner.prototype.RunEmbedding = S.OrigRunEmbedding;
    S.Installed = false;
}

/** Lazily build the shared fixture (source-type / file-type / vector index) + install stubs. */
async function ensureBase(ctx: IntegrationCheckContext): Promise<void> {
    installStubs();
    if (S.BaseBuilt) return;
    const st = await ctx.Provider.GetEntityObject<MJContentSourceTypeEntity>('MJ: Content Source Types', ctx.User);
    st.NewRecord(); st.Name = `${S.Prefix}-st ${MARKER}`;
    Assert(await st.Save(), `source-type save: ${st.LatestResult?.CompleteMessage}`);
    S.SourceTypeID = st.ID; S.Created.push({ entity: 'MJ: Content Source Types', id: st.ID });

    const ft = await ctx.Provider.GetEntityObject<MJContentFileTypeEntity>('MJ: Content File Types', ctx.User);
    ft.NewRecord(); ft.Name = `${S.Prefix}-ft ${MARKER}`;
    Assert(await ft.Save(), `file-type save: ${ft.LatestResult?.CompleteMessage}`);
    S.FileTypeID = ft.ID; S.Created.push({ entity: 'MJ: Content File Types', id: ft.ID });

    const vi = await ctx.Provider.GetEntityObject<MJVectorIndexEntity>('MJ: Vector Indexes', ctx.User);
    vi.NewRecord(); vi.Name = `${S.Prefix}-index ${MARKER}`;
    vi.EmbeddingModelID = S.EmbeddingModelID; vi.VectorDatabaseID = S.VectorDatabaseID;
    vi.Dimensions = 1536;                                                          // CV6: dimensions
    vi.ProviderConfig = JSON.stringify({ namespaceField: 'ContentSourceID' });     // CV6: namespace
    Assert(await vi.Save(), `vector-index save: ${vi.LatestResult?.CompleteMessage}`);
    S.VectorIndexID = vi.ID; S.Created.push({ entity: 'MJ: Vector Indexes', id: vi.ID });
    S.BaseBuilt = true;
}

/** Create a content type; with `vectorIndexID` it also routes (EmbeddingModelID + VectorIndexID) to that index. */
async function makeContentType(ctx: IntegrationCheckContext, label: string, vectorIndexID?: string): Promise<string> {
    const ct = await ctx.Provider.GetEntityObject<MJContentTypeEntity>('MJ: Content Types', ctx.User);
    ct.NewRecord(); ct.Name = `${S.Prefix}-ct-${label} ${MARKER}`; ct.AIModelID = S.EmbeddingModelID; ct.MinTags = 1; ct.MaxTags = 5;
    if (vectorIndexID) { ct.EmbeddingModelID = S.EmbeddingModelID; ct.VectorIndexID = vectorIndexID; }
    Assert(await ct.Save(), `content-type save: ${ct.LatestResult?.CompleteMessage}`);
    S.Created.push({ entity: 'MJ: Content Types', id: ct.ID });
    return ct.ID;
}

/** Create a content source (+ its content type), optionally with a VectorMetadata Configuration. */
async function makeSource(ctx: IntegrationCheckContext, label: string, configuration?: Record<string, unknown>): Promise<{ sourceID: string; contentTypeID: string }> {
    const contentTypeID = await makeContentType(ctx, label);

    const src = await ctx.Provider.GetEntityObject<MJContentSourceEntity>('MJ: Content Sources', ctx.User);
    src.NewRecord(); src.Name = `${S.Prefix}-src-${label} ${MARKER}`;
    src.ContentTypeID = contentTypeID; src.ContentSourceTypeID = S.SourceTypeID; src.ContentFileTypeID = S.FileTypeID;
    src.URL = 'https://example.com/it-cv'; src.EmbeddingModelID = S.EmbeddingModelID; src.VectorIndexID = S.VectorIndexID;
    if (configuration) src.Configuration = JSON.stringify(configuration);
    Assert(await src.Save(), `content-source save: ${src.LatestResult?.CompleteMessage}`);
    S.Created.push({ entity: 'MJ: Content Sources', id: src.ID });
    return { sourceID: src.ID, contentTypeID };
}

/**
 * Create a content source the way ANOTHER PROCESS would, as far as this one can tell: a raw INSERT
 * through the fixture pool, so no BaseEntity save event fires here and KnowledgeHubMetadataEngine
 * never hears about the row. A BaseEntity save cannot model that. The engine caches
 * 'MJ: Content Sources' with AutoRefresh on (the BaseEngine default), so an in-process save pushes
 * the new row straight into its cache, which is why the first version of CV9 passed with or
 * without the fix it was written for. Direct DML skips the platform's save-side guarantees (audit,
 * invalidation, validation) and that is precisely the point here; Teardown still deletes the row
 * through BaseEntity. Callers assert the row is invisible to the engine before relying on it.
 */
async function insertSourceBehindEngine(
    ctx: IntegrationCheckContext,
    label: string,
    contentTypeID: string,
    vectorIndexID: string,
    configuration?: Record<string, unknown>
): Promise<{ sourceID: string; sourceName: string }> {
    const entity = ctx.Provider.EntityByName('MJ: Content Sources');
    Assert(!!entity && !!ctx.Pool, "insertSourceBehindEngine needs 'MJ: Content Sources' metadata and the server fixture pool");
    const sourceID = uuidv4().toUpperCase();
    const sourceName = `${S.Prefix}-src-${label} ${MARKER}`;
    await ctx.Pool!.request()
        .input('ID', sourceID)
        .input('Name', sourceName)
        .input('ContentTypeID', contentTypeID)
        .input('ContentSourceTypeID', S.SourceTypeID)
        .input('ContentFileTypeID', S.FileTypeID)
        .input('URL', 'https://example.com/it-cv')
        .input('EmbeddingModelID', S.EmbeddingModelID)
        .input('VectorIndexID', vectorIndexID)
        .input('Configuration', configuration ? JSON.stringify(configuration) : null)
        .query(
            `INSERT INTO [${entity!.SchemaName}].[${entity!.BaseTable}] ` +
            `(ID, Name, ContentTypeID, ContentSourceTypeID, ContentFileTypeID, URL, EmbeddingModelID, VectorIndexID, Configuration) ` +
            `VALUES (@ID, @Name, @ContentTypeID, @ContentSourceTypeID, @ContentFileTypeID, @URL, @EmbeddingModelID, @VectorIndexID, @Configuration)`
        );
    S.Created.push({ entity: 'MJ: Content Sources', id: sourceID });
    return { sourceID, sourceName };
}

/** CV9/CV10 need the fixture pool (server transport, SQL Server) to create a row behind the engine cache. */
function guardNoPool(ctx: IntegrationCheckContext, id: string): boolean {
    if (ctx.Pool) return false;
    skipNote(id, 'no SQL fixture pool on this context (SQL Server server transport only) — cannot create a row this process never hears about');
    return true;
}

/** Anti-vacuity for CV9/CV10: a row this process's KnowledgeHub cache already holds proves nothing. */
function assertInvisibleToEngine(sourceID: string): void {
    Assert(KnowledgeHubMetadataEngine.Instance.GetContentSourceByID(sourceID) === undefined,
        `precondition: content source ${sourceID} must be invisible to this process's KnowledgeHub cache, or the check cannot fail`);
}
async function makeItem(ctx: IntegrationCheckContext, sourceID: string, contentTypeID: string, name: string, text: string): Promise<string> {
    const item = await ctx.Provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', ctx.User);
    item.NewRecord(); item.Name = `${S.Prefix}-${name}`; item.Description = MARKER; item.Text = text;
    item.URL = `https://example.com/it-cv/${encodeURIComponent(name)}`;
    item.ContentSourceID = sourceID; item.ContentTypeID = contentTypeID; item.ContentSourceTypeID = S.SourceTypeID; item.ContentFileTypeID = S.FileTypeID;
    Assert(await item.Save(), `content-item save: ${item.LatestResult?.CompleteMessage}`);
    S.Created.push({ entity: 'MJ: Content Items', id: item.ID });
    S.ContentItemIds.push(item.ID);
    return item.ID;
}
async function loadItems(ctx: IntegrationCheckContext, ids: string[]): Promise<MJContentItemEntity[]> {
    const r = await new RunView().RunView<MJContentItemEntity>({ EntityName: 'MJ: Content Items', ExtraFilter: `ID IN (${ids.map(i => `'${i}'`).join(',')})`, ResultType: 'entity_object' }, ctx.User);
    return r.Results;
}
async function loadChunks(ctx: IntegrationCheckContext, itemID: string): Promise<MJContentItemChunkEntity[]> {
    const r = await new RunView().RunView<MJContentItemChunkEntity>({ EntityName: 'MJ: Content Item Chunks', ExtraFilter: `ContentItemID='${itemID}'`, OrderBy: 'Sequence ASC', ResultType: 'entity_object' }, ctx.User);
    return r.Results;
}
/**
 * Refresh the KH cache so a just-created source is visible to the engine, and AIEngineBase so a
 * just-created fixture index is. AIEngineBase owns the Vector Indexes cache and overrides
 * AdditionalLoading, so BaseEngine applies a save event to it only as a debounced full refresh,
 * seconds later — the check would look the index up before it lands.
 */
async function refreshEngines(ctx: IntegrationCheckContext): Promise<void> {
    await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
    await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
}
function resetCaptures(): void { S.Upserts.length = 0; S.DeletedVectorIds.length = 0; S.EmbedCalls.length = 0; }
/** The single upserted vector record's metadata for a single-item run. */
function soleMeta(): Record<string, unknown> { return S.Upserts[S.Upserts.length - 1]?.records[0]?.metadata ?? {}; }

export const ContentVectorizationChecks: NamedCheck[] = [
    {
        Id: 'content-vectorization.CV1',
        Name: 'CV1: default (alwaysChunk + recordId) creates a ContentItemChunk row carrying chunk identity; item-level VectorRecordID stays null',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV1')) return;
            await ensureBase(ctx);
            const { sourceID, contentTypeID } = await makeSource(ctx, 'cv1');
            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv1-short', 'A short piece of content that fits in a single embedding chunk.');
            await refreshEngines(ctx);
            resetCaptures();

            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);

            const item = (await loadItems(ctx, [itemID]))[0];
            const chunks = await loadChunks(ctx, itemID);
            Assert(item.VectorRecordID == null, `single-chunk item VectorRecordID should be null (alwaysChunk), got ${item.VectorRecordID}`);
            AssertEqual(chunks.length, 1, 'single-chunk item creates exactly one ContentItemChunk row');
            AssertEqual(chunks[0].EmbeddingStatus, 'Complete', 'chunk stamped EmbeddingStatus=Complete');
            Assert(chunks[0].LastEmbeddedAt != null, 'chunk LastEmbeddedAt set');
            Assert(UUIDsEqual(chunks[0].VectorRecordID ?? '', chunks[0].ID), 'chunk VectorRecordID is UUID-equal to its row ID (recordId strategy)');
            const meta = soleMeta();
            AssertEqual(meta['Entity'], 'MJ: Content Item Chunks', 'captured vector metadata Entity = chunk entity');
            Assert(typeof meta['RecordID'] === 'string' && meta['ContentItemID'] === itemID, 'captured metadata carries chunk RecordID + parent ContentItemID');
            console.log('      → CV1: 1 chunk row, chunk-identity metadata, item-level id null');
        }
    },
    {
        Id: 'content-vectorization.CV2',
        Name: 'CV2: a long item produces ordered multi-chunk rows; re-vectorizing soft-deletes the prior chunks and appends a fresh set',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV2')) return;
            await ensureBase(ctx);
            const { sourceID, contentTypeID } = await makeSource(ctx, 'cv2');
            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv2-long', LONG_TEXT);
            await refreshEngines(ctx);
            resetCaptures();

            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);
            const first = await loadChunks(ctx, itemID);
            Assert(first.length > 1, `multi-chunk item should create >1 chunk rows, got ${first.length}`);
            Assert(first.every((c, i) => c.Sequence === i), 'chunk Sequence values are 0..n-1 in order');
            AssertEqual(new Set(first.map(c => c.VectorRecordID)).size, first.length, 'chunk vector ids are unique per chunk');

            const firstIds = new Set(first.map(c => c.ID));
            const firstVecIds = new Set(first.map(c => c.VectorRecordID));
            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);
            const after = await loadChunks(ctx, itemID);
            const live = after.filter(c => c.DeleteStatus == null);
            const pending = after.filter(c => c.DeleteStatus === 'Pending');
            AssertEqual(pending.length, first.length, 'prior chunks are soft-deleted (DeleteStatus=Pending, rows kept)');
            Assert(pending.every(c => firstIds.has(c.ID)), 'the soft-deleted rows are exactly the original chunks');
            AssertEqual(live.length, first.length, 'a fresh live chunk set is appended');
            Assert(live.every(c => !firstIds.has(c.ID) && !firstVecIds.has(c.VectorRecordID)), 'new live chunks have new row ids AND new vector ids (no collision)');
            console.log(`      → CV2: ${first.length} chunks, re-vectorize soft-deleted ${pending.length} + appended ${live.length}`);
        }
    },
    {
        Id: 'content-vectorization.CV3',
        Name: 'CV3: PurgeDeletedChunks removes the superseded chunks’ vectors from the store and tombstones the rows; live chunks untouched',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV3')) return;
            await ensureBase(ctx);
            const { sourceID, contentTypeID } = await makeSource(ctx, 'cv3');
            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv3-long', LONG_TEXT);
            await refreshEngines(ctx);
            resetCaptures();

            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);   // run 1
            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);   // run 2 → soft-delete
            const before = await loadChunks(ctx, itemID);
            const pending = before.filter(c => c.DeleteStatus === 'Pending');
            const live = before.filter(c => c.DeleteStatus == null);
            Assert(pending.length > 0, 'precondition: there are soft-deleted chunks to purge');

            S.DeletedVectorIds.length = 0;
            const purge = await AutotagBaseEngine.Instance.PurgeDeletedChunks(ctx.User);
            Assert(purge.purged >= pending.length, `purge processed the pending chunks: ${JSON.stringify(purge)}`);
            Assert(pending.every(p => S.DeletedVectorIds.includes(p.VectorRecordID!)), 'DeleteRecords was called for each superseded chunk vector id');
            Assert(live.every(c => !S.DeletedVectorIds.includes(c.VectorRecordID!)), 'DeleteRecords was NOT called for any live chunk id');
            const after = await loadChunks(ctx, itemID);
            Assert(pending.every(p => { const d = after.find(c => c.ID === p.ID); return d?.DeleteStatus === 'Deleted' && d?.LastDeletedAt != null; }), 'superseded rows are now DeleteStatus=Deleted with LastDeletedAt');
            AssertEqual(after.filter(c => c.DeleteStatus == null).length, live.length, 'live chunks are untouched by the purge');
            console.log(`      → CV3: purged ${purge.purged}, tombstoned ${pending.length}, live preserved`);
        }
    },
    {
        Id: 'content-vectorization.CV4',
        Name: 'CV4: EmbedPendingChunks backfills a ContentItemChunk row created with EmbeddingStatus=Pending (migration/recovery path)',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV4')) return;
            await ensureBase(ctx);
            const { sourceID, contentTypeID } = await makeSource(ctx, 'cv4');
            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv4-item', 'Parent item for a pending chunk.');
            await refreshEngines(ctx);

            const pendingChunk = await ctx.Provider.GetEntityObject<MJContentItemChunkEntity>('MJ: Content Item Chunks', ctx.User);
            pendingChunk.NewRecord();
            pendingChunk.ContentItemID = itemID; pendingChunk.Sequence = 0; pendingChunk.Text = 'Backfill me — a pending chunk with no vector yet.'; pendingChunk.EmbeddingStatus = 'Pending';
            Assert(await pendingChunk.Save(), `pending-chunk save: ${pendingChunk.LatestResult?.CompleteMessage}`);
            const pendingChunkID = pendingChunk.ID;
            resetCaptures();

            const res = await AutotagBaseEngine.Instance.EmbedPendingChunks(ctx.User, { maxItems: 100 });
            Assert(res.embedded >= 1, `EmbedPendingChunks reported embedded>=1: ${JSON.stringify(res)}`);
            const reloaded = await ctx.Provider.GetEntityObject<MJContentItemChunkEntity>('MJ: Content Item Chunks', ctx.User);
            await reloaded.Load(pendingChunkID);
            AssertEqual(reloaded.EmbeddingStatus, 'Complete', 'pending chunk flipped to EmbeddingStatus=Complete');
            Assert(!!reloaded.VectorRecordID, 'pending chunk got a VectorRecordID stamped');
            Assert(S.Upserts.some(u => u.records.some(r => r.metadata['RecordID'] === pendingChunkID && r.metadata['Entity'] === 'MJ: Content Item Chunks')), 'a vector was upserted for the chunk under chunk identity');
            console.log('      → CV4: pending chunk embedded, marked Complete, upserted under chunk identity');
        }
    },
    {
        Id: 'content-vectorization.CV5',
        Name: 'CV5: VectorMetadata FieldStrategy="explicit" emits minimal metadata (Entity + configured field only)',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV5')) return;
            await ensureBase(ctx);
            const { sourceID, contentTypeID } = await makeSource(ctx, 'cv5', { VectorMetadata: { FieldStrategy: 'explicit', Fields: { Name: { Included: true } } } });
            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv5-explicit', 'Explicit-metadata content item.');
            await refreshEngines(ctx);
            resetCaptures();

            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);
            const meta = soleMeta();
            AssertEqual(meta['Entity'], 'MJ: Content Item Chunks', 'explicit: Entity kept (result stays labeled)');
            AssertEqual(meta['Name'], `${S.Prefix}-cv5-explicit`, 'explicit: the configured field (Name) is present');
            Assert(meta['RecordID'] === undefined && meta['ContentItemID'] === undefined, 'explicit: system keys other than Entity are dropped');
            Assert(meta['ContentSourceID'] === undefined && meta['Title'] === undefined && meta['Tags'] === undefined, 'explicit: curated default keys are dropped');
            console.log(`      → CV5: minimal metadata = ${JSON.stringify(meta)}`);
        }
    },
    {
        Id: 'content-vectorization.CV6',
        Name: 'CV6: VectorIndex.Dimensions flows into the embedding call, and ProviderConfig.namespaceField routes the upsert',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV6')) return;
            await ensureBase(ctx);
            const { sourceID, contentTypeID } = await makeSource(ctx, 'cv6');
            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv6-item', 'Dimensions + namespace content item.');
            await refreshEngines(ctx);
            resetCaptures();

            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);
            Assert(S.EmbedCalls.length > 0 && S.EmbedCalls.every(c => c.dimensions === 1536), `embedding call received Dimensions=1536 from the index: ${JSON.stringify(S.EmbedCalls)}`);
            const up = S.Upserts[S.Upserts.length - 1];
            Assert(!!up?.providerConfig && (up.providerConfig as Record<string, unknown>)['namespaceField'] === 'ContentSourceID', `providerConfig threaded to CreateRecords: ${JSON.stringify(up?.providerConfig)}`);
            Assert(!!up?.records[0]?.providerTemporaryDirectives && (up.records[0].providerTemporaryDirectives as Record<string, unknown>)['namespace'] === sourceID, `per-record namespace directive resolved to the ContentSourceID: ${JSON.stringify(up?.records[0]?.providerTemporaryDirectives)}`);
            console.log('      → CV6: dimensions=1536 + namespace directive routed');
        }
    },
    {
        Id: 'content-vectorization.CV7',
        Name: 'CV7: a source declaring VectorEntityName under the explicit strategy omits Entity and carries ContentSourceID instead',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV7')) return;
            await ensureBase(ctx);
            // The whole opt-in, against the real cascade: CV5 covers 'explicit' WITHOUT a declaration and
            // asserts Entity survives, so this is its counterpart. ChunkTextStorage/VectorIDStrategy are
            // left unset deliberately — 'alwaysChunk' and 'recordId' are the hardcoded defaults, and the
            // gate has to be satisfied by them rather than by values this fixture spells out.
            const { sourceID, contentTypeID } = await makeSource(ctx, 'cv7', {
                VectorEntityName: 'MJ: Content Item Chunks',
                VectorMetadata: { FieldStrategy: 'explicit', Fields: { Name: { Included: true } } },
            });
            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv7-declared', 'Declared-entity content item.');
            await refreshEngines(ctx);
            resetCaptures();

            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);

            const meta = soleMeta();
            Assert(meta['Entity'] === undefined, `a declared source under 'explicit' omits Entity, got ${JSON.stringify(meta['Entity'])}`);
            // The invariant: what search resolves the declaration THROUGH must be present and a string.
            AssertEqual(meta['ContentSourceID'], sourceID, 'ContentSourceID promoted as the attribution key');
            AssertEqual(meta['Name'], `${S.Prefix}-cv7-declared`, 'the configured display field is still included');
            Assert(meta['RecordID'] === undefined, 'explicit still drops RecordID (recovered from the vector id)');
            // And the id really is recoverable: under 'recordId' the vector id IS the chunk row's PK.
            const chunks = await loadChunks(ctx, itemID);
            AssertEqual(chunks.length, 1, 'one chunk row');
            const up = S.Upserts[S.Upserts.length - 1];
            Assert(UUIDsEqual(up?.records[0]?.id ?? '', chunks[0].ID), `vector id is the chunk PK, so an omitted RecordID is still resolvable: ${up?.records[0]?.id} vs ${chunks[0].ID}`);
            console.log(`      → CV7: metadata = ${JSON.stringify(meta)}`);
        }
    },
    {
        Id: 'content-vectorization.CV8',
        Name: 'CV8: the Entity key survives a declaration the reader would refuse — an unresolvable name, and one naming the item entity',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV8')) return;
            await ensureBase(ctx);
            // Two configurations that satisfy every gate condition except a usable declaration. Both must
            // keep writing Entity: omitting it against a declaration search will refuse is unrecoverable
            // without a re-embed, so the write side fails safe rather than closed.
            const cases: Array<{ label: string; config: Record<string, unknown>; why: string }> = [
                {
                    label: 'cv8-typo',
                    why: 'declaration missing the `MJ: ` prefix, so it resolves to nothing',
                    config: {
                        VectorEntityName: 'Content Item Chunks',
                        VectorMetadata: { FieldStrategy: 'explicit', Fields: { Name: { Included: true } } },
                    },
                },
                {
                    label: 'cv8-level',
                    why: 'declaration names the ITEM entity while alwaysChunk stores chunk-level vectors',
                    config: {
                        VectorEntityName: 'MJ: Content Items',
                        VectorMetadata: { FieldStrategy: 'explicit', Fields: { Name: { Included: true } } },
                    },
                },
            ];

            for (const c of cases) {
                const { sourceID, contentTypeID } = await makeSource(ctx, c.label, c.config);
                const itemID = await makeItem(ctx, sourceID, contentTypeID, c.label, `Refusal-path content item (${c.label}).`);
                await refreshEngines(ctx);
                resetCaptures();

                await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);

                const meta = soleMeta();
                AssertEqual(meta['Entity'], 'MJ: Content Item Chunks', `${c.label}: Entity kept — ${c.why}`);
                console.log(`      → CV8/${c.label}: Entity kept (${c.why})`);
            }
        }
    },
    {
        Id: 'content-vectorization.CV9',
        Name: 'CV9: a content source another process created after the engine cache loaded still routes, stores and namespaces by its own configuration',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV9') || guardNoPool(ctx, 'CV9')) return;
            await ensureBase(ctx);

            // The production shape: a long-running vectorization worker loaded its KnowledgeHub cache,
            // then ANOTHER process created a source. That row decides where and how its items are
            // stored, and this process can see it only through a stale cache, so each assertion below
            // names a different way that goes wrong.
            //
            // The source's own index routes on a DOTTED namespaceField, the single-hop form production
            // uses to reach a tenant id that lives on the source. CV6 routes on a plain field on the
            // item, so FieldPathResolver never runs there.
            const hop = await ctx.Provider.GetEntityObject<MJVectorIndexEntity>('MJ: Vector Indexes', ctx.User);
            hop.NewRecord(); hop.Name = `${S.Prefix}-index-hop ${MARKER}`;
            hop.EmbeddingModelID = S.EmbeddingModelID; hop.VectorDatabaseID = S.VectorDatabaseID; hop.Dimensions = 1536;
            hop.ProviderConfig = JSON.stringify({ namespaceField: 'ContentSourceID.Name' });
            Assert(await hop.Save(), `vector-index save: ${hop.LatestResult?.CompleteMessage}`);
            S.Created.push({ entity: 'MJ: Vector Indexes', id: hop.ID });

            // The content type routes somewhere ELSE: the base fixture index, whose namespaceField is
            // the plain 'ContentSourceID'. That is where the item lands when the source's override is
            // lost, so the routing assertion can tell the two apart.
            const contentTypeID = await makeContentType(ctx, 'cv9', S.VectorIndexID);

            // Prime the cache with the index and the type while the source does not exist yet.
            await refreshEngines(ctx);
            const { sourceID, sourceName } = await insertSourceBehindEngine(ctx, 'cv9', contentTypeID, hop.ID, { ChunkTextStorage: 'mixed' });
            assertInvisibleToEngine(sourceID);

            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv9-item', 'A content item on a source another process created.');
            resetCaptures();

            await AutotagBaseEngine.Instance.VectorizeContentItems(await loadItems(ctx, [itemID]), ctx.User);

            const up = S.Upserts[S.Upserts.length - 1];
            Assert(!!up, 'the item was upserted at all (a routing refusal writes nothing)');
            // 1. Routing: the SOURCE's own index, not the content type's.
            AssertEqual(up.providerConfig?.['namespaceField'], 'ContentSourceID.Name',
                "upserted through the source's own vector index, not the content type's");
            // 2. Namespace: the dotted path resolved off the source row.
            AssertEqual(up.records[0]?.providerTemporaryDirectives?.['namespace'], sourceName,
                'the dotted namespaceField resolved off the source row');
            // 3. Storage: the source's ChunkTextStorage='mixed' keeps a single-chunk item at item level,
            //    so the item carries the vector id and no chunk row is written. The default
            //    (alwaysChunk) does the opposite; CV1 pins that.
            const item = (await loadItems(ctx, [itemID]))[0];
            const chunks = await loadChunks(ctx, itemID);
            Assert(item.VectorRecordID != null && chunks.length === 0,
                `the source's ChunkTextStorage='mixed' applied: item VectorRecordID=${item.VectorRecordID}, chunk rows=${chunks.length}`);
            console.log("      → CV9: late source routed to its own index, namespace resolved, its storage config applied");
        }
    },
    {
        Id: 'content-vectorization.CV10',
        Name: 'CV10: FieldPathResolver queries a related row its engine cache has never seen instead of reporting it absent',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            if (guardSkip('CV10') || guardNoPool(ctx, 'CV10')) return;
            await ensureBase(ctx);

            // The resolver seam on its own, against the real registry, engine and database. CV9 cannot
            // show it: the vectorization pass reloads the KnowledgeHub cache when it sees the miss, so
            // by the time the resolver runs there the row is cached. Other callers, and hops into other
            // engine-cached entities, get no such reload.
            const contentTypeID = await makeContentType(ctx, 'cv10');
            await refreshEngines(ctx);
            const { sourceID, sourceName } = await insertSourceBehindEngine(ctx, 'cv10', contentTypeID, S.VectorIndexID);
            assertInvisibleToEngine(sourceID);
            // The resolver asks the registry first. Without a full-set cache on offer it would query
            // anyway, and this check would pass on the old code too.
            Assert(BaseEngineRegistry.Instance.TryGetCachedRecords('MJ: Content Sources', { unfilteredOnly: true }) != null,
                "precondition: an engine offers a full-set cache of 'MJ: Content Sources'");

            const itemID = await makeItem(ctx, sourceID, contentTypeID, 'cv10-item', 'FieldPathResolver seam.');
            const resolver = new FieldPathResolver(ctx.Provider, ctx.User, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(await loadItems(ctx, [itemID]), 'ContentSourceID.Name');

            // Before the fix this was undefined: the cache's filtered subset was read as "no such source".
            AssertEqual(values.get(NormalizeUUID(itemID)), sourceName,
                'ContentSourceID.Name resolved for a source the engine cache has never seen');
            console.log('      → CV10: the resolver queried the source its engine cache had never seen');
        }
    }
];

for (const check of ContentVectorizationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('content-vectorization', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        // No rows, no stubs here — a deterministic-only run (RUN_MUTATION_TESTS unset) writes
        // nothing. Just Config the caches and resolve an embedding model + vector DB to borrow.
        S = {
            Skip: false, SkipReason: '', Installed: false, EmbeddingModelID: '', VectorDatabaseID: '',
            BaseBuilt: false, SourceTypeID: '', FileTypeID: '', VectorIndexID: '', Prefix: `mj-cv-${Date.now()}`,
            Created: [], ContentItemIds: [], Upserts: [], DeletedVectorIds: [], EmbedCalls: [],
        };
        await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
        await KnowledgeHubMetadataEngine.Instance.Config(false, ctx.User, ctx.Provider);
        await AutotagBaseEngine.Instance.Config(false, ctx.User, ctx.Provider);
        const idx = AIEngine.Instance.VectorIndexes[0];
        if (!idx?.EmbeddingModelID || !idx?.VectorDatabaseID) {
            S.Skip = true;
            S.SkipReason = 'no Vector Index with an embedding model + vector DB to borrow — content vectorization cannot be exercised';
            return;
        }
        S.EmbeddingModelID = idx.EmbeddingModelID;
        S.VectorDatabaseID = idx.VectorDatabaseID;
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        restoreStubs();
        if (!S) return;
        // Chunk rows first (children of the content items).
        if (S.ContentItemIds.length) {
            const chunks = (await new RunView().RunView<MJContentItemChunkEntity>({
                EntityName: 'MJ: Content Item Chunks', ExtraFilter: `ContentItemID IN (${S.ContentItemIds.map(i => `'${i}'`).join(',')})`, ResultType: 'entity_object',
            }, ctx.User).catch(() => ({ Results: [] as MJContentItemChunkEntity[] }))).Results;
            for (const c of chunks) { await c.Delete().catch(() => undefined); }
        }
        for (const rec of [...S.Created].reverse()) {
            // Dynamic entity name → use the base InnerLoad(CompositeKey); the scalar Load(id) overload
            // lives on generated subclasses, not on BaseEntity.
            const e = await ctx.Provider.GetEntityObject<BaseEntity>(rec.entity, ctx.User).catch(() => undefined);
            if (e && (await e.InnerLoad(CompositeKey.FromID(rec.id)).catch(() => false))) { await e.Delete().catch(() => undefined); }
        }
    }
});

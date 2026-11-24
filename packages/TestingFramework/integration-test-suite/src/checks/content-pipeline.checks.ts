/**
 * content-pipeline.checks.ts — the 'content-pipeline' bundle (CP1–CP15): the content pipeline
 * framework's record lifecycle, end to end, against real rows.
 *
 * TRANSPORT: **SERVER** — the pipeline is a server-side processor; these run in-process against the
 * SQLServerDataProvider (`ctx.Provider`).
 *
 * TIER: deterministic + **RequiresMutation** (each check writes rows; Teardown removes them).
 *
 * WHY THIS BUNDLE EXISTS: every bug found in the second review of the framework sat at a seam
 * between packages — the hydrator not loading the vector receipt Delete reads, Delete not routing
 * to the namespace Embed wrote to, a re-segmentation leaving chunks behind, a metadata-only update
 * sending empty values. Unit tests mock exactly those seams away. Here only two things stand in:
 *
 *   * the SOURCE — a registered Discover driver serving an in-memory document set, so the walk and
 *     the fetch are deterministic and need no network;
 *   * the VECTOR STORE — a registered `VectorDBBase` (`RecordingVectorDB`) that records every id,
 *     namespace and payload it receives, reached through a real `MJ: Vector Databases` row, so the
 *     pipeline's own target resolution and routing run for real.
 *
 * plus the embedding call, stubbed as the rest of the tier stubs it. Everything else — the
 * processor, hydrator, committer, child reconciliation, the stages, the router — is the shipped code.
 *
 * ROUTING is configured exactly as a deployment would: `{"namespaceField":"ContentSourceID"}` on the
 * index. The framework names no tenant field; a layer that routes by organization configures
 * `ContentSourceID.OrganizationID` instead and needs no code.
 *
 * WHAT IS PINNED: CP1 discover creates items and clears ForceDiscovery; CP2 extract + segment
 * produce chunks; CP3 embed writes each chunk's vector under its own id, in its namespace, and
 * records the receipt; CP4 an unchanged re-walk is a no-op; CP5 a changed document re-extracts,
 * and re-segmenting supersedes EVERY old chunk with a fresh set; CP6 Delete removes the superseded
 * vectors in the namespace they were written to and purges the unreferenced rows; CP7 a
 * metadata-only refresh updates in place and sends no values; CP8 deleting an item removes its
 * vectors through its chunks; CP9–CP15 pin the incremental `Since` window, unchanged content
 * re-extract no-op, metadata/Columns in-place vector updates, framework-owned column refusal,
 * nested archive depth limits, `Sync` orphan removal/revival/empty-walk safeguard, and `Access`
 * session resolution plus cross-origin header stripping.
 */
import { gzipSync } from 'node:zlib';
import { BaseEntity, CompositeKey, RunView } from '@memberjunction/core';
import { MJGlobal, RegisterClass, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckContext, IntegrationCheckRegistry, NamedCheck, SkipCheck } from '@memberjunction/testing-integration';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';
import { BaseContentCleaner, type ContentCleaningParams } from '@memberjunction/ai-segmentation';
import {
    BaseResponse,
    IndexList,
    ListVectorIDsResult,
    UpdateOptions,
    VectorDBBase,
    VectorRecord,
} from '@memberjunction/ai-vectordb';
import {
    AccessArtifact,
    AccessRequest,
    BaseAccessDriver,
    ConfidenceScale,
    DiscoverRequest,
    DiscoverWalkEnd,
    LocatorBatchFetchRequest,
    LocatorBatchFetchResult,
    DiscoveredItem,
    LocatorFetchRequest,
    LocatorFetchResponse,
} from '@memberjunction/content-pipeline-base';
import { AutotagBase } from '@memberjunction/content-autotagging';
import {
    LoadContentPipelineExtractors,
    LoadContentPipelineStages,
    PipelineProcessor,
    SessionApplies,
} from '@memberjunction/content-pipeline';
import {
    KnowledgeHubMetadataEngine,
    type MJContentFileTypeEntity,
    type MJContentItemChunkEntity,
    type MJContentItemEntity,
    type MJContentItemTagEntity,
    type MJContentSourceEntity,
    type MJContentSourceTypeEntity,
    type MJContentTypeEntity,
    type MJRecordProcessEntity,
    type MJVectorDatabaseEntity,
    type MJVectorIndexEntity,
} from '@memberjunction/core-entities';

const MARKER = '(mj-integration-test — safe to delete)';
const DRIVER_KEY = 'IT-ContentPipelineSource';
const ACCESS_DRIVER_KEY = 'IT-ContentPipelineAccess';
const VECTOR_DB_KEY = 'IT-RecordingVectorDB';

/** What the recording store saw. */
interface StoreLog {
    Upserts: { id: string; namespace: string | null; hasValues: boolean; metadata: Record<string, unknown> }[];
    Updates: { id: string; namespace: string | null; hasValues: boolean; metadata: Record<string, unknown> }[];
    Deletes: { id: string; namespace: string | null }[];
}
const Store: StoreLog = { Upserts: [], Updates: [], Deletes: [] };

interface SourceDoc {
    Text?: string;
    Bytes?: Uint8Array;
    ModifiedAt: Date;
    Title?: string;
    TitleConfidence?: number;
    Columns?: Record<string, unknown>;
}

/** The documents the test source serves, by URL. Mutated by the checks to simulate change. */
const Documents = new Map<string, SourceDoc>();

/** Access artifacts observed by the source driver and access driver during CP15. */
const AccessLog: {
    ConnectCalls: number;
    DiscoverAccess: (AccessArtifact | null)[];
    FetchAccess: (AccessArtifact | null)[];
} = {
    ConnectCalls: 0,
    DiscoverAccess: [],
    FetchAccess: [],
};

@RegisterClass(BaseAccessDriver, ACCESS_DRIVER_KEY)
export class InMemoryAccessDriver extends BaseAccessDriver {
    public readonly Key = ACCESS_DRIVER_KEY;
    public async Connect(_request: AccessRequest): Promise<AccessArtifact> {
        AccessLog.ConnectCalls += 1;
        return {
            Headers: {
                Authorization: 'Bearer it-secret-token',
                'X-Pipeline-Test-Access': 'it-secret-token',
            },
            QueryParameters: { api_key: 'it-pipeline-query-key' },
        };
    }
}

function namespaceOf(directives?: Record<string, unknown>, providerConfig?: Record<string, unknown>): string | null {
    const ns = directives?.['namespace'] ?? providerConfig?.['namespace'];
    return ns == null ? null : String(ns);
}

/**
 * A vector store that remembers. Mirrors Pinecone's routing rule — `namespaceField` names the source
 * field whose value is the namespace, and a record without it is REJECTED rather than written to the
 * default namespace — so the fail-closed path is exercised too.
 */
@RegisterClass(VectorDBBase, VECTOR_DB_KEY)
export class RecordingVectorDB extends VectorDBBase {
    public override get RequiresAPIKey(): boolean {
        return false;
    }
    public override GetSourceRecordFieldPaths(config: Record<string, unknown>): string[] {
        const field = config['namespaceField'];
        return typeof field === 'string' && field.includes('.') ? [field] : [];
    }
    public override BuildProviderDirectives(source: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
        const field = config['namespaceField'];
        if (typeof field !== 'string') {
            return {};
        }
        const value = source[field];
        if (value == null || String(value).length === 0) {
            throw new Error(`namespaceField '${field}' has no value on this record`);
        }
        return { namespace: String(value) };
    }
    public async CreateRecords(records: VectorRecord[], _index?: string, config?: Record<string, unknown>): Promise<BaseResponse> {
        for (const r of records) {
            Store.Upserts.push({
                id: r.id,
                namespace: namespaceOf(r.providerTemporaryDirectives, config),
                hasValues: Array.isArray(r.values) && r.values.length > 0,
                metadata: { ...(r.metadata ?? {}) },
            });
        }
        return { success: true, message: '', data: null };
    }
    public async UpdateRecords(records: UpdateOptions | UpdateOptions[], _index?: string, config?: Record<string, unknown>): Promise<BaseResponse> {
        for (const r of Array.isArray(records) ? records : [records]) {
            Store.Updates.push({
                id: r.id,
                namespace: namespaceOf(r.providerTemporaryDirectives, config),
                hasValues: Array.isArray(r.values) && r.values.length > 0,
                metadata: { ...(r.metadata ?? {}) },
            });
        }
        return { success: true, message: '', data: null };
    }
    public async DeleteRecords(records: VectorRecord[], _index?: string, config?: Record<string, unknown>): Promise<BaseResponse> {
        for (const r of records) {
            Store.Deletes.push({ id: r.id, namespace: namespaceOf(r.providerTemporaryDirectives, config) });
        }
        return { success: true, message: '', data: null };
    }
    public CreateRecord(r: VectorRecord, i?: string, c?: Record<string, unknown>): Promise<BaseResponse> {
        return this.CreateRecords([r], i, c);
    }
    public UpdateRecord(r: UpdateOptions, i?: string, c?: Record<string, unknown>): Promise<BaseResponse> {
        return this.UpdateRecords([r], i, c);
    }
    public DeleteRecord(r: VectorRecord, i?: string, c?: Record<string, unknown>): Promise<BaseResponse> {
        return this.DeleteRecords([r], i, c);
    }
    private unsupported(): BaseResponse {
        return { success: false, message: 'not used by this bundle', data: null };
    }
    public ListIndexes(): IndexList {
        return { indexes: [] } as unknown as IndexList;
    }
    public GetIndex(): BaseResponse { return this.unsupported(); }
    public CreateIndex(): BaseResponse { return this.unsupported(); }
    public DeleteIndex(): BaseResponse { return this.unsupported(); }
    public EditIndex(): BaseResponse { return this.unsupported(); }
    public QueryIndex(): BaseResponse { return this.unsupported(); }
    public GetRecord(): BaseResponse { return this.unsupported(); }
    public GetRecords(): BaseResponse { return this.unsupported(); }
    public DeleteAllRecords(): BaseResponse { return this.unsupported(); }
    public async ListVectorIDs(): Promise<ListVectorIDsResult> {
        return { IDs: [] };
    }
}

/**
 * How the test driver walks and fetches, beyond listing everything at once. Off unless a check turns it on:
 * `PageSize` walks in parts (a resume token per page), `Gone` reports locators removed, `Batch` fetches a page
 * of items in one call (each call's URLs recorded in `BatchCalls`).
 */
const DriverMode: { PageSize: number; Gone: string[]; Batch: boolean; BatchCalls: string[][] } = { PageSize: 0, Gone: [], Batch: false, BatchCalls: [] };

/** A source serving {@link Documents}: the walk lists them, the fetch reads them back. */
@RegisterClass(AutotagBase, DRIVER_KEY)
export class InMemorySourceDriver extends AutotagBase {
    public override readonly SupportsExhaustiveWalk = true;

    public async *Discover(request: DiscoverRequest): AsyncGenerator<DiscoveredItem, DiscoverWalkEnd | void, undefined> {
        AccessLog.DiscoverAccess.push(request.Access ?? null);
        const confidence = request.Confidence ?? ConfidenceScale;
        const listed = [...Documents].filter(([, doc]) => !request.Since || doc.ModifiedAt > request.Since);
        const start = DriverMode.PageSize > 0 && request.ResumeToken ? Number(request.ResumeToken) : 0;
        const end = DriverMode.PageSize > 0 ? start + DriverMode.PageSize : listed.length;
        for (const url of start === 0 ? DriverMode.Gone : []) {
            yield { URL: url, Removed: true };
        }
        for (const [url, doc] of listed.slice(start, end)) {
            yield {
                URL: url,
                Columns: doc.Columns,
                Fields: [
                    {
                        Field: 'Title',
                        Value: doc.Title ?? url.split('/').pop() ?? url,
                        Confidence: doc.TitleConfidence ?? confidence.DiscoveredTitle,
                    },
                    { Field: 'Date', Value: doc.ModifiedAt, Confidence: confidence.DiscoveredDate },
                ],
            };
        }
        return end < listed.length ? { ResumeToken: String(end) } : undefined;
    }
    public async FetchBatch(request: LocatorBatchFetchRequest): Promise<LocatorBatchFetchResult[]> {
        if (!DriverMode.Batch) {
            return []; // each item is then fetched alone
        }
        AccessLog.FetchAccess.push(request.Access ?? null);
        DriverMode.BatchCalls.push([...request.URLs]);
        return request.URLs.filter((url) => Documents.has(url)).map((url) => {
            const doc = Documents.get(url)!;
            return { URL: url, Response: { Content: doc.Bytes ?? new TextEncoder().encode(doc.Text ?? ''), ResolvedURL: url } };
        });
    }
    public async Fetch(request: LocatorFetchRequest): Promise<LocatorFetchResponse> {
        AccessLog.FetchAccess.push(request.Access ?? null);
        const doc = Documents.get(request.URL);
        if (!doc) {
            throw new Error(`'${request.URL}' not found`);
        }
        const bytes = doc.Bytes ?? new TextEncoder().encode(doc.Text ?? '');
        return { Content: bytes, ResolvedURL: request.URL };
    }
}

/** Bundle state. */
interface BundleState {
    Skip: boolean;
    SkipReason: string;
    EmbeddingModelID: string;
    Prefix: string;
    SourceID: string;
    Created: { entity: string; id: string }[];
    ItemIDs: string[];
    OrigRunEmbedding?: typeof AIEmbeddingRunner.prototype.RunEmbedding;
    FirstChunkIDs: string[];
    InitialChecksumA?: string;
}
let S: BundleState;

const SENTENCE = 'The quarterly report describes revenue, costs and the outlook for the next period. ';
const URL_A = 'it-pipeline://docs/a.txt';
const URL_B = 'it-pipeline://docs/b.txt';
const URL_C = 'it-pipeline://docs/c.txt';
const URL_OLD = 'it-pipeline://docs/old.txt';
const URL_ARCHIVE = 'it-pipeline://docs/nested.txt.gz.gz';
const URL_PAGE = 'it-pipeline://docs/page.html';
const URL_MANIFEST = 'it-pipeline://docs/manifest.csv';
const URL_LINKED = 'it-pipeline://docs/linked.txt';

/** Skips the running check (SkipCheck) when bundle Setup could not provision its fixtures. */
function guardSkip(): void {
    if (S?.Skip) {
        SkipCheck(S.SkipReason);
    }
}

/** The processor over the given stages, configured as a shipped Record Process would be. */
function processor(stages: string[], extraConfig: Record<string, unknown> = {}): PipelineProcessor {
    return new PipelineProcessor({
        Stages: stages,
        IsTest: false,
        // Small windows, so a few paragraphs make several chunks deterministically.
        Configuration: {
            SegmentationOptions: { MaxSegmentTokens: 40, OverlapTokens: 0 },
            ...extraConfig,
        },
    });
}

async function run(
    ctx: IntegrationCheckContext,
    stages: string[],
    recordIDs: string[],
    extraConfig: Record<string, unknown> = {},
): Promise<void> {
    const p = processor(stages, extraConfig);
    const context = { Provider: ctx.Provider, ContextUser: ctx.User };
    if (p.ProcessBatch) {
        const results = await p.ProcessBatch(recordIDs.map((id) => ({ RecordID: id }) as never), context);
        for (const result of results instanceof Map ? results.values() : results) {
            Assert(result.Status !== 'Failed', `${stages.join('>')} failed: ${result.ErrorMessage}`);
        }
        return;
    }
    for (const id of recordIDs) {
        const result = await p.ProcessRecord({ RecordID: id } as never, context);
        Assert(result.Status !== 'Failed', `${stages.join('>')} failed for ${id}: ${result.ErrorMessage}`);
    }
}

async function rows<T>(ctx: IntegrationCheckContext, entity: string, filter: string, orderBy?: string): Promise<T[]> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<T>(
        { EntityName: entity, ExtraFilter: filter, OrderBy: orderBy, ResultType: 'entity_object' },
        ctx.User,
    );
    Assert(result.Success, `RunView ${entity}: ${result.ErrorMessage}`);
    return result.Results;
}

const items = (ctx: IntegrationCheckContext) =>
    rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ContentSourceID='${S.SourceID}'`, 'URL');
const chunksOf = (ctx: IntegrationCheckContext, itemID: string) =>
    rows<MJContentItemChunkEntity>(ctx, 'MJ: Content Item Chunks', `ContentItemID='${itemID}'`, 'Sequence');
const liveChunks = async (ctx: IntegrationCheckContext, itemID: string) =>
    (await chunksOf(ctx, itemID)).filter((c) => c.DeleteStatus == null);
const itemByURL = async (ctx: IntegrationCheckContext, url: string) => {
    const found = (await items(ctx)).filter((i) => i.URL === url && i.DeleteStatus == null);
    AssertEqual(found.length, 1, `exactly one live item for ${url}`);
    return found[0];
};

/** AssertEqual compares by identity, so lists are compared by their contents. */
function AssertSameList(actual: readonly string[], expected: readonly string[], message: string): void {
    AssertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

async function save(entity: BaseEntity, what: string): Promise<void> {
    Assert(await entity.Save(), `${what} save: ${entity.LatestResult?.CompleteMessage}`);
}

async function create<T extends BaseEntity>(ctx: IntegrationCheckContext, entityName: string, init: (e: T) => void): Promise<T> {
    const e = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User);
    e.NewRecord();
    init(e);
    await save(e, entityName);
    S.Created.push({ entity: entityName, id: (e as unknown as { ID: string }).ID });
    return e;
}

/** Source type → file type → vector DB (recording) → index (namespaced) → content type → source. */
async function buildFixture(ctx: IntegrationCheckContext): Promise<void> {
    const sourceType = await create<MJContentSourceTypeEntity>(ctx, 'MJ: Content Source Types', (e) => {
        e.Name = `${S.Prefix}-st ${MARKER}`;
        e.DriverClass = DRIVER_KEY;
    });
    const fileType = await create<MJContentFileTypeEntity>(ctx, 'MJ: Content File Types', (e) => {
        e.Name = `${S.Prefix}-ft ${MARKER}`;
    });
    const database = await create<MJVectorDatabaseEntity>(ctx, 'MJ: Vector Databases', (e) => {
        e.Name = `${S.Prefix}-vdb ${MARKER}`;
        e.ClassKey = VECTOR_DB_KEY;
    });
    const index = await create<MJVectorIndexEntity>(ctx, 'MJ: Vector Indexes', (e) => {
        e.Name = `${S.Prefix}-index ${MARKER}`;
        e.VectorDatabaseID = database.ID;
        e.EmbeddingModelID = S.EmbeddingModelID;
        e.ProviderConfig = JSON.stringify({ namespaceField: 'ContentSourceID' });
    });
    const contentType = await create<MJContentTypeEntity>(ctx, 'MJ: Content Types', (e) => {
        e.Name = `${S.Prefix}-ct ${MARKER}`;
        e.AIModelID = S.EmbeddingModelID;
        e.MinTags = 1;
        e.MaxTags = 5;
        // The cascade takes a content type's index only together with its embedding model.
        e.EmbeddingModelID = S.EmbeddingModelID;
        e.VectorIndexID = index.ID;
    });
    const source = await create<MJContentSourceEntity>(ctx, 'MJ: Content Sources', (e) => {
        e.Name = `${S.Prefix}-src ${MARKER}`;
        e.ContentTypeID = contentType.ID;
        e.ContentSourceTypeID = sourceType.ID;
        e.ContentFileTypeID = fileType.ID;
        e.URL = 'it-pipeline://docs';
        e.ForceDiscovery = true;
    });
    S.SourceID = source.ID;
    await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
    await AIEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
}

function installEmbeddingStub(): void {
    S.OrigRunEmbedding = AIEmbeddingRunner.prototype.RunEmbedding;
    AIEmbeddingRunner.prototype.RunEmbedding = async (params: EmbeddingRunParams): Promise<EmbeddingRunResult> => {
        const count = params.Texts?.length ?? params.Contents?.length ?? 0;
        return {
            Success: true,
            Vectors: Array.from({ length: count }, () => [0.1, 0.2, 0.3]),
            PromptRunID: null,
            TokensUsed: 0,
            Cost: 0,
            ErrorMessage: null,
            ExecutionTimeMs: 0,
        };
    };
}

function resetStore(): void {
    Store.Upserts.length = 0;
    Store.Updates.length = 0;
    Store.Deletes.length = 0;
}

/** CP23's cleaners. Each marks what it returns, so a chunk shows which cleaner Segment chose for its item. */
const SOURCE_FILE_TYPE_CLEANER_KEY = 'IT-SourceFileTypeCleaner';
const SOURCE_DEFAULT_CLEANER_KEY = 'IT-SourceDefaultCleaner';
const SOURCE_FILE_TYPE_MARK = '[source file-type cleaner]';
const SOURCE_DEFAULT_MARK = '[source default cleaner]';

@RegisterClass(BaseContentCleaner, SOURCE_FILE_TYPE_CLEANER_KEY)
export class SourceFileTypeCleaner extends BaseContentCleaner {
    public get Key(): string {
        return SOURCE_FILE_TYPE_CLEANER_KEY;
    }
    protected CleanCore(params: ContentCleaningParams): string {
        return `${SOURCE_FILE_TYPE_MARK} ${params.Content}`;
    }
}

@RegisterClass(BaseContentCleaner, SOURCE_DEFAULT_CLEANER_KEY)
export class SourceDefaultCleaner extends BaseContentCleaner {
    public get Key(): string {
        return SOURCE_DEFAULT_CLEANER_KEY;
    }
    protected CleanCore(params: ContentCleaningParams): string {
        return `${SOURCE_DEFAULT_MARK} ${params.Content}`;
    }
}

export const ContentPipelineChecks: NamedCheck[] = [
    {
        Id: 'content-pipeline.CP1',
        Name: 'CP1: Discover walks the source into Content Items and clears ForceDiscovery only once they are all committed',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            await buildFixture(ctx);
            await run(ctx, ['Discover'], [S.SourceID]);

            const found = await items(ctx);
            AssertSameList(found.map((i) => i.URL ?? ''), [URL_A, URL_B], 'one item per document');
            S.ItemIDs = found.map((i) => i.ID);
            Assert(found.every((i) => i.ExtractionStatus === 'Pending'), 'discovered items wait for Extract');

            const source = (await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', `ID='${S.SourceID}'`))[0];
            AssertEqual(source.ForceDiscovery, false, 'a completed walk clears the one-shot');
            Assert(source.LastDiscoveredAt != null, 'a completed walk records LastDiscoveredAt');
            console.log('      → CP1: 2 items discovered, ForceDiscovery cleared, LastDiscoveredAt set');
        },
    },
    {
        Id: 'content-pipeline.CP2',
        Name: 'CP2: Extract reads each item through its own driver, computes its SHA-256 content checksum, and Segment splits it into chunks',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            await run(ctx, ['Extract'], S.ItemIDs);
            await run(ctx, ['Segment'], S.ItemIDs);

            const a = await itemByURL(ctx, URL_A);
            Assert((a.Text ?? '').startsWith(SENTENCE.trim().split(' ')[0]), 'item A holds the text the driver served');
            Assert(typeof a.Checksum === 'string' && a.Checksum.length === 64, 'Extract computes and persists a SHA-256 content checksum');
            const chunks = await liveChunks(ctx, a.ID);
            Assert(chunks.length > 2, `a long document segments into several chunks, got ${chunks.length}`);
            S.FirstChunkIDs = chunks.map((c) => c.ID);
            AssertEqual(a.EmbeddingStatus, 'Pending', 'the item waits for its chunks to be embedded');
            console.log(`      → CP2: item A extracted and segmented into ${chunks.length} chunks`);
        },
    },
    {
        Id: 'content-pipeline.CP3',
        Name: "CP3: Embed writes each chunk's vector under its own id, in its source's namespace, and records the receipt",
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            resetStore();
            const all = (await Promise.all(S.ItemIDs.map((id) => liveChunks(ctx, id)))).flat();
            Assert(all.length > 0, 'precondition: there are chunks to embed');
            await run(ctx, ['Embed'], all.map((c) => c.ID));

            AssertEqual(Store.Upserts.length, all.length, 'one vector per chunk');
            for (const upsert of Store.Upserts) {
                Assert(UUIDsEqual(upsert.namespace ?? '', S.SourceID), `vector ${upsert.id} written to the source's namespace, got ${upsert.namespace}`);
                Assert(upsert.hasValues, 'a full embed sends values');
                AssertEqual(upsert.metadata['Entity'], 'MJ: Content Item Chunks', 'chunk-identity metadata, as the autotagger writes it');
            }
            const stored = (await Promise.all(S.ItemIDs.map((id) => liveChunks(ctx, id)))).flat();
            Assert(stored.every((c) => c.EmbeddingStatus === 'Complete' && UUIDsEqual(c.VectorRecordID ?? '', c.ID)),
                'every chunk is Complete with its receipt = its own id');
            for (const item of await items(ctx)) {
                AssertEqual(item.EmbeddingStatus, 'Complete', `item ${item.URL} is Complete once its chunks are embedded`);
                Assert(item.LastEmbeddedAt != null, `item ${item.URL} records when it was embedded`);
            }
            console.log(`      → CP3: ${Store.Upserts.length} vectors, all namespaced to the source`);
        },
    },
    {
        Id: 'content-pipeline.CP4',
        Name: 'CP4: an unchanged re-walk is a no-op — unmodified since LastDiscoveredAt, nothing reset',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            await run(ctx, ['Discover'], [S.SourceID]);
            const after = await items(ctx);
            AssertEqual(after.length, 2, 'no duplicate items');
            Assert(after.every((i) => i.ExtractionStatus === 'Complete'), 'nothing was reset for re-extraction');
            console.log('      → CP4: re-walk changed nothing');
        },
    },
    {
        Id: 'content-pipeline.CP5',
        Name: 'CP5: a changed document re-extracts, saves its new SHA-256 checksum, and re-segmenting SUPERSEDES every old chunk',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const previousChecksum = (await itemByURL(ctx, URL_A)).Checksum;
            await new Promise((r) => setTimeout(r, 5));
            Documents.set(URL_A, { Text: SENTENCE.repeat(3), ModifiedAt: new Date() });
            await new Promise((r) => setTimeout(r, 5));
            await run(ctx, ['Discover'], [S.SourceID]);

            let a = await itemByURL(ctx, URL_A);
            AssertEqual(a.ExtractionStatus, 'Pending', 'a changed item yielded after Since is queued for Extract');

            await run(ctx, ['Extract'], [a.ID]);
            a = await itemByURL(ctx, URL_A);
            Assert(
                typeof a.Checksum === 'string' && a.Checksum.length === 64 && a.Checksum !== previousChecksum,
                'the NEW SHA-256 content checksum is saved by Extract',
            );
            AssertEqual(a.SegmentationStatus, 'Pending', 'content checksum change resets SegmentationStatus to Pending');

            await run(ctx, ['Segment'], [a.ID]);
            a = await itemByURL(ctx, URL_A);
            const all = await chunksOf(ctx, a.ID);
            const live = all.filter((c) => c.DeleteStatus == null);
            const pending = all.filter((c) => c.DeleteStatus === 'Pending');
            const firstChunkSet = new UUIDSet(S.FirstChunkIDs);
            Assert(live.length > 0 && live.length < S.FirstChunkIDs.length, `fewer chunks after the edit (${live.length} < ${S.FirstChunkIDs.length})`);
            Assert(live.every((c) => !firstChunkSet.Has(c.ID)), 'the new chunks are new rows, not old ones overwritten');
            AssertSameList(pending.map((c) => c.ID).sort(), [...S.FirstChunkIDs].sort(), 'EVERY previous chunk is marked for deletion');

            await run(ctx, ['Discover'], [S.SourceID]);
            AssertEqual((await itemByURL(ctx, URL_A)).ExtractionStatus, 'Complete', 'the walk after a change is a no-op again');
            console.log(`      → CP5: ${S.FirstChunkIDs.length} chunks superseded by ${live.length}`);
        },
    },
    {
        Id: 'content-pipeline.CP6',
        Name: "CP6: Delete removes the superseded vectors in the namespace they were written to, and purges the unreferenced rows",
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            Assert(S.FirstChunkIDs.length > 0, 'precondition: there are superseded chunks to delete');
            resetStore();
            await run(ctx, ['Delete'], S.FirstChunkIDs);

            AssertSameList(Store.Deletes.map((d) => d.id).sort(), [...S.FirstChunkIDs].sort(), 'exactly the superseded vectors were deleted');
            Assert(Store.Deletes.every((d) => UUIDsEqual(d.namespace ?? '', S.SourceID)), 'each delete was routed to the namespace the write used');
            const a = await itemByURL(ctx, URL_A);
            const left = await chunksOf(ctx, a.ID);
            const firstChunkSet = new UUIDSet(S.FirstChunkIDs);
            Assert(left.every((c) => !firstChunkSet.Has(c.ID)), 'nothing references the superseded chunks, so their rows are gone');
            console.log(`      → CP6: ${Store.Deletes.length} vectors removed in-namespace, rows purged`);
        },
    },
    {
        Id: 'content-pipeline.CP7',
        Name: 'CP7: a metadata-only refresh updates the stored vector in place and sends NO values',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const b = await itemByURL(ctx, URL_B);
            const tag = await ctx.Provider.GetEntityObject<MJContentItemTagEntity>('MJ: Content Item Tags', ctx.User);
            tag.NewRecord();
            tag.ItemID = b.ID;
            tag.Tag = 'it-pipeline-tag';
            await save(tag, 'content item tag');
            S.Created.push({ entity: 'MJ: Content Item Tags', id: tag.ID });

            const chunks = await liveChunks(ctx, b.ID);
            Assert(chunks.length > 0, 'precondition: item B has embedded chunks to refresh');
            for (const c of chunks) {
                c.EmbeddingStatus = 'MetadataOnly';
                await save(c, 'chunk');
            }
            resetStore();
            await run(ctx, ['Embed'], chunks.map((c) => c.ID));

            AssertEqual(Store.Upserts.length, 0, 'no upsert — the vector text did not change');
            AssertEqual(Store.Updates.length, chunks.length, 'one in-place update per chunk');
            for (const u of Store.Updates) {
                Assert(!u.hasValues, `metadata-only update for ${u.id} sent no values`);
                Assert(UUIDsEqual(u.namespace ?? '', S.SourceID), 'the update reached the namespace the vector lives in');
                Assert(Array.isArray(u.metadata['Tags']) && (u.metadata['Tags'] as string[]).includes('it-pipeline-tag'), 'the new tag rides in the metadata');
            }
            console.log(`      → CP7: ${Store.Updates.length} in-place metadata updates, no values sent`);
        },
    },
    {
        Id: 'content-pipeline.CP8',
        Name: 'CP8: deleting an item removes its vectors through its chunks, routed to their namespace',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const b = await itemByURL(ctx, URL_B);
            const chunkIDs = (await liveChunks(ctx, b.ID)).map((c) => c.ID);
            Assert(chunkIDs.length > 0, "precondition: item B has chunks whose vectors must be removed");
            b.DeleteStatus = 'Pending';
            await save(b, 'item');

            await run(ctx, ['DeleteContentItem'], [b.ID]);
            const marked = await chunksOf(ctx, b.ID);
            Assert(marked.every((c) => c.DeleteStatus === 'Pending'), "the item's chunks are marked for deletion");

            resetStore();
            await run(ctx, ['Delete'], chunkIDs);
            AssertSameList(Store.Deletes.map((d) => d.id).sort(), [...chunkIDs].sort(), "every one of the item's vectors was removed");
            Assert(Store.Deletes.every((d) => UUIDsEqual(d.namespace ?? '', S.SourceID)), 'each delete was routed to its namespace');
            const item = (await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ID='${b.ID}'`))[0];
            AssertEqual(item.DeleteStatus, 'Deleted', 'the item is kept as a tombstone');
            console.log(`      → CP8: item deleted, ${chunkIDs.length} vectors removed in-namespace`);
        },
    },
    {
        Id: 'content-pipeline.CP9',
        Name: 'CP9: incremental Discover passes Since (with clock-skew overlap), skips items older than the window, and ingests new items',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const prevDocA = Documents.get(URL_A)!;
            const olderThanWindow = new Date(Date.now() - 120_000);
            Documents.set(URL_A, { Text: SENTENCE.repeat(3), ModifiedAt: olderThanWindow });
            Documents.delete(URL_B);
            Documents.set(URL_OLD, { Text: SENTENCE.repeat(4), ModifiedAt: olderThanWindow });
            Documents.set(URL_C, { Text: SENTENCE.repeat(8), ModifiedAt: new Date() });

            try {
                await run(ctx, ['Discover'], [S.SourceID]);
            } finally {
                Documents.set(URL_A, prevDocA);
                Documents.delete(URL_OLD);
            }
            const allItems = await items(ctx);
            AssertEqual(allItems.some((i) => i.URL === URL_OLD), false, 'item older than LastDiscoveredAt - ClockSkewOverlapMs is filtered out by Since');
            const a = await itemByURL(ctx, URL_A);
            AssertEqual(a.ExtractionStatus, 'Complete', 'unchanged item A stays Complete');

            const c = await itemByURL(ctx, URL_C);
            AssertEqual(c.ExtractionStatus, 'Pending', 'new item C modified after Since is discovered as Pending');

            await run(ctx, ['Extract'], [c.ID]);
            await run(ctx, ['Segment'], [c.ID]);
            const cChunks = await liveChunks(ctx, c.ID);
            Assert(cChunks.length > 0, 'item C segmented into chunks');
            await run(ctx, ['Embed'], cChunks.map((ch) => ch.ID));
            AssertEqual((await itemByURL(ctx, URL_C)).EmbeddingStatus, 'Complete', 'item C is Complete once its chunks are embedded');
            console.log(`      → CP9: incremental Since skipped older item and ingested item C (${cChunks.length} chunks)`);
        },
    },
    {
        Id: 'content-pipeline.CP10',
        Name: 'CP10: re-discovering an item whose ModifiedAt bumped without changing its content re-extracts once, sees the SAME SHA-256 checksum, and leaves downstream stages and chunks untouched',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const beforeC = await itemByURL(ctx, URL_C);
            const beforeChecksum = beforeC.Checksum;
            const beforeChunkIDs = (await liveChunks(ctx, beforeC.ID)).map((ch) => ch.ID);
            Assert(typeof beforeChecksum === 'string' && beforeChecksum.length === 64, 'precondition: item C has a 64-char SHA-256 checksum');

            await new Promise((r) => setTimeout(r, 5));
            Documents.set(URL_C, { Text: SENTENCE.repeat(8), ModifiedAt: new Date() });
            await run(ctx, ['Discover'], [S.SourceID]);

            let c = await itemByURL(ctx, URL_C);
            AssertEqual(c.ExtractionStatus, 'Pending', 'bumped ModifiedAt queues item C for Extract');
            AssertEqual(c.SegmentationStatus, 'Complete', 'SegmentationStatus is not reset before Extract checks the content hash');

            resetStore();
            await run(ctx, ['Extract'], [c.ID]);
            c = await itemByURL(ctx, URL_C);
            AssertEqual(c.ExtractionStatus, 'Complete', 'Extract completes');
            AssertEqual(c.Checksum, beforeChecksum, 'SHA-256 content checksum is unchanged');
            AssertEqual(c.SegmentationStatus, 'Complete', 'unchanged content hash leaves SegmentationStatus Complete');
            const afterChunks = await liveChunks(ctx, c.ID);
            AssertSameList(afterChunks.map((ch) => ch.ID).sort(), [...beforeChunkIDs].sort(), 'existing chunk rows are untouched');
            Assert(afterChunks.every((ch) => ch.EmbeddingStatus === 'Complete'), 'chunk EmbeddingStatus remains Complete');
            console.log('      → CP10: unchanged content re-extract left chunks and downstream statuses untouched');
        },
    },
    {
        Id: 'content-pipeline.CP11',
        Name: 'CP11: metadata-only changes (Title and driver Columns) promote existing chunks to MetadataOnly and update vectors in place without re-segmenting',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const beforeC = await itemByURL(ctx, URL_C);
            const beforeChunkIDs = (await liveChunks(ctx, beforeC.ID)).map((ch) => ch.ID);
            const currentDoc = Documents.get(URL_C)!;
            Documents.set(URL_C, {
                ...currentDoc,
                Title: 'Updated C Title',
                TitleConfidence: ConfidenceScale.DiscoveredTitle,
                Columns: { Description: 'Updated C Description via Columns' },
            });

            await run(ctx, ['Discover'], [S.SourceID]);
            const c = await itemByURL(ctx, URL_C);
            AssertEqual(c.Name, 'Updated C Title', 'Discover updated Title (Name)');
            AssertEqual(c.Description, 'Updated C Description via Columns', 'Discover persisted custom Columns (Description)');
            AssertEqual(c.SegmentationStatus, 'Complete', 'metadata-only change does not reset SegmentationStatus');
            AssertEqual(c.EmbeddingStatus, 'MetadataOnly', 'the embedded item is promoted to MetadataOnly with its chunks');

            const chunks = await liveChunks(ctx, c.ID);
            AssertSameList(chunks.map((ch) => ch.ID).sort(), [...beforeChunkIDs].sort(), 'same chunk rows kept');
            Assert(chunks.every((ch) => ch.EmbeddingStatus === 'MetadataOnly'), 'all live chunks promoted to MetadataOnly');

            resetStore();
            await run(ctx, ['Embed'], chunks.map((ch) => ch.ID));
            AssertEqual(Store.Upserts.length, 0, 'no vector upserts on metadata-only update');
            AssertEqual(Store.Updates.length, chunks.length, 'in-place update for each chunk');
            for (const u of Store.Updates) {
                Assert(!u.hasValues, `in-place update for ${u.id} sent no vector values`);
                AssertEqual(u.metadata['Title'], 'Updated C Title', 'updated Title rides in vector metadata');
                AssertEqual(u.metadata['Description'], 'Updated C Description via Columns', 'updated Description from Columns rides in vector metadata');
            }
            AssertEqual((await itemByURL(ctx, URL_C)).EmbeddingStatus, 'Complete', 'the item is Complete again once its chunks are refreshed');
            console.log(`      → CP11: Title + Columns updated ${Store.Updates.length} vectors in place`);
        },
    },
    {
        Id: 'content-pipeline.CP16',
        Name: 'CP16: the Settle Item Embedding process selects an item whose settle was missed (and not one still embedding), and its stage settles it',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const c = await itemByURL(ctx, URL_C);
            AssertEqual(c.EmbeddingStatus, 'Complete', 'precondition: item C is settled');
            // What a process stopped between committing the last chunks and settling the item leaves behind.
            c.EmbeddingStatus = 'Pending';
            await save(c, 'item');

            const [process] = await rows<MJRecordProcessEntity>(ctx, 'MJ: Record Processes', `Name LIKE '%Settle Item Embedding'`);
            Assert(!!process?.ScopeFilter, 'the Settle Item Embedding Record Process is installed');
            const selected = async () =>
                (await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `(${process.ScopeFilter}) AND ContentSourceID='${S.SourceID}'`)).map((i) => i.ID);
            const before = await selected();
            Assert(before.some((id) => UUIDsEqual(id, c.ID)), 'its filter selects the unsettled item');
            const a = await itemByURL(ctx, URL_A);
            Assert((await liveChunks(ctx, a.ID)).some((ch) => ch.EmbeddingStatus === 'Pending'), 'precondition: item A has chunks still to embed');
            Assert(!before.some((id) => UUIDsEqual(id, a.ID)), 'its filter leaves an item whose chunks are still to embed');

            await run(ctx, ['SettleItemEmbedding'], before);
            AssertEqual((await itemByURL(ctx, URL_C)).EmbeddingStatus, 'Complete', 'the stage settles the item from its chunks');
            Assert(!(await selected()).some((id) => UUIDsEqual(id, c.ID)), 'and the filter no longer selects it');
            console.log(`      → CP16: the sweep selected ${before.length} item(s) and settled item C`);
        },
    },
    {
        Id: 'content-pipeline.CP12',
        Name: 'CP12: WorkingRecordCommitter refuses driver Columns that target framework-owned status or checksum columns',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const prevDoc = Documents.get(URL_C)!;
            Documents.set(URL_C, {
                ...prevDoc,
                ModifiedAt: new Date(),
                Columns: { ExtractionStatus: 'Complete' },
            });

            try {
                const p = processor(['Discover']);
                const res = await p.ProcessRecord({ RecordID: S.SourceID } as never, { Provider: ctx.Provider, ContextUser: ctx.User });
                AssertEqual(res.Status, 'Failed', 'Discover fails when driver Columns attempts to overwrite a framework-owned column');
                Assert(
                    (res.ErrorMessage ?? '').includes('owned by the pipeline framework'),
                    `expected framework-owned column refusal message, got: ${res.ErrorMessage}`,
                );
            } finally {
                Documents.set(URL_C, prevDoc);
            }
            console.log('      → CP12: framework-owned column in Columns refused');
        },
    },
    {
        Id: 'content-pipeline.CP13',
        Name: 'CP13: ArchiveExtractor refuses nested archives that exceed MaxArchiveDepth',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const nestedGzip = gzipSync(gzipSync(Buffer.from('deeply nested archive payload', 'utf8')));
            Documents.set(URL_ARCHIVE, { Bytes: new Uint8Array(nestedGzip), ModifiedAt: new Date() });

            let archiveItemID: string | undefined;
            try {
                await run(ctx, ['Discover'], [S.SourceID]);
                const archiveItem = await itemByURL(ctx, URL_ARCHIVE);
                archiveItemID = archiveItem.ID;

                const p = processor(['Extract'], {
                    ExtractorKey: 'Archive',
                    Tuning: { MaxArchiveDepth: 1, MaxArchiveMembers: 10, MaxArchiveBytes: 1024 * 1024 },
                });
                const res = await p.ProcessRecord({ RecordID: archiveItem.ID } as never, { Provider: ctx.Provider, ContextUser: ctx.User });
                AssertEqual(res.Status, 'Failed', 'nested archive exceeding MaxArchiveDepth fails closed');
                Assert(
                    (res.ErrorMessage ?? '').includes('archive nesting depth'),
                    `expected archive nesting depth refusal, got: ${res.ErrorMessage}`,
                );
            } finally {
                Documents.delete(URL_ARCHIVE);
                if (archiveItemID) {
                    const reloaded = (await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ID='${archiveItemID}'`))[0];
                    if (reloaded) {
                        await reloaded.Delete();
                    }
                }
            }
            console.log('      → CP13: nested archive exceeding MaxArchiveDepth refused');
        },
    },
    {
        Id: 'content-pipeline.CP19',
        Name: 'CP19: a manifest expands into child items with ParentID: text rows are complete, a link row is fetched by its own Extract, and a row dropped from the manifest is retired',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const manifest = (rows: string[]) => ['Link,Body,Title', ...rows].join('\n');
            const linkRow = `${URL_LINKED},,Linked document`;
            const textRow = `,"${SENTENCE.trim()}",Inline policy`;
            const extract = {
                ExtractorKey: 'Manifest',
                ExtractorOptions: { Manifest: { LinkColumn: 'Link', TextColumn: 'Body', TitleColumn: 'Title' } },
                Tuning: { MaxArchiveMembers: 100 },
            };
            Documents.set(URL_MANIFEST, { Text: manifest([linkRow, textRow]), ModifiedAt: new Date() });

            let manifestID: string | undefined;
            try {
                await run(ctx, ['Discover'], [S.SourceID]);
                manifestID = (await itemByURL(ctx, URL_MANIFEST)).ID;
                // The linked document is reachable at its link, but is not one of the source's own listings.
                Documents.set(URL_LINKED, { Text: SENTENCE.repeat(2), ModifiedAt: new Date() });
                await run(ctx, ['Extract'], [manifestID], extract);

                const children = await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ParentID='${manifestID}' AND DeleteStatus IS NULL`, 'URL');
                AssertEqual(children.length, 2, 'one child item per manifest row');
                const linked = children.find((c) => c.URL === URL_LINKED);
                const inline = children.find((c) => c.URL === `${URL_MANIFEST}#row-2`);
                Assert(!!linked && !!inline, `children are at the row's link, or the manifest's URL for a text row (got ${children.map((c) => c.URL).join(', ')})`);
                AssertEqual(inline!.ExtractionStatus, 'Complete', 'a row with text is complete as listed');
                AssertEqual(inline!.Name, 'Inline policy', "the row's title column");
                AssertEqual(linked!.ExtractionStatus, 'Pending', 'a link row waits for its own Extract');

                await run(ctx, ['Extract'], [linked!.ID]);
                const fetched = (await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ID='${linked!.ID}'`))[0];
                AssertEqual(fetched.ExtractionStatus, 'Complete', 'the link row is fetched and read by its own Extract');
                Assert((fetched.Text ?? '').startsWith(SENTENCE.trim().split(' ')[0]), 'with the text served at its link');
                AssertEqual(fetched.Name, 'Linked document', "keeping the manifest's title");

                Documents.set(URL_MANIFEST, { Text: manifest([textRow]), ModifiedAt: new Date() });
                await run(ctx, ['Extract'], [manifestID], extract);
                const retired = (await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ID='${linked!.ID}'`))[0];
                AssertEqual(retired.DeleteStatus, 'Pending', 'a row dropped from the manifest is marked for deletion');
                console.log('      → CP19: manifest expanded into 2 children, link row fetched, dropped row retired');
            } finally {
                Documents.delete(URL_MANIFEST);
                Documents.delete(URL_LINKED);
                if (manifestID) {
                    for (const child of await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ParentID='${manifestID}'`)) {
                        for (const chunk of await chunksOf(ctx, child.ID)) {
                            await chunk.Delete();
                        }
                        await child.Delete();
                    }
                    const reloaded = (await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ID='${manifestID}'`))[0];
                    if (reloaded) {
                        await reloaded.Delete();
                    }
                }
            }
        },
    },
    {
        Id: 'content-pipeline.CP17',
        Name: "CP17: Extract stores an HTML page as served, and Segment cleans it with the configured selectors before splitting, so chunks hold the article and none of the page's chrome",
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const page =
                '<!doctype html><html><head><title>Quarterly report</title></head><body>' +
                '<nav>Home | Members | Events</nav><div class="promo">Join today and save</div>' +
                `<div class="article-body"><p>${SENTENCE.trim()}</p><p>Revenue rose this quarter.</p></div>` +
                '<footer>Copyright Example Association</footer></body></html>';
            Documents.set(URL_PAGE, { Text: page, ModifiedAt: new Date() });

            let pageItemID: string | undefined;
            try {
                await run(ctx, ['Discover'], [S.SourceID]);
                pageItemID = (await itemByURL(ctx, URL_PAGE)).ID;
                await run(ctx, ['Extract'], [pageItemID]);
                const extracted = await itemByURL(ctx, URL_PAGE);
                AssertEqual(extracted.ExtractorKey, 'Html', 'the page was read by the Html extractor');
                Assert((extracted.Text ?? '').includes('<div class="article-body">'), 'Extract stores the page with its markup');

                await run(ctx, ['Segment'], [pageItemID], { CleaningOptions: { IncludeSelectors: ['.article-body'] } });
                const text = (await liveChunks(ctx, pageItemID)).map((c) => c.Text ?? '').join(' ');
                Assert(text.includes('Revenue rose this quarter.'), 'the article reaches the chunks');
                Assert(!text.includes('<'), 'no markup reaches the chunks');
                for (const chrome of ['Home | Members', 'Join today', 'Copyright']) {
                    Assert(!text.includes(chrome), `'${chrome}' (outside the article) is cleaned away`);
                }
                AssertEqual((await itemByURL(ctx, URL_PAGE)).Text, extracted.Text, 'cleaning does not change what Extract stored');
                console.log('      → CP17: page stored with markup, chunks hold only the article');
            } finally {
                Documents.delete(URL_PAGE);
                if (pageItemID) {
                    for (const chunk of await chunksOf(ctx, pageItemID)) {
                        await chunk.Delete();
                    }
                    const reloaded = (await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ID='${pageItemID}'`))[0];
                    if (reloaded) {
                        await reloaded.Delete();
                    }
                }
            }
        },
    },
    {
        Id: 'content-pipeline.CP14',
        Name: 'CP14: Sync walks exhaustively, refuses to orphan items on an empty walk, marks removed items Pending delete, revives reappearing items, and updates LastSyncedAt',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const savedA = Documents.get(URL_A)!;
            const savedC = Documents.get(URL_C)!;
            const syncConfig = { Mode: 'Sync', Tuning: { ClockSkewOverlapMs: 0 } };
            const syncScopeFilter = `ID='${S.SourceID}' AND (LastSyncedAt IS NULL OR LastSyncedAt < DATEADD(day, -30, GETUTCDATE()))`;

            const dueBefore = await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', syncScopeFilter);
            AssertEqual(dueBefore.length, 1, 'source with LastSyncedAt IS NULL is selected by the shipped Sync ScopeFilter');

            // 1. Empty-walk safeguard: if the source returns 0 items when active items exist, Sync fails closed.
            Documents.clear();
            const emptySync = processor(['Discover'], syncConfig);
            const emptyRes = await emptySync.ProcessRecord(
                { RecordID: S.SourceID } as never,
                { Provider: ctx.Provider, ContextUser: ctx.User },
            );
            AssertEqual(emptyRes.Status, 'Failed', 'empty Sync walk fails closed when live items exist');
            Assert(
                (emptyRes.ErrorMessage ?? '').includes('refusing to mark existing items for deletion'),
                `expected empty-walk safeguard message, got: ${emptyRes.ErrorMessage}`,
            );
            const afterEmpty = await items(ctx);
            Assert(
                afterEmpty.filter((i) => i.URL === URL_A || i.URL === URL_C).every((i) => i.DeleteStatus == null),
                'empty-walk safeguard kept existing active items from being marked Pending delete',
            );

            // 2. Exhaustive Sync with URL_C removed marks URL_C as DeleteStatus=Pending and leaves ForceDiscovery untouched.
            const sourceBefore = (await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', `ID='${S.SourceID}'`))[0];
            sourceBefore.ForceDiscovery = true;
            await save(sourceBefore, 'source ForceDiscovery=true before Sync');

            Documents.set(URL_A, savedA);
            await run(ctx, ['Discover'], [S.SourceID], syncConfig);

            const sourceAfter = (await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', `ID='${S.SourceID}'`))[0];
            Assert(sourceAfter.LastSyncedAt != null, 'Sync records LastSyncedAt on the Content Source');
            AssertEqual(sourceAfter.ForceDiscovery, true, 'Sync does NOT clear ForceDiscovery (which belongs to Discover)');
            const dueAfter = await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', syncScopeFilter);
            AssertEqual(dueAfter.length, 0, 'Sync ScopeFilter ignores ForceDiscovery and skips recently synced sources');
            sourceAfter.ForceDiscovery = false;
            await save(sourceAfter, 'reset ForceDiscovery after check');

            const cRemoved = (await items(ctx)).find((i) => i.URL === URL_C)!;
            AssertEqual(cRemoved.DeleteStatus, 'Pending', 'missing item C is marked DeleteStatus=Pending by Sync');
            const aKept = await itemByURL(ctx, URL_A);
            AssertEqual(aKept.ExtractionStatus, 'Complete', 'present item A is untouched by Sync');

            // 3. Revival: URL_C reappears before Delete runs; Sync clears DeleteStatus and queues it for re-extraction.
            Documents.set(URL_C, { ...savedC, ModifiedAt: new Date() });
            await run(ctx, ['Discover'], [S.SourceID], syncConfig);
            const cRevived = await itemByURL(ctx, URL_C);
            AssertEqual(cRevived.DeleteStatus, null, 'reappearing item C has DeleteStatus cleared');
            AssertEqual(cRevived.ExtractionStatus, 'Pending', 'revived item C is queued for re-extraction');
            await run(ctx, ['Extract'], [cRevived.ID]);

            // 4. Full removal: URL_C disappears again; Sync marks it Pending, and DeleteContentItem + Delete remove its vectors.
            const cChunkIDs = (await liveChunks(ctx, cRevived.ID)).map((ch) => ch.ID);
            Assert(cChunkIDs.length > 0, 'precondition: revived item C still has its embedded chunks');
            Documents.delete(URL_C);
            await run(ctx, ['Discover'], [S.SourceID], syncConfig);
            await run(ctx, ['DeleteContentItem'], [cRevived.ID]);
            resetStore();
            await run(ctx, ['Delete'], cChunkIDs);
            AssertSameList(Store.Deletes.map((d) => d.id).sort(), [...cChunkIDs].sort(), 'Sync-removed item C had all its vectors deleted');
            console.log('      → CP14: Sync ScopeFilter, empty-walk safeguard, orphan removal, ForceDiscovery preservation, and revival verified');
        },
    },
    {
        Id: 'content-pipeline.CP15',
        Name: 'CP15: AccessResolver opens the configured BaseAccessDriver session for Discover and Extract, and SessionApplies strips session headers on cross-origin requests',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const source = (await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', `ID='${S.SourceID}'`))[0];
            source.Configuration = JSON.stringify({
                AccessDriverKey: ACCESS_DRIVER_KEY,
            });
            await save(source, 'source Access configuration');
            await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);

            AccessLog.ConnectCalls = 0;
            AccessLog.DiscoverAccess.length = 0;
            AccessLog.FetchAccess.length = 0;

            const a = await itemByURL(ctx, URL_A);
            await run(ctx, ['Discover'], [S.SourceID]);
            await run(ctx, ['Extract'], [a.ID]);

            Assert(AccessLog.ConnectCalls > 0, 'InMemoryAccessDriver.Connect was invoked');
            Assert(AccessLog.DiscoverAccess.length > 0, 'Discover received an Access resolution call');
            const discoverSession = AccessLog.DiscoverAccess[AccessLog.DiscoverAccess.length - 1];
            AssertEqual(discoverSession?.Headers?.['Authorization'], 'Bearer it-secret-token', 'Discover received Bearer token from Access driver');
            AssertEqual(discoverSession?.Headers?.['X-Pipeline-Test-Access'], 'it-secret-token', 'Discover received custom header from Access driver');

            Assert(AccessLog.FetchAccess.length > 0, 'Extract (Fetch) received an Access resolution call');
            const fetchSession = AccessLog.FetchAccess[AccessLog.FetchAccess.length - 1];
            AssertEqual(fetchSession?.Headers?.['Authorization'], 'Bearer it-secret-token', 'Extract received Bearer token from Access driver');

            const abortController = new AbortController();
            AssertEqual(
                SessionApplies({
                    URL: 'https://docs.example.com/articles/1',
                    SourceURL: 'https://docs.example.com/root',
                    Access: discoverSession,
                    Signal: abortController.signal,
                }),
                true,
                'SessionApplies attaches session headers on same-origin requests',
            );
            AssertEqual(
                SessionApplies({
                    URL: 'https://cdn.other-domain.example.org/asset.txt',
                    SourceURL: 'https://docs.example.com/root',
                    Access: discoverSession,
                    Signal: abortController.signal,
                }),
                false,
                'SessionApplies strips session headers on cross-origin requests',
            );
            console.log('      → CP15: Access session reached Discover + Extract and stripped on cross-origin URLs');
        },
    },
    {
        Id: 'content-pipeline.CP20',
        Name: "CP20: a Discover walk in parts keeps its state on the source and stays due until it finishes, then stamps the first part's start; a locator the driver reports gone is marked for deletion",
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const urls = ['it-pipeline://docs/part-1.txt', 'it-pipeline://docs/part-2.txt', 'it-pipeline://docs/part-3.txt'];
            await new Promise((r) => setTimeout(r, 5));
            for (const url of urls) {
                Documents.set(url, { Text: SENTENCE.repeat(2), ModifiedAt: new Date() });
            }
            const source = async () => (await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', `ID='${S.SourceID}'`))[0];
            const before = await source();
            DriverMode.PageSize = 1;
            try {
                await run(ctx, ['Discover'], [S.SourceID]);
                const afterFirst = await source();
                const state = afterFirst.DiscoverStateObject;
                Assert(!!state?.ResumeToken, 'an unfinished walk keeps its resume token on the source');
                AssertEqual(state!.Mode, 'Discover', 'and the mode it runs in');
                AssertEqual(String(afterFirst.LastDiscoveredAt), String(before.LastDiscoveredAt), 'LastDiscoveredAt waits for the walk to finish');

                let parts = 1;
                while ((await source()).DiscoverState && parts < 10) {
                    await run(ctx, ['Discover'], [S.SourceID]);
                    parts++;
                }
                const finished = await source();
                AssertEqual(finished.DiscoverState, null, 'a finished walk clears its state');
                Assert(parts >= 3, `the walk took one part per page (${parts})`);
                AssertEqual(new Date(finished.LastDiscoveredAt!).toISOString(), state!.WalkStartedAt, "LastDiscoveredAt takes the first part's start");
                const found = (await items(ctx)).filter((i) => urls.includes(i.URL ?? ''));
                AssertEqual(found.length, 3, 'every page of the walk was found across its parts');

                DriverMode.PageSize = 0;
                DriverMode.Gone = [urls[0]];
                await run(ctx, ['Discover'], [S.SourceID]);
                const gone = (await items(ctx)).find((i) => i.URL === urls[0]);
                AssertEqual(gone?.DeleteStatus, 'Pending', 'the item the driver reported gone is marked for deletion');
                console.log(`      → CP20: walk in ${parts} parts, state cleared, LastDiscoveredAt = first part's start, reported removal marked`);
            } finally {
                DriverMode.PageSize = 0;
                DriverMode.Gone = [];
                urls.forEach((u) => Documents.delete(u));
            }
        },
    },
    {
        Id: 'content-pipeline.CP21',
        Name: "CP21: Extract fetches a page of a source's items in one driver call when the driver can",
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const urls = ['it-pipeline://docs/batch-1.txt', 'it-pipeline://docs/batch-2.txt'];
            await new Promise((r) => setTimeout(r, 5));
            urls.forEach((u, i) => Documents.set(u, { Text: `${SENTENCE.repeat(2)} batch ${i}`, ModifiedAt: new Date() }));
            DriverMode.Batch = true;
            DriverMode.BatchCalls.length = 0;
            try {
                await run(ctx, ['Discover'], [S.SourceID]);
                const ids = (await items(ctx)).filter((i) => urls.includes(i.URL ?? '')).map((i) => i.ID);
                AssertEqual(ids.length, 2, 'precondition: both items discovered');
                await run(ctx, ['Extract'], ids);
                AssertEqual(DriverMode.BatchCalls.length, 1, 'one batch call for the page');
                AssertSameList([...DriverMode.BatchCalls[0]].sort(), [...urls].sort(), 'with both items in it');
                for (const url of urls) {
                    const item = await itemByURL(ctx, url);
                    AssertEqual(item.ExtractionStatus, 'Complete', `${url} was read from the batch`);
                    Assert((item.Text ?? '').includes('batch'), 'with the text the batch returned');
                }
                console.log('      → CP21: 2 items fetched in 1 driver call');
            } finally {
                DriverMode.Batch = false;
                urls.forEach((u) => Documents.delete(u));
            }
        },
    },
    {
        Id: 'content-pipeline.CP22',
        Name: 'CP22: a vector metadata field can be written under its own key and added to the curated default (Date as ContentDate, epoch seconds)',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const url = 'it-pipeline://docs/dated.txt';
            const published = new Date('2026-03-01T00:00:00.000Z');
            await new Promise((r) => setTimeout(r, 5));
            Documents.set(url, { Text: SENTENCE.repeat(3), ModifiedAt: new Date() });
            const source = (await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', `ID='${S.SourceID}'`))[0];
            const original = source.Configuration;
            source.Configuration = JSON.stringify({
                ...(original ? JSON.parse(original) : {}),
                VectorMetadata: { Fields: { Date: { Included: true, StoreAs: 'epochSeconds', MetadataKey: 'ContentDate' } } },
            });
            await save(source, 'source with a metadata key');
            await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
            try {
                await run(ctx, ['Discover'], [S.SourceID]);
                const item = await itemByURL(ctx, url);
                item.Date = published;
                await save(item, 'dated item');
                await run(ctx, ['Extract'], [item.ID]);
                await run(ctx, ['Segment'], [item.ID]);
                const chunks = await liveChunks(ctx, item.ID);
                resetStore();
                await run(ctx, ['Embed'], chunks.map((c) => c.ID));
                Assert(Store.Upserts.length > 0, 'the item was embedded');
                for (const upsert of Store.Upserts) {
                    AssertEqual(upsert.metadata['ContentDate'], Math.floor(published.getTime() / 1000), 'the date is written as ContentDate, in epoch seconds');
                    AssertEqual(upsert.metadata['Date'], undefined, 'and not under its own name');
                    Assert(typeof upsert.metadata['Title'] === 'string', 'the curated set is still there');
                }
                console.log(`      → CP22: ContentDate on ${Store.Upserts.length} vectors`);
            } finally {
                source.Configuration = original;
                await save(source, 'restore source Configuration');
                await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
                Documents.delete(url);
            }
        },
    },
    {
        Id: 'content-pipeline.CP23',
        Name: "CP23: Segment cleans each item of one source by its detected file type — the source's entry for the type, then the content type's, then the source's default",
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            guardSkip();
            const urls = {
                Page: 'it-pipeline://mixed/page.html',
                Notes: 'it-pipeline://mixed/notes.txt',
                Readme: 'it-pipeline://mixed/readme.md',
            };
            const page =
                '<!doctype html><html><body><nav>Home | Members</nav>' +
                `<div class="article-body"><p>${SENTENCE.trim()}</p></div><footer>Copyright</footer></body></html>`;
            Documents.set(urls.Page, { Text: page, ModifiedAt: new Date() });
            Documents.set(urls.Notes, { Text: SENTENCE.repeat(2), ModifiedAt: new Date() });
            Documents.set(urls.Readme, { Text: SENTENCE.repeat(2), ModifiedAt: new Date() });

            const source = (await rows<MJContentSourceEntity>(ctx, 'MJ: Content Sources', `ID='${S.SourceID}'`))[0];
            const contentType = (await rows<MJContentTypeEntity>(ctx, 'MJ: Content Types', `ID='${source.ContentTypeID}'`))[0];
            const original = { SourceConfiguration: source.Configuration, SourceCleanerKey: source.CleanerKey, TypeConfiguration: contentType.Configuration };
            // The content type's standard cleaners; the source overrides txt and names its own default.
            contentType.Configuration = JSON.stringify({ Cleaners: { html: 'Html', txt: 'PlainText' } });
            source.Configuration = JSON.stringify({
                ...(original.SourceConfiguration ? JSON.parse(original.SourceConfiguration) : {}),
                Cleaners: { txt: SOURCE_FILE_TYPE_CLEANER_KEY },
            });
            source.CleanerKey = SOURCE_DEFAULT_CLEANER_KEY;
            await save(contentType, 'content type with standard cleaners');
            await save(source, 'source with a file-type cleaner and a default');
            await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
            try {
                await run(ctx, ['Discover'], [S.SourceID]);
                const ids = { Page: (await itemByURL(ctx, urls.Page)).ID, Notes: (await itemByURL(ctx, urls.Notes)).ID, Readme: (await itemByURL(ctx, urls.Readme)).ID };
                await run(ctx, ['Extract'], Object.values(ids));
                // Segment runs on items loaded back from the database, whose file type is the Content File Type's NAME.
                for (const [key, fileType] of [['Page', 'HTML'], ['Notes', 'TXT'], ['Readme', 'MD']] as const) {
                    AssertEqual((await itemByURL(ctx, urls[key])).ContentFileType, fileType, `Extract detected ${urls[key]} as ${fileType}`);
                }
                await run(ctx, ['Segment'], Object.values(ids));

                const textOf = async (id: string) => (await liveChunks(ctx, id)).map((c) => c.Text ?? '').join(' ');
                const pageText = await textOf(ids.Page);
                Assert(pageText.includes('quarterly report') && !pageText.includes('<') && !pageText.includes('Home | Members'), "html: the content type's Html cleaner ran");
                Assert(!pageText.includes(SOURCE_DEFAULT_MARK), "html: the content type's entry for the file type beats the source's default");
                Assert((await textOf(ids.Notes)).startsWith(SOURCE_FILE_TYPE_MARK), "txt: the source's own entry for the file type beats the content type's");
                Assert((await textOf(ids.Readme)).startsWith(SOURCE_DEFAULT_MARK), "md: no map names it, so the source's default ran");
                console.log('      → CP23: html → Html (content type), txt → source entry, md → source default');
            } finally {
                contentType.Configuration = original.TypeConfiguration;
                source.Configuration = original.SourceConfiguration;
                source.CleanerKey = original.SourceCleanerKey;
                await save(contentType, 'restore content type Configuration');
                await save(source, 'restore source cleaner settings');
                await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
                Object.values(urls).forEach((u) => Documents.delete(u));
            }
        },
    },
];

for (const check of ContentPipelineChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('content-pipeline', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        S = { Skip: false, SkipReason: '', EmbeddingModelID: '', Prefix: `mj-cp-${Date.now()}`, SourceID: '', Created: [], ItemIDs: [], FirstChunkIDs: [] };
        LoadContentPipelineStages();
        LoadContentPipelineExtractors();
        AccessLog.DiscoverAccess.length = 0;
        AccessLog.FetchAccess.length = 0;
        Documents.clear();
        const initialModifiedAt = new Date(Date.now() - 120_000);
        Documents.set(URL_A, { Text: SENTENCE.repeat(40), ModifiedAt: initialModifiedAt });
        Documents.set(URL_B, { Text: SENTENCE.repeat(8), ModifiedAt: initialModifiedAt });
        await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
        const model = AIEngine.Instance.VectorIndexes[0]?.EmbeddingModelID;
        if (!model) {
            S.Skip = true;
            S.SkipReason = 'no Vector Index with an embedding model to borrow — the Vector Index row needs one';
            return;
        }
        S.EmbeddingModelID = model;
        Assert(
            MJGlobal.Instance.ClassFactory.GetRegistration(VectorDBBase, VECTOR_DB_KEY) != null,
            'the recording vector store is registered',
        );
        installEmbeddingStub();
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        if (!S) return;
        if (S.OrigRunEmbedding) {
            AIEmbeddingRunner.prototype.RunEmbedding = S.OrigRunEmbedding;
        }
        if (S.SourceID) {
            // Children first: tags, chunks, items, then the fixture chain in reverse.
            const itemRows = await rows<MJContentItemEntity>(ctx, 'MJ: Content Items', `ContentSourceID='${S.SourceID}'`).catch(() => []);
            for (const item of itemRows) {
                for (const tag of await rows<BaseEntity>(ctx, 'MJ: Content Item Tags', `ItemID='${item.ID}'`).catch(() => [])) {
                    await tag.Delete().catch(() => undefined);
                }
                for (const chunk of await chunksOf(ctx, item.ID).catch(() => [])) {
                    await chunk.Delete().catch(() => undefined);
                }
            }
            for (const item of itemRows) {
                await item.Delete().catch(() => undefined);
            }
        }
        for (const rec of [...S.Created].reverse()) {
            const e = await ctx.Provider.GetEntityObject<BaseEntity>(rec.entity, ctx.User).catch(() => undefined);
            if (e && (await e.InnerLoad(CompositeKey.FromID(rec.id)).catch(() => false))) {
                await e.Delete().catch(() => undefined);
            }
        }
    },
});

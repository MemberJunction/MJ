/**
 * @fileoverview Where a content item's vectors live, resolved one way for every writer.
 *
 * The autotagger and the content pipeline's Embed and Delete stages all need the same answers for an
 * item: its embedding model and vector index (Content Source pair → Content Type pair → the first
 * index), the `VectorDBBase` that reaches it, and the provider directives (a namespace, say) that
 * route its record. This is the one implementation; all three call it.
 *
 * @module @memberjunction/content-autotagging
 */

import { BaseEntity, FieldValueCollection, IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import {
    KnowledgeHubMetadataEngine,
    MJContentItemEntity,
    MJVectorDatabaseEntity,
    MJVectorIndexEntity,
} from '@memberjunction/core-entities';
import { MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { CredentialEngine } from '@memberjunction/credentials';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { FieldPathResolver } from './FieldPathResolver';
import { RateLimiter } from './RateLimiter';

/**
 * Resolved vector infrastructure for one (embedding model, vector index) pair.
 */
export interface ResolvedVectorInfrastructure {
    /**
     * @deprecated Embedding goes through AIEmbeddingRunner, pinned to {@link embeddingModelID}. For
     * older callers this is still a working driver, built on first read with the legacy
     * environment-variable key.
     */
    embedding?: BaseEmbeddings;
    vectorDB: VectorDBBase;
    /** The name the provider knows the index by (`AIEngine.GetProviderIndexName`). */
    indexName: string;
    embeddingModelName: string;
    /** The embedding model every call for this index pins, so the index holds one model's vectors. */
    embeddingModelID: string;
    /** Reduced dimensions from `MJ: Vector Indexes.Dimensions`; undefined means the model's native size. */
    dimensions?: number;
    /** Parsed `MJ: Vector Indexes.ProviderConfig`; undefined when absent or not valid JSON. */
    providerConfig?: Record<string, unknown>;
}

/** Each item's provider directives (keyed by normalized item ID), and the items the provider refused. */
export interface ProviderDirectiveResult {
    Directives: Map<string, Record<string, unknown> | undefined>;
    Rejected: { Item: MJContentItemEntity; Reason: string }[];
}

/** Group-key part meaning "no explicit pair — use the first vector index". */
const DEFAULT_PART = 'default';
/** Records per vector-DB upsert call. */
const UPSERT_BATCH_SIZE = 50;

/**
 * Resolves and caches vector infrastructure for content items.
 *
 * One instance per pass (the autotagger) or per run (a pipeline stage): each group's database
 * instance and credential lookup are built once, and a failed build is not cached.
 */
export class ContentVectorInfrastructure {
    private readonly resolved = new Map<string, Promise<ResolvedVectorInfrastructure>>();
    private readonly fieldPaths: FieldPathResolver;

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {
        this.fieldPaths = new FieldPathResolver(provider, contextUser, 'MJ: Content Items');
    }

    /** Items grouped by their (embedding model, vector index) key. */
    public async GroupByInfrastructure(items: MJContentItemEntity[]): Promise<Map<string, MJContentItemEntity[]>> {
        await EnsureContentMetadataCached(items, this.contextUser, this.provider);
        const groups = new Map<string, MJContentItemEntity[]>();
        for (const item of items) {
            const key = this.groupKeyFor(item);
            groups.set(key, [...(groups.get(key) ?? []), item]);
        }
        return groups;
    }

    /** The infrastructure for a group key. */
    public Resolve(groupKey: string): Promise<ResolvedVectorInfrastructure> {
        let pending = this.resolved.get(groupKey);
        if (!pending) {
            pending = this.build(groupKey).catch((error: unknown) => {
                // One transient failure must not poison every later record of the run.
                this.resolved.delete(groupKey);
                throw error;
            });
            this.resolved.set(groupKey, pending);
        }
        return pending;
    }

    /**
     * Each item's provider directives. A provider may refuse an item (a mandatory routing value is
     * missing); that item is reported, never written to a default namespace, and the rest proceed.
     */
    public async BuildDirectives(items: MJContentItemEntity[], infra: ResolvedVectorInfrastructure): Promise<ProviderDirectiveResult> {
        const result: ProviderDirectiveResult = { Directives: new Map(), Rejected: [] };
        const resolvedFields = await this.resolveDriverFieldPaths(items, infra);
        for (const item of items) {
            try {
                result.Directives.set(NormalizeUUID(item.ID), BuildProviderDirectives(item, infra, resolvedFields));
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                LogError(`Vector provider rejected record ${item.ID}: ${reason}`);
                result.Rejected.push({ Item: item, Reason: reason });
            }
        }
        return result;
    }

    /** The VectorDBBase for a `MJ: Vector Databases` row, keyed from its credential or the env var. */
    public async CreateVectorDB(database: MJVectorDatabaseEntity): Promise<VectorDBBase> {
        const classKey = database.ClassKey;
        const apiKey = await this.resolveAPIKey(database);
        // The base constructor rejects an empty key; colocated providers authenticate through the host connection instead.
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, classKey, apiKey || 'colocated');
        if (!instance) {
            throw new Error(`Failed to create vector DB instance for ${classKey}`);
        }
        // Wire before the key check: only the instance knows whether it is colocated.
        instance.TryWireColocatedHost(this.provider);
        if (!instance.SupportsColocatedQuery && instance.RequiresAPIKey && !apiKey) {
            throw new Error(`No API key found for vector DB ${classKey} — set its Credential, or AI_VENDOR_API_KEY__${classKey} in .env`);
        }
        return instance;
    }

    /**
     * `<embeddingModelID>|<vectorIndexID>`: the source's index, else the content type's, else the default index.
     * An index named without a model uses the index's own model — it is never skipped for another index.
     */
    private groupKeyFor(item: MJContentItemEntity): string {
        const kh = KnowledgeHubMetadataEngine.Instance;
        const source = kh.GetContentSourceByID(item.ContentSourceID);
        const contentType = kh.GetContentTypeByID(item.ContentTypeID);
        for (const level of [source, contentType]) {
            if (level?.VectorIndexID) {
                const model = level.EmbeddingModelID ? NormalizeUUID(level.EmbeddingModelID) : DEFAULT_PART;
                return `${model}|${NormalizeUUID(level.VectorIndexID)}`;
            }
        }
        return `${DEFAULT_PART}|${DEFAULT_PART}`;
    }

    private async build(groupKey: string): Promise<ResolvedVectorInfrastructure> {
        await AIEngine.Instance.Config(false, this.contextUser, this.provider);
        const [embeddingPart, indexPart] = groupKey.split('|');
        if (indexPart === DEFAULT_PART) {
            const first = AIEngine.Instance.VectorIndexes[0];
            if (!first) {
                throw new Error('No vector indexes found — create one in the Configuration tab first');
            }
            return this.fromIndex(first, first.EmbeddingModelID);
        }
        const index = await this.cachedOrLoaded(AIEngine.Instance.VectorIndexes, 'MJ: Vector Indexes', indexPart);
        if (!index) {
            throw new Error(`Vector index ${indexPart} not found`);
        }
        return this.fromIndex(index, embeddingPart === DEFAULT_PART ? index.EmbeddingModelID : embeddingPart);
    }

    /** Database instance, provider index name, dimensions and ProviderConfig for one index. */
    private async fromIndex(index: MJVectorIndexEntity, embeddingModelID: string): Promise<ResolvedVectorInfrastructure> {
        const database = await this.cachedOrLoaded(AIEngine.Instance.VectorDatabases, 'MJ: Vector Databases', index.VectorDatabaseID);
        if (!database?.ClassKey) {
            throw new Error(`Vector database ${index.VectorDatabaseID} not found`);
        }
        const model = findEmbeddingModel(embeddingModelID);
        const indexName = AIEngine.Instance.GetProviderIndexName(index);
        LogStatus(`[Autotag] USING embedding model "${model.Name}" (${model.DriverClass}), vector DB "${database.ClassKey}", index "${indexName}" (Vector Index "${index.Name}")`);

        const vectorDB = await this.CreateVectorDB(database);
        const legacyEmbedding = legacyEmbeddingAccessor(model.DriverClass);
        return {
            get embedding(): BaseEmbeddings | undefined {
                return legacyEmbedding();
            },
            vectorDB,
            indexName,
            embeddingModelName: model.APIName ?? model.Name,
            embeddingModelID,
            dimensions: index.Dimensions ?? undefined,
            providerConfig: ParseProviderConfig(index.ProviderConfig),
        };
    }

    /**
     * A row from AIEngine's cache, or the one row from the database on a miss. A single RunView, not
     * an engine refresh: AIEngine reloads every model and prompt to pick up one row.
     */
    private async cachedOrLoaded<T extends BaseEntity & { ID: string }>(cached: readonly T[], entityName: string, id: string): Promise<T | undefined> {
        const hit = cached.find((row) => UUIDsEqual(row.ID, id));
        if (hit) return hit;
        const result = await RunView.FromMetadataProvider(this.provider).RunView<T>(
            { EntityName: entityName, ExtraFilter: FieldValueCollection.FromObject({ ID: id }).ToWhereClause(), ResultType: 'entity_object' },
            this.contextUser,
        );
        return result.Success ? result.Results[0] : undefined;
    }

    /** The database's key: its `MJ: Credentials` row first, then `AI_VENDOR_API_KEY__<ClassKey>`. Empty is legitimate for colocated providers. */
    private async resolveAPIKey(database: MJVectorDatabaseEntity): Promise<string> {
        if (database.CredentialID) {
            try {
                await CredentialEngine.Instance.Config(false, this.contextUser, this.provider);
                const credential = CredentialEngine.Instance.GetCredentialById(database.CredentialID);
                if (credential) {
                    const resolved = await CredentialEngine.Instance.GetCredential(credential.Name, {
                        credentialId: database.CredentialID,
                        contextUser: this.contextUser,
                        subsystem: 'ContentVectors',
                    });
                    const apiKey = resolved.values.apiKey ?? resolved.values.api_key;
                    if (apiKey) return apiKey;
                }
                LogError(`Credential ${database.CredentialID} for vector DB "${database.Name}" is missing or has no apiKey, falling back to AI_VENDOR_API_KEY__${database.ClassKey}`);
            } catch (e) {
                LogError(`Failed to resolve the credential for vector DB "${database.Name}": ${e instanceof Error ? e.message : String(e)}, falling back to AI_VENDOR_API_KEY__${database.ClassKey}`);
            }
        }
        return GetAIAPIKey(database.ClassKey) || '';
    }

    /**
     * Resolve the source-record field paths the driver declares (`ContentSourceID.OrganizationID`
     * and the like) for these items, one query per path. Undefined when the driver declares none.
     */
    private async resolveDriverFieldPaths(
        items: MJContentItemEntity[],
        infra: ResolvedVectorInfrastructure,
    ): Promise<Map<string, Record<string, unknown>> | undefined> {
        if (!infra.providerConfig) return undefined;
        const paths = infra.vectorDB.GetSourceRecordFieldPaths(infra.providerConfig);
        if (!paths || paths.length === 0) return undefined;

        const byItem = new Map<string, Record<string, unknown>>();
        for (const path of paths) {
            const values = await this.fieldPaths.ResolveForItems(items, path);
            for (const item of items) {
                const key = NormalizeUUID(item.ID);
                // Injected under the full path key, which is how the provider reads it back.
                byItem.set(key, { ...(byItem.get(key) ?? {}), [path]: values.get(key) });
            }
        }
        return byItem;
    }
}

/**
 * One item's provider directives (e.g. a Pinecone namespace), derived by the provider from the
 * item's fields plus any pre-resolved field paths. Undefined when the index has no ProviderConfig.
 * MAY THROW: a provider rejects a record it cannot route.
 */
export function BuildProviderDirectives(
    item: MJContentItemEntity,
    infra: ResolvedVectorInfrastructure,
    resolvedFields?: Map<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
    if (!infra.providerConfig) {
        return undefined;
    }
    const sourceRecord = { ...(item.GetAll() as Record<string, unknown>), ...(resolvedFields?.get(NormalizeUUID(item.ID)) ?? {}) };
    return infra.vectorDB.BuildProviderDirectives(sourceRecord, infra.providerConfig);
}

/** Upsert in sub-batches of 50, rate-limited when a limiter is given. Fails if any sub-batch fails. */
export async function UpsertVectorRecords(
    records: VectorRecord[],
    infra: ResolvedVectorInfrastructure,
    limiter?: RateLimiter,
): Promise<BaseResponse> {
    const calls: Promise<BaseResponse>[] = [];
    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
        await limiter?.Acquire();
        calls.push(Promise.resolve(infra.vectorDB.CreateRecords(records.slice(i, i + UPSERT_BATCH_SIZE), infra.indexName, infra.providerConfig)));
    }
    const failures = (await Promise.all(calls)).filter((response) => !response.success);
    for (const failure of failures) {
        LogError(`VectorizeContentItems: upsert failed: ${failure.message}`);
    }
    return { success: failures.length === 0, message: failures.map((f) => f.message).join('; '), data: null };
}

/** Every tag of these content items, keyed by normalized item ID, in one query. Empty (logged) on failure. */
export async function LoadContentItemTags(
    itemIDs: readonly string[],
    provider: IMetadataProvider,
    contextUser: UserInfo,
): Promise<Map<string, string[]>> {
    const tags = new Map<string, string[]>();
    const ids = [...new Set(itemIDs.map(NormalizeUUID))];
    if (ids.length === 0) return tags;
    const result = await RunView.FromMetadataProvider(provider).RunView<{ ItemID: string; Tag: string }>(
        {
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: ids.map((id) => `(${FieldValueCollection.FromObject({ ItemID: id }).ToWhereClause()})`).join(' OR '),
            Fields: ['ItemID', 'Tag'],
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success) {
        // Missing tags make a vector less filterable, not wrong; the next metadata refresh adds them.
        LogError(`LoadContentItemTags: ${result.ErrorMessage}`);
        return tags;
    }
    for (const row of result.Results) {
        const key = NormalizeUUID(row.ItemID);
        tags.set(key, [...(tags.get(key) ?? []), row.Tag]);
    }
    return tags;
}

/** Parse `VectorIndex.ProviderConfig`; invalid JSON is logged and treated as no config. */
export function ParseProviderConfig(raw: string | null | undefined): Record<string, unknown> | undefined {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    } catch {
        LogError('Invalid JSON in VectorIndex.ProviderConfig, ignoring');
        return undefined;
    }
}

/**
 * Reload the Knowledge Hub cache once when it lacks a source or type these items reference.
 *
 * Both are required FKs, so a miss means the cache predates the row (a long-running worker). Read
 * from a stale cache, the source's index override and storage config silently fall back. A failed
 * reload is logged and the caller carries on with the cache it has.
 */
export async function EnsureContentMetadataCached(items: MJContentItemEntity[], contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
    const uncached = findUncachedItemMetadata(items);
    if (uncached.length === 0) return;

    LogStatus(`[Autotag] KnowledgeHub cache is missing ${uncached.length} row(s) these items reference (created after it loaded) — reloading it once: ${uncached.join(', ')}`);
    try {
        await KnowledgeHubMetadataEngine.Instance.Config(true, contextUser, provider);
    } catch (e) {
        LogError(`[Autotag] KnowledgeHub cache reload failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const stillUncached = findUncachedItemMetadata(items);
    if (stillUncached.length > 0) {
        LogError(`[Autotag] ${stillUncached.length} row(s) still absent from the KnowledgeHub cache after a reload: ${stillUncached.join(', ')} — items referencing them fall back to their content type / default configuration`);
    }
}

/** The content source / content type ids these items reference that the Knowledge Hub cache lacks. */
function findUncachedItemMetadata(items: MJContentItemEntity[]): string[] {
    const kh = KnowledgeHubMetadataEngine.Instance;
    const uncached = new Set<string>();
    for (const item of items) {
        if (item.ContentSourceID && !kh.GetContentSourceByID(item.ContentSourceID)) {
            uncached.add(`content source ${NormalizeUUID(item.ContentSourceID)}`);
        }
        if (item.ContentTypeID && !kh.GetContentTypeByID(item.ContentTypeID)) {
            uncached.add(`content type ${NormalizeUUID(item.ContentTypeID)}`);
        }
    }
    return [...uncached];
}

function findEmbeddingModel(embeddingModelID: string): { DriverClass: string; APIName: string; Name: string } {
    const model = AIEngine.Instance.Models.find((m) => UUIDsEqual(m.ID, embeddingModelID));
    if (!model) {
        const embedModels = AIEngine.Instance.Models.filter((m) => m.DriverClass?.includes('Embed') || m.Name?.includes('embed'));
        LogError(`VectorizeContentItems: embeddingModelID ${embeddingModelID} NOT FOUND. Available: ${JSON.stringify(embedModels.map((m) => ({ id: m.ID, name: m.Name, driver: m.DriverClass })))}`);
        throw new Error(`Embedding model ${embeddingModelID} not found in AIEngine — ensure AIEngine is configured`);
    }
    return model;
}

/** Backs the deprecated `ResolvedVectorInfrastructure.embedding`, built on first read only. */
function legacyEmbeddingAccessor(driverClass: string): () => BaseEmbeddings | undefined {
    let driver: BaseEmbeddings | undefined;
    return () => {
        driver ??= MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, driverClass, GetAIAPIKey(driverClass) || '') ?? undefined;
        return driver;
    };
}

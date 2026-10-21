import { Resolver, Query, Arg, Ctx, ObjectType, Field, Float, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { CompositeKey, EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { MJEntityDocumentEntity, MJVectorIndexEntity, MJVectorDatabaseEntity } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadOnlyProvider } from '../util.js';
import { GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { AIEngine } from '@memberjunction/aiengine';
import { EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';

/* ───── GraphQL types ───── */

@ObjectType()
export class EntityVectorItem {
    @Field()
    ID: string;

    @Field(() => [Float])
    Values: number[];

    @Field(() => String)
    Metadata: string;
}

@ObjectType()
export class FetchEntityVectorsResult {
    @Field()
    Success: boolean;

    @Field(() => [EntityVectorItem])
    Results: EntityVectorItem[];

    @Field()
    TotalCount: number;

    @Field()
    ElapsedMs: number;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

/** A stored vector's listing row, as `fetchStoredVectors` reads it from `MJ: Entity Record Documents`. */
type StoredVectorRow = { ID: string; RecordID: string };

/** A stored vector chosen for the result, with the labels of the record it belongs to. */
type LabelledVector = { row: StoredVectorRow; labels: Record<string, string> };

/** Most Entity Record Document IDs named in one `ID IN (...)` filter when fetching VectorJSON. */
const VECTOR_FETCH_CHUNK_SIZE = 1000;

/** Most record keys named in one view when checking which matched records the caller may read. */
const READABLE_KEY_CHECK_CHUNK_SIZE = 1000;

/** A match returned by an external vector index's `QueryIndex`. */
type IndexMatch = { id: string; values?: number[]; metadata?: Record<string, unknown>; score?: number };

/* ───── Resolver ───── */

@Resolver()
export class FetchEntityVectorsResolver extends ResolverBase {

    @Query(() => FetchEntityVectorsResult)
    async FetchEntityVectors(
        @Arg('entityDocumentID') entityDocumentID: string,
        @Arg('maxRecords', () => Int, { nullable: true }) maxRecords: number | undefined,
        @Arg('filter', { nullable: true }) filter: string | undefined,
        @Ctx() { userPayload, providers }: AppContext = {} as AppContext
    ): Promise<FetchEntityVectorsResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user', startTime);
            }

            const limit = maxRecords ?? 1000;

            // Step 1: Load the EntityDocument
            const entityDoc = await this.loadEntityDocument(entityDocumentID, currentUser);
            if (!entityDoc) {
                return this.errorResult(`EntityDocument not found: ${entityDocumentID}`, startTime);
            }

            // Step 2: Resolve the VectorIndex
            const vectorIndex = await this.resolveVectorIndex(entityDoc, currentUser);
            if (!vectorIndex) {
                return this.errorResult(
                    `Could not resolve VectorIndex for EntityDocument "${entityDoc.Name}"`,
                    startTime
                );
            }

            // Step 3: Create VectorDB provider instance
            const vectorDBInstance = await this.createVectorDBInstance(vectorIndex, currentUser);
            if (!vectorDBInstance) {
                return this.errorResult(
                    `Could not create VectorDB provider for index "${vectorIndex.Name}"`,
                    startTime
                );
            }

            // Providers that keep their vectors in MJ, keyed by EntityDocumentID (the in-process
            // SimpleVectorServiceProvider), can't be listed through QueryIndex: they key by the
            // document ID rather than the index name, and return matches without vector values.
            // Read the stored Entity Record Document rows instead.
            const md = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true }) ?? Metadata.Provider;
            if (vectorDBInstance.QueryKeyIsEntityDocumentID) {
                const results = await this.fetchStoredVectors(entityDoc, limit, filter, currentUser, md);
                LogStatus(`FetchEntityVectors: Loaded ${results.length} stored vectors for entity "${entityDoc.Entity}" in ${Date.now() - startTime}ms`);
                return { Success: true, Results: results, TotalCount: results.length, ElapsedMs: Date.now() - startTime };
            }

            // The external index was built under whoever ran the sync and is not filtered for this
            // caller, so check here that they may read the source entity at all.
            const entityInfo = this.readableEntity(entityDoc.Entity, currentUser, md);
            if (!entityInfo) {
                return this.errorResult(
                    `Entity "${entityDoc.Entity}" does not exist or you do not have permission to read it`,
                    startTime
                );
            }

            // Step 4: Query with zero vector + Entity metadata filter.
            // Pinecone's list API doesn't support metadata filtering, but query does.
            // A zero vector returns results in arbitrary order (similarity is meaningless),
            // but the metadata filter ensures we only get vectors for this entity.
            const entityName = entityDoc.Entity;
            const dimensions = vectorIndex.Dimensions || 1536; // fall back to common embedding size
            // Use a tiny uniform vector instead of zero — cosine similarity is undefined
            // for a zero vector (division by zero), causing Pinecone to return 0 matches.
            // A uniform vector has equal similarity to all vectors, giving us an unbiased
            // listing that respects the metadata filter.
            const uniformVector = new Array(dimensions).fill(1.0 / Math.sqrt(dimensions));

            const metadataFilter: Record<string, unknown> = { Entity: { $eq: entityName } };

            const queryResponse = await vectorDBInstance.QueryIndex({
                id: AIEngine.Instance.GetProviderIndexName(vectorIndex),
                vector: uniformVector,
                topK: limit,
                includeMetadata: true,
                includeValues: true,
                filter: metadataFilter,
            });

            if (!queryResponse.success || !queryResponse.data) {
                return this.errorResult(
                    `Vector query failed for entity "${entityName}" in index "${vectorIndex.Name}"`,
                    startTime
                );
            }

            // Step 5: Keep only matches for records this caller may read (the index is not filtered
            // by row-level security), then convert them without the fields this caller may not read
            const allMatches = (queryResponse.data as { matches?: IndexMatch[] }).matches ?? [];
            const matches = await this.readableMatches(entityInfo, allMatches, currentUser);
            const denied = entityInfo.GetDeniedReadFields(currentUser);
            const results: EntityVectorItem[] = matches.map(match => ({
                ID: match.id,
                Values: match.values ?? [],
                Metadata: JSON.stringify(this.withoutDeniedFields(match.metadata ?? {}, denied)),
            }));
            LogStatus(`FetchEntityVectors: Queried ${results.length} vectors for entity "${entityName}" in ${Date.now() - startTime}ms`);

            return {
                Success: true,
                Results: results,
                TotalCount: results.length,
                ElapsedMs: Date.now() - startTime,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`FetchEntityVectors query failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    /**
     * The entity's metadata when `contextUser` may read it, else null — whether it is missing or
     * unreadable is deliberately not distinguished.
     */
    private readableEntity(entityName: string, contextUser: UserInfo, md: IMetadataProvider): EntityInfo | null {
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo) return null;
        return entityInfo.GetUserPermisions(contextUser)?.CanRead ? entityInfo : null;
    }

    /**
     * The matches whose record `contextUser` may read, in their original order. A match is kept only
     * when its `RecordID` metadata names a key of the entity and a view run as `contextUser` returns
     * that record; a match without a usable record ID cannot be checked, so it is dropped.
     */
    private async readableMatches(entityInfo: EntityInfo, matches: IndexMatch[], contextUser: UserInfo): Promise<IndexMatch[]> {
        const keyed = matches
            .map(match => ({ match, key: this.matchRecordKey(entityInfo, match) }))
            .filter((m): m is { match: IndexMatch; key: CompositeKey } => m.key !== null);
        if (keyed.length === 0) return [];
        const readable = await this.loadReadableKeys(entityInfo, keyed.map(k => k.key), contextUser);
        return keyed.filter(k => readable.has(this.canonicalKey(k.key))).map(k => k.match);
    }

    /** The record key a match's `RecordID` metadata names, or null when it names no key of the entity. */
    private matchRecordKey(entityInfo: EntityInfo, match: IndexMatch): CompositeKey | null {
        const recordID = match.metadata?.RecordID;
        if (typeof recordID !== 'string' || recordID.length === 0) return null;
        try {
            return CompositeKey.FromRecordID(entityInfo, recordID);
        } catch {
            return null; // field names that are not the entity's primary key: never put into SQL
        }
    }

    /**
     * The canonical forms of the keys among `keys` whose record a view run as `contextUser` returns.
     * The keys are checked in lists of at most {@link READABLE_KEY_CHECK_CHUNK_SIZE}, all sent in one
     * `RunViews` batch.
     */
    private async loadReadableKeys(entityInfo: EntityInfo, keys: CompositeKey[], contextUser: UserInfo): Promise<Set<string>> {
        const views: RunViewParams[] = [];
        for (let i = 0; i < keys.length; i += READABLE_KEY_CHECK_CHUNK_SIZE) {
            views.push({
                EntityName: entityInfo.Name,
                ExtraFilter: this.keyFilter(entityInfo, keys.slice(i, i + READABLE_KEY_CHECK_CHUNK_SIZE)),
                Fields: entityInfo.PrimaryKeys.map(pk => pk.Name),
                IgnoreMaxRows: true,
                BypassCache: true, // one-off key lists: a cache slot per call would only hold memory
                ResultType: 'simple',
            });
        }
        const readable = new Set<string>();
        const results = await new RunView().RunViews<Record<string, unknown>>(views, contextUser);
        for (const result of results) {
            if (!result.Success) {
                throw new Error(`Failed to check access to "${entityInfo.Name}" records: ${result.ErrorMessage}`);
            }
            for (const row of result.Results) {
                readable.add(this.canonicalKey(CompositeKey.FromEntityRecord(entityInfo, row)));
            }
        }
        return readable;
    }

    /** A filter matching exactly `keys`: `PK IN (...)` for a single-column key, one clause per key otherwise. */
    private keyFilter(entityInfo: EntityInfo, keys: CompositeKey[]): string {
        if (entityInfo.PrimaryKeys.length === 1) {
            const values = keys.map(k => `'${EscapeSQLString(String(k.KeyValuePairs[0].Value))}'`).join(',');
            return `${entityInfo.FirstPrimaryKey.Name} IN (${values})`; // first-pk-ok: single-column key, checked above
        }
        return keys.map(k => `(${k.ToWhereClause()})`).join(' OR ');
    }

    /** A key's field names and values, lower-cased, so keys from the index and from a view compare equal. */
    private canonicalKey(key: CompositeKey): string {
        return key.KeyValuePairs.map(kv => `${kv.FieldName.toLowerCase()}|${String(kv.Value).toLowerCase()}`).join('||');
    }

    /**
     * A copy of a vector's metadata without the keys naming fields in `denied` (lowercased field
     * names, as `EntityInfo.GetDeniedReadFields` returns them), compared case-insensitively.
     */
    private withoutDeniedFields(metadata: Record<string, unknown>, denied: Set<string>): Record<string, unknown> {
        if (denied.size === 0) return metadata;
        return Object.fromEntries(Object.entries(metadata).filter(([key]) => !denied.has(key.toLowerCase())));
    }

    /** Load EntityDocument by ID */
    private async loadEntityDocument(
        entityDocumentID: string,
        contextUser: UserInfo
    ): Promise<MJEntityDocumentEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJEntityDocumentEntity>({
            EntityName: 'MJ: Entity Documents',
            ExtraFilter: `ID='${EscapeSQLString(entityDocumentID)}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }
        return result.Results[0];
    }

    /**
     * Resolve the VectorIndex for an EntityDocument.
     * Prefers the explicit VectorIndexID on the EntityDocument; falls back to
     * finding a VectorIndex by matching VectorDatabaseID + EmbeddingModelID.
     */
    private async resolveVectorIndex(
        entityDoc: MJEntityDocumentEntity,
        contextUser: UserInfo
    ): Promise<MJVectorIndexEntity | null> {
        const rv = new RunView();

        // If the EntityDocument has an explicit VectorIndexID, use it directly
        if (entityDoc.VectorIndexID) {
            const result = await rv.RunView<MJVectorIndexEntity>({
                EntityName: 'MJ: Vector Indexes',
                ExtraFilter: `ID='${entityDoc.VectorIndexID}'`,
                ResultType: 'entity_object',
            }, contextUser);

            if (result.Success && result.Results.length > 0) {
                return result.Results[0];
            }
            LogError(`FetchEntityVectors: VectorIndex ${entityDoc.VectorIndexID} referenced by EntityDocument not found`);
        }

        // Fallback: find a VectorIndex by VectorDatabaseID + matching AIModelID as EmbeddingModelID
        const indexResult = await rv.RunView<MJVectorIndexEntity>({
            EntityName: 'MJ: Vector Indexes',
            ExtraFilter: `VectorDatabaseID='${entityDoc.VectorDatabaseID}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!indexResult.Success || indexResult.Results.length === 0) {
            return null;
        }

        // Match on EmbeddingModelID = EntityDocument.AIModelID
        const match = indexResult.Results.find(idx =>
            UUIDsEqual(idx.EmbeddingModelID, entityDoc.AIModelID)
        );
        return match ?? indexResult.Results[0];
    }

    /** Create a VectorDBBase provider instance for a given VectorIndex */
    private async createVectorDBInstance(
        vectorIndex: MJVectorIndexEntity,
        contextUser: UserInfo
    ): Promise<VectorDBBase | null> {
        const rv = new RunView();
        const dbResult = await rv.RunView<MJVectorDatabaseEntity>({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${vectorIndex.VectorDatabaseID}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!dbResult.Success || dbResult.Results.length === 0) {
            LogError(`FetchEntityVectors: VectorDatabase not found for index "${vectorIndex.Name}"`);
            return null;
        }

        const vectorDB = dbResult.Results[0];
        const apiKey = GetAIAPIKey(vectorDB.ClassKey);
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDB.ClassKey, apiKey
        );

        if (!instance) {
            LogError(`FetchEntityVectors: Failed to create VectorDB instance for ClassKey "${vectorDB.ClassKey}"`);
        }
        return instance;
    }

    /**
     * Load the vectors an EntityDocument stored in MJ (`MJ: Entity Record Documents.VectorJSON`),
     * restricted to the entity records that pass `filter`. Each item's metadata carries the entity
     * name, the record ID and the record's name fields, which is what the cluster view labels from.
     */
    private async fetchStoredVectors(
        entityDoc: MJEntityDocumentEntity,
        limit: number,
        filter: string | undefined,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<EntityVectorItem[]> {
        const entityInfo = md.EntityByName(entityDoc.Entity);
        if (!entityInfo) {
            throw new Error(`Entity "${entityDoc.Entity}" not found in metadata`);
        }
        const nameFields = this.labelFieldNames(entityInfo);
        const { records, vectors } = await this.loadRecordsAndStoredVectors(entityInfo, entityDoc, nameFields, filter, contextUser);
        const labelsByRecordID = this.mapRecordLabels(entityInfo, nameFields, records);

        // VectorJSON is the heavy column: list without it, then fetch it only for the items returned.
        const chosen = this.selectLabelledVectors(vectors, labelsByRecordID, limit);
        const valuesByID = await this.loadVectorValues(chosen.map(c => c.row.ID), contextUser);

        const results: EntityVectorItem[] = [];
        for (const { row, labels } of chosen) {
            const vectorJSON = valuesByID.get(row.ID);
            if (!vectorJSON) continue; // removed or cleared since the listing
            results.push({
                ID: row.ID,
                Values: JSON.parse(vectorJSON) as number[],
                Metadata: JSON.stringify({ Entity: entityDoc.Entity, RecordID: row.RecordID, ...labels }),
            });
        }
        return results;
    }

    /** The first `limit` stored vectors whose record was loaded, in listing order. */
    private selectLabelledVectors(
        vectors: StoredVectorRow[],
        labelsByRecordID: Map<string, Record<string, string>>,
        limit: number
    ): LabelledVector[] {
        const chosen: LabelledVector[] = [];
        for (const row of vectors) {
            if (chosen.length >= limit) break;
            const labels = labelsByRecordID.get(row.RecordID.toLowerCase());
            if (!labels) continue; // filtered out, not readable by this user, or the record no longer exists
            chosen.push({ row, labels });
        }
        return chosen;
    }

    /**
     * Fetch `VectorJSON` for the given Entity Record Document IDs, keyed by ID. The ID lists are
     * capped at {@link VECTOR_FETCH_CHUNK_SIZE} per view and all sent in one `RunViews` batch.
     */
    private async loadVectorValues(ids: string[], contextUser: UserInfo): Promise<Map<string, string>> {
        const valuesByID = new Map<string, string>();
        if (ids.length === 0) return valuesByID;

        const views: RunViewParams[] = [];
        for (let i = 0; i < ids.length; i += VECTOR_FETCH_CHUNK_SIZE) {
            const idList = ids.slice(i, i + VECTOR_FETCH_CHUNK_SIZE).map(id => `'${EscapeSQLString(id)}'`).join(',');
            views.push({
                EntityName: 'MJ: Entity Record Documents',
                ExtraFilter: `ID IN (${idList})`,
                Fields: ['ID', 'VectorJSON'],
                IgnoreMaxRows: true,
                BypassCache: true, // one-off ID lists: a cache slot per call would only hold memory
                ResultType: 'simple',
            });
        }
        const results = await new RunView().RunViews<{ ID: string; VectorJSON: string | null }>(views, contextUser);
        for (const result of results) {
            if (!result.Success) {
                throw new Error(`Failed to load vector values: ${result.ErrorMessage}`);
            }
            for (const row of result.Results) {
                if (row.VectorJSON) valuesByID.set(row.ID, row.VectorJSON);
            }
        }
        return valuesByID;
    }

    /** The fields a stored vector is labelled with: the entity's name fields, else its NameField. */
    private labelFieldNames(entityInfo: EntityInfo): string[] {
        const nameFields = entityInfo.Fields.filter(f => f.IsNameField).map(f => f.Name);
        if (nameFields.length === 0 && entityInfo.NameField) {
            nameFields.push(entityInfo.NameField.Name);
        }
        return nameFields;
    }

    /**
     * Load the records that pass `filter` (key and name fields only) and the list of the document's
     * stored vectors (ID and RecordID, no VectorJSON). The two views don't depend on each other, so
     * they go in one `RunViews` round trip.
     */
    private async loadRecordsAndStoredVectors(
        entityInfo: EntityInfo,
        entityDoc: MJEntityDocumentEntity,
        nameFields: string[],
        filter: string | undefined,
        contextUser: UserInfo
    ): Promise<{ records: Record<string, unknown>[]; vectors: StoredVectorRow[] }> {
        const keyFields = entityInfo.PrimaryKeys.map(pk => pk.Name);
        const [recordResult, docResult] = await new RunView().RunViews<Record<string, unknown>>([
            {
                EntityName: entityInfo.Name,
                ExtraFilter: filter || undefined,
                Fields: [...new Set([...keyFields, ...nameFields])],
                IgnoreMaxRows: true,
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Entity Record Documents',
                ExtraFilter: `EntityDocumentID='${EscapeSQLString(entityDoc.ID)}' AND VectorJSON IS NOT NULL`,
                Fields: ['ID', 'RecordID'],
                IgnoreMaxRows: true,
                // A cached RunView fetches every column so its slot can serve any field set, which
                // would pull each vector's VectorJSON here. Bypass the cache so Fields is honoured.
                BypassCache: true,
                ResultType: 'simple',
            },
        ], contextUser);
        if (!recordResult.Success) {
            throw new Error(`Failed to load "${entityInfo.Name}" records: ${recordResult.ErrorMessage}`);
        }
        if (!docResult.Success) {
            throw new Error(`Failed to load stored vectors: ${docResult.ErrorMessage}`);
        }
        return { records: recordResult.Results, vectors: docResult.Results as StoredVectorRow[] };
    }

    /**
     * Map each loaded record to its name-field values, keyed by the same compact record-ID form
     * the vector sync writes to `MJ: Entity Record Documents.RecordID` (lower-cased).
     */
    private mapRecordLabels(
        entityInfo: EntityInfo,
        nameFields: string[],
        rows: Record<string, unknown>[]
    ): Map<string, Record<string, string>> {
        const map = new Map<string, Record<string, string>>();
        for (const row of rows) {
            const key = CompositeKey.FromEntityRecord(entityInfo, row).ToCompactURLSegment().toLowerCase();
            const labels: Record<string, string> = {};
            for (const name of nameFields) {
                if (row[name] != null) labels[name] = String(row[name]);
            }
            map.set(key, labels);
        }
        return map;
    }

    private errorResult(message: string, startTime: number): FetchEntityVectorsResult {
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: Date.now() - startTime,
            ErrorMessage: message,
        };
    }
}

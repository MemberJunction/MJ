import { BaseEntity, LogError, LogStatus, RunView } from "@memberjunction/core";
import { RegisterClass, MJGlobal } from "@memberjunction/global";
import { MJVectorIndexEntity, MJVectorDatabaseEntity } from "@memberjunction/core-entities";
import { VectorDBBase, CreateIndexParams, IndexModelMetricEnum } from "@memberjunction/ai-vectordb";
import { GetAIAPIKey } from "@memberjunction/ai";

/** The distance metrics a provider index can be created with. */
const VALID_METRICS: ReadonlyArray<IndexModelMetricEnum> = ['cosine', 'euclidean', 'dotproduct'];

/**
 * What happened when this row tried to become a real index.
 *
 * Recorded on `ProviderConfig` so the state is readable off the row itself. A row whose
 * state is anything but `provisioned` or `not-applicable` has no index behind it, and the
 * vectorize pipeline refuses it (it has no `Dimensions` to check embedding widths against).
 */
type ProvisionState =
    /** The provider created the index and told us its width and metric. */
    | 'provisioned'
    /** The driver owns no index object — the row IS the definition (e.g. SimpleVectorServiceProvider). */
    | 'not-applicable'
    /** No driver instance could be built in this process, so nothing was attempted. */
    | 'unprovisioned'
    /** The driver was reachable and the create failed. Nothing exists. */
    | 'failed'
    /** The index exists in the provider but the write-back of its metadata onto this row failed. */
    | 'orphaned';

type ProvisionResult = { state: ProvisionState; reason?: string };

/**
 * Server-side VectorIndex entity that syncs with the vector database provider.
 * On create: calls vectorDB.CreateIndex() to provision the index in the provider (e.g., Pinecone).
 * On delete: calls vectorDB.DeleteIndex() to remove the index from the provider.
 */
@RegisterClass(BaseEntity, 'MJ: Vector Indexes')
export class MJVectorIndexEntityServer extends MJVectorIndexEntity {
    /**
     * After saving, if this is a new record, create the index in the provider.
     *
     * **The provisioning is awaited, and its outcome is recorded on the row.** It used to be
     * fired and forgotten (`createIndexInProvider().catch(LogError)`), which meant `Save()`
     * resolved `true` before the provider had been asked anything at all. Two things followed
     * from that, and both were invisible:
     *
     *   1. A `success: false` from the provider, or a thrown driver error, only reached the
     *      server log. The row stayed behind claiming an index nobody had created, with
     *      `ExternalID`, `Dimensions` and `Metric` all still null — and the caller was told the
     *      save had worked.
     *   2. Even on the happy path the write-back raced the caller: a client that re-read the row
     *      immediately after `Save()` returned saw the pre-provisioning values. That is why
     *      `Dimensions` is null on so many existing rows despite `saveProviderMetadata` writing it.
     *
     * What the caller learns now, and when:
     *
     *   - **The provider refused or threw** (`failed`) — the reason is written onto the row and
     *     then rethrown, so the create surfaces the provider's own words at the moment of the
     *     save rather than in a log nobody reads.
     *   - **The index was created but the write-back failed** (`orphaned`) — also rethrown, with
     *     a different message, because the index is real and must not be silently abandoned:
     *     the row cannot address it without an `ExternalID`.
     *   - **No driver instance exists in this process** (`unprovisioned`) — recorded, and the save
     *     stands. This is an environment gap rather than a provider verdict: the `mj sync` CLI
     *     does not load vector-DB driver packages, and failing every `MJ: Vector Indexes` row
     *     there would break metadata sync over something the index has no opinion about. The row
     *     is left visibly unprovisioned, and the vectorize path refuses exactly that state.
     *   - **The driver owns no index objects** (`not-applicable`) — recorded, and the save stands.
     *     See {@link VectorDBBase.ManagesIndexes}.
     */
    public override async Save(): Promise<boolean> {
        const isNew = this.IsSaved === false;
        const saveResult = await super.Save();

        if (!saveResult || !isNew) {
            return saveResult;
        }

        let outcome: ProvisionResult;
        try {
            outcome = await this.provisionIndexInProvider();
        } catch (error) {
            // A driver that throws rather than returning `success: false` is the same verdict.
            outcome = { state: 'failed', reason: error instanceof Error ? error.message : String(error) };
        }

        await this.recordProvisionState(outcome);

        if (outcome.state === 'failed') {
            throw new Error(
                `Vector index "${this.Name}" was recorded but NOT created in the vector database provider: ` +
                `${outcome.reason ?? 'the provider reported a failure with no message'}. ` +
                `The record has been marked unprovisioned — delete it and try again once the provider is reachable.`
            );
        }
        if (outcome.state === 'orphaned') {
            throw new Error(
                `Vector index "${this.Name}" WAS created in the vector database provider, but its provider ` +
                `metadata could not be written back to the record: ${outcome.reason ?? 'unknown error'}. ` +
                `The index exists and the record cannot address it — reconcile them before vectorizing.`
            );
        }

        return saveResult;
    }

    /**
     * Before deleting, remove the index from the provider.
     */
    public override async Delete(): Promise<boolean> {
        // Try to delete from provider first — if it fails, still delete the metadata record
        await this.deleteIndexFromProvider().catch((error) => {
            LogError(`Failed to delete index "${this.Name}" from vector DB provider (proceeding with metadata delete)`, undefined, error);
        });

        return super.Delete();
    }

    /**
     * Validates and sanitizes the index name for use with vector DB providers.
     * Pinecone index names must be lowercase alphanumeric + hyphens, max 45 chars.
     * Returns the sanitized name.
     */
    private sanitizeIndexName(name: string): string {
        // Replace spaces and underscores with hyphens, remove invalid chars, lowercase, trim to 45 chars
        let sanitized = name
            .toLowerCase()
            .replace(/[\s_]+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')       // collapse multiple hyphens
            .replace(/^-|-$/g, '');     // trim leading/trailing hyphens

        if (sanitized.length > 45) {
            sanitized = sanitized.substring(0, 45).replace(/-$/, '');
        }

        if (sanitized.length === 0) {
            throw new Error(`Index name "${name}" results in an empty string after sanitization. Please use a name with alphanumeric characters.`);
        }

        return sanitized;
    }

    /**
     * Create the index in the vector database provider and report what happened.
     *
     * Returns rather than logs: the caller decides which outcomes are fatal, because only the
     * caller knows whether the row has already been committed.
     */
    private async provisionIndexInProvider(): Promise<ProvisionResult> {
        const vectorDB = await this.getVectorDBInstance();
        if (!vectorDB) {
            // getVectorDBInstance() has already logged the specific reason.
            return {
                state: 'unprovisioned',
                reason: `No vector DB driver instance could be built for VectorDatabaseID ${this.VectorDatabaseID} in this process`,
            };
        }

        if (!vectorDB.ManagesIndexes) {
            return {
                state: 'not-applicable',
                reason: 'This vector database driver owns no index objects — this record is the whole index definition',
            };
        }

        // Sanitize the index name for the provider (e.g., Pinecone requires lowercase, no spaces)
        const sanitizedName = this.sanitizeIndexName(this.Name);
        if (sanitizedName !== this.Name) {
            LogStatus(`Index name sanitized from "${this.Name}" to "${sanitizedName}" for vector DB provider compatibility`);
        }

        const params: CreateIndexParams = {
            id: sanitizedName,
            dimension: this.resolveDimensions(),
            metric: this.resolveMetric(),
            additionalParams: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        };

        LogStatus(`Creating index "${sanitizedName}" in vector DB provider...`);
        const result = await vectorDB.CreateIndex(params);
        if (!result.success) {
            return { state: 'failed', reason: result.message || 'the provider reported a failure with no message' };
        }

        LogStatus(`Index "${sanitizedName}" created successfully in provider`);
        const writeBackFailure = await this.saveProviderMetadata(result.data, params, sanitizedName);
        if (writeBackFailure === null) {
            return { state: 'provisioned' };
        }
        return { state: 'orphaned', reason: writeBackFailure };
    }

    /**
     * Delete the index from the vector database provider.
     */
    private async deleteIndexFromProvider(): Promise<void> {
        const vectorDB = await this.getVectorDBInstance();
        if (!vectorDB) {
            LogError(`Cannot delete index: no VectorDB instance for database ${this.VectorDatabaseID}`);
            return;
        }

        if (!vectorDB.ManagesIndexes) {
            // Nothing was ever provisioned, so there is nothing to remove. Asking anyway just
            // produces an "unsupported" error log on every delete.
            return;
        }

        // Use ExternalID if available (the sanitized name stored in the provider), fall back to Name
        const providerIndexName = this.ExternalID || this.sanitizeIndexName(this.Name);
        LogStatus(`Deleting index "${providerIndexName}" from vector DB provider...`);
        const result = await vectorDB.DeleteIndex({ id: providerIndexName });
        if (result.success) {
            LogStatus(`Index "${providerIndexName}" deleted from provider`);
        } else {
            LogError(`Provider returned error deleting index "${providerIndexName}": ${result.message}`);
        }
    }

    /**
     * Instantiate the VectorDB provider class using ClassFactory.
     * Looks up the VectorDatabase record to get the ClassKey for provider instantiation.
     */
    private async getVectorDBInstance(): Promise<VectorDBBase | null> {
        if (!this.VectorDatabaseID) {
            return null;
        }

        const rv = new RunView();
        const result = await rv.RunView<MJVectorDatabaseEntity>({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${this.VectorDatabaseID}'`,
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);

        if (!result.Success || result.Results.length === 0) {
            LogError(`VectorDatabase with ID ${this.VectorDatabaseID} not found`);
            return null;
        }

        const vectorDB = result.Results[0];
        const classKey = vectorDB.ClassKey;
        if (!classKey) {
            LogError(`VectorDatabase "${vectorDB.Name}" has no ClassKey configured`);
            return null;
        }

        // Instantiate BEFORE gating on the key, then wire the host connection. A colocated provider
        // (SQLServerVectorDatabase, pgvector) stores vectors in this same database: it has no
        // credentials to present, and it throws "requires a host connection" unless the active data
        // provider is handed to it. Neither is knowable until the instance exists. Same ordering as
        // the EntityDocument and ContentSource vectorization pipelines.
        // The sentinel is required: `VectorDBBase`'s constructor rejects an empty key and colocated
        // providers do not override it, so '' would throw for the very case this supports.
        const apiKey = GetAIAPIKey(classKey);
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, classKey, apiKey || 'colocated'
        );
        if (!instance) {
            LogError(`Failed to create vector DB instance for "${classKey}"`);
            return null;
        }

        instance.TryWireColocatedHost(this.ProviderToUse);
        if (!instance.SupportsColocatedQuery && instance.RequiresAPIKey && !apiKey) {
            LogError(`No API key found for vector DB provider "${classKey}"`);
            return null;
        }
        return instance;
    }

    /**
     * Resolve the embedding dimensions to create the provider index at.
     *
     * Prefers this index's own `Dimensions` column, which is where the operator states it and what the
     * embedding call already honors. Falling straight through to 1536 ignored that column entirely, so
     * an index for any other model was created at the wrong width — harmless with providers that don't
     * enforce it, and fatal with ones that do: a colocated SQL Server index is a `VECTOR(n)` column, and
     * inserting 384-dimension vectors into a `VECTOR(1536)` is rejected outright.
     *
     * 1536 (OpenAI text-embedding-3-small) remains the fallback for records that never set it —
     * and it is a guess, so it says so. Nothing in MJ's metadata states a model's output width
     * (`MJ: AI Models` has no such column), so this cannot be derived from `EmbeddingModelID`.
     * When the guess is wrong the index is created at the wrong width, and the mismatch surfaces
     * on the first vectorize run instead: the sync now compares each returned vector against the
     * index's recorded width and refuses the batch before upserting it.
     */
    private resolveDimensions(): number {
        if (this.Dimensions) {
            return this.Dimensions;
        }
        LogError(
            `Vector index "${this.Name}" does not state its Dimensions, so it is being created at the 1536 default. ` +
            `If its embedding model produces a different width, vectorization will refuse to upsert into it. ` +
            `Set Dimensions to the width of the model this index is for.`
        );
        return 1536;
    }

    /**
     * Resolve the distance metric to request the provider index be created with.
     *
     * `Metric` on this row is what the operator asked for; `cosine` is the fallback. This used to be
     * hardcoded to `cosine` at the call site, which made the `Metric` write-back a tautology — the
     * column simply echoed a constant this file had chosen, so it could never disagree with the
     * provider and could never tell you the provider had done something else.
     */
    private resolveMetric(): IndexModelMetricEnum {
        const stated = this.Metric?.trim().toLowerCase();
        const match = VALID_METRICS.find((m) => m === stated);
        if (stated && !match) {
            LogError(`Vector index "${this.Name}" declares an unrecognized Metric "${this.Metric}" — requesting "cosine" instead. Valid values: ${VALID_METRICS.join(', ')}.`);
        }
        return match ?? 'cosine';
    }

    /**
     * After provider creates the index, save the returned metadata back to our record.
     * Stores ExternalID, Dimensions, Metric, and full provider config as JSON.
     *
     * **Provider truth beats our request.** `Dimensions` and `Metric` are read off the provider's
     * own response when it reports them, and only fall back to what we asked for. A provider is
     * free to round, clamp or ignore a requested dimension, and the whole point of these two
     * columns is to be checkable against the embeddings we later generate — a column that can
     * only ever repeat our own request is not a check.
     *
     * @returns `null` when the write-back landed, or the reason it did not. The index exists
     * either way, so this is never the caller's licence to discard the row.
     */
    private async saveProviderMetadata(
        providerResult: Record<string, unknown> | undefined,
        params: CreateIndexParams,
        sanitizedName: string
    ): Promise<string | null> {
        try {
            this.ExternalID = sanitizedName; // The sanitized name used in the provider
            this.Dimensions = this.readProviderDimension(providerResult) ?? params.dimension;
            this.Metric = this.readProviderMetric(providerResult) ?? params.metric;

            // Store full provider response + our spec as JSON config
            const config: Record<string, unknown> = {};
            if (params.additionalParams) {
                config['spec'] = params.additionalParams;
            }
            if (providerResult && typeof providerResult === 'object') {
                // Extract useful provider metadata (host, status, etc.)
                if ('host' in providerResult) config['host'] = providerResult['host'];
                if ('status' in providerResult) config['status'] = providerResult['status'];
            }
            this.ProviderConfig = this.buildProviderConfig({ state: 'provisioned' }, config);

            const saved = await super.Save();
            if (saved) {
                LogStatus(`Saved provider metadata for index "${this.Name}"`);
                return null;
            }
            const reason = this.LatestResult?.CompleteMessage ?? 'the record save returned false with no message';
            LogError(`Failed to save provider metadata for index "${this.Name}": ${reason}`);
            return reason;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            LogError(`Error saving provider metadata for index "${this.Name}"`, undefined, error);
            return reason;
        }
    }

    /** The provider's own dimension, when it reported a usable one. */
    private readProviderDimension(providerResult: Record<string, unknown> | undefined): number | null {
        const raw = providerResult?.['dimension'];
        const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    /** The provider's own metric, when it reported a recognized one. */
    private readProviderMetric(providerResult: Record<string, unknown> | undefined): IndexModelMetricEnum | null {
        const raw = providerResult?.['metric'];
        if (typeof raw !== 'string') {
            return null;
        }
        const normalized = raw.trim().toLowerCase();
        return VALID_METRICS.find((m) => m === normalized) ?? null;
    }

    /**
     * Write the provisioning outcome onto the row, so a row that has no index behind it says so
     * instead of looking identical to one that does.
     *
     * Best-effort by construction: this runs on the failure path, and a second failure here must
     * not replace the original diagnosis with a save error. The original outcome is still
     * returned to the caller and thrown where it is fatal.
     */
    private async recordProvisionState(outcome: ProvisionResult): Promise<void> {
        if (outcome.state === 'provisioned') {
            return; // saveProviderMetadata already stamped it, along with the provider's values
        }
        try {
            this.ProviderConfig = this.buildProviderConfig(outcome);
            const saved = await super.Save();
            if (!saved) {
                LogError(`Could not record provisioning state "${outcome.state}" on vector index "${this.Name}": ${this.LatestResult?.CompleteMessage ?? 'save returned false'}`);
            }
        } catch (error) {
            LogError(`Could not record provisioning state "${outcome.state}" on vector index "${this.Name}"`, undefined, error);
        }
    }

    /**
     * Merge the provisioning outcome into the existing `ProviderConfig` JSON bag, preserving any
     * driver-specific keys already there (e.g. Pinecone's `namespaceField`).
     */
    private buildProviderConfig(outcome: ProvisionResult, extra?: Record<string, unknown>): string {
        let existing: Record<string, unknown> = {};
        if (this.ProviderConfig) {
            try {
                const parsed: unknown = JSON.parse(this.ProviderConfig);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    existing = parsed as Record<string, unknown>;
                }
            } catch {
                // A ProviderConfig we cannot parse is not something to preserve silently.
                LogError(`Vector index "${this.Name}" has an unparseable ProviderConfig; it is being replaced.`);
            }
        }
        const merged: Record<string, unknown> = { ...existing, ...(extra ?? {}) };
        merged['provisionState'] = outcome.state;
        merged['provisionCheckedAt'] = new Date().toISOString();
        if (outcome.reason) {
            merged['provisionMessage'] = outcome.reason;
        } else {
            delete merged['provisionMessage'];
        }
        return JSON.stringify(merged);
    }
}

import { BaseEntity, EntitySaveOptions, IMetadataProvider, LogError, LogStatus, RunView } from "@memberjunction/core";
import { RegisterClass, MJGlobal } from "@memberjunction/global";
import { MJVectorIndexEntity, MJVectorDatabaseEntity } from "@memberjunction/core-entities";
import { VectorDBBase, CreateIndexParams, IndexModelMetricEnum } from "@memberjunction/ai-vectordb";
import { GetAIAPIKey } from "@memberjunction/ai";
import { AIEmbeddingRunner } from "@memberjunction/ai-prompts";
import { AIEngineBase } from "@memberjunction/ai-engine-base";

/** The distance metrics a provider index can be created with. */
const VALID_METRICS: ReadonlyArray<IndexModelMetricEnum> = ['cosine', 'euclidean', 'dotproduct'];

/**
 * What happened when this row tried to become a real index.
 *
 * Recorded on `ProviderConfig` (`provisionState`, `provisionMessage`, `provisionCheckedAt`) so the
 * outcome of the detached provisioning is readable off the row itself, rather than only from a log
 * line nobody connects back to the record.
 */
type VectorIndexProvisionState =
    /** The provider created the index; `ExternalID`, `Dimensions` and `Metric` carry what it reported. */
    | 'provisioned'
    /** The provider refused the create, or the driver threw. Nothing exists; `provisionMessage` says why. */
    | 'failed'
    /**
     * The provider did not answer within {@link MJVectorIndexEntityServer.CREATE_INDEX_TIMEOUT_MS}. Not
     * `failed`: the call is abandoned rather than cancelled, so the provider may still finish creating it.
     */
    | 'timed-out'
    /** The driver owns no index objects; this row is the whole definition (see {@link VectorDBBase.ManagesIndexes}). */
    | 'not-applicable'
    /** No driver instance could be built in this process, so nothing was attempted. */
    | 'unprovisioned';

type ProvisionResult = { state: VectorIndexProvisionState; reason?: string };

/** Raised by {@link MJVectorIndexEntityServer.withTimeout}, so a hung provider is told apart from one that refused. */
class ProvisionTimeoutError extends Error {}

/**
 * Server-side VectorIndex entity that syncs with the vector database provider.
 * On create: calls vectorDB.CreateIndex() to provision the index in the provider (e.g., Pinecone).
 * On delete: calls vectorDB.DeleteIndex() to remove the index from the provider.
 *
 * Provisioning is DETACHED from the save that triggers it: the save returns once the metadata row is
 * written, and the provider call runs afterwards (see {@link Save}). That call is bounded by
 * {@link CREATE_INDEX_TIMEOUT_MS}: past it the hook stops waiting and records `timed-out`. The provider
 * call itself is abandoned, not cancelled (there is no cancellation handle), so the bound limits how
 * long this record's provisioning stays open, not the provider's work.
 * Pinecone's createIndex returns as soon as the request is accepted (we never pass waitUntilReady),
 * so the bound only ever trips on a hung connection, not on a slow index build.
 *
 * Whatever the outcome, it is written onto the row's `ProviderConfig` as a {@link VectorIndexProvisionState}.
 */
@RegisterClass(BaseEntity, 'MJ: Vector Indexes')
export class MJVectorIndexEntityServer extends MJVectorIndexEntity {
    /** Upper bound on one provider CreateIndex call. */
    public static readonly CREATE_INDEX_TIMEOUT_MS = 60_000;
    /** Upper bound on the one embedding call that learns a model's width (see resolveDimensions). */
    public static readonly DIMENSION_PROBE_TIMEOUT_MS = 30_000;
    /** Width used only when the record has none and the probe cannot answer (OpenAI text-embedding-3-small). */
    public static readonly DEFAULT_DIMENSIONS = 1536;
    /** The one string embedded to learn a model's width; its content is irrelevant, only the vector's length is read. */
    private static readonly DIMENSION_PROBE_TEXT = 'dimension probe';

    /**
     * After saving, if this is a new record, create the index in the provider.
     * The provider call is deliberately NOT awaited: the client only needs the metadata row, and the
     * request that triggered the save (an "Auto" index from the UI, or the Config page) must not wait
     * on the provider. Save() never throws over provisioning; the outcome is recorded on the row's
     * `ProviderConfig` instead (see {@link createIndexInProvider}).
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNew = this.IsSaved === false;
        const saveResult = await super.Save(options);

        if (saveResult && isNew) {
            this.createIndexInProvider().catch((error) => {
                LogError(`Failed to create index "${this.Name}" in vector DB provider`, undefined, error);
            });
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
     * The detached half of {@link Save}: provision, then write the outcome onto the row.
     *
     * Before this, a provider that refused (`success: false`), threw, or never answered reached only
     * the server log, and the committed row looked exactly like one with an index behind it. The
     * row's `ProviderConfig` now says which of the {@link VectorIndexProvisionState}s it is in.
     *
     * Keep this name: the integration suite's content-vectorization fixture stubs it by name to keep
     * the provider out of the run.
     */
    private async createIndexInProvider(): Promise<void> {
        let outcome: ProvisionResult;
        try {
            outcome = await this.provisionIndexInProvider();
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            // A driver that throws rather than returning `success: false` is the same verdict; a call
            // that outlived the bound is not, because the provider may still finish it.
            outcome = { state: error instanceof ProvisionTimeoutError ? 'timed-out' : 'failed', reason };
        }

        await this.recordProvisionState(outcome);

        switch (outcome.state) {
            case 'failed':
                LogError(
                    `Vector index "${this.Name}" was NOT created in the vector database provider: ` +
                    `${outcome.reason ?? 'the provider reported a failure with no message'}. ` +
                    `Recorded provisionState "failed" on the record; delete it and recreate it once the provider is reachable.`
                );
                break;
            case 'timed-out':
                LogError(
                    `Vector index "${this.Name}": ${outcome.reason ?? 'the provider did not answer in time'}. ` +
                    `Recorded provisionState "timed-out" on the record.`
                );
                break;
            case 'unprovisioned':
            case 'not-applicable':
                LogStatus(`Vector index "${this.Name}": provisionState "${outcome.state}" (${outcome.reason ?? 'no detail'})`);
                break;
        }
    }

    /**
     * Create the index in the vector database provider and report what happened.
     *
     * Returns rather than logs, so {@link createIndexInProvider} records every outcome the same way.
     * Throws only when the driver throws or the call times out; the caller classifies both.
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

        if (vectorDB.ManagesIndexes === false) {
            return {
                state: 'not-applicable',
                reason: 'This vector database driver owns no index objects; this record is the whole index definition',
            };
        }

        // Sanitize the index name for the provider (e.g., Pinecone requires lowercase, no spaces)
        const sanitizedName = this.sanitizeIndexName(this.Name);
        if (sanitizedName !== this.Name) {
            LogStatus(`Index name sanitized from "${this.Name}" to "${sanitizedName}" for vector DB provider compatibility`);
        }

        const params: CreateIndexParams = {
            id: sanitizedName,
            dimension: await this.resolveDimensions(),
            metric: this.resolveMetric(),
            additionalParams: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        };

        LogStatus(`Creating index "${sanitizedName}" in vector DB provider...`);
        const result = await MJVectorIndexEntityServer.withTimeout(
            vectorDB.CreateIndex(params),
            MJVectorIndexEntityServer.CREATE_INDEX_TIMEOUT_MS,
            `CreateIndex("${sanitizedName}")`
        );
        if (!result.success) {
            return { state: 'failed', reason: result.message || 'the provider reported a failure with no message' };
        }

        LogStatus(`Index "${sanitizedName}" created successfully in provider`);
        await this.saveProviderMetadata(result.data, params, sanitizedName);
        return { state: 'provisioned' };
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

        if (vectorDB.ManagesIndexes === false) {
            // Nothing was ever provisioned, so there is nothing to remove. Asking anyway just
            // produces an "unsupported" error log on every delete.
            return;
        }

        // Same rule every read path uses to address the index on its provider (ExternalID, else Name).
        // An index provisioned through Save() above always has ExternalID set to its sanitized name.
        const providerIndexName = AIEngineBase.Instance.GetProviderIndexName(this);
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
     * embedding call already honors. When the record carries none (every index created from the UI:
     * the Config page's Create Index and the "Vector Index: Auto" path both leave it null, and
     * `MJ: AI Models` has no width column to copy from), the width is learned by embedding one short
     * string with the index's own model and reading the vector's length. Every provider fixes the width
     * at create time, so guessing it wrong gives an index the sync can never write to: a 384-dimension
     * model's vectors are rejected by a `VECTOR(1536)` column or a 1536-wide Pinecone index outright.
     *
     * 1536 (OpenAI text-embedding-3-small) remains the fallback only when the probe cannot run or
     * fails, and the failure is logged so the width can be set by hand. A wrong fallback does not go
     * unnoticed: the vectorize pipeline compares every returned vector against the index's width and
     * refuses the batch before upserting it.
     */
    private async resolveDimensions(): Promise<number> {
        if (this.Dimensions) {
            return this.Dimensions;
        }
        const probed = await this.probeModelDimensions();
        if (probed === null) {
            LogError(`Vector index "${this.Name}": could not learn the embedding width; creating the provider index at the ${MJVectorIndexEntityServer.DEFAULT_DIMENSIONS} fallback. Set Dimensions on the record if the model's width differs.`);
            return MJVectorIndexEntityServer.DEFAULT_DIMENSIONS;
        }
        return probed;
    }

    /**
     * Embed one short string with this index's embedding model and return the vector's length, or null
     * when there is no model, no user context, or the call fails. `ModelID` is pinned so the answer
     * comes from the model the index is for; the run row is skipped since this is not a real workload.
     */
    private async probeModelDimensions(): Promise<number | null> {
        if (!this.EmbeddingModelID) {
            LogError(`Vector index "${this.Name}" has no EmbeddingModelID; cannot probe its embedding width`);
            return null;
        }
        if (!this.ContextCurrentUser) {
            LogError(`Vector index "${this.Name}" has no context user; cannot probe its embedding width`);
            return null;
        }
        try {
            const result = await MJVectorIndexEntityServer.withTimeout(
                new AIEmbeddingRunner().RunEmbedding({
                    Texts: [MJVectorIndexEntityServer.DIMENSION_PROBE_TEXT],
                    ModelID: this.EmbeddingModelID,
                    ContextUser: this.ContextCurrentUser,
                    // The entity's data provider is the same object as its metadata provider; this is
                    // the cast BaseEntity itself uses wherever it needs the metadata view of it.
                    Provider: this.ProviderToUse as unknown as IMetadataProvider,
                    SkipRunRecord: true,
                    Description: `Vector index "${this.Name}" dimension probe`,
                }),
                MJVectorIndexEntityServer.DIMENSION_PROBE_TIMEOUT_MS,
                `Dimension probe for vector index "${this.Name}"`
            );
            const width = result.Success ? result.Vectors?.[0]?.length ?? 0 : 0;
            if (width <= 0) {
                LogError(`Dimension probe for vector index "${this.Name}" returned no vector: ${result.ErrorMessage ?? 'empty result'}`);
                return null;
            }
            LogStatus(`Vector index "${this.Name}": embedding width ${width} learned from model ${result.ModelName ?? this.EmbeddingModelID}`);
            return width;
        } catch (error) {
            LogError(`Dimension probe for vector index "${this.Name}" failed`, undefined, error);
            return null;
        }
    }

    /**
     * Resolve the distance metric to request the provider index be created with.
     *
     * `Metric` on this row is what the operator asked for; `cosine` is the fallback. This used to be
     * hardcoded to `cosine` at the call site, which made the `Metric` write-back a tautology: the
     * column simply echoed a constant this file had chosen, so it could never disagree with the
     * provider and could never tell you the provider had done something else.
     */
    private resolveMetric(): IndexModelMetricEnum {
        const stated = this.Metric?.trim().toLowerCase();
        const match = VALID_METRICS.find((m) => m === stated);
        if (stated && !match) {
            LogError(`Vector index "${this.Name}" declares an unrecognized Metric "${this.Metric}"; requesting "cosine" instead. Valid values: ${VALID_METRICS.join(', ')}.`);
        }
        return match ?? 'cosine';
    }

    /**
     * Resolve `work` or reject after `timeoutMs`, whichever comes first. The timer is cleared when the
     * work settles, so a fast provider leaves nothing behind. On timeout the provider may still finish
     * on its side; the record simply does not get its metadata written back, and the log says so.
     */
    private static withTimeout<T>(work: Promise<T> | T, timeoutMs: number, label: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new ProvisionTimeoutError(
                    `${label} timed out after ${timeoutMs}ms; the provider may still finish on its side, ` +
                    `but nothing it returns will be written back to the record`
                ));
            }, timeoutMs);
            Promise.resolve(work).then(
                (value) => { clearTimeout(timer); resolve(value); },
                (error) => { clearTimeout(timer); reject(error); }
            );
        });
    }

    /**
     * After provider creates the index, save the returned metadata back to our record.
     * Stores ExternalID, Dimensions, Metric, the provisioning state, and provider config as JSON.
     *
     * **Provider truth beats our request.** `Dimensions` and `Metric` are read off the provider's
     * own response when it reports them, and only fall back to what we asked for. A provider is
     * free to round, clamp or ignore a requested dimension, and the whole point of these two
     * columns is to be checkable against the embeddings we later generate; a column that can
     * only ever repeat our own request is not a check.
     *
     * A failed write-back is logged rather than recorded: the index exists, and the only way to
     * record anything on the row is the same save that just failed.
     */
    private async saveProviderMetadata(
        providerResult: Record<string, unknown> | undefined,
        params: CreateIndexParams,
        sanitizedName: string
    ): Promise<void> {
        try {
            this.ExternalID = sanitizedName; // The sanitized name used in the provider
            this.Dimensions = this.readProviderDimension(providerResult) ?? params.dimension;
            this.Metric = this.readProviderMetric(providerResult) ?? params.metric;

            // Store full provider response + our spec as JSON config while preserving existing keys (e.g. namespaceField)
            const extra: Record<string, unknown> = {};
            if (params.additionalParams) {
                extra['spec'] = params.additionalParams;
            }
            if (providerResult && typeof providerResult === 'object') {
                // Extract useful provider metadata (host, status, etc.)
                if ('host' in providerResult) extra['host'] = providerResult['host'];
                if ('status' in providerResult) extra['status'] = providerResult['status'];
            }
            this.ProviderConfig = this.buildProviderConfig({ state: 'provisioned' }, extra);

            const saved = await super.Save();
            if (saved) {
                LogStatus(`Saved provider metadata for index "${this.Name}"`);
            } else {
                LogError(this.writeBackFailureMessage(sanitizedName, this.LatestResult?.CompleteMessage ?? 'the record save returned false with no message'));
            }
        } catch (error) {
            LogError(this.writeBackFailureMessage(sanitizedName, error instanceof Error ? error.message : String(error)), undefined, error);
        }
    }

    private writeBackFailureMessage(sanitizedName: string, reason: string): string {
        return `Vector index "${this.Name}" WAS created in the vector database provider as "${sanitizedName}", but its ` +
            `provider metadata could not be written back to the record: ${reason}. The index exists and the record ` +
            `does not yet address it; set ExternalID to "${sanitizedName}" to reconcile them.`;
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
     * Best-effort by construction: this runs after the caller's save has already returned, and a
     * second failure here must not replace the original diagnosis with a save error.
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

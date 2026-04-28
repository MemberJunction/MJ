import { BaseEntity, LogError, LogStatus, Metadata, RunView } from "@memberjunction/core";
import { RegisterClass, MJGlobal } from "@memberjunction/global";
import { MJVectorIndexEntity, MJVectorDatabaseEntity } from "@memberjunction/core-entities";
import { VectorDBBase, CreateIndexParams, IndexModelMetricEnum } from "@memberjunction/ai-vectordb";
import { GetAIAPIKey } from "@memberjunction/ai";

/**
 * Server-side VectorIndex entity that syncs with the vector database provider.
 * On create: calls vectorDB.CreateIndex() to provision the index in the provider (e.g., Pinecone).
 * On delete: calls vectorDB.DeleteIndex() to remove the index from the provider.
 */
@RegisterClass(BaseEntity, 'MJ: Vector Indexes')
export class MJVectorIndexEntityServer extends MJVectorIndexEntity {
    /**
     * After saving, if this is a new record, create the index in the provider.
     */
    public override async Save(): Promise<boolean> {
        const isNew = this.IsSaved === false;
        const saveResult = await super.Save();

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
     * Create the index in the vector database provider.
     */
    private async createIndexInProvider(): Promise<void> {
        const vectorDB = await this.getVectorDBInstance();
        if (!vectorDB) {
            LogError(`Cannot create index: no VectorDB instance for database ${this.VectorDatabaseID}`);
            return;
        }

        // Sanitize the index name for the provider (e.g., Pinecone requires lowercase, no spaces)
        const sanitizedName = this.sanitizeIndexName(this.Name);
        if (sanitizedName !== this.Name) {
            LogStatus(`Index name sanitized from "${this.Name}" to "${sanitizedName}" for vector DB provider compatibility`);
        }

        const params: CreateIndexParams = {
            id: sanitizedName,
            dimension: this.resolveDimensions(),
            metric: 'cosine' as IndexModelMetricEnum,
            additionalParams: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        };

        LogStatus(`Creating index "${sanitizedName}" in vector DB provider...`);
        try {
            const result = await vectorDB.CreateIndex(params);
            if (result.success) {
                LogStatus(`Index "${sanitizedName}" created successfully in provider`);
                await this.saveProviderMetadata(result.data, params, sanitizedName);
            } else {
                LogError(`Provider returned error creating index "${sanitizedName}": ${result.message}`);
            }
        } catch (error) {
            LogError(`Exception while creating index "${sanitizedName}" in vector DB provider`, undefined, error);
        }
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

        const apiKey = GetAIAPIKey(classKey);
        if (!apiKey) {
            LogError(`No API key found for vector DB provider "${classKey}"`);
            return null;
        }

        return MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, classKey, apiKey
        );
    }

    /**
     * Resolve embedding dimensions from the associated AI model.
     * Default to 1536 (OpenAI text-embedding-3-small) if not determinable.
     */
    private resolveDimensions(): number {
        // TODO: Look up the embedding model's dimension count from metadata
        // For now, default to 1536 which covers most common embedding models
        return 1536;
    }

    /**
     * After provider creates the index, save the returned metadata back to our record.
     * Stores ExternalID, Dimensions, Metric, and full provider config as JSON.
     */
    private async saveProviderMetadata(
        providerResult: Record<string, unknown> | undefined,
        params: CreateIndexParams,
        sanitizedName: string
    ): Promise<void> {
        try {
            // Save what we know from our params + whatever the provider returned
            this.ExternalID = sanitizedName; // The sanitized name used in the provider
            this.Dimensions = params.dimension;
            this.Metric = params.metric;

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
            this.ProviderConfig = JSON.stringify(config);

            const saved = await super.Save();
            if (saved) {
                LogStatus(`Saved provider metadata for index "${this.Name}"`);
            } else {
                LogError(`Failed to save provider metadata for index "${this.Name}": ${this.LatestResult?.CompleteMessage}`);
            }
        } catch (error) {
            LogError(`Error saving provider metadata for index "${this.Name}"`, undefined, error);
        }
    }
}

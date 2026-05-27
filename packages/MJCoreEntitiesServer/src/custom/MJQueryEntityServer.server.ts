import {
    BaseEntity,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    SimpleEmbeddingResult,
} from "@memberjunction/core";
import { MJQuerySQLEntity, MJQueryEntityExtended, MJSQLDialectEntity, QueryEngine } from "@memberjunction/core-entities";
import { RegisterClass, MJGlobal, UUIDsEqual } from "@memberjunction/global";
import { EmbedTextLocalHelper } from "./util";
import {
    RunExtractionPipeline,
    CleanupQueryData,
    ConvertTSQLToPostgreSQL,
} from "./query-extraction";
import type { QuerySyncContext } from "./query-extraction";

/**
 * Server-side query entity with embedding generation, SQL extraction pipeline,
 * and dialect auto-conversion. Extends `MJQueryEntityExtended` which provides
 * child-relationship getters and business logic available on both client and server.
 */
@RegisterClass(BaseEntity, 'MJ: Queries')
export class MJQueryEntityServer extends MJQueryEntityExtended {
    /** Optional caller-provided parameter sample values. When set, these override
     *  LLM-generated sampleValues during the extraction pipeline. Use this to pass
     *  tested/validated values from the calling system.
     *  Keys are parameter names, values are the tested sample values. */
    public ParameterHints?: Map<string, string>;

    // ─── Embedding Methods ───────────────────────────────────────────────────────

    /**
     * Simple proxy to local helper method for embeddings. Needed for BaseEntity sub-classes that want to use embeddings built into BaseEntity
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    /**
     * Generates an embedding from composite text (Name + UserQuestion + Description) for richer semantic search.
     * Stores the vector in EmbeddingVector and the model reference in EmbeddingModelID.
     */
    protected async GenerateCompositeEmbedding(): Promise<void> {
        const parts = [
            this.Name || '',
            this.UserQuestion || '',
            this.Description || ''
        ].filter(p => p.trim().length > 0);

        if (parts.length === 0) {
            this.EmbeddingVector = null;
            this.EmbeddingModelID = null;
            return;
        }

        const compositeText = parts.join(' | ');
        const result = await this.EmbedTextLocal(compositeText);
        if (result && result.vector && result.vector.length > 0) {
            this.EmbeddingVector = JSON.stringify(result.vector);
            this.EmbeddingModelID = result.modelID;
        }
    }

    // ─── Save / Delete Overrides ─────────────────────────────────────────────────

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            const sqlField = this.GetFieldByName('SQL');
            const nameField = this.GetFieldByName('Name');
            const descriptionField = this.GetFieldByName('Description');
            const userQuestionField = this.GetFieldByName('UserQuestion');
            const shouldExtractData = !this.IsSaved || sqlField.Dirty;
            const shouldGenerateEmbedding = !this.IsSaved || nameField.Dirty || descriptionField.Dirty || userQuestionField.Dirty;

            // Generate embedding from composite text for better semantic search
            if (shouldGenerateEmbedding) {
                await this.GenerateCompositeEmbedding();
            } else if (!this.Description || this.Description.trim().length === 0) {
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            // Save the query first without AI processing
            const saveResult = await super.Save(options);
            if (!saveResult) {
                return false;
            }

            // Extract and sync parameters AFTER saving, outside of any transaction
            if (shouldExtractData && this.SQL && this.SQL.trim().length > 0) {
                await this.extractAndSyncDataAsync();
                await this.autoConvertDialectsAsync();
            } else if (!this.SQL || this.SQL.trim().length === 0) {
                this.UsesTemplate = false;
                await this.cleanupEmptyQueryAsync();
            }

            return true;
        } catch (e) {
            LogError('Failed to save query:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }

    override async Delete(options?: EntitySaveOptions): Promise<boolean> {
        try {
            const deleteResult = await super.Delete(options);
            if (!deleteResult) {
                return false;
            }
            return deleteResult;
        } catch (e) {
            LogError('Failed to delete query:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }

    // ─── Pipeline Delegation ─────────────────────────────────────────────────────

    /**
     * Builds the QuerySyncContext from this entity instance for use by the extraction pipeline.
     */
    private buildSyncContext(): QuerySyncContext {
        return {
            queryID: this.ID,
            queryName: this.Name,
            sql: this.SQL,
            isSaved: this.IsSaved,
            contextUser: this.ContextCurrentUser,
            metadataProvider: this.ProviderToUse as unknown as IMetadataProvider,
            runViewProvider: this.RunViewProviderToUse,
            parameterHints: this.ParameterHints,
        };
    }

    /**
     * Runs the extraction pipeline and saves the UsesTemplate flag.
     * On error, sets UsesTemplate=false and attempts to save so the query remains usable.
     */
    private async extractAndSyncDataAsync(): Promise<void> {
        try {
            const ctx = this.buildSyncContext();
            const pipelineResult = await RunExtractionPipeline(ctx);
            this.UsesTemplate = pipelineResult.usesTemplate;

            // Save the query again to persist UsesTemplate and any changes from AI processing
            const updateResult = await super.Save();
            if (!updateResult) {
                LogError('Failed to save query after AI processing completed');
            }
        } catch (e) {
            LogError('Error in async AI processing:', e);
            this.UsesTemplate = false;
            try {
                await super.Save();
            } catch (saveError) {
                LogError('Failed to save query after AI processing error:', saveError);
            }
        }
    }

    /**
     * Cleans up all extraction data when SQL is empty, then saves the updated UsesTemplate flag.
     */
    private async cleanupEmptyQueryAsync(): Promise<void> {
        try {
            const ctx = this.buildSyncContext();
            await CleanupQueryData(ctx);

            // Also remove dialect records (not managed by the pipeline)
            await this.removeAllQuerySQLRecordsAsync();

            const updateResult = await super.Save();
            if (!updateResult) {
                LogError('Failed to save query after cleanup');
            }
        } catch (e) {
            LogError('Error in async cleanup:', e);
        }
    }

    // ─── Dialect Conversion ──────────────────────────────────────────────────────

    /**
     * Auto-converts the query's SQL to other dialects based on the queryDialects
     * configuration stored in GlobalObjectStore. Best-effort: failures never block the save.
     */
    private async autoConvertDialectsAsync(): Promise<void> {
        try {
            const config = MJGlobal.Instance.GetGlobalObjectStore()?.['queryDialects'] as
                { autoConvertOnSave?: boolean; targetPlatforms?: string[] } | undefined;

            if (!config?.autoConvertOnSave || !config.targetPlatforms?.length) {
                return;
            }

            if (!this.SQL || this.SQL.trim().length === 0) {
                return;
            }

            const qe = QueryEngine.Instance;
            const dialects = qe.SQLDialects;

            const sourceDialect = this.SQLDialectID
                ? dialects.find(d => UUIDsEqual(d.ID, this.SQLDialectID))
                : dialects.find(d => d.PlatformKey === 'sqlserver');

            if (!sourceDialect) {
                console.warn(`Query "${this.Name}" - Could not determine source dialect, skipping auto-convert`);
                return;
            }

            for (const targetPlatformKey of config.targetPlatforms) {
                await this.convertToTargetDialect(sourceDialect, targetPlatformKey, dialects);
            }
        } catch (e) {
            console.warn(`Query "${this.Name}" - Auto-convert dialects failed:`, e);
        }
    }

    /**
     * Converts and persists SQL for a single target dialect. Logs warnings on skip/failure.
     */
    private async convertToTargetDialect(
        sourceDialect: MJSQLDialectEntity,
        targetPlatformKey: string,
        dialects: MJSQLDialectEntity[]
    ): Promise<void> {
        try {
            if (targetPlatformKey === sourceDialect.PlatformKey) {
                return;
            }

            const targetDialect = dialects.find(d => d.PlatformKey === targetPlatformKey);
            if (!targetDialect) {
                console.warn(`Query "${this.Name}" - Target dialect "${targetPlatformKey}" not found, skipping`);
                return;
            }

            if (sourceDialect.PlatformKey !== 'sqlserver' || targetPlatformKey !== 'postgresql') {
                console.warn(`Query "${this.Name}" - Conversion from "${sourceDialect.PlatformKey}" to "${targetPlatformKey}" not yet supported`);
                return;
            }

            const convertedSQL = ConvertTSQLToPostgreSQL(this.SQL);
            await this.upsertQuerySQLRecord(targetDialect, convertedSQL);
        } catch (platformError) {
            console.warn(`Query "${this.Name}" - Auto-convert to "${targetPlatformKey}" failed:`, platformError);
        }
    }

    /**
     * Creates or updates a QuerySQL record for the given dialect.
     */
    private async upsertQuerySQLRecord(
        targetDialect: MJSQLDialectEntity,
        convertedSQL: string,
    ): Promise<void> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;

        // Look up existing record from QueryEngine cache instead of a RunView call
        const existing = QueryEngine.Instance.QuerySQLs.find(
            qs => UUIDsEqual(qs.QueryID, this.ID) && UUIDsEqual(qs.SQLDialectID, targetDialect.ID)
        );

        let record: MJQuerySQLEntity;
        if (existing) {
            record = existing;
        } else {
            record = await md.GetEntityObject<MJQuerySQLEntity>('MJ: Query SQLs', this.ContextCurrentUser);
            record.QueryID = this.ID;
            record.SQLDialectID = targetDialect.ID;
        }

        record.SQL = convertedSQL;

        const saved = await record.Save();
        if (!saved) {
            console.warn(`Query "${this.Name}" - Failed to save QuerySQL record for dialect "${targetDialect.Name}"`);
        }
    }

    /**
     * Removes all QuerySQL records for this query. Called during cleanup operations.
     */
    private async removeAllQuerySQLRecordsAsync(): Promise<void> {
        try {
            if (!this.IsSaved) return;

            const records = QueryEngine.Instance.QuerySQLs.filter(
                qs => UUIDsEqual(qs.QueryID, this.ID)
            );

            const deletePromises = records.map(r => r.Delete());
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
        } catch (e) {
            console.warn(`Query "${this.Name}" - Failed to remove QuerySQL records:`, e);
        }
    }
}

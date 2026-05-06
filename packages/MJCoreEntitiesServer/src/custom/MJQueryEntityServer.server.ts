import {
    BaseEntity,
    CompositeKey,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    Metadata,
    QueryEntityInfo,
    QueryFieldInfo,
    QueryParameterInfo,
    QueryPermissionInfo,
    SimpleEmbeddingResult,
    SQLDialectInfo,
} from "@memberjunction/core";
import { MJQueryEntity, MJQuerySQLEntity } from "@memberjunction/core-entities";
import { RegisterClass, MJGlobal, UUIDsEqual } from "@memberjunction/global";
import { EmbedTextLocalHelper } from "./util";
import {
    RunExtractionPipeline,
    CleanupQueryData,
    ConvertTSQLToPostgreSQL,
} from "./query-extraction";
import type { QuerySyncContext } from "./query-extraction";

@RegisterClass(BaseEntity, 'MJ: Queries')
export class MJQueryEntityServer extends MJQueryEntity {
    private _queryEntities: QueryEntityInfo[] = [];
    private _queryFields: QueryFieldInfo[] = [];
    private _queryParameters: QueryParameterInfo[] = [];
    private _queryPermissions: QueryPermissionInfo[] = [];

    public get QueryEntities(): QueryEntityInfo[] {
        return this._queryEntities;
    }

    public get QueryFields(): QueryFieldInfo[] {
        return this._queryFields;
    }

    public get QueryParameters(): QueryParameterInfo[] {
        return this._queryParameters;
    }

    public get QueryPermissions(): QueryPermissionInfo[] {
        return this._queryPermissions;
    }

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
                await this.RefreshRelatedMetadata(true);
            } else if (!this.SQL || this.SQL.trim().length === 0) {
                this.UsesTemplate = false;
                await this.cleanupEmptyQueryAsync();
                await this.RefreshRelatedMetadata(true);
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

            // Refresh metadata cache after deletion to prevent stale query references
            await this.RefreshRelatedMetadata(true);
            return true;
        } catch (e) {
            LogError('Failed to delete query:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }

    // ─── Pipeline Delegation ─────────────────────────────────────────────────────

    /**
     * Builds a category path string from a CategoryID by walking up the category hierarchy.
     * Returns a slash-delimited path like "Ground-Truth-Queries/Sales" or "Ground-Truth-Queries".
     */
    public BuildCategoryPathFromID(categoryID: string): string {
        const categories = (this.ProviderToUse as unknown as IMetadataProvider).QueryCategories;
        const segments: string[] = [];
        let currentID: string | null = categoryID;

        while (currentID) {
            const cat = categories.find(c => c.ID.toLowerCase() === currentID!.toLowerCase());
            if (!cat) break;
            segments.unshift(cat.Name);
            currentID = cat.ParentID;
        }

        return segments.join('/');
    }

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

            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const dialects = md.SQLDialects;

            const sourceDialect = this.SQLDialectID
                ? dialects.find(d => UUIDsEqual(d.ID, this.SQLDialectID))
                : dialects.find(d => d.PlatformKey === 'sqlserver');

            if (!sourceDialect) {
                console.warn(`Query "${this.Name}" - Could not determine source dialect, skipping auto-convert`);
                return;
            }

            for (const targetPlatformKey of config.targetPlatforms) {
                await this.convertToTargetDialect(sourceDialect, targetPlatformKey, md, dialects);
            }
        } catch (e) {
            console.warn(`Query "${this.Name}" - Auto-convert dialects failed:`, e);
        }
    }

    /**
     * Converts and persists SQL for a single target dialect. Logs warnings on skip/failure.
     */
    private async convertToTargetDialect(
        sourceDialect: SQLDialectInfo,
        targetPlatformKey: string,
        md: IMetadataProvider,
        dialects: SQLDialectInfo[]
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
            await this.upsertQuerySQLRecord(targetDialect, convertedSQL, md);
        } catch (platformError) {
            console.warn(`Query "${this.Name}" - Auto-convert to "${targetPlatformKey}" failed:`, platformError);
        }
    }

    /**
     * Creates or updates a QuerySQL record for the given dialect.
     */
    private async upsertQuerySQLRecord(
        targetDialect: SQLDialectInfo,
        convertedSQL: string,
        md: IMetadataProvider
    ): Promise<void> {
        const rv = this.RunViewProviderToUse;

        const existingResult = await rv.RunView<MJQuerySQLEntity>({
            EntityName: 'MJ: Query SQLs',
            ExtraFilter: `QueryID='${this.ID}' AND SQLDialectID='${targetDialect.ID}'`,
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);

        if (!existingResult.Success) {
            console.warn(`Query "${this.Name}" - Failed to look up existing QuerySQL record: ${existingResult.ErrorMessage}`);
            return;
        }

        let record: MJQuerySQLEntity;
        if (existingResult.Results?.length > 0) {
            record = existingResult.Results[0];
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

            const rv = this.RunViewProviderToUse;
            const result = await rv.RunView<MJQuerySQLEntity>({
                EntityName: 'MJ: Query SQLs',
                ExtraFilter: `QueryID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            if (!result.Success) {
                console.warn(`Query "${this.Name}" - Failed to load QuerySQL records for cleanup: ${result.ErrorMessage}`);
                return;
            }

            const deletePromises = (result.Results || []).map(r => r.Delete());
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
        } catch (e) {
            console.warn(`Query "${this.Name}" - Failed to remove QuerySQL records:`, e);
        }
    }

    // ─── Load Overrides ──────────────────────────────────────────────────────────

    override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.Load(ID, EntityRelationshipsToLoad);
        await this.RefreshRelatedMetadata(false);
        return result;
    }

    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad);
        await this.RefreshRelatedMetadata(false);
        return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BaseEntity.LoadFromData uses `any` for the data parameter
    override async LoadFromData(data: any, _replaceOldValues?: boolean): Promise<boolean> {
        const result = await super.LoadFromData(data, _replaceOldValues);
        await this.RefreshRelatedMetadata(false);
        return result;
    }

    // ─── Metadata Refresh ────────────────────────────────────────────────────────

    /**
     * Refreshes this record's related metadata from the provider, refreshing
     * all the way up from the database if refreshFromDB is true, otherwise from cache.
     */
    public async RefreshRelatedMetadata(refreshFromDB: boolean): Promise<void> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        if (refreshFromDB) {
            const globalMetadataProvider = Metadata.Provider; // global-provider-ok: explicit refresh from canonical global metadata
            await globalMetadataProvider.Refresh(md);
            if (globalMetadataProvider !== md) {
                await md.Refresh();
            }
        }
        this._queryPermissions = md.QueryPermissions.filter(p => UUIDsEqual(p.QueryID, this.ID));
        this._queryEntities = md.QueryEntities.filter(e => UUIDsEqual(e.QueryID, this.ID));
        this._queryFields = md.QueryFields.filter(f => UUIDsEqual(f.QueryID, this.ID));
        this._queryParameters = md.QueryParameters.filter(p => UUIDsEqual(p.QueryID, this.ID));
    }
}

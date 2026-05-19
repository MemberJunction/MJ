import { BaseEntity, EntitySaveOptions, LogError, Metadata, RunView, IMetadataProvider } from "@memberjunction/core";
import { MJTemplateContentEntity, MJTemplateParamEntity, MJTemplateEntity } from "@memberjunction/core-entities";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { RunTemplateExtractionPipeline } from "./template-extraction";
import type { MergedTemplateParameter } from "./template-extraction";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";

@RegisterClass(BaseEntity, 'MJ: Template Contents')
export class MJTemplateContentEntityServer extends MJTemplateContentEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const provider = this.ProviderToUse as unknown as SQLServerDataProvider;

        // Start a database transaction
        await provider.BeginTransaction();

        try {
            // Check if this is a new record or if TemplateText has changed
            const templateTextField = this.GetFieldByName('TemplateText');
            const shouldExtractParams = !this.IsSaved || templateTextField.Dirty;

            // Save the template content first
            const saveResult = await super.Save(options);

            if (!saveResult) {
                await provider.RollbackTransaction();
                return false;
            }

            // Extract and sync parameters if needed
            if (shouldExtractParams && this.TemplateText && this.TemplateText.trim().length > 0) {
                await this.extractAndSyncParameters();
            }

            // Commit the transaction
            await provider.CommitTransaction();
            return true;
        } catch (e) {
            // Rollback on any error
            await provider.RollbackTransaction();
            LogError('Failed to save template content and extract parameters:', e);
            throw e;
        }
    }

    private async extractAndSyncParameters(): Promise<void> {
        // Nest the AI-driven extraction in its own transaction (a SAVEPOINT
        // on PG, a SAVE TRANSACTION on SS) so any failure inside this step
        // can't poison the parent `super.Save()`'s outer tx.
        //
        // SS and PG diverge on statement-error policy: SS rolls back only the
        // failing statement and keeps the tx alive, so the existing
        // try/catch + LogError already does the right thing there. PG aborts
        // the *entire* outer tx on any stmt error and refuses every
        // subsequent command except `ROLLBACK [TO SAVEPOINT]`. Failures here
        // are common — the AI prompt runner makes lookups that error when
        // no models have credentials, and the inner spCreateTemplateParam
        // call can hit signature-skew or transient DB issues — all of which
        // would otherwise bubble up to the parent `CommitTransaction` as
        // `current transaction is aborted, commands ignored until end of
        // transaction block` on PG, killing the entire `mj sync push`
        // batch even though the original `super.Save()` succeeded.
        //
        // The savepoint absorbs those errors and keeps PG's behavior
        // matching SS: the parent save commits, the parameter extraction
        // is best-effort. Nested begin/commit on SS has no abort to
        // recover from, so it's a transparent no-op.
        const provider = this.ProviderToUse as unknown as SQLServerDataProvider;
        await provider.BeginTransaction();
        try {
            // Run the hybrid extraction pipeline: deterministic parse + AI enrichment
            const result = await RunTemplateExtractionPipeline(
                this.TemplateText,
                this.Template,
                this.ContextCurrentUser,
            );

            if (result.warnings.length > 0) {
                console.warn('Template parameter extraction warnings:', result.warnings);
            }

            if (result.parameters.length > 0) {
                await this.syncTemplateParameters(result.parameters);
            }

            await provider.CommitTransaction();
        } catch (e) {
            // Best-effort rollback — RollbackTransaction itself can throw if
            // the underlying connection has already been torn down.
            try { await provider.RollbackTransaction(); } catch { /* swallow */ }
            LogError('Error extracting template parameters (rolled back to savepoint, parent save preserved):', e);
            // Don't re-throw — the parent save should still commit. The user
            // can still manually manage parameters if needed.
        }
    }

    private async syncTemplateParameters(extractedParams: MergedTemplateParameter[]): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        const md = this.ProviderToUse as unknown as IMetadataProvider;

        try {
            // Get existing template parameters
            const rv = this.RunViewProviderToUse;
            const existingParamsResult = await rv.RunView<MJTemplateParamEntity>({
                EntityName: 'MJ: Template Params',
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            if (!existingParamsResult.Success) {
                throw new Error(`Failed to load existing template parameters: ${existingParamsResult.ErrorMessage}`);
            }

            const existingParams = existingParamsResult.Results ?? [];

            // Determine if we're in single or multiple template content scenario
            const templateContentsResult = await rv.RunView({
                EntityName: 'MJ: Template Contents',
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                ResultType: 'simple'
            }, this.ContextCurrentUser);

            const isMultipleContents = templateContentsResult.Success &&
                                     templateContentsResult.Results &&
                                     templateContentsResult.Results.length > 1;

            // For single template content, all params have TemplateContentID = NULL
            // For multiple contents, we need to be more careful about global vs content-specific params
            const templateContentID = isMultipleContents ? this.ID : null;

            // Filter existing params relevant to this content
            const relevantExistingParams = existingParams.filter(p =>
                isMultipleContents ? UUIDsEqual(p.TemplateContentID, this.ID) : p.TemplateContentID == null
            );

            // Convert extracted param names to lowercase for comparison
            const extractedParamNames = extractedParams.map(p => p.name.toLowerCase());

            // Find parameters to add, update, or remove
            const paramsToAdd = extractedParams.filter(p =>
                !relevantExistingParams.some(ep => ep.Name.toLowerCase() === p.name.toLowerCase())
            );

            const paramsToUpdate = relevantExistingParams.filter(ep =>
                extractedParams.some(p => p.name.toLowerCase() === ep.Name.toLowerCase())
            );

            const paramsToRemove = relevantExistingParams.filter(ep =>
                !extractedParamNames.includes(ep.Name.toLowerCase())
            );

            // Prepare all save/delete operations
            const promises: Promise<boolean>[] = [];

            // Add new parameters
            for (const param of paramsToAdd) {
                const newParam = await md.GetEntityObject<MJTemplateParamEntity>('MJ: Template Params', this.ContextCurrentUser);
                newParam.TemplateID = this.TemplateID;
                newParam.TemplateContentID = templateContentID;
                newParam.Name = param.name;
                newParam.Type = param.type;
                newParam.IsRequired = param.isRequired;
                newParam.DefaultValue = param.defaultValue;
                newParam.Description = param.description;
                promises.push(newParam.Save());
            }

            // Update existing parameters if properties changed
            for (const existingParam of paramsToUpdate) {
                const extractedParam = extractedParams.find(p => p.name.toLowerCase() === existingParam.Name.toLowerCase());
                if (extractedParam) {
                    let hasChanges = false;

                    if (existingParam.Type !== extractedParam.type) {
                        existingParam.Type = extractedParam.type;
                        hasChanges = true;
                    }
                    if (existingParam.IsRequired !== extractedParam.isRequired) {
                        existingParam.IsRequired = extractedParam.isRequired;
                        hasChanges = true;
                    }
                    if (existingParam.DefaultValue !== extractedParam.defaultValue) {
                        existingParam.DefaultValue = extractedParam.defaultValue;
                        hasChanges = true;
                    }
                    if (existingParam.Description !== extractedParam.description) {
                        existingParam.Description = extractedParam.description;
                        hasChanges = true;
                    }

                    if (hasChanges) {
                        promises.push(existingParam.Save());
                    }
                }
            }

            // Remove parameters that are no longer in the template
            for (const paramToRemove of paramsToRemove) {
                promises.push(paramToRemove.Delete());
            }

            // Execute all operations in parallel
            if (promises.length > 0) {
                await Promise.all(promises); // saving these is non-critical
            }
        } catch (e) {
            LogError('Failed to sync template parameters:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
}

/**
 * @fileoverview On-demand Integration-as-Actions PERSISTER service.
 *
 * Where `ActionMetadataGenerator` produces mj-sync JSON for the design-time CLI,
 * this service generates AND persists a single strongly-typed Action (for one
 * integration / object / verb) directly to the MJ database via BaseEntity.Save().
 *
 * It is the runtime, idempotent counterpart used when an agent/workflow needs an
 * integration action created on the fly:
 *
 *   1. Load the IntegrationObject + its IntegrationObjectFields from the DB.
 *   2. Map them into ActionMetadataGenerator's IntegrationObjectInfo shape.
 *   3. Run the SAME generator the CLI uses, then pick the requested verb's record.
 *   4. Find-or-create the Action Category, then upsert the Action + its params +
 *      result codes (idempotent on the deterministic Action Name).
 *
 * The generated Action uses DriverClass='IntegrationActionExecutor' and stores
 * routing info ({IntegrationName, ObjectName, Verb}) in Action.Config_ — the
 * IntegrationActionExecutor (CoreActions) is the single runtime dispatcher.
 */

import { IMetadataProvider, Metadata, RunView, UserInfo, LogError } from '@memberjunction/core';
import type {
    MJActionEntity,
    MJActionParamEntity,
    MJActionResultCodeEntity,
    MJActionCategoryEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import {
    ActionMetadataGenerator,
    type IntegrationObjectInfo,
    type IntegrationFieldInfo,
    type ActionGeneratorConfig,
} from './ActionMetadataGenerator.js';

// ─── Public Contract ─────────────────────────────────────────────────

/** CRUD verb that an integration action can dispatch to */
export type IntegrationActionVerb = 'Get' | 'Create' | 'Update' | 'Delete' | 'Upsert' | 'Search' | 'List';

/** Result of generating+persisting a single integration action */
export interface GenerateIntegrationActionResult {
    Success: boolean;
    ActionID?: string;
    ActionName?: string;
    Verb: IntegrationActionVerb;
    ObjectName: string;
    /** True if a matching action already existed and was reused (idempotent reuse) */
    AlreadyExisted: boolean;
    Message: string;
}

// ─── Internal mj-sync record shapes (produced by ActionMetadataGenerator) ──

interface GeneratedRelated {
    fields: Record<string, unknown>;
}

interface GeneratedActionRecord {
    fields: Record<string, unknown>;
    relatedEntities: {
        'MJ: Action Params': GeneratedRelated[];
        'MJ: Action Result Codes': GeneratedRelated[];
    };
}

// ─── Service ─────────────────────────────────────────────────────────

/**
 * Generates and persists strongly-typed integration actions on demand.
 * Idempotent: reuses an existing Action with the same deterministic Name and
 * reconciles its params/result codes rather than duplicating.
 */
export class IntegrationActionGenerator {

    /** All verbs in canonical order, used by GenerateActionsForObject */
    private static readonly AllVerbs: IntegrationActionVerb[] = [
        'Get', 'Create', 'Update', 'Delete', 'Upsert', 'Search', 'List',
    ];

    /**
     * Generate + persist ONE strongly-typed action for (integration, object, verb).
     * Idempotent on the deterministic Name "<Integration> - <Verb> <DisplayName>".
     */
    public async GenerateAction(
        integrationName: string,
        objectName: string,
        verb: IntegrationActionVerb,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GenerateIntegrationActionResult> {
        const md = this.resolveProvider(provider);
        try {
            const objectInfo = await this.loadObjectInfo(md, integrationName, objectName, contextUser);
            if (!objectInfo) {
                return this.failure(verb, objectName,
                    `IntegrationObject "${objectName}" not found for integration "${integrationName}"`);
            }

            const record = this.buildActionRecord(integrationName, objectInfo, verb);
            if (!record) {
                return this.failure(verb, objectName,
                    `Verb "${verb}" is not applicable to object "${objectName}" (write not supported)`);
            }

            const categoryID = await this.ensureCategory(md, integrationName, contextUser);
            return await this.persistAction(md, record, verb, objectName, categoryID, contextUser);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return this.failure(verb, objectName, `Unexpected error: ${msg}`);
        }
    }

    /**
     * Generate all applicable verbs for an object. Get/Search/List are always
     * applicable; Create/Update/Delete/Upsert only when the object SupportsWrite.
     */
    public async GenerateActionsForObject(
        integrationName: string,
        objectName: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GenerateIntegrationActionResult[]> {
        const md = this.resolveProvider(provider);
        const objectInfo = await this.loadObjectInfo(md, integrationName, objectName, contextUser);
        if (!objectInfo) {
            return [this.failure('Get', objectName,
                `IntegrationObject "${objectName}" not found for integration "${integrationName}"`)];
        }

        const verbs = this.applicableVerbs(objectInfo.SupportsWrite);
        const results: GenerateIntegrationActionResult[] = [];
        for (const verb of verbs) {
            results.push(await this.GenerateAction(integrationName, objectName, verb, contextUser, provider));
        }
        return results;
    }

    // ─── Provider ────────────────────────────────────────────────────

    private resolveProvider(provider?: IMetadataProvider): IMetadataProvider {
        return provider ?? Metadata.Provider;
    }

    private applicableVerbs(supportsWrite: boolean): IntegrationActionVerb[] {
        return IntegrationActionGenerator.AllVerbs.filter(v => {
            if (v === 'Create' || v === 'Update' || v === 'Delete' || v === 'Upsert') return supportsWrite;
            return true; // Get, Search, List always
        });
    }

    // ─── Object Loading ──────────────────────────────────────────────

    /**
     * Loads the IntegrationObject (by integration name + object name) and its
     * fields from the DB, mapping them into the generator's IntegrationObjectInfo.
     */
    private async loadObjectInfo(
        md: IMetadataProvider,
        integrationName: string,
        objectName: string,
        contextUser: UserInfo,
    ): Promise<IntegrationObjectInfo | null> {
        const rv = RunView.FromMetadataProvider(md);
        const objResult = await rv.RunView<MJIntegrationObjectEntity>({
            EntityName: 'MJ: Integration Objects',
            ExtraFilter:
                `Integration='${this.escape(integrationName)}' AND Name='${this.escape(objectName)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, contextUser);

        if (!objResult.Success || objResult.Results.length === 0) {
            return null;
        }
        const obj = objResult.Results[0];

        const fields = await this.loadObjectFields(md, obj.ID, contextUser);
        return {
            Name: obj.Name,
            DisplayName: obj.DisplayName ?? obj.Name,
            Description: obj.Description ?? undefined,
            SupportsWrite: obj.SupportsWrite,
            Fields: fields,
        };
    }

    private async loadObjectFields(
        md: IMetadataProvider,
        integrationObjectID: string,
        contextUser: UserInfo,
    ): Promise<IntegrationFieldInfo[]> {
        const rv = RunView.FromMetadataProvider(md);
        const fieldResult = await rv.RunView<MJIntegrationObjectFieldEntity>({
            EntityName: 'MJ: Integration Object Fields',
            ExtraFilter: `IntegrationObjectID='${this.escape(integrationObjectID)}'`,
            OrderBy: 'Sequence ASC, Name ASC',
            ResultType: 'entity_object',
        }, contextUser);

        if (!fieldResult.Success) return [];
        return fieldResult.Results.map(f => this.mapField(f));
    }

    private mapField(f: MJIntegrationObjectFieldEntity): IntegrationFieldInfo {
        return {
            Name: f.Name,
            DisplayName: f.DisplayName ?? f.Name,
            Description: f.Description ?? undefined,
            Type: f.Type,
            IsRequired: f.IsRequired,
            IsReadOnly: f.IsReadOnly,
            IsPrimaryKey: f.IsPrimaryKey,
        };
    }

    // ─── Metadata Generation ─────────────────────────────────────────

    /**
     * Runs ActionMetadataGenerator for this single object and returns the
     * generated record for the requested verb (matched by its Config.Verb).
     * Returns null if the verb isn't produced (e.g., write verb on read-only object).
     */
    private buildActionRecord(
        integrationName: string,
        objectInfo: IntegrationObjectInfo,
        verb: IntegrationActionVerb,
    ): GeneratedActionRecord | null {
        const config: ActionGeneratorConfig = {
            IntegrationName: integrationName,
            CategoryName: this.categoryName(integrationName),
            Objects: [objectInfo],
            // Search/List handled per-verb below; keep them in the generated set.
            IncludeSearch: true,
            IncludeList: true,
            CreateCategory: false, // category is persisted separately via ensureCategory
        };

        const generated = new ActionMetadataGenerator().Generate(config);
        const match = generated.ActionRecords.find(
            r => (r.fields['Config'] as { Verb?: string } | undefined)?.Verb === verb,
        );
        return (match as GeneratedActionRecord | undefined) ?? null;
    }

    // ─── Category ────────────────────────────────────────────────────

    /** Find-or-create the flat "<IntegrationName> Integration" Action Category. */
    private async ensureCategory(
        md: IMetadataProvider,
        integrationName: string,
        contextUser: UserInfo,
    ): Promise<string | null> {
        const name = this.categoryName(integrationName);
        const rv = RunView.FromMetadataProvider(md);
        const existing = await rv.RunView<MJActionCategoryEntity>({
            EntityName: 'MJ: Action Categories',
            ExtraFilter: `Name='${this.escape(name)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, contextUser);

        if (existing.Success && existing.Results.length > 0) {
            return existing.Results[0].ID;
        }

        const cat = await md.GetEntityObject<MJActionCategoryEntity>('MJ: Action Categories', contextUser);
        cat.NewRecord();
        cat.Name = name;
        cat.Description = `Actions for the ${integrationName} integration`;
        cat.Status = 'Active';
        const saved = await cat.Save();
        if (!saved) {
            LogError(`IntegrationActionGenerator: failed to create category '${name}': ${cat.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }
        return cat.ID;
    }

    private categoryName(integrationName: string): string {
        return `${integrationName} Integration`;
    }

    // ─── Persistence (idempotent) ────────────────────────────────────

    /**
     * Upserts the Action: reuses an existing one with the same deterministic Name
     * (AlreadyExisted=true, params/result codes reconciled) or creates a new one.
     */
    private async persistAction(
        md: IMetadataProvider,
        record: GeneratedActionRecord,
        verb: IntegrationActionVerb,
        objectName: string,
        categoryID: string | null,
        contextUser: UserInfo,
    ): Promise<GenerateIntegrationActionResult> {
        const actionName = record.fields['Name'] as string;
        const existing = await this.findExistingAction(md, actionName, contextUser);

        const action = existing ?? await md.GetEntityObject<MJActionEntity>('MJ: Actions', contextUser);
        const alreadyExisted = !!existing;
        if (!alreadyExisted) {
            action.NewRecord();
        }

        this.applyActionFields(action, record, categoryID);
        const saved = await action.Save();
        if (!saved) {
            return this.failure(verb, objectName,
                `Failed to save action '${actionName}': ${action.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        await this.persistParams(md, action.ID, record, alreadyExisted, contextUser);
        await this.persistResultCodes(md, action.ID, record, alreadyExisted, contextUser);

        return {
            Success: true,
            ActionID: action.ID,
            ActionName: actionName,
            Verb: verb,
            ObjectName: objectName,
            AlreadyExisted: alreadyExisted,
            Message: alreadyExisted
                ? `Reused existing action '${actionName}' and reconciled its params/result codes`
                : `Created action '${actionName}'`,
        };
    }

    private async findExistingAction(
        md: IMetadataProvider,
        actionName: string,
        contextUser: UserInfo,
    ): Promise<MJActionEntity | null> {
        const rv = RunView.FromMetadataProvider(md);
        const result = await rv.RunView<MJActionEntity>({
            EntityName: 'MJ: Actions',
            ExtraFilter: `Name='${this.escape(actionName)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, contextUser);

        return result.Success && result.Results.length > 0 ? result.Results[0] : null;
    }

    private applyActionFields(
        action: MJActionEntity,
        record: GeneratedActionRecord,
        categoryID: string | null,
    ): void {
        action.Name = record.fields['Name'] as string;
        action.Description = (record.fields['Description'] as string) ?? '';
        action.Type = 'Custom';
        action.Status = 'Active';
        action.DriverClass = (record.fields['DriverClass'] as string) ?? 'IntegrationActionExecutor';
        const configObj = record.fields['Config'];
        action.Config_ = typeof configObj === 'string' ? configObj : JSON.stringify(configObj);
        if (categoryID) action.CategoryID = categoryID;
        const iconClass = record.fields['IconClass'];
        if (iconClass) action.IconClass = iconClass as string;
    }

    /**
     * Persists Action Params. On reuse, deletes the existing params first so the
     * recreated set stays exactly in sync with the freshly generated metadata.
     */
    private async persistParams(
        md: IMetadataProvider,
        actionID: string,
        record: GeneratedActionRecord,
        alreadyExisted: boolean,
        contextUser: UserInfo,
    ): Promise<void> {
        if (alreadyExisted) {
            await this.deleteRelated<MJActionParamEntity>(md, 'MJ: Action Params', actionID, contextUser);
        }

        const params = record.relatedEntities['MJ: Action Params'] ?? [];
        for (const p of params) {
            const param = await md.GetEntityObject<MJActionParamEntity>('MJ: Action Params', contextUser);
            param.NewRecord();
            param.ActionID = actionID;
            param.Name = p.fields['Name'] as string;
            param.Type = (p.fields['Type'] as 'Input' | 'Output' | 'Both') ?? 'Input';
            param.ValueType = (p.fields['ValueType'] ?? 'Scalar') as MJActionParamEntity['ValueType'];
            param.IsArray = (p.fields['IsArray'] as boolean) ?? false;
            param.IsRequired = (p.fields['IsRequired'] as boolean) ?? false;
            if (p.fields['Description']) param.Description = p.fields['Description'] as string;
            const saved = await param.Save();
            if (!saved) {
                LogError(`IntegrationActionGenerator: failed to save param '${param.Name}' for action ${actionID}: ${param.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }

    /**
     * Persists Action Result Codes. On reuse, deletes the existing ones first to
     * keep them in sync with the generated metadata.
     */
    private async persistResultCodes(
        md: IMetadataProvider,
        actionID: string,
        record: GeneratedActionRecord,
        alreadyExisted: boolean,
        contextUser: UserInfo,
    ): Promise<void> {
        if (alreadyExisted) {
            await this.deleteRelated<MJActionResultCodeEntity>(md, 'MJ: Action Result Codes', actionID, contextUser);
        }

        const codes = record.relatedEntities['MJ: Action Result Codes'] ?? [];
        for (const c of codes) {
            const code = await md.GetEntityObject<MJActionResultCodeEntity>('MJ: Action Result Codes', contextUser);
            code.NewRecord();
            code.ActionID = actionID;
            code.ResultCode = c.fields['ResultCode'] as string;
            code.IsSuccess = (c.fields['IsSuccess'] as boolean) ?? false;
            if (c.fields['Description']) code.Description = c.fields['Description'] as string;
            const saved = await code.Save();
            if (!saved) {
                LogError(`IntegrationActionGenerator: failed to save result code '${code.ResultCode}' for action ${actionID}: ${code.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }

    /** Loads and deletes all rows of a child entity linked to the given ActionID. */
    private async deleteRelated<T extends MJActionParamEntity | MJActionResultCodeEntity>(
        md: IMetadataProvider,
        entityName: 'MJ: Action Params' | 'MJ: Action Result Codes',
        actionID: string,
        contextUser: UserInfo,
    ): Promise<void> {
        const rv = RunView.FromMetadataProvider(md);
        const result = await rv.RunView<T>({
            EntityName: entityName,
            ExtraFilter: `ActionID='${this.escape(actionID)}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) return;
        for (const row of result.Results) {
            const deleted = await row.Delete();
            if (!deleted) {
                LogError(`IntegrationActionGenerator: failed to delete ${entityName} row ${row.ID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private escape(value: string): string {
        return value.replace(/'/g, "''");
    }

    private failure(
        verb: IntegrationActionVerb,
        objectName: string,
        message: string,
    ): GenerateIntegrationActionResult {
        return { Success: false, Verb: verb, ObjectName: objectName, AlreadyExisted: false, Message: message };
    }
}

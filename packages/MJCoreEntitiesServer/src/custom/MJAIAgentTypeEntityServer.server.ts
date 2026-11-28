import {
    BaseEntity,
    EntityDeleteOptions,
    EntitySaveOptions,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import {
    SyncAgentTypeLegacyColumnsAndConfiguration,
    ValidateLegacyAgentTypeConfigFields,
    type LegacyAIAgentTypeConfigColumns,
} from '@memberjunction/ai-core-plus';
import { ValidateAgentScopedConfigurationJson } from './MJAIAgentCategoryEntityServer.server';
import { IsAgentAdminOrOwnerUser } from './MJAIAgentEntityServer.server';

/**
 * Pure admin-only guard for creating or updating `MJ: AI Agent Types` (`AIAgentType`).
 * System contexts (`contextUser == null`) remain permitted.
 */
export function ValidateAgentTypeMutation(
    typeName: string | null | undefined,
    contextUser: UserInfo | null | undefined
): ValidationErrorInfo[] {
    if (!IsAgentAdminOrOwnerUser(contextUser)) {
        return [
            new ValidationErrorInfo(
                'Name',
                'Only administrators may create or modify MJ: AI Agent Types.',
                typeName,
                ValidationErrorType.Failure
            ),
        ];
    }
    return [];
}

/**
 * Pure admin-only guard for deleting `MJ: AI Agent Types` (`AIAgentType`).
 * System contexts (`contextUser == null`) remain permitted.
 */
export function ValidateAgentTypeDelete(
    typeId: string | null | undefined,
    contextUser: UserInfo | null | undefined
): ValidationErrorInfo[] {
    if (!IsAgentAdminOrOwnerUser(contextUser)) {
        return [
            new ValidationErrorInfo(
                'ID',
                'Only administrators may delete MJ: AI Agent Types.',
                typeId,
                ValidationErrorType.Failure
            ),
        ];
    }
    return [];
}

/**
 * Server-side AI Agent Type entity restricting create/update/delete mutations to administrators,
 * maintaining bidirectional dirty-field sync during v6.x between
 * `AIAgentType.DefaultAgentConfiguration` (`IAgentConfiguration`) and the 7 deprecated
 * context-window legacy columns, and validating both `DefaultAgentConfiguration` JSON shape and
 * caller-dirty legacy column edits.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Types')
export class MJAIAgentTypeEntityServer extends MJAIAgentTypeEntity {
    private _configDirtyBeforeSync: boolean | null = null;
    private _dirtyLegacyPatchForValidation: Partial<LegacyAIAgentTypeConfigColumns> | null = null;

    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        const authErrors = ValidateAgentTypeMutation(this.Name, this.ContextCurrentUser);
        if (authErrors.length > 0) {
            result.Errors.push(...authErrors);
            result.Success = false;
            return result;
        }

        // Run full JSON validation on creates or when caller modified DefaultAgentConfiguration (R2-2 & R3-10).
        // When only legacy columns were modified, validate ONLY the caller-dirty legacy patch (C-R1-7).
        const configDirty =
            this._configDirtyBeforeSync ?? (!this.IsSaved || (this.GetFieldByName('DefaultAgentConfiguration')?.Dirty ?? false));
        if (!configDirty) {
            const dirtyPatch = this._dirtyLegacyPatchForValidation ?? this.collectDirtyLegacyPatch(!this.IsSaved);
            if (Object.keys(dirtyPatch).length > 0) {
                const legacyErrors = ValidateLegacyAgentTypeConfigFields(dirtyPatch);
                for (const msg of legacyErrors) {
                    result.Errors.push(
                        new ValidationErrorInfo('DefaultAgentConfiguration', msg, this.DefaultAgentConfiguration, ValidationErrorType.Failure)
                    );
                }
                result.Success = result.Errors.every((e) => e.Type !== ValidationErrorType.Failure);
            }
            return result;
        }

        const errors = ValidateAgentScopedConfigurationJson(
            this.DefaultAgentConfiguration,
            'DefaultAgentConfiguration',
            'AI Agent Type',
            this.ContextCurrentUser
        );
        result.Errors.push(...errors);
        result.Success = result.Errors.every((e) => e.Type !== ValidationErrorType.Failure);
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isCreate = !this.IsSaved;
        this._configDirtyBeforeSync = isCreate || (this.GetFieldByName('DefaultAgentConfiguration')?.Dirty ?? false);
        const dirtyPatch = this.collectDirtyLegacyPatch(isCreate);
        this._dirtyLegacyPatchForValidation = Object.keys(dirtyPatch).length > 0 ? dirtyPatch : null;
        try {
            this.syncDefaultAgentConfigurationWithLegacyColumns(isCreate);
            return await super.Save(options);
        } finally {
            this._configDirtyBeforeSync = null;
            this._dirtyLegacyPatchForValidation = null;
        }
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const errors = ValidateAgentTypeDelete(this.ID, this.ContextCurrentUser);
        if (errors.length > 0) {
            this.LatestResult?.Errors.push(...errors);
            return false;
        }
        return super.Delete(options);
    }

    private buildLegacyConfigValues(): LegacyAIAgentTypeConfigColumns {
        return {
            ContextCompressionMessageThreshold: this.ContextCompressionMessageThreshold,
            ContextCompressionPromptID: this.ContextCompressionPromptID,
            ContextCompressionMessageRetentionCount: this.ContextCompressionMessageRetentionCount,
            ContextWindowMaxTokens: this.ContextWindowMaxTokens,
            CompactionTriggerPercent: this.CompactionTriggerPercent,
            CompactionTargetPercent: this.CompactionTargetPercent,
            ConversationSummaryPromptID: this.ConversationSummaryPromptID,
        };
    }

    private isLegacyFieldExplicitlyWritten(fieldName: string, isCreate: boolean): boolean {
        const field = this.GetFieldByName(fieldName);
        if (!field) {
            return false;
        }
        return isCreate ? (field.Dirty === true || field.NeverSet === false) : field.Dirty === true;
    }

    private collectDirtyLegacyPatch(isCreate: boolean): Partial<LegacyAIAgentTypeConfigColumns> {
        const legacyValues = this.buildLegacyConfigValues();
        const patch: Partial<LegacyAIAgentTypeConfigColumns> = {};
        for (const key of Object.keys(legacyValues) as Array<keyof LegacyAIAgentTypeConfigColumns>) {
            if (this.isLegacyFieldExplicitlyWritten(key, isCreate)) {
                (patch as Record<string, unknown>)[key] = legacyValues[key];
            }
        }
        return patch;
    }

    private syncDefaultAgentConfigurationWithLegacyColumns(isCreate: boolean): void {
        const configField = this.GetFieldByName('DefaultAgentConfiguration');
        if (!configField) {
            // Database schema has not yet received the DefaultAgentConfiguration column (e.g., PostgreSQL prior to twin migration).
            return;
        }
        const legacyValues = this.buildLegacyConfigValues();
        const dirtyLegacyFields = new Set<keyof LegacyAIAgentTypeConfigColumns>(
            Object.keys(this.collectDirtyLegacyPatch(isCreate)) as Array<keyof LegacyAIAgentTypeConfigColumns>
        );

        const configDirty = this.isLegacyFieldExplicitlyWritten('DefaultAgentConfiguration', isCreate);
        const prevConfigJson = (configField.OldValue as string | null | undefined) ?? null;
        const syncResult = SyncAgentTypeLegacyColumnsAndConfiguration({
            IsNewRecord: isCreate,
            DefaultAgentConfigurationJson: this.DefaultAgentConfiguration,
            PreviousDefaultAgentConfigurationJson: isCreate ? null : prevConfigJson,
            DefaultAgentConfigurationDirty: configDirty,
            LegacyValues: legacyValues,
            DirtyLegacyFields: dirtyLegacyFields,
        });

        for (const [key, value] of Object.entries(syncResult.LegacyColumnUpdates)) {
            if (value !== undefined) {
                this.assignLegacyConfigField(key as keyof LegacyAIAgentTypeConfigColumns, value);
            }
        }
        if (syncResult.ShouldUpdateConfiguration) {
            this.DefaultAgentConfiguration = syncResult.ConfigurationJson;
        }
    }

    private assignLegacyConfigField<K extends keyof LegacyAIAgentTypeConfigColumns>(
        fieldName: K,
        value: LegacyAIAgentTypeConfigColumns[K]
    ): void {
        const target: LegacyAIAgentTypeConfigColumns = this;
        target[fieldName] = value;
    }
}

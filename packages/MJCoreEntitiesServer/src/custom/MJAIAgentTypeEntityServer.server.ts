import {
    BaseEntity,
    EntitySaveOptions,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import {
    SyncAgentTypeLegacyColumnsAndConfiguration,
    type LegacyAIAgentTypeConfigColumns,
} from '@memberjunction/ai-core-plus';
import { ValidateAgentScopedConfigurationJson } from './MJAIAgentCategoryEntityServer.server';

/**
 * Server-side AI Agent Type entity maintaining bidirectional dirty-field sync during v6.x
 * between `AIAgentType.DefaultAgentConfiguration` (`IAgentConfiguration`) and the 7 deprecated
 * context-window legacy columns, plus validating `DefaultAgentConfiguration` JSON shape and
 * enforcing admin-only / code-only `helperPlugins` rules.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Types')
export class MJAIAgentTypeEntityServer extends MJAIAgentTypeEntity {
    private _configDirtyBeforeSync: boolean | null = null;

    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        // Only run strict JSON validation on creates or when caller modified DefaultAgentConfiguration (R2-2 & R3-10)
        const configDirty =
            this._configDirtyBeforeSync ?? (!this.IsSaved || (this.GetFieldByName('DefaultAgentConfiguration')?.Dirty ?? false));
        if (!configDirty) {
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
        try {
            this.syncDefaultAgentConfigurationWithLegacyColumns(isCreate);
            return await super.Save(options);
        } finally {
            this._configDirtyBeforeSync = null;
        }
    }

    private syncDefaultAgentConfigurationWithLegacyColumns(isCreate: boolean): void {
        const configField = this.GetFieldByName('DefaultAgentConfiguration');
        if (!configField) {
            // Database schema has not yet received the DefaultAgentConfiguration column (e.g., PostgreSQL prior to twin migration).
            return;
        }
        const legacyValues: LegacyAIAgentTypeConfigColumns = {
            ContextCompressionMessageThreshold: this.ContextCompressionMessageThreshold,
            ContextCompressionPromptID: this.ContextCompressionPromptID,
            ContextCompressionMessageRetentionCount: this.ContextCompressionMessageRetentionCount,
            ContextWindowMaxTokens: this.ContextWindowMaxTokens,
            CompactionTriggerPercent: this.CompactionTriggerPercent,
            CompactionTargetPercent: this.CompactionTargetPercent,
            ConversationSummaryPromptID: this.ConversationSummaryPromptID,
        };

        const isExplicitlyWritten = (fieldName: string): boolean => {
            const field = this.GetFieldByName(fieldName);
            if (!field) {
                return false;
            }
            return isCreate ? (field.Dirty === true || field.NeverSet === false) : field.Dirty === true;
        };

        const dirtyLegacyFields = new Set<keyof LegacyAIAgentTypeConfigColumns>();
        for (const key of Object.keys(legacyValues) as Array<keyof LegacyAIAgentTypeConfigColumns>) {
            if (isExplicitlyWritten(key)) {
                dirtyLegacyFields.add(key);
            }
        }

        const configDirty = isExplicitlyWritten('DefaultAgentConfiguration');
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

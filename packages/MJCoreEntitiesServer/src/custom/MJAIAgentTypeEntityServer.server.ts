import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import {
    SyncAgentTypeLegacyColumnsAndConfiguration,
    type LegacyAIAgentTypeConfigColumns,
} from '@memberjunction/ai-core-plus';

/**
 * Server-side AI Agent Type entity maintaining bidirectional dirty-field sync during v6.x
 * between `AIAgentType.DefaultAgentConfiguration` (`IAgentConfiguration`) and the 7 deprecated
 * context-window legacy columns (`ContextCompressionMessageThreshold`, `ContextCompressionPromptID`,
 * `ContextCompressionMessageRetentionCount`, `ContextWindowMaxTokens`, `CompactionTriggerPercent`,
 * `CompactionTargetPercent`, `ConversationSummaryPromptID`).
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Types')
export class MJAIAgentTypeEntityServer extends MJAIAgentTypeEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isCreate = !this.IsSaved;
        this.syncDefaultAgentConfigurationWithLegacyColumns(isCreate);
        return super.Save(options);
    }

    private syncDefaultAgentConfigurationWithLegacyColumns(isCreate: boolean): void {
        const legacyValues: LegacyAIAgentTypeConfigColumns = {
            ContextCompressionMessageThreshold: this.ContextCompressionMessageThreshold,
            ContextCompressionPromptID: this.ContextCompressionPromptID,
            ContextCompressionMessageRetentionCount: this.ContextCompressionMessageRetentionCount,
            ContextWindowMaxTokens: this.ContextWindowMaxTokens,
            CompactionTriggerPercent: this.CompactionTriggerPercent,
            CompactionTargetPercent: this.CompactionTargetPercent,
            ConversationSummaryPromptID: this.ConversationSummaryPromptID,
        };

        const dirtyLegacyFields = new Set<keyof LegacyAIAgentTypeConfigColumns>();
        for (const key of Object.keys(legacyValues) as Array<keyof LegacyAIAgentTypeConfigColumns>) {
            if (this.GetFieldByName(key)?.Dirty === true) {
                dirtyLegacyFields.add(key);
            }
        }

        const configDirty = this.GetFieldByName('DefaultAgentConfiguration')?.Dirty === true;
        const syncResult = SyncAgentTypeLegacyColumnsAndConfiguration({
            IsNewRecord: isCreate,
            DefaultAgentConfigurationJson: this.DefaultAgentConfiguration,
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

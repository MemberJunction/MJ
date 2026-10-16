import { BaseEntity, IMetadataProvider, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentConfigurationEntity, MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: AI Agent Relationships` entity enforcing that when `ConfigurationPresetID` is set,
 * the referenced `MJ: AI Agent Configurations` preset exists and belongs to the relationship's `SubAgentID`.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Relationships')
export class MJAIAgentRelationshipEntityServer extends MJAIAgentRelationshipEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        if (!this.ConfigurationPresetID) {
            return result;
        }

        const presetDirty = this.GetFieldByName('ConfigurationPresetID')?.Dirty ?? false;
        const subAgentDirty = this.GetFieldByName('SubAgentID')?.Dirty ?? false;
        if (!this.IsSaved || presetDirty || subAgentDirty) {
            const presetError = await this.validateConfigurationPreset();
            if (presetError) {
                result.Errors.push(presetError);
                result.Success = false;
            }
        }

        return result;
    }

    private async validateConfigurationPreset(): Promise<ValidationErrorInfo | null> {
        if (!this.ConfigurationPresetID) {
            return null;
        }
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const preset = await md.GetEntityObject<MJAIAgentConfigurationEntity>(
            'MJ: AI Agent Configurations',
            this.ContextCurrentUser
        );
        const loaded = await preset.Load(this.ConfigurationPresetID);
        if (!loaded) {
            return BuildConfigurationPresetOwnershipError(this.ConfigurationPresetID, this.SubAgentID, null);
        }
        return BuildConfigurationPresetOwnershipError(
            this.ConfigurationPresetID,
            this.SubAgentID,
            preset.AgentID ?? null,
            preset.Name ?? undefined
        );
    }
}

/**
 * PURE invariant core for `ConfigurationPresetID` on `MJ: AI Agent Relationships`:
 * when set, the referenced preset must exist and its `AgentID` must match `SubAgentID`.
 */
export function BuildConfigurationPresetOwnershipError(
    configurationPresetID: string | null,
    subAgentID: string | null,
    presetAgentID: string | null,
    presetName?: string
): ValidationErrorInfo | null {
    if (!configurationPresetID) {
        return null;
    }
    if (presetAgentID === null) {
        return new ValidationErrorInfo(
            'ConfigurationPresetID',
            `ConfigurationPresetID references preset '${configurationPresetID}' but no such AI Agent Configuration exists.`,
            configurationPresetID,
            ValidationErrorType.Failure
        );
    }
    if (!subAgentID || !UUIDsEqual(presetAgentID, subAgentID)) {
        const label = presetName ? `'${presetName}' (${configurationPresetID})` : `'${configurationPresetID}'`;
        return new ValidationErrorInfo(
            'ConfigurationPresetID',
            `Configuration preset ${label} belongs to agent '${presetAgentID}', not sub-agent '${subAgentID}'.`,
            configurationPresetID,
            ValidationErrorType.Failure
        );
    }
    return null;
}

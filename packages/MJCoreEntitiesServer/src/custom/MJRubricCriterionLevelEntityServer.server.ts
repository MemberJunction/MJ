import { BaseEntity, type ValidationResult } from '@memberjunction/core';
import { MJRubricCriterionLevelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { DraftChildError, PushFailure } from './rubrics/statusRules.js';

type RunView = (params: { EntityName: string; ExtraFilter: string }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }>;

/**
 * Level descriptors of a published or retired version cannot be added or changed.
 * The parent criterion points at the version.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Criterion Levels')
export class MJRubricCriterionLevelEntityServer extends MJRubricCriterionLevelEntity {
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const provider = this.ProviderToUse as { RunView?: RunView } | null;
        if (!provider?.RunView || !this.CriterionID) return result;
        const criteria = await provider.RunView({ EntityName: 'MJ: Rubric Criteria', ExtraFilter: `ID='${this.CriterionID}'` }, this.ContextCurrentUser);
        const versionId = (criteria.Results?.[0] as { RubricVersionID?: string } | undefined)?.RubricVersionID;
        if (!criteria.Success || !versionId) {
            PushFailure(result, 'CriterionID', 'Could not confirm this level belongs to a draft version.', this.CriterionID);
            return result;
        }
        const versions = await provider.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: `ID='${versionId}'` }, this.ContextCurrentUser);
        const status = (versions.Results?.[0] as { Status?: string } | undefined)?.Status;
        if (!versions.Success || !status) {
            PushFailure(result, 'CriterionID', 'Could not confirm this level belongs to a draft version.', this.CriterionID);
            return result;
        }
        const message = DraftChildError('level', status);
        if (message) PushFailure(result, 'CriterionID', message, this.CriterionID);
        return result;
    }
}

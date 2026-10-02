import { BaseEntity, type ValidationResult } from '@memberjunction/core';
import { MJRubricCriterionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { DraftChildError, PushFailure } from './rubrics/statusRules.js';
import { ValidateRubricTree } from './rubrics/versionPublish.js';

/**
 * Checks a criterion against the draft tree it belongs to.
 *
 * Refuses duplicate keys, a missing or cyclic parent, a criterion with no
 * scale, and a gate with no minimum. Publish runs the same check.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Criteria')
export class MJRubricCriterionEntityServer extends MJRubricCriterionEntity {
    /** The tree errors for this draft. Empty when the tree can be published. */
    public TreeErrors(version: RubricVersionSnapshot): string[] {
        return ValidateRubricTree(version).errors;
    }

    /** @deprecated Use {@link TreeErrors}. */
    public treeErrors(version: RubricVersionSnapshot): string[] {
        return this.TreeErrors(version);
    }

    /** Criteria of a published or retired version cannot be added or changed. */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const provider = this.ProviderToUse as { RunView?: (params: { EntityName: string; ExtraFilter: string }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }> } | null;
        if (!provider?.RunView || !this.RubricVersionID) return result;
        const versions = await provider.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: `ID='${this.RubricVersionID}'` }, this.ContextCurrentUser);
        const status = (versions.Results?.[0] as { Status?: string } | undefined)?.Status ?? null;
        const message = !versions.Success
            ? 'Could not confirm this criterion belongs to a draft version.'
            : DraftChildError('criterion', status);
        if (message) PushFailure(result, 'RubricVersionID', message, this.RubricVersionID);
        return result;
    }
}

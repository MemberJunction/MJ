import { BaseEntity, type ValidationResult } from '@memberjunction/core';
import { MJRubricBandEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { DraftChildError, PushFailure } from './rubrics/statusRules.js';

type RunView = (params: { EntityName: string; ExtraFilter: string }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }>;

/**
 * Bands of a published or retired version cannot be added or changed.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Bands')
export class MJRubricBandEntityServer extends MJRubricBandEntity {
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const provider = this.ProviderToUse as { RunView?: RunView } | null;
        if (!provider?.RunView || !this.RubricVersionID) return result;
        const versions = await provider.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: `ID='${this.RubricVersionID}'` }, this.ContextCurrentUser);
        const status = (versions.Results?.[0] as { Status?: string } | undefined)?.Status ?? null;
        const message = !versions.Success
            ? 'Could not confirm this band belongs to a draft version.'
            : DraftChildError('band', status);
        if (message) PushFailure(result, 'RubricVersionID', message, this.RubricVersionID);
        return result;
    }
}

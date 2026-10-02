import { BaseEntity, type ValidationResult } from '@memberjunction/core';
import { MJRubricScaleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { FrozenScaleChange, type ScaleShape } from './rubrics/scaleFreeze.js';

/**
 * Freezes a scale once any published version uses it.
 *
 * Refuses a change to type, range, step, direction, or level values.
 * Label and description edits are allowed. When no published version uses
 * the scale, any edit is allowed.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Scales')
export class MJRubricScaleEntityServer extends MJRubricScaleEntity {
    /**
     * Returns a refusal message when this edit would change a frozen scale,
     * otherwise null. The caller throws that message instead of saving.
     */
    public refusalFor(usedByPublishedVersion: boolean, before: ScaleShape, after: ScaleShape): string | null {
        return FrozenScaleChange(usedByPublishedVersion, before, after);
    }

    /**
     * Refuses a structural edit when any published version uses this scale.
     * Label and description changes still pass. Runs on every save, not only
     * when a caller remembers {@link refusalFor}.
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const provider = this.ProviderToUse as { RunView?: (params: { EntityName: string; ExtraFilter: string }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }> } | null;
        if (!provider?.RunView || !this.ID) return result;
        const criteria = await provider.RunView({ EntityName: 'MJ: Rubric Criteria', ExtraFilter: `ScaleID='${this.ID}'` }, this.ContextCurrentUser);
        const versionIds = [...new Set((criteria.Results ?? []).map(row => String((row as { RubricVersionID?: string }).RubricVersionID ?? '')).filter(id => id))];
        let used = false;
        for (const versionId of versionIds) {
            const versions = await provider.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: `ID='${versionId}'` }, this.ContextCurrentUser);
            if ((versions.Results ?? []).some(row => (row as { Status?: string }).Status === 'Published')) used = true;
        }
        if (!used) return result;
        const stored = await provider.RunView({ EntityName: 'MJ: Rubric Scales', ExtraFilter: `ID='${this.ID}'` }, this.ContextCurrentUser);
        const levels = await provider.RunView({ EntityName: 'MJ: Rubric Scale Levels', ExtraFilter: `ScaleID='${this.ID}'` }, this.ContextCurrentUser);
        const beforeRow = stored.Results?.[0] as ScaleShape & Record<string, unknown> | undefined;
        if (!beforeRow) return result;
        const before: ScaleShape = {
            scaleType: String(beforeRow.ScaleType ?? beforeRow.scaleType),
            minValue: (beforeRow.MinValue ?? beforeRow.minValue) as number | null,
            maxValue: (beforeRow.MaxValue ?? beforeRow.maxValue) as number | null,
            step: (beforeRow.Step ?? beforeRow.step) as number | null,
            higherIsBetter: Boolean(beforeRow.HigherIsBetter ?? beforeRow.higherIsBetter),
            levels: (levels.Results ?? []).map(row => {
                const level = row as Record<string, unknown>;
                return {
                    id: String(level.ID ?? level.id),
                    value: Number(level.Value ?? level.value),
                    normalizedValue: Number(level.NormalizedValue ?? level.normalizedValue),
                    label: String(level.Label ?? level.label ?? ''),
                    description: (level.Description ?? level.description) as string | null,
                };
            }),
        };
        const after: ScaleShape = {
            scaleType: this.ScaleType,
            minValue: this.MinValue,
            maxValue: this.MaxValue,
            step: this.Step,
            higherIsBetter: this.HigherIsBetter,
            levels: before.levels,
        };
        const message = FrozenScaleChange(true, before, after);
        if (message) {
            result.Success = false;
            result.Errors.push({ Message: message, FieldName: 'ScaleType' } as never);
        }
        return result;
    }
}

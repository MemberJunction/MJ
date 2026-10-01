import { BaseEntity, type ValidationResult } from '@memberjunction/core';
import { MJRubricScaleLevelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { FrozenScaleChange, type ScaleShape } from './rubrics/scaleFreeze.js';

type RunView = (params: { EntityName: string; ExtraFilter: string }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }>;

/**
 * A level whose scale is used by a published version cannot change its value
 * or normalized value. Label and description may change. The scale server
 * covers the scale row; this server covers the level row, which is a
 * separate save.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Scale Levels')
export class MJRubricScaleLevelEntityServer extends MJRubricScaleLevelEntity {
    /**
     * Refuses a value edit when a published version uses this scale.
     * A description or label edit passes.
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const provider = this.ProviderToUse as { RunView?: RunView } | null;
        if (!provider?.RunView || !this.ScaleID) return result;
        const criteria = await provider.RunView({ EntityName: 'MJ: Rubric Criteria', ExtraFilter: `ScaleID='${this.ScaleID}'` }, this.ContextCurrentUser);
        const versionIds = [...new Set((criteria.Results ?? []).map(row => String((row as { RubricVersionID?: string }).RubricVersionID ?? '')).filter(id => id))];
        let used = false;
        for (const versionId of versionIds) {
            const versions = await provider.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: `ID='${versionId}'` }, this.ContextCurrentUser);
            if ((versions.Results ?? []).some(row => (row as { Status?: string }).Status === 'Published')) used = true;
        }
        if (!used) return result;
        const stored = await provider.RunView({ EntityName: 'MJ: Rubric Scale Levels', ExtraFilter: `ID='${this.ID}'` }, this.ContextCurrentUser);
        const scales = await provider.RunView({ EntityName: 'MJ: Rubric Scales', ExtraFilter: `ID='${this.ScaleID}'` }, this.ContextCurrentUser);
        const storedLevel = stored.Results?.[0] as Record<string, unknown> | undefined;
        const scale = scales.Results?.[0] as Record<string, unknown> | undefined;
        if (!scale) return result;
        if (!storedLevel) {
            result.Success = false;
            result.Errors.push({ Message: 'A scale used by a published version cannot add a level.', FieldName: 'Value' } as never);
            return result;
        }
        const shape = (level: { id: string; value: number; normalizedValue: number; label: string; description: string | null }): ScaleShape => ({
            scaleType: String(scale.ScaleType ?? 'Levels'),
            minValue: (scale.MinValue ?? null) as number | null,
            maxValue: (scale.MaxValue ?? null) as number | null,
            step: (scale.Step ?? null) as number | null,
            higherIsBetter: Boolean(scale.HigherIsBetter),
            levels: [level],
        });
        const message = FrozenScaleChange(true,
            shape({
                id: this.ID,
                value: Number(storedLevel.Value),
                normalizedValue: Number(storedLevel.NormalizedValue),
                label: String(storedLevel.Label ?? ''),
                description: (storedLevel.Description ?? null) as string | null,
            }),
            shape({
                id: this.ID,
                value: this.Value,
                normalizedValue: this.NormalizedValue,
                label: this.Label,
                description: this.Description,
            }),
        );
        if (message) {
            result.Success = false;
            result.Errors.push({ Message: message, FieldName: 'NormalizedValue' } as never);
        }
        return result;
    }
}

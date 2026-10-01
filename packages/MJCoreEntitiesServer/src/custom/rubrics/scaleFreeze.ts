export interface ScaleShape {
    scaleType: string;
    minValue?: number | null;
    maxValue?: number | null;
    step?: number | null;
    higherIsBetter: boolean;
    levels: { id: string; value: number; normalizedValue: number; label?: string; description?: string | null }[];
}

/**
 * A scale used by any published version cannot change its type, range, direction,
 * step, or level values. Labels and descriptions may still change. Returns the
 * refusal message, or null when the edit is allowed.
 */
export function FrozenScaleChange(usedByPublishedVersion: boolean, before: ScaleShape, after: ScaleShape): string | null {
    if (!usedByPublishedVersion) return null;
    if (before.scaleType !== after.scaleType) return 'A scale used by a published version cannot change type.';
    if ((before.minValue ?? null) !== (after.minValue ?? null) || (before.maxValue ?? null) !== (after.maxValue ?? null)) {
        return 'A scale used by a published version cannot change its range.';
    }
    if ((before.step ?? null) !== (after.step ?? null)) return 'A scale used by a published version cannot change its step.';
    if (before.higherIsBetter !== after.higherIsBetter) return 'A scale used by a published version cannot change direction.';
    const beforeLevels = new Map(before.levels.map(level => [level.id, level]));
    const afterLevels = new Map(after.levels.map(level => [level.id, level]));
    if (beforeLevels.size !== afterLevels.size) return 'A scale used by a published version cannot add or remove levels.';
    for (const [id, level] of afterLevels) {
        const previous = beforeLevels.get(id);
        if (!previous || previous.value !== level.value || previous.normalizedValue !== level.normalizedValue) {
            return 'A scale used by a published version cannot change a level value.';
        }
    }
    return null;
}

/** @deprecated Use {@link FrozenScaleChange}. */
export function frozenScaleChange(usedByPublishedVersion: boolean, before: ScaleShape, after: ScaleShape): string | null {
    return FrozenScaleChange(usedByPublishedVersion, before, after);
}

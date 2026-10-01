import { BaseEntity } from '@memberjunction/core';
import { MJRubricScaleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { frozenScaleChange, type ScaleShape } from './rubrics/scaleFreeze.js';

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
        return frozenScaleChange(usedByPublishedVersion, before, after);
    }
}

/**
 * @fileoverview Abstract base class for tour eligibility policies (`BaseTourEligibilityPolicy`).
 * @module @memberjunction/tours-runtime
 */

import { RequiresSubclass } from '@memberjunction/global';
import type { TourEligibilityContext, TourEligibilityResult } from './plugin-types';

/**
 * Eligibility gate evaluated in order (`Priority` ascending) over cached data.
 * Registered via `@RegisterClass(BaseTourEligibilityPolicy, '<PolicyName>')`.
 */
@RequiresSubclass()
export abstract class BaseTourEligibilityPolicy {
    /** Execution order (lower runs first). */
    public readonly Order: number = 100;

    public abstract Evaluate(ctx: TourEligibilityContext): TourEligibilityResult;
}

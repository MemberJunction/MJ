/**
 * @fileoverview Abstract base class for step completion & SkipWhen checks (`BaseTourCompletionCheck`).
 * @module @memberjunction/tours-runtime
 */

import { RequiresSubclass } from '@memberjunction/global';
import type { TourCapabilityRequirement } from '../host-contracts';
import type { TourCompletionCheckSpec, TourValidationResult } from '../types';
import type { TourCompletionContext } from './plugin-types';

export interface TourCompletionResult {
    Satisfied: boolean;
    /** Evidence tag recorded on `TourRunStep`. */
    Evidence?: string;
    Data?: Record<string, unknown>;
}

/**
 * Logic plugin evaluating whether a step completion check (or `SkipWhen` check) is satisfied.
 * Registered via `@RegisterClass(BaseTourCompletionCheck, '<CheckType>')`.
 */
@RequiresSubclass()
export abstract class BaseTourCompletionCheck {
    public readonly RequiredCapabilities?: TourCapabilityRequirement;

    public ValidateConfig(_spec: TourCompletionCheckSpec): TourValidationResult {
        return { Valid: true, Errors: [], Warnings: [] };
    }

    /** Synchronous/immediate snapshot check used primarily for `SkipWhen`. */
    public async EvaluateNow(_ctx: TourCompletionContext): Promise<boolean> {
        return false;
    }

    /** Waits until the completion condition is satisfied or `ctx.AbortSignal` aborts. */
    public abstract WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult>;
}

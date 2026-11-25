/**
 * @fileoverview Abstract base class for tour offering triggers (`BaseTourTrigger`).
 * @module @memberjunction/tours-runtime
 */

import { RequiresSubclass } from '@memberjunction/global';
import type { TourCapabilityRequirement } from '../host-contracts';
import type { TourTriggerContext, TourTriggerMatch } from './plugin-types';

/**
 * Logic plugin evaluating whether a `TourTriggerDefinition` fires for the current state.
 * Registered via `@RegisterClass(BaseTourTrigger, '<TriggerType>')`.
 */
@RequiresSubclass()
export abstract class BaseTourTrigger {
    public readonly RequiredCapabilities?: TourCapabilityRequirement;

    public abstract Evaluate(ctx: TourTriggerContext): TourTriggerMatch;

    /** Checks whether the trigger is still within its configured `CooldownDays`. */
    protected isWithinCooldown(ctx: TourTriggerContext): boolean {
        const cooldownDays = ctx.Trigger.CooldownDays;
        if (typeof cooldownDays !== 'number' || cooldownDays <= 0) {
            return false;
        }
        const nowMs = (ctx.Now ?? new Date()).getTime();
        const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
        return ctx.Runs.some((run) => {
            if (run.TourKey !== ctx.Tour.TourKey) return false;
            const startedMs = Date.parse(run.StartedAt);
            return Number.isFinite(startedMs) && nowMs - startedMs < cooldownMs;
        });
    }
}

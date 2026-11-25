/**
 * @fileoverview Tour-level logic plugin base (`BaseTourDriver`) and standard `'Default'` driver.
 * @module @memberjunction/tours-runtime
 */

import { RegisterClass } from '@memberjunction/global';
import type {
    BeforeTourStartEventArgs,
    BeforeTourStepEnterEventArgs,
} from '../events';
import { EvaluateTourCondition } from '../tour-graph-compiler';
import type {
    TourRunOutcome,
    TourStepOutcome,
    TourStepRef,
} from '../types';
import type {
    TourContextBuilder,
    TourSessionContext,
} from './plugin-types';

/** Tour-level logic plugin. One per tour (`MJ: Tours.DriverClass`), defaulting to `'Default'`. */
export class BaseTourDriver {
    /** Add domain facts to the `CompositeFilter` / expression context before evaluation. */
    public async BuildContext(_ctx: TourContextBuilder): Promise<void> {}

    /** Synchronous, cancelable hook before tour start (`UI_LAYERING_GUIDE.md` §6). */
    public BeforeTourStart(_args: BeforeTourStartEventArgs): void {}

    /** Synchronous, cancelable hook before entering a step (`UI_LAYERING_GUIDE.md` §6). */
    public BeforeStepEnter(_args: BeforeTourStepEnterEventArgs): void {}

    /** Override branching beyond Step Paths. Return `null` to accept the graph's choice. */
    public ResolveNextStep(_ctx: TourSessionContext, _candidates: TourStepRef[]): string | null {
        return null;
    }

    /** Evaluates the tour's outcome goal (`ITourGoal`). */
    public async EvaluateGoal(ctx: TourSessionContext): Promise<boolean> {
        const goal = ctx.Tour.Goal;
        if (!goal) {
            return false;
        }
        switch (goal.Type) {
            case 'ServerPredicate': {
                if (!goal.PredicateKey || !ctx.ServerPredicateEvaluator) {
                    return false;
                }
                const results = await ctx.ServerPredicateEvaluator.EvaluatePredicates([
                    { PredicateKey: goal.PredicateKey, Params: goal.PredicateParams },
                ]);
                return results.some((r) => r.PredicateKey === goal.PredicateKey && r.Satisfied);
            }
            case 'Navigation': {
                const loc = ctx.Location;
                if (goal.AppName && loc.ApplicationName !== goal.AppName) {
                    return false;
                }
                if (goal.NavItemKey && loc.NavItemKey !== goal.NavItemKey) {
                    return false;
                }
                if (goal.UrlPattern && loc.Url) {
                    return loc.Url.includes(goal.UrlPattern);
                }
                return Boolean(goal.AppName || goal.NavItemKey || goal.UrlPattern);
            }
            case 'EntityEvent':
            case 'Signal': {
                if (goal.Filter) {
                    const evalRes = EvaluateTourCondition(goal.Filter, ctx.ConditionContext);
                    return evalRes.Success && evalRes.Value;
                }
                return false;
            }
            default:
                return false;
        }
    }

    public async OnStepCompleted(
        _ctx: TourSessionContext,
        _step: TourStepRef,
        _outcome: TourStepOutcome,
    ): Promise<void> {}

    public async OnTourEnded(
        _ctx: TourSessionContext,
        _outcome: TourRunOutcome,
    ): Promise<void> {}

    /** Extra framing for agent directors (domain vocabulary, cautions). */
    public DescribeForAgent(_ctx: TourSessionContext): string {
        return '';
    }
}

@RegisterClass(BaseTourDriver, 'Default')
export class DefaultTourDriver extends BaseTourDriver {}

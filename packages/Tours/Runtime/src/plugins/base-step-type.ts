/**
 * @fileoverview Abstract logic base class for step types (`BaseTourStepType<TConfig>`).
 * @module @memberjunction/tours-runtime
 */

import { RequiresSubclass } from '@memberjunction/global';
import type { TourCapabilityRequirement, TourNavigationIntent } from '../host-contracts';
import type {
    ITourAnchor,
    ITourCompletion,
    ITourStepConfiguration,
    TourHealthCheck,
    TourStepOutcome,
    TourValidationIssue,
    TourValidationResult,
} from '../types';
import type {
    TourPrepareResult,
    TourStepAgentBrief,
    TourStepContext,
} from './plugin-types';

/**
 * Logic half of a Guided Tour step type (L0 pure TypeScript, DOM-free).
 * Registered on `MJGlobal.ClassFactory` via `@RegisterClass(BaseTourStepType, '<Key>')`.
 */
@RequiresSubclass()
export abstract class BaseTourStepType<
    TConfig extends object = ITourStepConfiguration,
> {
    /** Host capabilities required to run this step type. */
    public readonly RequiredCapabilities?: TourCapabilityRequirement;

    /** Authoring-time and `mj sync push` validation of the step's `Configuration`. */
    public abstract ValidateConfig(config: TConfig): TourValidationResult;

    /**
     * Navigation and make-visible work before the step shows.
     * Default implementation runs `step.Prepare` via `ITourHost.Navigate()`.
     */
    public async Prepare(ctx: TourStepContext<TConfig>): Promise<TourPrepareResult> {
        const prepare = ctx.Step.Prepare;
        if (!prepare) {
            return { Success: true, Navigated: false };
        }

        const hasNavTarget = Boolean(
            prepare.ApplicationID ||
                prepare.ApplicationName ||
                prepare.NavItemKey ||
                prepare.DriverClass ||
                prepare.EntityName ||
                prepare.Url ||
                prepare.RailKey ||
                prepare.SectionKey,
        );

        if (!hasNavTarget) {
            return { Success: true, Navigated: false, Announcement: prepare.Announcement };
        }

        const recordId = prepare.RecordIdTemplate
            ? interpolatePrepareValue(prepare.RecordIdTemplate, ctx.Session.ConditionContext)
            : undefined;

        const intent: TourNavigationIntent = {
            ApplicationID: prepare.ApplicationID,
            ApplicationName: prepare.ApplicationName,
            NavItemKey: prepare.NavItemKey,
            DriverClass: prepare.DriverClass,
            EntityName: prepare.EntityName,
            RecordId: recordId,
            RailKey: prepare.RailKey,
            SectionKey: prepare.SectionKey,
            Url: prepare.Url,
        };

        const ok = await ctx.Session.Host.Navigate(intent);
        if (!ok) {
            return {
                Success: false,
                Navigated: false,
                ErrorMessage: `Navigation failed during Prepare for step '${ctx.Step.StepKey}'.`,
            };
        }

        return {
            Success: true,
            Navigated: true,
            Announcement:
                prepare.Announcement ??
                `Navigated to ${prepare.ApplicationName ?? prepare.EntityName ?? prepare.Url ?? 'destination'} for step ${ctx.StepIndex + 1} of ${ctx.TotalSteps}.`,
        };
    }

    /** Anchors this step targets; empty for centered modal/banner-style steps. */
    public GetTargets(ctx: TourStepContext<TConfig>): ITourAnchor[] {
        return ctx.Step.Anchor ? [ctx.Step.Anchor] : [];
    }

    /** Completion used when the author specified none (e.g. Spotlight -> NextButton). */
    public GetDefaultCompletion(_ctx: TourStepContext<TConfig>): ITourCompletion {
        return {
            Checks: [{ Type: 'NextButton' }],
            Match: 'All',
        };
    }

    /** What an agent director is told about this step, and any step-specific tools it may call. */
    public DescribeForAgent(ctx: TourStepContext<TConfig>): TourStepAgentBrief {
        const completion = ctx.Step.Completion ?? this.GetDefaultCompletion(ctx);
        return {
            StepKey: ctx.Step.StepKey,
            StepType: ctx.Step.StepType,
            Title: ctx.Step.Title,
            Mode: ctx.Step.Mode ?? 'Guide',
            Instructions: ctx.Step.Body ?? ctx.Step.Title,
            GuideNotes: ctx.Step.GuideNotes,
            ExpectedOutcome: completion.Checks.map((c) => c.Type).join(', '),
            TargetAnchors: this.GetTargets(ctx),
            StepTools: [],
        };
    }

    /** Static checks for the `tour-anchors` standards gate and the `Verify` director. */
    public GetHealthChecks(_config: TConfig): TourHealthCheck[] {
        return [];
    }

    /** Lifecycle hook fired right after the step renders/enters. */
    public async OnEnter(_ctx: TourStepContext<TConfig>): Promise<void> {}

    /** Lifecycle hook fired after the step finishes/exits. */
    public async OnExit(
        _ctx: TourStepContext<TConfig>,
        _outcome: TourStepOutcome,
    ): Promise<void> {}

    protected buildValidationResult(
        errors: TourValidationIssue[],
        warnings: TourValidationIssue[] = [],
    ): TourValidationResult {
        return {
            Valid: errors.length === 0,
            Errors: errors,
            Warnings: warnings,
        };
    }
}

function interpolatePrepareValue(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawPath: string) => {
        const path = rawPath.trim().replace(/^Context\./, '');
        const parts = path.split('.');
        let current: unknown = context;
        for (const part of parts) {
            if (current != null && typeof current === 'object') {
                current = (current as Record<string, unknown>)[part];
            } else {
                return '';
            }
        }
        return current == null ? '' : String(current);
    });
}

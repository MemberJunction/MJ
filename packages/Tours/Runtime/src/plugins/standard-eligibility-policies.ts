/**
 * @fileoverview Standard eligibility policy chain (§11):
 * CapabilityPolicy, OverridePolicy, AudiencePolicy, PrerequisitePolicy,
 * PermissionPolicy, StatusPolicy, InterruptionBudgetPolicy, plus TourEligibilityEvaluator.
 * @module @memberjunction/tours-runtime
 */

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { HostSatisfiesCapabilities } from '../host-contracts';
import { MergeTourOverrides } from '../stores';
import { EvaluateTourCondition } from '../tour-graph-compiler';
import type { TourDefinition } from '../types';
import { BaseTourAnchorResolver } from './base-anchor-resolver';
import { BaseTourCompletionCheck } from './base-completion-check';
import { BaseTourEligibilityPolicy } from './base-eligibility-policy';
import { BaseTourStepType } from './base-step-type';
import type {
    TourEligibilityContext,
    TourEligibilityResult,
} from './plugin-types';

function pass(recommendedPrerequisites?: string[]): TourEligibilityResult {
    return recommendedPrerequisites && recommendedPrerequisites.length > 0
        ? { Eligible: true, RecommendedPrerequisites: recommendedPrerequisites }
        : { Eligible: true };
}

function fail(policyName: string, reason: string): TourEligibilityResult {
    return { Eligible: false, PolicyName: policyName, Reason: reason };
}

/** 1. Ensures the host capabilities satisfy the tour's step types, anchors, and checks. */
@RegisterClass(BaseTourEligibilityPolicy, 'CapabilityPolicy')
export class CapabilityPolicy extends BaseTourEligibilityPolicy {
    public override readonly Order = 10;

    public Evaluate(ctx: TourEligibilityContext): TourEligibilityResult {
        const host = ctx.Host;
        const caps = host.Capabilities;

        // Check RunInAuthenticatedHosts for MJUser hosts
        if (host.Principal.Kind === 'MJUser' && ctx.Tour.RunInAuthenticatedHosts === false) {
            return fail('CapabilityPolicy', 'Tour is disabled in authenticated hosts.');
        }

        // Check installed applications when tour belongs to a specific app
        if (ctx.Tour.ApplicationName) {
            const installed = ctx.InstalledApps ?? host.GetInstalledApplications?.();
            if (installed && !installed.includes(ctx.Tour.ApplicationName)) {
                return fail(
                    'CapabilityPolicy',
                    `Application '${ctx.Tour.ApplicationName}' is not installed/accessible.`,
                );
            }
        }

        for (const step of ctx.Tour.Steps) {
            const stepTypeRes = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepType>(
                BaseTourStepType,
                step.DriverClass || step.StepType,
            );
            if (stepTypeRes.Resolved && stepTypeRes.Instance?.RequiredCapabilities) {
                const check = HostSatisfiesCapabilities(caps, stepTypeRes.Instance.RequiredCapabilities);
                if (!check.Satisfied) {
                    return fail(
                        'CapabilityPolicy',
                        `Step '${step.StepKey}' (${step.StepType}) requires capabilities: ${check.Missing.join(', ')}.`,
                    );
                }
            }

            if (step.Anchor) {
                const anchorRes = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourAnchorResolver>(
                    BaseTourAnchorResolver,
                    step.Anchor.Strategy,
                );
                if (anchorRes.Resolved && anchorRes.Instance?.RequiredCapabilities) {
                    const check = HostSatisfiesCapabilities(caps, anchorRes.Instance.RequiredCapabilities);
                    if (!check.Satisfied) {
                        return fail(
                            'CapabilityPolicy',
                            `Step '${step.StepKey}' anchor (${step.Anchor.Strategy}) requires capabilities: ${check.Missing.join(', ')}.`,
                        );
                    }
                }
            }

            for (const c of step.Completion?.Checks ?? []) {
                const checkRes = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourCompletionCheck>(
                    BaseTourCompletionCheck,
                    c.Type,
                );
                if (checkRes.Resolved && checkRes.Instance?.RequiredCapabilities) {
                    const capCheck = HostSatisfiesCapabilities(caps, checkRes.Instance.RequiredCapabilities);
                    if (!capCheck.Satisfied) {
                        return fail(
                            'CapabilityPolicy',
                            `Step '${step.StepKey}' completion check '${c.Type}' requires capabilities: ${capCheck.Missing.join(', ')}.`,
                        );
                    }
                }
            }
        }

        return pass();
    }
}

/** 2. Checks Active status and host-admin `TourOverride` disablement. */
@RegisterClass(BaseTourEligibilityPolicy, 'OverridePolicy')
export class OverridePolicy extends BaseTourEligibilityPolicy {
    public override readonly Order = 20;

    public Evaluate(ctx: TourEligibilityContext): TourEligibilityResult {
        if (ctx.Tour.Status !== 'Active') {
            return fail('OverridePolicy', `Tour status is '${ctx.Tour.Status}', expected 'Active'.`);
        }

        if (ctx.Overrides && ctx.Overrides.length > 0) {
            const merged = MergeTourOverrides(ctx.Tour, ctx.Overrides, ctx.Principal);
            if (!merged) {
                return fail('OverridePolicy', 'Tour is disabled by an active TourOverride.');
            }
        }

        return pass();
    }
}

/** 3. Evaluates `Tour.AudienceFilter` against principal & condition context. */
@RegisterClass(BaseTourEligibilityPolicy, 'AudiencePolicy')
export class AudiencePolicy extends BaseTourEligibilityPolicy {
    public override readonly Order = 30;

    public Evaluate(ctx: TourEligibilityContext): TourEligibilityResult {
        const effectiveTour =
            ctx.Overrides && ctx.Overrides.length > 0
                ? MergeTourOverrides(ctx.Tour, ctx.Overrides, ctx.Principal) ?? ctx.Tour
                : ctx.Tour;

        if (!effectiveTour.AudienceFilter) {
            return pass();
        }

        const evalCtx: Record<string, unknown> = {
            ...(ctx.ConditionContext ?? {}),
            principal: ctx.Principal,
            user:
                ctx.Principal.Kind === 'MJUser'
                    ? { UserId: ctx.Principal.UserId, Roles: ctx.Principal.Roles }
                    : { Kind: ctx.Principal.Kind },
            location: ctx.Location,
        };

        const res = EvaluateTourCondition(effectiveTour.AudienceFilter, evalCtx);
        if (!res.Success || !res.Value) {
            return fail(
                'AudiencePolicy',
                res.ErrorMessage ?? 'User does not match AudienceFilter.',
            );
        }

        return pass();
    }
}

/** 4. Evaluates `Tour.Prerequisites` (Required blocks; Recommended surfaces suggestions). */
@RegisterClass(BaseTourEligibilityPolicy, 'PrerequisitePolicy')
export class PrerequisitePolicy extends BaseTourEligibilityPolicy {
    public override readonly Order = 40;

    public Evaluate(ctx: TourEligibilityContext): TourEligibilityResult {
        const prereqs = ctx.Tour.Prerequisites ?? [];
        if (prereqs.length === 0) {
            return pass();
        }

        const recommended: string[] = [];

        for (const prereq of prereqs) {
            let met = true;
            let failureReason = '';

            switch (prereq.PrerequisiteType) {
                case 'Tour': {
                    const reqKey = prereq.RequiredTourKey;
                    if (reqKey) {
                        met = ctx.Runs.some(
                            (r) => r.TourKey === reqKey && r.Status === 'Completed',
                        );
                        if (!met) {
                            failureReason = `Requires completed tour '${reqKey}'.`;
                        }
                    }
                    break;
                }
                case 'Role': {
                    if (prereq.RequiredRole) {
                        met =
                            ctx.Principal.Kind === 'MJUser' &&
                            ctx.Principal.Roles.includes(prereq.RequiredRole);
                        if (!met) {
                            failureReason = `Requires role '${prereq.RequiredRole}'.`;
                        }
                    }
                    break;
                }
                case 'Application': {
                    if (prereq.RequiredApplicationName) {
                        const installed = ctx.InstalledApps ?? ctx.Host.GetInstalledApplications?.() ?? [];
                        met = installed.includes(prereq.RequiredApplicationName);
                        if (!met) {
                            failureReason = `Requires application '${prereq.RequiredApplicationName}'.`;
                        }
                    }
                    break;
                }
                case 'Authorization': {
                    if (prereq.RequiredEntityPermission) {
                        const { EntityName, Action } = prereq.RequiredEntityPermission;
                        met = principalHasPermission(ctx, EntityName, Action);
                        if (!met) {
                            failureReason = `Requires ${Action} permission on '${EntityName}'.`;
                        }
                    }
                    break;
                }
                case 'Data': {
                    if (prereq.Condition) {
                        const evalRes = EvaluateTourCondition(
                            prereq.Condition,
                            ctx.ConditionContext ?? {},
                        );
                        met = evalRes.Success && evalRes.Value;
                        if (!met) {
                            failureReason = 'Data prerequisite condition not satisfied.';
                        }
                    }
                    break;
                }
            }

            if (!met) {
                if (prereq.Strength === 'Required') {
                    return fail('PrerequisitePolicy', failureReason);
                }
                if (prereq.RequiredTourKey) {
                    recommended.push(prereq.RequiredTourKey);
                }
            }
        }

        return pass(recommended);
    }
}

/** 5. Permission-derived prerequisite check (§9): if the tour's goal entity is inaccessible, skip tour. */
@RegisterClass(BaseTourEligibilityPolicy, 'PermissionPolicy')
export class PermissionPolicy extends BaseTourEligibilityPolicy {
    public override readonly Order = 50;

    public Evaluate(ctx: TourEligibilityContext): TourEligibilityResult {
        const goal = ctx.Tour.Goal;
        if (goal?.Type === 'EntityEvent' && goal.EntityName) {
            const action = goal.EventType === 'delete' ? 'Delete' : 'Update';
            if (ctx.Principal.Kind === 'MJUser' && ctx.Principal.Permissions) {
                const hasWrite = principalHasPermission(ctx, goal.EntityName, action);
                const hasCreate =
                    action === 'Update' ? principalHasPermission(ctx, goal.EntityName, 'Create') : false;
                if (!hasWrite && !hasCreate) {
                    return fail(
                        'PermissionPolicy',
                        `User lacks ${action}/Create permission for tour goal entity '${goal.EntityName}'.`,
                    );
                }
            }
        }
        return pass();
    }
}

/** 6. Filters out already completed, dismissed, or actively snoozed tours for unrequested offers. */
@RegisterClass(BaseTourEligibilityPolicy, 'StatusPolicy')
export class StatusPolicy extends BaseTourEligibilityPolicy {
    public override readonly Order = 60;

    public Evaluate(ctx: TourEligibilityContext): TourEligibilityResult {
        if (ctx.RequestedExplicitly) {
            return pass();
        }

        if (ctx.Preferences && ctx.Preferences.OffersEnabled === false) {
            return fail('StatusPolicy', 'User disabled proactive tour offers in preferences.');
        }

        const nowMs = (ctx.Now ?? new Date()).getTime();
        const runs = ctx.Runs.filter((r) => r.TourKey === ctx.Tour.TourKey);

        for (const run of runs) {
            if (run.Status === 'Completed' && ctx.Tour.LaunchPolicy?.AllowReplay !== true) {
                return fail('StatusPolicy', 'Tour already completed.');
            }
            if (run.Status === 'Dismissed') {
                return fail('StatusPolicy', 'Tour was dismissed by the user.');
            }
            if (run.Status === 'Snoozed' && run.SnoozedUntil) {
                const untilMs = Date.parse(run.SnoozedUntil);
                if (Number.isFinite(untilMs) && untilMs > nowMs) {
                    return fail('StatusPolicy', `Tour is snoozed until ${run.SnoozedUntil}.`);
                }
            }
        }

        return pass();
    }
}

/**
 * 7. Global Interruption Budget Policy (§11):
 * - Default: at most 1 unrequested offer per session and 1 per day
 * - Tag-group caps (`Tour.ThrottleTags`)
 * - `LaunchPolicy.CriticalBypass` bypasses rate caps (but never interrupts active user focus unless critical)
 * - Blocks unrequested offers while: form is dirty, dialog is open, user is typing,
 *   realtime voice/video session is live, or within initial page-load quiet period (default 3000ms).
 */
@RegisterClass(BaseTourEligibilityPolicy, 'InterruptionBudgetPolicy')
export class InterruptionBudgetPolicy extends BaseTourEligibilityPolicy {
    public override readonly Order = 70;

    public Evaluate(ctx: TourEligibilityContext): TourEligibilityResult {
        if (ctx.RequestedExplicitly) {
            return pass();
        }

        const budget = ctx.InterruptionBudget;
        if (!budget) {
            return pass();
        }

        // Respectful focus guards: never interrupt dirty forms, open dialogs, typing, live sessions, or load quiet period
        if (budget.IsFormDirty) {
            return fail('InterruptionBudgetPolicy', 'Deferred: active form has unsaved edits.');
        }
        if (budget.IsDialogOpen) {
            return fail('InterruptionBudgetPolicy', 'Deferred: modal dialog is currently open.');
        }
        if (budget.IsUserTyping) {
            return fail('InterruptionBudgetPolicy', 'Deferred: user is actively typing.');
        }
        if (budget.IsRealtimeSessionLive) {
            return fail('InterruptionBudgetPolicy', 'Deferred: realtime session is currently live.');
        }

        const quietPeriodMs = budget.InitialLoadQuietPeriodMs ?? 3000;
        if (budget.MsSincePageLoad < quietPeriodMs) {
            return fail(
                'InterruptionBudgetPolicy',
                `Deferred: within initial load quiet period (${budget.MsSincePageLoad}ms < ${quietPeriodMs}ms).`,
            );
        }

        if (ctx.Tour.LaunchPolicy?.CriticalBypass) {
            return pass();
        }

        const maxSession = budget.MaxOffersPerSession ?? 1;
        if (budget.OffersThisSession >= maxSession) {
            return fail(
                'InterruptionBudgetPolicy',
                `Session interruption budget reached (${budget.OffersThisSession}/${maxSession}).`,
            );
        }

        const maxDay = budget.MaxOffersPerDay ?? 1;
        if (budget.OffersToday >= maxDay) {
            return fail(
                'InterruptionBudgetPolicy',
                `Daily interruption budget reached (${budget.OffersToday}/${maxDay}).`,
            );
        }

        const tags = ctx.Tour.ThrottleTags ?? [];
        const tagCaps = budget.TagGroupCaps ?? {};
        for (const tag of tags) {
            const cap = tagCaps[tag];
            const count = budget.TagCountsToday[tag] ?? 0;
            if (typeof cap === 'number' && count >= cap) {
                return fail(
                    'InterruptionBudgetPolicy',
                    `Tag-group cap reached for '${tag}' (${count}/${cap}).`,
                );
            }
        }

        return pass();
    }
}

function principalHasPermission(
    ctx: TourEligibilityContext,
    entityName: string,
    action: 'Read' | 'Create' | 'Update' | 'Delete',
): boolean {
    if (ctx.Principal.Kind !== 'MJUser') {
        return false;
    }
    const perms = ctx.Principal.Permissions;
    if (!perms) {
        return true; // When permission map isn't supplied, don't false-deny
    }
    const entry = perms[entityName];
    if (!entry) {
        return false;
    }
    switch (action) {
        case 'Read':
            return entry.CanRead;
        case 'Create':
            return entry.CanCreate;
        case 'Update':
            return entry.CanUpdate;
        case 'Delete':
            return entry.CanDelete;
    }
}

export interface RankedTourEligibility {
    Tour: TourDefinition;
    Result: TourEligibilityResult;
}

/**
 * Runs all registered `BaseTourEligibilityPolicy` plugins in order and ranks
 * eligible tours by effective `Priority` (higher first; default 100).
 */
export class TourEligibilityEvaluator {
    private readonly _policies: BaseTourEligibilityPolicy[];

    constructor(policies?: BaseTourEligibilityPolicy[]) {
        if (policies) {
            this._policies = [...policies].sort((a, b) => a.Order - b.Order);
        } else {
            const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseTourEligibilityPolicy);
            const seenKeys = new Set<string>();
            const instances: BaseTourEligibilityPolicy[] = [];
            for (const reg of regs) {
                if (!reg.Key || seenKeys.has(reg.Key)) continue;
                seenKeys.add(reg.Key);
                const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourEligibilityPolicy>(
                    BaseTourEligibilityPolicy,
                    reg.Key,
                );
                if (res.Resolved && res.Instance) {
                    instances.push(res.Instance);
                }
            }
            this._policies = instances.sort((a, b) => a.Order - b.Order);
        }
    }

    public EvaluateTour(ctx: TourEligibilityContext): TourEligibilityResult {
        const recommended: string[] = [];
        for (const policy of this._policies) {
            const res = policy.Evaluate(ctx);
            if (!res.Eligible) {
                return res;
            }
            if (res.RecommendedPrerequisites) {
                recommended.push(...res.RecommendedPrerequisites);
            }
        }
        return recommended.length > 0
            ? { Eligible: true, RecommendedPrerequisites: [...new Set(recommended)] }
            : { Eligible: true };
    }

    /** Evaluates all candidate tours and returns eligible tours sorted by priority descending. */
    public RankEligibleTours(
        tours: readonly TourDefinition[],
        baseContext: Omit<TourEligibilityContext, 'Tour'>,
    ): RankedTourEligibility[] {
        const eligible: RankedTourEligibility[] = [];

        for (const tour of tours) {
            const merged =
                baseContext.Overrides && baseContext.Overrides.length > 0
                    ? MergeTourOverrides(tour, baseContext.Overrides, baseContext.Principal)
                    : tour;
            if (!merged) {
                continue;
            }
            const res = this.EvaluateTour({ ...baseContext, Tour: merged });
            if (res.Eligible) {
                eligible.push({ Tour: merged, Result: res });
            }
        }

        return eligible.sort((a, b) => {
            const aCritical = a.Tour.LaunchPolicy?.CriticalBypass ? 1 : 0;
            const bCritical = b.Tour.LaunchPolicy?.CriticalBypass ? 1 : 0;
            if (bCritical !== aCritical) return bCritical - aCritical;
            const pDiff = (b.Tour.Priority ?? 100) - (a.Tour.Priority ?? 100);
            return pDiff !== 0 ? pDiff : a.Tour.TourKey.localeCompare(b.Tour.TourKey);
        });
    }
}

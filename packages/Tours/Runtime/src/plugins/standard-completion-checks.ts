/**
 * @fileoverview All 10 standard Guided Tour completion checks (§5.1 & §8):
 * NextButton, AnchorInteraction, Navigation, Signal, EntityEvent,
 * FieldState, ServerPredicate, AgentConfirmed, All, Any.
 * @module @memberjunction/tours-runtime
 */

import { CompositeFilter } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { TourCapabilityRequirement } from '../host-contracts';
import { TourSignals } from '../signals';
import { BuildFilterEvalContext } from '../tour-graph-compiler';
import type { TourCompletionCheckSpec, TourValidationResult } from '../types';
import { BaseTourCompletionCheck, type TourCompletionResult } from './base-completion-check';
import type { TourCompletionContext } from './plugin-types';

function createAbortedPromise(): Promise<TourCompletionResult> {
    return new Promise((resolve) => {
        resolve({ Satisfied: false, Evidence: 'Aborted' });
    });
}

function resolveCheckPlugin(checkType: string): BaseTourCompletionCheck | null {
    const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourCompletionCheck>(
        BaseTourCompletionCheck,
        checkType,
    );
    return res.Resolved ? res.Instance : null;
}

@RegisterClass(BaseTourCompletionCheck, 'NextButton')
export class NextButtonCompletionCheck extends BaseTourCompletionCheck {
    public WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (ctx.AbortSignal.aborted) {
            return createAbortedPromise();
        }
        return new Promise<TourCompletionResult>((resolve) => {
            const cleanup = (): void => {
                sub.unsubscribe();
                ctx.AbortSignal.removeEventListener('abort', onAbort);
            };
            const onAbort = (): void => {
                cleanup();
                resolve({ Satisfied: false, Evidence: 'Aborted' });
            };
            ctx.AbortSignal.addEventListener('abort', onAbort, { once: true });
            const sub = ctx.NextRequested$.subscribe(() => {
                cleanup();
                resolve({ Satisfied: true, Evidence: 'NextButton' });
            });
        });
    }
}

@RegisterClass(BaseTourCompletionCheck, 'AnchorInteraction')
export class AnchorInteractionCompletionCheck extends BaseTourCompletionCheck {
    public async WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (ctx.AbortSignal.aborted) {
            return { Satisfied: false, Evidence: 'Aborted' };
        }
        const anchor = ctx.Check.AnchorKey
            ? { Strategy: 'Registered' as const, Key: ctx.Check.AnchorKey }
            : ctx.Step.Anchor;

        if (!anchor || !ctx.AnchorBridge?.WaitForAnchorInteraction) {
            // Fall back to NextButton if no DOM interaction bridge is attached
            return new NextButtonCompletionCheck().WaitForCompletion(ctx);
        }

        const interacted = await ctx.AnchorBridge.WaitForAnchorInteraction(
            anchor,
            ctx.Check.Interaction ?? 'any',
            ctx.AbortSignal,
        );
        return {
            Satisfied: interacted,
            Evidence: interacted ? `AnchorInteraction:${ctx.Check.Interaction ?? 'any'}` : 'Aborted',
        };
    }
}

@RegisterClass(BaseTourCompletionCheck, 'Navigation')
export class NavigationCompletionCheck extends BaseTourCompletionCheck {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        Navigation: ['MJ App', 'Url'],
    };

    public override async EvaluateNow(ctx: TourCompletionContext): Promise<boolean> {
        const current = ctx.Host.GetCurrentLocation?.();
        if (!current) {
            return false;
        }
        return matchesNavigationLocation(ctx.Check, current);
    }

    public WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (ctx.AbortSignal.aborted) {
            return createAbortedPromise();
        }
        return new Promise<TourCompletionResult>((resolve) => {
            const cleanup = (): void => {
                sub.unsubscribe();
                ctx.AbortSignal.removeEventListener('abort', onAbort);
            };
            const onAbort = (): void => {
                cleanup();
                resolve({ Satisfied: false, Evidence: 'Aborted' });
            };
            ctx.AbortSignal.addEventListener('abort', onAbort, { once: true });
            const sub = ctx.Host.Location$.subscribe((loc) => {
                if (matchesNavigationLocation(ctx.Check, loc)) {
                    cleanup();
                    resolve({ Satisfied: true, Evidence: 'Navigation' });
                }
            });
        });
    }
}

function matchesNavigationLocation(
    check: TourCompletionCheckSpec,
    loc: {
        ApplicationName?: string;
        NavItemKey?: string;
        DriverClass?: string;
        EntityName?: string;
        Url?: string;
    },
): boolean {
    if (check.AppName && loc.ApplicationName !== check.AppName) return false;
    if (check.NavItemKey && loc.NavItemKey !== check.NavItemKey) return false;
    if (check.DriverClass && loc.DriverClass !== check.DriverClass) return false;
    if (check.EntityName && loc.EntityName !== check.EntityName) return false;
    if (check.UrlPattern) {
        if (!loc.Url) return false;
        if (!matchGlobOrSubstring(check.UrlPattern, loc.Url)) return false;
    }
    return Boolean(
        check.AppName || check.NavItemKey || check.DriverClass || check.EntityName || check.UrlPattern,
    );
}

@RegisterClass(BaseTourCompletionCheck, 'Signal')
export class SignalCompletionCheck extends BaseTourCompletionCheck {
    public override ValidateConfig(spec: TourCompletionCheckSpec): TourValidationResult {
        if (!spec.SignalKey?.trim()) {
            return {
                Valid: false,
                Errors: [{ Code: 'SIGNAL_CHECK_MISSING_KEY', Message: 'Signal check requires SignalKey.', Severity: 'Error' }],
                Warnings: [],
            };
        }
        return { Valid: true, Errors: [], Warnings: [] };
    }

    public WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (ctx.AbortSignal.aborted) {
            return createAbortedPromise();
        }
        const targetKey = ctx.Check.SignalKey?.trim() ?? '';
        return new Promise<TourCompletionResult>((resolve) => {
            const cleanup = (): void => {
                sub.unsubscribe();
                ctx.AbortSignal.removeEventListener('abort', onAbort);
            };
            const onAbort = (): void => {
                cleanup();
                resolve({ Satisfied: false, Evidence: 'Aborted' });
            };
            ctx.AbortSignal.addEventListener('abort', onAbort, { once: true });
            const sub = TourSignals.Instance.ForKey(targetKey).subscribe((evt) => {
                if (ctx.Check.SignalPayloadFilter) {
                    const cf = CompositeFilter.FromDescriptor(ctx.Check.SignalPayloadFilter);
                    const matched = cf.Evaluate(BuildFilterEvalContext(evt.Payload ?? {}));
                    if (!matched) {
                        return;
                    }
                }
                cleanup();
                resolve({
                    Satisfied: true,
                    Evidence: `Signal:${targetKey}`,
                    Data: evt.Payload,
                });
            });
        });
    }
}

@RegisterClass(BaseTourCompletionCheck, 'EntityEvent')
export class EntityEventCompletionCheck extends BaseTourCompletionCheck {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        EntityEvents: true,
    };

    public WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (ctx.AbortSignal.aborted) {
            return createAbortedPromise();
        }
        return new Promise<TourCompletionResult>((resolve) => {
            const cleanup = (): void => {
                sub.unsubscribe();
                ctx.AbortSignal.removeEventListener('abort', onAbort);
            };
            const onAbort = (): void => {
                cleanup();
                resolve({ Satisfied: false, Evidence: 'Aborted' });
            };
            ctx.AbortSignal.addEventListener('abort', onAbort, { once: true });
            const sub = ctx.EntityEvents$.subscribe((evt) => {
                if (ctx.Check.EntityName && evt.EntityName !== ctx.Check.EntityName) {
                    return;
                }
                const expectedEvent = ctx.Check.EventType ?? 'save';
                if (expectedEvent !== 'any' && evt.EventType !== expectedEvent) {
                    return;
                }
                if (
                    ctx.Check.SaveSubType &&
                    ctx.Check.SaveSubType !== 'any' &&
                    evt.SaveSubType !== ctx.Check.SaveSubType
                ) {
                    return;
                }
                if (ctx.Check.Filter) {
                    const cf = CompositeFilter.FromDescriptor(ctx.Check.Filter);
                    const evalCtx = BuildFilterEvalContext({
                        ...(evt.Record ?? {}),
                        record: evt.Record ?? {},
                    });
                    if (!cf.Evaluate(evalCtx)) {
                        return;
                    }
                }
                cleanup();
                resolve({
                    Satisfied: true,
                    Evidence: `EntityEvent:${evt.EntityName}:${evt.EventType}`,
                    Data: evt.Record,
                });
            });
        });
    }
}

@RegisterClass(BaseTourCompletionCheck, 'FieldState')
export class FieldStateCompletionCheck extends BaseTourCompletionCheck {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        MJForms: true,
    };

    public override async EvaluateNow(ctx: TourCompletionContext): Promise<boolean> {
        const fieldName = ctx.Check.FieldName ?? ctx.Step.Anchor?.Field;
        if (!fieldName) {
            return false;
        }
        const reader = ctx.GetFieldValue ?? ctx.AnchorBridge?.GetFieldValue;
        const value = reader
            ? reader(ctx.Check.EntityName ?? ctx.Step.Anchor?.Entity, fieldName)
            : readFieldFromContext(ctx.ConditionContext, fieldName);

        if (value === undefined && !reader && !hasContextField(ctx.ConditionContext, fieldName)) {
            return false;
        }

        const operator = ctx.Check.Operator ?? 'isnotempty';
        const cf = CompositeFilter.FromDescriptor({
            logic: 'and',
            filters: [{ field: fieldName, operator, value: ctx.Check.Value ?? null }],
        });
        return cf.Evaluate({ '': { [fieldName]: value } });
    }

    public async WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (await this.EvaluateNow(ctx)) {
            return { Satisfied: true, Evidence: 'FieldState' };
        }
        if (ctx.AbortSignal.aborted) {
            return { Satisfied: false, Evidence: 'Aborted' };
        }
        // Re-check on NextRequested, EntityEvents, or TourSignals until satisfied or aborted
        return new Promise<TourCompletionResult>((resolve) => {
            const checkNow = async (): Promise<void> => {
                if (await this.EvaluateNow(ctx)) {
                    cleanup();
                    resolve({ Satisfied: true, Evidence: 'FieldState' });
                }
            };
            const cleanup = (): void => {
                s1.unsubscribe();
                s2.unsubscribe();
                s3.unsubscribe();
                ctx.AbortSignal.removeEventListener('abort', onAbort);
            };
            const onAbort = (): void => {
                cleanup();
                resolve({ Satisfied: false, Evidence: 'Aborted' });
            };
            ctx.AbortSignal.addEventListener('abort', onAbort, { once: true });
            const s1 = ctx.NextRequested$.subscribe(() => {
                void checkNow();
            });
            const s2 = ctx.EntityEvents$.subscribe(() => {
                void checkNow();
            });
            const s3 = TourSignals.Instance.Signals$.subscribe(() => {
                void checkNow();
            });
        });
    }
}

@RegisterClass(BaseTourCompletionCheck, 'ServerPredicate')
export class ServerPredicateCompletionCheck extends BaseTourCompletionCheck {
    public override async EvaluateNow(ctx: TourCompletionContext): Promise<boolean> {
        if (!ctx.Check.PredicateKey || !ctx.ServerPredicateEvaluator) {
            return false;
        }
        const results = await ctx.ServerPredicateEvaluator.EvaluatePredicates([
            { PredicateKey: ctx.Check.PredicateKey, Params: ctx.Check.PredicateParams },
        ]);
        return results.some((r) => r.PredicateKey === ctx.Check.PredicateKey && r.Satisfied);
    }

    public async WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (await this.EvaluateNow(ctx)) {
            return { Satisfied: true, Evidence: `ServerPredicate:${ctx.Check.PredicateKey}` };
        }
        if (ctx.AbortSignal.aborted) {
            return { Satisfied: false, Evidence: 'Aborted' };
        }
        return new Promise<TourCompletionResult>((resolve) => {
            const checkNow = async (): Promise<void> => {
                if (await this.EvaluateNow(ctx)) {
                    cleanup();
                    resolve({ Satisfied: true, Evidence: `ServerPredicate:${ctx.Check.PredicateKey}` });
                }
            };
            const cleanup = (): void => {
                s1.unsubscribe();
                s2.unsubscribe();
                ctx.AbortSignal.removeEventListener('abort', onAbort);
            };
            const onAbort = (): void => {
                cleanup();
                resolve({ Satisfied: false, Evidence: 'Aborted' });
            };
            ctx.AbortSignal.addEventListener('abort', onAbort, { once: true });
            const s1 = ctx.EntityEvents$.subscribe(() => {
                void checkNow();
            });
            const s2 = ctx.NextRequested$.subscribe(() => {
                void checkNow();
            });
        });
    }
}

@RegisterClass(BaseTourCompletionCheck, 'AgentConfirmed')
export class AgentConfirmedCompletionCheck extends BaseTourCompletionCheck {
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        Agent: ['Chat', 'Voice', 'Chat and Voice'],
    };

    public WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        if (ctx.AbortSignal.aborted) {
            return createAbortedPromise();
        }
        return new Promise<TourCompletionResult>((resolve) => {
            const cleanup = (): void => {
                sub.unsubscribe();
                ctx.AbortSignal.removeEventListener('abort', onAbort);
            };
            const onAbort = (): void => {
                cleanup();
                resolve({ Satisfied: false, Evidence: 'Aborted' });
            };
            ctx.AbortSignal.addEventListener('abort', onAbort, { once: true });
            const sub = ctx.AgentConfirmed$.subscribe((data) => {
                cleanup();
                resolve({ Satisfied: true, Evidence: 'AgentConfirmed', Data: data });
            });
        });
    }
}

@RegisterClass(BaseTourCompletionCheck, 'All')
export class AllCompletionCheck extends BaseTourCompletionCheck {
    public override async EvaluateNow(ctx: TourCompletionContext): Promise<boolean> {
        const children = ctx.Check.Checks ?? [];
        if (children.length === 0) return true;
        for (const child of children) {
            const plugin = resolveCheckPlugin(child.Type);
            if (!plugin) return false;
            const ok = await plugin.EvaluateNow({ ...ctx, Check: child });
            if (!ok) return false;
        }
        return true;
    }

    public async WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        const children = ctx.Check.Checks ?? [];
        if (children.length === 0) {
            return new NextButtonCompletionCheck().WaitForCompletion(ctx);
        }
        const results = await Promise.all(
            children.map((child) => {
                const plugin = resolveCheckPlugin(child.Type);
                if (!plugin) {
                    return Promise.resolve<TourCompletionResult>({
                        Satisfied: false,
                        Evidence: `UnknownCheck:${child.Type}`,
                    });
                }
                return plugin.WaitForCompletion({ ...ctx, Check: child });
            }),
        );
        const allOk = results.every((r) => r.Satisfied);
        return {
            Satisfied: allOk,
            Evidence: `All(${results.map((r) => r.Evidence ?? '').join(',')})`,
        };
    }
}

@RegisterClass(BaseTourCompletionCheck, 'Any')
export class AnyCompletionCheck extends BaseTourCompletionCheck {
    public override async EvaluateNow(ctx: TourCompletionContext): Promise<boolean> {
        const children = ctx.Check.Checks ?? [];
        for (const child of children) {
            const plugin = resolveCheckPlugin(child.Type);
            if (!plugin) continue;
            if (await plugin.EvaluateNow({ ...ctx, Check: child })) {
                return true;
            }
        }
        return false;
    }

    public WaitForCompletion(ctx: TourCompletionContext): Promise<TourCompletionResult> {
        const children = ctx.Check.Checks ?? [];
        if (children.length === 0 || ctx.AbortSignal.aborted) {
            return Promise.resolve({ Satisfied: false, Evidence: 'Any(empty)' });
        }

        const innerController = new AbortController();
        const forwardAbort = (): void => innerController.abort();
        ctx.AbortSignal.addEventListener('abort', forwardAbort, { once: true });

        return new Promise<TourCompletionResult>((resolve) => {
            let settled = false;
            let remaining = children.length;

            for (const child of children) {
                const plugin = resolveCheckPlugin(child.Type);
                if (!plugin) {
                    remaining--;
                    if (remaining === 0 && !settled) {
                        settled = true;
                        ctx.AbortSignal.removeEventListener('abort', forwardAbort);
                        resolve({ Satisfied: false, Evidence: 'Any(none-resolved)' });
                    }
                    continue;
                }
                void plugin
                    .WaitForCompletion({
                        ...ctx,
                        Check: child,
                        AbortSignal: innerController.signal,
                    })
                    .then((res) => {
                        if (!settled && res.Satisfied) {
                            settled = true;
                            innerController.abort();
                            ctx.AbortSignal.removeEventListener('abort', forwardAbort);
                            resolve(res);
                            return;
                        }
                        remaining--;
                        if (remaining === 0 && !settled) {
                            settled = true;
                            ctx.AbortSignal.removeEventListener('abort', forwardAbort);
                            resolve({ Satisfied: false, Evidence: 'Aborted' });
                        }
                    });
            }
        });
    }
}

function readFieldFromContext(ctx: Record<string, unknown>, fieldName: string): unknown {
    const rec = ctx['record'];
    if (rec && typeof rec === 'object' && fieldName in (rec as Record<string, unknown>)) {
        return (rec as Record<string, unknown>)[fieldName];
    }
    return ctx[fieldName];
}

function hasContextField(ctx: Record<string, unknown>, fieldName: string): boolean {
    const rec = ctx['record'];
    if (rec && typeof rec === 'object' && fieldName in (rec as Record<string, unknown>)) {
        return true;
    }
    return fieldName in ctx;
}

function matchGlobOrSubstring(pattern: string, value: string): boolean {
    if (!pattern.includes('*')) {
        return value.includes(pattern);
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(value);
}

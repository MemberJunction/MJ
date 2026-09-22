/**
 * @fileoverview Scheduled-job driver that evaluates active usage budgets against saved Query definitions.
 * @module @memberjunction/scheduling-engine
 */

import { EscapeSQLString, RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { ValidationResult, RunView, RunQuery, IMetadataProvider, IRunViewProvider, IRunQueryProvider } from '@memberjunction/core';
import { MJUsageBudgetEntity, MJUsageBudgetEventEntity } from '@memberjunction/core-entities';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';
import { CronExpressionHelper } from '../CronExpressionHelper';

export interface UsageBudgetEvaluationItemResult {
    BudgetID: string;
    Name: string;
    ObservedAmount?: number;
    AmountLimit?: number;
    Period?: string;
    Breached?: boolean;
    ThresholdPercent?: number;
    Action?: MJUsageBudgetEntity['Action'];
    Success: boolean;
    ErrorMessage?: string;
}

/**
 * Scheduled job driver that sweeps all active `MJ: Usage Budgets`, executes their configured
 * measurement queries for the active period window, and records `MJ: Usage Budget Events` when
 * warning or limit thresholds are breached.
 */
@RegisterClass(BaseScheduledJob, 'UsageBudgetEvaluationScheduledJobDriver')
export class UsageBudgetEvaluationScheduledJobDriver extends BaseScheduledJob {
    /**
     * Calculates the UTC start timestamp for a given budget period ('Day', 'Week', 'Month').
     *
     * Week boundaries adhere to the ISO-8601 standard, starting on Monday at 00:00:00.000 UTC.
     * Day starts at 00:00:00.000 UTC on the current day.
     * Month starts on the 1st of the current month at 00:00:00.000 UTC.
     *
     * @param period - The budget period cadence ('Day' | 'Week' | 'Month')
     * @param now - The reference date
     * @returns The UTC start Date for the current period window
     */
    public static calculatePeriodStart(period: MJUsageBudgetEntity['Period'], now: Date): Date {
        switch (period) {
            case 'Day':
                return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
            case 'Week': {
                const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
                const day = (start.getUTCDay() + 6) % 7; // ISO-8601 Monday-start: Monday is 0, Sunday is 6
                start.setUTCDate(start.getUTCDate() - day);
                return start;
            }
            case 'Month':
                return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
            default:
                return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        }
    }

    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const rawProvider = context.Schedule?.ProviderToUse ?? context.Run?.ProviderToUse;
        if (!rawProvider) {
            return {
                Success: false,
                ErrorMessage: 'No metadata provider available on scheduled job context',
                Details: { EvaluatedCount: 0, BreachedCount: 0, FailedCount: 0, Items: [] },
            };
        }
        const provider = rawProvider as unknown as (IMetadataProvider & IRunViewProvider & IRunQueryProvider);

        const rv = new RunView(provider);
        const budgetResult = await rv.RunView<MJUsageBudgetEntity>(
            {
                EntityName: 'MJ: Usage Budgets',
                ExtraFilter: `Status = 'Active'`,
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );

        if (!budgetResult.Success) {
            return {
                Success: false,
                ErrorMessage: `Failed to load active usage budgets: ${budgetResult.ErrorMessage ?? 'unknown error'}`,
                Details: { EvaluatedCount: 0, BreachedCount: 0, FailedCount: 0, Items: [] },
            };
        }

        const budgets = budgetResult.Results ?? [];
        const now = new Date();
        let evaluated = 0;
        let breached = 0;
        let failed = 0;
        const items: UsageBudgetEvaluationItemResult[] = [];

        for (const budget of budgets) {
            void context.heartbeat?.();

            try {
                const periodStart = UsageBudgetEvaluationScheduledJobDriver.calculatePeriodStart(budget.Period, now);

                let parameters: Record<string, unknown> = {};
                if (budget.MeasureParameters) {
                    try {
                        const parsed = typeof budget.MeasureParameters === 'string'
                            ? SafeJSONParse(budget.MeasureParameters)
                            : budget.MeasureParameters;
                        if (parsed && typeof parsed === 'object') {
                            parameters = parsed as Record<string, unknown>;
                        }
                    } catch {
                        parameters = {};
                    }
                }

                if (parameters['PeriodStart'] === undefined) {
                    parameters['PeriodStart'] = periodStart.toISOString();
                }
                if (parameters['PeriodEnd'] === undefined) {
                    parameters['PeriodEnd'] = now.toISOString();
                }

                const rq = new RunQuery(provider);
                const queryResult = await rq.RunQuery(
                    {
                        QueryID: budget.MeasureQueryID,
                        Parameters: parameters,
                    },
                    context.ContextUser,
                );

                if (!queryResult.Success) {
                    failed++;
                    items.push({
                        BudgetID: budget.ID,
                        Name: budget.Name,
                        Period: budget.Period,
                        Success: false,
                        ErrorMessage: `Query execution failed: ${queryResult.ErrorMessage ?? 'unknown error'}`,
                    });
                    continue;
                }

                // MEASUREMENT FAILS CLOSED. A successful RunQuery is not a successful measurement:
                // the query can return no rows, omit MeasureColumn entirely (schema drift, or a
                // misconfigured column name), or carry a null or non-numeric value. An earlier
                // revision defaulted observedAmount to 0 and persisted it in all four cases, which
                // made "we could not measure this" indistinguishable from "this spent nothing" —
                // the exact conflation the cost doctrine this feature belongs to exists to prevent,
                // and the more dangerous direction for a budget, since an unmeasurable one silently
                // reads as far under limit. A genuine measured 0 is still a valid measurement and
                // passes through untouched.
                const rows = (queryResult.Results ?? []) as Array<Record<string, unknown>>;
                const measureFailure = ((): string | null => {
                    if (rows.length === 0) {
                        return 'measure query returned no rows';
                    }
                    if (!(budget.MeasureColumn in rows[0])) {
                        return `measure query result has no column '${budget.MeasureColumn}'`;
                    }
                    const rawVal = rows[0][budget.MeasureColumn];
                    if (rawVal == null) {
                        return `measure column '${budget.MeasureColumn}' is null`;
                    }
                    const parsed = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
                    if (!Number.isFinite(parsed)) {
                        return `measure column '${budget.MeasureColumn}' is not a finite number: ${String(rawVal)}`;
                    }
                    return null;
                })();

                if (measureFailure) {
                    // Deliberately leaves LastObservedAmount and LastEvaluatedAt untouched: the last
                    // KNOWN observation is more useful than a synthetic zero, and the guardrail that
                    // reads LastObservedAmount must not be handed a fabricated one.
                    failed++;
                    items.push({
                        BudgetID: budget.ID,
                        Name: budget.Name,
                        Period: budget.Period,
                        Success: false,
                        ErrorMessage: `Measurement failed: ${measureFailure}`,
                    });
                    continue;
                }

                const rawMeasure = rows[0][budget.MeasureColumn];
                const observedAmount = typeof rawMeasure === 'number' ? rawMeasure : parseFloat(String(rawMeasure));

                budget.LastEvaluatedAt = now;
                budget.LastObservedAmount = observedAmount;
                const saveOk = await budget.Save();
                if (!saveOk) {
                    this.log(`Failed to save updated LastObservedAmount for budget ${budget.ID}: ${budget.LatestResult?.Message ?? 'unknown'}`);
                }

                evaluated++;

                const limit = Number(budget.AmountLimit);
                const warnPercent = budget.WarnAtPercent != null ? Number(budget.WarnAtPercent) : 80;
                const warnThreshold = (warnPercent / 100) * limit;

                let breachedThreshold: number | null = null;
                let breachAction: MJUsageBudgetEntity['Action'] | null = null;

                if (limit > 0 && observedAmount >= limit) {
                    breachedThreshold = 100;
                    breachAction = budget.Action;
                } else if (limit > 0 && observedAmount >= warnThreshold) {
                    breachedThreshold = warnPercent;
                    breachAction = 'Notify';
                }

                if (breachedThreshold != null && breachAction != null) {
                    // Escaped, not trusted for its shape. Both values are platform-sourced — a
                    // budget's primary key and a timestamp this method computed — so the exposure
                    // today is low, which is exactly why it is easy to leave as the one raw
                    // interpolation in a branch that parameterises everywhere else. The rule is
                    // about the site, not the current value: the next person to reuse this filter
                    // shape inherits whatever discipline they find here. `breachedThreshold` is a
                    // number this method assigned from two literals, so it is interpolated bare.
                    const eventFilter =
                        `BudgetID = '${EscapeSQLString(budget.ID)}' `
                        + `AND PeriodStart >= '${EscapeSQLString(periodStart.toISOString())}' `
                        + `AND ThresholdPercent = ${breachedThreshold}`;
                    const existingEventCheck = await rv.RunView<MJUsageBudgetEventEntity>(
                        {
                            EntityName: 'MJ: Usage Budget Events',
                            ExtraFilter: eventFilter,
                            ResultType: 'entity_object',
                        },
                        context.ContextUser,
                    );

                    // A breach that cannot be durably recorded is a FAILED evaluation, not a
                    // handled one. Previously a failed dedupe lookup fell through this `if` and the
                    // item still reported Breached: true, Success: true — the run detected a limit
                    // breach, wrote no event, raised no alert, and reported success. Failure to
                    // establish dedupe state is not evidence that the event already exists.
                    if (!existingEventCheck.Success) {
                        failed++;
                        items.push({
                            BudgetID: budget.ID,
                            Name: budget.Name,
                            ObservedAmount: observedAmount,
                            AmountLimit: limit,
                            Period: budget.Period,
                            Breached: true,
                            ThresholdPercent: breachedThreshold,
                            Action: breachAction,
                            Success: false,
                            ErrorMessage: `Breach detected but the existing-event lookup failed, so no alert could be recorded: ${existingEventCheck.ErrorMessage ?? 'unknown error'}`,
                        });
                        continue;
                    }

                    const existingEvents = existingEventCheck.Results ?? [];
                    if (existingEvents.length === 0) {
                        const newEvent = await provider.GetEntityObject<MJUsageBudgetEventEntity>(
                            'MJ: Usage Budget Events',
                            context.ContextUser,
                        );
                        newEvent.BudgetID = budget.ID;
                        newEvent.PeriodStart = periodStart;
                        newEvent.ObservedAmount = observedAmount;
                        newEvent.ThresholdPercent = breachedThreshold;
                        newEvent.Action = breachAction;
                        newEvent.NotifiedAt = now;
                        const eventSaved = await newEvent.Save();
                        if (eventSaved) {
                            breached++;
                        } else {
                            // Same reasoning: the alert is the product here, so failing to persist
                            // it is a failed evaluation rather than a quiet log line.
                            this.log(`Failed to save UsageBudgetEvent for budget ${budget.ID}: ${newEvent.LatestResult?.Message ?? 'unknown'}`);
                            failed++;
                            items.push({
                                BudgetID: budget.ID,
                                Name: budget.Name,
                                ObservedAmount: observedAmount,
                                AmountLimit: limit,
                                Period: budget.Period,
                                Breached: true,
                                ThresholdPercent: breachedThreshold,
                                Action: breachAction,
                                Success: false,
                                ErrorMessage: `Breach detected but the alert could not be saved: ${newEvent.LatestResult?.Message ?? 'unknown error'}`,
                            });
                            continue;
                        }
                    }
                    // An event already existing for this threshold+period is a real no-op: the
                    // alert was raised on an earlier run. BreachedCount counts alerts RECORDED by
                    // this run, not budgets currently in breach, so it is deliberately not
                    // incremented here.
                }

                items.push({
                    BudgetID: budget.ID,
                    Name: budget.Name,
                    ObservedAmount: observedAmount,
                    AmountLimit: limit,
                    Period: budget.Period,
                    Breached: breachedThreshold != null,
                    ThresholdPercent: breachedThreshold ?? undefined,
                    Action: breachAction ?? undefined,
                    Success: true,
                });
            } catch (err) {
                failed++;
                const message = err instanceof Error ? err.message : String(err);
                items.push({
                    BudgetID: budget.ID,
                    Name: budget.Name,
                    Period: budget.Period,
                    Success: false,
                    ErrorMessage: message,
                });
            }
        }

        return {
            Success: failed === 0,
            ErrorMessage: failed > 0 ? `${failed} usage budget(s) failed evaluation` : undefined,
            Details: {
                EvaluatedCount: evaluated,
                BreachedCount: breached,
                FailedCount: failed,
                Items: items,
            },
        };
    }

    /** Sweeps all active usage budgets; no per-job configuration required. */
    public ValidateConfiguration(): ValidationResult {
        return new ValidationResult();
    }

    public FormatNotification(_context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const d = result.Details ?? {};
        const evaluated = (d['EvaluatedCount'] as number) ?? 0;
        const breached = (d['BreachedCount'] as number) ?? 0;
        const failed = (d['FailedCount'] as number) ?? 0;

        return {
            Subject: `Usage budget evaluation — ${result.Success ? (breached > 0 ? `Alert: ${breached} budget breach(es)` : 'OK') : 'errors'}`,
            Body: `Evaluated ${evaluated} active budget(s). Recorded ${breached} breach event(s).${failed > 0 ? ` ${failed} budget(s) failed evaluation.` : ''}`,
            Priority: !result.Success || breached > 0 ? 'High' : 'Normal',
        };
    }
}

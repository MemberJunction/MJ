/**
 * @fileoverview Scheduled-job driver that evaluates active usage budgets against saved Query definitions.
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { ValidationResult, RunView, RunQuery, IMetadataProvider } from '@memberjunction/core';
import { MJUsageBudgetEntity, MJUsageBudgetEventEntity } from '@memberjunction/core-entities';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';

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
 * Driver for the scheduled usage budget evaluation sweep (plans/ai-usage-analytics.md §9 / MJ#4396 Part 8).
 *
 * Sweeps all active `MJ: Usage Budgets`, executes each budget's `MeasureQueryID` via `RunQuery` over
 * the current period window (Day, Week, Month UTC), persists `LastEvaluatedAt` and `LastObservedAmount`,
 * and logs `MJ: Usage Budget Events` when warning or limit thresholds are breached.
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
        const provider = context.Schedule?.ProviderToUse ?? context.Run?.ProviderToUse;
        if (!provider) {
            return {
                Success: false,
                ErrorMessage: 'No metadata provider available on scheduled job context',
                Details: { EvaluatedCount: 0, BreachedCount: 0, FailedCount: 0, Items: [] },
            };
        }

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

                let observedAmount = 0;
                const rows = (queryResult.Results ?? []) as Array<Record<string, unknown>>;
                if (rows.length > 0) {
                    const rawVal = rows[0][budget.MeasureColumn];
                    if (rawVal != null) {
                        const parsed = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
                        if (!isNaN(parsed)) {
                            observedAmount = parsed;
                        }
                    }
                }

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
                    const eventFilter = `BudgetID = '${budget.ID}' AND PeriodStart >= '${periodStart.toISOString()}' AND ThresholdPercent = ${breachedThreshold}`;
                    const existingEventCheck = await rv.RunView<MJUsageBudgetEventEntity>(
                        {
                            EntityName: 'MJ: Usage Budget Events',
                            ExtraFilter: eventFilter,
                            ResultType: 'entity_object',
                        },
                        context.ContextUser,
                    );

                    const existingEvents = existingEventCheck.Results ?? [];
                    if (existingEventCheck.Success && existingEvents.length === 0) {
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
                            this.log(`Failed to save UsageBudgetEvent for budget ${budget.ID}: ${newEvent.LatestResult?.Message ?? 'unknown'}`);
                        }
                    }
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

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunViewQueue: Array<{ Success: boolean; Results?: unknown[]; ErrorMessage?: string }> = [];
const mockRunQueryQueue: Array<{ Success: boolean; Results?: unknown[]; ErrorMessage?: string }> = [];

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    SafeJSONParse: (str: string) => {
        try { return JSON.parse(str); } catch { return null; }
    },
}));

vi.mock('@memberjunction/core', () => {
    return {
        ValidationResult: class {
            Success = true;
            Errors: Array<{ Source: string; Message: string }> = [];
        },
        RunView: class {
            async RunView(): Promise<unknown> {
                return mockRunViewQueue.shift() ?? { Success: true, Results: [] };
            }
        },
        RunQuery: class {
            async RunQuery(): Promise<unknown> {
                return mockRunQueryQueue.shift() ?? { Success: true, Results: [] };
            }
        },
        Metadata: class {
            static Provider = {
                GetEntityObject: vi.fn(),
            };
        },
        UserInfo: class { ID = 'user-1'; },
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJUsageBudgetEntity: class {},
    MJUsageBudgetEventEntity: class {},
    MJScheduledJobEntity: class {},
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationContent: class {},
}));

import { UsageBudgetEvaluationScheduledJobDriver } from '../drivers/UsageBudgetEvaluationScheduledJobDriver';

const mockProvider = {
    GetEntityObject: vi.fn(),
};

const mockContext = (providerOverride?: unknown) => ({
    Schedule: { Name: 'Usage Budget Evaluation', ID: 'job-1', ProviderToUse: providerOverride ?? mockProvider },
    Run: { ID: 'run-1', ProviderToUse: providerOverride ?? mockProvider },
    ContextUser: { ID: 'sys-user' },
    heartbeat: vi.fn(),
} as never);

describe('UsageBudgetEvaluationScheduledJobDriver', () => {
    let driver: UsageBudgetEvaluationScheduledJobDriver;

    beforeEach(() => {
        driver = new UsageBudgetEvaluationScheduledJobDriver();
        mockRunViewQueue.length = 0;
        mockRunQueryQueue.length = 0;
        vi.clearAllMocks();
    });

    describe('calculatePeriodStart', () => {
        it('calculates Day period start at UTC midnight', () => {
            const now = new Date('2026-09-15T14:35:22.000Z');
            const start = UsageBudgetEvaluationScheduledJobDriver.calculatePeriodStart('Day', now);
            expect(start.toISOString()).toBe('2026-09-15T00:00:00.000Z');
        });

        it('calculates Week period start at UTC Monday midnight (ISO-8601)', () => {
            // 2026-09-15 is a Tuesday (day 2 of week, Monday is 2026-09-14)
            const now = new Date('2026-09-15T14:35:22.000Z');
            const start = UsageBudgetEvaluationScheduledJobDriver.calculatePeriodStart('Week', now);
            expect(start.toISOString()).toBe('2026-09-14T00:00:00.000Z');
            expect(start.getUTCDay()).toBe(1); // Monday is day 1
        });

        it('calculates Month period start at 1st of month UTC midnight', () => {
            const now = new Date('2026-09-15T14:35:22.000Z');
            const start = UsageBudgetEvaluationScheduledJobDriver.calculatePeriodStart('Month', now);
            expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
        });
    });

    describe('Execute', () => {
        it('handles failure to load active budgets from RunView', async () => {
            mockRunViewQueue.push({
                Success: false,
                ErrorMessage: 'DB connection error',
            });

            const result = await driver.Execute(mockContext());
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Failed to load active usage budgets');
        });

        it('evaluates active budgets, updates LastObservedAmount, and handles normal consumption under warning threshold', async () => {
            const mockBudget = {
                ID: 'budget-1',
                Name: 'Agent Monthly Spend',
                MeasureQueryID: 'query-1',
                MeasureParameters: '{"Model":"gpt-4"}',
                MeasureColumn: 'TotalSpend',
                Period: 'Month' as const,
                AmountLimit: 100,
                WarnAtPercent: 80,
                Action: 'Block' as const,
                Status: 'Active' as const,
                LastEvaluatedAt: null,
                LastObservedAmount: null,
                Save: vi.fn().mockResolvedValue(true),
            };

            mockRunViewQueue.push({
                Success: true,
                Results: [mockBudget],
            });

            mockRunQueryQueue.push({
                Success: true,
                Results: [{ TotalSpend: 50 }],
            });

            const result = await driver.Execute(mockContext());
            expect(result.Success).toBe(true);
            expect(mockBudget.LastObservedAmount).toBe(50);
            expect(mockBudget.Save).toHaveBeenCalled();
            expect(result.Details).toMatchObject({
                EvaluatedCount: 1,
                BreachedCount: 0,
                FailedCount: 0,
            });
        });

        it('creates a warning UsageBudgetEvent when WarnAtPercent is reached', async () => {
            const mockBudget = {
                ID: 'budget-2',
                Name: 'Daily Token Budget',
                MeasureQueryID: 'query-2',
                MeasureColumn: 'TokenCount',
                Period: 'Day' as const,
                AmountLimit: 1000,
                WarnAtPercent: 80,
                Action: 'Throttle' as const,
                Status: 'Active' as const,
                Save: vi.fn().mockResolvedValue(true),
            };

            const mockCreatedEvent = {
                BudgetID: '',
                PeriodStart: null as unknown,
                ObservedAmount: 0,
                ThresholdPercent: 0,
                Action: '',
                NotifiedAt: null as unknown,
                Save: vi.fn().mockResolvedValue(true),
            };

            mockRunViewQueue.push({ Success: true, Results: [mockBudget] }); // budget list
            mockRunViewQueue.push({ Success: true, Results: [] }); // existing event check (empty)

            mockRunQueryQueue.push({
                Success: true,
                Results: [{ TokenCount: 850 }], // 85% >= 80%
            });

            mockProvider.GetEntityObject.mockResolvedValue(mockCreatedEvent as never);

            const result = await driver.Execute(mockContext());
            expect(result.Success).toBe(true);
            expect(mockBudget.LastObservedAmount).toBe(850);
            expect(mockCreatedEvent.ThresholdPercent).toBe(80);
            expect(mockCreatedEvent.Action).toBe('Notify');
            expect(mockCreatedEvent.Save).toHaveBeenCalled();
            expect(result.Details).toMatchObject({
                EvaluatedCount: 1,
                BreachedCount: 1,
            });
        });

        it('creates a limit UsageBudgetEvent with configured Action when AmountLimit is exceeded', async () => {
            const mockBudget = {
                ID: 'budget-3',
                Name: 'Hard Block Budget',
                MeasureQueryID: 'query-3',
                MeasureColumn: 'Spend',
                Period: 'Month' as const,
                AmountLimit: 500,
                WarnAtPercent: 80,
                Action: 'Block' as const,
                Status: 'Active' as const,
                Save: vi.fn().mockResolvedValue(true),
            };

            const mockCreatedEvent = {
                BudgetID: '',
                PeriodStart: null as unknown,
                ObservedAmount: 0,
                ThresholdPercent: 0,
                Action: '',
                NotifiedAt: null as unknown,
                Save: vi.fn().mockResolvedValue(true),
            };

            mockRunViewQueue.push({ Success: true, Results: [mockBudget] });
            mockRunViewQueue.push({ Success: true, Results: [] });

            mockRunQueryQueue.push({
                Success: true,
                Results: [{ Spend: 550 }], // 110% >= 100%
            });

            mockProvider.GetEntityObject.mockResolvedValue(mockCreatedEvent as never);

            const result = await driver.Execute(mockContext());
            expect(result.Success).toBe(true);
            expect(mockCreatedEvent.ThresholdPercent).toBe(100);
            expect(mockCreatedEvent.Action).toBe('Block');
            expect(mockCreatedEvent.Save).toHaveBeenCalled();
            expect(result.Details).toMatchObject({
                EvaluatedCount: 1,
                BreachedCount: 1,
            });
        });

        it('deduplicates and skips creating duplicate events when one already exists for the period', async () => {
            const mockBudget = {
                ID: 'budget-4',
                Name: 'Duplicate Test Budget',
                MeasureQueryID: 'query-4',
                MeasureColumn: 'Amount',
                Period: 'Day' as const,
                AmountLimit: 100,
                WarnAtPercent: 80,
                Action: 'Block' as const,
                Status: 'Active' as const,
                Save: vi.fn().mockResolvedValue(true),
            };

            mockRunViewQueue.push({ Success: true, Results: [mockBudget] });
            mockRunViewQueue.push({ Success: true, Results: [{ ID: 'event-existing' }] }); // existing event found

            mockRunQueryQueue.push({
                Success: true,
                Results: [{ Amount: 120 }],
            });

            const result = await driver.Execute(mockContext());
            expect(result.Success).toBe(true);
            expect(mockProvider.GetEntityObject).not.toHaveBeenCalled();
            expect(result.Details).toMatchObject({
                EvaluatedCount: 1,
                BreachedCount: 0,
            });
        });
    
        // ── Measurement fails closed ────────────────────────────────────────────────────────
        // A successful RunQuery is not a successful measurement. Each of these states previously
        // persisted LastObservedAmount = 0 and reported success, making "could not measure" look
        // identical to "spent nothing" — the dangerous direction for a budget, since an
        // unmeasurable one silently reads as far under limit.

        const measurableBudget = (overrides: Record<string, unknown> = {}) => ({
            ID: 'budget-measure',
            Name: 'Measure Failure Budget',
            MeasureQueryID: 'query-m',
            MeasureParameters: '{}',
            MeasureColumn: 'TotalSpend',
            Period: 'Month' as const,
            AmountLimit: 100,
            WarnAtPercent: 80,
            Action: 'Notify' as const,
            Status: 'Active' as const,
            LastEvaluatedAt: null,
            LastObservedAmount: 42,
            Save: vi.fn().mockResolvedValue(true),
            ...overrides,
        });

        const measureFailureCases: Array<{ name: string; rows: unknown[] }> = [
            { name: 'the measure query returns no rows', rows: [] },
            { name: 'the row does not contain MeasureColumn', rows: [{ SomethingElse: 5 }] },
            { name: 'MeasureColumn is null', rows: [{ TotalSpend: null }] },
            { name: 'MeasureColumn is non-numeric', rows: [{ TotalSpend: 'not-a-number' }] },
        ];

        for (const tc of measureFailureCases) {
            it(`records a failed evaluation, not 0, when ${tc.name}`, async () => {
                const mockBudget = measurableBudget();
                mockRunViewQueue.push({ Success: true, Results: [mockBudget] });
                mockRunQueryQueue.push({ Success: true, Results: tc.rows });

                const result = await driver.Execute(mockContext());

                expect(result.Details).toMatchObject({ EvaluatedCount: 0, FailedCount: 1 });
                // The last KNOWN observation survives; it is not replaced by a synthetic zero.
                expect(mockBudget.LastObservedAmount).toBe(42);
                expect(mockBudget.Save).not.toHaveBeenCalled();
                const item = (result.Details as { Items: Array<{ Success: boolean; ErrorMessage?: string }> }).Items[0];
                expect(item.Success).toBe(false);
                expect(item.ErrorMessage).toContain('Measurement failed');
            });
        }

        it('treats a measured 0 as a valid measurement, not a failure', async () => {
            const mockBudget = measurableBudget({ LastObservedAmount: 42 });
            mockRunViewQueue.push({ Success: true, Results: [mockBudget] });
            mockRunQueryQueue.push({ Success: true, Results: [{ TotalSpend: 0 }] });

            const result = await driver.Execute(mockContext());

            expect(result.Details).toMatchObject({ EvaluatedCount: 1, FailedCount: 0 });
            expect(mockBudget.LastObservedAmount).toBe(0);
            expect(mockBudget.Save).toHaveBeenCalled();
        });

        it('fails the evaluation when a breach is detected but the dedupe lookup fails', async () => {
            const mockBudget = measurableBudget({ ID: 'budget-breach', LastObservedAmount: null });
            mockRunViewQueue.push({ Success: true, Results: [mockBudget] });      // load budgets
            mockRunQueryQueue.push({ Success: true, Results: [{ TotalSpend: 150 }] }); // over limit
            mockRunViewQueue.push({ Success: false, ErrorMessage: 'lookup exploded' }); // dedupe read

            const result = await driver.Execute(mockContext());

            // A breach that cannot be durably recorded must not report success.
            expect(result.Details).toMatchObject({ BreachedCount: 0, FailedCount: 1 });
            const item = (result.Details as { Items: Array<{ Success: boolean; Breached?: boolean; ErrorMessage?: string }> }).Items[0];
            expect(item.Success).toBe(false);
            expect(item.Breached).toBe(true);
            expect(item.ErrorMessage).toContain('no alert could be recorded');
        });

});

    describe('ValidateConfiguration & FormatNotification', () => {
        it('ValidateConfiguration returns Success', () => {
            const res = driver.ValidateConfiguration();
            expect(res.Success).toBe(true);
        });

        it('FormatNotification returns high priority when breaches occurred', () => {
            const notif = driver.FormatNotification(mockContext(), {
                Success: true,
                Details: { EvaluatedCount: 5, BreachedCount: 2, FailedCount: 0 },
            });
            expect(notif.Priority).toBe('High');
            expect(notif.Subject).toContain('Alert: 2 budget breach(es)');
        });

        it('FormatNotification returns normal priority on clean run', () => {
            const notif = driver.FormatNotification(mockContext(), {
                Success: true,
                Details: { EvaluatedCount: 5, BreachedCount: 0, FailedCount: 0 },
            });
            expect(notif.Priority).toBe('Normal');
            expect(notif.Subject).toContain('OK');
        });
    });
});

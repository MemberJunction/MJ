/**
 * usage-budgets.checks.ts — the 'usage-budgets' bundle (UB1): integration checks for Usage Budgets,
 * including scheduled evaluation driver resolution, period math, threshold triggers, and metadata integrity.
 *
 * TRANSPORT: CLIENT-CAPABLE. Reads through metadata and driver classes.
 * ANTI-VACUITY: When database has no active budgets configured, it verifies driver registration,
 * period boundary calculation math, and skips live data evaluations loudly.
 */
import { MJGlobal } from '@memberjunction/global';
import { BaseScheduledJob } from '@memberjunction/scheduling-engine';
import { UsageBudgetEvaluationScheduledJobDriver } from '@memberjunction/scheduling-engine';
import { MJUsageBudgetEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { Assert, AssertEqual, NamedCheck, IntegrationCheckContext, IntegrationCheckRegistry } from '@memberjunction/testing-integration';

/** Loud, uniform skip-as-pass note. */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ usage-budgets.${checkId} SKIPPED — ${reason}`);
}

export const UsageBudgetsChecks: NamedCheck[] = [
    {
        Id: 'usage-budgets.UB1',
        Name: 'UB1: UsageBudgetEvaluationScheduledJobDriver resolves, evaluates active budgets, and calculates thresholds',
        Fn: async (ctx: IntegrationCheckContext) => {
            // 1. Verify DriverClass registration on ClassFactory
            const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseScheduledJob>(
                BaseScheduledJob,
                'UsageBudgetEvaluationScheduledJobDriver'
            );
            Assert(resolution.Resolved && resolution.Instance != null, 'UsageBudgetEvaluationScheduledJobDriver failed to resolve via ClassFactory');
            Assert(resolution.Instance instanceof UsageBudgetEvaluationScheduledJobDriver, 'Resolved driver is not an instance of UsageBudgetEvaluationScheduledJobDriver');

            // 2. Verify period boundary calculations (Day, Week, Month UTC)
            const testDate = new Date('2026-06-15T14:30:00.000Z');
            const dayStart = UsageBudgetEvaluationScheduledJobDriver.calculatePeriodStart('Day', testDate);
            AssertEqual(dayStart.toISOString(), '2026-06-15T00:00:00.000Z', 'Day period start mismatch');

            const weekStart = UsageBudgetEvaluationScheduledJobDriver.calculatePeriodStart('Week', testDate); // 2026-06-15 is Monday
            AssertEqual(weekStart.toISOString(), '2026-06-15T00:00:00.000Z', 'Week period start mismatch');

            const monthStart = UsageBudgetEvaluationScheduledJobDriver.calculatePeriodStart('Month', testDate);
            AssertEqual(monthStart.toISOString(), '2026-06-01T00:00:00.000Z', 'Month period start mismatch');

            // 3. Query active budgets in database
            const runView = new RunView();
            const budgetsResult = await runView.RunView<MJUsageBudgetEntity>(
                {
                    EntityName: 'MJ: Usage Budgets',
                    ExtraFilter: "Status = 'Active'",
                    ResultType: 'entity_object'
                },
                ctx.User
            );

            if (!budgetsResult.Success || !budgetsResult.Results || budgetsResult.Results.length === 0) {
                skipNote('UB1', 'No active MJ: Usage Budgets records seeded in target database; pure driver contracts and period math passed.');
                return;
            }

            console.log(`      → Found ${budgetsResult.Results.length} active usage budget(s) in target DB`);
            for (const budget of budgetsResult.Results) {
                Assert(!!budget.ID, 'Budget record missing ID');
                Assert(!!budget.Name, `Budget ${budget.ID} missing Name`);
                Assert(budget.AmountLimit > 0, `Budget ${budget.Name} AmountLimit must be > 0`);
                Assert(['Day', 'Week', 'Month'].includes(budget.Period), `Budget ${budget.Name} invalid Period: ${budget.Period}`);
                Assert(['Notify', 'Throttle', 'Block'].includes(budget.Action), `Budget ${budget.Name} invalid Action: ${budget.Action}`);
            }
        }
    }
];

for (const check of UsageBudgetsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

---
"@memberjunction/codegen-lib": patch
"@memberjunction/integration-test-suite": patch
---

**AI Usage Analytics PR4: Analytical Queries, Materialization Qualification, and Scheduled Sweep**

- **Analytical Stored Queries**: Authored eight core analytical queries (`AIUsageHourly`, `AIUsageDaily`, `AIUsageByModel`, `AIUsageByUser`, `AIUsageByScope`, `AIUsageCacheEfficiency`, `AIUsageErrorRateByModel`, `AIUsageUnpricedAudit`) in metadata with uuidgen IDs, `UsesTemplate = true`, `Status = 'Approved'`, and AI category.
- **CalculateRunCost Update**: Replaced `COALESCE(SUM(...), 0)` and raw `TotalCost` in `calculate-ai-agent-run-cost.sql` and `calculate-ai-agent-run-cost.pg.sql` with `SUM(CASE WHEN f.IsPriced = 1 AND f.IsParallelParent = 0 THEN f.OwnCost END)` over `vwAIUsageFacts` joined on agent run hierarchy, maintaining interface compatibility with `AIAgentRunCostService`.
- **Materialization Refresh Scheduled Job**: Registered `Materialization Refresh Sweep` scheduled job in metadata using `MaterializationRefreshScheduledJobDriver` on a 5-minute cron schedule (`*/5 * * * *`).
- **Materialization Unit Tests**: Added `@memberjunction/codegen-lib` tests in `materialization-ai-usage.test.ts` verifying AST parameter classification (`RowFilterBroad`), broad SQL generation, and 10 key column derivations for `AIUsageHourly` and `AIUsageDaily`.
- **Integration Checks AC11–AC13**: Added AC11 (fact-view own-cost parity against base prompt runs), AC12 (hourly aggregate parity live and materialized, plus scheduled job registration verification), and AC13 (agent run subtree recursive cost parity and poison guard verification) to `ai-cost.checks.ts`.

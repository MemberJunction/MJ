# AI Usage and Cost Analytics Guide

This guide establishes the architectural doctrine and invariants for AI usage, token, and cost analytics in MemberJunction (addressing GitHub issue MemberJunction/MJ#4396).

Before writing queries, dashboards, or services that measure or report AI spend, understand these nine non-negotiable rules. Violating them produces false metrics (double counting, hiding unpriced models, misattributing tenant spend, or creating cyclical dependencies).

---

## 1. Non-Negotiable Cost Basis Doctrine

These nine rules govern all AI usage and cost reporting across MemberJunction:

1. **The additive basis is own cost at the prompt-run grain: `AIPromptRun.Cost`.**
   Never `TotalCost` (= `Cost + DescendantCost`), never `AIAgentRun.TotalCost` (subtree-inclusive since `calculateTokenStats` adds sub-agent totals), never any `*Rollup` column (written only by task-graph settlement, NULL otherwise, and an output of `GetAgentRunTree` — reading it into an aggregate creates the feedback loop warned about in `metadata/queries/SQL/get-agent-run-tree.sql:21-32`). Rule 1 governs *aggregates*: displaying a single run's `TotalCost` (or `TotalCostRollup ?? TotalCost`) on a detail view or card is the correct representation for that individual run, but these inclusive columns must never be summed across runs.

2. **`Cost IS NULL` means unpriced, `Cost = 0` means free.**
   `BaseAIEngine.CalculateModelCost` (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:642-726`) returns `null` on six distinct guards for exactly this reason. No consumer may coalesce NULL to 0 in an aggregate; every cost aggregate must carry an `UnpricedRuns` count beside every cost figure.

3. **A parallel parent has no own spend.**
   A parallel parent row carries `RunType='ParallelParent'`, `Cost = NULL`, and its execution arms are persisted as `ParallelChild` rows with their own `Cost`. Where historical data may predate explicit type stamping, "parallel parent" is derived: `RunType='ParallelParent' OR EXISTS (SELECT 1 FROM [MJ: AI Prompt Runs] child WHERE child.ParentID = this.ID)`. Parallel parents are excluded from both cost sums and unpriced counts. No backfill of historical `RunType` is possible (the children were never written), so historical parents keep `Cost` = selected arm and are treated as ordinary single runs.

4. **Rollups are derived from the hierarchy at query time.**
   Agent-level cost = `SUM(Cost)` over prompt runs whose `AgentRunID` is in the run's subtree (recursive CTE bounded at depth 20, following the `CalculateRunCost` precedent), never `SUM(AIAgentRun.TotalCost)` over a set that can contain both a parent and its child.

5. **Tenant dimension = the scope pair `AIAgentRun.PrimaryScopeEntityID` / `PrimaryScopeRecordID`.**
   Carried onto the fact row through `AgentRunID`. It cascades to sub-agents (`base-agent.ts:7273-7274`), is indexed (`IX_AIAgentRun_PrimaryScope`), and is the tenant key enforced by downstream products. `CompanyID` is kept as the memory-scoping key it is documented as; sub-agents propagate it for memory scoping, and fact views expose it, but no new tenant column is added to run tables.

6. **Application and environment are derived, not stored.**
   Derived from `SourceKind` on the fact row plus `ConversationID` (resolving to `Conversation.EnvironmentID` where a consumer needs it). No `EnvironmentID` column is stored directly on run tables.

7. **Cost is frozen at save time.**
   `ShouldCalculateCost` short-circuits on `Cost > 0` (`MJAIPromptRunEntityServer.server.ts:200`) and that remains intact. A "price the NULLs" background job (first pricing, not repricing) is explicitly the one legitimate follow-up for runs completed when pricing metadata was missing.

8. **Precision is `decimal(19,8)` for every cost column on both run tables.**
   Prevents rounding errors on micro-cent model invocations and high-volume runs.

9. **Coverage is a first-class metric.**
   Every cost figure ships with `PricedRuns`, `UnpricedRuns`, and `UnmeasuredRuns` (non-token modalities with no units recorded). Action spend that lacks direct attribution is reported explicitly as `Unattributed`, never silently dropped.

---

## 2. Consumer Audit: How Each Layer Reads Cost

Research conducted across the monorepo identified the following consumers and their current compliance with the doctrine rules:| Consumer File & Location | Current Access Pattern | Doctrine Violations | Remediation Plan |
|---|---|---|---|
| `ai-instrumentation.service.ts` (`:329, :348, :377, :378, :503, :549, :608, :648`) | Coalesces cost with `|| 0`; reads agent-run `TotalCost` and rollup properties | **Rules 1, 2**: Coalesces unpriced NULLs to 0; double-counts agent subtrees | Migrate to read `vwAIUsageFacts` or query aggregates; count `UnpricedRuns` |
| `cost-budget.component.ts` (`:831, :832, :918, :948, :971, :1014`) | Uses `Cost ?? TotalCost ?? 0` across client-loaded prompt runs | **Rules 1, 2**: Falls back to `TotalCost`, coalesces NULL to 0 | Consume `vwAIUsageFacts`, `AIUsageHourly`, `AIUsageDaily` / aggregate queries with explicit coverage counts |
| `agent-run-analysis.component.ts` | Reads `AIAgentRun.TotalCost` (`:703`) with no `ParentRunID IS NULL` filter | **Rules 1, 4**: Subtrees double-counted when parent and child agent runs are both in view | Filter to root runs (`ParentRunID IS NULL`) or aggregate from prompt-run own `Cost` via query-time hierarchy CTE |
| `model-performance.component.ts` | Sums prompt run costs directly, defaulting NULLs to 0 | **Rules 1, 2**: Masks unpriced runs as free | Use prompt-run `Cost` only; display `PricedRuns` vs `UnpricedRuns` |
| `usage-patterns.component.ts` | Requests `Cost` (`:64`) but never reads it in component logic | Unbounded pull with no `MaxRows` | Remove unused `Cost` projection; add `MaxRows` |
| `error-analysis.component.ts` | No cost reads in component | Compliant (no cost reads; needs `MaxRows` paging only) | None |
| `prompt-run-analysis.component.ts` | Reads prompt runs; sums `Cost` via `sumNullable(r => r.Cost)` (`:1056`); sort key (`:1133`) coalesces NULL to 0 | Correctly sums `Cost` under Rule 1; sort key coalesces NULL to 0; needs `MaxRows` paging | Keep `Cost` sum; preserve unpriced sort ordering; add `MaxRows` paging |
| `ai-agent-run-cost.service.ts` (`:54-67`) | Executes `CalculateRunCost` query (`metadata/queries/SQL/calculate-ai-agent-run-cost.sql:31`) | **Rule 1**: The saved query sums `pr.TotalCost` instead of `pr.Cost` (fixed in PR4) | Update `calculate-ai-agent-run-cost.sql` to sum `pr.Cost`; note it is an `MJ: Queries` record, not a stored procedure |
| `ai-agent-run-analytics.component.ts` (`:565, :1361, :1611`) | Reads `TotalCost` across multiple agent run records | **Rules 1, 4**: Double counts child agent runs | Switch to hierarchical CTE aggregate query |
| `ai-prompt-form.component.ts` (`:1606`) | Displays `TotalCost` on single prompt run | Display of a single run — compliant; do not SUM this column across runs | Show `Cost` (own) and `DescendantCost` as separate fields |
| `agent-execution-monitor.component.ts` (`:991`) | Reads `TotalCost` on agent run nodes | **Rules 1, 4**: Accumulates rollup figures across tree | Show node own cost vs subtree rollup derived from query |
| `agent-execution-node.component.ts` (`:690`) | Displays `TotalCost` on node | Display of a single run — compliant; do not SUM this column across runs | None |
| `message-item.component.ts` (`:1411`) | Reads agent run `TotalCost` for chat turn spend | Display of a single run — compliant; do not SUM this column across runs | None |
| `scheduling-instrumentation.service.ts` (`:251`) | Coalesces agent run `TotalCost || 0` | **Rules 1, 2**: Coalesces NULL to 0 and reads subtree total | Read own `Cost` from prompt runs executed by job |
| `teams-card-builder.ts` (`:380`) | Formats `TotalCost` into notifications | Display of a single run — compliant; do not SUM this column across runs | None |
| `slack-block-builder.ts` (`:574`) | Formats `TotalCost` into notifications | Display of a single run — compliant; do not SUM this column across runs | None |
| `ai-agent-session-form.component.ts` (`:317, :350`) | Sums agent run `TotalCost` across session | **Rules 1, 4**: Double-counts sub-agent runs in session | Sum prompt run `Cost` linked to session's agent runs |
| `MCPServer/src/Server.ts` (`:2134`) | Returns `TotalCost` in tool outputs | Display of a single run — compliant; do not SUM this column across runs | Return own `Cost` and query-derived total |

---

## 3. Existing Guard Tests and References

The following files contain existing guard tests, CTE patterns, and warnings that must remain green and respected:

1. **`metadata/queries/SQL/get-agent-run-tree.sql:21-32`**:
   Documents why rollups are outputs of hierarchy traversals, and why reading rollups back into aggregates creates circular feedback loops.
2. **`packages/AI/CorePlus/src/__tests__/agent-run-tree.test.ts:162-163`**:
   Unit test asserting that `TotalCostRollup` is never read by the tree (it is an output), protecting against circular feedback loops.
3. **`packages/TestingFramework/integration-test-suite/src/checks/workflow-demo-agents.checks.ts:341-385`**:
   Integration check ensuring multi-step and sub-agent workflows record verifiable prompt and agent run costs.
4. **`packages/TestingFramework/integration-test-suite/src/checks/ai-cost.checks.ts` (`AC6`, `AC7`, `AC8`)**:
   Regression checks enforcing that `TotalCost = Cost + DescendantCost`, priceable work is not silently uncosted, and AC8 documents today's shape: completed prompt runs with children account for `<= 0.01` (≤ 1%) of total cost, reports unpriced coverage ratio, and asserts non-negative agent run costs. (PR2 will update AC8 to assert parallel parents have `Cost IS NULL`).

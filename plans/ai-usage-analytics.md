# AI Usage Analytics — build plan for MJ#4396

> **Status:** Build spec, ready for implementation. Written 2026-09-11 against MJ `next` @ `ae1bdcaf7d`.
> **Issue:** https://github.com/MemberJunction/MJ/issues/4396 (AN-BC).
> **Destination in MJ:** `plans/ai-usage-analytics.md`. Migrations cite it as `-- Design: plans/ai-usage-analytics.md`.
> **Who builds / who reviews:** built by a coding model (Gemini Flash), reviewed by Claude against
> the acceptance checks in each PR section. Every "REVIEWER" line is a thing the reviewer verifies
> before approving; every "BUILDER" line is an instruction, not a suggestion.
> **Related plans:** `plans/ai-dashboard/plan.md` (the April 2026 UI redesign that produced today's
> client-side aggregation — PR5 supersedes its data-loading sections, not its layout);
> `plans/query-entity-materialization.md` (materialization design — PR4 is its first real consumer).

All file:line references are to `next` @ `ae1bdcaf7d` and were verified by reading the files, not
taken from the issue. Where the issue was wrong or stale, §1 says so.

---

## Table of contents

1. What the research changed about the issue
2. Ground rules for the builder (non-negotiable MJ conventions)
3. Part 1 — the cost basis doctrine (decisions, made)
4. PR1 — write-site fixes and the guide (no schema)
5. PR2 — parallel-execution accounting (no schema)
6. PR3 — migration: dimension keys, precision, indexes
7. PR4 — `vwAIUsageFacts` + the AI-category aggregate queries + materialization
8. PR5 — dashboards read the aggregates; coverage; the pivot surface
9. PR6 — budgets
10. Cross-PR test matrix
11. Sequencing and dependencies
12. Reviewer checklist (per PR)
13. What Betty contributes (inspiration only)

---

## 1. What the research changed about the issue

Verified true (installed 6.1.0-edge.1 and `next`):
- 0.1 no `MaxRows` / `IgnoreMaxRows` in any of the seven analytics files; zero `RunQuery` use in `dashboards/src/AI/`.
- 0.2 `calculateTokenStats` adds `SubAgentRun.TotalCost` (`packages/AI/Agents/src/base-agent.ts:13925`).
- 0.3 `Cost ?? TotalCost ?? 0` six times in `cost-budget.component.ts` (`:831,:832,:918,:948,:971,:1014`) and the `|| 0` family throughout `ai-instrumentation.service.ts` (`:329,:348,:377,:378,:503,:549,:608,:648`).
- 0.4 `TotalCostRollup` written only by `packages/TaskGraph/src/TaskClaimStore.ts:161-168`.
- 0.8 `AIPromptRun` has no `AgentRunID`, `UserID`, `ConversationID`, `CompanyID`, `EnvironmentID` (`packages/MJCoreEntities/src/generated/entities/__mj.ts:5988-6553`). `ExecuteSubAgent` propagates the scope pair but not `companyId` (`base-agent.ts:7248-7282`).
- 0.6 `ProcessingType` is hardcoded `'Realtime'` at `packages/MJCoreEntitiesServer/src/custom/MJAIPromptRunEntityServer.server.ts:234`. `JudgeID`/`JudgeScore` have zero writers.
- Part 6 infra exists on `next`: `@memberjunction/materialization`, `MJ: Materialized Results`, the `DataSource:'Materialized'` redirect, `MaterializationRefreshScheduledJobDriver`. **No materialized query exists in `metadata/` yet** — PR4 is the first.
- The `AI` query category exists (`6C8C5BA5-D9D1-47A1-8EF8-E59DA57F9D22`) with zero queries; no `GROUP BY` view over either run table anywhere in `migrations/`.

Corrections to the issue:
- **0.5 is worse than stated.** `AIPromptRunner.ts:1148` and `:1169` pass `undefined` for `parentPromptRunId`, and both child creators are guarded on it (`ParallelExecutionCoordinator.ts:551`, `:772`). So on `next` **no `ParallelChild` or `ResultSelector` rows are written at all** from the standard path; the consolidated parent (`AIPromptRunner.ts:1201-1264`) is the only row, with `Cost` = the selected arm (`:1221`) and `TotalCost` = the sum of all arms (`:1253`). Today a naive `SUM(Cost)` therefore **under**-counts the losing arms rather than double-counting the winner. PR2 fixes the whole shape, not just the `RunType` label.
- **0.9 is stale.** Since `migrations/v6/V202608201800__…Regenerate_Hierarchy_Views…sql:57504` `vwAIAgentRuns` has one `OUTER APPLY fnAIAgentRunParentRunID_GetHierarchyMeta`, not two `_GetRootID` applies. Still per-row, still not for scans; the conclusion (build the fact view over base tables) stands.
- **The CodeGen cycle detector does not reject.** `packages/CodeGenLib/src/Database/sql.ts:122-133` logs `⚠️ Cyclical Dependency Detected (non-fatal)` and dumps the remaining entities into the final level. A re-introduced cycle would ship silently with non-dependency-safe recompile order. PR3 therefore treats "no cycle" as something the builder proves by reading CodeGen's output, not something CI proves.
- **The old cycle is gone.** `ConversationDetail` has no FK to `AIPromptRun` (`__mj.ts:14382-14625`); `ConversationCompactionRun` carries that link outward. `AIPromptRun.AgentRunID → AIAgentRun` alone is an edge, not a cycle, unless something reachable from `AIAgentRun` points back at `AIPromptRun`. Nothing does today (checked: `AIAgentRun`'s FKs go to Agent, Conversation, User, ConversationDetail, Configuration, Model, Vendor, ScheduledJobRun, TestRun, Entity, AgentSession).
- `checkExecutionLimits` does not exist; the guardrail is `hasExceededAgentRunGuardrails` at `base-agent.ts:4775`.
- The only existing `RunQuery`-based cost consumer is `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run-cost.service.ts:54-67` (`CalculateRunCost`, `/MJ/AI/Agents/`). That is the client pattern PR5 replicates.

---

## 2. Ground rules for the builder

These are MJ repo rules; violating any of them fails review regardless of whether the code works.

- **Branch:** `feat/ai-usage-analytics-prN` off `next`, pushed with `-u origin <same name>` (root `CLAUDE.md` rule 3). One PR per section below. No commits without the user's approval.
- **pnpm only.** `pnpm install` at repo root only; never `npm install`. Build one package with `cd packages/X && pnpm run build`.
- **Typing:** no `any`, no `as any`, no `unknown` shortcuts, no `.Get()`/`.Set()` on generated entities (`.claude/rules/typescript-style.md`).
- **Data access:** entity names carry the `MJ: ` prefix; in dashboards use `RunView.FromMetadataProvider(this.ProviderToUse)` / `new RunQuery(this.RunQueryToUse)`, never `new Metadata()` / `new RunView()` (`.claude/rules/data-access.md`; `.claude/skills/scaffold-mj-dashboard/SKILL.md:448`). Never set `RunQueryParams.SQL` from user or agent input — stored queries by name/ID only.
- **Migrations** (`migrations/CLAUDE.md`, all of it): filename `V[YYYYMMDDHHMM]__v6.1.x__Description.sql` in `migrations/v6/`, timestamp strictly greater than `202609101740`; hardcoded UUIDs from `uuidgen | tr '[:lower:]' '[:upper:]'`; `${flyway:defaultSchema}` never doubled with `__mj`; hand DDL, then ≥50 blank lines, then the CodeGen banner, then the appended `CodeGen_Run_*.sql` with **apply-time `Sequence` expressions** (`(SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID]='…')`), then delete the standalone CodeGen file. `sp_addextendedproperty` on every new non-key column. No FK indexes by hand (CodeGen makes `IDX_AUTO_MJ_FKEY_*`). No `EntityField`/`EntityFieldValue`/view/proc edits by hand. CHECK constraints on nullable columns must not include `OR X IS NULL`. **Do not author the `migrations-pg` counterpart**; say in the PR body it is deferred to the release build. Run `node .github/scripts/check-migration-entityfield-sequence.mjs` and `npm run check:codegen-tail` before pushing.
- **CodeGen order for a new column:** `mj migrate` → `mj codegen --skipfiles` → `mj sync push --dir=metadata --ci` → `mj codegen --skipdb`. Never a full `mj codegen` at step 2. Revert the `sync` block write-back in `metadata/**/*.json` before committing. One database per agent.
- **Metadata:** declarative JSON only, `primaryKey.ID` from `uuidgen`, no `sync` blocks, no per-PR `*__Metadata_Sync.sql` (`metadata/CLAUDE.md` §1, §1b). Run `mj sync validate --dir=metadata`.
- **Changesets:** `minor` for PR3 and PR4 (they touch the database / metadata), `patch` for PR1, PR2, PR5; PR6 is `minor`. `npm run check:changeset`.
- **Tests:** a change is done when `cd packages/X && pnpm test` passes for every touched package **and** `pnpm run test:integration` passes. Unit tests in `src/__tests__/*.test.ts`; Angular DOM specs `*.dom.test.ts` next to the component; `node scripts/check-spec-antipatterns.mjs packages`.
- **Dashboards** (`packages/Angular/Explorer/dashboards/CLAUDE.md` + the scaffold skill): design tokens only (`./.github/scripts/check-css-hex-tokens.sh --file`), no `.mj-btn` overrides, `mjButton`, `@if/@for/@switch`, chrome trio / `mj-page-header-interior`, `OnPush`, PascalCase public members, `SetAgentContext` + `SetAgentClientTools` in `ngAfterViewInit`. `pnpm run check:ui`.
- **Guides:** a new guide is registered in `guides/README.md` under "AI and agents" (`guides/README.md:143` says how).

---

## 3. Part 1 — the cost basis doctrine (decided; the guide documents it)

These decisions are final for this plan. The builder implements them; the reviewer checks code against them.

1. **The additive basis is own cost at the prompt-run grain: `AIPromptRun.Cost`.** Never `TotalCost` (= `Cost + DescendantCost`), never `AIAgentRun.TotalCost` (subtree-inclusive since `calculateTokenStats` adds sub-agent totals), never any `*Rollup` column (written only by task-graph settlement, NULL otherwise, and an output of `GetAgentRunTree` — reading it into an aggregate creates the feedback loop `metadata/queries/SQL/get-agent-run-tree.sql:21-32` warns about).
2. **`Cost IS NULL` means unpriced, `Cost = 0` means free.** `BaseAIEngine.CalculateModelCost` (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:642-726`) returns `null` on six distinct guards for exactly this reason. No consumer may coalesce NULL to 0 in an aggregate; it carries an `UnpricedRuns` count beside every cost figure.
3. **A parallel parent has no own spend.** After PR2 it carries `RunType='ParallelParent'`, `Cost = NULL`, and its arms are persisted as `ParallelChild` rows with their own `Cost`. Until every environment has PR2's backfill, "parallel parent" is derived: `RunType='ParallelParent' OR EXISTS (child with ParentID = this)`. Parallel parents are excluded from both cost sums and unpriced counts.
4. **Rollups are derived from the hierarchy at query time.** Agent-level cost = `SUM(Cost)` over prompt runs whose `AgentRunID` is in the run's subtree (recursive CTE bounded at depth 20, the `CalculateRunCost` precedent), never `SUM(AIAgentRun.TotalCost)` over a set that can contain both a parent and its child.
5. **Tenant dimension = the scope pair `AIAgentRun.PrimaryScopeEntityID` / `PrimaryScopeRecordID`**, carried onto the fact row through `AgentRunID`. It already cascades to sub-agents (`base-agent.ts:7273-7274`), is indexed (`IX_AIAgentRun_PrimaryScope`), and is the tenant key at least one downstream product (Betty) already enforces. `CompanyID` is kept as the memory-scoping key it is documented as; PR1 fixes its cascade because it is one line, and the fact view exposes it too, but no new tenant column is added to any run table. (Resolves open decision 1.)
6. **Application/environment is derived, not stored**: `SourceKind` on the fact row plus `ConversationID` (→ `Conversation.EnvironmentID` where a consumer needs it). No `EnvironmentID` on run tables. (Resolves open decision 2.)
7. **Cost is frozen at save time.** `ShouldCalculateCost` short-circuits on `Cost > 0` (`MJAIPromptRunEntityServer.server.ts:200`) and that stays. A "price the NULLs" job (first pricing, not repricing) is explicitly out of scope for this plan and is noted in the guide as the one legitimate follow-up. (Resolves open decision 3.)
8. **Precision is `decimal(19,8)` for every cost column on both run tables** after PR3.
9. **Coverage is a first-class metric.** Every cost figure ships with `PricedRuns`, `UnpricedRuns`, `UnmeasuredRuns` (non-token modality with no units recorded), and the fact that action spend is `Unattributed` is stated in the guide, not silently absent.

---

## 4. PR1 — write-site fixes and the guide (no schema, `patch`)

**Scope:** the cheap, independent fixes plus the doctrine doc. Nothing here depends on a migration.

### 4.1 `guides/AI_USAGE_AND_COST_ANALYTICS_GUIDE.md`
BUILDER: write the guide from §3 verbatim (the nine rules), plus a "how each layer reads cost" table listing every consumer found in research (`ai-instrumentation.service.ts`, the six analytics components, `ai-agent-run-cost.service.ts`, `ai-agent-run-analytics.component.ts:565,:1361,:1611`, `ai-prompt-form.component.ts:1606`, `agent-execution-monitor.component.ts:991`, `agent-execution-node.component.ts:690`, `message-item.component.ts:1411`, `scheduling-instrumentation.service.ts:251`, `teams-card-builder.ts:380`, `slack-block-builder.ts:574`, `ai-agent-session-form.component.ts:317,:350`, `MCPServer/src/Server.ts:2134`) and which rule each currently violates. Register it in `guides/README.md` under "AI and agents". Cross-link `get-agent-run-tree.sql:21-32`, `packages/AI/CorePlus/src/__tests__/agent-run-tree.test.ts:162-163`, and `workflow-demo-agents.checks.ts:341-385` as the existing guard tests.

### 4.2 `CompanyID` cascade to sub-agents
BUILDER: in `packages/AI/Agents/src/base-agent.ts` `ExecuteSubAgent`'s `RunAgent` params block (`:7248-7282`), add `companyId: params.companyId,` next to `PrimaryScopeRecordID` (`:7274`). Unit test in `packages/AI/Agents/src/__tests__/`: a sub-agent run created from a parent with `companyId` set has `CompanyID` equal to it (mock the `RunAgent` call and assert the params object; the existing sub-agent tests show the harness).

### 4.3 `ProcessingType` — stop hardcoding, without changing behaviour
BUILDER: `MJAIPromptRunEntityServer.server.ts:234` — replace the literal with a protected method `ResolveProcessingType(): 'Realtime' | 'Batch'` that returns `'Realtime'` today, with a doc comment naming the follow-up (batch producers set it). This is a seam, not a feature; do not add a column.

### 4.4 Guardrail truthiness
BUILDER: `base-agent.ts:4826` and `:4840` — `if (agent.MaxCostPerRun && agentRun.TotalCost)` skips a run whose cost is exactly `0` and a limit of `0`. Change to `!= null` checks. The mid-run recompute at `:4808` already refreshes `TotalCost` from own steps; leave it. Extend `src/__tests__/guardrail-midrun-totals.test.ts` with a zero-limit case.

### 4.5 Integration check AC8 — precision and basis invariants (read-only)
BUILDER: append to `AiCostChecks` in `packages/TestingFramework/integration-test-suite/src/checks/ai-cost.checks.ts` (before `:545`; the loop at `:547-549` registers it): over up to 500 completed prompt runs, `SUM(Cost)` over rows that have children is asserted ≤ 1% of `SUM(Cost)` overall **until PR2 lands** (documenting today's shape), and every row with `Cost IS NULL` and `CompletedAt IS NOT NULL` is counted and reported as coverage. Follow AC6's style (`:386-444`): skip-as-pass loudly on an empty set.

REVIEWER: 4.2 is one line — confirm no other `RunAgent` call site builds sub-agent params (`grep -n "RunAgent(" base-agent.ts`). 4.4 must not change the `>=` comparisons. Guide is registered in `guides/README.md`.

---

## 5. PR2 — parallel-execution accounting (no schema, `patch`)

**Why its own PR:** it restructures `executePromptInParallel`, which is the riskiest runtime change in the plan, and it is reviewable on its own.

### 5.1 Persist the arms
BUILDER, in `packages/AI/Prompts/src/AIPromptRunner.ts` `executePromptInParallel` (`:1075`):
1. Create (or reuse `existingPromptRun`) the consolidated parent **before** `executeTasksInParallel` (`:1148`), not after (`:1201`). Use the first task's model for the initial `ModelID`; after selection, set `ModelID`/`VendorID` to the selected arm's. Set `RunType = 'ParallelParent'` at creation.
2. Pass `consolidatedPromptRun.ID` as `parentPromptRunId` to `executeTasksInParallel` (`:1148`) and `selectBestResult` (`:1169`), so `createChildPromptRun` (`ParallelExecutionCoordinator.ts:979`) and `createResultSelectorPromptRun` (`:1076`) actually run.
3. `createResultSelectorPromptRun` (`:1082`) passes no `contextUser` and sets no `ModelID`/`VendorID` → pass `contextUser`, and set model/vendor from the judge prompt's resolved model when known. A `ResultSelector` row without a model can never be priced.
4. On the parent: **do not** set `Cost` from the selected arm (`:1220-1222`). Leave `Cost = NULL`. Keep `WasSelectedResult = true` on the selected child, not the parent. `TotalCost` on the parent is then maintained by the entity server's rollup (`TriggerParentCostRollup`, `MJAIPromptRunEntityServer.server.ts:340-357`) because every child saves with `ParentID` and a non-null `Cost`. Remove the manual `TotalCost` sum at `:1253-1254` or keep it only as a fallback when a child save failed — reviewer's call; state which in the PR.
5. `promptRun.TotalCost = promptRun.Cost` bridge at `:5680` — verify it is not reached for a `ParallelParent` (it would write NULL/0 over the rollup).

### 5.2 Existing-data fallback
The fact view (PR4) derives `IsParallelParent` from `RunType='ParallelParent' OR EXISTS child`. No backfill of historical `RunType` is possible (the children were never written), so historical parents keep `Cost` = selected arm and are treated as ordinary single runs. State this in the guide.

### 5.3 Tests
- Unit (`packages/AI/Prompts/src/__tests__/`): with a mocked coordinator returning three arms, assert three `ParallelChild` saves with `ParentID` = parent, one `ResultSelector` save with `contextUser`, parent `RunType='ParallelParent'`, parent `Cost` undefined/NULL, selected child `WasSelectedResult=true`.
- Integration AC9 (`RequiresLiveModel`): run a prompt configured for parallel execution; assert `SUM(Cost)` over the parent's subtree equals the parent's `TotalCost` and the parent's `Cost IS NULL`.

REVIEWER: the parent must exist before arms execute (otherwise children have no `ParentID`); `AIModelRunner.ts:306` writes `params.ParentRunID` into `ParentID` (a prompt-run FK) — confirm PR2 does not route an *agent* run id through it. Check `JudgeID`/`JudgeScore` are now written on the `ResultSelector` row (`:795-805` update site) since they cost nothing to fill.

---

## 6. PR3 — migration: dimension keys, precision, indexes (`minor`)

**File:** `migrations/v6/V<date +"%Y%m%d%H%M">__v6.1.x__AIPromptRun_Attribution_And_Cost_Precision.sql`. Header: `-- Design: plans/ai-usage-analytics.md §6`. Template for structure: `migrations/v6/V202608042204__v6.1.x__APIKey_Scope_RowFilterID.sql` (but with apply-time `Sequence`, see `V202609081111__v6.1.x__Entity_SubtypeSelector.sql:172`); template for the banner: `V202608301800__v6.1.x__AIPromptRun_Continuous_Units.sql:295-321`.

### 6.1 Hand DDL (in this order)
```sql
-- 1. Dimension keys on AIPromptRun (nullable: rows pre-date them; NOT NULL never — direct prompt runs have no agent run)
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun]
    ADD [AgentRunID] UNIQUEIDENTIFIER NULL,
        [UserID]     UNIQUEIDENTIFIER NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun]
    ADD CONSTRAINT [FK_AIPromptRun_AgentRun] FOREIGN KEY ([AgentRunID]) REFERENCES [${flyway:defaultSchema}].[AIAgentRun]([ID]),
        CONSTRAINT [FK_AIPromptRun_User]     FOREIGN KEY ([UserID])     REFERENCES [${flyway:defaultSchema}].[User]([ID]);
GO
-- 2. Precision: every cost column on both run tables to decimal(19,8) (widening; no data loss)
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ALTER COLUMN [TotalCost]      DECIMAL(19,8) NULL;
ALTER TABLE [${flyway:defaultSchema}].[AIPromptRun] ALTER COLUMN [DescendantCost] DECIMAL(19,8) NULL;
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRun]  ALTER COLUMN [TotalCost]      DECIMAL(19,8) NULL;   -- check the DEFAULT 0 constraint survives; re-add if SQL Server drops it
GO
-- 3. Backfill (set-based, idempotent). Required to make the new columns meaningful; the only data statement in this file.
UPDATE p SET p.AgentRunID = s.AgentRunID
FROM [${flyway:defaultSchema}].[AIPromptRun] p
JOIN [${flyway:defaultSchema}].[AIAgentRunStep] s ON s.TargetLogID = p.ID AND s.StepType IN ('Prompt','Compaction')
WHERE p.AgentRunID IS NULL;
UPDATE p SET p.UserID = r.UserID
FROM [${flyway:defaultSchema}].[AIPromptRun] p
JOIN [${flyway:defaultSchema}].[AIAgentRun] r ON r.ID = p.AgentRunID
WHERE p.UserID IS NULL AND r.UserID IS NOT NULL;
-- children of a parallel parent inherit
UPDATE c SET c.AgentRunID = p.AgentRunID, c.UserID = p.UserID
FROM [${flyway:defaultSchema}].[AIPromptRun] c JOIN [${flyway:defaultSchema}].[AIPromptRun] p ON p.ID = c.ParentID
WHERE c.AgentRunID IS NULL AND p.AgentRunID IS NOT NULL;
GO
-- 4. Analytics indexes (explicitly required by MJ#4396 Part 4; these are NOT FK indexes — CodeGen makes those)
CREATE NONCLUSTERED INDEX [IX_AIPromptRun_RunAt]            ON [${flyway:defaultSchema}].[AIPromptRun] ([RunAt]) INCLUDE ([ModelID],[VendorID],[AgentID],[Cost],[TokensPrompt],[TokensCompletion]);
CREATE NONCLUSTERED INDEX [IX_AIPromptRun_ModelID_RunAt]    ON [${flyway:defaultSchema}].[AIPromptRun] ([ModelID],[RunAt]);
CREATE NONCLUSTERED INDEX [IX_AIPromptRun_VendorID_RunAt]   ON [${flyway:defaultSchema}].[AIPromptRun] ([VendorID],[RunAt]) WHERE [VendorID] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_AIPromptRun_UserID_RunAt]     ON [${flyway:defaultSchema}].[AIPromptRun] ([UserID],[RunAt])   WHERE [UserID] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_AIAgentRun_UserID_StartedAt]  ON [${flyway:defaultSchema}].[AIAgentRun]  ([UserID],[StartedAt]) WHERE [UserID] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_AIAgentRun_CompanyID_StartedAt] ON [${flyway:defaultSchema}].[AIAgentRun] ([CompanyID],[StartedAt]) WHERE [CompanyID] IS NOT NULL;
GO
-- 5. sp_addextendedproperty for AgentRunID and UserID (FKs are exempt per migrations/CLAUDE.md:518 — but add them anyway: the description is what CodeGen surfaces, and both need the "may be NULL for direct runs / backfilled from AIAgentRunStep" caveat).
```
Do **not** touch `RunType`'s CHECK constraint (`ParallelParent` is already an allowed value, `__mj.ts:6098`).

### 6.2 The cycle proof (mandatory, in the PR body)
BUILDER: after `mj codegen --skipfiles`, paste the full CodeGen log section around `buildEntityLevelsTree`. It must **not** contain `Cyclical Dependency Detected` naming `MJ: AI Prompt Runs` or `MJ: AI Agent Runs`. If it does, replace the `FK_AIPromptRun_AgentRun` constraint with a no-FK column (the `AIAgentRun.CompanyID` precedent, `__mj.ts:2627`) plus `IX_AIPromptRun_AgentRunID_RunAt`, document the join contract in the extended property, and say so in the PR. `UserID → User` cannot cycle.

### 6.3 Writers (same PR, so the columns are never empty going forward)
- `packages/AI/Prompts/src/prompt.types.ts` — add `agentRunId?: string` and `userId?: string` to `AIPromptParams` (next to `agentId`, `:~380`). Doc: "attribution only; never used for behaviour".
- `AIPromptRunner.ts` `createPromptRun` (`:2798`): `promptRun.AgentRunID = params.agentRunId ?? null`; `promptRun.UserID = params.userId ?? params.contextUser?.ID ?? null`. Child/nested prompt runs (`:5260`) inherit both from the parent params.
- `ParallelExecutionCoordinator.ts` `createChildPromptRun` (`:979`) and `createResultSelectorPromptRun` (`:1076`): set both from the task/parent params.
- `AIModelRunner.ts` `createRunRecord` (`:281`): `UserID = params.ContextUser.ID`; add `AgentRunID?` to `EmbeddingRunParams` (`:30-51`) — and fix the misleading `ParentRunID` doc at `:41` (it is a *prompt-run* parent).
- `base-agent.ts`: every `new AIPromptParams()` site sets `agentRunId = this._agentRun?.ID` and `userId = params.userId ?? params.contextUser?.ID`: `:3616` (main), `:6045` (summary tool), `:14587` (compaction). Realtime `createRealtimePromptRun` (`:2181`): set both directly on the entity. Co-agent run in `realtime-client-session-service.ts:944-961` and harness run in `HarnessAgentBase.ts:362-394`: set what is in scope.
- The step link (`base-agent.ts:9064-9069`, `TargetLogID`) stays; it is the audit trail for non-prompt steps.

### 6.4 Tests
- Unit: `createPromptRun` writes `AgentRunID`/`UserID` from params; `base-agent` main prompt params carry `agentRunId`.
- Integration AC10 (deterministic): after a real agent run in the suite (see `agent-runner.checks.ts`), every prompt run reachable via `AIAgentRunStep.TargetLogID` from that run has `AgentRunID = that run` and `UserID = ctx.User.ID`. Also: `COUNT(*) WHERE AgentRunID IS NULL AND EXISTS step link` is 0 on the test database (proves the backfill).
- Run `npm run check:codegen-tail` (green is necessary, not sufficient — column-add migrations are invisible to it) and the DB-bearing check: `mj migrate → mj codegen → git diff --exit-code`.

REVIEWER: the backfill is the one data statement; confirm it is idempotent and set-based. Confirm `ALTER COLUMN` on `AIAgentRun.TotalCost` did not drop `DF_…TotalCost` (query `sys.default_constraints` in the PR body). Confirm the CodeGen tail regenerated `vwAIPromptRuns` with the two new denormalized name columns (`AgentRun`, `User`) and `spCreate/spUpdateAIPromptRun` with the new params. Confirm `Sequence` expressions, not literals. PG counterpart absent and declared deferred.

---

## 7. PR4 — `vwAIUsageFacts` + AI-category queries + materialization (`minor`)

### 7.1 The fact view — migration `V…__v6.1.x__vwAIUsageFacts.sql`
Rule check: `migrations/CLAUDE.md` bans *entity base views* in migrations because CodeGen owns them. `vwAIUsageFacts` is not an entity's `BaseView`, is never dropped or regenerated by CodeGen (`packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts:98,:134` key off `entity.BaseView`), and has no other home. It **is** refreshed by `spRecompileAllViews` on every `mj migrate` (`V202608251800__…spRecompileAllViews_Dependency_Order.sql:175`), so it must stay valid; it references base tables only, so a base-view regeneration cannot break it. State this in the migration header. Name must not be `vw<EntityPlural>` of any entity. Grant `SELECT` to `cdp_UI, cdp_Developer, cdp_Integration`.

BUILDER: one row per `AIPromptRun`, over **base tables** (`[${flyway:defaultSchema}].[AIPromptRun] p LEFT JOIN [AIAgentRun] r ON r.ID = p.AgentRunID`), columns:

| Group | Columns | Source |
|---|---|---|
| Keys | `PromptRunID`, `AgentRunID`, `ParentPromptRunID` | p.ID, p.AgentRunID, p.ParentID |
| Time | `RunAt`, `RunAtUTC` (= `CAST(SWITCHOFFSET(p.RunAt,'+00:00') AS datetime2(0))`), `HourBucket` (= `DATEADD(hour, DATEDIFF(hour, 0, RunAtUTC), 0)`), `DayBucket` (= `CAST(RunAtUTC AS date)`) | p.RunAt |
| Dimensions | `PromptID`, `ModelID`, `VendorID`, `AgentID`, `ConfigurationID`, `UserID` (= `COALESCE(p.UserID, r.UserID)`), `ConversationID` (r), `PrimaryScopeEntityID`, `PrimaryScopeRecordID`, `CompanyID` (r), `UsageTypeID`, `RunType`, `Status`, `Success` | p / r |
| SourceKind | `CASE WHEN p.TestRunID IS NOT NULL OR r.TestRunID IS NOT NULL THEN 'Test' WHEN r.ScheduledJobRunID IS NOT NULL THEN 'Scheduled' WHEN r.ConversationID IS NOT NULL THEN 'Conversation' WHEN p.AgentRunID IS NOT NULL THEN 'Agent' ELSE 'Direct' END` | |
| Measures | `TokensPrompt`, `TokensCompletion`, `TokensCacheRead`, `TokensCacheWrite`, `InputUnitsUsed`, `OutputUnitsUsed`, `OwnCost` (= p.Cost), `CostCurrency`, `ExecutionTimeMS`, `QueueTime`, `PromptTime`, `CompletionTime`, `FirstTokenTime`, `FailoverAttempts` | p |
| Flags | `IsPriced` (= `CASE WHEN p.Cost IS NOT NULL THEN 1 ELSE 0 END`), `IsParallelParent` (= `CASE WHEN p.RunType='ParallelParent' OR EXISTS(SELECT 1 FROM AIPromptRun c WHERE c.ParentID=p.ID) THEN 1 ELSE 0 END`), `IsUnmeasured` (= `CASE WHEN p.UsageTypeID IS NOT NULL AND p.InputUnitsUsed IS NULL AND p.OutputUnitsUsed IS NULL THEN 1 ELSE 0 END`), `IsCompleted` (= `CASE WHEN p.CompletedAt IS NOT NULL THEN 1 ELSE 0 END`) | |

No `ORDER BY`, no TVF applies, no root resolution (the daily query does that). Role and team are **not** columns; the daily query joins `UserRole → Role` because the fact view must stay one-row-per-run.

### 7.2 The queries (`metadata/queries/`, category `AI`)
Shape: copy `metadata/queries/.queries.json`'s `CalculateRunCost` record. `CategoryID: "@lookup:MJ: Query Categories.Name=AI"`, `SQL: "@file:SQL/<name>.sql"`, `UsesTemplate: true`, `Status: "Approved"`, `QualityRank`, `ExecutionCostRank`, `primaryKey.ID` from `uuidgen`, no `sync`, **no inline `MJ: Query Parameters`** (auto-detected from `{{ }}`; declaring them duplicates and rolls the push back — `.get-agent-run-tree.json` `TechnicalDescription`). Parameters use only the safe filters (`packages/MJCore/src/generic/querySQLFilters.ts`): `| sqlDate`, `| sqlString`, `| sqlIn`, `| sqlNumber`. Schema is literal `[__mj]` (queries are runtime SQL, not migrations). No top-level `ORDER BY` on the two materialized queries (materialization refuses ordered queries, `GenericDatabaseProvider.ts:3741-3746`).

| Name | Grain / purpose | Params | Materialized |
|---|---|---|---|
| `AIUsageHourly` | `GROUP BY HourBucket, AgentID, PromptID, ModelID, VendorID, UserID, PrimaryScopeEntityID, PrimaryScopeRecordID, ConfigurationID, SourceKind`; measures: `Runs`, `SucceededRuns`, `FailedRuns`, `PricedRuns`, `UnpricedRuns`, `UnmeasuredRuns`, `ParallelParents`, `TokensPrompt/Completion/CacheRead/CacheWrite`, `OwnCost` (SUM over `IsPriced=1 AND IsParallelParent=0`), `LatencyP50/P95` (`PERCENTILE_CONT` via a windowed subquery or `APPROX_PERCENTILE_CONT`), `AvgFirstTokenMS`. Excludes `IsCompleted=0`. | `{{ start \| sqlDate }}`, `{{ end \| sqlDate }}` on `HourBucket` | yes, `Incremental` on `HourBucket` watermark |
| `AIUsageDaily` | above + `AgentTypeID`, `RootAgentRunID`/`RootAgentID` (recursive CTE over `AIAgentRun.ParentRunID`, depth ≤ 20), `RoleID` (`UserRole`), grouped by `DayBucket` | same on `DayBucket` | yes, `DirtyGroupRecompute` keyed on `DayBucket` |
| `AIUsageCoverage` | one row: `Runs`, `PricedRuns`, `UnpricedRuns`, `UnmeasuredRuns`, `ParallelParents`, priced token share, plus `UnpricedByModel` as a second result set is not possible → make `AIUsageUnpricedByModel` its own query | window params | no (cheap, reads the hourly snapshot when present) |
| `AIUsageTopN` | top consumers by `{{ dimension }}` — **not** a parameter: ship four fixed queries (`AIUsageByAgent`, `AIUsageByModel`, `AIUsageByUser`, `AIUsageByTenant`) reading `AIUsageHourly` | window | no |
| `AIAgentRunSubtreeCost` | replaces `CalculateRunCost`'s `SUM(pr.TotalCost)` (`SQL/calculate-ai-agent-run-cost.sql`) with `SUM(OwnCost)` over the fact view joined on `AgentRunID IN subtree`; keep the old query name and shape, change its body — the client (`ai-agent-run-cost.service.ts`) keeps working | `AIAgentRunID` | no |

BUILDER: how `MJ: Query Fields` rows get created for these queries must be verified, not assumed — materialization qualification loads them (`manage-metadata.ts:1786-1790`). Read `packages/MJCoreEntitiesServer/src/custom/` for the Query entity server's field detection on save and follow whatever `CalculateRunCost` relies on; the integration fixture `materialized-read.checks.ts:149-169` shows the manual shape if it is not automatic. Put the answer in the PR body.

### 7.3 Materialization wiring
- Set `"IsMaterialized": true` on `AIUsageHourly` and `AIUsageDaily`. CodeGen's `processQueryMaterializations` (`manage-metadata.ts:1746`) mints `materialized_AIUsageHourly` / `materialized_vwAIUsageHourly`, a read-only virtual entity, the `MJ: Materialized Results` row (`Status='Building'`) and the join row. The window params must classify as `RowFilterBroad` (they are plain `>=`/`<` predicates on a projected column); if CodeGen refuses with `broad.ambiguous`, simplify the predicate shape until it passes and record why.
- `RefreshSchedule` (cron) and `KeyColumns` live on the minted `MJ: Materialized Results` row. BUILDER: find how `plans/query-entity-materialization.md` §9/§10 intend these to be authored (a Query-level hint CodeGen copies, or a metadata record for `MJ: Materialized Results` keyed by the minted ID); implement that way; if neither exists, add a metadata file under `metadata/materialized-results/` referenced by `@lookup:MJ: Queries.Name=AIUsageHourly` through the join and flag it for review. Hourly: `5 * * * *`; daily: `20 0 * * *` (staggered).
- A scheduled job of type `MaterializationRefreshScheduledJobDriver` (`packages/Scheduling/engine/src/drivers/MaterializationRefreshScheduledJobDriver.ts:25`) must exist in `metadata/scheduled-jobs/`; add one (`*/5 * * * *`) if none ships.
- The client reads with `DataSource: 'Materialized'`; the provider falls back to live on any uncertainty (`GenericDatabaseProvider.ts:3829-3870`), so nothing breaks before the first refresh.

### 7.4 Tests
- Integration AC11: `SELECT SUM(OwnCost) FROM vwAIUsageFacts WHERE IsParallelParent=0` equals `SELECT SUM(Cost) FROM AIPromptRun WHERE NOT EXISTS(child) AND RunType<>'ParallelParent'` — exact.
- AC12: `AIUsageHourly` summed over a window equals AC11's figure over the same window (live path); then with `DataSource:'Materialized'` after one `RefreshOne`, equal again.
- AC13: `AIAgentRunSubtreeCost` for a run with a sub-agent equals the hand-written recursive `SUM(Cost)`; and the `workflow-demo-agents.checks.ts:341-385` rollup-poison guard still passes.
- Unit: the SQL files are exercised through the existing query-pipeline tests' Nunjucks render (`packages/GenericDatabaseProvider/src/__tests__/query-pipeline.test.ts`) with sample params, asserting the safe filters were applied.

REVIEWER: no `TotalCost`, no `*Rollup`, no `?? 0` anywhere in the SQL; `IsPriced` gating on every cost SUM; `[__mj]` literal in query SQL vs `${flyway:defaultSchema}` in the migration; no `ORDER BY` in the materialized two; `uuidgen` IDs; no `sync` blocks; no `Metadata_Sync.sql`; `mj sync validate` output in the PR body.

---

## 8. PR5 — dashboards read the aggregates; coverage; the pivot surface (`patch`)

### 8.1 Service
BUILDER: `packages/Angular/Explorer/dashboards/src/AI/services/ai-instrumentation.service.ts` — replace the four unbounded `RunView`s (`:207-230`) with `RunQuery` calls to `AIUsageHourly` (`CategoryPath: '/MJ/AI/'`, `DataSource: 'Materialized'`, window params) and `AIUsageCoverage`. Keep the `DashboardKPIs` (`:58`), `TrendData` (`:74`), `ChartData` (`:112`) contracts; add `Coverage { PricedRuns; UnpricedRuns; UnmeasuredRuns; PricedTokenShare }` to `DashboardKPIs`. Delete every `|| 0` on a cost (`:329,:348,:377,:378,:503,:549,:608,:648`); cost is `number | null` end to end and the KPI card shows `—` with an "unpriced" chip when null. The two drill-down reads (`:581-590`, `:621-630`) are row-level by ID and stay on `RunView` with `MaxRows`. Pattern to copy: `core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run-cost.service.ts:54-67`, but thread the provider (`new RunQuery(this.RunQueryToUse)`).

### 8.2 The six sections
- `cost-budget.component.ts`: KPIs, daily trend, treemap, and by-model table from `AIUsageDaily`/`AIUsageByModel`; remove the two raw pulls (`:717-728`) and all six coalesces. Keep the anomaly logic (`:925-938`) and CSV export (`:692`), fed by the aggregate rows. Rename the "Budget" half nothing yet; PR6 fills it.
- `agent-run-analysis.component.ts`: totals from `AIUsageByAgent`; the "Recent Agent Runs" table stays row-level with `MaxRows: 100`, `ParentRunID IS NULL` in the filter, and a visible "showing latest 100" line; per-run cost from `AIAgentRunSubtreeCost` on expand (existing cost service).
- `model-performance.component.ts`, `usage-patterns.component.ts`, `error-analysis.component.ts`, `prompt-run-analysis.component.ts`: aggregates from the hourly/daily queries; any remaining row-level grid gets `MaxRows` + paging + the "sample of N" state. `usage-patterns` drops its dead `Cost` field (`:23,:64`).
- Every component: `ChangeDetectionStrategy.OnPush` (none has it today), remove the manual `detectChanges` where OnPush + async pipe covers it, PascalCase public members, `@if/@for`.
- `ai-analytics-resource.component.ts`: wire `SetAgentContext` / `SetAgentClientTools` in `ngAfterViewInit` (pattern: `autotagging-pipeline-resource.component.ts:449`); it has neither today.

### 8.3 The pivot surface
New section `usage-explorer` in the left nav (`ai-analytics-resource.component.ts` nav list) → `analytics/usage-explorer/usage-explorer.component.ts`: measure (cost / tokens / runs / p95 latency / cache-read share / unpriced %) × group-by (agent, prompt, model, vendor, user, tenant, source kind, configuration) × optional secondary split × grain (hour/day) × window + comparison period. Reads `AIUsageHourly`/`AIUsageDaily` only, pivots client-side over a few hundred rows. Renders with `TimeSeriesChartComponent` (`charts/time-series-chart.component.ts:205`), `KPICardComponent` (`widgets/kpi-card.component.ts:194`), a table with CSV export. Drill: row → agent runs list (RunView, bounded) → run tree (existing `GetAgentRunTree`) → prompt run form. Preferences persisted via `UserInfoEngine` under the existing `AIAnalyticsPreferences` (`interfaces/analytics-preferences.interface.ts:9`) — add `UsageExplorer` prefs.

### 8.4 Tests and gates
- DOM specs (`*.dom.test.ts` beside each component): KPI shows `—` + unpriced chip on null cost; coverage line renders "covers X% of runs"; the recent-runs table shows the bound line; usage-explorer pivots a fixture of 12 hourly rows into the expected grouped totals.
- `pnpm run check:ui`; `node scripts/check-dom-spec-placement.mjs`; `node scripts/check-spec-antipatterns.mjs packages`.

REVIEWER: `grep -rn "?? 0\||| 0" dashboards/src/AI/services dashboards/src/AI/components/analytics` must return no cost lines; no `EntityName: 'MJ: AI Prompt Runs'` without `MaxRows` anywhere under `analytics/`; no `new RunView()` / `new Metadata()`; `OnPush` on every `@Component` in `analytics/`; `SetAgentContext` present.

---

## 9. PR6 — budgets (`minor`, needs product sign-off before build)

Schema (migration + CodeGen tail; new table → `check:codegen-tail` is now meaningful):
```
AIUsageBudget (ID, Name, ScopeType CHECK IN ('Global','Agent','User','Role','Tenant','Configuration'),
  ScopeEntityID NULL FK Entity, ScopeRecordID NVARCHAR(100) NULL, Period CHECK IN ('Day','Week','Month'),
  AmountLimit DECIMAL(19,8), Currency NCHAR(3), WarnAtPercent INT, Action CHECK IN ('Notify','Throttle','Block'),
  Status CHECK IN ('Active','Disabled'), LastEvaluatedAt, LastObservedAmount DECIMAL(19,8))
AIUsageBudgetEvent (ID, BudgetID FK, PeriodStart, ObservedAmount, ThresholdPercent, Action, NotifiedAt)
```
Runtime: a `ScheduledJobType` driver `AIUsageBudgetEvaluationScheduledJobDriver` (copy the shape of `MaterializationRefreshScheduledJobDriver`) that reads `AIUsageDaily` (materialized) per active budget, writes events, sends notifications through the existing notification path. Enforcement for `Block`: `hasExceededAgentRunGuardrails` gains a pre-run check against the budget's `LastObservedAmount` (cheap, no scan). `Throttle` is `Notify` + a documented hook; do not build a rate limiter here. UI: the budget half of `cost-budget.component.ts`. Tests: unit for period math and threshold crossing; integration for one evaluation cycle against fixture aggregates.

---

## 10. Cross-PR test matrix

| Check | Tier | PR | Asserts |
|---|---|---|---|
| AC8 | integration, read-only | 1 | precision/basis invariants; unpriced coverage reported |
| guardrail zero-limit | unit | 1 | `MaxCostPerRun = 0` is enforced |
| companyId cascade | unit | 1 | sub-agent params carry `companyId` |
| parallel persistence | unit | 2 | arms + selector saved with `ParentID`; parent `Cost` NULL, `RunType='ParallelParent'` |
| AC9 | integration, live model | 2 | subtree `SUM(Cost)` = parent `TotalCost` |
| AC10 | integration | 3 | every step-linked prompt run has `AgentRunID`, `UserID`; backfill left none behind |
| cycle proof | manual, PR body | 3 | CodeGen log has no cyclical warning naming the run entities |
| AC11 | integration | 4 | fact view own-cost = base-table own-cost |
| AC12 | integration | 4 | hourly aggregate = fact view; materialized = live |
| AC13 | integration | 4 | subtree query = recursive `SUM(Cost)`; rollup-poison guard still passes |
| DOM specs | unit (jsdom) | 5 | null-cost rendering, coverage line, bounded tables, pivot math |
| `check:ui`, `check:codegen-tail`, `check-migration-entityfield-sequence` | CI | 3–5 | gates |
| Definition of done (issue) | integration, >10k runs seed | 4–5 | prompt panel total = agent panel total = hand `SUM(Cost)`; "cost by user by model, 90 days" < 1s |

The >10k-run seed: extend `packages/TestingFramework/integration-test-suite` fixtures with a generator that inserts prompt runs directly (`NewRecord` + `Save` in a loop is too slow; use the provider's SQL executor in a `RequiresMutation` check) across 5 agents, 6 models, 20 users, 3 tenants, 90 days, ~3% unpriced, ~2% parallel groups.

---

## 11. Sequencing and dependencies

```
PR1 (doctrine, cascade, seams)  ──┐
PR2 (parallel accounting)         ├──►  PR3 (migration + writers)  ──►  PR4 (fact view, queries, materialization)  ──►  PR5 (dashboards, pivot)  ──►  PR6 (budgets)
                                  ┘
```
- PR1 and PR2 are independent of each other and of the schema; merge in any order.
- PR3 must merge before PR4 (the fact view reads `AgentRunID`/`UserID`).
- PR4 before PR5 (the dashboards read the queries). PR5 can start against PR4's branch.
- PR6 needs the daily aggregate and a product decision on `Throttle`.
- Release-engineer steps happen once, at release: PG counterparts for PR3/PR4 migrations, the consolidated `Metadata_Sync` for PR4's queries.

---

## 12. Reviewer checklist (per PR)

Common: branch tracks same-named remote; changeset level right; no `any`; no `.Get()/.Set()`; touched packages' `pnpm test` and `pnpm run test:integration` outputs pasted; no `sync` blocks in metadata diffs; no `migrations-pg` file.

- **PR1:** guide registered; `companyId` line present at the sub-agent `RunAgent` call; `ProcessingType` seam returns `'Realtime'`; guardrail uses `!= null`; AC8 skips loudly on empty.
- **PR2:** parent created before arms; both coordinator calls receive the parent id; selector has `contextUser` + model; parent `Cost` never assigned from an arm; `:5680` bridge guarded; tests cover three arms.
- **PR3:** filename sorts after `202609101740`; grouped `ALTER TABLE ADD`; FKs named; precision widened on all three columns and the default constraint on `AIAgentRun.TotalCost` intact; six `IX_*` indexes exactly as specified, no hand `IDX_AUTO_MJ_FKEY_*`; extended properties; backfill idempotent; ≥50 blank lines + banner + appended CodeGen with apply-time `Sequence`; standalone `CodeGen_Run_*.sql` deleted; cycle log pasted; all writer sites set both columns; `git diff --exit-code` after a second `mj codegen` on the migrated DB.
- **PR4:** view over base tables, no TVF, no `ORDER BY`, grants present, header justifies the non-entity view; every query JSON has `uuidgen` ID, `UsesTemplate`, `Approved`, `AI` category, no inline params; SQL uses only safe filters; no `TotalCost`/`*Rollup`/`COALESCE(cost,0)`; `CalculateRunCost` body changed, name kept; materialization qualification output pasted (`paramMode`), refresh schedule authored the way the materialization plan intends; scheduled job present; AC11–AC13 green.
- **PR5:** no unbounded run pulls; no cost coalescing; `OnPush` everywhere; agent context wired; `check:ui` green; DOM specs beside components; pivot reads aggregates only; preferences extend the existing interface.
- **PR6:** product sign-off linked; new table has its CodeGen tail (entity subclass, resolvers, form) and `check:codegen-tail` green; `Block` check is O(1); `Throttle` documented as not enforced.

---

## 13. What Betty contributes (inspiration only; nothing Betty-specific ships in MJ)

- The scope pair as the tenant key (doctrine rule 5) is how Betty already attributes every run since its v4.3, enforced server-side. It is the reason this plan does not promote `CompanyID`.
- Betty's Prompt Studio moved lifetime prompt cost from a 200-row client sample to `RunView.Aggregates` and found `AggregateResults` is an array of `{alias, value, error}`, not a map — a confident `$0.00` when read wrong. PR5's null-cost rendering rule comes from that lesson.
- Betty's rootpolicy repair of the seeded `UI: Own AI Prompt Runs` RLS filter (which referenced the non-existent `AgentRunID`) is the strongest argument for PR3's column: once `AgentRunID` exists, that filter can become "own runs only" instead of "own runs or unlinked". Worth one sentence in PR3's body.

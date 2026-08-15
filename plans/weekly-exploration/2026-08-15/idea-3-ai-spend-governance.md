# Idea 3: AI Spend & Policy Console — Budget Guardrails and Governance Visibility

**Week of 2026-08-15 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

The 2026 Nonprofit AI Adoption Report puts a number on a divide that's easy to sense but hard to prove: organizations with budgets under $1M adopt AI at roughly half the rate of organizations with budgets over $1M (34% vs. 66%). Dig into *why*, and it isn't mainly a cost-of-tools problem — it's a governance and visibility problem. 92% of nonprofits already use AI in some form, but only 24% have a formal strategy; 67% cite lack of strategic direction as a barrier; 53% of staff say they don't trust AI outputs enough to act on them; and separately, nonprofit boards are increasingly standing up AI ethics and risk committees while only 10–24% of organizations have any formal written AI policy at all. Meanwhile, the FinOps-for-AI tooling that exists in the market — cost attribution, budget alerts, showback reporting — is all built for organizations spending $250K+ a month. Nothing is scaled for an organization spending $50–500 a month across two or three AI-powered workflows, which describes most of MJ's actual user base.

That gap matters because it's exactly backwards from what these organizations need: the ones with the least budget and the least dedicated staff capacity are the ones who most need a system that manages AI spend and policy *for* them, automatically, rather than requiring a dedicated FinOps hire they'll never have. A platform-level answer here doesn't just save money — it's what turns "should our board approve using AI at all" from an anxious unknown into an answerable question with real numbers and real guardrails behind it.

## What already exists (and why this doesn't duplicate it)

Verified directly against the generated entities and `packages/AI`, not assumed:

- **`MJ: AI Prompt Runs`** (`MJAIPromptRunEntity`) and **`MJ: AI Agent Runs`** (`MJAIAgentRunEntity`) already capture excellent raw material: `TotalCost`, `TokensUsed`/`TokensPrompt`/`TokensCompletion`, and — critically for agents with sub-agents — pre-computed **rollup** fields (`TotalCostRollup`, `TotalTokensUsedRollup`, etc.) that already sum a run plus all its descendants. This proposal is a *consumer* of that existing cost data, not a reimplementation of cost tracking.
- **`MJ: AI Model Costs`** (`MJAIModelCostEntity`), with `MJ: AI Model Price Types`/`MJ: AI Model Price Unit Types` and per-unit-type driver classes in `packages/AI/BaseAIEngine/src/PriceUnitTypes.ts`, already handles the actual price-calculation logic — including the token/minute/character/image distinctions PR #3704 is currently extending. This proposal does not touch pricing calculation at all; it only aggregates and gates against costs the pricing engine already computes correctly.
- **`MJ: AI Configurations`** (`MJAIConfigurationEntity`) scopes *behavior* — which prompt/model an agent defaults to, with parent/child inheritance — but confirmed directly: it has no spend, quota, or rate-limit fields. A budget/quota concept genuinely does not exist anywhere in `packages/AI/**` or the generated entities today; the only budget-shaped things found were context-window token budgeting (an unrelated concept — prompt size, not spend) and a narrow, search-specific `RerankerBudgetCents`. This is real, new infrastructure, not a small extension of something already there.
- **Agent Trust, By Default** (in flight, PR #3044) proposes a consequence taxonomy (None/Reversible/Irreversible/External/Financial) that gates *individual actions* an agent is about to take, based on how hard they'd be to undo. This proposal is deliberately a different layer: it governs *aggregate spend over time* against an org-level budget, not the reversibility of any single action. The two compose naturally — if both ship, "this run would push the org over its monthly AI budget" becomes one more `Consequence` type Agent Trust already knows how to gate — but this proposal does not require Agent Trust to exist, and Agent Trust does not require this.
- **Agent context optimization** (in flight, PR #3300) reduces token bloat *inside* prompt authoring — a cost-reduction effort at the content-design layer. This proposal is cost *visibility and governance after the fact*, at the organizational layer — complementary, not overlapping: one makes runs cheaper, the other makes an org's total AI spend legible and boundable regardless of how cheap any single run is.
- This also indirectly answers a pattern visible in this week's open-issue survey: a cluster of AI prompt/model execution and failover issues (e.g. #3532, #3789) shows that today, an admin has no visibility at all into things like "we silently failed over to a more expensive model 40 times this week." This proposal doesn't fix those specific reliability bugs — that's ordinary engineering work — but its audit trail is exactly the missing visibility that would have made that pattern obvious to a budget-holder instead of invisible.

## Proposed architecture

### New entities

| Entity | Purpose |
|---|---|
| `MJ: AI Budgets` | `Name`, scope via `OwnerEntityID`/`OwnerRecordID` (CompositeKey — scopable to a User, an Agent, a Prompt, a Configuration, or any other entity an org wants to budget by), `PeriodType` (Monthly / Weekly / Rolling-N-Days), `AmountLimit`, `TokenLimit` (nullable alternate unit), `AlertThresholdPercent`, `HardStop` (bool — block further runs vs. alert only), `EffectiveStartDate`/`EndDate` |
| `MJ: AI Budget Ledger Entries` | One materialized row per (Budget, Period): `SpentToDate` (rolled up from the existing `TotalCost`/`TotalCostRollup` fields, filtered to the budget's scope), `LastComputedAt`, `Status` (Under / NearLimit / Exceeded) |
| `MJ: AI Usage Policies` *(Phase 3)* | Declarative allow/deny rules: scope, `AllowedModelIDs`/`DeniedModelIDs`, `AllowedAgentIDs`, `RequireApprovalAboveCostThreshold` |

### Engine

**`AIBudgetEngine`** (new, `packages/AI/Governance`, following the standard `Base`+`Engine` split used throughout MJ) hooks into the point where `TotalCost` is finalized on prompt/agent run completion to increment the relevant ledger entries, and exposes a pre-flight `CheckBudget(scope)` call that execution call sites can consult before a run starts — soft-alert or hard-stop depending on the budget's `HardStop` flag. Periodic ledger rollup/reset reuses the existing scheduled-job substrate rather than adding new scheduling infrastructure, the same pattern prior weeks' engines (engagement scoring, materialization) already established.

### UI

- **AI Spend & Policy Console** — a new Explorer dashboard: budget cards with spend-to-date gauges, a cost-by-model/agent/user breakdown, and a timeline of near-limit and exceeded alerts.
- **Board-ready governance export** — one click produces a PDF/CSV summary (who used what AI, on what data, at what cost, over a chosen period) — directly answers the "the board wants an AI policy and we have no visibility to build one from" gap this year's research surfaces repeatedly.
- **Inline budget-status chip** wherever an agent or prompt is configured — a builder sees "this agent is scoped to the $200/mo Program Ops budget, currently at 62%" at configuration time, not only after the fact in a separate report.

### Why this belongs in core, not an app

Every app built on MJ that uses AI Agents or Prompts needs cost attribution and governance regardless of what the app does — a grants-review assistant, a donor-research agent, and a volunteer-scheduling copilot all draw from the same underlying spend the org needs to see and bound. Only which budgets and policies an org chooses to set are domain-specific configuration; the accounting and enforcement mechanics are identical.

## Phased rollout

1. **Phase 1** — `MJ: AI Budgets` + `MJ: AI Budget Ledger Entries`, rolled up read-only from the `TotalCost`/`TotalCostRollup` fields that already exist, plus a read-only Spend Console. Pure reporting, ships fast because the underlying cost data is already correct today.
2. **Phase 2** — Pre-flight `CheckBudget()` soft-alert integration at run start, using the existing notification substrate for near-limit warnings.
3. **Phase 3** — `HardStop` enforcement + `MJ: AI Usage Policies` allow/deny rules + the board-ready governance export.

## Open questions

- Where exactly in the prompt/agent execution pipeline is the right hook point for a pre-flight check without adding meaningful latency to every run? Leaning: check once per top-level agent run using the existing rollup fields, not per sub-prompt — flagged for architecture review, not a design blocker.
- Should `HardStop` be able to cancel a multi-step agent loop mid-run, or only gate new run starts? Leaning: gate starts only in the initial version — cancelling mid-run risks leaving an agent's work in an inconsistent state, which is a harder problem deserving its own design pass later.

## Mockup

See [`mockups/ai-spend-governance-console.html`](./mockups/ai-spend-governance-console.html) — the AI Spend & Policy Console showing budget gauges, a cost breakdown, and the governance export action. Screenshot: [`screenshots/idea-3-ai-spend-governance.png`](./screenshots/idea-3-ai-spend-governance.png).

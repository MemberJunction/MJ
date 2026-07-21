# Coverage Study — Changes Merged from `next` (2026-07-20)

**Range studied:** `c82926ad45..48c86a3c8d^2` (the next-side parent of the merge into `an-dev-35`).
**Finding:** the entire range is **one PR: #2732 — "Agent Conversation Compaction & Recursive Context Access"** (~22.5K insertions, 64 files; design doc `plans/agent-conversation-compaction.md`). It decomposes into 9 logical changes, assessed below against the integration-test catalog.

Notably, the PR shipped its own deterministic dispatcher (`conversation-compaction-tests.ts`, registered in `run-all.ts`) plus ~1,400 lines of vitest — baseline coverage arriving with the feature is well above repo norm. But it is a **standalone dispatcher: no `testing-integration` checks bundle, no IT metadata record**, and it is **entirely server-in-process**, against the client-first transport doctrine.

## Per-change verdicts

| # | Change | Verdict | Risk |
|---|---|---|---|
| 1 | `ConversationDetail.Sequence` trigger (+backfill, `SummaryPromptRunID`, context-budget fields, `StepType='Compaction'`) | **COVERED** (compaction checks 1 & 8: real `spCreate`, `[1,2,3]` select-back, per-conversation independence). Residual: concurrent same-conversation inserts (the UPDLOCK case) never exercised | Low |
| 2 | `ConversationEngine` assembly: `AssembleContextWindow` / `GetAgentContextWindow` / `LoadWindowRowsFresh` | **COVERED + GAP-TWEAK** — the parity probe hand-builds its RunView; `LoadWindowRowsFresh` (the loader every production path uses) is never invoked at integration tier | **Med** |
| 3 | `RunAIAgentResolver` windowed history + placeholder exclusion + throws-on-load-failure | **GAP-NEW** — nothing drives `conversationId`/`conversationDetailId` through the mutation; the production entry point of the whole feature has zero automated coverage (UI-verified only) | **High** |
| 4 | `ConversationCompactionManager` (`ResolveEffectiveBudget`, `CompactIfNeeded`, `'Compaction'` step) | Mostly COVERED (unit + step-persistence check 8); end-to-end boundary-write + `SummaryPromptRunID` lineage vs a real summary model is a live-model GAP-NEW | Med |
| 5 | Retrieval tools + call cap + read-tool pre-emption | **COVERED** (check 7 + three unit suites) | Low |
| 6 | Prior-turn tool-result carry-forward + `PriorTurnToolResultCache` | **COVERED** (check 9 is thorough: AwaitingFeedback fallback, cache precedence, agent-scoped provenance) | Low |
| 7 | `MJConversationDetailEntityServer.ShouldFlagOriginalMessageChanged` fix (old check was inverted — flag could never set) | **GAP-NEW (cheap)** — no wire coverage of `OriginalMessageChanged`; exactly the EW-doctrine skew class (in-process vs resolver dirty-tracking) | **Med-High** |
| 8 | `AIPromptRunner` JSON5 ESM-interop fix (`import * as JSON5` → default import; repair tier was silently dead under native ESM) | **GAP-NEW (structural)** — the unit test existed and passed while the bug shipped (vitest CJS interop masks it); `check:esm` doesn't gate this class | Med here, **High as a class** |
| 9 | SQLConverter rule fixes + PG FK-index backfill | **COVERED / NOT-TESTABLE-HEADLESS** (unit-tested; PG gated by `pg-migrations.yml`; SS FK-index invariant audited by MC4) | Low |

## Recommendations (ranked by risk × cheapness)

1. **Graduate `conversation-compaction-tests.ts` into a registry bundle + IT record** (~1–2h, mechanical). It is the only deterministic suite outside the registry, so the metadata-driven suite silently omits it and `sibling-parity` cannot catch the omission. Highest silent-drift cost, near-zero fix risk.
2. **EW9: wire-tier `OriginalMessageChanged` check** in `entity-writes` — mutation tier, ~40 lines, deterministic. Edited Message ⇒ flag true; Message+Status together ⇒ flag stays false. The bug class already shipped once precisely because nothing asserted it.
3. **`LoadWindowRowsFresh` assertion in the parity check** (~10 lines): call the production loader alongside the hand-built query, assert row-set equality.
4. **Concurrent-insert Sequence check** (~15 lines): `Promise.all` of 4 detail saves, assert 4 distinct consecutive Sequences — exercises the UPDLOCK/HOLDLOCK path the trigger exists for.
5. **Native-ESM built-dist member probe for CJS deps**: extend `check:esm` (or a deterministic check) to import built `ai-prompts` under plain Node and run the JSON5 repair tier on `"{a:1,}"`. Kills a repo-wide failure class both existing gates demonstrably missed.
6. **Live-model: conversation-backed `RunAIAgent` over the GraphQL wire** (`RUN_AGENT_TESTS`-gated): placeholder exclusion, summary-boundary history, throws-on-load-failure semantics; pair with a forced-tiny `ContextWindowMaxTokens` `CompactIfNeeded` lineage assertion. Highest-risk gap, highest cost.

**Explicitly adequate (no action):** carry-forward cache, retrieval tools, the assembly fold logic itself, SQLConverter, Compaction-step persistence, FK-index invariant.

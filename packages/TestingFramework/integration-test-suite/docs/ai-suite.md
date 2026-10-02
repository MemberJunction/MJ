# AI Suite — the AI-stack integration bundles

**Scope:** every shipped integration-check bundle that exercises MemberJunction's AI stack — skills governance, cost accounting, the dual-path permission helpers, persisted embeddings, the agent loop's deterministic seams, the conversation-compaction assembly layer, the live prompt/agent smoke runners, concurrent-persistence stress, the AI code-authoring Remote Operation, and the Clef, Kev and Perplexity Decider decision-model drivers. **14 bundles, 93 checks total**, all registered on the shared `IntegrationCheckRegistry` in this package (`src/checks/*.checks.ts`) and dispatched by the metadata-driven `IntegrationTestDriver` via `mj test`. **Tier split:** 10 bundles / 86 checks are **deterministic** (no LLM call, members of the *"Integration Tests — Deterministic"* suite, the blocking CI gate) and 4 bundles / 7 checks are **live-model** (real token-costing model calls, members of the *"Integration Tests — Live Model"* suite). Run the deterministic tier with `npm run test:integration` from repo root (= `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`); run the live tier with `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Live Model"`; run one bundle with `MJ_INTEGRATION_TEST=1 npx mj test run --name "<IT record name>"`. Since the **2026-07-20 gate inversion** (`packages/TestingFramework/testing-integration/src/tiers.ts:7-11`), the live-model tier is **ON by default — opt out with `RUN_AGENT_TESTS=0`** (invoking the Live Model suite is already an explicit act; `RUN_AGENT_TESTS=1` still means on for backward compatibility). CI pins `RUN_AGENT_TESTS=0`.

Design ancestor: [test-catalog.md](./test-catalog.md) **Domain 4 — AI Stack Deterministic Seams**. Defect cross-references: [bug-register.md](../../../../plans/integration-test-expansion/bug-register.md). Next expansion for this family: [agents-extended-suite-proposal.md](../../../../plans/integration-test-expansion/agents-extended-suite-proposal.md) (see the closing section).

---

## How tiering actually gates these bundles (two layers)

1. **Whole-test gate** — each bundle's `MJ: Tests` record carries `Configuration.tier` (`deterministic` | `live-model`). `IntegrationTestDriver.Execute` (`testing-integration/src/IntegrationTestDriver.ts:126-137`) resolves the tier through `IsTierEnabled()` and **skips-as-Passed with a gate note** when the gate is unmet. This is the layer that keeps IT16–IT19 out of a `RUN_AGENT_TESTS=0` run.
2. **Per-check gate** — a `NamedCheck` may carry `RequiresMutation` / `RequiresLiveModel` (`testing-integration/src/check.ts:434-436`); the driver skips those checks inside a bundle unless the matching tier is enabled (`IntegrationTestDriver.ts:271-276`). In this family only **`agent-runner.AR1`** sets `RequiresLiveModel: true` (`agent-runner.checks.ts:63`) — see the housekeeping section for the PR1/CC/RO4 asymmetry.

The mutation axis is **not** a separate suite: several deterministic AI bundles mutate the DB by design (own tagged fixtures only, FK-ordered teardown) and are deliberately NOT `RequiresMutation`-gated, mirroring `runquery-cache` (stated in the `conversation-compaction` and `agent-loop-standin` headers).

All ten deterministic bundles honor the family's **anti-vacuity / loud-skip discipline**: data-dependent checks count their subjects and skip-as-pass with an explicit `console.warn` (never silently), while legs that can always run assert unconditionally.

---

## Bundle inventory

| Bundle | Checks | IDs | Tier | Transport | IT record | Suite |
|---|---|---|---|---|---|---|
| `ai-skills` | 21 | AS1–AS21 | deterministic | server | IT12 | Deterministic |
| `ai-cost` | 6 | AC1–AC6 | deterministic | client | IT43 | Deterministic |
| `ai-permissions` | 6 | APM1–APM6 | deterministic | client | IT44 | Deterministic |
| `ai-embeddings` | 5 | AE1–AE5 | deterministic | client | IT45 | Deterministic |
| `agent-loop-standin` | 6 | ALS1–ALS6 | deterministic | server | IT46 | Deterministic |
| `conversation-compaction` | 12 | CC1–CC12 | deterministic | server | IT30 | Deterministic |
| `agent-decisions-switch` | 9 | DS1–DS9 | deterministic | server | IT97 | Deterministic |
| `cloudflare-clef` | 6 | CF1–CF6 | deterministic | server | IT99 | Deterministic |
| `systemone-kev` | 10 | KV1–KV10 | deterministic | server | IT100 | Deterministic |
| `perplexity-decider` | 5 | PX1–PX5 | deterministic | server | IT101 | Deterministic |
| `prompt-runner` | 1 | PR1 | live-model | server | IT16 | Live Model |
| `agent-runner` | 1 | AR1 | live-model | server | IT17 | Live Model |
| `concurrent` | 2 | CC1–CC2 (bundle-prefixed `concurrent.CC*`) | live-model | server | IT18 | Live Model |
| `remote-op-ai-authoring` | 3 | RO4-1–RO4-3 | live-model | server | IT19 | Live Model |

Counts are pinned by `src/__tests__/check-registry.test.ts` (the per-bundle count table is itself a coverage-loss guard), and bundle-to-IT-record parity by `sibling-parity.test.ts`.

---

## 1. `ai-skills` (AS1–AS21) — skills governance, observability, permissions, SKILL.md

**Machinery under test.** The full deterministic data layer of the AI Skills feature (see `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md`), without a single model call: `AIEngine.GetSkillsForAgent` resolution through the **three-layer availability gate** (agent `AcceptsSkills` None/All/Limited × skill `Status` × per-agent grant `Status`); the **v5.45 double activation gate** (`GetAutoActivatableSkillsForAgent`: self-activation requires `Auto` on BOTH `AISkill.ActivationMode` and `AIAgent.SkillActivationMode`, both defaulting `RequestedOnly`, with the requested `/skill` path deliberately ungated by ActivationMode); the **observability round-trip** (`AIAgentRun.PlanMode` bit + `AIAgentRunStep.Skills` as typed `AgentSkillInvocation[]` JSON); the **skill-permission model** (the `MJAISkillPermissionEntityServer` grantee-exclusivity validator — exactly one of UserID/RoleID — and the optional-user permission filter on `GetSkillsForAgent`: owner-override, closed-once-rows-exist, open-by-default); bundle resolution (`GetSkillActionIDs`/`GetSkillSubAgentIDs`); and SKILL.md portability (`SkillImportExportService` + `SkillMarkdownConverter` round-trip, non-fatal unknown-name warnings, and the `AISkill.ExportMarkdown`/`ImportMarkdown` Remote Operations executed in-process exactly as a client would call them). Why it matters: these gates are the entire governance story for what an agent may activate and what a user may run — a regression here is a silent capability escalation or a silently empty skill catalog.

**Transport.** Server (in-process `AIEngine` + `ActionEngineServer` caches; the Remote Operations route in-process).

**Fixtures / lifecycle.** Registered `BundleLifecycle`. Setup creates four tagged skills — `Report Builder` (Active, RequestedOnly by DB default, bundled with one Action + one sub-agent), `Old Skill` (Deprecated), `Open Skill` (Active, zero permission rows — the open-by-default control), `Auto Skill` (Active, `ActivationMode='Auto'`) — plus one Active grant to a "grant target" agent, then hard-refreshes `AIEngine`. It **references, never mutates** one existing Active Action and two existing Active Agents for valid FKs. The fixture handle is published up-front with by-reference accumulator arrays, so a mid-Setup crash still tears down whatever was created. Teardown deletes FK-safe: run steps/runs → grants → junctions → permissions → skills. Checks use lightweight agent stand-ins (`{ID, AcceptsSkills, SkillActivationMode} as MJAIAgentEntityExtended`) and a fabricated role-less `nonOwner` UserInfo rather than provisioning real accounts. AS13 creates a real permission row (tracked + engine refresh) that flips `Report Builder` closed for AS14–AS16; AS18/AS19/AS21 create import-product skills (tracked).

**Tier.** All 21 checks deterministic, ungated (the bundle mutates its own tagged fixtures only).

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `ai-skills.AS1` | AcceptsSkills=None → zero skills | `GetSkillsForAgent` returns `[]` | the None gate leaking any skill |
| `ai-skills.AS2` | All includes Active, excludes Deprecated | membership of SkillActive / absence of SkillDeprecated | Status gate dropped from resolution |
| `ai-skills.AS3` | Limited returns only granted Active skills | granted agent sees the skill; ungranted agent does not | grant gate ignored under Limited |
| `ai-skills.AS4` | Bundle resolution | `GetSkillActionIDs`/`GetSkillSubAgentIDs` contain the junction FKs | junction cache not resolving bundle members |
| `ai-skills.AS5` | ActivationMode persisted DB default | fresh reload of a skill saved without ActivationMode = `'RequestedOnly'` | the safe DB default flipping to Auto (silent self-activation everywhere) |
| `ai-skills.AS6` | Auto×Auto self-activation set | auto set includes SkillAuto, excludes SkillActive (RequestedOnly) + SkillDeprecated | one side of the double gate collapsing; availability gates skipped on the auto set |
| `ai-skills.AS7` | RequestedOnly agent → empty auto set | `GetAutoActivatableSkillsForAgent` length 0 even for Auto skills | agent-side gate ignored |
| `ai-skills.AS8` | Requested path NOT gated by ActivationMode | availability set still includes the RequestedOnly skill | `/skill` requests wrongly filtered by ActivationMode |
| `ai-skills.AS9` | Limited×Auto intersects with Active grants | ungranted Auto skill absent; granted RequestedOnly skill absent from auto set | grant intersection dropped from the auto set |
| `ai-skills.AS10` | PlanMode + Skills JSON round-trip | reloaded `AIAgentRun.PlanMode===true`; `SkillsObject` typed accessor parses SkillName/ActivationType/Provenance.RequestedBy/Reason verbatim | observability columns or the JSONType accessor breaking (audit trail loss) |
| `ai-skills.AS11` | Permission row with BOTH grantees rejected | `Save()` returns false; message names the exclusivity rule | validator regression → ambiguous grants persisted |
| `ai-skills.AS12` | Permission row with NEITHER grantee rejected | `Save()` returns false | granteeless rows persisted |
| `ai-skills.AS13` | Exactly one grantee accepted | `Save()` true; row tracked; engine refreshed | validator over-rejecting valid grants |
| `ai-skills.AS14` | No-user call applies no permission filter | unfiltered `GetSkillsForAgent` includes both restricted + open skills | the optional-user parameter accidentally filtering system callers |
| `ai-skills.AS15` | Owner sees own skill despite restrictive rows | owner-filtered call includes SkillActive | owner short-circuit lost (creators locked out of their own skills) |
| `ai-skills.AS16` | Non-owner denied once rows exist; open skill stays open | nonOwner excluded from SkillActive, included for SkillOpen | closed-once-rows-exist / open-by-default semantics inverting |
| `ai-skills.AS17` | ExportSkill produces SKILL.md with NAMES | frontmatter carries skill name + bundled Action/sub-agent names + Instructions body | export dropping bundle members or instructions (broken portability) |
| `ai-skills.AS18` | ImportSkill recreates skill + junctions by name, no warnings | renamed re-import → 1 re-linked action + 1 re-linked sub-agent, zero warnings | name-to-ID resolution regression on import |
| `ai-skills.AS19` | Unknown Action name warns non-fatally | warning names the missing action; skill still created | unresolved bundle members becoming fatal (or silent) |
| `ai-skills.AS20` | ExportMarkdown remote op | `Success`, markdown includes the skill body, `suggestedFileName` sanitized (no parens) | remote-op wrapper drift vs. the service |
| `ai-skills.AS21` | ImportMarkdown remote op | `Success`, returns created `skillID` + `skillName` | remote-op import path broken while the service passes |

**Known gaps.** None pinned to bug-register IDs; the runtime legs this bundle deliberately cannot reach (real `Skill` step emission, runtime demotion, plan pause/resume) are the proposed `agent-skills-live` bundle SL1–SL5 in the [agents-extended proposal](../../../../plans/integration-test-expansion/agents-extended-suite-proposal.md) section 9.1.

---

## 2. `ai-cost` (AC1–AC6) — cost/pricing pipeline integrity

**Machinery under test.** The deterministic, read-only siblings of the mutation-tier catalog item AI1 (rollup proof): the exact preconditions and math of `MJAIPromptRunEntityServer.CalculateAndSetCost` — price-unit-type `DriverClass` ClassFactory resolution, the `BasePriceUnitType` calculators (`PerMillionTokens` / `PerHundredThousandTokens` / `PerThousandTokens` divisors restated as literals so a silent shipped-divisor change fails as drift), cache-bucket normalization (`CalculateNormalizedCostWithCache` fallback parity when cache rates are NULL, per-bucket discounting, cross-driver unit-scale ratio, zero→0), engine-cache join integrity for every Active `MJ: AI Model Costs` row, `GetActiveModelCost` selection parity (independently reimplemented: Active + in-window + most-recent-start per ProcessingType; stranger id → null), Model-Vendor pairing orphan audit + coverage report, and the historical prompt-run identity `TotalCost = Cost + DescendantCost`. Why it matters: an unresolvable pricing driver makes every run for that unit type **silently uncosted** (LogError + continue, no failure) — the "silently free tokens" drift class.

**Transport.** Client-capable (recommended client-first): everything reads through `AIEngineBase` caches + `RunView` and instantiates pure calculator classes. IT43 declares `transport: client`.

**Fixtures / lifecycle.** **Zero mutation, no lifecycle.** The math checks drive the real calculators with **UNSAVED** `MJ: AI Model Costs` entities (`NewRecord()` only — the same zero-mutation technique as `permission-engine` PE8), so the exact save-time math is pinned without an LLM call or a prompt-run fixture. Data-dependent checks skip-as-pass loudly when the deployment has no cost rows.

**Tier.** All 6 deterministic, ungated, read-only.

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `ai-cost.AC1` | Every Price Unit Type DriverClass resolves; built-in divisor math exact | ClassFactory resolution of each `DriverClass`; one-divisor's-worth of in+out tokens prices exactly `InputPricePerUnit + OutputPricePerUnit` (12.5 probe) | unresolvable pricing driver → runs silently uncosted; silent divisor change repricing every run |
| `ai-cost.AC2` | Pure normalization math | NULL-cache-rate fallback ≡ legacy single-bucket; per-bucket cache pricing exact; per-thousand = 1000 × per-million; zero tokens → 0 | cache-bucket billing drift; fixed-fee leakage; unit-scale skew across drivers |
| `ai-cost.AC3` | Active cost rows resolve in ENGINE caches with sane prices | ModelID/VendorID/PriceTypeID/UnitTypeID present in `AIEngineBase` caches; finite non-negative prices; non-empty Currency; StartedAt ≤ EndedAt | a filtered Config load breaking costing while every DB FK stays green; garbage prices; blank currency stamping |
| `ai-cost.AC4` | `GetActiveModelCost` selection parity + stranger → null | independent reimplementation of Active+in-window+most-recent-start agrees per (model,vendor,type) group; unknown ids yield null for Realtime AND Batch | wrong-row selection (stale price wins); "no price ⇒ silent guess" contract breaking |
| `ai-cost.AC5` | No Active in-window cost row orphaned from Model-Vendor pairings | orphan set empty (stale orphans warn); coverage report of active-but-unpriced models (warn only) | dead pricing config that can still be served; silent coverage shrinkage |
| `ai-cost.AC6` | Historical prompt-run cost identity | last 200 costed `MJ: AI Prompt Runs`: `TotalCost = Cost + DescendantCost` (tolerance for decimal storage), non-negative, missing CostCurrency warned | descendant rollup drift / negative-cost corruption in persisted history |

**Known gaps (bug register).** **B60** — model costing is silently inert in dev: no `MJ: AI Model Costs` seeds ship, and an unresolvable price-unit DriverClass makes runs silently uncosted. AC1/AC3/AC5 pin resolution and report uncovered models, but AC3–AC6 **skip-as-pass** on a costless deployment (loudly) — the seed gap itself is open. AC6's currency leg **warns, does not fail** (older rows predate stamping). The rollup **mutation** proof remains catalog item AI1, deliberately not here.

---

## 3. `ai-permissions` (APM1–APM6) — the AI-specific dual-path permission helpers

**Machinery under test.** The AI-specific semantics of the dual-path agent/skill permission model (`guides/UNIFIED_PERMISSIONS_GUIDE.md`): the cached, **open-by-default** helpers (`AIAgentPermissionHelper` / `AISkillPermissionHelper` in `@memberjunction/ai-engine-base`) versus the **closed-by-default** unified `PermissionEngine` providers. Deliberately non-overlapping with `permission-engine` PE1–PE13 (which pin the zero-grant open-vs-closed divergence, the skill pure core's grant-closes-default, and the unified provider's stranger denial): this bundle covers the stranger-id **fail-closed** behavior of the OPEN path, the ROLE-grant leg through `UserRoles`, the owner short-circuit outranking restrictive rows, user+role OR-merge/union semantics, accessible-set hierarchy monotonicity (delete ⊆ edit ⊆ run ⊆ view), and the seeded no-grant principal's emptiness on the closed path's inventory surfaces (`GetUserResources` / `GetResourcePermissions` — what the Sharing Center renders). Why it matters: these are the exact defaults that decide whether an uninvited user can run an agent, and whether "shared with me" leaks.

**Transport.** Client-capable (same as `permission-engine`); IT44 declares `transport: client`.

**Fixtures / lifecycle.** **Zero mutation, no lifecycle.** APM2–APM4 drive `AISkillPermissionHelper.ComputeEffectivePermissions` — the exported synchronous pure core — with **UNSAVED** `MJ: AI Skill Permissions` rows and **synthetic `UserInfo` principals** (never-persisted ids, synthetic role memberships), so grant/role/owner shapes are constructed in memory without touching any real record's behavior. APM6 reconstructs the seeded role-less principal `it-nogrant@integration.test` client-side (memoized; skip-as-pass with the `npx mj sync push --dir=metadata-optional/integration-test` seeding command when absent or fixture-invalid).

**Tier.** All 6 deterministic, ungated, read-only.

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `ai-permissions.APM1` | DENY — nonexistent agent/skill id fails CLOSED on the open helper path | `GetEffectivePermissions(STRANGER_ID)` all-false + `isOwner:false`; `HasPermission` false — both helpers | the open default ("no rows → View+Run for everyone") leaking to invented resource ids (SECURITY) |
| `ai-permissions.APM2` | Role grants flow through UserRoles | ROLE_A Run grant → member gets Run+View only; ROLE_B member gets NOTHING; role Delete collapses the full hierarchy downward | role-leg matching broken; role grant escalating upward; grant rows not closing the default for non-members |
| `ai-permissions.APM3` | Owner short-circuit outranks restrictive rows | creator identity keeps all four bits under a foreign-only grant list; the same list denies a stranger (non-vacuity control) | grants demoting owners (creators locked out) |
| `ai-permissions.APM4` | User + role grants OR-merge | View-row alone → View; Run-row alone → Run; both → exactly {View, Run}, never Edit/Delete | a "most specific wins" refactor silently shrinking or widening effective access |
| `ai-permissions.APM5` | Accessible-set monotonicity | `GetAccessibleAgents`/`GetAccessibleSkills` sets nest delete ⊆ edit ⊆ run ⊆ view | hierarchy inversion / filter consulting the wrong permission bit (non-vacuous even for a high-privilege harness user) |
| `ai-permissions.APM6` | DENY — seeded no-grant user empty on closed inventory surfaces | `GetUserResources(noGrant)` = [] (scoped + unscoped) for both AI domains; `GetResourcePermissions` of a zero-grant agent = [] | Sharing-Center inventory leaking grants that do not exist |

**Known gaps (bug register).** **B61** — `AIAgentPermissionHelper` lacks the exported pure core its skill sibling has (`ComputeEffectivePermissions`), and its user-match predicate skips the null-guard the skill version carries; the two implementations are line-for-line parallel, so **APM2 pins the row-matching semantics via the skill core only** — the agent-side live-grant e2e remains the mutation-tier catalog item AI3. APM6's agent-domain leg skips when every agent in the deployment has grant rows (loud).

---

## 4. `ai-embeddings` (AE1–AE5) — persisted-embedding invariants without a model call

**Machinery under test.** The persisted-embedding pattern (`guides/BASE_ENTITY_SERVER_PATTERNS.md`): vectors stored as JSON `number[]` strings with a stamped `EmbeddingModelID` across six surfaces on five entities (`MJ: AI Agent Notes` / `AI Agent Examples` / `Queries` / `Tags` `.EmbeddingVector`, plus `MJ: Components`' `FunctionalRequirementsVector` and `TechnicalDesignVector` pairs). Audited over whatever vectors the deployment has (up to 100 rows per surface, loaded once and memoized across AE1–AE4): parseability + per-(surface, model) dimensional consistency, degenerate-vector detection + the unit-L2-norm convention, **cross-entity** dimensional agreement per model (a note vector and a query vector from the same model must agree or cross-source similarity silently breaks), model-reference integrity into the AI catalog, and the `LocalEmbeddings` catalog shape the `EmbedTextLocal` chain resolves through. Deliberately **never invokes** the LocalEmbedding provider — its first call downloads an ONNX model, a network dependency the deterministic tier must never take.

**Transport.** Client-capable; IT45 declares `transport: client`.

**Fixtures / lifecycle.** **Zero mutation, no lifecycle.** Read-only `RunView` sweeps + the `AIEngineBase` model catalog; a per-process memo shares the loaded vectors across checks. Every data-dependent check skips-as-pass loudly when no embeddings exist.

**Tier.** All 5 deterministic, ungated, read-only.

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `ai-embeddings.AE1` | Every persisted embedding parses + is stamped; per-model dims consistent within each surface | JSON parses to non-empty finite `number[]`; `EmbeddingModelID` non-null; same (surface, model) → same length | corrupt/truncated vector writes; unstamped vectors (no provenance → no re-embed/invalidate); mixed-dimension stores corrupting similarity math |
| `ai-embeddings.AE2` | No zero/degenerate vectors; unit-norm convention | L2 norm ≥ 1e-9 (hard); deviation from ‖v‖=1 beyond 0.15 **warned only** | all-zero vectors poisoning cosine similarity (failed writes that slipped through); norm drift surfaced without failing legitimate non-normalizing models |
| `ai-embeddings.AE3` | Cross-entity dimensional agreement per model | one model id → one dimensionality across ALL surfaces; degeneration to AE1 (no model spans two surfaces yet) warned | cross-source similarity (memory near-dup vs. query search) silently broken by per-surface dimension skew |
| `ai-embeddings.AE4` | Every stamped EmbeddingModelID resolves in the catalog | each distinct stamped id found in `engine.Models`; non-`Embeddings` model types warned | vectors stamped by models absent from the catalog — re-embedding + provenance broken |
| `ai-embeddings.AE5` | LocalEmbeddings catalog shape | an Active `Embeddings`-type model from the `LocalEmbeddings` vendor with a non-empty `DriverClass`; absence skips-as-pass — but escalates to a logged **PRODUCT SUSPICION** when persisted vectors exist (embedding is in use, new saves may be failing silently) | the `EmbedTextLocal` ClassFactory chain having nothing to resolve while notes/examples/tags expect self-embedding |

**Known gaps.** No bug-register IDs pinned. The near-dup embedding guard stage of agent memory (0.85 threshold, fail-open) and semantic/vector RAG legs are explicitly deferred as embedding-infrastructure-dependent (proposal sections 9.4 and 10). The mutation-tier persisted-embedding writes remain catalog items AI6/AI14.

---

## 5. `agent-loop-standin` (ALS1–ALS6) — agent-loop machinery without an LLM

**Machinery under test.** The deterministic neighbors of the live AR1 run: BaseAgent's step-persistence internals (the fire-and-forget `_stepSaveQueue`, `createStepEntity`/`finalizeStepEntity` — the same sanctioned keyhole as `conversation-compaction` CC9/CC10 and the unit tier), the two `Execute` early-exit paths that return **before Phase 2** (config load / context memory / RAG injection — the first point a model-adjacent dependency could be touched): the pre-start cancellation check (before Phase 1, no AgentRun row at all) and `validateAgentWithTracking` (after Phase 1, before Phase 2), plus the pure `PayloadManager` guards (`applyAgentChangeRequest` add/update/`__DELETE__` with clone-on-apply and the `allowedPaths` write fence; `applyPayloadScope`/`reversePayloadScope`/`transformChangeRequestPaths`). ALS1/ALS2 extend CC9's SUCCESS single-INSERT proof with the **FAILURE** and **two-phase** shapes it does not cover; ALS2 deliberately probes `StepType='Plan'` — a newer non-terminal type present in `AIAgentRunStep.StepType` but NOT in `AIAgentRun.FinalStep`, the exact place a CHECK-constraint / generated-union skew would first bite.

**Transport.** **Server-only by necessity** — BaseAgent step internals, the step-save queue, and the Execute early exits are server-process seams in `@memberjunction/ai-agents` with no client surface. ALS5/ALS6 are pure in-process helpers.

**Fixtures / lifecycle.** Ordered, mutating-by-design (NOT `RequiresMutation`-gated). Uses a **module-level accumulator** (this bundle predates a context-fixture slot and deliberately does not modify the framework package): tagged `MJ: AI Agent Runs` rows referencing an existing agent (read-only reference), tagged steps, plus run IDs whose Execute-created steps must be swept by query. The one in-memory `Status='Disabled'` mutation in ALS4 is **never saved**. Teardown is FK-ordered and best-effort per record: Execute-created step sweep by run id → tracked steps → runs.

**Tier.** All 6 deterministic, ungated.

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `agent-loop-standin.ALS1` | FAILED completed-at-creation step persists via a SINGLE INSERT | read-back row: `Status='Failed'`, `Success=false`, verbatim ErrorMessage, OutputData, CompletedAt; `__mj_UpdatedAt === __mj_CreatedAt` | failure shape regressing to INSERT-then-UPDATE, or error fields dropped from the INSERT column set (CC9 would stay green) |
| `agent-loop-standin.ALS2` | Two-phase Running → finalize(Failed), non-terminal `'Plan'` StepType intact | phase-1 row observed `Running`/no CompletedAt with `StepType='Plan'`; phase-2 `Failed` + CompletedAt + error/output carried; StepType unchanged (UpdatedAt ≥ CreatedAt only — the strict-inequality compare is deliberately avoided as GETUTCDATE-tick flaky; two observed persisted states already prove two writes) | two-phase lifecycle breakage; the `'Plan'` CHECK-constraint / generated-union skew biting on persist |
| `agent-loop-standin.ALS3` | Pre-aborted cancellation token exits Execute before ANY AgentRun row exists | `result.success===false`; no persisted AgentRun (residue tracked-then-failed-loudly if found) | the cancel-before-start gate moving after run initialization → orphan runs |
| `agent-loop-standin.ALS4` | Non-Active agent deterministically fails Execute | run persisted with `Status='Failed'`, `FinalStep='Failed'`, ErrorMessage naming "not active"/"Disabled"; Validation step persisted terminal (queue flushed first) | the validateAgent failure surface drifting (exact text UIs match on), refused runs left non-terminal |
| `agent-loop-standin.ALS5` | `PayloadManager.applyAgentChangeRequest` pure apply + fence | add/update/`__DELETE__` applied with counts; ORIGINAL object untouched (clone contract); out-of-scope write blocked AND reported in `blockedOperations` naming the path; in-scope write lands | payload mutation-in-place; the downstream sub-agent write-permission fence silently admitting or silently unlogging out-of-scope writes |
| `agent-loop-standin.ALS6` | Scope helpers round-trip | `applyPayloadScope` clones the subtree (mutation does not leak); missing path → null; `reversePayloadScope` re-nests edits preserving siblings; `transformChangeRequestPaths` prefixes to absolute dot-paths | scope slice/unslice asymmetry corrupting the parent payload; sub-agent surgical edits targeting the wrong path |

**Known gaps (bug register).** **B59** — the earliest cancel path returns `agentRun: this._agentRun!` while runtime-undefined (`ExecuteAgentResult.agentRun` is typed required); callers can NPE. ALS3 **guards** for it (asserts nothing was persisted either way) but the typing defect itself is open. **B62** context: ALS5 exercises the *pure* fence; the related-agent (non-child) upstream-violation attachment gap at ~`base-agent.ts:10435` has **zero coverage here** — it awaits the proposed `agent-payload-guards` bundle (PG1–PG9). `PayloadManager` guard enforcement inside a real run likewise has zero unit AND zero integration coverage today (proposal section 7).

---

## 6. `conversation-compaction` (CC1–CC12) — the cross-turn compaction assembly layer

**Machinery under test.** The assembly layer of cross-turn conversation compaction (`plans/agent-conversation-compaction.md`) against the live DB, no LLM: the `trgConversationDetail_AssignSequence` trigger through real `spCreate` (per-conversation monotonic Sequence — the stable ADDRESS the retrieval tools and summary boundaries depend on); `ConversationEngine.GetAgentContextWindow` (no-boundary passthrough, `maxTailMessages` cap, boundary selection at the highest non-null `SummaryOfEarlierConversation` with **warm-cache coherency** after an external entity save, recursive highest-wins, `excludeDetailIds` placeholder filtering); the retrieval tools (`getMessageBySequence` / `getMessagesByRange` / `searchConversation`) paging the full stored history including summarized rows; BaseAgent's single-INSERT step persistence for a completed-at-creation `Compaction` step; the **prior-turn tool-result carry-forward loader** (`PriorTurnToolResultCache` DB fallback on miss including the `AwaitingFeedback` settled status, cache precedence on hit, agent-scoped provenance in both directions, settle-time population); `AssembleContextWindow` parity across the engine window, an independent hand-built `ConversationWindowFields` query, AND the production `LoadWindowRowsFresh` loader (which before CC11 had never run in any test); and a deliberate **break attempt** at the trigger's concurrency serialization. Graduated verbatim from PR #2732's standalone dispatcher.

**Transport.** **Server-only by necessity** — BaseAgent step internals, ConversationEngine warm-cache coherency, and `PriorTurnToolResultCache` are server-process seams (the resolver-side wire coverage is a separate live-model gap, noted in the file header).

**Fixtures / lifecycle.** Ordered bundle on `ctx.CompactionFixture`: CC1 creates the conversation CC2–CC7 reuse; CC8/CC10/CC11/CC12 create their own. Conversations/details go through the real entity save path (spCreate + Sequence trigger); agent runs reference an existing agent. Mutation-by-design, NOT `RequiresMutation`-gated. Teardown FK-ordered, best-effort: steps → runs → details → conversations.

**Tier.** All 12 deterministic, ungated.

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `conversation-compaction.CC1` | Trigger assigns monotonic Sequence via real spCreate | three saved details come back `[1,2,3]` from the spCreate SELECT-back | trigger/SELECT-back regression breaking the sequence address space |
| `conversation-compaction.CC2` | No boundary → all messages, chronological, metadata stamped | window length/content/role mapping; `sequence` + `conversationDetailId` metadata; no summary flags | window mis-assembly before any compaction exists |
| `conversation-compaction.CC3` | `maxTailMessages` caps the no-boundary window | last-2 cap returns `m2,m3` | tail-cap off-by-one / cap ignored |
| `conversation-compaction.CC4` | Summary save → [summary, boundary raw, tail] via WARM cache | external save merges into the already-warm engine cache; first message flagged `isConversationSummary` with `summaryBoundarySequence`, text verbatim | the entity-event cache merge dropping summaries → agents keep seeing full history |
| `conversation-compaction.CC5` | Highest-sequence summary wins | after a newer summary, window = [summary(seq 3), boundary raw] | recursive compaction re-selecting an old boundary (baseline loss) |
| `conversation-compaction.CC6` | `excludeDetailIds` drops the in-flight placeholder | boundary recomputed to seq 2; excluded row absent | in-flight placeholder rows polluting the window / stale boundary selection under exclusion |
| `conversation-compaction.CC7` | Retrieval tools page + search full stored history | `getMessageBySequence(1)` exact; range 1–3 in order (including summarized rows); search hit at the right sequence handle | "compacted = lost" — the retrieval promise breaking |
| `conversation-compaction.CC8` | Second conversation independently sequenced/windowed | fresh conversation sequences `[1,2]`, window length 2 | cross-conversation sequence bleed |
| `conversation-compaction.CC9` | Completed-at-creation Compaction step = SINGLE INSERT | read-back: terminal Status/Success/OutputData; `__mj_UpdatedAt === __mj_CreatedAt` | success-shape single-INSERT regressing to INSERT+UPDATE (write amplification on every step) |
| `conversation-compaction.CC10` | Carry-forward loader: DB fallback, cache precedence, agent scoping, population | miss → finds the **AwaitingFeedback** prior run's tool step (the PR-review gate fix's exact status); other agent → 0; hit → cache marker wins; `cachePriorTurnToolResults` populates agent-scoped only | settled-status filter regression (chat turns invisible); cross-agent tool-result leakage; cache/DB divergence |
| `conversation-compaction.CC11` | `AssembleContextWindow` parity: engine ≡ independent query ≡ production loader | element-wise content/role/sequence parity across all three, plus exclusion parity; `LoadWindowRowsFresh` row count matches the independent query | a field-list or filter regression in the production loader (e.g. dropping `SummaryOfEarlierConversation` from `ConversationWindowFields`) that every other test would miss |
| `conversation-compaction.CC12` | BREAK ATTEMPT — concurrent same-conversation inserts get distinct consecutive Sequences | 4 parallel saves all succeed; sequences = `[2,3,4,5]`, no duplicates, no gaps | the trigger's serialization path regressing to duplicates, gaps — or deadlock (see B48) |

**Known gaps / defects proven (bug register).** **B48** — CC12 **found a real production defect and proved the fix red-then-green**: the original `UPDLOCK/HOLDLOCK` MAX-read deadlocked under concurrent same-conversation inserts (one user's message save failed outright as the deadlock victim; reproduced live by CC12). Fixed by migration `V202607202110__v5.49.x__Fix_ConversationDetail_Sequence_Deadlock.sql` (transaction-scoped `sp_getapplock` per ConversationID + `READPAST` on the MAX-read, converging SQL Server with the PG advisory-lock variant); CC12 was red reproducing the deadlock and green three consecutive runs post-fix. Remaining gap: no run ever *fires* a real compaction pass and no prompt ever *receives* a carried-forward replay — that is the proposed `agent-compaction-e2e` (CE1–CE9) and `agent-carry-forward` (CF1–CF6) work.

---

## 7. `prompt-runner` (PR1) — live AIPromptRunner smoke

**Machinery under test.** The full live `AIPromptRunner` stack: template render → model selection → real provider execution → fire-and-forget `AIPromptRun` persistence via the `BaseEntitySaveQueue`, then deep verification of each persisted `MJ: AI Prompt Runs` row through the shared `verifyPromptRun` (`testing-integration/src/ai-verify.ts`): terminal Status, `CompletedAt` set (the "stuck at Running" guard), non-empty Result + timing on success. The live end-to-end regression guard for the prompt-run save path.

**Transport.** Server (in-process `AIPromptRunner` against real model providers + live DB).

**Fixtures / lifecycle.** Setup = `AIEngine.Instance.Config`; Teardown no-op — **the prompt runs the check creates are its own output** (not cleaned; they are ordinary run history). Env knobs: `PROMPT_TEST_NAMES` (comma-separated explicit prompts) or `PROMPT_TEST_COUNT` (first N Active, default 3), `PROMPT_TEST_DATA` (JSON data payload).

**Tier.** Live-model — but **only via the whole-test gate**: IT16's `Configuration.tier: 'live-model'`. The single check:

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `prompt-runner.PR1` | Execute selected Active prompts; verify each AI Prompt Run finalized | ≥1 prompt selected; each run returns a `promptRun.ID`; after `WaitForPendingPromptRunSaves`, `verifyPromptRun` passes per row (terminal, CompletedAt, result/timing) | prompt runs stuck at `Running` / never persisted — the fire-and-forget queue silently dropping finalizes |

**Housekeeping gap (VERIFIED current as of this doc).** PR1's file header claims "gated by RUN_AGENT_TESTS at the dispatcher", but its `NamedCheck` **does not set `RequiresLiveModel`** — while `agent-runner.AR1` does (`agent-runner.checks.ts:63`). The [agents-extended proposal](../../../../plans/integration-test-expansion/agents-extended-suite-proposal.md) section 2 flags this, and it is **still true in the current code**. Today the IT16 record's `tier: 'live-model'` gates the whole Test at the driver, so nothing runs ungated through `mj test` — but the per-check layer is asymmetric: if the `prompt-runner` bundle were ever selected inside a deterministic-tier Test, PR1 would make real model calls where AR1 would be skipped. The same omission applies to `concurrent` CC1/CC2 and `remote-op-ai-authoring` RO4-1–RO4-3 (see below). Fix when the agents-extended family lands. Additionally, the "at the dispatcher" phrasing is stale — the per-bundle tsx dispatchers were retired in the July-2026 framework/content split (single entry path: `mj test`).

---

## 8. `agent-runner` (AR1) — live agent deep-persistence smoke

**Machinery under test.** Real agents end to end through `AgentRunner` (Sage, Query Builder, Demo Flow Agent, Demo Loop Agent ×3 prompts, Research Agent ×3 prompts — 9 specs), then **deep verification** of the persisted output via `verifyAgentRun`: the `MJ: AI Agent Runs` header (terminal Status + CompletedAt), every `MJ: AI Agent Run Steps` row terminal with CompletedAt (never stuck at `Running` — the `ai-verify.ts` invariant), each Prompt step's `AI Prompt Runs` row via `TargetLogID`, each Actions/Tool step's Action Execution Log, and each Sub-Agent step's child run **recursively**. Demo Flow Agent sets `ExpectSuccess: false` (its action steps hit external APIs that may not be keyed) — the engine-path assertion (graph traversed, steps persisted) still holds. Non-Active agents are skipped cleanly, not failed; an `AGENT_FILTER` matching nothing returns pass, never `process.exit`.

**Transport.** Server. **Fixtures.** Setup = `AIEngine.Config`; runs are their own output (not cleaned). Knobs: `AGENT_FILTER`, `AGENT_SETTLE_MS` (default 3000 — the fire-and-forget queues must land before read-back), per-agent `*_MESSAGE` overrides.

**Tier.** Live-model, gated at BOTH layers: IT17 `tier: 'live-model'` AND `RequiresLiveModel: true` on the check — the only check in this family carrying the per-check flag.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `agent-runner.AR1` | Each configured agent runs and persists a correct run + steps + prompt runs + action logs | per spec: `agentRun.ID` returned; after settle, `verifyAgentRun` deep pass (run terminal, all steps terminal + CompletedAt, TargetLogID linkage to prompt runs / action logs / child runs recursively); `result.success` when ExpectSuccess; `stepCount > 0` for the flow agent | the fire-and-forget save queue leaving runs/steps/logs orphaned or stuck `Running` across the whole agent hierarchy; step-to-target linkage loss |

---

## 9. `concurrent` (CC1–CC2) — concurrent run persistence stress

**Machinery under test.** The **per-entity-instance keying of the fire-and-forget `BaseEntitySaveQueue`** under parallel load: many prompt/agent runs fired simultaneously, each must persist its OWN correct run — a slow INSERT in one run must never clobber another's finalize.

**Transport.** Server. **Fixtures.** Setup = `AIEngine.Config`; runs are their own output. Knobs: `CONCURRENCY` (default 5; interpolated into CC1's display Name), `AGENT_SETTLE_MS`.

**Tier.** Live-model — whole-test gate only (IT18 `tier: 'live-model'`; no per-check `RequiresLiveModel` — see the PR1 housekeeping note).

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `concurrent.CC1` | N concurrent prompt runs each persist an independent, correct AI Prompt Run | N distinct `promptRun.ID`s (Set size === CONCURRENCY); each passes `verifyPromptRun` | shared/clobbered run records under concurrency — queue keying collapse |
| `concurrent.CC2` | Concurrent agent runs each persist a correct, independent run | 3 distinct run IDs (Sage / Demo Loop Agent / Research Agent in parallel); each passes `verifyAgentRun` (success not asserted) | cross-run corruption in the agent run/step persistence path |

**Naming note:** this bundle's bare check names `CC1`/`CC2` collide with `conversation-compaction`'s `CC1`–`CC12`. Full Ids are unambiguous (`concurrent.CC1` vs `conversation-compaction.CC1`) — always use the bundle-prefixed form in prose and tooling.

---

## 10. `remote-op-ai-authoring` (RO4-1–RO4-3) — the AI-from-Description authoring loop

**Machinery under test.** RO-4 (see `guides/REMOTE_OPERATIONS_GUIDE.md`): saving a `GenerationType='AI'` `MJ: Remote Operations` row makes `MJRemoteOperationEntityServer` have a model author the `InternalExecute` body from `Description` against the ambient `input`/`provider`/`user` contract, gated by `CodeApprovalStatus`. One shared op fixture flows through all three checks: authoring on first save → Pending; approve + re-save does NOT regenerate (Description unchanged); the RO-2 CodeGen emitter (`RemoteOperationGeneratorBase`) produces a complete `@RegisterClass`'d typed class embedding the authored body. Assertions are on **structure, never exact model text** — the deterministic-shape discipline the whole family follows.

**Transport.** Server (the server entity subclass must be the resolved class — RO4-1 asserts `constructor.name === 'MJRemoteOperationEntityServer'` before saving, which doubles as a class-resolution guard).

**Fixtures / lifecycle.** Ordered lifecycle: Setup builds the op **UNSAVED** on `ctx.RemoteOpAiAuthoringFixture` (key `Test.AIAuthoredCount`, typed input/output definitions) — RO4-1 performs the save so the authoring fires inside a check, not inside Setup. Teardown deletes the op if saved. RO4-3 emits into a `mkdtempSync` temp dir.

**Tier.** Live-model — whole-test gate only (IT19 `tier: 'live-model'`; no per-check `RequiresLiveModel` — see the PR1 housekeeping note).

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `remote-op-ai-authoring.RO4-1` | Saving an AI op authors a body, sets Pending | resolved class is the server subclass; `Save()` true; `Code` non-empty; `CodeApprovalStatus='Pending'`; `CodeApprovedAt` null | authoring not firing on save; new AI code skipping the review gate |
| `remote-op-ai-authoring.RO4-2` | Approve + save does NOT regenerate | `Code` byte-identical after approve-save; status `Approved` | approval churn re-authoring (and re-Pending-ing) unchanged operations |
| `remote-op-ai-authoring.RO4-3` | Emitter produces a complete registered class | `remote_operations.ts` contains `@RegisterClass(BaseRemotableOperation, "Test.AIAuthoredCount")`, the typed class extending `BaseRemotableOperation<In,Out>`, the `InternalExecute` signature, and the input interface | the authored body not surviving the CodeGen emit — authoring works but ships nothing |

---

## 11. `agent-decisions-switch` (DS1–DS9) — the `decisionsEnabled` master switch, with scripted drivers

**Machinery under test.** `decisionsEnabled`, a Loop agent-type prompt param that is `false` by default, is the master switch for an agent's own decision-model use. The bundle runs real agents end to end and shows that the five loop uses it governs (inline `decisions`, `finishIf`, decision discovery, catalog narrowing, the payload change check) ask nothing while it is off, whatever their own settings say, and that each use an agent turns on asks once while it is on; that the per-run override (`data.__agentTypePromptParams.decisionsEnabled`) flips it for one run in either direction; that the Memory Manager's note gate obeys it; and that a Flow agent's Decision step, an explicit use, ignores it. The params merge is the real one, over the Loop schema as synced to the database (DS1 pins its default).

**No model calls, real everything else.** Every chat call is a scripted reply from `TestLLM` (`@memberjunction/unit-testing`), registered over the chat driver classes, and every decision call a scripted answer from `ScriptedDecision` (`src/checks/decision-test-double.ts`), registered over the decision driver classes the shipped decision prompts can reach (`LLMDecision` and `OpenRouterDecision`, which `Default Decision` binds, and `CloudflareDecision`, `SystemOneDecision` and `PerplexityDecision`, whose Clef, Kev and Perplexity Decider models are its power-matched fallbacks). The lifecycle Setup registers both and Teardown restores the real drivers and disarms the stand-in. Runs pass a placeholder API key for the chat drivers, so model selection accepts the seeded prompt's binding on a runner with no keys at all. AgentRunner, BaseAgent, the Loop type, prompt rendering, AIPromptRunner, AIDecisionRunner's candidate selection and run rows, and the Calculate Expression action are all real.

**The script.** Turn 1: an Actions step, an inline `decisions` request and a payload change that shortens a 170-character `notes` (flagged by the payload analyzer). Turn 2: an Actions step with a `finishIf` gate. Turn 3: `taskComplete`. With the switch off the gate is ignored and the run takes three turns; with `finishIfMode: 'on'` and the switch on, the gate passes and the run ends after two. The stand-in answers every Likelihood 0.97 except the narrowing question about Get Weather (0.05), so narrowing at one action visibly hides it.

**Transport.** Server-only by necessity: the scripted drivers are ClassFactory registrations in the test process, which an agent run inside MJAPI would never see.

**Fixtures / lifecycle.** Seeded metadata, referenced read-only (`metadata-optional/integration-test/ai-agents/.it-decisions-switch-agents.json`): `IT: Decisions Default Agent` (no params), `IT: Decisions Sub-Flags Agent` (every governed setting on, no switch; three actions including Find Candidate Actions), `IT: Decisions Enabled Agent` (switch on, decisions docs, `finishIfMode: 'on'`), `IT: Decisions Switch Flow Agent` (one Decision step), and the shared prompt `IT: Decisions Switch Agent - System Prompt`. Teardown deletes every run the bundle made, its steps (children first), the prompt runs and action execution logs they point at, and the Memory Manager gate's prompt runs.

**Tier.** All 9 deterministic, ungated. Break-it check: with the resolver (`BaseAgent.DecisionsEnabled`) forced to `true`, DS2, DS3, DS6, DS7 and DS8 fail; forced to `false`, DS4, DS5 and DS8 fail; DS9 passes both ways.

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `agent-decisions-switch.DS1` | Loop schema default + seeded params | the synced Loop `PromptParamsSchema` declares `decisionsEnabled` boolean, default `false`; the seeded agents carry exactly the params the checks rely on | a schema that never synced, or fixture drift that would make the other checks vacuous |
| `agent-decisions-switch.DS2` | Default switch, uses on for the run | three chat calls, final message from turn 3, both actions completed, no Decision step, no stand-in call, no new Default Decision prompt run; the first prompt has no decisions/finishIf docs, fields or types | the switch's default flipping to on, or a use that skips the switch |
| `agent-decisions-switch.DS3` | Every governed setting on, no switch | as DS2, plus the prompt describes every action with no narrowing note, and the shortened `notes` is kept unchecked | a governed use (discovery, narrowing, payload check, explicit response fields) that ignores the switch |
| `agent-decisions-switch.DS4` | Agent params turn it on | two chat calls, final message from the gate; exactly `Decision: notes_done` and `Finish check`, each `Completed` and linked to a Default Decision prompt run naming the agent; docs present | the switch failing to turn a use on, or turning on uses the agent did not ask for |
| `agent-decisions-switch.DS5` | Per-run override `true` | all five steps (`Agent discovery`, `Catalog narrowing`, `Payload change check`, `Decision: notes_done`, `Finish check`) with five stand-in calls; narrowing hides Get Weather and adds its note | the override not reaching a use, notably the discovery fast path |
| `agent-decisions-switch.DS6` | The override lasts one run | the DS3 agent, run again with AIEngine's cached base params warm, asks nothing | a per-run override leaking into the cached base params |
| `agent-decisions-switch.DS7` | Per-run override `false` | the DS4 agent asks nothing and takes three turns | an override that can only turn the switch on |
| `agent-decisions-switch.DS8` | Memory Manager note gate | with `enableDecisionGate` on: no stand-in call and no prompt run without the switch; one call and one persisted Default Decision prompt run with it on for the run | the gate reading only its own flag |
| `agent-decisions-switch.DS9` | Flow Decision step is not gated | an in-run Flow agent with `decisionsEnabled: false` for the run completes with no chat call and one `Decision: ready_check` step linked to a Default Decision prompt run | the switch spreading to explicit uses |

---

## 12. `cloudflare-clef` (CF1–CF6) — Cloudflare's Clef decision models, through an HTTP stand-in

**Machinery under test.** The `Clef` and `Clef-flash` models (`metadata/ai-models/.clef-models.json`), the `Cloudflare` vendor, the `CloudflareDecision` driver (`@memberjunction/ai-cloudflare`) and the System One mapping it inherits from `BaseSystemOneDecision` (`@memberjunction/ai`), from the synced metadata through `AIDecisionRunner` to the Workers AI request: the v4 envelope's success and failure, a bare response, and a credential's `accountId`.

**No network, real everything else.** CF3–CF6 register `ScriptedWorkersAIDecision`, a subclass of the real `CloudflareDecision` that overrides only `SendRequest` (the driver's one network call), over the `CloudflareDecision` key for the length of each check, and restore the shipped class after it. The stand-in records each request and answers as the check scripts it: by default a Workers AI response in Cloudflare's v4 envelope; in CF4 a failure envelope for Clef; in CF5 the response bare. The prompt, model and vendor rows, candidate selection, credential resolution (a legacy `apiKeys` entry holding `<accountId>:<apiToken>`, or in CF6 a bound `MJ: Credentials` row), the URL, header and body building, the envelope handling, the answer mapping, `BaseDecision`'s validation, the failover loop and the `MJ: AI Prompt Runs` row are all real. `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_AI_BASE_URL` are unset for the bundle and restored after it.

**Transport.** Server-only by necessity: the stand-in is a ClassFactory registration in the test process.

**Fixtures / lifecycle.** The models are shipped metadata, read only. CF4 creates a throwaway Decision prompt bound to Clef, then Clef-flash (`Specific`, `RequireSpecificModels`, failover on); CF6 creates a real `API Key` credential through `CredentialEngine.StoreCredential` (validated against the type's schema and stored encrypted; when the `Base Encryption Key`'s environment variable is unset, as in CI, the fixture supplies a throwaway key for its own length) and an `MJ: AI Credential Bindings` row on Clef's Cloudflare model-vendor row. Both live in `src/checks/decision-fixtures.ts` and are deleted in a `finally`, children first (prompt runs, bindings, prompt models, prompts, the credentials' audit-log rows, credentials); Teardown deletes the prompt runs CF3 created and anything a failed check left.

**Tier.** All 6 deterministic, ungated. Break-it checks: with `BaseSystemOneDecision` reading Score probabilities by level name instead of level index, CF3 fails ("the Score probabilities sum to 0"); with `CloudflareDecision` sending the full APIName as the body's `model`, CF3 fails on the request body. With `UnwrapResponse` unwrapping a `success: false` envelope like a success, CF4 fails ("the error does not carry Cloudflare's message"); with every object treated as an envelope, CF5 fails ("the response has no answers object"); with the credential's `accountId` ignored, CF6 fails ("has no Cloudflare account ID"). Each break leaves the other checks passing.

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `cloudflare-clef.CF1` | Catalog rows | both models Active, type `Decision`, effective `Decision` limits 64 / 255 / 10 / 65,536; one Cloudflare Model Developer row and one Active Inference Provider row naming `CloudflareDecision`, the `@cf/cloudflare/...` APIName, 65,536 input tokens, no streaming; an active Realtime cost row at $0.24 / $0.09 per million input tokens, $0 output; the vendor's credential type is `API Key` | metadata that did not sync, a wrong driver class or APIName (the runner would build the wrong driver or call the wrong URL), wrong limits or prices |
| `cloudflare-clef.CF2` | ClassFactory builds the driver | `CreateInstance(BaseDecision, 'CloudflareDecision', '<account>:<token>')` returns the shipped class, with the account ID read from the key | the package not registering its class, or the compound key not parsed |
| `cloudflare-clef.CF3` | A runner call per model | `ExecuteDecision` with `override` naming the model and Cloudflare succeeds with `CloudflareDecision`; one request to `https://api.cloudflare.com/client/v4/accounts/<account>/ai/run/<APIName>` with `Bearer <token>` and body `{ model: 'clef' or 'clef-flash', state, questions }` for a Likelihood, a Choice and a Score; the answers come back mapped (Choice renormalised from 0.98, Score keyed by level name); the prompt-run row names the model, Cloudflare and Default Decision, succeeded, has the scripted input tokens and a cost priced from the cost row | a broken wire mapping, URL, token handling, envelope unwrapping or model-name derivation; the run recorded against the wrong model or vendor; a missing cost row |
| `cloudflare-clef.CF4` | An envelope failure fails over | for `{ success: false, errors: [{ message }] }` with a 200 and with a 500: Clef alone fails, and the result's error and the run row's `ErrorMessage` are the driver's error naming the status and the message alone (not the raw body); on the test prompt the runner requests Clef then Clef-flash, its one logged failed attempt (Clef) carries that error and allowed failover, and Clef-flash's answers come back mapped | a failure envelope unwrapped as a success, Cloudflare's message lost or left inside the raw body (a 5xx's `errors[].message` not extracted), or the failure classified so that it stops the failover loop |
| `cloudflare-clef.CF5` | A bare response | a System One response with no v4 envelope (as a Worker or AI Gateway returns it) succeeds with its answers, dated model and input tokens | every response assumed to be enveloped |
| `cloudflare-clef.CF6` | A JSON credential's account | with no `apiKeys`, a bound `API Key` credential whose values are `{ apiKey, accountId }` sends one request to `.../accounts/<accountId>/ai/run/@cf/cloudflare/clef` with `Bearer <apiKey>`, and the answers map | a credential's `accountId` ignored (the call then fails before any request), or its JSON sent as the token |

---

## 13. `systemone-kev` (KV1–KV10) — Kev and the generic System One driver, against loopback servers

**Machinery under test.** The `Kev-0.8B`, `Kev-4B`, `Kev-9B` and `Kev-27B` models (`metadata/ai-models/.kev-models.json`), the `System One Endpoint` vendor, Kev-4B's OpenRouter route, the `SystemOneDecision` driver (`@memberjunction/ai-systemone`) and the credential parsing it inherits from `BaseSystemOneDecision`, from the synced metadata through `AIDecisionRunner` to a real HTTP request; and what the runner does with them: `Default Decision`'s candidate order and selection, credentials bound per model-vendor row and per prompt-model row (including a binding on the serving row of a model that has a second row on the same vendor), failover past misconfigured candidates, and the classification of a server's 503, 429 and 401.

**Real requests, on loopback.** KV3, KV5–KV8 and KV10 start `node:http` servers on 127.0.0.1 with ephemeral ports that answer `POST /v1/systemone` the way Kev's server does (bare, four-decimal probabilities, an extra `latency_ms`; Kev's own 401 and 503 bodies), and stop them after the check. KV3's credential is a legacy `apiKeys` entry holding the JSON an `API Key with Endpoint` AI Credential resolves to; KV4–KV8 and KV10 create real `MJ: Credentials` rows through `CredentialEngine` and bind them with `MJ: AI Credential Bindings`, so the runner resolves them as a configured host would. For the whole bundle `OpenRouterDecision` is replaced by `ScriptedOpenRouterDecision`, which overrides only `SendRequest`, answers only while a check arms it (KV8, KV9) with a recorded Kev-4B response, and refuses otherwise; `CloudflareDecision` is replaced by `RefusingCloudflareDecision`, which records the URL and refuses every request, so KV7's Clef candidate cannot reach Cloudflare even if its missing-account check regressed; KV4 registers the shared `ScriptedDecision` over every decision driver class, as IT97 does. `SYSTEMONE_BASE_URL`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_AI_BASE_URL` are unset for the bundle and restored after it. Nothing leaves 127.0.0.1.

**The probe runner.** KV4, KV7, KV8 and KV10 use `DecisionRunnerProbe` (`src/checks/decision-fixtures.ts`), the real `AIDecisionRunner` with three protected seams opened: the candidate builder and the credential probe that selection uses (as IT97's `MemoryGateProbe` opens the Memory Manager), every failover attempt the runner logs, with its error, and the rate-limit backoff, which it records instead of sleeping (a 429 suggests 30 seconds). Whether and how often the runner retries is unchanged. The attempts are read from the runner rather than from the run row: `BaseModelRunner.updatePromptRunWithFailoverSuccess` sets the row's model, vendor and failover columns outside the run's save queue, so the INSERT's reload can put the first candidate back. After a failover the checks assert only the row's `Success`.

**Transport.** Server-only: the runner, the servers and the stand-ins all run in the test process.

**Fixtures / lifecycle.** The Kev models are shipped metadata, read only. KV4–KV8 and KV10 create their own credentials (stored encrypted; the fixture supplies a throwaway `Base Encryption Key` for its own length when its environment variable is unset, as in CI), bindings and throwaway Decision prompts, and KV10 a throwaway Decision model (`IT model it-kv10-…`; a model's name is limited to 50 characters, so the safe-to-delete tag is in its description) with two `MJ: AI Model Vendors` rows under keys the check chooses. All are deleted in a `finally`, children first (prompt runs, including any untracked run of a test prompt or model, bindings, prompt models, prompts, model-vendor rows, models, the credentials' audit-log rows, credentials). Teardown deletes the prompt runs KV3 and KV9 created and anything a failed check left, then restores `OpenRouterDecision`, `CloudflareDecision` and the environment.

**Tier.** All 10 deterministic, ungated. Break-it checks, each run against the built suite and then reversed with a targeted edit:

| Break | Fails |
|---|---|
| `SystemOneDecision` sends an `Authorization` header for an empty token | KV3 (Kev-27B's open-server call carried `Authorization: Bearer`) |
| power-matched fallbacks put ahead of the bound candidates (`BaseModelRunner.appendPowerMatchedFallbackCandidates`) | KV4 ("first candidate — expected Jev / OpenRouter / OpenRouterDecision, got Kev-0.8B / System One Endpoint / SystemOneDecision") |
| `AIDecisionRunner` runs only the selected candidate under `SameModelDifferentVendor`, as under `None` | KV4 ("KV4 failover: the decision failed: The integration-test decision stand-in is unavailable") |
| `ParseSystemOneCredential` keeps the raw JSON as the API key (the pre-fix behaviour) | KV5 ("the bearer is the credential's JSON, not its token"), and KV3, KV6, KV7, KV8 on the header |
| the ModelVendor binding looked up for any row of the vendor, not the candidate's own (`BaseModelRunner.ResolveCredentialForExecution`) | KV6 ("Kev-27B: requests served — expected 1, got 0") |
| a driver configuration error made `Fatal` again (`BaseSystemOneDecision`) | KV7 ("the decision failed: System One endpoint has no base URL…") |
| `CloudflareDecision`'s missing-account check disabled | KV7 ("requests Clef sent with no account ID — expected 0, got 1"); the guard answered, nothing left the process |
| `CreateSystemOneHTTPError` drops the HTTP status | KV8 ("503: the attempts the runner logged — expected ServiceUnavailable:retry, got Unknown:retry") |
| `OpenRouterDecision` always sends its default (Jev) model | KV9 (the request body's `model`) |
| the `ModelVendor` binding looked up on only the first Active row of the model and vendor, in both `HasCredentialsAvailable` and `ResolveCredentialForExecution` (the pre-fix `BaseModelRunner`) | KV10 ("the candidate has no credential after its Inference Provider row was bound (the Model Developer row, first in the engine, was read instead)"); its precondition held, every other check passed, and IT99's CF6 still passed, because Clef's Inference Provider row sorts first by key |
| the same, in `ResolveCredentialForExecution` alone | KV10 ("the decision failed: System One endpoint has no base URL…": the candidate was selected but no credential resolved) |

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `systemone-kev.KV1` | Catalog rows | the vendor's credential type is `API Key with Endpoint`; the four Kev models Active, type `Decision`, effective limits 255 / 10 / 8,192 (65,536 for Kev-27B); one Active Inference Provider row each on System One Endpoint naming `SystemOneDecision` and `kev-latest`, with no cost row on that vendor; Kev-4B's OpenRouter row naming `OpenRouterDecision` and `jaredpalmer/kev-4b-20260924`, 8,192 input tokens, at a higher priority than its self-hosted row, priced at $0.042 per million input tokens and $0 output | metadata that did not sync, a wrong driver, APIName, limit or price, or a self-hosted route preferred over OpenRouter |
| `systemone-kev.KV2` | ClassFactory builds the driver | `CreateInstance(BaseDecision, 'SystemOneDecision', '{"apiKey":…,"endpoint":…}')` returns the shipped class, whose endpoint is the credential's with `/v1/systemone` appended | the package not registering its class, or a JSON credential not read |
| `systemone-kev.KV3` | A runner call per route | `ExecuteDecision` with `override` naming Kev-4B, then Kev-27B, on System One Endpoint succeeds with `SystemOneDecision`; the server gets one `POST /v1/systemone` each, with `Bearer <token>` for Kev-4B and no `Authorization` header for Kev-27B's empty token, and body `{ model: 'kev-latest', state, questions }`; the answers come back mapped (Score keyed by level name and renormalised from 1.0001); the prompt-run row names the model, the vendor and Default Decision, succeeded, has the served input tokens and no cost | a broken endpoint, path, token or body; a JSON credential sent as the bearer token; the run recorded against the wrong model or vendor |
| `systemone-kev.KV4` | Default Decision's selection is unchanged | the candidates are Jev / OpenRouter, then LLM Decision / MemberJunction (both bound), then the power-matched fallbacks; every Clef and Kev candidate is a fallback behind both, and the list without them is Jev, LLM Decision and the fallbacks of the other active Decision models; no Cloudflare or System One candidate has a credential; a real run (scripted driver) selects the first of Jev and LLM Decision with a credential, and its selection info lists the same candidates; with a System One credential bound to Kev-27B's row the order is the same, Kev-27B has a credential and is still behind both, and the run still selects the same model; Default Decision's `FailoverStrategy` is `SameModelDifferentVendor`, and with `OpenRouterDecision`, `LLMDecision`, `CloudflareDecision` and `PerplexityDecision` replaced by a driver that fails with a `ServiceUnavailable` error, the run logs a failed attempt for each credentialed candidate ahead of Kev-27B (LLM Decision among them) and Kev-27B answers | a new Decision model jumping ahead of the bound candidates, or being selected over them once credentialed; the failover the READMEs describe (from model to model under `SameModelDifferentVendor`) no longer happening |
| `systemone-kev.KV5` | The credential fix, end to end | a real `API Key with Endpoint` credential is stored encrypted (the raw `Values` has the key's marker and no token or endpoint in clear); bound to Kev-9B's System One row, an override run with no `apiKeys` sends one `POST /v1/systemone` to its endpoint with `Bearer <token>`, not the JSON, and the System One body; the answers map; the row names Kev-9B and the vendor | the credential's JSON sent as the bearer, its endpoint not read, or a binding not resolved |
| `systemone-kev.KV6` | Per-row routing | credentials bound to the Kev-4B and Kev-27B rows, pointing at two servers with two tokens: each model's run reaches its own server with its own token, and the other server gets nothing | a credential resolved per vendor instead of per row, sending every Kev size to one server |
| `systemone-kev.KV7` | Failover past misconfigured candidates | on a test prompt bound to Kev-9B (a token with no endpoint), Clef (a real credential with a token and no account ID) and Kev-27B (a bound working server): the runner logs two failed attempts, Kev-9B's `NoCredentials` error naming `SYSTEMONE_BASE_URL` and Clef's naming `CLOUDFLARE_ACCOUNT_ID`, both allowing failover, and Clef sends no request; Kev-27B answers with its token; the row succeeded | a driver configuration error that stops the failover loop (the pre-`3ce5c4e49d` `Fatal`), or one that does not say what is missing |
| `systemone-kev.KV8` | Error classification through the runner | on a test prompt bound to Kev-9B (a scripted failing server), Kev-27B (a working server) and Kev-4B on OpenRouter, with `MaxRetries` 1: a 503 is logged as `ServiceUnavailable` and fails over to Kev-27B; a 429 is logged as `RateLimit`, retried once with a 30-second suggested backoff, then fails over to Kev-27B; a 401 is logged as `Authentication`, stops the loop (Kev-27B and OpenRouter get nothing), and the run fails naming HTTP 401 | a lost HTTP status, a 429 not retried, or a 401 that fails over |
| `systemone-kev.KV9` | Kev-4B on OpenRouter | an override naming Kev-4B and OpenRouter succeeds with `OpenRouterDecision`; one request to `https://openrouter.ai/api/alpha/decisions` with `Bearer <token>` and body `{ model: 'jaredpalmer/kev-4b-20260924', state, questions }`; the answers map, the resolved model is the dated Kev-4B; the row names Kev-4B and OpenRouter with the served input tokens and OpenRouter's reported cost (to the column's 8 places) | the row's APIName not sent, Jev asked instead, or the run recorded against the wrong vendor |
| `systemone-kev.KV10` | A binding on the serving row of a two-row model | a throwaway Active Decision model with a Model Developer row and an Inference Provider row (`SystemOneDecision`, `kev-latest`) on System One Endpoint, saved Developer first under keys that sort it first on SQL Server (whose `uniqueidentifier` order compares the last six bytes first) and on PostgreSQL or a string sort (first four bytes first); precondition: `AIEngine.ModelVendorsByModelID` holds the Developer row first, both Active, before and after the binding (the engine loads the rows with no ORDER BY, which on SQL Server returns them in clustered-key order), and the override's one candidate has no credential until a real `API Key with Endpoint` credential is bound to the Inference Provider row only; then the candidate has a credential, the run's selection info lists it as available, the server gets one `POST /v1/systemone` with `Bearer <token>` and the System One body, the answers map, and the row names the model and the vendor | a binding found only on the first Active row of the pair, which for a model with both a Model Developer and an Inference Provider row on one vendor depends on the rows' keys: the candidate counted as having no credential and was skipped, or ran with none |

---

## 14. `perplexity-decider` (PX1–PX5) — Perplexity's Decider, through an HTTP stand-in

**Machinery under test.** The `Perplexity Decider v1 27B` model (`metadata/ai-models/.perplexity-decider-models.json`), the `Perplexity` vendor, the `PerplexityDecision` driver (`@memberjunction/ai-systemone`) and the System One mapping it inherits from `BaseSystemOneDecision`, from the synced metadata through `AIDecisionRunner` to the Decisions API request (`POST https://api.perplexity.ai/v1/decisions`): Perplexity's own quickstart request and response, a bound credential's token, and what `Default Decision` does with the new model.

**No network, real everything else.** For the whole bundle `PerplexityDecision` is replaced by `ScriptedPerplexityDecision`, a subclass that overrides only `SendRequest` (the driver's one network call): it records each request, answers with the quickstart's response, verbatim, only while a check arms it, and otherwise refuses with a `503` in Perplexity's error shape, so no check can reach api.perplexity.ai. PX5's selection legs register the shared `ScriptedDecision` over every decision driver class, as IT97 and IT100 do, and its failover leg registers `UnavailableDecision` (`src/checks/decision-fixtures.ts`) over every decision driver but Perplexity's. The prompt, model and vendor rows, candidate selection, credential resolution (a legacy `apiKeys` entry in PX3, a bound `MJ: Credentials` row in PX4 and PX5), the URL, header and body building, the answer mapping, `BaseDecision`'s validation, the failover loop and the `MJ: AI Prompt Runs` rows are all real.

**Transport.** Server-only by necessity: the stand-in is a ClassFactory registration in the test process.

**Fixtures / lifecycle.** The model is shipped metadata, read only. PX4 and PX5 create a real `API Key` credential through `CredentialEngine.StoreCredential` (stored encrypted; the fixture supplies a throwaway `Base Encryption Key` for its own length when its environment variable is unset, as in CI) and an `MJ: AI Credential Bindings` row on the Decider's Perplexity model-vendor row. Every check deletes its prompt runs, bindings, the credentials' audit-log rows and credentials in a `finally`, children first; Teardown deletes anything a failed check left, then restores `PerplexityDecision`.

**The binding fix.** PX4 and PX5 bind to the Decider's Inference Provider row, and the Decider also has a Model Developer row on the same vendor. `BaseModelRunner` looked for a `ModelVendor` binding on the *first* Active row of the model and vendor, and the engine holds rows in key order, so for this model it read the Model Developer row and missed the binding. It now checks every Active row of the pair, Inference Provider rows first (`BaseModelRunner.credentialBindings.test.ts`). Clef has the same two rows, and CF6 passed before only because SQL Server's `uniqueidentifier` order happens to put Clef's Inference Provider row first.

**Tier.** All 5 deterministic, ungated. Break-it checks, each run against the built suite and then reversed byte for byte:

| Break | Fails |
|---|---|
| a changed `MaxQuestionsPerCall` (64) pushed for the model | PX1 ("MaxQuestionsPerCall — expected 128, got 64") |
| `@RegisterClass` removed from `PerplexityDecision` | PX2 ("nothing was registered for 'PerplexityDecision' before the bundle's guard") |
| the key sent as `x-api-key` instead of a bearer | PX3, PX4 and PX5 ("Authorization header — expected Bearer …, got null") |
| `BaseSystemOneDecision` reads Score probabilities by level name instead of index | PX3, PX4 and PX5 ("Question 'severity': the Score probabilities sum to 0") |
| `ParseSystemOneCredential` keeps the raw JSON as the API key | PX4 ("the bearer is the credential's JSON, not its token"), PX5 on the header |
| `BaseModelRunner` reads only the first Active model-vendor row for a binding (the pre-fix behaviour) | PX4 ("No Decision model has credentials available"), PX5 ("the Decider has no credential after its row was bound") |
| power-matched fallbacks put ahead of the bound candidates | PX5 ("first candidate — expected Jev / OpenRouter / OpenRouterDecision, got Kev-0.8B / …") |
| `AIDecisionRunner` runs only the selected candidate under `SameModelDifferentVendor` | PX5 ("PX5 failover: the decision failed: The integration-test decision stand-in is unavailable") |

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `perplexity-decider.PX1` | Catalog rows | the model Active, type `Decision`, `PowerRank` 59, effective `Decision` limits 128 / 255 / 10 / 262,144; one Perplexity Model Developer row and one Active Inference Provider row naming `PerplexityDecision` and `pplx-decider-v1-27b`, 262,144 input tokens, no streaming; an active Realtime cost row at $0.04 per million input tokens, $0 output; the vendor's credential type is `API Key` | metadata that did not sync, a wrong driver class or APIName, wrong limits or price |
| `perplexity-decider.PX2` | ClassFactory builds the driver | with the class the package registered back on top for the call, `CreateInstance(BaseDecision, 'PerplexityDecision', key)` returns the shipped class, whose endpoint is `https://api.perplexity.ai/v1/decisions`; the guard is back on top after | the package not registering its class |
| `perplexity-decider.PX3` | A runner call | `ExecuteDecision` with `override` naming the Decider and Perplexity succeeds with `PerplexityDecision`; one request to the endpoint with `Bearer <key>` and Perplexity's quickstart body, verbatim (a review object as the state; a `noul`, a `choice` and a `score` question); the quickstart's response comes back mapped (Score read by level index and keyed by level name); the prompt-run row names the Decider, Perplexity and Default Decision, succeeded, has 367 input tokens and a cost priced from the cost row | a broken wire mapping, URL or key handling; the run recorded against the wrong model or vendor; a missing cost row |
| `perplexity-decider.PX4` | A bound credential's token | with no `apiKeys`, a real `API Key` credential bound to the Decider's Perplexity row sends one request with `Bearer <token>`, not the credential's JSON, and the answers map | the credential's JSON sent as the token, or a binding on the Inference Provider row not found |
| `perplexity-decider.PX5` | Default Decision's selection is unchanged | the candidates are Jev / OpenRouter, then LLM Decision / MemberJunction (both bound), then the power-matched fallbacks with the Decider among them; a real run (scripted driver) selects the first of Jev and LLM Decision with a credential; with a Perplexity credential bound to the Decider's row the order is the same, the Decider has a credential and is still behind both, and the run still selects the same model and sees the Decider as available; no request reached the Decisions API; with every other decision driver replaced by one that fails with a `ServiceUnavailable` error, the run logs a failed attempt for each credentialed candidate ahead of the Decider (LLM Decision among them), and the Decider answers through `PerplexityDecision` with the bound token | the new model jumping ahead of the bound candidates, being selected over them once credentialed, or being unreachable as a fallback |

---

## Adjacent, deliberately NOT in the registered catalog: the agent-memory rig

`rigs/agent-memory-tests.ts` is the **live-model, client-first precedent** the extended-agents family generalizes: it drives real Sage runs over the GraphQL wire (`GraphQLAIClient.RunAIAgent` → live MJAPI) and asserts **only deterministic process-level transitions** — its own header: *"The SPECIFIC memories are nondeterministic (LLM), so every assertion is at the PROCESS level."* Phase A: memory-triggering convos → ≥1 `MJ: AI Agent Notes` row `Provisional`/`AuthorType='Agent'` (marker-string isolated); Phase B: Memory Manager hardens it to `Active` with `ExpiresAt` cleared; Phase C: re-run proves injection (`AccessCount` bump / memoryAttribution). Robust to "the LLM may not emit a write this run" by running a few convos and asserting ≥1; self-cleaning in `finally`. It honors the inverted gate directly (`RUN_AGENT_TESTS === '0'` → exit 3, `rigs/agent-memory-tests.ts:72-75`). It is a **rig, not a bundle** — no IT record, no suite membership, invoked as `npx tsx packages/TestingFramework/integration-test-suite/rigs/agent-memory-tests.ts`; graduating it into a registered `agent-memory-guards` bundle (MG1–MG5) is part of the proposal below.

---

## Consolidated gaps and housekeeping (with bug-register IDs)

Cross-reference: [bug-register.md](../../../../plans/integration-test-expansion/bug-register.md).

| Item | Bug ID | Status in this family |
|---|---|---|
| ConversationDetail concurrent-Sequence deadlock | **B48** | **Fixed and regression-guarded**: found by CC12 (red reproducing the deadlock live), fixed by the `sp_getapplock` + `READPAST` migration, green 3 consecutive runs post-fix. |
| `ExecuteAgentResult.agentRun` typed required but runtime-undefined on the earliest cancel exit | **B59** | Open. ALS3 **guards** (fails loudly if a run was persisted; tolerates the undefined) — the typing defect awaits a code fix. |
| Model costing silently inert in dev (no cost seeds; unresolvable pricing driver → silently uncosted runs) | **B60** | Open. AC1/AC3/AC5 pin driver resolution and report uncovered models; AC3–AC6 skip-as-pass **loudly** on costless deployments. Seeding is the open product action. |
| `AIAgentPermissionHelper` lacks the exported pure core + null-guard its skill sibling has | **B61** | Open. APM2 pins the row-matching semantics **via the skill core** (line-for-line parallel implementations); the agent live-grant e2e stays catalog item AI3 (mutation tier). |
| Related-agent upstream payload violations not attached to step OutputData (asymmetric observability vs. child sub-agents) | **B62** | Open, **zero coverage in this family** — ALS5 covers only the pure fence. Pinned post-approval by the proposed `agent-payload-guards` PG checks. |
| PR1 header claims RUN_AGENT_TESTS gating but the check does not set `RequiresLiveModel` (AR1 does) | (proposal section 2 housekeeping item) | **Verified still true.** Extends to `concurrent` CC1/CC2 and `remote-op-ai-authoring` RO4-1–3. Gating currently holds only via the IT records' `tier: 'live-model'` whole-test gate; add the per-check flags when the agents-extended family lands. |
| IT16/IT17/IT18/IT19 descriptions say "Skips-as-pass when RUN_AGENT_TESTS is unset" | — | **Stale post the 2026-07-20 gate inversion** (the tier is now ON by default; only an explicit `RUN_AGENT_TESTS=0` disables). The driver behavior is correct (it routes through `IsTierEnabled`); the record prose lags. |
| `concurrent.CC*` vs `conversation-compaction.CC*` bare-name collision | — | Cosmetic; full check Ids are unique. Use bundle-prefixed Ids everywhere. |
| Bug register carries two distinct entries both labeled **B49** (the GraphQLTransactionGroup rollback-success fix and the `statusUpdates` session-hijack finding) | — | Register bookkeeping inconsistency noted while cross-referencing; neither entry belongs to this family's checks. |

Coverage boundaries stated honestly: no check in this family ever *fires* a real compaction pass, *receives* a carried-forward replay in a prompt, emits a real `Skill`/`Plan` step from a live loop, or exercises `PayloadManager` guard enforcement inside a real run — those are exactly the seams the extended family targets.

---

## What comes next for this family

The extended live-model agents family — ten proposed bundles (~65 checks: `agent-loop-live`, `shipped-agents-live`, `agent-carry-forward`, `agent-payload-guards`, `agent-artifact-tools`, `agent-skills-live`, `agent-plan-mode`, `agent-compaction-e2e`, `agent-memory-guards`, `agent-rag-search`), built on purpose-built metadata-seeded test agents over REAL drivers and models with structural-determinism assertions (fabricate-then-observe, two-phase compliance/assertion, the `AIPromptRun.Messages` observable) — is proposed in [plans/integration-test-expansion/agents-extended-suite-proposal.md](../../../../plans/integration-test-expansion/agents-extended-suite-proposal.md). When built, its documentation will move into this `docs/` folder as `agents-suite.md`.

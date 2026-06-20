# Per-Capability AI Vendor-Sufficiency — `ModelResolver` Extraction + Bypass-Site Retrofit

**Status:** Plan / spec (no code in this PR)
**Supersedes:** issue #2612 (and the closed draft PR #2471 / branch `audit/model-vendor-fallback`)
**Scope:** strictly backwards-compatible refactor + resilience retrofit. No public API signatures change.

---

## 0. The guarantee this delivers

> **For every AI capability MemberJunction uses (LLM, Embeddings, Reranker, Image Generation — and,
> vacuously, TTS/STT/Video), if a deployment has at least one configured vendor that supports that
> capability *and has a resolvable credential*, the corresponding feature works.**

The guarantee is **per-capability, not per-vendor**. A vendor that simply doesn't sell a capability
(Anthropic for image generation) is an accepted gap. What is *not* acceptable — and what MJ does in
several places today — is requiring a **specific** vendor when other configured, credentialed vendors
offer the same capability.

### The operator-visible symptom

> *"I configured a vendor key that is fully capable of this task, but MJ still complains and behaves as
> if I must supply a different, specific vendor's key."*

This is a real defect in the current tree, not a misconfiguration. It is **narrow** — the primary prompt
path already does the right thing — but it is **real** in ~9 bypass sites, three of which fail even when
a capable, credentialed alternative is configured.

---

## 1. Current-state audit (verified against `next`, not the stale closed branch)

### 1.1 The primary path is already correct ✅

`AIPromptRunner.ExecutePrompt` is the gold-standard implementation we want everywhere:

- **Candidate building** — `buildModelVendorCandidates` (`packages/AI/Prompts/src/AIPromptRunner.ts`
  ~1787-2470) expands a prompt into an ordered list of `(model, vendor, driverClass)` candidates.
- **Credential-aware selection** — `selectModelWithAPIKeyTracked` (~2506-2678) **filters candidates by
  whether a credential is actually resolvable before selecting one.** Candidates with no resolvable
  credential are marked `available: false` and skipped. This is exactly the sufficiency behavior we want.
- **Cross-vendor failover** — `executeModelWithFailover` (~3019-3175) iterates candidates; on a retriable
  failure (auth / vendor-validation / rate-limit / network, gated by `errorScope`) it advances to the next
  candidate — including **the same model via a different vendor**. Vendor-wide filtering on auth failure is
  at ~3312-3318 (`filterVendorCandidates`).
- **Credential hierarchy** — `resolveCredentialForExecution` (~346-413) resolves a credential through a
  6-level hierarchy: per-request `credentialId` → `AICredentialBinding` (`PromptModel` → `ModelVendor` →
  `Vendor`) → vendor type-default credential → legacy `GetAIAPIKey` env var. `tryCredentialBindingsWithFailover`
  (~419-450) walks bindings by `Priority` and skips inactive/expired ones.

**Conclusion:** the logic to make the guarantee true *already exists* — it is just trapped inside
`AIPromptRunner` and not reused by anyone else.

### 1.2 The bypass sites ❌

Nine production paths bypass §1.1 and pin to a single vendor. They fall into three tiers by severity.

#### Tier (i) — select-blind-then-fail *(the operator's exact symptom; highest severity)*

These pick the **highest-priority vendor without checking credential presence**, then hard-fail at
execution — even when a lower-priority but capable-and-credentialed vendor is configured.

| Site | Location | Behavior |
|---|---|---|
| `ExecutionPlanner.selectVendorForModel` | `packages/AI/Prompts/src/ExecutionPlanner.ts:595-622` | Filters `Status='Active'` + `IsInferenceProvider()`, sorts by `Priority` desc, returns `[0]`. **No credential check.** |
| `VectorSearchProvider` (embeddings) | `packages/SearchEngine/src/generic/VectorSearchProvider.ts:199-215` | `GetAIAPIKey(model.DriverClass)` on the single model driver; instantiates `BaseEmbeddings` directly. No vendor loop. |
| `GenerateImageAction.prepareImageGenerator` | `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts:263-274` | `model.ModelVendors.find(first active)`; `GetAIAPIKey(driverClass)`; `BaseImageGenerator`. No failover. |

#### Tier (ii) — hardcoded vendor *(not even priority-driven)*

| Site | Location | Behavior |
|---|---|---|
| Templates `{% AIPrompt %}` extension | `packages/Templates/engine/src/extensions/AIPrompt.extension.ts:115-134` | If no model named, **`GetHighestPowerModel('Groq', …)` — Groq hardcoded.** No failover. |
| `SearchEngine.runReRanker` | `packages/SearchEngine/src/generic/SearchEngine.ts:940-943` | Instantiates `BaseReRanker` from a scope-fixed `cfg.driverClass`. **Latent inverted-priority bug** when a reranker model has multiple vendors (selection ordering is wrong). |

#### Tier (iii) — key-aware but no retry-on-failure *(won't demand a specific key, but isn't resilient)*

| Site | Location | Behavior |
|---|---|---|
| `AIModelRunner.findBestVendor` | `packages/AI/Prompts/src/AIModelRunner.ts:257-270` | Loops vendors, returns the **first with a resolvable key** — good — but no retry if that vendor *executes* and fails. |
| `ParallelExecutionCoordinator` per-task | `packages/AI/Prompts/src/ParallelExecutionCoordinator.ts:571-580` | Each task is pre-assigned one `vendorDriverClass`; no cross-vendor retry on execution failure. |
| Realtime `selectRealtimeVendor` (×2) | `packages/AI/Agents/src/base-agent.ts:1781-1792`, `packages/AI/Agents/src/realtime/realtime-client-session-service.ts:1224-1235` | Key-gated loop (skips keyless vendors) — good — but no retry on execution failure. |

#### Server entrypoints (route last)

`RunAIPromptResolver.ExecuteSimplePrompt` (`packages/MJServer/src/resolvers/RunAIPromptResolver.ts`
~401-463) and its `EmbedText` mutation (~729-745) each select a single model+driver and call it directly.

#### Not a bypass

No client/React runtime makes direct LLM calls — they route through the GraphQL mutations above, so fixing
the server resolvers covers the client.

### 1.3 `ModelResolver` does not exist on `next`

Confirmed by `git ls-tree -r origin/next | grep ModelResolver` → empty. The 2.4k-line prototype referenced
in #2612 lived only on the closed `audit/model-vendor-fallback` branch. A `feat/ai-model-resolver-phase1`
worktree exists locally but is not merged. This plan re-scopes the work as the phased rollout #2612 itself
recommended, rather than reviving a 4k-line single PR.

---

## 2. The hard constraint that must be preserved

`MJAIPromptEntity.FailoverStrategy` is a **deliberate hard-fail escape hatch**, not an oversight. The
Skip-style scenario: a configuration enumerates curated, acceptable-quality models in `MJ: AI Prompt Models`;
if none are available we want a **loud error so the configuration gets fixed**, NOT a silent fallback to
"whatever has credentials."

- Strategy values (canonical set): `None`, `SameModelDifferentVendor`, `NextBestModel`, `PowerRank`.
- `None` ⇒ execute **only** the first candidate, no failover loop (today: short-circuit at
  `AIPromptRunner.ts:3039`, reinforced in `shouldAttemptFailover`).
- The new default behavior ("use any capable, credentialed vendor") is the *default*, **not** an override.
  `ModelResolver.withFailover` must honor `strategy: 'None'` verbatim — run `candidates[0]` only and rethrow.

There is also a housekeeping defect: the `CK_AIPrompt_FailoverStrategy` CHECK constraint has duplicated enum
values (visible in the generated type as `'NextBestModel' | 'NextBestModel' | 'None' | 'None' | …`).
Original constraint: `migrations/v2/V202507010540__v2.62.x__Failover_Prompt_Strategy.sql`.

---

## 3. The fix: extract → reuse → retrofit

### 3.1 Package home — `@memberjunction/aiengine` (resolved with a dependency proof)

`ModelResolver` belongs in **`@memberjunction/aiengine`** (`packages/AI/Engine/`), **not** `ai-prompts`.

Dependency facts (from `package.json` inspection):

- `aiengine` is the **lowest common ancestor** of all four bypass packages — `ai-prompts`, `search-engine`,
  `templates`, and `core-actions` already depend on it. It owns `AIEngine.Instance` (the `Models` /
  `ModelVendors` metadata cache), the credential-binding helpers (`GetCredentialBindingsForTarget`,
  `HasCredentialBindings`), and `IsInferenceProvider`.
- `ai-prompts` is the **wrong** home: `search-engine` and `templates` would have to take a heavy new
  dependency, and `ai-prompts` already depends on `templates`/`credentials`, risking a cycle.
- `@memberjunction/credentials` (`packages/Credentials/Engine`) depends only on `core`, `global`,
  `core-entities` — **not** on `aiengine`. Therefore `aiengine` can add `@memberjunction/credentials` to
  its dependencies with **no cycle**, letting the resolver call `CredentialEngine.Instance` directly (as
  `AIPromptRunner` does today).

No new package needs to be created.

### 3.2 The `ModelResolver` API (capability-generic, credential-aware, execution-agnostic)

Lives in `packages/AI/Engine/src/ModelResolver.ts`. It **never imports** `BaseLLM` / `BaseEmbeddings` /
`BaseReRanker` / `BaseImageGenerator` — the caller supplies the execute callback. This keeps the resolver at
the metadata layer and lets every capability reuse the same selection + failover machinery.

```ts
export type AICapability = 'LLM' | 'Embeddings' | 'Reranker' | 'Image';

/** A (model, vendor, driver) triple with priority + the source that produced it. */
export interface ResolvedModelCandidate {
  model: MJAIModelEntityExtended;
  vendorId?: string;
  vendorName?: string;
  driverClass: string;
  apiName?: string;
  priority: number;                       // higher = better; mirrors AIModelVendor.Priority
  source: 'explicit' | 'model-vendor' | 'power-rank' | 'fallback';
}

export interface ResolveOptions {
  capability: AICapability;
  modelId?: string;                       // pin to one model (still multi-vendor)
  modelName?: string;                     // resolve by Name/APIName (Templates / Image cases)
  vendorName?: string;                    // a *preferred* (not pinned) vendor hint, e.g. legacy 'Groq'
  preferredVendorId?: string;
  configurationId?: string;
  requireInferenceProvider?: boolean;     // default true
  contextUser?: UserInfo;
  apiKeys?: { driverClass: string; apiKey: string }[];   // legacy passthrough for GetAIAPIKey
  credentialId?: string;                  // per-request override (no failover, mirrors Priority-1 today)
  verbose?: boolean;
}

export interface ResolveResult {
  candidates: ResolvedModelCandidate[];   // credential-FILTERED, priority-ordered
  consideredModels: ConsideredModel[];    // full telemetry (available + unavailableReason)
}

/** Generic failover knobs — decoupled from the AIPrompt entity columns. */
export interface FailoverOptions {
  strategy: 'None' | 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank';
  maxAttempts?: number;
  delaySeconds?: number;
  errorScope?: 'All' | 'NetworkOnly' | 'RateLimitOnly' | 'ServiceErrorOnly';
}

export class ModelResolver {
  /**
   * Build the credential-FILTERED, priority-ordered candidate list for a capability.
   * Every returned candidate is GUARANTEED to have a resolvable credential — this is the single
   * place the per-capability sufficiency guarantee is enforced.
   */
  async resolveCandidates(opts: ResolveOptions): Promise<ResolveResult>;

  /** Resolve the API key/config string for ONE candidate (lifted resolveCredentialForExecution). */
  async resolveCredential(candidate: ResolvedModelCandidate, opts: ResolveOptions): Promise<string>;

  /**
   * Generic cross-vendor failover loop for ANY capability. Runs executeFn against each candidate
   * in order; on a retriable failure (per errorScope + ErrorAnalyzer) advances to the next.
   * strategy==='None' executes ONLY candidates[0] with no failover (preserves the escape hatch verbatim).
   *
   * executeFn receives the candidate AND its resolved credential, so callers just instantiate their
   * driver and run. TResult is the caller's native result type (ChatResult / embedding vector /
   * rerank list / image bytes).
   */
  async withFailover<TResult>(
    candidates: ResolvedModelCandidate[],
    failover: FailoverOptions,
    executeFn: (candidate: ResolvedModelCandidate, apiKey: string, attempt: number) => Promise<TResult>,
    options?: {
      // For drivers that return {success:false} instead of throwing (reproduces the AIPromptRunner:3093 fix):
      isRetriable?: (result: TResult) => { retriable: boolean; error?: Error };
      onAttemptFailed?: (info: FailoverAttemptInfo) => void;  // telemetry hook; AIPromptRun persistence stays in the runner
      contextUser?: UserInfo;
    }
  ): Promise<TResult>;
}
```

Design notes:

- **`withFailover` is generic over `TResult`** so embeddings / rerank / image reuse the exact retry
  control-flow LLM uses. The `isRetriable` hook reproduces the critical case where a driver returns
  `{ success: false, errorInfo: { canFailover: true } }` rather than throwing.
- **`onAttemptFailed`** keeps `AIPromptRun` persistence (`updatePromptRunWithFailoverSuccess/Failure`)
  inside `AIPromptRunner` — the resolver stays storage-agnostic and reusable by non-prompt callers.
- **The sufficiency guarantee lives in `resolveCandidates`**, once: it returns only candidates with a
  resolvable credential, in priority order, and `withFailover` walks the whole list.

---

## 4. Phasing

### Phase 1 — Extract (additive, **zero behavior change**)

Create `ModelResolver` in `aiengine` and have `AIPromptRunner` delegate to it. The seam is clean because
the selection/credential/failover code in `AIPromptRunner` touches only `AIEngine.Instance`,
`CredentialEngine.Instance`, `GetAIAPIKey`, and `ErrorAnalyzer` — all available in `aiengine`.

Lift (move, not rewrite):

- `resolveCredentialForExecution` + `tryCredentialBindingsWithFailover` + `findDefaultCredentialByType`
  → `ModelResolver.resolveCredential`.
- `hasCredentialsAvailable` → private credential filter used by `resolveCandidates`.
- `selectModelWithAPIKeyTracked` credential-probing loop (incl. `forceFullModelEvaluation`,
  `consideredModels` telemetry) → `resolveCandidates`.
- `executeModelWithFailover` retry control-flow (+ `processFailoverError`, `getFailoverConfiguration`,
  `shouldAttemptFailover`, `selectFailoverCandidates`, `transitionToNextCandidate`,
  `calculateFailoverDelay`) → `ModelResolver.withFailover`.

`AIPromptRunner` keeps its **prompt-aware** candidate *building* (`buildModelVendorCandidates`) and becomes
a thin orchestrator: build candidates → map `FailoverConfiguration` → `FailoverOptions` → delegate to
`ModelResolver.withFailover` with `executeModel` as `executeFn` and
`isRetriable: r => ({ retriable: !r.success && !!r.errorInfo?.canFailover, error: r.exception })`.

Package wiring: add `@memberjunction/credentials` to `packages/AI/Engine/package.json`; export
`ModelResolver` + types from `packages/AI/Engine/src/index.ts`.

**Ship as its own PR. No bypass site touched.**

### Phase 1.5 — `FailoverStrategy` CHECK-constraint dedupe migration

A new forward migration under the highest `migrations/v*/` folder that drops + re-adds
`CK_AIPrompt_FailoverStrategy` to the canonical set `('SameModelDifferentVendor','NextBestModel',
'PowerRank','None')`. **`None` must remain.** Reconcile the default-value drift first: the original
migration default is `SameModelDifferentVendor`, while `getFailoverConfiguration` falls back to `None` —
decide and document the intended default before re-issuing the constraint so this migration does not
silently flip behavior. Isolated and reversible; no code coupling.

### Phases 2–5 — Retrofit, ordered payoff-over-risk

| Phase | Tier | Sites | Why this order |
|---|---|---|---|
| **2** | (iii) | `AIModelRunner.findBestVendor`, `ParallelExecutionCoordinator`, both realtime `selectRealtimeVendor` | Lowest blast radius — already key-aware; behavior only *improves* on failure. |
| **3** | (i) | `ExecutionPlanner.selectVendorForModel`, `VectorSearchProvider`, `generate-image.action` | **Fixes the real bug.** Switching to credential-filtered `resolveCandidates` makes the operator's symptom impossible. Highest payoff. |
| **4** | (ii) | `AIPrompt.extension` (Groq hardcode → `vendorName:'Groq'` *preferred*), `SearchEngine.runReRanker` (+ fix inverted-priority bug) | Templates is `.then()`-shaped — keep resolver calls inside the async block. |
| **5** | server | `RunAIPromptResolver.ExecuteSimplePrompt` / `EmbedText` | Server entrypoints last, after the library layer is proven. Covers the client too (clients route through GraphQL). |

Each retrofit replaces a "pick one vendor" block with `resolveCandidates(...)` + `withFailover(...)`,
using the caller's existing driver-instantiation code inside `executeFn`.

---

## 5. File-by-file change list

| Phase | File | Change |
|---|---|---|
| 1 | `packages/AI/Engine/src/ModelResolver.ts` *(new)* | The resolver |
| 1 | `packages/AI/Engine/src/index.ts` | Export `ModelResolver` + types |
| 1 | `packages/AI/Engine/package.json` | Add `@memberjunction/credentials` dependency |
| 1 | `packages/AI/Prompts/src/AIPromptRunner.ts` | Delegate selection / credential / failover to the resolver |
| 1.5 | `migrations/v*/V<ts>__v5.x__Failover_Strategy_Dedupe.sql` *(new)* | Re-issue `CK_AIPrompt_FailoverStrategy` canonically; keep `None` |
| 2 | `packages/AI/Prompts/src/AIModelRunner.ts` | `findBestVendor` → resolver + `withFailover` |
| 2 | `packages/AI/Prompts/src/ParallelExecutionCoordinator.ts` | Per-task vendor → resolver + retry |
| 2 | `packages/AI/Agents/src/base-agent.ts` | `selectRealtimeVendor` → resolver + retry |
| 2 | `packages/AI/Agents/src/realtime/realtime-client-session-service.ts` | Same realtime retrofit |
| 3 | `packages/AI/Prompts/src/ExecutionPlanner.ts` | `selectVendorForModel` → credential-filtered resolver |
| 3 | `packages/SearchEngine/src/generic/VectorSearchProvider.ts` | Embeddings → resolver + `withFailover` |
| 3 | `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` | Image → resolver + `withFailover` |
| 4 | `packages/Templates/engine/src/extensions/AIPrompt.extension.ts` | Drop Groq hardcode; `vendorName:'Groq'` preferred |
| 4 | `packages/SearchEngine/src/generic/SearchEngine.ts` | `runReRanker` → resolver + retry; fix inverted-priority |
| 5 | `packages/MJServer/src/resolvers/RunAIPromptResolver.ts` | `ExecuteSimplePrompt` / `EmbedText` → resolver |

---

## 6. Verification

- **Phase 1 proves no behavior change:** the existing suites must pass **unchanged** (only import paths may
  shift) —
  `packages/AI/Prompts/src/__tests__/AIPromptRunner.failover.test.ts`,
  `.model-selection.test.ts`, `.credential-errors.test.ts`, `.power-match-fallback.test.ts`.
  Add `packages/AI/Engine/src/__tests__/ModelResolver.test.ts` mirroring the existing failover mock harness,
  driving `withFailover<TResult>` generically.
- **`None` escape-hatch regression (mandatory):** a test asserting `withFailover(c, { strategy: 'None' }, fn)`
  invokes `fn` **exactly once** (candidates[0] only) and rethrows on failure with no second attempt; plus a
  post-1.5 check that `None` remains in the CHECK constraint.
- **Per-capability sufficiency smoke (the acceptance criterion):** with the highest-priority vendor's key
  *absent* but a secondary vendor's key *present*, assert that (a) an Embeddings call via
  `VectorSearchProvider`, (b) an Image call via `generate-image.action`, and (c) a Reranker call via
  `runReRanker` each **succeed on the secondary** — and that (c) selects the correct highest-priority
  *available* vendor (regression for the inverted-priority bug). Stub `GetAIAPIKey` per `driverClass` to run
  credential-free.
- **Per retrofit:** one test that `resolveCandidates` returns only credentialed candidates in priority order,
  and one that failover advances past a `{ success:false, canFailover:true }` first candidate.
- **Build the dependency cone:** `npm run build` then `npm run test` in each touched package; build
  `search-engine`, `core-actions`, `templates`, and `MJServer` to confirm the new `aiengine` dependency edge
  introduces no break.

---

## 7. Per-capability ledger (before → after Phase 5)

| Capability | Today | After |
|---|---|---|
| **LLM** | Failover only inside `AIPromptRunner.ExecutePrompt`; bypass sites pin to a vendor | SATISFIED |
| **Embeddings** | Single-vendor at execution everywhere (`VectorSearchProvider`, `AIModelRunner`, vector-sync, dedup, TagEngine, autotag) | SATISFIED |
| **Reranker** | Single-vendor + latent inverted-priority bug | SATISFIED (fixed in Phase 4) |
| **Image** | `Generate Image` action is select-blind, hard-fails on the wrong vendor | SATISFIED (Phase 3 — the load-bearing fix) |
| **TTS / STT / Video** | No runtime consumers exist | VACUOUSLY SATISFIED (optional CI guard rail) |

---

## 8. Rollout

1. Phase 1 (ModelResolver extraction only) as a focused, behavior-neutral PR.
2. Phase 1.5 (constraint dedupe migration) as a standalone PR.
3. Phases 2–5 as separate PRs in the order above; each is independently shippable and independently
   revertible. File a child issue per phase against the tracking item.

All changes are strictly backwards-compatible: `AIPromptRunner`'s signature does not change, every retrofit
preserves the existing happy path and only adds resilience on failure, and `FailoverStrategy='None'` keeps
its hard-fail semantics throughout.

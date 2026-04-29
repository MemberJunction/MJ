# Phase 1 — `ModelResolver` extraction spec

> **Audit source**: [`MODEL_VENDOR_FALLBACK_AUDIT.md`](./MODEL_VENDOR_FALLBACK_AUDIT.md) §5.1–5.5, §6 items 1–8
> **Branch**: `audit/model-vendor-fallback`
> **Worktree**: `.claude/worktrees/model-vendor-audit`
> **Spec author/date**: 2026-04-25

---

## 1. Ticket header

**Title**: `feat(ai-prompts): extract ModelResolver as the public model+vendor selection API`

**Summary**: Lifts the model/vendor candidate-building, credential pre-flight, and cross-vendor failover loop out of the private internals of `AIPromptRunner` into a new public `ModelResolver` class. `AIPromptRunner.ExecutePrompt` continues to behave identically (it now delegates to the new class), so this is a strictly additive change. The new class becomes the single piece of plumbing that Phase 2+ will use to retrofit the 14 hard-gap call sites enumerated in the audit (embeddings, semantic search, GraphQL `ExecuteSimplePrompt`, the Templates `{% AIPrompt %}` extension, DBAutoDoc, ContentAutotagging, the parallel-task per-task branch, etc.) — none of which currently have any cross-vendor failover.

**Estimated effort**: 4–5 engineer-days. Roughly 1 day to extract and re-wire the class with no behavior change, 1.5 days to write a parallel test suite that mirrors the existing `AIPromptRunner.*.test.ts` coverage at the new boundary, 1 day to validate every existing test still passes against the rewired runner, and 0.5–1.5 days slack for the credential-engine seam between `@memberjunction/ai-prompts` and the new home.

**Risk level**: **Medium**. The functional change is mechanical (move methods, no behavior change), but the extracted code is ~1,500 LOC of the most production-critical path in the AI stack — every prompt run goes through it. The risk is regression in subtle areas (priority direction, error-scope filtering, candidate filtering on Auth errors, the rate-limit retry loop, the ContextLengthExceeded fatal short-circuit). Mitigated by keeping the existing `AIPromptRunner.*.test.ts` suite running unchanged against the rewired runner, and by mirroring it at the new boundary.

---

## 2. The new class

### 2.1 Package and file path

**Home**: `packages/AI/Prompts/src/ModelResolver.ts`, exported from `packages/AI/Prompts/src/index.ts` (the existing `@memberjunction/ai-prompts` package).

**Why this home, not `@memberjunction/ai-core-plus` and not a brand-new `@memberjunction/ai-model-resolver`:**

1. The extracted code already depends on `@memberjunction/credentials` (`CredentialEngine`), `@memberjunction/aiengine` (`AIEngine`), `@memberjunction/templates`, and `@memberjunction/ai` (`ErrorAnalyzer`, `BaseLLM`). `@memberjunction/ai-core-plus` deliberately does **not** depend on `@memberjunction/credentials` or `@memberjunction/ai-engine-base` — see [`packages/AI/CorePlus/package.json`](packages/AI/CorePlus/package.json) — and the audit's open question §7 about credential semantics shows that the credential layer is part of the resolver's contract, not optional. Adding those deps to CorePlus would pull a server-only credential vault into a package that's intentionally cross-tier.
2. A standalone `@memberjunction/ai-model-resolver` package was the audit's first sketch (§5.1), but it would be circular: the resolver needs `AIEngine` for its `Models` / `ModelVendors` / `PromptModels` / `Configurations` arrays, and `AIEngine` lives in `@memberjunction/aiengine` which already depends on the prompt stack at runtime via class registrations. Putting the resolver in the same package as `AIPromptRunner` matches the existing dependency direction.
3. `@memberjunction/ai-prompts` is the package every audit gap (G7, G8, G9, G14, G15, G17–G20, G22, etc.) will need to depend on in Phase 2 anyway — they all currently bypass it. Co-locating doesn't add a hop.

The audit (§5.1) parenthetically allows "as a public export of `@memberjunction/ai-prompts`" as the alternative. We're taking that.

### 2.2 Class skeleton

```typescript
// packages/AI/Prompts/src/ModelResolver.ts

import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { ChatResult, AIErrorInfo } from '@memberjunction/ai';
import {
    MJAIModelEntityExtended,
    MJAIPromptEntityExtended
} from '@memberjunction/ai-core-plus';
import {
    MJAIVendorEntity,
    MJCredentialEntity,
    MJAIPromptModelEntity
} from '@memberjunction/core-entities';
import { ApiKeyEntry } from '@memberjunction/ai'; // current legacy carrier

/**
 * Source of a candidate in the priority-ordered list.
 * Mirrors the `source` field on the existing private `ModelVendorCandidate`.
 */
export type ModelResolverCandidateSource =
    | 'explicit'
    | 'prompt-model'
    | 'model-type'
    | 'power-rank'
    | 'power-match-fallback';

/**
 * Failover strategies — string-union that mirrors AIPromptEntity.FailoverStrategy.
 * Re-declared here (not imported from the entity) so the resolver compiles
 * standalone for non-prompt callers (embeddings, rerankers).
 */
export type FailoverStrategy =
    | 'None'
    | 'SameModelDifferentVendor'
    | 'NextBestModel'
    | 'PowerRank';

export type FailoverErrorScope =
    | 'All'
    | 'NetworkOnly'
    | 'RateLimitOnly'
    | 'ServiceErrorOnly';

export type FailoverModelStrategy =
    | 'PreferSameModel'
    | 'PreferDifferentModel'
    | 'RequireSameModel';

/**
 * One model+vendor pair the resolver considered, with everything a caller
 * needs to instantiate a driver against it.
 */
export interface ResolvedModelCandidate {
    model: MJAIModelEntityExtended;
    vendorId?: string;
    vendor?: MJAIVendorEntity;
    vendorName?: string;
    /** DriverClass override on the vendor row, falling back to model.DriverClass. */
    driverClass: string;
    apiName?: string;
    supportsEffortLevel: boolean;
    /** Per-PromptModel effort override, when resolved from a prompt. */
    effortLevel?: number;
    /** True when this matched a caller-supplied preferred vendor. */
    isPreferredVendor: boolean;
    /** Higher = better. Same direction as AIModelVendor.Priority. */
    priority: number;
    source: ModelResolverCandidateSource;
    /**
     * Set by the resolver after the credential pre-flight runs.
     * `false` candidates are excluded from `candidates` but kept in
     * `consideredAll` for diagnostics.
     */
    credentialsAvailable: boolean;
    /** Human-readable reason a candidate was excluded, when available. */
    unavailableReason?: string;
}

/** Inputs to the prompt-free entrypoint. */
export interface ModelResolveRequirements {
    /** Restrict to one AIModelType row by id. */
    modelTypeId?: string;
    /** Convenience: 'LLM' | 'Embeddings' | 'Reranker' | 'Image' | 'Audio' | ... */
    modelTypeName?: string;
    /** Pin to a specific model. Disables cross-model fallback. */
    modelId?: string;
    /** Pin to a specific vendor by id. */
    vendorId?: string;
    /** Pin to a specific vendor by name (case-sensitive, matches `AIVendor.Name`). */
    vendorName?: string;
    /** Power constraints (mirrors AIPromptEntity fields of the same name). */
    minPowerRank?: number;
    powerPreference?: 'Highest' | 'Lowest' | 'Balanced';
    /** Walks the AIConfiguration inheritance chain. */
    configurationId?: string;
    /** When true and a specific model has no creds, do NOT fall through. Default false. */
    requireSpecific?: boolean;
    /** Per-request credential override (id of an MJCredential). */
    credentialId?: string;
    /** Legacy in-memory api-key carrier (still respected via GetAIAPIKey). */
    apiKeys?: ApiKeyEntry[];
}

/** Result of either prompt-aware or requirements-based resolution. */
export interface ResolveModelResult {
    /**
     * Ordered list (highest priority first) of candidates that passed the
     * credential pre-flight. The first item is the one ExecutePrompt would
     * pick today.
     */
    candidates: ResolvedModelCandidate[];
    /** Convenience pointer to candidates[0] or null if none had credentials. */
    primary: ResolvedModelCandidate | null;
    /**
     * Every candidate considered, including those filtered out for missing
     * credentials. Used for diagnostics in AIModelSelectionInfo.
     */
    consideredAll: ResolvedModelCandidate[];
    /** Human-readable narrative of why the primary was (or wasn't) chosen. */
    selectionReason: string;
}

/** Mirrors the existing private FailoverAttempt struct in AIPromptRunner.ts. */
export interface FailoverAttempt {
    attemptNumber: number;
    modelId: string;
    vendorId?: string;
    error: Error;
    errorType: string;
    duration: number;
    timestamp: Date;
}

/** Outcome of a withFailover() run. */
export interface WithFailoverResult<T> {
    result: T;
    /** The candidate that ultimately succeeded. */
    winner: ResolvedModelCandidate;
    attemptsUsed: number;
    failoverAttempts: FailoverAttempt[];
}

/**
 * Per-call options to override what would otherwise come from a prompt entity.
 * Use this from non-prompt code paths (embeddings, rerankers, ad-hoc LLM calls).
 */
export interface WithFailoverOptions {
    failoverStrategy?: FailoverStrategy;
    modelStrategy?: FailoverModelStrategy;
    errorScope?: FailoverErrorScope;
    /** Cap on total candidate attempts. Defaults to candidates.length. */
    maxAttempts?: number;
    /** Base delay in seconds; resolver applies exponential backoff. */
    delaySeconds?: number;
    contextUser?: UserInfo;
}

/**
 * Public, reusable model+vendor resolution and cross-vendor failover service.
 *
 * Three-entry surface:
 *   1. `ResolveForPrompt`        — drive selection from an MJAIPrompt entity
 *      (uses SelectionStrategy / AIPromptModel / config inheritance / power
 *      preferences / RequireSpecificModels exactly like AIPromptRunner does).
 *   2. `ResolveForRequirements`  — drive selection from a flat parameter
 *      object, for callers that don't have a prompt (embeddings, rerankers,
 *      ad-hoc LLM calls in resolvers/extensions).
 *   3. `WithFailover<T>`         — execute an arbitrary async function against
 *      a candidate list with the same error-classification / vendor-filtering
 *      / rate-limit-retry / context-length-aware logic the runner has today.
 *
 * Plus one credential helper (`ResolveCredential`) exposed because the audit
 * (Inconsistency I5) showed every non-runner call site uses only the legacy
 * env var path.
 */
export class ModelResolver extends BaseSingleton<ModelResolver> {
    public static get Instance(): ModelResolver {
        return ModelResolver.getInstance<ModelResolver>();
    }

    protected constructor() {
        super();
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Resolve the candidate list for an MJAIPrompt entity. Honors the prompt's
     * SelectionStrategy ('Default' | 'Specific' | 'ByPower'), AIPromptModel
     * bindings, AIConfiguration inheritance chain, RequireSpecificModels,
     * MinPowerRank, and PowerPreference fields exactly as
     * AIPromptRunner.selectModel does today.
     *
     * Never throws. When no candidate has credentials, returns
     * `{ primary: null, candidates: [], consideredAll: [...everything], selectionReason }`
     * so the caller can surface a structured "no model available" error.
     *
     * Order: candidates are sorted highest-priority first; the first item is
     * what AIPromptRunner.ExecutePrompt would pick.
     *
     * Logs: at most one info-level summary per call ("Selected X via Y, N
     * valid candidates of M total"). Per-candidate verbose logs only when
     * the resolver was invoked with `verbose: true`.
     */
    public async ResolveForPrompt(
        prompt: MJAIPromptEntityExtended,
        overrides?: {
            modelId?: string;
            vendorId?: string;
            credentialId?: string;
            apiKeys?: ApiKeyEntry[];
            verbose?: boolean;
        },
        contextUser?: UserInfo
    ): Promise<ResolveModelResult>;

    /**
     * Resolve the candidate list from a free-form requirements object — for
     * callers that don't have a prompt entity (embeddings, rerankers, the
     * GraphQL ExecuteSimplePrompt mutation, the Templates Nunjucks
     * `{% AIPrompt %}` extension, DBAutoDoc, etc.).
     *
     * Same ordering semantics as ResolveForPrompt. Never throws.
     */
    public async ResolveForRequirements(
        req: ModelResolveRequirements,
        contextUser?: UserInfo
    ): Promise<ResolveModelResult>;

    /**
     * Iterate a candidate list calling `fn` with each, with the runner's
     * full error-classification / failover / rate-limit-retry / vendor
     * filtering / ContextLengthExceeded short-circuit logic.
     *
     * Returns the first successful result. Throws an AggregateError-style
     * Error (with `cause` chain) only when every candidate fails or a Fatal
     * error short-circuits the loop. The thrown error carries `failoverAttempts`
     * for diagnostics.
     *
     * Order is the order of `candidates`. The fn is responsible for actually
     * invoking the provider (e.g. constructing a BaseLLM and calling
     * ChatCompletion). The resolver only manages the loop.
     */
    public async WithFailover<T>(
        candidates: ResolvedModelCandidate[],
        fn: (candidate: ResolvedModelCandidate, attemptIndex: number) => Promise<T>,
        options?: WithFailoverOptions
    ): Promise<WithFailoverResult<T>>;

    /**
     * Resolve credentials for a (driver, prompt?, model?, vendor?) tuple via
     * the 7-tier hierarchy. Returns the resolved JSON-serialized credential
     * blob (matching today's AIPromptRunner.resolveCredentialForExecution
     * return value), or `null` when nothing is available.
     *
     * Hierarchy (in order): per-request `credentialId` → AICredentialBinding
     * (PromptModel) → AICredentialBinding (ModelVendor) → AICredentialBinding
     * (Vendor) → type-based default Credential → legacy `apiKeys[]` carrier
     * → legacy `AI_VENDOR_API_KEY__<DRIVER>` env var (via `GetAIAPIKey`).
     *
     * Never throws on missing credentials. May throw if `credentialId` is
     * supplied but the credential row doesn't exist (preserves today's
     * `resolveCredentialById` behavior).
     */
    public async ResolveCredential(
        driverClass: string,
        targets: { promptId?: string; modelId?: string; vendorId?: string },
        options?: {
            credentialId?: string;
            apiKeys?: ApiKeyEntry[];
            contextUser?: UserInfo;
            verbose?: boolean;
        }
    ): Promise<string | null>;

    /**
     * Pre-flight check used by both ResolveForPrompt and ResolveForRequirements
     * to mark each candidate's `credentialsAvailable`. Exposed publicly because
     * a few audit gap call sites just want to filter a model list without
     * actually executing anything (e.g., the AI dashboard's "show only
     * configured models" view).
     */
    public HasCredentialsAvailable(
        driverClass: string,
        targets: { promptId?: string; modelId?: string; vendorId?: string },
        options?: { apiKeys?: ApiKeyEntry[]; contextUser?: UserInfo }
    ): boolean;

    // ------------------------------------------------------------------
    // Properties
    // ------------------------------------------------------------------
    // (none — stateless beyond the BaseSingleton inheritance)

    // ------------------------------------------------------------------
    // Protected / private — extracted from AIPromptRunner.ts
    // ------------------------------------------------------------------

    protected buildModelVendorCandidates;          // §3 item E1
    protected buildCandidatesForExplicitModel;     // §3 item E1
    protected buildCandidatesForSpecificStrategy;  // §3 item E1
    protected buildCandidatesForGeneralSelection;  // §3 item E1
    protected appendPowerMatchedFallbackCandidates;
    protected addPromptSpecificCandidates;
    protected addConfigurationFallbackCandidates;
    protected addStrategyBasedCandidates;
    protected getModelPoolForStrategy;
    protected sortModelPoolByStrategy;
    protected sortByPowerPreference;
    protected sortByPowerProximity;
    protected computeTargetPowerRank;
    protected createCandidatesForModel;
    protected createCandidatesForAllVendors;
    protected createCandidateForSpecificVendor;
    protected createCandidatesFromPromptModels;
    protected getPromptModelsForConfiguration;
    protected filterPromptModelsByConfiguration;
    protected sortPromptModelsForSpecificStrategy;

    protected resolveCredentialForExecution;       // §3 item E2
    protected tryCredentialBindingsWithFailover;
    protected tryResolveCredential;
    protected resolveCredentialById;
    protected findDefaultCredentialByType;
    protected hasCredentialsAvailableInternal;     // (renamed; public alias above)

    protected isInferenceProvider;

    protected processFailoverError;                // §3 item E3
    protected filterVendorCandidates;
    protected handleRateLimitRetry;
    protected calculateFailoverDelay;
    protected applyRetryDelay;
    protected selectFailoverCandidates;
    protected errorMatchesScope;
    protected logFailoverAttempt;
}
```

### 2.3 Behavior contract per public method

- **`ResolveForPrompt`** — mechanical re-export of the current
  `AIPromptRunner.selectModel` algorithm. Walks the configuration inheritance
  chain via `AIEngine.GetConfigurationChain`, builds the 3-phase candidate list
  (explicit override → `SelectionStrategy='Specific'` → general), runs the
  credential pre-flight per candidate, returns sorted by `priority desc`.
  Identical filtering: `IsActive`, `Status='Active' | 'Preview'`, prompt's
  `AIModelTypeID`, `isInferenceProvider`. Never throws.

- **`ResolveForRequirements`** — same engine, but skips the prompt-derived
  paths (`SelectionStrategy`, `AIPromptModel`, `RequireSpecificModels`).
  Uses `req.modelId` / `req.vendorId` / `req.modelTypeId` / `req.minPowerRank`
  / `req.powerPreference` to drive `getModelPoolForStrategy` +
  `createCandidatesForModel`. Resolution of `vendorName` → `vendorId` is done
  via `AIEngine.Vendors`. Never throws.

- **`WithFailover<T>`** — exact mirror of the loop in
  `AIPromptRunner.executeModelWithFailover` lines 2873–3000, but with the
  per-iteration `executeModel` call replaced by `await fn(candidate, i)`.
  Authentication / VendorValidationError still filters all candidates from the
  failed vendor (`filterVendorCandidates`). Rate-limit still retries the same
  candidate up to `prompt.MaxRetries ?? options.maxAttempts`. Fatal errors
  (severity `'Fatal'`, including `ContextLengthExceeded` when no
  larger-context candidate exists) short-circuit. ErrorScope filtering applies
  if `options.errorScope !== 'All'`. Throws `Error` with `{ cause:
  lastError, failoverAttempts }` when every candidate is exhausted.

- **`ResolveCredential`** — exact lift of `resolveCredentialForExecution`
  ([AIPromptRunner.ts:269-337](packages/AI/Prompts/src/AIPromptRunner.ts#L269-L337)).
  Returns the JSON-stringified credential values (current contract — see
  [line 413](packages/AI/Prompts/src/AIPromptRunner.ts#L413) and
  [line 466](packages/AI/Prompts/src/AIPromptRunner.ts#L466)) or `null`.

- **`HasCredentialsAvailable`** — sync version of the credential pre-flight
  used inside selection. Lifts
  [AIPromptRunner.ts:503-557](packages/AI/Prompts/src/AIPromptRunner.ts#L503-L557).
  Synchronous because it consults the in-memory `CredentialEngine.Credentials`
  and `AIEngine.PromptModels` arrays — no DB I/O.

### 2.4 New types — homes

- All public types in §2.2 (`ResolvedModelCandidate`, `ResolveModelResult`,
  `ModelResolveRequirements`, `WithFailoverOptions`, `WithFailoverResult`,
  `FailoverAttempt`, `FailoverStrategy`, `FailoverErrorScope`,
  `FailoverModelStrategy`, `ModelResolverCandidateSource`) live in
  `ModelResolver.ts` and are re-exported from `packages/AI/Prompts/src/index.ts`.
- The existing private interfaces `ModelVendorCandidate` and
  `FailoverConfiguration` in `AIPromptRunner.ts` lines 86–109 are removed —
  the runner now uses `ResolvedModelCandidate` directly.
- The existing `AIModelSelectionInfo` type stays in `@memberjunction/ai-core-plus`;
  the runner builds it from `ResolveModelResult.consideredAll` exactly as it
  does today from `consideredModels`.

---

## 3. Extraction plan — what moves out of `AIPromptRunner`

All line numbers are against the worktree's
`packages/AI/Prompts/src/AIPromptRunner.ts` (5,300 lines, verified).

### E1 — Candidate building (~700 LOC)

| Source range (`AIPromptRunner.ts`) | New home (`ModelResolver.ts`) | Disposition in `AIPromptRunner.ts` |
|---|---|---|
| `selectModel` lines [1461-1645](packages/AI/Prompts/src/AIPromptRunner.ts#L1461-L1645) | — body becomes `ResolveForPrompt` | thin shim: `const r = await ModelResolver.Instance.ResolveForPrompt(...); return shapeForRunner(r);` |
| `buildModelVendorCandidates` [1661-1685](packages/AI/Prompts/src/AIPromptRunner.ts#L1661-L1685) | `protected buildModelVendorCandidates` | deleted |
| `buildCandidatesForExplicitModel` [1687-1711](packages/AI/Prompts/src/AIPromptRunner.ts#L1687-L1711) | `protected buildCandidatesForExplicitModel` | deleted |
| `buildCandidatesForSpecificStrategy` [1713-1771](packages/AI/Prompts/src/AIPromptRunner.ts#L1713-L1771) | `protected buildCandidatesForSpecificStrategy` | deleted |
| `appendPowerMatchedFallbackCandidates` [1772-1822](packages/AI/Prompts/src/AIPromptRunner.ts#L1772-L1822) | `protected appendPowerMatchedFallbackCandidates` | deleted |
| `computeTargetPowerRank` [1823-1845](packages/AI/Prompts/src/AIPromptRunner.ts#L1823-L1845) | `protected computeTargetPowerRank` | deleted |
| `sortByPowerProximity` [1846-1861](packages/AI/Prompts/src/AIPromptRunner.ts#L1846-L1861) | `protected sortByPowerProximity` | deleted |
| `buildCandidatesForGeneralSelection` [1862-1898](packages/AI/Prompts/src/AIPromptRunner.ts#L1862-L1898) | `protected buildCandidatesForGeneralSelection` | deleted |
| `filterPromptModelsByConfiguration` [1899-1923](packages/AI/Prompts/src/AIPromptRunner.ts#L1899-L1923) | `protected filterPromptModelsByConfiguration` | deleted |
| `sortPromptModelsForSpecificStrategy` [1924-1954](packages/AI/Prompts/src/AIPromptRunner.ts#L1924-L1954) | `protected sortPromptModelsForSpecificStrategy` | deleted |
| `buildCandidatesFromPromptModels` [1955-1985](packages/AI/Prompts/src/AIPromptRunner.ts#L1955-L1985) | `protected buildCandidatesFromPromptModels` | deleted |
| `createCandidateForSpecificVendor` [1986-2016](packages/AI/Prompts/src/AIPromptRunner.ts#L1986-L2016) | `protected createCandidateForSpecificVendor` | deleted |
| `createCandidatesForAllVendors` [2017-2059](packages/AI/Prompts/src/AIPromptRunner.ts#L2017-L2059) | `protected createCandidatesForAllVendors` | deleted |
| `getPromptModelsForConfiguration` [2066-2097](packages/AI/Prompts/src/AIPromptRunner.ts#L2066-L2097) | `protected getPromptModelsForConfiguration` | deleted |
| `addPromptSpecificCandidates` [2102-2125](packages/AI/Prompts/src/AIPromptRunner.ts#L2102-L2125) | `protected addPromptSpecificCandidates` | deleted |
| `addConfigurationFallbackCandidates` [2126-2193](packages/AI/Prompts/src/AIPromptRunner.ts#L2126-L2193) | `protected addConfigurationFallbackCandidates` | deleted |
| `addStrategyBasedCandidates` [2194-2212](packages/AI/Prompts/src/AIPromptRunner.ts#L2194-L2212) | `protected addStrategyBasedCandidates` | deleted |
| `getModelPoolForStrategy` [2213-2232](packages/AI/Prompts/src/AIPromptRunner.ts#L2213-L2232) | `protected getModelPoolForStrategy` | deleted |
| `sortModelPoolByStrategy` [2233-2250](packages/AI/Prompts/src/AIPromptRunner.ts#L2233-L2250) | `protected sortModelPoolByStrategy` | deleted |
| `sortByPowerPreference` [2251-2274](packages/AI/Prompts/src/AIPromptRunner.ts#L2251-L2274) | `protected sortByPowerPreference` | deleted |
| `createCandidatesForModel` [2275-2348](packages/AI/Prompts/src/AIPromptRunner.ts#L2275-L2348) | `protected createCandidatesForModel` | deleted |
| `createSelectionInfo` [2349-2375](packages/AI/Prompts/src/AIPromptRunner.ts#L2349-L2375) | **stays in `AIPromptRunner`** — it's the runner's adapter from `ResolveModelResult` to `AIModelSelectionInfo` for the prompt run record | unchanged |
| `buildCandidatesFromSelectionInfo` [2376-2413](packages/AI/Prompts/src/AIPromptRunner.ts#L2376-L2413) | **stays** — runner-internal | unchanged |
| `selectModelWithAPIKeyTracked` [2414-2508](packages/AI/Prompts/src/AIPromptRunner.ts#L2414-L2508) | `protected runCredentialPreflight` (renamed) | deleted from runner; the runner reads `result.candidates[0]` and `result.consideredAll` instead |
| `isInferenceProvider` [231-264](packages/AI/Prompts/src/AIPromptRunner.ts#L231-L264) | `protected isInferenceProvider` | deleted |
| `buildNoModelFoundMessage` [2515-2541](packages/AI/Prompts/src/AIPromptRunner.ts#L2515-L2541) | **stays in `AIPromptRunner`** — uses runner-specific `AIModelSelectionInfo`, called only from runner's `executeSinglePrompt` | unchanged |

### E2 — Credential resolution (~280 LOC)

| Source range | New home | Disposition |
|---|---|---|
| `resolveCredentialForExecution` [269-337](packages/AI/Prompts/src/AIPromptRunner.ts#L269-L337) | `ResolveCredential` (public) | thin shim: `return ModelResolver.Instance.ResolveCredential(driverClass, { promptId, modelId, vendorId }, { credentialId: params.credentialId, apiKeys: params.apiKeys, contextUser: params.contextUser, verbose });` |
| `tryCredentialBindingsWithFailover` [343-374](packages/AI/Prompts/src/AIPromptRunner.ts#L343-L374) | `protected tryCredentialBindingsWithFailover` | deleted |
| `tryResolveCredential` [379-437](packages/AI/Prompts/src/AIPromptRunner.ts#L379-L437) | `protected tryResolveCredential` | deleted |
| `resolveCredentialById` [443-467](packages/AI/Prompts/src/AIPromptRunner.ts#L443-L467) | `protected resolveCredentialById` | deleted |
| `findDefaultCredentialByType` [472-480](packages/AI/Prompts/src/AIPromptRunner.ts#L472-L480) | `protected findDefaultCredentialByType` | deleted |
| `hasCredentialsAvailable` [503-557](packages/AI/Prompts/src/AIPromptRunner.ts#L503-L557) | `HasCredentialsAvailable` (public) + private impl | deleted from runner; runner now relies on `result.candidates` already being credential-filtered |

### E3 — Failover loop (~450 LOC)

| Source range | New home | Disposition |
|---|---|---|
| `executeModelWithFailover` [2845-3001](packages/AI/Prompts/src/AIPromptRunner.ts#L2845-L3001) | body re-implemented inside `WithFailover<T>`; runner calls `WithFailover` with `fn = (c) => this.executeModel(c.model, ...)` | runner keeps a thin wrapper named `executeModelWithFailover` so its own internals don't have to change at every callsite — the wrapper just calls `WithFailover` and unpacks `WithFailoverResult.result` |
| `processFailoverError` [3951-4035](packages/AI/Prompts/src/AIPromptRunner.ts#L3951-L4035) | `protected processFailoverError` | deleted |
| `transitionToNextCandidate` [4041-4091](packages/AI/Prompts/src/AIPromptRunner.ts#L4041-L4091) | unused after extraction (was internal to old algorithm) | deleted |
| `filterVendorCandidates` [3845-3888](packages/AI/Prompts/src/AIPromptRunner.ts#L3845-L3888) | `protected filterVendorCandidates` | deleted |
| `handleRateLimitRetry` [3894-3943](packages/AI/Prompts/src/AIPromptRunner.ts#L3894-L3943) | `protected handleRateLimitRetry` | deleted |
| `calculateFailoverDelay` [5084-5098](packages/AI/Prompts/src/AIPromptRunner.ts#L5084-L5098) | `protected calculateFailoverDelay` | deleted |
| `applyRetryDelay` [3832-3843](packages/AI/Prompts/src/AIPromptRunner.ts#L3832-L3843) | `protected applyRetryDelay` (extracted but kept simple) | deleted |
| `selectFailoverCandidates` [5119-5252](packages/AI/Prompts/src/AIPromptRunner.ts#L5119-L5252) | `protected selectFailoverCandidates` | deleted |
| `errorMatchesScope` [5057-5069](packages/AI/Prompts/src/AIPromptRunner.ts#L5057-L5069) | `protected errorMatchesScope` | deleted |
| `logFailoverAttempt` [5266-5298](packages/AI/Prompts/src/AIPromptRunner.ts#L5266-L5298) | `protected logFailoverAttempt` | deleted |
| `getFailoverConfiguration` [4994-5002](packages/AI/Prompts/src/AIPromptRunner.ts#L4994-L5002) | **stays in `AIPromptRunner`** — translates from prompt entity fields to `WithFailoverOptions` | unchanged |
| `shouldAttemptFailover` [5017-5048](packages/AI/Prompts/src/AIPromptRunner.ts#L5017-L5048) | unused after extraction (logic now lives inside `processFailoverError`/`errorMatchesScope`); audit notes it duplicates `errorMatchesScope` | deleted |
| `updatePromptRunWithFailoverSuccess` [3078-3105](packages/AI/Prompts/src/AIPromptRunner.ts#L3078-L3105), `updatePromptRunWithFailoverFailure` [3106-3123](packages/AI/Prompts/src/AIPromptRunner.ts#L3106-L3123), `createFailoverErrorResult` [3124-3158](packages/AI/Prompts/src/AIPromptRunner.ts#L3124-L3158) | **stay in `AIPromptRunner`** — they touch `MJAIPromptRunEntityExtended`, which is a runner-only concern | unchanged. After successful `WithFailover`, runner inspects `WithFailoverResult.failoverAttempts` and updates the prompt-run record itself. |
| `buildFailoverCandidates` [3006-3035](packages/AI/Prompts/src/AIPromptRunner.ts#L3006-L3035), `createCandidatesFromModels` [3036-3076](packages/AI/Prompts/src/AIPromptRunner.ts#L3036-L3076) | **stay in `AIPromptRunner`** — only used by the runner's no-prompt-models legacy path; redundant with new resolver but out-of-scope for Phase 1 (delete in Phase 5) | unchanged |

### Things the runner has to change in itself (because the extracted code can no longer assume runner-internal state)

- `ModelResolver` does not have access to `params: AIPromptParams` (a runner-only type). The credential-resolution path in the original code reads `params.credentialId`, `params.apiKeys`, `params.contextUser`, `params.verbose`, `params.maxErrorLength`. These are passed through to `ResolveCredential` as the `options` object. The runner is responsible for unpacking `params` into the `options` shape before calling.
- The runner's `logStatus` / `logError` methods write to its own `_logger` chain. `ModelResolver` uses the standalone `LogStatus` / `LogStatusEx` / `LogErrorEx` exports from `@memberjunction/core` directly (no class context required).
- The `ModelVendorCandidate.effortLevel` field's only reader (the runner's `executeModel`) keeps reading it via the same field name — `ResolvedModelCandidate.effortLevel` is unchanged in shape.
- `ParallelExecutionCoordinator` ([packages/AI/Prompts/src/ParallelExecutionCoordinator.ts](packages/AI/Prompts/src/ParallelExecutionCoordinator.ts)) currently reaches into runner internals for the `ModelVendorCandidate` interface via TypeScript inference. After Phase 1 it imports `ResolvedModelCandidate` from the same package's `index.ts`.

---

## 4. Backward compatibility

The contract is: **`AIPromptRunner.ExecutePrompt(params)` returns the same `AIPromptRunResult` for the same inputs, with the same model selection, same vendor failover order, same `ChatResult` error shapes, same `MJ: AI Prompt Runs` record contents.**

This is enforced by the design choice that every method moving to `ModelResolver` keeps its existing semantics byte-for-byte; the runner becomes a consumer that adapts the resolver's output to its existing internal shapes (`AIModelSelectionInfo`, `MJAIPromptRunEntityExtended`).

### Before (today)

```typescript
// inside AIPromptRunner.executeSinglePrompt
const sel = await this.selectModel(prompt, explicitModelId, contextUser, configurationId, vendorId, params);
if (!sel.model) { /* build no-model error */ }
const result = await this.executeModelWithFailover(
    sel.model, renderedPrompt, prompt, params, vendorId,
    /* ... */ sel.allCandidates, promptRun,
    sel.vendorDriverClass, sel.vendorApiName, sel.vendorSupportsEffortLevel,
    sel.modelEffortLevel
);
```

### After (Phase 1)

```typescript
// inside AIPromptRunner.executeSinglePrompt
const resolved = await ModelResolver.Instance.ResolveForPrompt(
    prompt,
    {
        modelId: explicitModelId,
        vendorId,
        credentialId: params.credentialId,
        apiKeys: params.apiKeys,
        verbose: params.verbose
    },
    contextUser
);

// Adapt to the runner's existing AIModelSelectionInfo shape (createSelectionInfo stays in runner)
const selectionInfo = this.createSelectionInfo({
    aiConfiguration: /* lookup from configurationId */,
    modelsConsidered: resolved.consideredAll.map(toRunnerConsideredShape),
    modelSelected: resolved.primary?.model,
    vendorSelected: resolved.primary?.vendor,
    selectionReason: resolved.selectionReason,
    fallbackUsed: resolved.candidates.length > 0 && resolved.candidates[0] !== resolved.consideredAll[0],
    selectionStrategy: /* derive from prompt */
});

if (!resolved.primary) { /* build no-model error using buildNoModelFoundMessage(selectionInfo) */ }

// failover loop now goes through ModelResolver but with the runner's executeModel as the per-candidate fn
const failoverResult = await ModelResolver.Instance.WithFailover(
    resolved.candidates,
    (candidate) => this.executeModel(
        candidate.model, renderedPrompt, prompt, params, candidate.vendorId ?? null,
        conversationMessages, templateMessageRole, cancellationToken,
        candidate.driverClass, candidate.apiName, candidate.supportsEffortLevel, candidate.effortLevel
    ),
    {
        ...this.getFailoverConfiguration(prompt),  // unchanged; produces WithFailoverOptions-shaped object
        contextUser
    }
);

// runner still owns the prompt-run record update
if (failoverResult.failoverAttempts.length > 0 && promptRun) {
    this.updatePromptRunWithFailoverSuccess(
        promptRun, failoverResult.failoverAttempts,
        failoverResult.winner.model, failoverResult.winner.vendorId ?? null
    );
}
return failoverResult.result;
```

The behavior surface — selection algorithm, candidate ordering, error classification, vendor filtering on `Authentication`/`VendorValidationError`, rate-limit retry counting, ContextLengthExceeded short-circuit, prompt-run record persistence — is unchanged. All existing `AIPromptRunner.*.test.ts` files (which test against mirror functions, not the live class) continue to pass.

---

## 5. Tests

### 5.1 New test file

**Path**: `packages/AI/Prompts/src/__tests__/ModelResolver.test.ts`

**Framework**: Vitest (matches existing files in this directory; `package.json` script `"test": "vitest run"`).

**Style**: Follows the existing pattern in
[`AIPromptRunner.failover.test.ts`](packages/AI/Prompts/src/__tests__/AIPromptRunner.failover.test.ts)
and [`AIPromptRunner.modelInfo.test.ts`](packages/AI/Prompts/src/__tests__/AIPromptRunner.modelInfo.test.ts) —
standalone helper functions that mirror the class's logic, no full-instance
instantiation, no DB. Mock types declared at top of file. `BaseSingleton`
reset in `beforeEach` via `@memberjunction/test-utils`.

### 5.2 Test matrix — Vitest outline

```
describe('ModelResolver', () => {

  describe('ResolveForRequirements', () => {
    it('returns the only candidate when one vendor is configured for the model')
    it('orders candidates by Priority desc when multiple vendors share a model')
    it('breaks Priority ties deterministically by VendorID for stable ordering')
    it('filters out vendors with Status != Active')
    it('filters out vendors that are not Inference Providers (TypeID check)')
    it('filters out models with IsActive=false')
    it('respects modelTypeId — excludes models of other types')
    it('respects modelTypeName — excludes models of other types')
    it('respects modelId — pins to that model only, still enumerates its vendors')
    it('respects vendorId — pins to that vendor only')
    it('respects vendorName — resolves to vendorId via AIEngine.Vendors')
    it('honors minPowerRank — excludes lower-PowerRank models')
    it('honors powerPreference=Highest — sorts by PowerRank desc')
    it('honors powerPreference=Lowest — sorts by PowerRank asc')
    it('honors powerPreference=Balanced — picks the median PowerRank')
    it('walks AIConfiguration inheritance chain (child → parent → null) for promptModels lookup')
    it('falls back to NULL-config models when chain walk finds nothing')
    it('marks credentialsAvailable=false on candidates whose driver has no env var, no apiKeys entry, no binding, no default-by-type')
    it('returns primary=null and selectionReason populated when no candidate has credentials')
    it('does not throw when AIEngine has zero models')
    it('does not throw when zero models match the requirements')
  })

  describe('ResolveForPrompt', () => {
    it('Phase 1: returns explicit override candidate first when overrides.modelId is set')
    it('Phase 2: SelectionStrategy=Specific uses only configured AIPromptModel rows')
    it('Phase 2: when RequireSpecificModels=false and all specifics lack creds, appends power-matched fallback (sorted by power proximity to configured target)')
    it('Phase 2: when RequireSpecificModels=true and all specifics lack creds, returns primary=null (no fallback)')
    it('Phase 3: SelectionStrategy=Default walks config chain (3000-500*depth priorities), then NULL-config (1000)')
    it('Phase 3: SelectionStrategy=ByPower respects MinPowerRank and PowerPreference')
    it('preferred vendor (overrides.vendorId) is marked isPreferredVendor=true and bumped to top within its model group')
    it('AIPromptModel.Priority is honored within Specific strategy')
    it('config inheritance chain falls through when child config has no PromptModels')
    it('uses NULL-config PromptModels as universal fallback in Phase 3')
    it('returns primary=null when prompt.AIModelTypeID matches no models')
    it('selectionReason describes Phase 1 vs Phase 2 vs power-match-fallback distinctly')
  })

  describe('WithFailover', () => {
    it('returns first success without trying further candidates')
    it('continues to next candidate when fn throws a network error')
    it('continues to next candidate when fn returns ChatResult{success:false, errorInfo:{canFailover:true}}')
    it('does NOT continue when fn returns ChatResult{success:true}')
    it('throws aggregate Error with cause and failoverAttempts when all candidates fail')
    it('Authentication error filters out all candidates from that vendor')
    it('VendorValidationError filters out all candidates from that vendor')
    it('RateLimit error retries the same candidate up to options.maxAttempts before failing over')
    it('Fatal error short-circuits without trying further candidates')
    it('ContextLengthExceeded short-circuits when no candidate has larger context window')
    it('ContextLengthExceeded continues to a candidate with larger MaxInputTokens when one exists')
    it('errorScope=NetworkOnly skips failover for non-network errors')
    it('errorScope=RateLimitOnly skips failover for non-rate-limit errors')
    it('errorScope=ServiceErrorOnly skips failover for non-service errors')
    it('errorScope=All (default) failovers on every canFailover=true error')
    it('failoverStrategy=None executes only the first candidate, never failovers')
    it('failoverStrategy=SameModelDifferentVendor only tries other vendors of the same model')
    it('failoverStrategy=NextBestModel + modelStrategy=PreferSameModel sorts same-model candidates first')
    it('failoverStrategy=NextBestModel + modelStrategy=PreferDifferentModel sorts different-model candidates first')
    it('failoverStrategy=NextBestModel + modelStrategy=RequireSameModel filters out other models')
    it('exponential backoff with jitter is applied between attempts (delay grows, capped at 30s)')
    it('attemptsUsed counts both rate-limit-retries and cross-candidate failovers')
    it('failoverAttempts records every attempt with errorType, duration, modelId, vendorId')
    it('empty candidates list returns immediately with primary=null (no fn invocation)')
  })

  describe('ResolveCredential', () => {
    it('returns explicit credential when credentialId override is supplied')
    it('throws when credentialId override points to a missing credential (preserves resolveCredentialById behavior)')
    it('falls through to PromptModel binding when no override')
    it('falls through to ModelVendor binding when PromptModel has no binding')
    it('falls through to Vendor binding when ModelVendor has none')
    it('falls through to type-based default credential')
    it('falls through to legacy apiKeys[] carrier')
    it('falls through to legacy AI_VENDOR_API_KEY__<DRIVER> env var')
    it('returns null when every tier is empty')
    it('skips inactive credentials and falls through to next binding')
    it('skips expired credentials (ExpiresAt < now) and falls through')
    it('returns the JSON-stringified credential.values blob (matches today\'s contract)')
    it('per-binding failover: picks the next binding when CredentialEngine.getCredential throws')
  })

  describe('HasCredentialsAvailable', () => {
    it('returns true when ANY tier in the hierarchy resolves')
    it('returns false when every tier is empty')
    it('is synchronous — does not perform DB I/O')
    it('result is consistent with what ResolveCredential would return for the same inputs')
  })

  describe('singleton behavior', () => {
    it('Instance returns the same object across multiple calls')
    it('survives module re-import in code-split scenarios (BaseSingleton via Global Object Store)')
  })
})
```

### 5.3 Existing tests that must keep passing (regression surface)

These all live in `packages/AI/Prompts/src/__tests__/` and currently exercise
the methods being moved. After Phase 1 they exercise the runner's now-thin
adapter, which delegates to `ModelResolver`. They must pass unchanged:

- **`AIPromptRunner.failover.test.ts`** — 7 tests covering the failover loop
  ([line 321-624](packages/AI/Prompts/src/__tests__/AIPromptRunner.failover.test.ts#L321)):
  network error failover, rate-limit failover, success short-circuit,
  exhaustion error, service-unavailable failover, vendor-level filtering,
  errorScope filtering. **These directly cover the `WithFailover` extraction**
  — if any fail post-extraction, `WithFailover` doesn't match the original
  loop semantically.
- **`AIPromptRunner.power-match-fallback.test.ts`** — covers `computeTargetPowerRank`,
  `sortByPowerProximity`, `appendPowerMatchedFallbackCandidates`,
  `buildCandidatesForSpecificStrategy` (with `RequireSpecificModels=false/true`).
  All extracted into `ModelResolver`; the test file's mirror functions need to
  be updated to import from the new home (or stay as-is since they're standalone
  re-implementations of the algorithm — preferred since the existing pattern
  is "mirror the logic, don't import").
- **`AIPromptRunner.credential-errors.test.ts`** — covers
  `buildNoModelFoundMessage` (stays in runner, no change) and
  `ErrorAnalyzer` integration (no change). Should pass without modification.
- **`AIPromptRunner.modelInfo.test.ts`** — covers the `buildModelInfo` factory
  used by `executeSinglePrompt` / `executePromptInParallel` (stays in runner,
  no change). Should pass without modification.
- **`AIPromptRunner.prefill.test.ts`** — covers prefill logic (stays in runner,
  no change). Should pass without modification.

### 5.4 Cross-package smoke

`AIEngine` is consumed by ~20 other packages. After Phase 1 we should run:

- `cd packages/AI/Prompts && npm run test`
- `cd packages/AI/Agents && npm run test`
- `cd packages/Actions/CoreActions && npm run test`
- `cd packages/AI/Knowledge/TagEngine && npm run test`

…to confirm no consumer of `AIPromptRunner` regressed. Per CLAUDE.md §6.

---

## 6. Rollout

Phase 1 is **purely additive**:

1. New class introduced.
2. `AIPromptRunner` rewired to delegate.
3. **No** other call site in the audit's gap list (G1–G35) is touched. Those
   are Phase 2+ work, gated on this PR shipping cleanly.

### Honoring `MJAIPromptEntity.FailoverStrategy` — non-negotiable contract (raised by AN-BC during PR review)

Phase 1 must preserve the existing per-prompt `FailoverStrategy` semantics exactly. The Skip-style use case is the canonical reason: a prompt designer enumerates a curated set of acceptable models in `MJ: AI Prompt Models` and explicitly does NOT want the system to silently fall back to anything else when those specific models are unavailable. They want a hard failure that surfaces in monitoring so the configuration gets fixed.

**Contractually required behaviors of `ModelResolver.withFailover` and `ModelResolver.resolveForPrompt`:**

1. **`failoverStrategy: 'None'`** — execute the first candidate; on failure, return / throw immediately. No vendor-shopping, no model-shopping. The first attempt's own retry budget (e.g., transient retries from `BaseLLM`) is the only retry surface.
2. **`failoverStrategy: 'SameModelDifferentVendor'`** (the default for prompt callers) — try alternate vendors of the **same `AIModel.ID`** only. Never substitute a different model. If every vendor for the resolved model fails, the call fails.
3. **`failoverStrategy: 'NextBestModel'`** — the only strategy that may walk to a different model. Even here, the prompt's `RequireSpecificModels` flag (when set) restricts the candidate pool to `MJ: AI Prompt Models` rows for that prompt; cross-vendor failover within those enumerated models is allowed but stepping outside the enumerated list is not.
4. **`failoverStrategy: 'PowerRank'`** — same as `NextBestModel` but the next candidate is chosen by `PowerRank` rather than the prompt's enumerated order.
5. **No silent upgrades.** Phase 2-5 retrofit sites MUST pass the prompt's strategy verbatim into `ModelResolver`. A retrofit must never replace a prompt's `'None'` with `'SameModelDifferentVendor'` "for resilience." If a non-prompt caller has no prompt to read from (e.g., `RerankerService`, `AIModelRunner.RunEmbedding`, `generate-image.action.ts`), the spec's documented default for non-prompt callers is `'SameModelDifferentVendor'` — these are infrastructure capabilities where cross-vendor resilience is the desired default. This deliberately diverges from the prompt-driven `'None'` semantics: the rule is "honor the prompt designer's intent when there is one; default to resilience when there isn't."

The §5.2 test matrix already lists per-strategy assertions; the additional regression assertion for Phase 1 acceptance is **a test that explicitly drives the Skip-style scenario**: a prompt with `FailoverStrategy='None'` + `RequireSpecificModels=true` + an `AIPromptModel` list whose only entry is unavailable (vendor inactive / no credentials) MUST return a structured failure, NOT a successful run from another model.

### Phase 1.5 housekeeping bundled with this rollout

`MJ: AI Prompts.FailoverStrategy` CHECK constraint has each enum value duplicated. Visible in the generated TypeScript today:

```ts
get FailoverStrategy(): 'NextBestModel' | 'NextBestModel' | 'None' | 'None' | 'PowerRank' | 'PowerRank' | 'SameModelDifferentVendor' | 'SameModelDifferentVendor' { ... }
```

Add a one-shot migration that drops the duplicated CHECK clauses and re-adds a single canonical CHECK constraint, then re-run CodeGen. The generated entity type collapses to `'None' | 'SameModelDifferentVendor' | 'NextBestModel' | 'PowerRank'`. This is a one-line conceptual change in the migration file but lands in the same release as Phase 1 because `ModelResolver` switches on this field and the duplicated literals make TypeScript exhaustiveness checks on the discriminated union confusing for reviewers reading the new code.

### Acceptance criteria

- [ ] `ModelResolver` class exists at `packages/AI/Prompts/src/ModelResolver.ts`
      with the public signature in §2.2.
- [ ] All public types (`ResolvedModelCandidate`, `ResolveModelResult`,
      `ModelResolveRequirements`, `WithFailoverOptions`, `WithFailoverResult`,
      `FailoverAttempt`, `FailoverStrategy`, `FailoverErrorScope`,
      `FailoverModelStrategy`, `ModelResolverCandidateSource`) are exported
      from `packages/AI/Prompts/src/index.ts`.
- [ ] `ModelResolver` extends `BaseSingleton<ModelResolver>` (CLAUDE.md §7).
      Constructor is `protected`. `ModelResolver.Instance` returns a single
      instance via the Global Object Store.
- [ ] `AIPromptRunner.selectModel`, `executeModelWithFailover`,
      `processFailoverError`, `resolveCredentialForExecution`, and the helper
      methods listed in §3 are deleted from `AIPromptRunner.ts`. The runner's
      surviving methods (`executeSinglePrompt`, `executePromptInParallel`,
      `createSelectionInfo`, `buildNoModelFoundMessage`,
      `updatePromptRunWithFailoverSuccess/Failure`,
      `createFailoverErrorResult`, `getFailoverConfiguration`) call into
      `ModelResolver.Instance` instead.
- [ ] `ParallelExecutionCoordinator` imports `ResolvedModelCandidate` from
      `@memberjunction/ai-prompts` (was relying on the runner's private
      `ModelVendorCandidate` interface).
- [ ] The 5 existing `AIPromptRunner.*.test.ts` files pass without
      modification (or only with import-path updates if the test file imports
      a moved type — preferred: keep test files as standalone mirrors).
- [ ] New `ModelResolver.test.ts` covers every bullet in §5.2 and passes.
- [ ] `cd packages/AI/Prompts && npm run build` succeeds (no TS errors).
- [ ] `cd packages/AI/Prompts && npm run test` reports pass count ≥ existing
      count + new test count, 0 failures, 0 unexpected skips.
- [ ] Spot-check a real prompt run end-to-end (e.g., a Sage prompt with
      multiple `AIPromptModel` rows across two configurations) shows the same
      model selected and the same `MJ: AI Prompt Runs` record content as
      before the change.
- [ ] Skip-style hard-fail regression test passes: a prompt configured with
      `FailoverStrategy='None'` + `RequireSpecificModels=true` whose only
      enumerated model has no available vendor returns structured failure,
      NEVER a successful run from a different model.
- [ ] `MJ: AI Prompts.FailoverStrategy` CHECK constraint cleanup migration
      lands in the same PR; `git grep "'NextBestModel' | 'NextBestModel'"`
      in `packages/MJCoreEntities/src/generated/` returns nothing after a
      post-migration CodeGen run.

---

## 7. PR description draft

> **Extract `ModelResolver` from `AIPromptRunner`**
>
> Lifts the model+vendor candidate-building, credential pre-flight, and
> cross-vendor failover loop out of the private internals of `AIPromptRunner`
> into a new public `ModelResolver` class in `@memberjunction/ai-prompts`.
> `AIPromptRunner.ExecutePrompt` continues to behave identically — it now
> delegates to the resolver. No other call sites change. This is the
> foundation for the audit's Phase 2+ retrofits, which will route the 14
> hard-gap call sites identified in `MODEL_VENDOR_FALLBACK_AUDIT.md` through
> the new resolver to inherit cross-vendor failover.

---

## 8. Open questions for the reviewer

1. **Package home** — confirm the choice in §2.1 (co-locate in
   `@memberjunction/ai-prompts`). The audit's §5.1 sketch named a brand-new
   `@memberjunction/ai-model-resolver` package; we rejected that for
   dep-graph reasons but a reviewer with stronger opinions about not bloating
   `ai-prompts` may want to push for the standalone package anyway. Cost of
   that choice: a new `package.json`, a new entry in `tsconfig`/turbo, and an
   `aiengine` → resolver → aiengine dependency cycle to break (likely by
   moving the singleton to `@memberjunction/ai-engine-base` instead).
2. **Singleton vs per-call instance** — CLAUDE.md §7 mandates `BaseSingleton`
   for cross-cutting services. `ModelResolver` is stateless, so singleton is
   fine. But two of the methods (`ResolveCredential`, `HasCredentialsAvailable`)
   currently take `contextUser` per call, which means the singleton is just a
   namespace. Confirm we don't want to make it a lightweight per-call instance
   (`new ModelResolver(contextUser)`) for ergonomic reasons. My read: keep
   singleton, take `contextUser` per call — matches `AIEngine.Instance` and
   `CredentialEngine.Instance`.
3. **`HasCredentialsAvailable` sync vs async** — the existing
   `hasCredentialsAvailable` ([line 503](packages/AI/Prompts/src/AIPromptRunner.ts#L503))
   is synchronous because it reads in-memory caches. If we ever want to do a
   live DB check (e.g., the audit's open question §7.5 about embedding model
   liveness), we'd need to make it async. Confirm we should keep it sync for
   now and break the API later if needed, vs. ship it async-by-default.
4. **`WithFailover` error shape** — proposal is to throw a single `Error` with
   `cause` chain and `failoverAttempts` attached. The audit (§5.3) suggests
   throwing only when "all candidates fail". Should the result type instead
   always be `{ ok: true, result } | { ok: false, error, failoverAttempts }` so
   callers don't have to try/catch? Either is defensible. My read: throw, to
   match the existing `executeModelWithFailover` contract that `AIPromptRunner`
   relies on (the runner expects to propagate `ChatResult{success:false}` not
   to deal with a Result-wrapper).
5. **Should `ResolveForRequirements` accept a `failoverStrategy` field**
   so callers can declare intent at resolution time, even though failover is
   actually executed by `WithFailover`? Today the prompt entity carries this
   field. For non-prompt callers (embeddings, rerankers) the natural pattern is
   `await WithFailover(resolved.candidates, fn, { failoverStrategy: 'SameModelDifferentVendor' })`.
   Carrying it on the requirements would let the resolver pre-trim the
   candidate list (e.g., for `'None'` only return `[primary]`). I leaned
   toward NOT pre-trimming so the resolver and the failover loop have one
   responsibility each, but a reviewer may prefer the bundled API.

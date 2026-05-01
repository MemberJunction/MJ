/**
 * @fileoverview Public model + vendor resolution and cross-vendor failover service.
 *
 * `ModelResolver` is the single point of plumbing that consolidates the
 * model-selection, credential pre-flight, and cross-vendor failover loop that
 * was previously private-internal to {@link AIPromptRunner}. The runner itself
 * delegates to this class — the API surface is now reusable by the audit
 * gap call sites (embeddings, semantic search, GraphQL `ExecuteSimplePrompt`,
 * the Templates `{% AIPrompt %}` extension, image-gen, etc.) so a single
 * vendor outage no longer brings down everything that bypasses the runner.
 *
 * **Phase 1 scope:** This file ships the public API surface and types only.
 * Method bodies are deliberately stubbed (`throw NotImplementedError(...)`) so
 * the rest of the codebase can start importing the symbols and authoring
 * tests against them while the actual extraction from
 * {@link AIPromptRunner} is happening on the same branch in subsequent
 * commits. The runner is unchanged in this commit — production behavior is
 * not affected.
 *
 * **Design references:**
 * - `MODEL_VENDOR_FALLBACK_AUDIT.md` (audit + per-capability matrix)
 * - `PHASE_1_MODEL_RESOLVER_SPEC.md` (this class's contract, §2.2 in
 *   particular for the public surface)
 * - {@link MJAIPromptEntityExtended.FailoverStrategy} — the prompt designer's
 *   hard-fail escape hatch. Honored verbatim by `WithFailover` and never
 *   silently upgraded by retrofit sites. See §3.5.8 of the audit.
 */

import { BaseSingleton } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { AIAPIKey } from '@memberjunction/ai';
import {
    MJAIModelEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { MJAIVendorEntity } from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * How a candidate ended up in the priority-ordered list. Mirrors the `source`
 * field on the existing private `ModelVendorCandidate` interface inside
 * `AIPromptRunner.ts` so the visible diagnostics in `AIModelSelectionInfo`
 * stay consistent across the extraction.
 */
export type ModelResolverCandidateSource =
    | 'explicit'
    | 'prompt-model'
    | 'model-type'
    | 'power-rank'
    | 'power-match-fallback';

/**
 * Failover strategies — string-union mirroring `MJAIPromptEntity.FailoverStrategy`.
 *
 * Re-declared here (not imported from the entity) so the resolver compiles
 * standalone for non-prompt callers (embeddings, rerankers, image-gen). The
 * entity's CHECK constraint is the source of truth and currently has each
 * literal duplicated; cleanup is tracked in the Phase 1 spec's housekeeping
 * section.
 *
 * Behavior contract (enforced by {@link ModelResolver.WithFailover}):
 * - `'None'` — try the first candidate; on failure, return / throw immediately.
 *   No vendor-shopping, no model-shopping. This is the prompt designer's
 *   hard-fail escape hatch and must never be silently upgraded by retrofits.
 * - `'SameModelDifferentVendor'` — try alternate vendors of the same
 *   `AIModel.ID` only. Never substitute a different model.
 * - `'NextBestModel'` — may walk to a different model row, subject to
 *   `RequireSpecificModels` if set on the prompt.
 * - `'PowerRank'` — same as `NextBestModel` but ordered by `PowerRank`.
 */
export type FailoverStrategy =
    | 'None'
    | 'SameModelDifferentVendor'
    | 'NextBestModel'
    | 'PowerRank';

/**
 * Which classes of provider error trigger a failover attempt.
 *
 * `'All'` is the runner's current default — every classified error counts.
 * The narrower scopes let non-prompt callers opt out of failing over on, e.g.,
 * application-layer validation errors that won't be cured by switching vendors.
 */
export type FailoverErrorScope =
    | 'All'
    | 'NetworkOnly'
    | 'RateLimitOnly'
    | 'ServiceErrorOnly';

/**
 * For `'NextBestModel'` failover, expresses caller preference about whether
 * the next attempt should keep the same `AIModel.ID` (different vendor) or
 * walk to a different model entirely.
 *
 * - `'PreferSameModel'` — same-model candidates first, then different-model.
 * - `'PreferDifferentModel'` — different-model candidates first.
 * - `'RequireSameModel'` — never walk to a different model; equivalent to
 *   `'SameModelDifferentVendor'` semantics for the candidate filter.
 */
export type FailoverModelStrategy =
    | 'PreferSameModel'
    | 'PreferDifferentModel'
    | 'RequireSameModel';

/**
 * One model+vendor pair the resolver considered, with everything a caller
 * needs to instantiate a driver against it.
 *
 * After the credential pre-flight runs, candidates with `credentialsAvailable
 * === false` are excluded from {@link ResolveModelResult.candidates} but
 * retained in {@link ResolveModelResult.consideredAll} so the caller can
 * surface a useful "no model available" diagnostic that includes *why* each
 * was excluded (`unavailableReason`).
 */
export interface ResolvedModelCandidate {
    /** The selected model row. */
    model: MJAIModelEntityExtended;
    /** ID of the vendor row paired with the model. */
    vendorId?: string;
    /** Resolved vendor entity, when available. */
    vendor?: MJAIVendorEntity;
    /** Convenience copy of `vendor?.Name`. */
    vendorName?: string;
    /**
     * `AIModelVendor.DriverClass` if set, else falls back to
     * `AIModel.DriverClass`. This is what the caller passes to
     * `MJGlobal.ClassFactory.CreateInstance<BaseLLM | BaseEmbeddings | …>`.
     */
    driverClass: string;
    /** `AIModelVendor.APIName` if set — the wire-level model identifier. */
    apiName?: string;
    /** Mirrors `AIModelVendor.SupportsEffortLevel`. */
    supportsEffortLevel: boolean;
    /** Per-PromptModel effort override, when resolved from a prompt. */
    effortLevel?: number;
    /** True when this matched a caller-supplied preferred vendor. */
    isPreferredVendor: boolean;
    /** Higher = better. Same direction as `AIModelVendor.Priority`. */
    priority: number;
    /** How this candidate was discovered. */
    source: ModelResolverCandidateSource;
    /**
     * Set by the resolver after the credential pre-flight runs. `false`
     * candidates are excluded from `candidates` but kept in `consideredAll`
     * for diagnostics.
     */
    credentialsAvailable: boolean;
    /** Human-readable reason the candidate was excluded, when applicable. */
    unavailableReason?: string;
}

/**
 * Inputs to the prompt-free entrypoint {@link ModelResolver.ResolveForRequirements}.
 *
 * Use this from non-prompt code paths (embeddings, rerankers, ad-hoc LLM
 * calls in resolvers / extensions, image generators). For prompt-driven calls,
 * use {@link ModelResolver.ResolveForPrompt} instead, which derives selection
 * from the prompt entity's `SelectionStrategy`, `AIPromptModel` rows, and
 * configuration inheritance chain.
 */
export interface ModelResolveRequirements {
    /** Restrict to one `AIModelType` row by id. */
    modelTypeId?: string;
    /**
     * Convenience name lookup for the type. Resolved against
     * `AIEngine.ModelTypes` by `Name`. Examples: `'LLM'`, `'Embeddings'`,
     * `'Reranker'`, `'Image Generator'`, `'Audio Generator'`, `'Video Generator'`.
     */
    modelTypeName?: string;
    /** Pin to a specific model. Disables cross-model fallback. */
    modelId?: string;
    /** Pin to a specific vendor by id. */
    vendorId?: string;
    /** Pin to a specific vendor by name (matches `AIVendor.Name`, case-sensitive). */
    vendorName?: string;
    /** Lower bound on `AIModel.PowerRank`. */
    minPowerRank?: number;
    /** Mirrors `AIPromptEntity.PowerPreference`. */
    powerPreference?: 'Highest' | 'Lowest' | 'Balanced';
    /** Walks the `AIConfiguration` inheritance chain. */
    configurationId?: string;
    /**
     * When `true` and a specific model has no creds, do NOT fall through to
     * other models. Mirrors `AIPromptEntity.RequireSpecificModels`. Default `false`.
     */
    requireSpecific?: boolean;
    /** Per-request credential override (id of an `MJCredential` row). */
    credentialId?: string;
    /**
     * Legacy in-memory api-key carrier. Still respected via `GetAIAPIKey` as
     * the lowest-priority tier of the credential hierarchy, after the
     * Credentials system and per-prompt / per-model bindings.
     */
    apiKeys?: AIAPIKey[];
}

/**
 * Result of either prompt-aware or requirements-based resolution.
 *
 * Never throws — when no candidate has credentials, returns
 * `{ primary: null, candidates: [], consideredAll: [...everything], selectionReason }`
 * so the caller can surface a structured "no model available" error to the user.
 */
export interface ResolveModelResult {
    /**
     * Ordered list (highest priority first) of candidates that passed the
     * credential pre-flight. The first item is what
     * {@link AIPromptRunner.ExecutePrompt} would pick today.
     */
    candidates: ResolvedModelCandidate[];
    /** Convenience pointer to `candidates[0]` or `null` if none had credentials. */
    primary: ResolvedModelCandidate | null;
    /**
     * Every candidate considered, including those filtered out for missing
     * credentials. Used to populate `AIModelSelectionInfo` diagnostics.
     */
    consideredAll: ResolvedModelCandidate[];
    /** Human-readable narrative of why the primary was (or wasn't) chosen. */
    selectionReason: string;
}

/**
 * One row in the failover history of a {@link ModelResolver.WithFailover} run.
 * Mirrors the existing private `FailoverAttempt` struct in `AIPromptRunner.ts`
 * so the runner's existing logging / `MJ: AI Prompt Runs` payload shape is
 * preserved verbatim.
 */
export interface FailoverAttempt {
    attemptNumber: number;
    modelId: string;
    vendorId?: string;
    error: Error;
    errorType: string;
    duration: number;
    timestamp: Date;
}

/** Outcome of a {@link ModelResolver.WithFailover} run that ultimately succeeded. */
export interface WithFailoverResult<T> {
    /** Whatever the caller's `fn` returned. */
    result: T;
    /** The candidate whose attempt finally succeeded. */
    winner: ResolvedModelCandidate;
    /** Total candidate attempts made (including the winner). */
    attemptsUsed: number;
    /**
     * Per-attempt diagnostics. Includes the winner's metadata as the last
     * entry only when the winning attempt itself recorded a transient retry.
     * Failed attempts are always present.
     */
    failoverAttempts: FailoverAttempt[];
}

/**
 * Per-call options to override what would otherwise come from a prompt entity.
 * Use this from non-prompt code paths (embeddings, rerankers, ad-hoc LLM calls).
 *
 * For prompt-driven flows, the prompt entity's own fields drive these and the
 * caller passes only `contextUser`.
 */
export interface WithFailoverOptions {
    /**
     * Required for non-prompt callers. Defaults documented per-capability:
     * - LLM ad-hoc / embeddings / reranker / image-gen: `'SameModelDifferentVendor'`
     *   (resilience-by-default for infrastructure capabilities).
     * - Prompt-driven flows: derived from `MJAIPromptEntity.FailoverStrategy`.
     *
     * Retrofit sites MUST pass the prompt's strategy verbatim — never silently
     * upgrade `'None'` to anything else "for resilience." See audit §3.5.8.
     */
    failoverStrategy?: FailoverStrategy;
    /** Used only when `failoverStrategy === 'NextBestModel'`. */
    modelStrategy?: FailoverModelStrategy;
    /** Defaults to `'All'`. */
    errorScope?: FailoverErrorScope;
    /** Cap on total candidate attempts. Defaults to `candidates.length`. */
    maxAttempts?: number;
    /** Base delay in seconds; resolver applies exponential backoff. */
    delaySeconds?: number;
    /** Forwarded to credential resolution and any audit / log calls. */
    contextUser?: UserInfo;
    /** Additional progress log lines when true. */
    verbose?: boolean;
}

/**
 * Lookup target for {@link ModelResolver.ResolveCredential}. The resolver
 * walks the 7-tier credential hierarchy in order:
 *
 * 1. Per-request `credentialId`
 * 2. `AICredentialBinding` for `(Prompt, Model)` (a.k.a. `PromptModel`)
 * 3. `AICredentialBinding` for `(Model, Vendor)` (a.k.a. `ModelVendor`)
 * 4. `AICredentialBinding` for `Vendor`
 * 5. Type-based default `Credential` (matching `AIVendorTypeDefinition`)
 * 6. Legacy `apiKeys[]` carrier on the request
 * 7. Legacy `AI_VENDOR_API_KEY__<DRIVER>` env var via `GetAIAPIKey`
 */
export interface CredentialResolutionTargets {
    promptId?: string;
    modelId?: string;
    vendorId?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Sentinel error thrown by Phase-1-stub method bodies so callers get a clear
 * compile-and-run picture: "this surface exists, but the implementation lands
 * in a subsequent commit on this same branch." Distinct from
 * `Error('not implemented')` so test runners and lint rules can match it
 * exactly.
 */
class ModelResolverPhase1NotImplementedError extends Error {
    constructor(method: string) {
        super(
            `[ModelResolver.${method}] Phase 1 stub — implementation lands in ` +
            `the extraction commit on the feat/ai-model-resolver-phase1 branch. ` +
            `See PHASE_1_MODEL_RESOLVER_SPEC.md.`
        );
        this.name = 'ModelResolverPhase1NotImplementedError';
    }
}

/**
 * Public, reusable model+vendor resolution and cross-vendor failover service.
 *
 * Three-entry surface:
 *   1. {@link ResolveForPrompt}        — drive selection from an
 *      `MJAIPrompt` entity (uses `SelectionStrategy` / `AIPromptModel` /
 *      configuration inheritance / power preferences / `RequireSpecificModels`
 *      exactly like `AIPromptRunner` does).
 *   2. {@link ResolveForRequirements}  — drive selection from a flat
 *      parameter object, for callers that don't have a prompt (embeddings,
 *      rerankers, ad-hoc LLM calls in resolvers / extensions).
 *   3. {@link WithFailover}            — execute an arbitrary async function
 *      against a candidate list with the runner's full
 *      error-classification / vendor-filtering / rate-limit-retry /
 *      `ContextLengthExceeded`-aware logic.
 *
 * Plus the credential pre-flight, exposed publicly because audit gap call
 * sites need to filter candidate lists without actually executing anything
 * (e.g., the AI dashboard's "show only configured models" view):
 *
 *   4. {@link ResolveCredential}       — lookup a credential blob via the
 *      7-tier hierarchy.
 *   5. {@link HasCredentialsAvailable} — sync, in-memory pre-flight check.
 *
 * Stateless beyond the {@link BaseSingleton} inheritance — every method
 * receives all the context it needs via parameters.
 */
export class ModelResolver extends BaseSingleton<ModelResolver> {
    public static get Instance(): ModelResolver {
        return super.getInstance<ModelResolver>();
    }

    protected constructor() {
        super();
    }

    // -----------------------------------------------------------------------
    // Public API — selection
    // -----------------------------------------------------------------------

    /**
     * Resolve the candidate list for a prompt entity.
     *
     * Honors the prompt's `SelectionStrategy` (`'Default' | 'Specific' |
     * 'ByPower'`), `AIPromptModel` bindings, `AIConfiguration` inheritance
     * chain, `RequireSpecificModels`, `MinPowerRank`, and `PowerPreference`
     * fields exactly as `AIPromptRunner.selectModel` does today.
     *
     * Order: candidates are sorted highest-priority first; the first item is
     * what `ExecutePrompt` would pick.
     *
     * Never throws. When no candidate has credentials, returns
     * `{ primary: null, candidates: [], consideredAll: [...everything] }` so
     * the caller can surface a structured "no model available" error.
     *
     * Logs: at most one info-level summary per call ("Selected X via Y, N
     * valid candidates of M total"). Per-candidate verbose logs only when
     * `overrides.verbose === true`.
     */
    public async ResolveForPrompt(
        _prompt: MJAIPromptEntityExtended,
        _overrides?: {
            modelId?: string;
            vendorId?: string;
            credentialId?: string;
            apiKeys?: AIAPIKey[];
            verbose?: boolean;
        },
        _contextUser?: UserInfo,
    ): Promise<ResolveModelResult> {
        throw new ModelResolverPhase1NotImplementedError('ResolveForPrompt');
    }

    /**
     * Resolve the candidate list from a free-form requirements object — for
     * callers that don't have a prompt entity (embeddings, rerankers, the
     * GraphQL `ExecuteSimplePrompt` mutation, the Templates Nunjucks
     * `{% AIPrompt %}` extension, image-gen, etc.).
     *
     * Same ordering semantics as {@link ResolveForPrompt}. Never throws.
     */
    public async ResolveForRequirements(
        _req: ModelResolveRequirements,
        _contextUser?: UserInfo,
    ): Promise<ResolveModelResult> {
        throw new ModelResolverPhase1NotImplementedError('ResolveForRequirements');
    }

    // -----------------------------------------------------------------------
    // Public API — failover execution
    // -----------------------------------------------------------------------

    /**
     * Iterate a candidate list calling `fn` with each, with the runner's
     * full error-classification / failover / rate-limit-retry / vendor
     * filtering / `ContextLengthExceeded` short-circuit logic.
     *
     * Returns the first successful result. Throws an
     * AggregateError-style `Error` (with `cause` chain) only when every
     * candidate fails or a Fatal error short-circuits the loop. The thrown
     * error carries `failoverAttempts` for diagnostics.
     *
     * Order is the order of `candidates`. The `fn` is responsible for
     * actually invoking the provider (e.g., constructing a `BaseLLM` and
     * calling `ChatCompletion`). The resolver only manages the loop.
     *
     * **Honoring `FailoverStrategy`** (per audit §3.5.8 — non-negotiable):
     * - `options.failoverStrategy === 'None'` makes this method execute
     *   `fn(candidates[0], 0)` exactly once. On failure, it throws — never
     *   walks the list. This is the prompt designer's hard-fail escape
     *   hatch.
     * - `'SameModelDifferentVendor'` filters the surviving candidate pool
     *   to the same `AIModel.ID` as the failed attempt's candidate before
     *   the next iteration.
     * - `'NextBestModel'` allows walking to a different model row.
     */
    public async WithFailover<T>(
        _candidates: ResolvedModelCandidate[],
        _fn: (candidate: ResolvedModelCandidate, attemptIndex: number) => Promise<T>,
        _options?: WithFailoverOptions,
    ): Promise<WithFailoverResult<T>> {
        throw new ModelResolverPhase1NotImplementedError('WithFailover');
    }

    // -----------------------------------------------------------------------
    // Public API — credentials
    // -----------------------------------------------------------------------

    /**
     * Resolve credentials for a `(driver, prompt?, model?, vendor?)` tuple
     * via the 7-tier hierarchy described on
     * {@link CredentialResolutionTargets}. Returns the resolved
     * JSON-serialized credential blob (matching today's
     * `AIPromptRunner.resolveCredentialForExecution` return value), or
     * `null` when nothing is available.
     *
     * Never throws on missing credentials. May throw if `options.credentialId`
     * is supplied but the credential row doesn't exist (preserves today's
     * `resolveCredentialById` behavior).
     */
    public async ResolveCredential(
        _driverClass: string,
        _targets: CredentialResolutionTargets,
        _options?: {
            credentialId?: string;
            apiKeys?: AIAPIKey[];
            contextUser?: UserInfo;
            verbose?: boolean;
        },
    ): Promise<string | null> {
        throw new ModelResolverPhase1NotImplementedError('ResolveCredential');
    }

    /**
     * Pre-flight check used by both {@link ResolveForPrompt} and
     * {@link ResolveForRequirements} to mark each candidate's
     * `credentialsAvailable`. Exposed publicly because a few audit gap call
     * sites just want to filter a model list without actually executing
     * anything (e.g., the AI dashboard's "show only configured models" view).
     *
     * Synchronous because it consults the in-memory `CredentialEngine.Credentials`
     * and `AIEngine.PromptModels` arrays — no DB I/O.
     */
    public HasCredentialsAvailable(
        _driverClass: string,
        _targets: CredentialResolutionTargets,
        _options?: { apiKeys?: AIAPIKey[]; contextUser?: UserInfo },
    ): boolean {
        throw new ModelResolverPhase1NotImplementedError('HasCredentialsAvailable');
    }
}

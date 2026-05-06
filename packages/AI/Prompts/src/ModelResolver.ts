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

import { BaseSingleton, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { UserInfo, IsVerboseLoggingEnabled, LogStatus, LogStatusEx, LogErrorEx } from '@memberjunction/core';
import { AIAPIKey, GetAIAPIKey, ErrorAnalyzer, AIErrorInfo } from '@memberjunction/ai';
import {
    MJAIModelEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { MJAIVendorEntity, MJAICredentialBindingEntity, MJCredentialEntity, MJAIPromptModelEntity, MJAIModelVendorEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { CredentialEngine } from '@memberjunction/credentials';

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
    /**
     * Used only for diagnostic log tagging in `logFailoverAttempt`. Optional —
     * non-prompt callers (e.g., embeddings) may omit it without losing
     * functional behavior; only the per-attempt log line's `promptId` field
     * will be undefined.
     */
    promptId?: string;
    /**
     * Rate-limit retry budget on the SAME candidate before giving up and
     * moving to the next one. Mirrors `MJAIPromptEntity.MaxRetries`.
     * Defaults to 3.
     *
     * This is a separate budget from `maxAttempts` — `maxAttempts` caps
     * total cross-candidate attempts; `maxRateLimitRetries` caps how many
     * times we'll retry the same `(model, vendor)` pair on a 429 before
     * failing it over.
     */
    maxRateLimitRetries?: number;
    /**
     * Backoff strategy for rate-limit retries on the same candidate.
     * Mirrors `MJAIPromptEntity.RetryStrategy`. Defaults to `'Fixed'`.
     */
    rateLimitRetryStrategy?: 'Fixed' | 'Linear' | 'Exponential';
    /**
     * Base delay in milliseconds for the first rate-limit retry on the
     * same candidate. Subsequent retries scale by the strategy.
     * Mirrors `MJAIPromptEntity.RetryDelayMS`. Defaults to 1000.
     */
    rateLimitRetryDelayMs?: number;
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
        prompt: MJAIPromptEntityExtended,
        overrides?: {
            modelId?: string;
            vendorId?: string;
            /**
             * Walks the AIConfiguration inheritance chain when present. Mirrors
             * the runner's `params.configurationId`. Spec §2.2 omitted this
             * field; added here because the runner's `selectModel` requires it
             * and its 3 callers all pass `params.configurationId` through.
             */
            configurationId?: string;
            credentialId?: string;
            apiKeys?: AIAPIKey[];
            verbose?: boolean;
            /** Cap on logged error message length. See `ResolveCredential`. */
            maxErrorLength?: number;
        },
        contextUser?: UserInfo,
    ): Promise<ResolveModelResult> {
        try {
            // AIEngine holds the cached Models / ModelVendors / PromptModels / Configurations / VendorTypeDefinitions.
            await AIEngine.Instance.Config(false, contextUser);

            const explicitModelId = overrides?.modelId;
            const vendorId = overrides?.vendorId;
            const configurationId = overrides?.configurationId;
            const verbose = overrides?.verbose === true || IsVerboseLoggingEnabled();

            // Phase 1-3 candidate building (3-phase algorithm preserved verbatim from runner).
            const built = this.buildModelVendorCandidates(
                prompt,
                explicitModelId,
                configurationId,
                vendorId,
                verbose,
            );

            if (built.length === 0) {
                LogErrorEx({
                    message: `No suitable model candidates found for prompt ${prompt.Name}`,
                    category: 'ModelSelection',
                    severity: 'critical',
                    metadata: { promptId: prompt.ID, promptName: prompt.Name },
                });
                return {
                    candidates: [],
                    primary: null,
                    consideredAll: [],
                    selectionReason: 'No suitable model candidates found',
                };
            }

            // Run the credential pre-flight on every candidate. Marks each
            // candidate's `credentialsAvailable` and produces `consideredAll`.
            const preflight = await this.runCredentialPreflight(
                built,
                prompt.ID,
                {
                    credentialId: overrides?.credentialId,
                    apiKeys: overrides?.apiKeys,
                    contextUser,
                    verbose: overrides?.verbose,
                    maxErrorLength: overrides?.maxErrorLength,
                },
            );

            const consideredAll = preflight.consideredAll;
            const candidates = consideredAll.filter(c => c.credentialsAvailable);
            const primary = preflight.primary;

            // Build the human-readable selection reason — mirror the runner's narrative.
            let selectionReason: string;
            if (!primary) {
                selectionReason = 'No API keys found for any model-vendor combination';
            } else {
                selectionReason = `Selected ${primary.model.Name} via ${primary.vendorName || 'default vendor'}`;
                if (primary.source === 'explicit') {
                    selectionReason = `Explicitly requested model ${primary.model.Name}`;
                } else if (primary.source === 'prompt-model') {
                    selectionReason = `Selected from prompt-specific models (priority: ${primary.priority})`;
                } else if (primary.source === 'model-type') {
                    selectionReason = `Selected based on model type filtering`;
                } else if (primary.source === 'power-rank') {
                    selectionReason = `Selected by power rank (${primary.model.PowerRank || 0})`;
                } else if (primary.source === 'power-match-fallback') {
                    selectionReason = `Fallback: selected ${primary.model.Name} (PowerRank ${primary.model.PowerRank || 0}) as closest match to configured models' power level`;
                }
                if (primary.isPreferredVendor) {
                    selectionReason += ' using preferred vendor';
                }
            }

            return { candidates, primary, consideredAll, selectionReason };
        } catch (error) {
            let errorMessage = error instanceof Error ? error.message : String(error);
            if (overrides?.maxErrorLength !== undefined && errorMessage.length > overrides.maxErrorLength) {
                errorMessage = errorMessage.substring(0, overrides.maxErrorLength) + '... [truncated]';
            }
            LogErrorEx({
                message: errorMessage,
                error: error instanceof Error ? error : undefined,
                category: 'ModelSelection',
                severity: 'error',
                metadata: { promptId: prompt.ID, promptName: prompt.Name },
            });
            return {
                candidates: [],
                primary: null,
                consideredAll: [],
                selectionReason: `Error during model selection: ${errorMessage}`,
            };
        }
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
        req: ModelResolveRequirements,
        contextUser?: UserInfo,
    ): Promise<ResolveModelResult> {
        try {
            await AIEngine.Instance.Config(false, contextUser);

            // Resolve modelTypeName -> modelTypeId (case-sensitive, matches AIModelType.Name).
            let modelTypeId = req.modelTypeId;
            if (!modelTypeId && req.modelTypeName) {
                const mt = AIEngine.Instance.ModelTypes.find(t => t.Name === req.modelTypeName);
                modelTypeId = mt?.ID;
            }

            // Resolve vendorName -> vendorId (case-sensitive, matches AIVendor.Name).
            let vendorId = req.vendorId;
            if (!vendorId && req.vendorName) {
                const v = AIEngine.Instance.Vendors.find(vv => vv.Name === req.vendorName);
                vendorId = v?.ID;
            }

            let candidates: ResolvedModelCandidate[] = [];

            if (req.modelId) {
                // Pin to a specific model.
                const modelId = req.modelId;
                const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, modelId));
                if (model && model.IsActive) {
                    if (modelTypeId && !UUIDsEqual(model.AIModelTypeID, modelTypeId)) {
                        // Pinned model doesn't match the requested type — return empty.
                    } else {
                        candidates = this.createCandidatesForModel(model, 20000, 'explicit', vendorId);
                    }
                }
            } else {
                // Filter the model pool by modelTypeId and minPowerRank, then create per-vendor candidates.
                let pool = AIEngine.Instance.Models.filter(m => m.IsActive);
                if (modelTypeId) {
                    pool = pool.filter(m => UUIDsEqual(m.AIModelTypeID, modelTypeId!));
                }
                if (req.minPowerRank !== undefined) {
                    pool = pool.filter(m => (m.PowerRank ?? 0) >= req.minPowerRank!);
                }

                const sortedPool = req.powerPreference
                    ? this.sortByPowerPreference(pool, req.powerPreference)
                    : pool.sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0));

                sortedPool.forEach((model, idx) => {
                    const basePriority = 1000 - idx * 10;
                    const source: ModelResolverCandidateSource = req.powerPreference ? 'power-rank' : 'model-type';
                    candidates.push(...this.createCandidatesForModel(model, basePriority, source, vendorId));
                });
            }

            candidates.sort((a, b) => b.priority - a.priority);

            if (candidates.length === 0) {
                return {
                    candidates: [],
                    primary: null,
                    consideredAll: [],
                    selectionReason: 'No suitable model candidates matched the requirements',
                };
            }

            // Pre-flight credentials. Note: no promptId for requirements-based resolution,
            // so the PromptModel-binding tier of the credential hierarchy is skipped.
            const preflight = await this.runCredentialPreflight(
                candidates,
                undefined,
                {
                    credentialId: req.credentialId,
                    apiKeys: req.apiKeys,
                    contextUser,
                },
            );

            const consideredAll = preflight.consideredAll;
            const filtered = consideredAll.filter(c => c.credentialsAvailable);
            const primary = preflight.primary;

            return {
                candidates: filtered,
                primary,
                consideredAll,
                selectionReason: primary
                    ? `Selected ${primary.model.Name} via ${primary.vendorName || 'default vendor'}`
                    : 'No API keys found for any model-vendor combination',
            };
        } catch (error) {
            return {
                candidates: [],
                primary: null,
                consideredAll: [],
                selectionReason: `Error during requirements-based model selection: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
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
        candidates: ResolvedModelCandidate[],
        fn: (candidate: ResolvedModelCandidate, attemptIndex: number) => Promise<T>,
        options?: WithFailoverOptions,
    ): Promise<WithFailoverResult<T>> {
        if (candidates.length === 0) {
            const err = new Error('WithFailover: no candidates supplied') as Error & {
                cause?: Error;
                failoverAttempts?: FailoverAttempt[];
            };
            err.failoverAttempts = [];
            throw err;
        }

        const failoverStrategy = options?.failoverStrategy ?? 'SameModelDifferentVendor';
        const errorScope = options?.errorScope ?? 'All';
        const maxAttempts = options?.maxAttempts ?? candidates.length;
        const promptId = options?.promptId;
        const maxRateLimitRetries = options?.maxRateLimitRetries ?? 3;
        const rateLimitRetryStrategy = options?.rateLimitRetryStrategy;
        const rateLimitRetryDelayMs = options?.rateLimitRetryDelayMs;

        const failoverAttempts: FailoverAttempt[] = [];
        let lastError: Error | null = null;

        // 'None' strategy — execute first candidate only, never walk the list.
        // This is the prompt designer's hard-fail escape hatch (audit §3.5.8).
        if (failoverStrategy === 'None') {
            const candidate = candidates[0];
            const attemptStartTime = Date.now();
            try {
                const result = await fn(candidate, 0);
                return {
                    result,
                    winner: candidate,
                    attemptsUsed: 1,
                    failoverAttempts: [],
                };
            } catch (error) {
                const err = error as Error & { errorInfo?: AIErrorInfo };
                const errorInfo = err.errorInfo ?? ErrorAnalyzer.analyzeError(err);
                failoverAttempts.push({
                    attemptNumber: 1,
                    modelId: candidate.model.ID,
                    vendorId: candidate.vendorId,
                    error: err,
                    errorType: errorInfo.errorType,
                    duration: Date.now() - attemptStartTime,
                    timestamp: new Date(),
                });
                const wrapped = new Error(err.message || 'Candidate failed (FailoverStrategy=None)') as Error & {
                    cause?: Error;
                    failoverAttempts?: FailoverAttempt[];
                };
                wrapped.cause = err;
                wrapped.failoverAttempts = failoverAttempts;
                throw wrapped;
            }
        }

        let activeCandidates = [...candidates];

        for (let i = 0; i < activeCandidates.length; i++) {
            const candidate = activeCandidates[i];
            const attemptStartTime = Date.now();

            try {
                if (i > 0) {
                    LogStatusEx({
                        message: `🔄 Trying candidate ${i + 1}/${activeCandidates.length}: ${candidate.model.Name} via ${candidate.vendorName || 'default'}`,
                        category: 'AI',
                        additionalArgs: [{
                            promptId,
                            modelId: candidate.model.ID,
                            model: candidate.model.Name,
                            vendorId: candidate.vendorId,
                            vendor: candidate.vendorName,
                            attemptNumber: i + 1,
                        }],
                    });
                }

                const result = await fn(candidate, i);
                return {
                    result,
                    winner: candidate,
                    attemptsUsed: i + 1 + failoverAttempts.filter(a => a.errorType === 'RateLimit' && UUIDsEqual(a.modelId, candidate.model.ID)).length,
                    failoverAttempts,
                };
            } catch (error) {
                lastError = error as Error;
                // The runner's wrapper attaches `errorInfo` to the thrown Error
                // when re-raising a `ChatResult{success:false, errorInfo:{canFailover:true}}`
                // — honor that. Otherwise, fall through to ErrorAnalyzer.
                const errorInfo = (lastError as Error & { errorInfo?: AIErrorInfo }).errorInfo
                    ?? ErrorAnalyzer.analyzeError(lastError);

                const decision = await this.processFailoverError(
                    lastError,
                    errorInfo,
                    candidate,
                    attemptStartTime,
                    i,
                    activeCandidates,
                    failoverAttempts,
                    {
                        promptId,
                        errorScope,
                        maxAttempts,
                        maxRateLimitRetries,
                        rateLimitRetryStrategy,
                        rateLimitRetryDelayMs,
                    },
                );

                activeCandidates = decision.updatedCandidates;
                if (decision.shouldRetry) { i--; continue; }
                if (decision.shouldContinue) { continue; }
                break; // Fatal or last candidate
            }
        }

        // Every candidate failed. Wrap with diagnostic context for the caller's catch path.
        const wrapped = new Error(lastError?.message ?? 'All failover candidates failed') as Error & {
            cause?: Error;
            failoverAttempts?: FailoverAttempt[];
        };
        if (lastError) wrapped.cause = lastError;
        wrapped.failoverAttempts = failoverAttempts;
        throw wrapped;
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
        driverClass: string,
        targets: CredentialResolutionTargets,
        options?: {
            credentialId?: string;
            apiKeys?: AIAPIKey[];
            contextUser?: UserInfo;
            verbose?: boolean;
            /**
             * Cap on error message length when logging credential resolution
             * failures from the catch block of `tryResolveCredential`. Mirrors
             * the runner's `params.maxErrorLength` behavior, which exists to
             * tame providers like Groq that dump multi-kilobyte
             * `failed_generation` JSON payloads into Error.message.
             */
            maxErrorLength?: number;
        },
    ): Promise<string | null> {
        const verbose = options?.verbose === true || IsVerboseLoggingEnabled();
        const contextUser = options?.contextUser;
        const apiKeys = options?.apiKeys;
        const maxErrorLength = options?.maxErrorLength;

        // Priority 1: Per-request override - explicit choice, no failover
        if (options?.credentialId) {
            return await this.resolveCredentialById(options.credentialId, 'per-request override', contextUser, verbose);
        }

        // Ensure CredentialEngine is configured for binding lookups
        await CredentialEngine.Instance.Config(false, contextUser);

        // Priority 2: PromptModel bindings (most specific) - with failover
        if (targets.promptId && targets.modelId) {
            const promptId = targets.promptId;
            const modelId = targets.modelId;
            const promptModel = AIEngine.Instance.PromptModels.find(
                pm => UUIDsEqual(pm.PromptID, promptId) && UUIDsEqual(pm.ModelID, modelId),
            );
            if (promptModel) {
                const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('PromptModel', promptModel.ID);
                const result = await this.tryCredentialBindingsWithFailover(bindings, 'AICredentialBinding(PromptModel)', contextUser, verbose, maxErrorLength);
                if (result) return result;
            }
        }

        // Priority 3: ModelVendor bindings - with failover
        if (targets.modelId && targets.vendorId) {
            const modelId = targets.modelId;
            const vendorId = targets.vendorId;
            const modelVendor = AIEngine.Instance.ModelVendors.find(
                mv => UUIDsEqual(mv.ModelID, modelId) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active',
            );
            if (modelVendor) {
                const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('ModelVendor', modelVendor.ID);
                const result = await this.tryCredentialBindingsWithFailover(bindings, 'AICredentialBinding(ModelVendor)', contextUser, verbose, maxErrorLength);
                if (result) return result;
            }
        }

        // Priority 4: Vendor bindings - with failover
        if (targets.vendorId) {
            const bindings = AIEngine.Instance.GetCredentialBindingsForTarget('Vendor', targets.vendorId);
            const result = await this.tryCredentialBindingsWithFailover(bindings, 'AICredentialBinding(Vendor)', contextUser, verbose, maxErrorLength);
            if (result) return result;
        }

        // Priority 5: Type-based default credential
        // If the vendor declares a CredentialTypeID, try to find a default credential of that type
        if (targets.vendorId) {
            const vendorId = targets.vendorId;
            const vendor = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, vendorId));
            if (vendor?.CredentialTypeID) {
                const defaultCredential = this.findDefaultCredentialByType(vendor.CredentialTypeID);
                if (defaultCredential) {
                    const result = await this.tryResolveCredential(defaultCredential, 'type-based default', contextUser, verbose, false, maxErrorLength);
                    if (result) return result;
                }
            }
        }

        // No credential bindings found - fall back to legacy methods
        if (verbose) {
            LogStatusEx({
                message: `   Using legacy API key resolution for driver ${driverClass}`,
                verboseOnly: true,
                isVerboseEnabled: () => true,
            });
        }

        // Priority 6 & 7: Legacy apiKeys array and environment variables
        return GetAIAPIKey(driverClass, apiKeys, verbose);
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
        driverClass: string,
        targets: CredentialResolutionTargets,
        options?: {
            apiKeys?: AIAPIKey[];
            contextUser?: UserInfo;
            /**
             * Per-request credential override. When supplied, the method
             * returns `true` immediately — the explicit ID is treated as a
             * "trust-me" signal and the actual credential row is validated
             * later at execution time by {@link ResolveCredential}. Mirrors
             * the runner's pre-extraction behavior where
             * `params.credentialId` short-circuits the pre-flight.
             */
            credentialId?: string;
            verbose?: boolean;
        },
    ): boolean {
        // Priority 1: Per-request override
        if (options?.credentialId) {
            // Assume valid if credential ID is provided - will be validated at execution time
            return true;
        }

        // Priority 2: PromptModel bindings
        if (targets.promptId && targets.modelId) {
            const promptId = targets.promptId;
            const modelId = targets.modelId;
            const promptModel = AIEngine.Instance.PromptModels.find(
                pm => UUIDsEqual(pm.PromptID, promptId) && UUIDsEqual(pm.ModelID, modelId),
            );
            if (promptModel && AIEngine.Instance.HasCredentialBindings('PromptModel', promptModel.ID)) {
                return true;
            }
        }

        // Priority 3: ModelVendor bindings
        if (targets.modelId && targets.vendorId) {
            const modelId = targets.modelId;
            const vendorId = targets.vendorId;
            const modelVendor = AIEngine.Instance.ModelVendors.find(
                mv => UUIDsEqual(mv.ModelID, modelId) && UUIDsEqual(mv.VendorID, vendorId) && mv.Status === 'Active',
            );
            if (modelVendor && AIEngine.Instance.HasCredentialBindings('ModelVendor', modelVendor.ID)) {
                return true;
            }
        }

        // Priority 4: Vendor bindings
        if (targets.vendorId) {
            if (AIEngine.Instance.HasCredentialBindings('Vendor', targets.vendorId)) {
                return true;
            }
        }

        // Priority 5: Type-based default credential
        if (targets.vendorId) {
            const vendorId = targets.vendorId;
            const vendor = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, vendorId));
            if (vendor?.CredentialTypeID) {
                const defaultCredential = this.findDefaultCredentialByType(vendor.CredentialTypeID);
                if (defaultCredential) {
                    return true;
                }
            }
        }

        // Priority 6 & 7: Legacy methods - check if API key is available
        const apiKey = GetAIAPIKey(driverClass, options?.apiKeys, options?.verbose);
        return this.isValidAPIKey(apiKey);
    }

    // -----------------------------------------------------------------------
    // Private helpers — credential resolution (lifted from AIPromptRunner)
    // -----------------------------------------------------------------------

    /**
     * Attempts to resolve credentials from bindings with priority-based failover.
     * Tries each binding in priority order until one succeeds.
     */
    private async tryCredentialBindingsWithFailover(
        bindings: MJAICredentialBindingEntity[],
        source: string,
        contextUser: UserInfo | undefined,
        verbose: boolean,
        maxErrorLength: number | undefined,
    ): Promise<string | null> {
        if (bindings.length === 0) return null;

        for (let i = 0; i < bindings.length; i++) {
            const binding = bindings[i];
            const credential = CredentialEngine.Instance.getCredentialById(binding.CredentialID);

            if (!credential) {
                if (verbose) {
                    LogStatusEx({
                        message: `   ⚠️ Credential ${binding.CredentialID} not found (priority ${binding.Priority}), trying next...`,
                        verboseOnly: true,
                        isVerboseEnabled: () => true,
                    });
                }
                continue;
            }

            const result = await this.tryResolveCredential(
                credential,
                `${source} priority ${binding.Priority}`,
                contextUser,
                verbose,
                i < bindings.length - 1,  // hasMoreBindings
                maxErrorLength,
            );

            if (result) return result;
        }

        return null;
    }

    /**
     * Attempts to resolve a single credential, returning null on failure for failover support.
     */
    private async tryResolveCredential(
        credential: MJCredentialEntity,
        source: string,
        contextUser: UserInfo | undefined,
        verbose: boolean,
        hasMoreBindings: boolean,
        maxErrorLength: number | undefined,
    ): Promise<string | null> {
        try {
            // Check if credential is active and not expired
            if (!credential.IsActive) {
                if (verbose) {
                    LogStatusEx({
                        message: `   ⚠️ Credential "${credential.Name}" is inactive, trying next...`,
                        verboseOnly: true,
                        isVerboseEnabled: () => true,
                    });
                }
                return null;
            }

            if (credential.ExpiresAt && new Date(credential.ExpiresAt) < new Date()) {
                if (verbose) {
                    LogStatusEx({
                        message: `   ⚠️ Credential "${credential.Name}" has expired, trying next...`,
                        verboseOnly: true,
                        isVerboseEnabled: () => true,
                    });
                }
                return null;
            }

            // Resolve the credential values
            const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
                credentialId: credential.ID,
                contextUser,
                // Preserve the existing telemetry tag so observability dashboards
                // keyed off `subsystem` keep matching after the extraction.
                subsystem: 'AIPromptRunner',
            });

            if (verbose) {
                LogStatusEx({
                    message: `   🔐 Using credential from ${source}: "${credential.Name}"`,
                    verboseOnly: true,
                    isVerboseEnabled: () => true,
                });
            }

            return JSON.stringify(resolved.values);

        } catch (error) {
            if (hasMoreBindings) {
                // More bindings to try - log warning and continue
                if (verbose) {
                    LogStatusEx({
                        message: `   ⚠️ Failed to resolve credential "${credential.Name}" from ${source}: ${error instanceof Error ? error.message : String(error)}, trying next...`,
                        verboseOnly: true,
                        isVerboseEnabled: () => true,
                    });
                }
                return null;
            } else {
                // No more bindings - log warning but still return null for legacy fallback
                let errorMessage = error instanceof Error ? error.message : String(error);
                if (maxErrorLength !== undefined && errorMessage.length > maxErrorLength) {
                    errorMessage = errorMessage.substring(0, maxErrorLength) + '... [truncated]';
                }
                LogErrorEx({
                    message: errorMessage,
                    error: error instanceof Error ? error : undefined,
                    category: 'CredentialResolution',
                    severity: 'warning',
                    metadata: {
                        credentialId: credential.ID,
                        credentialName: credential.Name,
                        source,
                    },
                });
                return null;
            }
        }
    }

    /**
     * Resolves a credential by its explicit ID (used for per-request override).
     * This does not support failover since it's an explicit choice.
     */
    private async resolveCredentialById(
        credentialId: string,
        source: string,
        contextUser: UserInfo | undefined,
        verbose: boolean,
    ): Promise<string> {
        await CredentialEngine.Instance.Config(false, contextUser);

        const credential = CredentialEngine.Instance.getCredentialById(credentialId);
        if (!credential) {
            throw new Error(`Credential with ID ${credentialId} not found`);
        }

        const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
            credentialId,
            contextUser,
            subsystem: 'AIPromptRunner',
        });

        if (verbose) {
            LogStatusEx({
                message: `   🔐 Using credential from ${source}: "${credential.Name}"`,
                verboseOnly: true,
                isVerboseEnabled: () => true,
            });
        }

        return JSON.stringify(resolved.values);
    }

    /**
     * Finds a default credential matching a specific credential type.
     */
    private findDefaultCredentialByType(credentialTypeId: string): MJCredentialEntity | null {
        const credentials = CredentialEngine.Instance.Credentials;
        return credentials.find(c =>
            UUIDsEqual(c.CredentialTypeID, credentialTypeId) &&
            c.IsDefault === true &&
            c.IsActive === true &&
            (!c.ExpiresAt || new Date(c.ExpiresAt) > new Date()),
        ) || null;
    }

    /**
     * Validates an API key string — robust against `null`, `undefined`, and
     * whitespace-only values that some env-var loaders produce when a variable
     * is set but empty.
     */
    private isValidAPIKey(apiKey: string | undefined | null): boolean {
        if (apiKey === undefined || apiKey === null) {
            return false;
        }
        const trimmed = apiKey.trim();
        return trimmed.length > 0;
    }

    // -----------------------------------------------------------------------
    // Public — vendor-type predicate
    // -----------------------------------------------------------------------

    /**
     * Returns `true` when the given `MJAIModelVendor` row represents an
     * inference provider (the entity that actually serves the API), as
     * opposed to a model developer (the entity that trained/created the
     * model). Distinguishes by `AIVendorTypeDefinition.Name === 'Inference Provider'`.
     *
     * Falls back to "anything that isn't a `Model Developer`" if the
     * `Inference Provider` type definition row is absent — defensive coding
     * for partial metadata installs.
     *
     * Public because two runner-internal call sites that stayed in
     * `AIPromptRunner` (the `createPromptRun` vendor-fallback lookup and
     * `executeModel`'s vendor-row resolver) need the same predicate.
     */
    public IsInferenceProvider(modelVendor: MJAIModelVendorEntity): boolean {
        const inferenceProviderType = AIEngine.Instance.VendorTypeDefinitions.find(
            vt => vt.Name === 'Inference Provider',
        );

        if (!inferenceProviderType) {
            const modelDeveloperType = AIEngine.Instance.VendorTypeDefinitions.find(
                vt => vt.Name === 'Model Developer',
            );
            return !UUIDsEqual(modelVendor.TypeID, modelDeveloperType?.ID);
        }

        return UUIDsEqual(modelVendor.TypeID, inferenceProviderType.ID);
    }

    // -----------------------------------------------------------------------
    // Private — candidate building (lifted from AIPromptRunner)
    // -----------------------------------------------------------------------

    /**
     * Builds a unified, ordered list of model-vendor candidates based on all
     * selection criteria. Uses a 3-phase approach to properly handle
     * `SelectionStrategy='Specific'` with `AIPromptModel` priorities.
     *
     *  - Phase 1: Handle explicit model ID (highest priority)
     *  - Phase 2: `SelectionStrategy='Specific'` with AIPromptModel entries —
     *    use ONLY those with AIPromptModel priorities
     *  - Phase 3: General selection strategy (fallback) — blended priorities
     *    from legacy behavior
     */
    private buildModelVendorCandidates(
        prompt: MJAIPromptEntityExtended,
        explicitModelId: string | undefined,
        configurationId: string | undefined,
        preferredVendorId: string | undefined,
        verbose: boolean,
    ): ResolvedModelCandidate[] {
        if (explicitModelId) {
            return this.buildCandidatesForExplicitModel(explicitModelId, prompt, preferredVendorId);
        }
        if (prompt.SelectionStrategy === 'Specific') {
            return this.buildCandidatesForSpecificStrategy(prompt, configurationId, verbose);
        }
        return this.buildCandidatesForGeneralSelection(prompt, configurationId, preferredVendorId, verbose);
    }

    /** PHASE 1: Build candidates for explicitly specified model ID. */
    private buildCandidatesForExplicitModel(
        explicitModelId: string,
        prompt: MJAIPromptEntityExtended,
        preferredVendorId: string | undefined,
    ): ResolvedModelCandidate[] {
        const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, explicitModelId));
        if (!model || !model.IsActive) return [];
        if (prompt.AIModelTypeID && !UUIDsEqual(model.AIModelTypeID, prompt.AIModelTypeID)) return [];

        const candidates = this.createCandidatesForModel(model, 20000, 'explicit', preferredVendorId);
        candidates.sort((a, b) => b.priority - a.priority);
        return candidates;
    }

    /**
     * PHASE 2: Build candidates for `'Specific'` selection strategy.
     * Uses AIPromptModel configuration with clean ranking:
     *  1. Config-matching models first (by priority DESC)
     *  2. Then universal (null config) models (by priority DESC)
     */
    private buildCandidatesForSpecificStrategy(
        prompt: MJAIPromptEntityExtended,
        configurationId: string | undefined,
        verbose: boolean,
    ): ResolvedModelCandidate[] {
        const allPromptModels = AIEngine.Instance.PromptModels.filter(
            pm => UUIDsEqual(pm.PromptID, prompt.ID) && (pm.Status === 'Active' || pm.Status === 'Preview'),
        );

        const promptModels = this.filterPromptModelsByConfiguration(allPromptModels, configurationId);
        const sortedPromptModels = this.sortPromptModelsForSpecificStrategy(promptModels, configurationId);
        const candidates = this.buildCandidatesFromPromptModels(sortedPromptModels);

        // If RequireSpecificModels is true (or no candidates at all), enforce strict behavior.
        // This preserves the prompt designer's hard-fail semantics — see audit §3.5.8.
        if (candidates.length === 0 && prompt.RequireSpecificModels) {
            const configInfo = configurationId ? ` with configuration "${configurationId}"` : '';
            throw new Error(
                `SelectionStrategy is 'Specific' but no valid AIPromptModel candidates found for prompt "${prompt.Name}"${configInfo}. ` +
                `Please configure AIPromptModel records for this prompt.`,
            );
        }

        // When RequireSpecificModels is false, append power-matched fallbacks so
        // the system gracefully falls back to other models at a similar power
        // level if none of the specific models have credentials.
        if (!prompt.RequireSpecificModels) {
            this.appendPowerMatchedFallbackCandidates(candidates, prompt, sortedPromptModels, verbose);
        }

        if (candidates.length === 0) {
            const configInfo = configurationId ? ` with configuration "${configurationId}"` : '';
            throw new Error(
                `SelectionStrategy is 'Specific' but no valid AIPromptModel candidates found for prompt "${prompt.Name}"${configInfo}. ` +
                `Please configure AIPromptModel records for this prompt.`,
            );
        }

        if (verbose) {
            LogStatus(`Using SelectionStrategy='Specific' with ${sortedPromptModels.length} AIPromptModel entries, generated ${candidates.length} candidates`);
        }

        return candidates;
    }

    /**
     * Appends fallback candidates from the global model pool, sorted by
     * proximity to the average power rank of the originally configured
     * models. Fallback candidates are given lower priority than any specific
     * candidate so configured models are always preferred when their
     * credentials are available.
     */
    private appendPowerMatchedFallbackCandidates(
        candidates: ResolvedModelCandidate[],
        prompt: MJAIPromptEntityExtended,
        configuredPromptModels: MJAIPromptModelEntity[],
        verbose: boolean,
    ): void {
        const targetPowerRank = this.computeTargetPowerRank(configuredPromptModels);

        const existingModelIds = new Set(candidates.map(c => c.model.ID));
        const fallbackPool = AIEngine.Instance.Models.filter(
            m => m.IsActive &&
                 !existingModelIds.has(m.ID) &&
                 (!prompt.AIModelTypeID || UUIDsEqual(m.AIModelTypeID, prompt.AIModelTypeID)),
        );

        if (fallbackPool.length === 0) return;

        const sorted = this.sortByPowerProximity(fallbackPool, targetPowerRank);

        const lowestSpecificPriority = candidates.length > 0
            ? Math.min(...candidates.map(c => c.priority))
            : 1000;
        const fallbackBasePriority = lowestSpecificPriority - 100;

        sorted.forEach((model, index) => {
            const modelCandidates = this.createCandidatesForModel(
                model,
                fallbackBasePriority - index * 10,
                'power-match-fallback',
            );
            candidates.push(...modelCandidates);
        });

        if (verbose && sorted.length > 0) {
            LogStatus(
                `Appended ${sorted.length} power-matched fallback models (target PowerRank: ${targetPowerRank}) ` +
                `for prompt "${prompt.Name}" since RequireSpecificModels is false`,
            );
        }
    }

    /**
     * Computes the target power rank from configured AIPromptModel records.
     * Uses the weighted average (by priority) so higher-priority models have
     * more influence. Falls back to simple average if priorities are all zero.
     */
    private computeTargetPowerRank(promptModels: MJAIPromptModelEntity[]): number {
        if (promptModels.length === 0) return 0;

        const modelsWithPower = promptModels
            .map(pm => {
                const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
                return { powerRank: model?.PowerRank ?? 0, priority: pm.Priority || 1 };
            });

        const totalWeight = modelsWithPower.reduce((sum, m) => sum + m.priority, 0);
        if (totalWeight === 0) {
            return Math.round(modelsWithPower.reduce((sum, m) => sum + m.powerRank, 0) / modelsWithPower.length);
        }

        const weightedSum = modelsWithPower.reduce((sum, m) => sum + m.powerRank * m.priority, 0);
        return Math.round(weightedSum / totalWeight);
    }

    /** Sorts models by proximity to a target power rank. Tie-break: higher power first. */
    private sortByPowerProximity(
        models: MJAIModelEntityExtended[],
        targetPowerRank: number,
    ): MJAIModelEntityExtended[] {
        return [...models].sort((a, b) => {
            const distA = Math.abs((a.PowerRank ?? 0) - targetPowerRank);
            const distB = Math.abs((b.PowerRank ?? 0) - targetPowerRank);
            if (distA !== distB) return distA - distB;
            return (b.PowerRank ?? 0) - (a.PowerRank ?? 0);
        });
    }

    /**
     * PHASE 3: Build candidates for general selection strategies (`'Default'`
     * or `'ByPower'`). Uses configuration-aware fallback hierarchy with
     * legacy blended priority calculation.
     */
    private buildCandidatesForGeneralSelection(
        prompt: MJAIPromptEntityExtended,
        configurationId: string | undefined,
        preferredVendorId: string | undefined,
        verbose: boolean,
    ): ResolvedModelCandidate[] {
        const preferredVendorName = preferredVendorId
            ? AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, preferredVendorId))?.Name
            : undefined;

        const promptModels = this.getPromptModelsForConfiguration(prompt, configurationId);

        const candidates: ResolvedModelCandidate[] = [];

        if (promptModels.length > 0) {
            this.addPromptSpecificCandidates(candidates, promptModels, preferredVendorId);
            if (configurationId) {
                this.addConfigurationFallbackCandidates(candidates, prompt, configurationId, preferredVendorId, verbose);
            }
        } else {
            this.addStrategyBasedCandidates(candidates, prompt, preferredVendorName);
        }

        candidates.sort((a, b) => b.priority - a.priority);
        return candidates;
    }

    /**
     * Filters prompt models by configuration matching rules. Supports
     * configuration inheritance — includes models from the entire chain.
     */
    private filterPromptModelsByConfiguration(
        allPromptModels: MJAIPromptModelEntity[],
        configurationId: string | undefined,
    ): MJAIPromptModelEntity[] {
        if (configurationId) {
            const chain = AIEngine.Instance.GetConfigurationChain(configurationId);
            const chainIds = new Set(chain.map(c => NormalizeUUID(c.ID)));

            return allPromptModels.filter(
                pm => (pm.ConfigurationID && chainIds.has(NormalizeUUID(pm.ConfigurationID))) ||
                      pm.ConfigurationID === null,
            );
        }
        return allPromptModels.filter(pm => pm.ConfigurationID === null);
    }

    /**
     * Sorts prompt models for `'Specific'` strategy. Respects configuration
     * inheritance chain (child configs first, then parents, then null-config).
     * Within each config level, sorts by priority DESC.
     */
    private sortPromptModelsForSpecificStrategy(
        promptModels: MJAIPromptModelEntity[],
        configurationId: string | undefined,
    ): MJAIPromptModelEntity[] {
        if (!configurationId) {
            return promptModels.sort((a, b) => (b.Priority || 0) - (a.Priority || 0));
        }

        const chain = AIEngine.Instance.GetConfigurationChain(configurationId);
        const chainOrder = new Map(chain.map((c, index) => [c.ID, index]));

        return promptModels.sort((a, b) => {
            const aChainPos = a.ConfigurationID ? (chainOrder.get(a.ConfigurationID) ?? 999) : 1000;
            const bChainPos = b.ConfigurationID ? (chainOrder.get(b.ConfigurationID) ?? 999) : 1000;
            if (aChainPos !== bChainPos) {
                return aChainPos - bChainPos;
            }
            return (b.Priority || 0) - (a.Priority || 0);
        });
    }

    /**
     * Builds candidates from sorted AIPromptModel records. Expands
     * `VendorID=null` to all vendors for that model.
     */
    private buildCandidatesFromPromptModels(
        promptModels: MJAIPromptModelEntity[],
    ): ResolvedModelCandidate[] {
        const candidates: ResolvedModelCandidate[] = [];

        for (let i = 0; i < promptModels.length; i++) {
            const pm = promptModels[i];
            // Compute priority as inverse of array position so highest-priority (first) gets the largest number.
            const computedPriority = promptModels.length - i;
            const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
            if (!model || !model.IsActive) continue;

            if (pm.VendorID) {
                const candidate = this.createCandidateForSpecificVendor(model, pm, computedPriority);
                if (candidate) candidates.push(candidate);
            } else {
                const vendorCandidates = this.createCandidatesForAllVendors(model, computedPriority);
                candidates.push(...vendorCandidates);
            }
        }

        return candidates;
    }

    /** Creates a candidate for a specific (model, vendor) pair from an AIPromptModel. */
    private createCandidateForSpecificVendor(
        model: MJAIModelEntityExtended,
        promptModel: MJAIPromptModelEntity,
        computedPriority: number,
    ): ResolvedModelCandidate | null {
        const modelVendor = AIEngine.Instance.ModelVendors.find(
            mv => UUIDsEqual(mv.ModelID, promptModel.ModelID) &&
                  UUIDsEqual(mv.VendorID, promptModel.VendorID) &&
                  mv.Status === 'Active' &&
                  this.IsInferenceProvider(mv),
        );

        if (!modelVendor) return null;

        return {
            model,
            vendorId: modelVendor.VendorID,
            vendorName: modelVendor.Vendor,
            driverClass: modelVendor.DriverClass || model.DriverClass,
            apiName: modelVendor.APIName || model.APIName,
            supportsEffortLevel: modelVendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
            effortLevel: promptModel.EffortLevel ?? undefined,
            isPreferredVendor: false,
            priority: computedPriority,
            source: 'prompt-model',
            credentialsAvailable: false,  // Set by runCredentialPreflight
        };
    }

    /** Creates candidates for all (active, inference-provider) vendors of a model, sorted by vendor priority. */
    private createCandidatesForAllVendors(
        model: MJAIModelEntityExtended,
        computedPriority: number,
    ): ResolvedModelCandidate[] {
        const vendors = AIEngine.Instance.ModelVendors
            .filter(mv =>
                UUIDsEqual(mv.ModelID, model.ID) &&
                mv.Status === 'Active' &&
                this.IsInferenceProvider(mv),
            )
            .sort((a, b) => (b.Priority || 0) - (a.Priority || 0));

        const candidates: ResolvedModelCandidate[] = [];

        for (const vendor of vendors) {
            candidates.push({
                model,
                vendorId: vendor.VendorID,
                vendorName: vendor.Vendor,
                driverClass: vendor.DriverClass || model.DriverClass,
                apiName: vendor.APIName || model.APIName,
                supportsEffortLevel: vendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
                isPreferredVendor: false,
                priority: computedPriority,
                source: 'prompt-model',
                credentialsAvailable: false,
            });
        }

        // Fallback: if no vendor rows but the model has a DriverClass, use that.
        if (candidates.length === 0 && model.DriverClass) {
            candidates.push({
                model,
                driverClass: model.DriverClass,
                apiName: model.APIName,
                supportsEffortLevel: model.SupportsEffortLevel ?? false,
                isPreferredVendor: false,
                priority: computedPriority,
                source: 'prompt-model',
                credentialsAvailable: false,
            });
        }

        return candidates;
    }

    /**
     * Walks the configuration inheritance chain looking for prompt models.
     * Returns models from the first config in the chain that has any, or
     * falls back to null-config (universal) models.
     */
    private getPromptModelsForConfiguration(
        prompt: MJAIPromptEntityExtended,
        configurationId: string | undefined,
    ): MJAIPromptModelEntity[] {
        if (configurationId) {
            const chain = AIEngine.Instance.GetConfigurationChain(configurationId);

            for (const config of chain) {
                const promptModels = AIEngine.Instance.PromptModels.filter(
                    pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
                          (pm.Status === 'Active' || pm.Status === 'Preview') &&
                          UUIDsEqual(pm.ConfigurationID, config.ID),
                );
                if (promptModels.length > 0) {
                    return promptModels;
                }
            }

            LogStatus(`No models found in configuration chain for "${configurationId}", falling back to default models`);
        }

        // Universal fallback: NULL-config rows
        return AIEngine.Instance.PromptModels.filter(
            pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
                  (pm.Status === 'Active' || pm.Status === 'Preview') &&
                  !pm.ConfigurationID,
        );
    }

    /** Adds prompt-specific candidates with blended priorities (legacy behavior). */
    private addPromptSpecificCandidates(
        candidates: ResolvedModelCandidate[],
        promptModels: MJAIPromptModelEntity[],
        preferredVendorId: string | undefined,
    ): void {
        for (const pm of promptModels) {
            const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
            if (model && model.IsActive) {
                const modelCandidates = this.createCandidatesForModel(
                    model,
                    5000,
                    'prompt-model',
                    preferredVendorId,
                    pm.Priority,
                );
                candidates.push(...modelCandidates);
            }
        }
    }

    /**
     * Adds configuration fallback candidates from the inheritance chain.
     * Adds models from parent configs (with decreasing priority) and
     * null-config models as the final fallback tier.
     */
    private addConfigurationFallbackCandidates(
        candidates: ResolvedModelCandidate[],
        prompt: MJAIPromptEntityExtended,
        configurationId: string,
        preferredVendorId: string | undefined,
        verbose: boolean,
    ): void {
        const chain = AIEngine.Instance.GetConfigurationChain(configurationId);

        // Add models from parent configs (skip index 0 — already handled).
        for (let i = 1; i < chain.length; i++) {
            const parentConfig = chain[i];
            const parentModels = AIEngine.Instance.PromptModels.filter(
                pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
                      (pm.Status === 'Active' || pm.Status === 'Preview') &&
                      UUIDsEqual(pm.ConfigurationID, parentConfig.ID),
            );

            if (parentModels.length > 0 && verbose) {
                LogStatus(`Adding ${parentModels.length} models from parent config "${parentConfig.Name}" as fallback`);
            }

            for (const pm of parentModels) {
                const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
                if (model && model.IsActive) {
                    // Decrease base priority for each level up the chain (3000, 2500, 2000, ...).
                    const basePriority = 3000 - (i * 500);
                    const modelCandidates = this.createCandidatesForModel(
                        model,
                        basePriority,
                        'prompt-model',
                        preferredVendorId,
                        pm.Priority,
                    );
                    candidates.push(...modelCandidates);
                }
            }
        }

        // Finally add NULL-config models (universal fallback) with lowest priority.
        const nullConfigModels = AIEngine.Instance.PromptModels.filter(
            pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
                  (pm.Status === 'Active' || pm.Status === 'Preview') &&
                  !pm.ConfigurationID,
        );

        if (nullConfigModels.length > 0 && verbose) {
            LogStatus(`Adding ${nullConfigModels.length} NULL configuration models as universal fallback`);
        }

        for (const pm of nullConfigModels) {
            const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
            if (model && model.IsActive) {
                const modelCandidates = this.createCandidatesForModel(
                    model,
                    1000,
                    'prompt-model',
                    preferredVendorId,
                    pm.Priority,
                );
                candidates.push(...modelCandidates);
            }
        }
    }

    /** Adds strategy-based candidates when no prompt models exist. */
    private addStrategyBasedCandidates(
        candidates: ResolvedModelCandidate[],
        prompt: MJAIPromptEntityExtended,
        preferredVendorName: string | undefined,
    ): void {
        let modelPool = this.getModelPoolForStrategy(prompt, preferredVendorName);
        modelPool = this.sortModelPoolByStrategy(modelPool, prompt);

        modelPool.forEach((model, index) => {
            const basePriority = 1000 - index * 10;
            const source: ModelResolverCandidateSource = prompt.SelectionStrategy === 'ByPower' ? 'power-rank' : 'model-type';
            candidates.push(...this.createCandidatesForModel(model, basePriority, source));
        });
    }

    /** Gets the filtered model pool for a strategy. */
    private getModelPoolForStrategy(
        prompt: MJAIPromptEntityExtended,
        preferredVendorName: string | undefined,
    ): MJAIModelEntityExtended[] {
        return AIEngine.Instance.Models.filter(
            m => m.IsActive &&
                 (!prompt.AIModelTypeID || UUIDsEqual(m.AIModelTypeID, prompt.AIModelTypeID)) &&
                 (!preferredVendorName ||
                  AIEngine.Instance.ModelVendors.some(mv =>
                      UUIDsEqual(mv.ModelID, m.ID) &&
                      mv.Status === 'Active' &&
                      mv.Vendor === preferredVendorName &&
                      this.IsInferenceProvider(mv),
                  )),
        );
    }

    /** Sorts the model pool by selection strategy (`'ByPower'` vs default). */
    private sortModelPoolByStrategy(
        modelPool: MJAIModelEntityExtended[],
        prompt: MJAIPromptEntityExtended,
    ): MJAIModelEntityExtended[] {
        if (prompt.SelectionStrategy === 'ByPower') {
            return this.sortByPowerPreference(modelPool, prompt.PowerPreference);
        }
        const minPowerRank = prompt.MinPowerRank || 0;
        return modelPool
            .filter(m => m.PowerRank >= minPowerRank)
            .sort((a, b) => b.PowerRank - a.PowerRank);
    }

    /** Sorts models by power preference (`'Highest'` | `'Lowest'` | `'Balanced'`). */
    private sortByPowerPreference(
        modelPool: MJAIModelEntityExtended[],
        powerPreference: 'Highest' | 'Lowest' | 'Balanced' | undefined,
    ): MJAIModelEntityExtended[] {
        const pool = [...modelPool];

        switch (powerPreference) {
            case 'Highest':
                return pool.sort((a, b) => b.PowerRank - a.PowerRank);
            case 'Lowest':
                return pool.sort((a, b) => a.PowerRank - b.PowerRank);
            case 'Balanced': {
                const avgPower = pool.reduce((sum, m) => sum + m.PowerRank, 0) / pool.length;
                return pool.sort((a, b) =>
                    Math.abs(a.PowerRank - avgPower) - Math.abs(b.PowerRank - avgPower),
                );
            }
            default:
                return pool.sort((a, b) => b.PowerRank - a.PowerRank);
        }
    }

    /**
     * Creates candidates for a model with AIModelVendor priorities (legacy
     * behavior). Honors a preferred vendor by boosting its priority by 1000.
     * If `promptModelPriority` is supplied, applies the AIPromptModel priority
     * via the legacy blended approach (`priority += promptModelPriority * 10`).
     */
    private createCandidatesForModel(
        model: MJAIModelEntityExtended,
        basePriority: number,
        source: ModelResolverCandidateSource,
        preferredVendorId?: string,
        promptModelPriority?: number,
    ): ResolvedModelCandidate[] {
        const modelCandidates: ResolvedModelCandidate[] = [];

        // Get all (active, inference-provider) vendors for this model.
        const modelVendors = AIEngine.Instance.ModelVendors
            .filter(mv => UUIDsEqual(mv.ModelID, model.ID) && mv.Status === 'Active' && this.IsInferenceProvider(mv))
            .sort((a, b) => b.Priority - a.Priority);

        // First: preferred vendor (boosted priority).
        if (preferredVendorId) {
            const preferredVendor = modelVendors.find(mv => UUIDsEqual(mv.VendorID, preferredVendorId));
            if (preferredVendor) {
                modelCandidates.push({
                    model,
                    vendorId: preferredVendor.VendorID,
                    vendorName: preferredVendor.Vendor,
                    driverClass: preferredVendor.DriverClass || model.DriverClass,
                    apiName: preferredVendor.APIName || model.APIName,
                    supportsEffortLevel: preferredVendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
                    isPreferredVendor: true,
                    priority: basePriority + 1000,
                    source,
                    credentialsAvailable: false,
                });
            }
        }

        // Then: other vendors in priority order.
        for (const vendor of modelVendors) {
            if (!UUIDsEqual(vendor.VendorID, preferredVendorId)) {
                modelCandidates.push({
                    model,
                    vendorId: vendor.VendorID,
                    vendorName: vendor.Vendor,
                    driverClass: vendor.DriverClass || model.DriverClass,
                    apiName: vendor.APIName || model.APIName,
                    supportsEffortLevel: vendor.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false,
                    isPreferredVendor: false,
                    priority: basePriority + (vendor.Priority || 0),
                    source,
                    credentialsAvailable: false,
                });
            }
        }

        // Fallback: no vendor rows, use model defaults.
        if (modelCandidates.length === 0 && model.DriverClass) {
            modelCandidates.push({
                model,
                driverClass: model.DriverClass,
                apiName: model.APIName,
                supportsEffortLevel: model.SupportsEffortLevel ?? false,
                isPreferredVendor: false,
                priority: basePriority,
                source,
                credentialsAvailable: false,
            });
        }

        // Apply AIPromptModel priority (legacy blended approach).
        if (promptModelPriority !== undefined) {
            modelCandidates.forEach(c => { c.priority += promptModelPriority * 10; });
        }

        return modelCandidates;
    }

    // -----------------------------------------------------------------------
    // Private — credential pre-flight (lifted from selectModelWithAPIKeyTracked)
    // -----------------------------------------------------------------------

    /**
     * Walks the candidate list, calling {@link HasCredentialsAvailable} for
     * each. Returns the same list with `credentialsAvailable` and
     * `unavailableReason` set, plus a pointer to the highest-priority
     * candidate that has credentials (`primary`).
     *
     * Caches per `(driverClass, modelId, vendorId)` triple within a single
     * call so the same vendor isn't re-checked across multiple models.
     */
    private async runCredentialPreflight(
        candidates: ResolvedModelCandidate[],
        promptId: string | undefined,
        options: {
            credentialId?: string;
            apiKeys?: AIAPIKey[];
            contextUser?: UserInfo;
            verbose?: boolean;
            maxErrorLength?: number;
        },
    ): Promise<{
        consideredAll: ResolvedModelCandidate[];
        primary: ResolvedModelCandidate | null;
    }> {
        const credentialCache = new Map<string, boolean>();
        const consideredAll: ResolvedModelCandidate[] = [];
        const verbose = options.verbose === true || IsVerboseLoggingEnabled();

        for (const candidate of candidates) {
            const cacheKey = `${candidate.driverClass}:${candidate.model.ID}:${candidate.vendorId || 'default'}`;

            let hasCredentials: boolean;
            if (credentialCache.has(cacheKey)) {
                hasCredentials = credentialCache.get(cacheKey)!;
            } else {
                hasCredentials = this.HasCredentialsAvailable(
                    candidate.driverClass,
                    { promptId, modelId: candidate.model.ID, vendorId: candidate.vendorId },
                    {
                        apiKeys: options.apiKeys,
                        contextUser: options.contextUser,
                        credentialId: options.credentialId,
                        verbose: options.verbose,
                    },
                );
                credentialCache.set(cacheKey, hasCredentials);
            }

            // Resolve the vendor entity (used for diagnostics in `consideredAll`).
            let vendorEntity: MJAIVendorEntity | undefined;
            if (candidate.vendorId) {
                const vendorId = candidate.vendorId;
                vendorEntity = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, vendorId));
            }

            consideredAll.push({
                ...candidate,
                vendor: vendorEntity,
                credentialsAvailable: hasCredentials,
                unavailableReason: hasCredentials ? undefined : `No credentials configured for driver ${candidate.driverClass}`,
            });
        }

        // Pick the first candidate with credentials (priority order is preserved by the loop).
        const primary = consideredAll.find(c => c.credentialsAvailable) ?? null;

        if (primary) {
            if (verbose) {
                const validCount = consideredAll.filter(c => c.credentialsAvailable).length;
                LogStatusEx({
                    message: `   Selected model ${primary.model.Name} with ${primary.vendorName || 'default'} vendor (driver: ${primary.driverClass})`,
                    verboseOnly: true,
                    isVerboseEnabled: () => true,
                });
                if (primary.isPreferredVendor) {
                    LogStatusEx({
                        message: `   Using preferred vendor${primary.vendorId ? ` (${primary.vendorName})` : ''}`,
                        verboseOnly: true,
                        isVerboseEnabled: () => true,
                    });
                }
                LogStatusEx({
                    message: `   Found ${validCount} valid candidate(s) out of ${candidates.length} total`,
                    verboseOnly: true,
                    isVerboseEnabled: () => true,
                });
            }
        } else {
            // Match the runner's pre-extraction error log shape.
            const triedSummary = candidates.slice(0, 5).map(c =>
                `${c.model.Name}/${c.vendorName || 'default'}(${c.driverClass})`,
            ).join(', ');

            let errorMessage = `No credentials found for any model-vendor combination. Tried: ${triedSummary}${candidates.length > 5 ? `... (${candidates.length} total)` : ''}`;
            if (options.maxErrorLength !== undefined && errorMessage.length > options.maxErrorLength) {
                errorMessage = errorMessage.substring(0, options.maxErrorLength) + '... [truncated]';
            }
            LogErrorEx({
                message: errorMessage,
                category: 'CredentialValidation',
                severity: 'critical',
                metadata: {
                    candidatesChecked: candidates.length,
                    modelsChecked: consideredAll.length,
                },
            });
        }

        return { consideredAll, primary };
    }

    // -----------------------------------------------------------------------
    // Private — failover loop helpers (lifted from AIPromptRunner)
    // -----------------------------------------------------------------------

    /**
     * Processes a failover error (either thrown by `fn` or a
     * `ChatResult{success:false, errorInfo:{canFailover:true}}` re-raised by
     * the runner wrapper). Handles vendor-level filtering, rate-limit retries
     * on the same candidate, fatal-error short-circuits, and errorScope
     * gating. Returns a decision the loop in {@link WithFailover} executes.
     *
     * @returns
     *  - `shouldRetry`: retry the same candidate (rate-limit case)
     *  - `shouldContinue`: skip to the next candidate
     *  - `updatedCandidates`: the candidate list after vendor-level filtering
     */
    private async processFailoverError(
        error: Error,
        errorInfo: AIErrorInfo,
        candidate: ResolvedModelCandidate,
        attemptStartTime: number,
        attemptIndex: number,
        allCandidates: ResolvedModelCandidate[],
        failoverAttempts: FailoverAttempt[],
        options: {
            promptId?: string;
            errorScope: FailoverErrorScope;
            maxAttempts: number;
            maxRateLimitRetries: number;
            rateLimitRetryStrategy?: 'Fixed' | 'Linear' | 'Exponential';
            rateLimitRetryDelayMs?: number;
        },
    ): Promise<{
        shouldRetry: boolean;
        shouldContinue: boolean;
        updatedCandidates: ResolvedModelCandidate[];
    }> {
        const attemptDuration = Date.now() - attemptStartTime;

        const failoverAttempt: FailoverAttempt = {
            attemptNumber: attemptIndex + 1,
            modelId: candidate.model.ID,
            vendorId: candidate.vendorId,
            error,
            errorType: errorInfo.errorType,
            duration: attemptDuration,
            timestamp: new Date(),
        };
        failoverAttempts.push(failoverAttempt);

        // Vendor-level errors: filter ALL candidates from this vendor.
        let updatedCandidates = allCandidates;
        if (errorInfo.errorType === 'Authentication' || errorInfo.errorType === 'VendorValidationError') {
            updatedCandidates = this.filterVendorCandidates(
                errorInfo.errorType,
                candidate.vendorId,
                allCandidates,
            );
        }

        const isLastCandidate = attemptIndex === updatedCandidates.length - 1;

        // Fatal errors: stop immediately.
        if (errorInfo.severity === 'Fatal') {
            const errorMessage = error?.message || 'Unknown error';
            LogErrorEx({
                message: `Stopping failover: Fatal error (${errorInfo.errorType}): ${errorMessage}`,
                error,
                category: 'AI',
                severity: 'error',
            });
            this.logFailoverAttempt(options.promptId, failoverAttempt, false);
            return { shouldRetry: false, shouldContinue: false, updatedCandidates };
        }

        // ErrorScope filter — caller wants to limit failover to certain error classes.
        if (options.errorScope && options.errorScope !== 'All') {
            const matchesScope = this.errorMatchesScope(errorInfo.errorType, options.errorScope);
            if (!matchesScope) {
                this.logFailoverAttempt(options.promptId, failoverAttempt, false);
                return { shouldRetry: false, shouldContinue: false, updatedCandidates };
            }
        }

        // Rate-limit errors: retry the same candidate up to `maxRateLimitRetries`.
        if (errorInfo.errorType === 'RateLimit') {
            const shouldRetry = await this.handleRateLimitRetry(
                errorInfo,
                candidate.model,
                candidate.vendorId,
                failoverAttempts,
                attemptIndex,
                updatedCandidates.length,
                failoverAttempt,
                {
                    promptId: options.promptId,
                    maxRateLimitRetries: options.maxRateLimitRetries,
                    rateLimitRetryStrategy: options.rateLimitRetryStrategy,
                    rateLimitRetryDelayMs: options.rateLimitRetryDelayMs,
                },
            );
            if (shouldRetry) {
                return { shouldRetry: true, shouldContinue: false, updatedCandidates };
            }
        }

        // Last candidate? Stop.
        if (isLastCandidate) {
            this.logFailoverAttempt(options.promptId, failoverAttempt, false);
            return { shouldRetry: false, shouldContinue: false, updatedCandidates };
        }

        // Continue to next candidate.
        this.logFailoverAttempt(options.promptId, failoverAttempt, true);
        return { shouldRetry: false, shouldContinue: true, updatedCandidates };
    }

    /**
     * Vendor-level errors (Authentication, VendorValidationError) imply EVERY
     * candidate from that vendor will fail the same way. Strip them all out
     * so we don't waste attempts on them.
     */
    private filterVendorCandidates(
        errorType: string,
        currentVendorId: string | undefined,
        allCandidates: ResolvedModelCandidate[],
    ): ResolvedModelCandidate[] {
        if (errorType !== 'Authentication' && errorType !== 'VendorValidationError') {
            return allCandidates;
        }

        const failedVendorId = currentVendorId || 'default';
        const beforeCount = allCandidates.length;

        const filteredCandidates = allCandidates.filter(c =>
            (c.vendorId || 'default') !== failedVendorId,
        );

        const removedCount = beforeCount - filteredCandidates.length;
        if (removedCount > 0) {
            const vendorName = AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, failedVendorId))?.Name || failedVendorId;
            const remainingCount = filteredCandidates.length;

            let reason: string;
            let icon: string;
            if (errorType === 'Authentication') {
                reason = 'Invalid API key';
                icon = '🔒';
            } else if (errorType === 'VendorValidationError') {
                reason = 'API schema incompatibility';
                icon = '⚠️';
            } else {
                reason = 'Vendor-level error';
                icon = '❌';
            }

            LogStatusEx({
                message: `   ${icon} ${reason} for ${vendorName} - excluding ${removedCount} model${removedCount === 1 ? '' : 's'} from this vendor (${remainingCount} remaining)`,
                verboseOnly: true,
                isVerboseEnabled: () => true,
            });
        }

        return filteredCandidates;
    }

    /**
     * Handles rate-limit (429) errors by deciding whether to retry the same
     * candidate (with backoff) or fail it over. Counts prior rate-limit
     * attempts on the same `(model, vendor)` to enforce
     * `maxRateLimitRetries`.
     *
     * @returns `true` when the loop should retry the same candidate,
     *          `false` when it should fail over to the next.
     */
    private async handleRateLimitRetry(
        errorAnalysis: { errorType: string; suggestedRetryDelaySeconds?: number },
        currentModel: MJAIModelEntityExtended,
        currentVendorId: string | undefined,
        failoverAttempts: FailoverAttempt[],
        attemptNumber: number,
        maxAttempts: number,
        failoverAttempt: FailoverAttempt,
        options: {
            promptId?: string;
            maxRateLimitRetries: number;
            rateLimitRetryStrategy?: 'Fixed' | 'Linear' | 'Exponential';
            rateLimitRetryDelayMs?: number;
        },
    ): Promise<boolean> {
        const isRateLimit = errorAnalysis.errorType === 'RateLimit';
        if (!isRateLimit) return false;

        const rateLimitRetryCount = failoverAttempts.filter(a =>
            UUIDsEqual(a.modelId, currentModel.ID) &&
            UUIDsEqual(a.vendorId, currentVendorId) &&
            a.errorType === 'RateLimit',
        ).length;

        const shouldRetry = rateLimitRetryCount <= options.maxRateLimitRetries;

        if (shouldRetry) {
            const modelName = currentModel.Name;
            const vendorName = currentVendorId
                ? AIEngine.Instance.Vendors.find(v => UUIDsEqual(v.ID, currentVendorId))?.Name || 'default'
                : 'default';

            LogStatusEx({
                message: `   ⏳ Rate limit hit - retrying ${modelName} (${vendorName}) with backoff (attempt ${rateLimitRetryCount}/${options.maxRateLimitRetries})`,
                verboseOnly: true,
                isVerboseEnabled: () => true,
            });
            this.logFailoverAttempt(options.promptId, failoverAttempt, true);

            if (attemptNumber < maxAttempts) {
                await this.applyRateLimitDelay(
                    rateLimitRetryCount,
                    errorAnalysis.suggestedRetryDelaySeconds,
                    options.rateLimitRetryStrategy,
                    options.rateLimitRetryDelayMs,
                );
            }
            return true;
        }

        return false;
    }

    /**
     * Computes and applies the backoff delay for a rate-limit retry on the
     * same candidate. Honors a provider-supplied `Retry-After` value when
     * present; otherwise applies the configured strategy
     * (`'Fixed'` | `'Linear'` | `'Exponential'`).
     */
    private async applyRateLimitDelay(
        attemptNumber: number,
        suggestedDelaySeconds: number | undefined,
        retryStrategy: 'Fixed' | 'Linear' | 'Exponential' | undefined,
        retryDelayMs: number | undefined,
    ): Promise<void> {
        const delay = this.calculateRateLimitDelay(attemptNumber, suggestedDelaySeconds, retryStrategy, retryDelayMs);
        const delaySeconds = (delay / 1000).toFixed(1);
        LogStatus(`   Waiting ${delaySeconds}s before retry (strategy: ${retryStrategy || 'Fixed'})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Returns the rate-limit retry delay in milliseconds. Provider-supplied
     * `Retry-After` (in seconds) takes precedence over the configured
     * strategy. The strategy itself preserves the runner's pre-extraction
     * semantics — `Fixed` returns `baseDelay`, `Linear` returns
     * `baseDelay * attempt`, `Exponential` returns `baseDelay * 2^(attempt-1)`.
     */
    private calculateRateLimitDelay(
        attemptNumber: number,
        suggestedDelaySeconds: number | undefined,
        retryStrategy: 'Fixed' | 'Linear' | 'Exponential' | undefined,
        retryDelayMs: number | undefined,
    ): number {
        if (suggestedDelaySeconds && suggestedDelaySeconds > 0) {
            return suggestedDelaySeconds * 1000;
        }

        const baseDelay = retryDelayMs || 1000;
        switch (retryStrategy) {
            case 'Fixed':
                return baseDelay;
            case 'Linear':
                return baseDelay * attemptNumber;
            case 'Exponential':
                return baseDelay * Math.pow(2, attemptNumber - 1);
            default:
                return baseDelay;
        }
    }

    /**
     * Cross-candidate failover backoff calculator. Exponential with jitter,
     * capped at 30 seconds. Currently unused by {@link WithFailover}'s loop
     * — included for parity with the runner's pre-extraction surface and as
     * a hook for future use (audit §6).
     */
    private calculateFailoverDelay(attemptNumber: number, baseDelaySeconds: number): number {
        const exponentialDelay = baseDelaySeconds * Math.pow(2, attemptNumber - 1);
        const jitter = exponentialDelay * 0.25 * Math.random();
        const totalDelay = Math.min(exponentialDelay + jitter, 30);
        return totalDelay * 1000;
    }

    /** Maps `FailoverErrorScope` to the set of error types that count. */
    private errorMatchesScope(errorType: string, scope: FailoverErrorScope): boolean {
        switch (scope) {
            case 'NetworkOnly':
                return errorType === 'NetworkError';
            case 'RateLimitOnly':
                return errorType === 'RateLimit';
            case 'ServiceErrorOnly':
                return errorType === 'ServiceUnavailable' || errorType === 'InternalServerError';
            case 'All':
            default:
                return true;
        }
    }

    /**
     * Strategy-aware filter for picking the next candidate set. Mirrors the
     * runner's pre-extraction semantics. Kept for parity / future use; the
     * primary loop in {@link WithFailover} relies on
     * {@link filterVendorCandidates} for vendor-level pruning and on the
     * candidate ordering established by {@link ResolveForPrompt} /
     * {@link ResolveForRequirements} for everything else.
     */
    private selectFailoverCandidates(
        currentModel: MJAIModelEntityExtended,
        currentVendorId: string | undefined,
        strategy: FailoverStrategy,
        modelStrategy: FailoverModelStrategy | undefined,
        allCandidates: ResolvedModelCandidate[],
        attemptHistory: FailoverAttempt[],
    ): ResolvedModelCandidate[] {
        const failedPairs = new Set(
            attemptHistory.map(a => `${a.modelId}:${a.vendorId || 'default'}`),
        );

        const availableCandidates = allCandidates.filter(c => {
            const key = `${c.model.ID}:${c.vendorId || 'default'}`;
            return !failedPairs.has(key);
        });

        const hasContextLengthError = attemptHistory.some(a =>
            a.errorType === 'ContextLengthExceeded' ||
            ErrorAnalyzer.analyzeError(a.error).errorType === 'ContextLengthExceeded',
        );

        let candidates: ResolvedModelCandidate[];

        switch (strategy) {
            case 'SameModelDifferentVendor':
                candidates = availableCandidates.filter(c =>
                    UUIDsEqual(c.model.ID, currentModel.ID) && !UUIDsEqual(c.vendorId, currentVendorId),
                );
                break;

            case 'NextBestModel':
                candidates = availableCandidates;
                if (modelStrategy === 'RequireSameModel') {
                    candidates = candidates.filter(c => UUIDsEqual(c.model.ID, currentModel.ID));
                } else if (modelStrategy === 'PreferSameModel') {
                    candidates.sort((a, b) => {
                        const aSame = UUIDsEqual(a.model.ID, currentModel.ID) ? 1 : 0;
                        const bSame = UUIDsEqual(b.model.ID, currentModel.ID) ? 1 : 0;
                        return bSame - aSame;
                    });
                } else if (modelStrategy === 'PreferDifferentModel') {
                    candidates.sort((a, b) => {
                        const aDiff = !UUIDsEqual(a.model.ID, currentModel.ID) ? 1 : 0;
                        const bDiff = !UUIDsEqual(b.model.ID, currentModel.ID) ? 1 : 0;
                        return bDiff - aDiff;
                    });
                }
                break;

            case 'PowerRank':
                candidates = availableCandidates;
                break;

            case 'None':
            default:
                candidates = [];
        }

        // Context-length-aware fallover: prefer larger-context models, fail-fatal if none exist.
        if (hasContextLengthError) {
            const currentMaxTokens = currentModel.ModelVendors?.length > 0
                ? Math.max(...currentModel.ModelVendors.map(mv => mv.MaxInputTokens || 0))
                : 0;

            candidates = candidates.filter(c => {
                const candidateMaxTokens = c.model.ModelVendors?.length > 0
                    ? Math.max(...c.model.ModelVendors.map(mv => mv.MaxInputTokens || 0))
                    : 0;
                return candidateMaxTokens > currentMaxTokens;
            });

            if (candidates.length === 0) {
                LogStatusEx({
                    message: `❌ Context length exceeded and no models with larger context windows available. Current model: ${currentModel.Name} (${currentMaxTokens} max tokens). This is a fatal error.`,
                    category: 'AI',
                    additionalArgs: [{
                        currentModel: currentModel.Name,
                        currentMaxTokens,
                        availableModels: allCandidates.map(c => c.model.Name).join(', '),
                        reason: 'No models with larger context windows available for failover',
                    }],
                });
                return [];
            }

            candidates.sort((a, b) => {
                if (a.priority !== b.priority) return b.priority - a.priority;
                const aMaxTokens = a.model.ModelVendors?.length > 0
                    ? Math.max(...a.model.ModelVendors.map(mv => mv.MaxInputTokens || 0))
                    : 0;
                const bMaxTokens = b.model.ModelVendors?.length > 0
                    ? Math.max(...b.model.ModelVendors.map(mv => mv.MaxInputTokens || 0))
                    : 0;
                return bMaxTokens - aMaxTokens;
            });

            const bestCandidate = candidates[0];
            const bestCandidateMaxTokens = bestCandidate.model.ModelVendors?.length > 0
                ? Math.max(...bestCandidate.model.ModelVendors.map(mv => mv.MaxInputTokens || 0))
                : 0;
            LogStatusEx({
                message: `🔄 Context-aware failover: Selected model ${bestCandidate.model.Name} with ${bestCandidateMaxTokens} max input tokens (vs ${currentMaxTokens} for failed model)`,
                category: 'AI',
                additionalArgs: [{
                    currentModel: currentModel.Name,
                    currentMaxTokens,
                    selectedModel: bestCandidate.model.Name,
                    selectedMaxTokens: bestCandidateMaxTokens,
                    candidateCount: candidates.length,
                }],
            });
        } else {
            candidates.sort((a, b) => b.priority - a.priority);
        }

        return candidates;
    }

    /**
     * Logs a failover attempt for tracking and debugging. `willRetry=true`
     * → info log; `false` → error log (the loop has decided to give up on
     * this candidate).
     */
    private logFailoverAttempt(
        promptId: string | undefined,
        attempt: FailoverAttempt,
        willRetry: boolean,
    ): void {
        const message = `Failover attempt ${attempt.attemptNumber}${promptId ? ` for prompt ${promptId}` : ''}`;
        const metadata = {
            promptId,
            attemptNumber: attempt.attemptNumber,
            modelId: attempt.modelId,
            vendorId: attempt.vendorId,
            errorType: attempt.errorType,
            duration: attempt.duration,
            willRetry,
            error: attempt.error.message,
        };

        if (willRetry) {
            LogStatusEx({
                message: `⚡ ${message}`,
                category: 'AI',
                additionalArgs: [metadata],
            });
        } else {
            LogErrorEx({
                message,
                error: attempt.error,
                category: 'AI',
                severity: 'error',
                metadata,
            });
        }
    }
}

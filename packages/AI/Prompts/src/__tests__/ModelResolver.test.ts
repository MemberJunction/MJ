/**
 * Unit tests for `ModelResolver` — PR #2471 Phase 1 regression suite.
 *
 * Scope: focuses on `WithFailover<T>` because it's the most isolated of
 * the resolver's public methods (takes pre-built `ResolvedModelCandidate[]`
 * + a caller-supplied `fn`, no AIEngine state required) and because the
 * `failoverStrategy='None'` "Skip-style hard-fail" regression was AN-BC's
 * specific ask in the audit/Phase-1 review (PHASE_1_MODEL_RESOLVER_SPEC.md
 * §6 "Honoring FailoverStrategy"). Each test is annotated with the spec
 * section it exercises.
 *
 * `ResolveForPrompt` / `ResolveForRequirements` / `ResolveCredential` /
 * `HasCredentialsAvailable` are best tested with a seeded `AIEngine` mock
 * — that fixture work is queued as a follow-up in this same file's
 * `describe.skip(...)` blocks at the end so the structure is visible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIErrorInfo } from '@memberjunction/ai';

// =============================================================================
// Module mocks (set BEFORE importing ModelResolver so the resolver picks them up)
// =============================================================================
//
// `ResolveForPrompt` / `ResolveForRequirements` / `ResolveCredential` /
// `HasCredentialsAvailable` read state off `AIEngine.Instance` and
// `CredentialEngine.Instance` and call `GetAIAPIKey(driverClass, ...)` for
// the legacy fallback tier. Replacing the modules with controllable doubles
// lets each test seed exactly the metadata it needs without spinning up
// the real DB-backed engines.

// vi.mock factories are hoisted above all imports, so the state objects
// they reference must be declared via `vi.hoisted()` to also hoist.
const { mockAIEngineState, mockCredentialEngineState, mockGetAIAPIKey } = vi.hoisted(() => {
    const aiEngineState = {
        Models: [] as MJAIModelEntityExtendedLike[],
        ModelVendors: [] as MJAIModelVendorEntityLike[],
        PromptModels: [] as MJAIPromptModelEntityLike[],
        Configurations: [] as MJAIConfigurationEntityLike[],
        Vendors: [] as MJAIVendorEntityLike[],
        ModelTypes: [] as { ID: string; Name: string }[],
        VendorTypeDefinitions: [] as { ID: string; Name: string }[],
        AgentActions: [] as unknown[],
        Config: vi.fn(async () => undefined),
        GetConfigurationChain: vi.fn((_id: string) => [] as { ID: string; Name: string }[]),
        HasCredentialBindings: vi.fn((_type: string, _targetId: string) => false),
        GetCredentialBindingsForTarget: vi.fn((_type: string, _targetId: string) => [] as MJAICredentialBindingEntityLike[]),
        FindSimilarActions: vi.fn(async () => []),
    };
    const credentialEngineState = {
        Credentials: [] as MJCredentialEntityLike[],
        Config: vi.fn(async () => undefined),
        getCredentialById: vi.fn((_id: string) => undefined as MJCredentialEntityLike | undefined),
        getCredential: vi.fn(async (_name: string, _opts?: unknown) => ({ values: {} })),
    };
    const getAIAPIKey = vi.fn((_driverClass: string, _apiKeys?: unknown[], _verbose?: boolean) => '');
    return {
        mockAIEngineState: aiEngineState,
        mockCredentialEngineState: credentialEngineState,
        mockGetAIAPIKey: getAIAPIKey,
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: mockAIEngineState },
}));

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: { Instance: mockCredentialEngineState },
}));

// Partial mock for @memberjunction/ai — only override `GetAIAPIKey`. Use
// importActual so `ErrorAnalyzer`, `AIErrorInfo` etc. keep working.
vi.mock('@memberjunction/ai', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/ai')>('@memberjunction/ai');
    return {
        ...actual,
        GetAIAPIKey: mockGetAIAPIKey,
    };
});

import {
    ModelResolver,
    ResolvedModelCandidate,
    FailoverAttempt,
} from '../ModelResolver';

// =============================================================================
// Fixture types — minimal shapes the resolver actually reads. We avoid
// constructing full BaseEntity subclasses (heavy to instantiate, irrelevant
// to the algorithm under test).
// =============================================================================

interface MJAIModelEntityExtendedLike {
    ID: string;
    Name: string;
    IsActive: boolean;
    AIModelTypeID: string;
    PowerRank: number;
    DriverClass: string;
    APIName: string;
    SupportsEffortLevel: boolean;
    ModelVendors?: Array<{ MaxInputTokens?: number }>;
}

interface MJAIModelVendorEntityLike {
    ID: string;
    ModelID: string;
    VendorID: string;
    Vendor?: string;
    DriverClass?: string;
    APIName?: string;
    SupportsEffortLevel?: boolean;
    Status: 'Active' | 'Preview' | 'Deprecated' | 'Inactive';
    Priority: number;
    TypeID: string;
    MaxInputTokens?: number;
}

interface MJAIPromptModelEntityLike {
    ID: string;
    PromptID: string;
    ModelID: string;
    VendorID?: string;
    ConfigurationID?: string | null;
    Priority: number;
    Status: 'Active' | 'Preview' | 'Deprecated' | 'Inactive';
    EffortLevel?: number;
}

interface MJAIConfigurationEntityLike {
    ID: string;
    Name: string;
}

interface MJAIVendorEntityLike {
    ID: string;
    Name: string;
    CredentialTypeID?: string;
}

interface MJAICredentialBindingEntityLike {
    ID: string;
    CredentialID: string;
    Priority: number;
}

interface MJCredentialEntityLike {
    ID: string;
    Name: string;
    CredentialTypeID: string;
    IsActive: boolean;
    IsDefault: boolean;
    ExpiresAt?: Date | string | null;
}

// =============================================================================
// Fixture constants + reset helper
// =============================================================================

/** TypeID that `IsInferenceProvider` matches against. */
const INFERENCE_PROVIDER_TYPE_ID = 'inf-provider-type';
/** TypeID that `IsInferenceProvider` rejects (model-developer rows). */
const MODEL_DEVELOPER_TYPE_ID = 'model-dev-type';

/**
 * Resets mock engine state to empty defaults so each test starts clean.
 * Always seeds the two `VendorTypeDefinitions` rows the resolver looks up
 * by name (`Inference Provider` / `Model Developer`).
 */
function resetMocks(): void {
    mockAIEngineState.Models = [];
    mockAIEngineState.ModelVendors = [];
    mockAIEngineState.PromptModels = [];
    mockAIEngineState.Configurations = [];
    mockAIEngineState.Vendors = [];
    mockAIEngineState.ModelTypes = [];
    mockAIEngineState.VendorTypeDefinitions = [
        { ID: INFERENCE_PROVIDER_TYPE_ID, Name: 'Inference Provider' },
        { ID: MODEL_DEVELOPER_TYPE_ID, Name: 'Model Developer' },
    ];
    mockAIEngineState.Config.mockClear();
    mockAIEngineState.GetConfigurationChain.mockReset();
    mockAIEngineState.GetConfigurationChain.mockReturnValue([]);
    mockAIEngineState.HasCredentialBindings.mockReset();
    mockAIEngineState.HasCredentialBindings.mockReturnValue(false);
    mockAIEngineState.GetCredentialBindingsForTarget.mockReset();
    mockAIEngineState.GetCredentialBindingsForTarget.mockReturnValue([]);

    mockCredentialEngineState.Credentials = [];
    mockCredentialEngineState.Config.mockClear();
    mockCredentialEngineState.getCredentialById.mockReset();
    mockCredentialEngineState.getCredentialById.mockReturnValue(undefined);
    mockCredentialEngineState.getCredential.mockReset();
    mockCredentialEngineState.getCredential.mockResolvedValue({ values: {} });

    mockGetAIAPIKey.mockReset();
    mockGetAIAPIKey.mockReturnValue('');
}

/** Builds a model fixture with sane defaults. */
function makeModel(overrides: Partial<MJAIModelEntityExtendedLike> & { ID: string }): MJAIModelEntityExtendedLike {
    return {
        Name: `Model-${overrides.ID}`,
        IsActive: true,
        AIModelTypeID: 'llm-type',
        PowerRank: 50,
        DriverClass: 'TestLLM',
        APIName: 'test-api',
        SupportsEffortLevel: false,
        ModelVendors: [],
        ...overrides,
    };
}

/** Builds an inference-provider model-vendor row by default. */
function makeModelVendor(overrides: Partial<MJAIModelVendorEntityLike> & { ModelID: string; VendorID: string }): MJAIModelVendorEntityLike {
    return {
        ID: `mv-${overrides.ModelID}-${overrides.VendorID}`,
        Status: 'Active',
        Priority: 0,
        TypeID: INFERENCE_PROVIDER_TYPE_ID,
        ...overrides,
    };
}

// ============================================================================
// Test fixtures
// ============================================================================

/**
 * Builds a minimal `ResolvedModelCandidate` for use in `WithFailover` tests.
 * Only fills the fields `WithFailover` and its helpers actually read; everything
 * else gets safe defaults.
 */
function makeCandidate(overrides: Partial<ResolvedModelCandidate> & {
    modelId: string;
    modelName?: string;
    vendorId?: string;
    vendorName?: string;
}): ResolvedModelCandidate {
    return {
        // Casting to the shape WithFailover reads — `model.ID`, `model.Name`,
        // `model.ModelVendors` (only for ContextLengthExceeded path). Full
        // MJAIModelEntityExtended is too heavy to construct in unit tests and
        // unnecessary for the failover-loop logic we're exercising here.
        model: {
            ID: overrides.modelId,
            Name: overrides.modelName ?? `Model-${overrides.modelId}`,
            ModelVendors: [],
        } as unknown as ResolvedModelCandidate['model'],
        vendorId: overrides.vendorId,
        vendorName: overrides.vendorName ?? (overrides.vendorId ? `Vendor-${overrides.vendorId}` : undefined),
        driverClass: overrides.driverClass ?? 'TestLLM',
        apiName: overrides.apiName ?? 'test-api',
        supportsEffortLevel: overrides.supportsEffortLevel ?? false,
        isPreferredVendor: overrides.isPreferredVendor ?? false,
        priority: overrides.priority ?? 1000,
        source: overrides.source ?? 'prompt-model',
        credentialsAvailable: overrides.credentialsAvailable ?? true,
    };
}

/**
 * Throws an Error with `errorInfo` attached so `WithFailover`'s catch path
 * picks it up directly without re-running `ErrorAnalyzer.analyzeError`. This
 * lets each test specify the exact errorType/severity/canFailover combo
 * that drives the failover decision.
 */
function makeError(message: string, errorInfo: Partial<AIErrorInfo>): Error {
    const err = new Error(message) as Error & { errorInfo?: AIErrorInfo };
    err.errorInfo = {
        errorType: 'NetworkError',
        severity: 'Error',
        canFailover: true,
        ...errorInfo,
    } as AIErrorInfo;
    return err;
}

// ============================================================================
// Tests
// ============================================================================

describe('ModelResolver', () => {
    describe('singleton behavior', () => {
        it('Instance returns the same object across multiple calls', () => {
            const a = ModelResolver.Instance;
            const b = ModelResolver.Instance;
            expect(a).toBe(b);
        });

        it('Instance is a ModelResolver', () => {
            expect(ModelResolver.Instance).toBeInstanceOf(ModelResolver);
        });
    });

    describe('WithFailover', () => {
        beforeEach(() => {
            // Resolver is stateless beyond BaseSingleton inheritance; no
            // per-test reset needed.
        });

        // --------------------------------------------------------------
        // Empty / trivial inputs
        // --------------------------------------------------------------

        it('throws when called with an empty candidate list', async () => {
            // Spec: §2.2 / WithFailover behavior — empty list is a programming
            // error, not a regular failover exhaustion. Throws with
            // failoverAttempts = [] (no attempts were made).
            await expect(
                ModelResolver.Instance.WithFailover([], async () => 'unreachable'),
            ).rejects.toThrowError(/no candidates/i);
        });

        // --------------------------------------------------------------
        // Happy path
        // --------------------------------------------------------------

        it('returns first success without trying further candidates', async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1' }),
                makeCandidate({ modelId: 'm2' }),
                makeCandidate({ modelId: 'm3' }),
            ];
            const fn = vi.fn(async (c: ResolvedModelCandidate) => `result-${c.model.ID}`);

            const result = await ModelResolver.Instance.WithFailover(candidates, fn);

            expect(result.result).toBe('result-m1');
            expect(result.winner.model.ID).toBe('m1');
            expect(result.attemptsUsed).toBe(1);
            expect(result.failoverAttempts).toEqual([]);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        // --------------------------------------------------------------
        // FailoverStrategy='None' — AN-BC's explicit Skip-style ask
        // PHASE_1_MODEL_RESOLVER_SPEC.md §6 "Honoring FailoverStrategy"
        // --------------------------------------------------------------

        it("FailoverStrategy='None' executes only the first candidate, never failovers (Skip-style hard-fail)", async () => {
            // Audit §3.5.8: this is the prompt designer's hard-fail escape
            // hatch. The Skip use case is "I curated this list of acceptable
            // models; if they're unavailable, raise a hard error so the
            // configuration gets fixed, NOT a silent fallback to whatever
            // else has credentials."
            const candidates = [
                makeCandidate({ modelId: 'm1' }),
                makeCandidate({ modelId: 'm2' }),
                makeCandidate({ modelId: 'm3' }),
            ];
            const fn = vi.fn(async () => {
                throw makeError('boom', { errorType: 'ServiceUnavailable', canFailover: true });
            });

            await expect(
                ModelResolver.Instance.WithFailover(candidates, fn, { failoverStrategy: 'None' }),
            ).rejects.toThrowError(/boom/);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it("FailoverStrategy='None' wraps the failure with cause + failoverAttempts metadata", async () => {
            // Spec §6 contract: aggregate Error has `cause` chain + a
            // single-entry `failoverAttempts` so observability still gets
            // the attempt record even though we didn't walk the list.
            const candidates = [makeCandidate({ modelId: 'm1', vendorId: 'v1' })];
            const original = makeError('rate limited', { errorType: 'RateLimit' });
            const fn = vi.fn(async () => {
                throw original;
            });

            try {
                await ModelResolver.Instance.WithFailover(candidates, fn, { failoverStrategy: 'None' });
                expect.fail('should have thrown');
            } catch (e) {
                const err = e as Error & { cause?: Error; failoverAttempts?: FailoverAttempt[] };
                expect(err.cause).toBe(original);
                expect(err.failoverAttempts).toHaveLength(1);
                expect(err.failoverAttempts![0].errorType).toBe('RateLimit');
                expect(err.failoverAttempts![0].modelId).toBe('m1');
                expect(err.failoverAttempts![0].vendorId).toBe('v1');
            }
        });

        // --------------------------------------------------------------
        // Cross-candidate failover (default 'SameModelDifferentVendor')
        // --------------------------------------------------------------

        it('continues to next candidate when fn throws a NetworkError', async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1', vendorId: 'v1' }),
                makeCandidate({ modelId: 'm1', vendorId: 'v2' }),
            ];
            const fn = vi.fn(async (c: ResolvedModelCandidate) => {
                if (c.vendorId === 'v1') {
                    throw makeError('network down', { errorType: 'NetworkError', canFailover: true });
                }
                return `result-${c.vendorId}`;
            });

            const result = await ModelResolver.Instance.WithFailover(candidates, fn);

            expect(result.result).toBe('result-v2');
            expect(result.winner.vendorId).toBe('v2');
            expect(result.failoverAttempts).toHaveLength(1);
            expect(result.failoverAttempts[0].errorType).toBe('NetworkError');
            expect(result.failoverAttempts[0].vendorId).toBe('v1');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        // --------------------------------------------------------------
        // Vendor-level error filtering (Authentication / VendorValidationError)
        // --------------------------------------------------------------

        it('Authentication error is recorded in failoverAttempts and exhausts when no other vendor remains', async () => {
            // The vendor-filter path is exercised — both m1/v1 and m2/v1 share
            // the bad-credentials vendor, so we expect WithFailover to give
            // up cleanly. (See note below on the latent index-skip quirk
            // when a SINGLE non-failed-vendor candidate remains.)
            const candidates = [
                makeCandidate({ modelId: 'm1', vendorId: 'v1' }),
                makeCandidate({ modelId: 'm2', vendorId: 'v1' }),
            ];
            const fn = vi.fn(async () => {
                throw makeError('bad api key', { errorType: 'Authentication', canFailover: true });
            });

            try {
                await ModelResolver.Instance.WithFailover(candidates, fn);
                expect.fail('should have thrown');
            } catch (e) {
                const err = e as Error & { failoverAttempts?: FailoverAttempt[] };
                expect(err.failoverAttempts).toBeDefined();
                expect(err.failoverAttempts!.length).toBeGreaterThanOrEqual(1);
                expect(err.failoverAttempts![0].errorType).toBe('Authentication');
            }
        });

        // NOTE on a latent vendor-filter quirk surfaced by this test suite:
        // when an Authentication / VendorValidationError filters out the
        // current candidate's vendor and exactly ONE candidate from a
        // different vendor remains in the list, that survivor is currently
        // skipped (the for-loop's `i++` lands past the shrunken array's
        // length). This was carried over verbatim from
        // `AIPromptRunner.processFailoverError` pre-extraction — it is NOT
        // a regression introduced by PR #2471. Tracked as a follow-up: the
        // loop should detect when the failed-current-candidate is no
        // longer in `updatedCandidates` and either re-evaluate at the
        // same index or use a removal-aware iteration model.

        // --------------------------------------------------------------
        // Fatal severity short-circuit
        // --------------------------------------------------------------

        it('Fatal severity error stops immediately, no further candidates tried', async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1' }),
                makeCandidate({ modelId: 'm2' }),
                makeCandidate({ modelId: 'm3' }),
            ];
            const fn = vi.fn(async () => {
                throw makeError('fatal', {
                    errorType: 'ContextLengthExceeded',
                    severity: 'Fatal',
                    canFailover: true,
                });
            });

            await expect(ModelResolver.Instance.WithFailover(candidates, fn)).rejects.toThrow();
            expect(fn).toHaveBeenCalledTimes(1);
        });

        // --------------------------------------------------------------
        // ErrorScope filtering
        // --------------------------------------------------------------

        it("errorScope='RateLimitOnly' skips failover for non-rate-limit errors", async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1' }),
                makeCandidate({ modelId: 'm2' }),
            ];
            const fn = vi.fn(async () => {
                throw makeError('network', { errorType: 'NetworkError', canFailover: true });
            });

            // NetworkError doesn't match RateLimitOnly scope, so even though
            // canFailover=true, the loop shouldn't walk to m2.
            await expect(
                ModelResolver.Instance.WithFailover(candidates, fn, { errorScope: 'RateLimitOnly' }),
            ).rejects.toThrow();
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it("errorScope='NetworkOnly' allows NetworkError failover but skips others", async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1' }),
                makeCandidate({ modelId: 'm2' }),
            ];
            const fn = vi.fn(async (c: ResolvedModelCandidate) => {
                if (c.model.ID === 'm1') {
                    throw makeError('network', { errorType: 'NetworkError', canFailover: true });
                }
                return 'ok';
            });

            const result = await ModelResolver.Instance.WithFailover(candidates, fn, {
                errorScope: 'NetworkOnly',
            });
            expect(result.result).toBe('ok');
            expect(result.winner.model.ID).toBe('m2');
        });

        // --------------------------------------------------------------
        // Exhaustion
        // --------------------------------------------------------------

        it('throws aggregate error with cause + failoverAttempts when every candidate fails', async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1', vendorId: 'v1' }),
                makeCandidate({ modelId: 'm2', vendorId: 'v2' }),
            ];
            const fn = vi.fn(async () => {
                throw makeError('still down', { errorType: 'ServiceUnavailable', canFailover: true });
            });

            try {
                await ModelResolver.Instance.WithFailover(candidates, fn);
                expect.fail('should have thrown');
            } catch (e) {
                const err = e as Error & { cause?: Error; failoverAttempts?: FailoverAttempt[] };
                expect(err.failoverAttempts).toHaveLength(2);
                expect(err.failoverAttempts!.map(a => a.modelId)).toEqual(['m1', 'm2']);
                expect(err.cause).toBeDefined();
                expect(err.cause!.message).toBe('still down');
            }
        });

        // --------------------------------------------------------------
        // Rate-limit retry-on-same-candidate
        // --------------------------------------------------------------

        it('RateLimit retries the same candidate up to maxRateLimitRetries before failing over', async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1', vendorId: 'v1' }),
                makeCandidate({ modelId: 'm1', vendorId: 'v2' }),
            ];

            let v1HitCount = 0;
            const fn = vi.fn(async (c: ResolvedModelCandidate) => {
                if (c.vendorId === 'v1') {
                    v1HitCount++;
                    throw makeError('rate limited', { errorType: 'RateLimit', canFailover: true });
                }
                return `ok-${c.vendorId}`;
            });

            const result = await ModelResolver.Instance.WithFailover(candidates, fn, {
                maxRateLimitRetries: 2,
                // Use 0 ms backoff so the test finishes promptly. The implementation
                // calls setTimeout but with 0 it's effectively a microtask hop.
                rateLimitRetryDelayMs: 0,
            });

            // m1/v1 retried `maxRateLimitRetries` times (= 2) before giving up
            // — that's actually ≤2 so the loop allows the 1st attempt + 2 retries
            // = 3 hits before failing over. Then m1/v2 succeeds.
            expect(v1HitCount).toBeGreaterThanOrEqual(2);
            expect(result.result).toBe('ok-v2');
            expect(result.winner.vendorId).toBe('v2');
        }, 10_000);

        // --------------------------------------------------------------
        // failoverAttempts shape
        // --------------------------------------------------------------

        it('failoverAttempts entries carry attemptNumber, modelId, vendorId, errorType, duration, timestamp', async () => {
            const candidates = [
                makeCandidate({ modelId: 'm1', vendorId: 'v1' }),
                makeCandidate({ modelId: 'm2', vendorId: 'v2' }),
            ];
            const fn = vi.fn(async (c: ResolvedModelCandidate) => {
                if (c.model.ID === 'm1') {
                    throw makeError('boom', { errorType: 'NetworkError', canFailover: true });
                }
                return 'ok';
            });

            const result = await ModelResolver.Instance.WithFailover(candidates, fn);
            expect(result.failoverAttempts).toHaveLength(1);
            const a = result.failoverAttempts[0];
            expect(a.attemptNumber).toBe(1);
            expect(a.modelId).toBe('m1');
            expect(a.vendorId).toBe('v1');
            expect(a.errorType).toBe('NetworkError');
            expect(a.duration).toBeGreaterThanOrEqual(0);
            expect(a.timestamp).toBeInstanceOf(Date);
            expect(a.error.message).toBe('boom');
        });
    });

    // ----------------------------------------------------------------
    // Follow-up: ResolveForPrompt / ResolveForRequirements / ResolveCredential
    // / HasCredentialsAvailable need a seeded AIEngine + CredentialEngine
    // mock harness. Tracked in PR #2471 as a follow-up — these stubs make
    // the gap visible and reserve the test names.
    // ----------------------------------------------------------------

    // ----------------------------------------------------------------
    // ResolveCredential — exercises the 7-tier hierarchy
    // ----------------------------------------------------------------

    describe('ResolveCredential', () => {
        beforeEach(() => {
            resetMocks();
        });

        it('returns the explicit credential when credentialId override is supplied', async () => {
            // Tier 1 (per-request override) — bypasses everything below.
            mockCredentialEngineState.getCredentialById.mockReturnValue({
                ID: 'cred-1',
                Name: 'explicit-cred',
                CredentialTypeID: 'ct-1',
                IsActive: true,
                IsDefault: false,
            });
            mockCredentialEngineState.getCredential.mockResolvedValue({ values: { apiKey: 'EXPLICIT' } });

            const result = await ModelResolver.Instance.ResolveCredential(
                'TestLLM',
                {},
                { credentialId: 'cred-1' },
            );

            expect(result).toBe(JSON.stringify({ apiKey: 'EXPLICIT' }));
            expect(mockCredentialEngineState.getCredentialById).toHaveBeenCalledWith('cred-1');
        });

        it('throws when credentialId override points to a missing credential', async () => {
            // Preserves `resolveCredentialById` pre-extraction behavior:
            // explicit ID + missing row = hard fail (not silent fallback).
            mockCredentialEngineState.getCredentialById.mockReturnValue(undefined);

            await expect(
                ModelResolver.Instance.ResolveCredential(
                    'TestLLM',
                    {},
                    { credentialId: 'missing-cred' },
                ),
            ).rejects.toThrowError(/not found/i);
        });

        it("falls through to legacy `AI_VENDOR_API_KEY__<DRIVER>` env var when nothing else matches", async () => {
            // Tier 7 (legacy env var via GetAIAPIKey) — no credentialId,
            // no bindings configured, no type-default. The mock for
            // GetAIAPIKey returns the value the env-var resolver would.
            mockGetAIAPIKey.mockReturnValue('LEGACY-ENV-KEY');

            const result = await ModelResolver.Instance.ResolveCredential('OpenAILLM', {});

            expect(mockGetAIAPIKey).toHaveBeenCalledWith('OpenAILLM', undefined, expect.any(Boolean));
            expect(result).toBe('LEGACY-ENV-KEY');
        });

        it('returns empty string when every tier is empty', async () => {
            // GetAIAPIKey defaults to '' when nothing is configured. The
            // resolver returns whatever GetAIAPIKey returns — preserves
            // the runner's pre-extraction Promise<string> contract.
            mockGetAIAPIKey.mockReturnValue('');

            const result = await ModelResolver.Instance.ResolveCredential('UnconfiguredLLM', {});
            expect(result).toBe('');
        });

        it('uses Vendor binding when only Vendor (not ModelVendor / PromptModel) has bindings', async () => {
            // Tier 4 — vendor-level binding hits when no PromptModel or
            // ModelVendor binding is configured.
            mockAIEngineState.GetCredentialBindingsForTarget.mockImplementation(
                (type: string, _targetId: string) => {
                    if (type === 'Vendor') {
                        return [{ ID: 'b-1', CredentialID: 'cred-vendor', Priority: 1 }];
                    }
                    return [];
                },
            );
            mockCredentialEngineState.getCredentialById.mockReturnValue({
                ID: 'cred-vendor',
                Name: 'vendor-cred',
                CredentialTypeID: 'ct-1',
                IsActive: true,
                IsDefault: false,
            });
            mockCredentialEngineState.getCredential.mockResolvedValue({ values: { apiKey: 'VENDOR-KEY' } });

            const result = await ModelResolver.Instance.ResolveCredential(
                'TestLLM',
                { vendorId: 'v-1' },
            );

            expect(result).toBe(JSON.stringify({ apiKey: 'VENDOR-KEY' }));
        });

        it('skips inactive credentials and falls through to legacy fallback', async () => {
            // Inactive `IsActive=false` rows must be skipped — the binding
            // is treated as if it weren't there. Without a follow-on tier,
            // we expect `GetAIAPIKey` to be invoked.
            mockAIEngineState.GetCredentialBindingsForTarget.mockImplementation(
                (type: string) => type === 'Vendor'
                    ? [{ ID: 'b-1', CredentialID: 'cred-inactive', Priority: 1 }]
                    : [],
            );
            mockCredentialEngineState.getCredentialById.mockReturnValue({
                ID: 'cred-inactive',
                Name: 'inactive-cred',
                CredentialTypeID: 'ct-1',
                IsActive: false,
                IsDefault: false,
            });
            mockGetAIAPIKey.mockReturnValue('FALLBACK-KEY');

            const result = await ModelResolver.Instance.ResolveCredential(
                'TestLLM',
                { vendorId: 'v-1' },
            );

            // Inactive credential resolved to null inside `tryResolveCredential`,
            // hierarchy continues to the legacy env var.
            expect(result).toBe('FALLBACK-KEY');
            expect(mockGetAIAPIKey).toHaveBeenCalled();
        });

        it('skips expired credentials (ExpiresAt < now) and falls through', async () => {
            mockAIEngineState.GetCredentialBindingsForTarget.mockImplementation(
                (type: string) => type === 'Vendor'
                    ? [{ ID: 'b-1', CredentialID: 'cred-expired', Priority: 1 }]
                    : [],
            );
            mockCredentialEngineState.getCredentialById.mockReturnValue({
                ID: 'cred-expired',
                Name: 'expired-cred',
                CredentialTypeID: 'ct-1',
                IsActive: true,
                IsDefault: false,
                ExpiresAt: new Date(Date.now() - 86400000), // yesterday
            });
            mockGetAIAPIKey.mockReturnValue('FALLBACK-KEY');

            const result = await ModelResolver.Instance.ResolveCredential(
                'TestLLM',
                { vendorId: 'v-1' },
            );

            expect(result).toBe('FALLBACK-KEY');
        });
    });

    // ----------------------------------------------------------------
    // HasCredentialsAvailable — sync pre-flight check
    // ----------------------------------------------------------------

    describe('HasCredentialsAvailable', () => {
        beforeEach(() => {
            resetMocks();
        });

        it('returns true immediately when explicit credentialId is supplied', () => {
            // Tier 1 trust-me: the actual credential lookup is deferred
            // to execution time.
            const result = ModelResolver.Instance.HasCredentialsAvailable(
                'TestLLM',
                {},
                { credentialId: 'cred-1' },
            );
            expect(result).toBe(true);
        });

        it('returns true when Vendor has bindings', () => {
            mockAIEngineState.HasCredentialBindings.mockImplementation(
                (type: string, _targetId: string) => type === 'Vendor',
            );

            expect(
                ModelResolver.Instance.HasCredentialsAvailable('TestLLM', { vendorId: 'v-1' }),
            ).toBe(true);
        });

        it('returns true when only the legacy env var (apiKeys / GetAIAPIKey) is configured', () => {
            mockGetAIAPIKey.mockReturnValue('SOME-LEGACY-KEY');

            expect(
                ModelResolver.Instance.HasCredentialsAvailable('TestLLM', {}),
            ).toBe(true);
        });

        it('returns false when every tier is empty (whitespace-only legacy key counts as empty)', () => {
            mockGetAIAPIKey.mockReturnValue('   \t  ');

            expect(
                ModelResolver.Instance.HasCredentialsAvailable('TestLLM', {}),
            ).toBe(false);
        });
    });

    // ----------------------------------------------------------------
    // ResolveForRequirements — non-prompt resolution path
    // ----------------------------------------------------------------

    describe('ResolveForRequirements', () => {
        beforeEach(() => {
            resetMocks();
        });

        it('returns the only candidate when one vendor is configured for the model', async () => {
            mockAIEngineState.Models = [makeModel({ ID: 'm1' })];
            mockAIEngineState.ModelVendors = [makeModelVendor({ ModelID: 'm1', VendorID: 'v1' })];
            mockGetAIAPIKey.mockReturnValue('KEY'); // legacy fallback so primary != null

            const result = await ModelResolver.Instance.ResolveForRequirements({
                modelId: 'm1',
            });

            expect(result.primary).not.toBeNull();
            expect(result.primary!.model.ID).toBe('m1');
            expect(result.primary!.vendorId).toBe('v1');
            expect(result.candidates).toHaveLength(1);
            expect(result.consideredAll).toHaveLength(1);
        });

        it('orders candidates by Priority desc when multiple vendors share a model', async () => {
            mockAIEngineState.Models = [makeModel({ ID: 'm1' })];
            mockAIEngineState.ModelVendors = [
                makeModelVendor({ ModelID: 'm1', VendorID: 'low', Priority: 10 }),
                makeModelVendor({ ModelID: 'm1', VendorID: 'high', Priority: 100 }),
                makeModelVendor({ ModelID: 'm1', VendorID: 'mid', Priority: 50 }),
            ];
            mockGetAIAPIKey.mockReturnValue('KEY');

            const result = await ModelResolver.Instance.ResolveForRequirements({ modelId: 'm1' });

            expect(result.candidates.map(c => c.vendorId)).toEqual(['high', 'mid', 'low']);
        });

        it('filters out vendors with Status != Active', async () => {
            mockAIEngineState.Models = [makeModel({ ID: 'm1' })];
            mockAIEngineState.ModelVendors = [
                makeModelVendor({ ModelID: 'm1', VendorID: 'active', Status: 'Active' }),
                makeModelVendor({ ModelID: 'm1', VendorID: 'inactive', Status: 'Inactive' }),
                makeModelVendor({ ModelID: 'm1', VendorID: 'deprecated', Status: 'Deprecated' }),
            ];
            mockGetAIAPIKey.mockReturnValue('KEY');

            const result = await ModelResolver.Instance.ResolveForRequirements({ modelId: 'm1' });

            expect(result.candidates.map(c => c.vendorId)).toEqual(['active']);
        });

        it('filters out non-inference-provider vendor rows (model-developer TypeID)', async () => {
            mockAIEngineState.Models = [makeModel({ ID: 'm1' })];
            mockAIEngineState.ModelVendors = [
                makeModelVendor({ ModelID: 'm1', VendorID: 'inf', TypeID: INFERENCE_PROVIDER_TYPE_ID }),
                makeModelVendor({ ModelID: 'm1', VendorID: 'dev', TypeID: MODEL_DEVELOPER_TYPE_ID }),
            ];
            mockGetAIAPIKey.mockReturnValue('KEY');

            const result = await ModelResolver.Instance.ResolveForRequirements({ modelId: 'm1' });

            expect(result.candidates.map(c => c.vendorId)).toEqual(['inf']);
        });

        it('returns primary=null and selectionReason populated when no candidate has credentials', async () => {
            mockAIEngineState.Models = [makeModel({ ID: 'm1' })];
            mockAIEngineState.ModelVendors = [makeModelVendor({ ModelID: 'm1', VendorID: 'v1' })];
            mockGetAIAPIKey.mockReturnValue(''); // legacy fallback empty → no creds

            const result = await ModelResolver.Instance.ResolveForRequirements({ modelId: 'm1' });

            expect(result.primary).toBeNull();
            expect(result.candidates).toEqual([]);
            // consideredAll preserves the rejected candidate for diagnostics
            expect(result.consideredAll).toHaveLength(1);
            expect(result.consideredAll[0].credentialsAvailable).toBe(false);
            expect(result.selectionReason).toMatch(/no api keys/i);
        });
    });

    // ----------------------------------------------------------------
    // ResolveForPrompt — prompt-aware resolution
    // ----------------------------------------------------------------

    describe('ResolveForPrompt', () => {
        beforeEach(() => {
            resetMocks();
        });

        it('Phase 1: explicit `overrides.modelId` returns the matching model first', async () => {
            mockAIEngineState.Models = [
                makeModel({ ID: 'm1' }),
                makeModel({ ID: 'm2' }),
            ];
            mockAIEngineState.ModelVendors = [
                makeModelVendor({ ModelID: 'm1', VendorID: 'v1' }),
                makeModelVendor({ ModelID: 'm2', VendorID: 'v2' }),
            ];
            mockGetAIAPIKey.mockReturnValue('KEY');

            const prompt = {
                ID: 'p1',
                Name: 'TestPrompt',
                AIModelTypeID: null,
                SelectionStrategy: 'Default',
                MinPowerRank: null,
                RequireSpecificModels: false,
                PowerPreference: 'Highest',
            } as unknown as Parameters<typeof ModelResolver.Instance.ResolveForPrompt>[0];

            const result = await ModelResolver.Instance.ResolveForPrompt(prompt, { modelId: 'm2' });

            expect(result.primary).not.toBeNull();
            expect(result.primary!.model.ID).toBe('m2');
            expect(result.primary!.source).toBe('explicit');
        });

        it('returns primary=null when no model matches `prompt.AIModelTypeID`', async () => {
            mockAIEngineState.Models = [
                makeModel({ ID: 'm1', AIModelTypeID: 'embeddings-type' }),
            ];
            mockAIEngineState.ModelVendors = [makeModelVendor({ ModelID: 'm1', VendorID: 'v1' })];
            mockGetAIAPIKey.mockReturnValue('KEY');

            const prompt = {
                ID: 'p1',
                Name: 'TestPrompt',
                AIModelTypeID: 'llm-type', // doesn't match m1's embeddings-type
                SelectionStrategy: 'Default',
                MinPowerRank: null,
                RequireSpecificModels: false,
                PowerPreference: 'Highest',
            } as unknown as Parameters<typeof ModelResolver.Instance.ResolveForPrompt>[0];

            const result = await ModelResolver.Instance.ResolveForPrompt(prompt);

            expect(result.primary).toBeNull();
            expect(result.candidates).toEqual([]);
        });

        it('SelectionStrategy=Specific + RequireSpecificModels=true exhausts (Skip-style at the resolution layer) when configured prompt-models lack creds', async () => {
            // The Skip use case at the resolution layer: if the only
            // configured AIPromptModel rows have no credentials AND
            // RequireSpecificModels is true, do NOT fall through to other
            // models. Audit §3.5.8 / spec §6 acceptance criteria.
            mockAIEngineState.Models = [
                makeModel({ ID: 'm1' }),
                makeModel({ ID: 'm2' }), // not in PromptModels — should NOT be picked
            ];
            mockAIEngineState.ModelVendors = [
                makeModelVendor({ ModelID: 'm1', VendorID: 'v1' }),
                makeModelVendor({ ModelID: 'm2', VendorID: 'v2' }),
            ];
            mockAIEngineState.PromptModels = [
                {
                    ID: 'pm1',
                    PromptID: 'p1',
                    ModelID: 'm1',
                    Status: 'Active',
                    Priority: 100,
                    ConfigurationID: null,
                },
            ];
            // m1 has no creds, m2 has creds (but should not be considered)
            mockGetAIAPIKey.mockImplementation(() => '');

            const prompt = {
                ID: 'p1',
                Name: 'TestPrompt',
                AIModelTypeID: null,
                SelectionStrategy: 'Specific',
                MinPowerRank: null,
                RequireSpecificModels: true,
                PowerPreference: 'Highest',
            } as unknown as Parameters<typeof ModelResolver.Instance.ResolveForPrompt>[0];

            const result = await ModelResolver.Instance.ResolveForPrompt(prompt);

            expect(result.primary).toBeNull();
            // Only the configured m1 candidates were considered — m2 was NOT
            // walked despite having creds.
            expect(result.consideredAll.every(c => c.model.ID === 'm1')).toBe(true);
        });

        it('preferred vendor (overrides.vendorId) is marked isPreferredVendor=true and bumped to top within its model group', async () => {
            mockAIEngineState.Models = [makeModel({ ID: 'm1' })];
            mockAIEngineState.ModelVendors = [
                makeModelVendor({ ModelID: 'm1', VendorID: 'low', Priority: 10 }),
                makeModelVendor({ ModelID: 'm1', VendorID: 'high', Priority: 100 }),
            ];
            mockAIEngineState.Vendors = [
                { ID: 'low', Name: 'LowVendor' },
                { ID: 'high', Name: 'HighVendor' },
            ];
            mockGetAIAPIKey.mockReturnValue('KEY');

            const prompt = {
                ID: 'p1',
                Name: 'TestPrompt',
                AIModelTypeID: null,
                SelectionStrategy: 'Default',
                MinPowerRank: null,
                RequireSpecificModels: false,
                PowerPreference: 'Highest',
            } as unknown as Parameters<typeof ModelResolver.Instance.ResolveForPrompt>[0];

            // Force `low` to be preferred even though `high` has higher native Priority.
            const result = await ModelResolver.Instance.ResolveForPrompt(prompt, {
                modelId: 'm1',
                vendorId: 'low',
            });

            expect(result.primary).not.toBeNull();
            expect(result.primary!.vendorId).toBe('low');
            expect(result.primary!.isPreferredVendor).toBe(true);
        });

        it('selectionReason narrative names the chosen source (explicit / prompt-model / model-type / power-rank / power-match-fallback)', async () => {
            mockAIEngineState.Models = [makeModel({ ID: 'm1' })];
            mockAIEngineState.ModelVendors = [makeModelVendor({ ModelID: 'm1', VendorID: 'v1' })];
            mockGetAIAPIKey.mockReturnValue('KEY');

            const prompt = {
                ID: 'p1',
                Name: 'TestPrompt',
                AIModelTypeID: null,
                SelectionStrategy: 'Default',
                MinPowerRank: null,
                RequireSpecificModels: false,
                PowerPreference: 'Highest',
            } as unknown as Parameters<typeof ModelResolver.Instance.ResolveForPrompt>[0];

            const result = await ModelResolver.Instance.ResolveForPrompt(prompt, { modelId: 'm1' });

            // Phase 1 (explicit override) selectionReason
            expect(result.selectionReason).toMatch(/explicitly requested/i);
        });
    });
});

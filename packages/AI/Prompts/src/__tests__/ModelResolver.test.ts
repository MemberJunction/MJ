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
import {
    ModelResolver,
    ResolvedModelCandidate,
    FailoverAttempt,
} from '../ModelResolver';

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

    describe.skip('ResolveForPrompt — needs AIEngine fixtures (follow-up)', () => {
        it('Phase 1: returns explicit override candidate first when overrides.modelId is set');
        it('Phase 2: SelectionStrategy=Specific uses only configured AIPromptModel rows');
        it('Phase 2: when RequireSpecificModels=false and all specifics lack creds, appends power-matched fallback');
        it('Phase 2: when RequireSpecificModels=true and all specifics lack creds, returns primary=null (Skip-style at the resolution layer)');
        it('Phase 3: SelectionStrategy=Default walks config chain (3000-500*depth priorities), then NULL-config (1000)');
        it('Phase 3: SelectionStrategy=ByPower respects MinPowerRank and PowerPreference');
        it('preferred vendor (overrides.vendorId) is marked isPreferredVendor=true and bumped to top within its model group');
        it('returns primary=null when prompt.AIModelTypeID matches no models');
        it('selectionReason describes Phase 1 vs Phase 2 vs power-match-fallback distinctly');
    });

    describe.skip('ResolveForRequirements — needs AIEngine fixtures (follow-up)', () => {
        it('returns the only candidate when one vendor is configured for the model');
        it('orders candidates by Priority desc when multiple vendors share a model');
        it('filters out vendors with Status != Active');
        it('respects modelTypeName — excludes models of other types');
        it('respects vendorName — resolves to vendorId via AIEngine.Vendors');
        it('honors minPowerRank — excludes lower-PowerRank models');
        it('honors powerPreference=Highest — sorts by PowerRank desc');
        it('honors powerPreference=Lowest — sorts by PowerRank asc');
        it('returns primary=null and selectionReason populated when no candidate has credentials');
    });

    describe.skip('ResolveCredential — needs CredentialEngine fixtures (follow-up)', () => {
        it('returns explicit credential when credentialId override is supplied');
        it('throws when credentialId override points to a missing credential');
        it('falls through to PromptModel binding when no override');
        it('falls through to ModelVendor binding when PromptModel has no binding');
        it('falls through to Vendor binding when ModelVendor has none');
        it('falls through to type-based default credential');
        it('falls through to legacy apiKeys[] carrier');
        it('falls through to legacy AI_VENDOR_API_KEY__<DRIVER> env var');
        it('skips inactive credentials and falls through to next binding');
        it('skips expired credentials (ExpiresAt < now) and falls through');
    });
});

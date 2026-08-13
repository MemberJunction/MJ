/**
 * @fileoverview Shared BaseLLM streaming / ChatResult conformance suite.
 *
 * WHY THIS LIVES IN `@memberjunction/unit-testing`: every LLM provider package implements the
 * same `BaseLLM` template-method contract (chunk accumulation, finalize, cancellation, failure
 * shapes), but each package tests it in isolation. This module packages the SHARED contract as a
 * parameterized Vitest suite that provider packages import in THEIR OWN tests, so the contract is
 * asserted once and applied uniformly. It belongs in the shared test-utilities package — which is
 * where MJ's cross-package test harness (TestLLM, the ChatResult factories) already lives — rather
 * than shipping inside the runtime `@memberjunction/ai` package, so vendor packages never carry
 * test code or an optional `vitest` peer dependency in their published output.
 *
 * HOW A PROVIDER PACKAGE USES IT:
 * ```ts
 * import { RunLLMConformanceSuite } from '@memberjunction/unit-testing';
 * import { MyProviderLLM } from '../models/myProvider';
 *
 * RunLLMConformanceSuite({
 *     ProviderName: 'MyProvider',
 *     CreateLLM: () => buildLLMWithMockedVendorClient(),
 *     ...
 * });
 * ```
 *
 * This module imports `vitest` and is exported from the package index like the rest of
 * `@memberjunction/unit-testing` — a test-only package that consumers depend on as a
 * devDependency, so importing it never pulls test code into a runtime bundle. Only ever import it
 * from test code.
 *
 * RULES FOR CONFORMANCE TEST FILES:
 *  - Do NOT `vi.mock('@memberjunction/ai')` in a test file that runs this suite — the whole point
 *    is to drive the REAL BaseLLM template method and the REAL ChatResult/ModelUsage classes.
 *  - Mock ONLY the vendor SDK boundary (the same seam the Anthropic/OpenAI driver tests use):
 *    either module-mock the vendor SDK or inject a scriptable fake client into the driver.
 *  - Vendor mocks must mimic the real SDK's abort contract: a scripted call that receives an
 *    already-aborted `AbortSignal` must fail with the SDK's abort error (or the DOM-standard
 *    `AbortError`) instead of responding. Drivers that pre-check the token themselves never reach
 *    the mock, so this requirement is inert for them — but it must hold for drivers that delegate
 *    abort detection to their SDK (e.g. the OpenAI family).
 *
 * THE CONTRACT THIS SUITE ASSERTS (verified against BaseLLM, not aspirational):
 *  - Non-streaming success resolves ChatResult{success:true} with content + ModelUsage populated.
 *  - Streaming accumulates chunks in order, fires OnContent per chunk then `('', true)`, fires
 *    OnComplete with the same ChatResult the promise resolves with, and finalizes a result
 *    consistent with the non-streaming shape.
 *  - Streaming failures REJECT with a failed ChatResult (statusText 'error', errorInfo populated)
 *    — never an unwrapped vendor error, and never a truncated success
 *    (BaseLLM.handleStreamingChatCompletion builds and rejects that ChatResult itself).
 *  - Non-streaming failures are PROVIDER-DEFINED: BaseLLM.ChatCompletion imposes no normalization
 *    on that path — some drivers throw the vendor error, others resolve a failed ChatResult. The
 *    guaranteed normalizing layer is ChatCompletions (plural), which converts a rejection into a
 *    resolved failed ChatResult with errorInfo. `NonStreamingFailureMode` captures which behavior
 *    the driver under test has, and the plural guarantee is asserted for every driver.
 *  - Cancellation mid-stream RESOLVES (does not reject) with the documented cancelled shape:
 *    ChatResult{success:false, statusText:'cancelled' (case-insensitive), errorInfo populated,
 *    empty choices} — partial content is never passed off as a success.
 *
 * Real deviations from the ideal contract are not patched over: declare them in
 * `KnownDeviations` (with a reason) and the suite pins the ACTUAL behavior under a test name
 * prefixed `[KNOWN DEVIATION]`, so the deviation is loud in test output and starts failing the
 * moment the driver is fixed (forcing the ledger entry to be removed).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BaseLLM, ChatMessageRole, ChatParams, ChatResult, StreamingChatCallbacks, ModelUsage } from '@memberjunction/ai';

/**
 * Token counts a scripted vendor response reports, expressed provider-agnostically. Adapters map
 * these into the vendor's native usage shape (e.g. `prompt_tokens` / `promptTokens` /
 * `prompt_eval_count`); the suite asserts they round-trip into `ModelUsage` unchanged.
 */
export interface ExpectedUsageCounts {
    PromptTokens: number;
    CompletionTokens: number;
}

/** Where a scripted vendor failure strikes. */
export type FailureSite =
    /** The non-streaming completion call fails. */
    | 'nonStreaming'
    /** Creating the stream fails (connection refused, auth error, ...). */
    | 'streamStart'
    /** The stream fails part-way through, after emitting `ChunkBeforeError`. */
    | 'midStream';

/**
 * The catalog of contract deviations this suite knows how to pin. Each kind flips a specific
 * assertion from the ideal contract to the driver's actual behavior.
 */
export type LLMConformanceDeviationKind =
    /**
     * The driver's streaming path reports ModelUsage(0, 0) even though the vendor stream carries
     * token counts (e.g. the driver's processStreamingChunk never reads chunk usage).
     */
    | 'StreamingDropsUsage'
    /**
     * The driver's failed non-streaming ChatResult ('failedResult' mode) does not populate
     * `errorInfo`, so retry/failover layers get no structured error classification.
     */
    | 'FailedResultLacksErrorInfo';

/** A documented, pinned deviation from the shared contract. */
export interface LLMConformanceDeviation {
    Kind: LLMConformanceDeviationKind;
    /** WHY the driver deviates — required so the ledger is self-explanatory. */
    Reason: string;
}

/**
 * Configuration for {@link RunLLMConformanceSuite}. The `Script*` functions program the provider
 * test file's vendor-SDK mock; the suite tells the adapter WHAT the vendor should do, the adapter
 * translates that into the vendor's native wire shapes.
 */
export interface LLMConformanceSuiteConfig {
    /** Human-readable provider name, used in describe() labels. */
    ProviderName: string;

    /**
     * Construct a fresh driver instance wired to the scriptable vendor mock. Called in
     * beforeEach, so every test gets a clean instance (and clean streaming state).
     */
    CreateLLM: () => BaseLLM;

    /** Whether the driver declares streaming support (asserted against `SupportsStreaming`). */
    SupportsStreaming: boolean;

    /**
     * How the driver surfaces NON-cancellation vendor failures on the NON-streaming path.
     * BaseLLM imposes no rule here (ChatCompletions, plural, is the normalizing layer):
     *  - 'throws': the vendor error propagates out of ChatCompletion (OpenAI family, Groq,
     *    Cerebras, Mistral).
     *  - 'failedResult': the driver catches and resolves ChatResult{success:false} (Ollama, Azure).
     */
    NonStreamingFailureMode: 'throws' | 'failedResult';

    /**
     * What happens when a STREAMING request is made with an already-aborted token. Required when
     * `SupportsStreaming` is true.
     *  - 'resolvesCancelled': the driver detects the pre-abort itself (empty stream + cancelled
     *    finalize) and the promise resolves with the documented cancelled shape (Groq, Cerebras).
     *  - 'rejectsErrorResult': createStreamingRequest throws (driver pre-check or SDK abort
     *    error), and BaseLLM's outer catch — which does NOT special-case cancellation — rejects
     *    with a generic statusText:'error' ChatResult instead of the cancelled shape (OpenAI
     *    family, Mistral, Ollama, Azure). Pinned under a `[KNOWN DEVIATION]` test name.
     */
    PreAbortedStreamingBehavior?: 'resolvesCancelled' | 'rejectsErrorResult';

    /** Program the vendor mock: the next non-streaming call succeeds with this content + usage. */
    ScriptNonStreamingSuccess: (content: string, usage: ExpectedUsageCounts) => void;

    /**
     * Program the vendor mock: the next streaming call emits these text chunks (one vendor chunk
     * per entry, in order) and then completes, reporting `usage` in the vendor's native place for
     * stream usage (final chunk / usage event) even if the driver is known to drop it.
     */
    ScriptStreamingSuccess: (chunks: string[], usage: ExpectedUsageCounts) => void;

    /**
     * Program the vendor mock: the next call fails with `error` at the given site. For
     * 'midStream', the stream must first emit `options.ChunkBeforeError` (as a normal text chunk)
     * and then throw, so the suite can prove partial content is discarded.
     */
    ScriptFailure: (error: Error, at: FailureSite, options?: { ChunkBeforeError?: string }) => void;

    /**
     * Program the vendor mock for a mid-stream cancellation: emit `chunksBeforeAbort` as normal
     * text chunks, then abort `controller`, then end the stream the way the real SDK ends an
     * aborted stream (throw its abort error, or end iteration silently — whichever is faithful).
     */
    ScriptStreamingCancellation: (chunksBeforeAbort: string[], controller: AbortController) => void;

    /** Documented deviations from the ideal contract — see {@link LLMConformanceDeviation}. */
    KnownDeviations?: LLMConformanceDeviation[];
}

// ---------------------------------------------------------------------------------------------
// Canonical scripted fixtures (shared by every provider so results are comparable across suites)
// ---------------------------------------------------------------------------------------------

const NON_STREAMING_CONTENT = 'The quick brown fox jumps over the lazy dog.';
const NON_STREAMING_USAGE: ExpectedUsageCounts = { PromptTokens: 11, CompletionTokens: 7 };
const STREAMING_CHUNKS = ['Hello', ', ', 'streaming ', 'world.'];
const STREAMING_USAGE: ExpectedUsageCounts = { PromptTokens: 5, CompletionTokens: 9 };
const FAILURE_MESSAGE = 'vendor exploded (conformance)';
const MID_STREAM_CHUNK = 'partial ';
const CANCEL_CHUNK = 'Hello ';

interface RecordedContentCall {
    Chunk: string;
    IsComplete: boolean;
}

interface StreamingRecorder {
    ContentCalls: RecordedContentCall[];
    CompleteCalls: ChatResult[];
    ErrorCalls: unknown[];
    Callbacks: StreamingChatCallbacks;
}

type SettledChat =
    | { Status: 'resolved'; Value: ChatResult }
    | { Status: 'rejected'; Reason: unknown };

function createStreamingRecorder(): StreamingRecorder {
    const contentCalls: RecordedContentCall[] = [];
    const completeCalls: ChatResult[] = [];
    const errorCalls: unknown[] = [];
    return {
        ContentCalls: contentCalls,
        CompleteCalls: completeCalls,
        ErrorCalls: errorCalls,
        Callbacks: {
            OnContent: (chunk: string, isComplete: boolean) => {
                contentCalls.push({ Chunk: chunk, IsComplete: isComplete });
            },
            OnComplete: (finalResponse: ChatResult) => {
                completeCalls.push(finalResponse);
            },
            OnError: (error: unknown) => {
                errorCalls.push(error);
            }
        }
    };
}

function buildChatParams(cancellationToken?: AbortSignal): ChatParams {
    const params = new ChatParams();
    params.model = 'conformance-test-model';
    params.messages = [{ role: ChatMessageRole.user, content: 'Say hello for the conformance suite' }];
    if (cancellationToken) {
        params.cancellationToken = cancellationToken;
    }
    return params;
}

async function settle(promise: Promise<ChatResult>): Promise<SettledChat> {
    try {
        return { Status: 'resolved', Value: await promise };
    } catch (reason) {
        return { Status: 'rejected', Reason: reason };
    }
}

/** Narrow a rejection reason to ChatResult, asserting the shape on the way. */
function expectChatResultRejection(settled: SettledChat): ChatResult {
    expect(settled.Status).toBe('rejected');
    const reason = (settled as { Status: 'rejected'; Reason: unknown }).Reason;
    expect(reason).toBeInstanceOf(ChatResult);
    return reason as ChatResult;
}

/**
 * Run the shared BaseLLM streaming/ChatResult conformance suite against one provider driver.
 * Registers a full `describe` block — call it at the top level of a provider test file.
 */
export function RunLLMConformanceSuite(config: LLMConformanceSuiteConfig): void {
    if (config.SupportsStreaming && !config.PreAbortedStreamingBehavior) {
        throw new Error(
            `LLM conformance suite for ${config.ProviderName}: PreAbortedStreamingBehavior is required when SupportsStreaming is true`
        );
    }

    const declaredDeviations = config.KnownDeviations ?? [];
    const queriedKinds = new Set<LLMConformanceDeviationKind>();
    const hasDeviation = (kind: LLMConformanceDeviationKind): boolean => {
        queriedKinds.add(kind);
        return declaredDeviations.some((d) => d.Kind === kind);
    };

    // Deviation flags are resolved once, at suite-definition time, so the ledger check below can
    // verify every declared deviation was actually exercised.
    const streamingDropsUsage = config.SupportsStreaming ? hasDeviation('StreamingDropsUsage') : false;
    const failedResultLacksErrorInfo =
        config.NonStreamingFailureMode === 'failedResult' ? hasDeviation('FailedResultLacksErrorInfo') : false;

    describe(`${config.ProviderName} — BaseLLM streaming/ChatResult conformance`, () => {
        let llm: BaseLLM;

        beforeEach(() => {
            llm = config.CreateLLM();
        });

        describe('capability declaration', () => {
            it(`declares SupportsStreaming = ${config.SupportsStreaming}`, () => {
                expect(llm.SupportsStreaming).toBe(config.SupportsStreaming);
            });
        });

        describe('non-streaming ChatCompletion — success contract', () => {
            it('resolves a successful ChatResult carrying the vendor content', async () => {
                config.ScriptNonStreamingSuccess(NON_STREAMING_CONTENT, NON_STREAMING_USAGE);

                const result = await llm.ChatCompletion(buildChatParams());

                expect(result.success).toBe(true);
                expect(result.statusText).toBeTruthy();
                expect(result.data.choices.length).toBeGreaterThanOrEqual(1);
                const choice = result.data.choices[0];
                expect(choice.message.role).toBe('assistant');
                expect(choice.message.content).toBe(NON_STREAMING_CONTENT);
                expect(choice.finish_reason).toBe('stop');
            });

            it('normalizes the vendor token accounting into a populated ModelUsage', async () => {
                config.ScriptNonStreamingSuccess(NON_STREAMING_CONTENT, NON_STREAMING_USAGE);

                const result = await llm.ChatCompletion(buildChatParams());

                expect(result.data.usage).toBeInstanceOf(ModelUsage);
                const usage = result.data.usage as ModelUsage;
                expect(usage.promptTokens).toBe(NON_STREAMING_USAGE.PromptTokens);
                expect(usage.completionTokens).toBe(NON_STREAMING_USAGE.CompletionTokens);
            });

            it('reports coherent timing (endTime >= startTime)', async () => {
                config.ScriptNonStreamingSuccess(NON_STREAMING_CONTENT, NON_STREAMING_USAGE);

                const result = await llm.ChatCompletion(buildChatParams());

                expect(result.startTime).toBeInstanceOf(Date);
                expect(result.endTime).toBeInstanceOf(Date);
                expect(result.endTime.getTime()).toBeGreaterThanOrEqual(result.startTime.getTime());
            });
        });

        describe('non-streaming ChatCompletion — failure contract', () => {
            if (config.NonStreamingFailureMode === 'throws') {
                it('propagates the vendor error out of ChatCompletion (this driver does not normalize; ChatCompletions is the normalizing layer)', async () => {
                    config.ScriptFailure(new Error(FAILURE_MESSAGE), 'nonStreaming');

                    const settled = await settle(llm.ChatCompletion(buildChatParams()));

                    expect(settled.Status).toBe('rejected');
                    const reason = (settled as { Status: 'rejected'; Reason: unknown }).Reason;
                    expect(reason).toBeInstanceOf(Error);
                    expect((reason as Error).message).toContain(FAILURE_MESSAGE);
                });
            } else {
                it('resolves a failed ChatResult (success=false) with errorMessage and exception populated', async () => {
                    config.ScriptFailure(new Error(FAILURE_MESSAGE), 'nonStreaming');

                    const result = await llm.ChatCompletion(buildChatParams());

                    expect(result.success).toBe(false);
                    expect(result.errorMessage).toContain(FAILURE_MESSAGE);
                    expect(result.exception).toBeTruthy();
                    expect(result.data.choices).toHaveLength(0);
                });

                if (failedResultLacksErrorInfo) {
                    it('[KNOWN DEVIATION] failed non-streaming ChatResult lacks errorInfo', async () => {
                        config.ScriptFailure(new Error(FAILURE_MESSAGE), 'nonStreaming');

                        const result = await llm.ChatCompletion(buildChatParams());

                        expect(result.success).toBe(false);
                        // Pinned actual behavior — remove the KnownDeviations entry when fixed.
                        expect(result.errorInfo).toBeUndefined();
                    });
                } else {
                    it('populates errorInfo on the failed ChatResult', async () => {
                        config.ScriptFailure(new Error(FAILURE_MESSAGE), 'nonStreaming');

                        const result = await llm.ChatCompletion(buildChatParams());

                        expect(result.success).toBe(false);
                        expect(result.errorInfo).toBeDefined();
                    });
                }
            }

            it('ChatCompletions (plural) normalizes the failure into a resolved failed ChatResult', async () => {
                config.ScriptFailure(new Error(FAILURE_MESSAGE), 'nonStreaming');

                const results = await llm.ChatCompletions([buildChatParams()]);

                expect(results).toHaveLength(1);
                expect(results[0].success).toBe(false);
                expect(results[0].errorMessage).toContain(FAILURE_MESSAGE);
                if (config.NonStreamingFailureMode === 'throws') {
                    // The rejection was normalized by ChatCompletions itself, which always
                    // populates errorInfo via ErrorAnalyzer.
                    expect(results[0].errorInfo).toBeDefined();
                } else if (!failedResultLacksErrorInfo) {
                    expect(results[0].errorInfo).toBeDefined();
                }
            });
        });

        if (config.SupportsStreaming) {
            describe('streaming ChatCompletion — success contract', () => {
                let recorder: StreamingRecorder;
                let result: ChatResult;

                beforeEach(async () => {
                    config.ScriptStreamingSuccess(STREAMING_CHUNKS, STREAMING_USAGE);
                    recorder = createStreamingRecorder();
                    const params = buildChatParams();
                    params.streaming = true;
                    params.streamingCallbacks = recorder.Callbacks;
                    result = await llm.ChatCompletion(params);
                });

                it('accumulates the chunks, in order, into the final content', () => {
                    expect(result.success).toBe(true);
                    expect(result.data.choices[0].message.content).toBe(STREAMING_CHUNKS.join(''));
                });

                it('fires OnContent once per chunk in order, then signals completion with an empty final call', () => {
                    const nonFinal = recorder.ContentCalls.filter((c) => !c.IsComplete);
                    expect(nonFinal.map((c) => c.Chunk)).toEqual(STREAMING_CHUNKS);
                    const last = recorder.ContentCalls[recorder.ContentCalls.length - 1];
                    expect(last).toEqual({ Chunk: '', IsComplete: true });
                    expect(recorder.ContentCalls).toHaveLength(STREAMING_CHUNKS.length + 1);
                });

                it('invokes OnComplete exactly once, with the same ChatResult the promise resolves with', () => {
                    expect(recorder.CompleteCalls).toHaveLength(1);
                    expect(recorder.CompleteCalls[0]).toBe(result);
                });

                it('does not invoke OnError on a successful stream', () => {
                    expect(recorder.ErrorCalls).toHaveLength(0);
                });

                it('finalizes a ChatResult consistent with the non-streaming shape', () => {
                    expect(result).toBeInstanceOf(ChatResult);
                    expect(result.statusText).toBeTruthy();
                    const choice = result.data.choices[0];
                    expect(choice.message.role).toBe('assistant');
                    expect(choice.finish_reason).toBe('stop');
                    expect(result.data.usage).toBeInstanceOf(ModelUsage);
                });

                if (streamingDropsUsage) {
                    it('[KNOWN DEVIATION] drops the vendor-reported usage on the streaming path (reports 0/0)', () => {
                        const usage = result.data.usage as ModelUsage;
                        // Pinned actual behavior — the vendor stream carried
                        // STREAMING_USAGE, the driver dropped it. Remove the
                        // KnownDeviations entry when fixed.
                        expect(usage.promptTokens).toBe(0);
                        expect(usage.completionTokens).toBe(0);
                    });
                } else {
                    it('carries the vendor-reported usage into the finalized ChatResult', () => {
                        const usage = result.data.usage as ModelUsage;
                        expect(usage.promptTokens).toBe(STREAMING_USAGE.PromptTokens);
                        expect(usage.completionTokens).toBe(STREAMING_USAGE.CompletionTokens);
                    });
                }

                it('stamps template-method timing onto the finalized result', () => {
                    expect(result.startTime).toBeInstanceOf(Date);
                    expect(result.endTime).toBeInstanceOf(Date);
                    expect(result.endTime.getTime()).toBeGreaterThanOrEqual(result.startTime.getTime());
                });
            });

            describe('streaming ChatCompletion — failure contract', () => {
                it('rejects with a failed ChatResult when the stream cannot be created — never an unwrapped vendor error', async () => {
                    const vendorError = new Error(FAILURE_MESSAGE);
                    config.ScriptFailure(vendorError, 'streamStart');
                    const recorder = createStreamingRecorder();
                    const params = buildChatParams();
                    params.streaming = true;
                    params.streamingCallbacks = recorder.Callbacks;

                    const settled = await settle(llm.ChatCompletion(params));

                    const rejection = expectChatResultRejection(settled);
                    expect(rejection.success).toBe(false);
                    expect(rejection.statusText).toBe('error');
                    expect(rejection.errorMessage).toContain(FAILURE_MESSAGE);
                    expect(rejection.errorInfo).toBeDefined();
                    expect(rejection.data.choices).toHaveLength(0);
                    expect(recorder.ErrorCalls).toHaveLength(1);
                    expect(recorder.ErrorCalls[0]).toBe(vendorError);
                    expect(recorder.CompleteCalls).toHaveLength(0);
                });

                it('rejects with a failed ChatResult when the stream dies mid-flight, discarding the partial content', async () => {
                    const vendorError = new Error(FAILURE_MESSAGE);
                    config.ScriptFailure(vendorError, 'midStream', { ChunkBeforeError: MID_STREAM_CHUNK });
                    const recorder = createStreamingRecorder();
                    const params = buildChatParams();
                    params.streaming = true;
                    params.streamingCallbacks = recorder.Callbacks;

                    const settled = await settle(llm.ChatCompletion(params));

                    // The stream really was mid-flight: the pre-error chunk reached OnContent...
                    expect(recorder.ContentCalls.some((c) => c.Chunk === MID_STREAM_CHUNK && !c.IsComplete)).toBe(true);
                    // ...but the truncated content is NOT finalized as a success.
                    const rejection = expectChatResultRejection(settled);
                    expect(rejection.success).toBe(false);
                    expect(rejection.statusText).toBe('error');
                    expect(rejection.errorMessage).toContain(FAILURE_MESSAGE);
                    expect(rejection.errorInfo).toBeDefined();
                    expect(rejection.data.choices).toHaveLength(0);
                    expect(recorder.ErrorCalls).toHaveLength(1);
                    expect(recorder.CompleteCalls).toHaveLength(0);
                });
            });
        }

        describe('cancellation contract', () => {
            it('resolves a cancelled failed ChatResult when the token is already aborted before a non-streaming call', async () => {
                const controller = new AbortController();
                controller.abort();
                // Script a success so the ONLY way to a failed result is honoring the token.
                config.ScriptNonStreamingSuccess(NON_STREAMING_CONTENT, NON_STREAMING_USAGE);

                const result = await llm.ChatCompletion(buildChatParams(controller.signal));

                expect(result.success).toBe(false);
                expect(result.statusText.toLowerCase()).toBe('cancelled');
                expect(result.errorInfo).toBeDefined();
                expect(result.data.choices).toHaveLength(0);
            });

            if (config.SupportsStreaming) {
                it('resolves the documented cancelled ChatResult when the stream is aborted mid-flight — partial content is not passed off as success', async () => {
                    const controller = new AbortController();
                    config.ScriptStreamingCancellation([CANCEL_CHUNK], controller);
                    const recorder = createStreamingRecorder();
                    const params = buildChatParams(controller.signal);
                    params.streaming = true;
                    params.streamingCallbacks = recorder.Callbacks;

                    const result = await llm.ChatCompletion(params);

                    expect(result).toBeInstanceOf(ChatResult);
                    expect(result.success).toBe(false);
                    expect(result.statusText.toLowerCase()).toBe('cancelled');
                    expect(result.errorInfo).toBeDefined();
                    expect(result.data.choices).toHaveLength(0);
                    // Prove the abort really happened mid-stream: the pre-abort chunk flowed.
                    expect(recorder.ContentCalls.some((c) => c.Chunk === CANCEL_CHUNK && !c.IsComplete)).toBe(true);
                    // The cancelled result still flows through OnComplete (BaseLLM resolves it).
                    expect(recorder.CompleteCalls).toHaveLength(1);
                    expect(recorder.CompleteCalls[0]).toBe(result);
                    expect(recorder.ErrorCalls).toHaveLength(0);
                });

                if (config.PreAbortedStreamingBehavior === 'resolvesCancelled') {
                    it('resolves a cancelled ChatResult when the token is aborted before the stream starts', async () => {
                        const controller = new AbortController();
                        controller.abort();
                        config.ScriptStreamingSuccess(STREAMING_CHUNKS, STREAMING_USAGE);
                        const recorder = createStreamingRecorder();
                        const params = buildChatParams(controller.signal);
                        params.streaming = true;
                        params.streamingCallbacks = recorder.Callbacks;

                        const result = await llm.ChatCompletion(params);

                        expect(result.success).toBe(false);
                        expect(result.statusText.toLowerCase()).toBe('cancelled');
                        expect(result.data.choices).toHaveLength(0);
                    });
                } else {
                    it("[KNOWN DEVIATION] a pre-aborted streaming request rejects with a generic statusText='error' ChatResult instead of resolving the cancelled shape", async () => {
                        // BaseLLM's outer streaming catch does not special-case cancellation, so a
                        // createStreamingRequest that throws on a pre-aborted token surfaces as a
                        // generic 'error' rejection rather than the documented cancelled result.
                        const controller = new AbortController();
                        controller.abort();
                        config.ScriptStreamingSuccess(STREAMING_CHUNKS, STREAMING_USAGE);
                        const recorder = createStreamingRecorder();
                        const params = buildChatParams(controller.signal);
                        params.streaming = true;
                        params.streamingCallbacks = recorder.Callbacks;

                        const settled = await settle(llm.ChatCompletion(params));

                        const rejection = expectChatResultRejection(settled);
                        expect(rejection.success).toBe(false);
                        expect(rejection.statusText).toBe('error');
                        expect(recorder.CompleteCalls).toHaveLength(0);
                    });
                }
            }
        });

        describe('streaming fallback', () => {
            if (config.SupportsStreaming) {
                it('falls back to the non-streaming path when streaming is requested without callbacks', async () => {
                    config.ScriptNonStreamingSuccess(NON_STREAMING_CONTENT, NON_STREAMING_USAGE);
                    const params = buildChatParams();
                    params.streaming = true; // no streamingCallbacks -> BaseLLM routes non-streaming

                    const result = await llm.ChatCompletion(params);

                    expect(result.success).toBe(true);
                    expect(result.data.choices[0].message.content).toBe(NON_STREAMING_CONTENT);
                });
            } else {
                it('falls back to the non-streaming path when streaming is requested (provider cannot stream) — callbacks are not invoked', async () => {
                    config.ScriptNonStreamingSuccess(NON_STREAMING_CONTENT, NON_STREAMING_USAGE);
                    const recorder = createStreamingRecorder();
                    const params = buildChatParams();
                    params.streaming = true;
                    params.streamingCallbacks = recorder.Callbacks;

                    const result = await llm.ChatCompletion(params);

                    expect(result.success).toBe(true);
                    expect(result.data.choices[0].message.content).toBe(NON_STREAMING_CONTENT);
                    expect(recorder.ContentCalls).toHaveLength(0);
                    expect(recorder.CompleteCalls).toHaveLength(0);
                });
            }
        });

        describe('known deviations ledger', () => {
            it('every declared deviation is exercised by this suite and documents a reason', () => {
                for (const deviation of declaredDeviations) {
                    expect(
                        deviation.Reason.trim().length,
                        `KnownDeviations['${deviation.Kind}'] must document WHY the driver deviates`
                    ).toBeGreaterThan(0);
                    expect(
                        queriedKinds.has(deviation.Kind),
                        `KnownDeviations['${deviation.Kind}'] declared but never exercised by this suite configuration — stale entry?`
                    ).toBe(true);
                }
            });
        });
    });
}

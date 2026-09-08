/**
 * A controllable LLM driver for unit tests that extends the REAL `BaseLLM` from
 * `@memberjunction/ai`.
 *
 * Why this exists: tests across the AI stack used to hand-fake `BaseLLM` (and
 * the `ChatResult` shapes it returns) per test file. Those structural fakes
 * drift from the real contracts as they evolve — the exact bug class behind the
 * historical failover bug, where drivers RETURN `ChatResult{success:false}`
 * instead of throwing. `TestLLM` inherits the real `ChatCompletion` routing,
 * the real streaming template method, and the real capability getters, so a
 * contract change in `@memberjunction/ai` breaks the harness at compile time
 * instead of silently diverging.
 *
 * Usage:
 * ```ts
 * const llm = new TestLLM();
 * llm.Script(
 *   { kind: 'fail', error: new Error('Rate limit exceeded') },  // real ErrorAnalyzer errorInfo
 *   { kind: 'succeed', content: 'recovered' },
 * );
 * registerTestLLM(llm, ['AnthropicLLM', 'OpenAILLM']);          // real ClassFactory resolution
 * // ... drive the code under test ...
 * expect(llm.CalledModels).toEqual(['api-claude', 'api-gpt']);
 * ```
 */
import {
  BaseLLM,
  ChatParams,
  ChatResult,
  ModelUsage,
  type ClassifyParams,
  type ClassifyResult,
  type FileCapabilities,
  type SummarizeParams,
  type SummarizeResult,
} from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { makeDriverFailureChatResult, makeModelUsage, makeSuccessChatResult } from './chat-result-factories';

/**
 * One scripted per-call outcome for {@link TestLLM.Script}.
 *
 * - `succeed` — resolves with a successful real `ChatResult` carrying `content`
 *   (and optionally a specific usage / reported model / thinking text).
 * - `fail` — DRIVER-style failure: resolves with `ChatResult{success:false}`
 *   whose `errorInfo` is built by the REAL `ErrorAnalyzer` from `error`, exactly
 *   how production drivers report provider errors (the historical failover bug
 *   class — failover must trigger off the returned result, not just exceptions).
 * - `failResult` — resolves with a test-supplied failed `ChatResult` verbatim,
 *   for cases where the test controls `errorInfo` (including leaving it absent).
 * - `throw` — SDK-style failure: the returned promise rejects with `error`.
 * - `hang` — never settles; models a hung provider socket (timeout tests).
 * - `stream` — streams `chunks` through the real BaseLLM streaming template
 *   method when the caller requested streaming; in a non-streaming call the
 *   chunks resolve joined as one successful result.
 */
export type TestLLMOutcome =
  | { kind: 'succeed'; content: string; usage?: ModelUsage; model?: string; thinking?: string; delayMS?: number }
  | { kind: 'fail'; error: Error; delayMS?: number }
  | { kind: 'failResult'; result: ChatResult }
  | { kind: 'throw'; error: Error; delayMS?: number }
  | { kind: 'hang' }
  | { kind: 'stream'; chunks: string[]; usage?: ModelUsage; model?: string };

const DEFAULT_OUTCOME: TestLLMOutcome = { kind: 'succeed', content: 'test response' };

/**
 * Scriptable, call-recording LLM driver extending the real `BaseLLM`.
 *
 * Scripted outcomes are consumed one per `ChatCompletion` call, in order. When
 * the script is exhausted the {@link SetDefaultOutcome default outcome} is used
 * (or, with {@link RepeatLastOutcome}, the final scripted outcome repeats).
 * Every call's real `ChatParams` is recorded on {@link Calls}.
 */
export class TestLLM extends BaseLLM {
  private script: TestLLMOutcome[] = [];
  private defaultOutcome: TestLLMOutcome = DEFAULT_OUTCOME;
  private recordedCalls: ChatParams[] = [];
  private supportsStreaming = false;
  private supportsPrefill = false;
  private fileCapabilities: FileCapabilities | null = null;
  private streamFinalUsage: ModelUsage | undefined;
  private streamFinalModel: string | undefined;

  /**
   * When true and the script is down to its final outcome, that outcome keeps
   * repeating for every subsequent call instead of falling back to the default
   * outcome ("advance through the script, then repeat the last entry").
   */
  public RepeatLastOutcome = false;

  constructor(apiKey = 'test-api-key') {
    super(apiKey);
  }

  // ------------------------------------------------------------------
  // Scripting
  // ------------------------------------------------------------------

  /** Replaces the outcome queue with `outcomes` (consumed one per call, in order). */
  public Script(...outcomes: TestLLMOutcome[]): this {
    this.script = [...outcomes];
    return this;
  }

  /** Appends `outcomes` to the current queue. */
  public Enqueue(...outcomes: TestLLMOutcome[]): this {
    this.script.push(...outcomes);
    return this;
  }

  /** Sets the outcome used whenever the script is exhausted (default: succeed with `'test response'`). */
  public SetDefaultOutcome(outcome: TestLLMOutcome): this {
    this.defaultOutcome = outcome;
    return this;
  }

  /** Clears the script, recorded calls, and all configuration back to initial state. */
  public Reset(): this {
    this.script = [];
    this.recordedCalls = [];
    this.defaultOutcome = DEFAULT_OUTCOME;
    this.RepeatLastOutcome = false;
    this.supportsStreaming = false;
    this.supportsPrefill = false;
    this.fileCapabilities = null;
    this.streamFinalUsage = undefined;
    this.streamFinalModel = undefined;
    return this;
  }

  /** Number of scripted outcomes not yet consumed. */
  public get PendingOutcomeCount(): number {
    return this.script.length;
  }

  // ------------------------------------------------------------------
  // Call recording
  // ------------------------------------------------------------------

  /** The real `ChatParams` of every `ChatCompletion` call, in order. */
  public get Calls(): readonly ChatParams[] {
    return this.recordedCalls;
  }

  /** Number of `ChatCompletion` calls received. */
  public get CallCount(): number {
    return this.recordedCalls.length;
  }

  /** `ChatParams.model` (the API name handed to the driver) of every call, in order. */
  public get CalledModels(): string[] {
    return this.recordedCalls.map((c) => c.model ?? '<none>');
  }

  // ------------------------------------------------------------------
  // Capability knobs (all default to the plainest possible driver)
  // ------------------------------------------------------------------

  public override get SupportsStreaming(): boolean {
    return this.supportsStreaming;
  }

  /** Enables/disables the real BaseLLM streaming path for this driver. */
  public SetSupportsStreaming(value: boolean): this {
    this.supportsStreaming = value;
    return this;
  }

  public override get SupportsPrefill(): boolean {
    return this.supportsPrefill;
  }

  /** Sets the code-level prefill default this driver reports. */
  public SetSupportsPrefill(value: boolean): this {
    this.supportsPrefill = value;
    return this;
  }

  public override GetFileCapabilities(): FileCapabilities | null {
    return this.fileCapabilities;
  }

  /** Sets the native file-input capabilities this driver reports (`null` = none). */
  public SetFileCapabilities(capabilities: FileCapabilities | null): this {
    this.fileCapabilities = capabilities;
    return this;
  }

  // ------------------------------------------------------------------
  // BaseLLM implementation
  // ------------------------------------------------------------------

  public override async ChatCompletion(params: ChatParams): Promise<ChatResult> {
    this.recordedCalls.push(params);
    return super.ChatCompletion(params);
  }

  protected override async nonStreamingChatCompletion(_params: ChatParams): Promise<ChatResult> {
    return this.executeOutcome(this.nextOutcome());
  }

  public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
    throw new Error('TestLLM.ClassifyText is not supported — this harness scripts ChatCompletion outcomes only');
  }

  public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
    throw new Error('TestLLM.SummarizeText is not supported — this harness scripts ChatCompletion outcomes only');
  }

  // ------------------------------------------------------------------
  // Streaming implementation (drives the REAL BaseLLM streaming template method)
  // ------------------------------------------------------------------

  protected override async createStreamingRequest(_params: ChatParams): Promise<AsyncGenerator<string>> {
    const outcome = this.nextOutcome();
    switch (outcome.kind) {
      case 'stream':
        this.streamFinalUsage = outcome.usage;
        this.streamFinalModel = outcome.model;
        return this.chunkGenerator(outcome.chunks);
      case 'succeed':
        this.streamFinalUsage = outcome.usage;
        this.streamFinalModel = outcome.model;
        await this.wait(outcome.delayMS);
        return this.chunkGenerator([outcome.content]);
      case 'fail':
      case 'throw':
        await this.wait(outcome.delayMS);
        throw outcome.error;
      case 'failResult':
        throw new Error(outcome.result.errorMessage ?? 'TestLLM: scripted failResult during streaming');
      case 'hang':
        return this.neverGenerator();
    }
  }

  protected override processStreamingChunk(chunk: string): { content: string; finishReason?: string | undefined; usage?: ModelUsage | null } {
    return { content: chunk, usage: null };
  }

  protected override finalizeStreamingResponse(
    accumulatedContent: string | null | undefined,
    _lastChunk: string | null | undefined,
    _usage: ModelUsage | null | undefined,
  ): ChatResult {
    return makeSuccessChatResult(accumulatedContent ?? '', {
      usage: this.streamFinalUsage ?? makeModelUsage(),
      model: this.streamFinalModel,
    });
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private nextOutcome(): TestLLMOutcome {
    if (this.script.length === 1 && this.RepeatLastOutcome) {
      return this.script[0];
    }
    return this.script.shift() ?? this.defaultOutcome;
  }

  private async executeOutcome(outcome: TestLLMOutcome): Promise<ChatResult> {
    switch (outcome.kind) {
      case 'succeed':
        await this.wait(outcome.delayMS);
        return makeSuccessChatResult(outcome.content, {
          usage: outcome.usage,
          model: outcome.model,
          thinking: outcome.thinking,
        });
      case 'fail':
        await this.wait(outcome.delayMS);
        return makeDriverFailureChatResult(outcome.error, this.constructor.name);
      case 'failResult':
        return outcome.result;
      case 'throw':
        await this.wait(outcome.delayMS);
        throw outcome.error;
      case 'hang':
        return new Promise<ChatResult>(() => {
          /* never settles — models a hung provider socket */
        });
      case 'stream':
        // Non-streaming call against a stream outcome: resolve the joined chunks.
        return makeSuccessChatResult(outcome.chunks.join(''), { usage: outcome.usage, model: outcome.model });
    }
  }

  private async wait(delayMS?: number): Promise<void> {
    if (delayMS !== undefined && delayMS > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMS));
    }
  }

  private async *chunkGenerator(chunks: string[]): AsyncGenerator<string> {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  private async *neverGenerator(): AsyncGenerator<string> {
    await new Promise<void>(() => {
      /* never settles — models a hung provider socket */
    });
  }
}

/**
 * Registers `llm` on the real `MJGlobal.Instance.ClassFactory` under one or more
 * DriverClass names — exactly how production drivers resolve. Every
 * `ClassFactory.CreateInstance<BaseLLM>(BaseLLM, driverClass, apiKey)` for a
 * registered name yields the SAME scripted instance, so a test scripts and
 * asserts through one object no matter how many drivers the code under test
 * instantiates.
 *
 * Registrations persist on the MJGlobal singleton and the ClassFactory has no
 * unregister API — pair with `resetMJSingletons()` from this package in
 * `beforeEach`/`afterEach` so each test gets a fresh factory (re-registering the
 * same DriverClass name without a reset logs a duplicate-registration warning,
 * though the newest registration still wins).
 */
export function registerTestLLM(llm: TestLLM, driverClass: string | string[], priority = 100): void {
  const driverClasses = Array.isArray(driverClass) ? driverClass : [driverClass];
  for (const name of driverClasses) {
    // The constructor's object-return makes the ClassFactory hand back the
    // shared scripted instance while still going through a real registration
    // and a real `new` — no CreateInstance spying required.
    class TestLLMRegistrationHandle extends TestLLM {
      constructor(apiKey?: string) {
        super(apiKey);
        return llm;
      }
    }
    MJGlobal.Instance.ClassFactory.Register(BaseLLM, TestLLMRegistrationHandle, name, priority);
  }
}

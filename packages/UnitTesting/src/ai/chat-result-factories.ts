/**
 * Factories producing REAL-typed `@memberjunction/ai` chat values for tests.
 *
 * Every value built here uses the real classes and interfaces exported by
 * `@memberjunction/ai` (`ChatResult`, `ChatParams`, `ModelUsage`, `AIErrorInfo`) —
 * never a structural look-alike. Hand-faked shapes silently drift as the real
 * contracts evolve (the exact bug class behind the historical failover bug);
 * building from the real types makes the compiler enforce the contract in test
 * code too.
 */
import {
  ChatParams,
  ChatResult,
  ErrorAnalyzer,
  ModelUsage,
  type AIErrorInfo,
  type ChatResultChoice,
} from '@memberjunction/ai';

/** Overridable scalar fields of {@link ModelUsage} (`totalTokens` / `totalInputTokens` are computed getters). */
export interface ModelUsageOverrides {
  promptTokens?: number;
  completionTokens?: number;
  /** Pass `undefined` explicitly to opt out of the default cost. */
  cost?: number;
  costCurrency?: string;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  queueTime?: number;
  promptTime?: number;
  completionTime?: number;
}

/**
 * Builds a real {@link ModelUsage} instance. Defaults: 10 prompt tokens,
 * 5 completion tokens, cost 0.001 — so `totalTokens` is 15 out of the box
 * (the shape the AI-stack tests have standardized on).
 */
export function makeModelUsage(overrides: ModelUsageOverrides = {}): ModelUsage {
  const cost = 'cost' in overrides ? overrides.cost : 0.001;
  const usage = new ModelUsage(
    overrides.promptTokens ?? 10,
    overrides.completionTokens ?? 5,
    cost,
    overrides.costCurrency,
  );
  if (overrides.cacheReadTokens !== undefined) usage.cacheReadTokens = overrides.cacheReadTokens;
  if (overrides.cacheWriteTokens !== undefined) usage.cacheWriteTokens = overrides.cacheWriteTokens;
  if (overrides.queueTime !== undefined) usage.queueTime = overrides.queueTime;
  if (overrides.promptTime !== undefined) usage.promptTime = overrides.promptTime;
  if (overrides.completionTime !== undefined) usage.completionTime = overrides.completionTime;
  return usage;
}

/** Options for {@link makeSuccessChatResult}. */
export interface SuccessChatResultOptions {
  usage?: ModelUsage;
  /** API name of the model reported back by the provider (ChatResultData.model). */
  model?: string;
  /** Reasoning-model thinking content attached to the assistant message. */
  thinking?: string;
  finishReason?: string;
  startTime?: Date;
  endTime?: Date;
}

/**
 * Builds a successful {@link ChatResult} the way real drivers do: one assistant
 * choice carrying `content`, a real {@link ModelUsage}, `statusText: 'success'`.
 */
export function makeSuccessChatResult(content = 'test response', options: SuccessChatResultOptions = {}): ChatResult {
  const startTime = options.startTime ?? new Date();
  const endTime = options.endTime ?? startTime;
  const result = new ChatResult(true, startTime, endTime);
  result.statusText = 'success';
  const choice: ChatResultChoice = {
    message: { role: 'assistant', content, thinking: options.thinking ?? null },
    finish_reason: options.finishReason ?? 'stop',
    index: 0,
  };
  result.data = {
    choices: [choice],
    model: options.model,
    usage: options.usage ?? makeModelUsage(),
  };
  return result;
}

/** Options for {@link makeFailedChatResult}. */
export interface FailedChatResultOptions {
  errorMessage?: string;
  /** Leave unset to model an undiagnosed driver failure (no errorInfo at all). */
  errorInfo?: AIErrorInfo;
  exception?: unknown;
  statusText?: string;
  startTime?: Date;
  endTime?: Date;
  /**
   * When true, `data` is left unassigned (some driver failure paths return no
   * data at all). Default builds the empty `{ choices: [], usage }` data that
   * BaseLLM's own error paths produce.
   */
  omitData?: boolean;
}

/**
 * Builds a failed {@link ChatResult} (`success: false`). By default the shape
 * mirrors BaseLLM's own error construction: empty choices, zero usage,
 * `statusText: 'error'`. `errorInfo` is only attached when supplied, so tests
 * can model both diagnosed and undiagnosed failures.
 */
export function makeFailedChatResult(options: FailedChatResultOptions = {}): ChatResult {
  const startTime = options.startTime ?? new Date();
  const endTime = options.endTime ?? startTime;
  const result = new ChatResult(false, startTime, endTime);
  result.statusText = options.statusText ?? 'error';
  result.errorMessage = options.errorMessage ?? 'Test failure';
  if (!options.omitData) {
    result.data = { choices: [], usage: new ModelUsage(0, 0) };
  }
  if (options.exception !== undefined) {
    result.exception = options.exception;
  }
  if (options.errorInfo !== undefined) {
    result.errorInfo = options.errorInfo;
  }
  return result;
}

/**
 * Builds a failed {@link ChatResult} exactly the way real provider drivers do:
 * the `errorInfo` comes from the REAL `ErrorAnalyzer`, so `errorType`,
 * `severity`, and `canFailover` match what AnthropicLLM / OpenAILLM / GeminiLLM
 * would report for this error. This is the value to use when testing failover
 * logic — drivers catch provider errors internally and RETURN this shape rather
 * than throwing (the historical failover bug class).
 */
export function makeDriverFailureChatResult(error: Error, providerName = 'TestLLM'): ChatResult {
  return makeFailedChatResult({
    errorMessage: error.message,
    exception: error,
    errorInfo: ErrorAnalyzer.analyzeError(error, providerName),
  });
}

/**
 * Builds a real {@link AIErrorInfo} with sensible defaults
 * (`Unknown` / `Retriable` / failover-eligible), overridable per test.
 */
export function makeErrorInfo(overrides: Partial<AIErrorInfo> = {}): AIErrorInfo {
  return {
    errorType: 'Unknown',
    severity: 'Retriable',
    canFailover: true,
    ...overrides,
  };
}

/**
 * Builds a real {@link ChatParams} instance (so class-level defaults like
 * `enableCaching` behave exactly as in production) with a default model and a
 * single user message, overridable per test.
 */
export function makeChatParams(overrides: Partial<ChatParams> = {}): ChatParams {
  const params = new ChatParams();
  params.model = 'test-model';
  params.messages = [{ role: 'user', content: 'Hello from makeChatParams' }];
  Object.assign(params, overrides);
  return params;
}

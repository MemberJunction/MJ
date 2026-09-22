/**
 * A wall-clock ceiling on one model call.
 *
 * Every LLM call in this package was unbounded. That is not the same problem as "slow": the retry
 * loops in `PromptEngine` only engage once a promise settles, and a provider that accepts the
 * socket and then stops sending bytes never settles one — so a stall bypassed retry, backoff and
 * error reporting alike and simply parked the run. `maxTokens` bounds the response, not the wait.
 *
 * Two mechanisms, deliberately both, mirroring how `AIPromptRunner.createExecutionBound` bounds its
 * own calls:
 *
 *  - the request is ABORTED via `ChatParams.cancellationToken`, which the provider drivers forward
 *    to their SDKs (`{ signal }` on the OpenAI client, and the equivalent on Gemini, LMStudio and
 *    BettyBot), so the connection is actually torn down;
 *  - the awaited promise is REJECTED, so a driver that ignores the signal — or a hang somewhere
 *    above the SDK — still cannot park the caller forever.
 *
 * Either alone is insufficient. Aborting without rejecting trusts every current and future driver
 * to honour the signal. Rejecting without aborting leaves the request in flight, which is how a
 * failing provider ends up holding ten open sockets while the caller opens an eleventh.
 */

/** Default ceiling when `AIConfig.callTimeoutMs` is not set. */
export const DEFAULT_CALL_TIMEOUT_MS = 120_000;

/** Resolves the configured ceiling. `0` (or a negative value) means no bound. */
export function resolveCallTimeoutMs(configured: number | undefined): number {
  if (configured === undefined) {
    return DEFAULT_CALL_TIMEOUT_MS;
  }
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

/** Thrown when a model call exceeds its configured ceiling. */
export class LLMCallTimeoutError extends Error {
  public readonly TimeoutMs: number;

  constructor(timeoutMs: number, what: string) {
    // The word "timeout" is load-bearing: PromptEngine.isRetryableError and MJ's own ErrorAnalyzer
    // both classify on message text, and a stall should be treated as retriable rather than fatal.
    super(`${what} exceeded its ${timeoutMs}ms call timeout — the model call was aborted (timeout)`);
    this.name = 'LLMCallTimeoutError';
    this.TimeoutMs = timeoutMs;
    Object.setPrototypeOf(this, LLMCallTimeoutError.prototype);
  }
}

/**
 * Runs `call` under a wall-clock ceiling.
 *
 * `call` receives the AbortSignal to attach to its `ChatParams.cancellationToken`. When
 * `timeoutMs` is 0 the signal is `undefined` and the call runs exactly as it did before this
 * existed, so disabling the bound restores the previous behaviour rather than approximating it.
 *
 * @param timeoutMs Resolved ceiling; 0 disables.
 * @param what Description used in the timeout message (a prompt or table name).
 * @param call Issues the request, attaching the supplied signal.
 */
export async function withCallDeadline<T>(
  timeoutMs: number,
  what: string,
  call: (signal: AbortSignal | undefined) => Promise<T>
): Promise<T> {
  if (timeoutMs <= 0) {
    return call(undefined);
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new LLMCallTimeoutError(timeoutMs, what);
      // Abort first so the in-flight request is cancelled, THEN reject. Rejecting first would let
      // the caller move on — and start its next request — while this one is still open.
      if (!controller.signal.aborted) {
        controller.abort(err);
      }
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([call(controller.signal), expiry]);
  } finally {
    // Always release the timer, on success, failure and timeout alike: a long-lived process would
    // otherwise accumulate one per call.
    if (timer) {
      clearTimeout(timer);
    }
  }
}

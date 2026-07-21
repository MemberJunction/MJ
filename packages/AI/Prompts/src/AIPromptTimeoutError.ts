/**
 * Typed error thrown when a model call exceeds the prompt's configured `AIPrompt.TimeoutMS`.
 *
 * The message intentionally contains the word "timeout" so that
 * {@link https://github.com/MemberJunction/MJ | ErrorAnalyzer} classifies it as a `NetworkError`
 * (severity `Retriable`, `canFailover: true`) — meaning a timed-out model call participates in the
 * normal failover/retry machinery exactly like a hung socket would, instead of silently hanging.
 *
 * Callers that need to distinguish a configured-timeout abort from any other network failure can
 * do so structurally via `instanceof AIPromptTimeoutError` (or by checking `name`, which survives
 * a serialization round-trip).
 */
export class AIPromptTimeoutError extends Error {
    /** The configured timeout, in milliseconds, that was exceeded. */
    public readonly TimeoutMS: number;

    /** Name of the prompt whose TimeoutMS was exceeded. */
    public readonly PromptName: string;

    constructor(promptName: string, timeoutMS: number) {
        super(`AI prompt '${promptName}' exceeded its configured TimeoutMS (${timeoutMS}ms) — the model call was aborted (timeout)`);
        this.name = 'AIPromptTimeoutError';
        this.TimeoutMS = timeoutMS;
        this.PromptName = promptName;
        // Restore the prototype chain — required for `instanceof` to work when the class is
        // compiled to ES5-era output by a downstream consumer's toolchain.
        Object.setPrototypeOf(this, AIPromptTimeoutError.prototype);
    }
}

import { Ollama, Fetch } from 'ollama';

/**
 * An Ollama client whose requests abort with a caller's cancellation token, plus the `Dispose`
 * that detaches it from that token.
 */
export interface CancellableOllamaClient {
    Client: Ollama;
    /** Removes the abort listener this client put on the caller's token. Safe to call more than once. */
    Dispose(): void;
}

/**
 * Builds a short-lived Ollama client whose `fetch` carries the caller's cancellation token.
 *
 * The caller's token is typically the long-lived run token, so a listener added to it per request
 * would accumulate (and pin its closure) for the life of the run. This adds exactly ONE removable
 * listener per client, which forwards to a request-scoped controller; every other listener is
 * attached to a request-scoped signal and is collected with it. Call `Dispose()` once the request
 * (including a stream) is finished.
 *
 * An AbortController is used rather than `AbortSignal.any`, which not every supported Node version has.
 */
export function CreateCancellableOllamaClient(host: string, token: AbortSignal): CancellableOllamaClient {
    const requestController = new AbortController();
    const onTokenAbort = (): void => requestController.abort(token.reason);
    if (token.aborted) {
        onTokenAbort();
    } else {
        token.addEventListener('abort', onTokenAbort, { once: true });
    }

    const cancellableFetch: Fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const existing = init?.signal;
        if (!existing) {
            return fetch(input, { ...init, signal: requestController.signal });
        }
        // `existing` is the Ollama client's own per-request signal, so this listener dies with it
        const combined = new AbortController();
        const forward = (source: AbortSignal): void => combined.abort(source.reason);
        for (const source of [requestController.signal, existing]) {
            if (source.aborted) {
                forward(source);
                break;
            }
            source.addEventListener('abort', () => forward(source), { once: true });
        }
        return fetch(input, { ...init, signal: combined.signal });
    };

    return {
        Client: new Ollama({ host, fetch: cancellableFetch }),
        Dispose: (): void => token.removeEventListener('abort', onTokenAbort),
    };
}

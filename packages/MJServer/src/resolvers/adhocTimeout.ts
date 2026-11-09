/** The timeout an ad-hoc query gets when the caller names none. */
const DEFAULT_TIMEOUT_SECONDS = 30;

/**
 * The timeout an ad-hoc query runs with: what the caller asked for (or the default), but never
 * longer than the server's `requestTimeout`, so a caller cannot hold a read-only connection longer
 * than any other request may. `requestTimeoutMs` of 0 or less means the server sets no limit.
 */
export function ClampAdhocTimeoutSeconds(requested: number | undefined, requestTimeoutMs: number): number {
    const seconds = requested != null && requested > 0 ? requested : DEFAULT_TIMEOUT_SECONDS;
    return requestTimeoutMs > 0 ? Math.min(seconds, Math.max(1, Math.floor(requestTimeoutMs / 1000))) : seconds;
}

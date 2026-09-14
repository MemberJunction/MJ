/**
 * credentials.ts — telling "this key is dead" apart from "this request failed".
 *
 * The distinction decides whether the rig abandons a model or records an observation, so it lives
 * here with the other framework-free logic rather than in the runner: it is a pure string
 * classification, it is the kind of thing that rots as providers reword their errors, and it is
 * therefore exactly the kind of thing that should be unit-tested.
 *
 * The cost of getting it wrong is asymmetric, and the list below is tuned accordingly:
 *
 *   - a FALSE POSITIVE abandons a model that would have produced data, and the scorecard silently
 *     loses a row;
 *   - a FALSE NEGATIVE costs one identical error per cell — annoying, self-evident in the error
 *     table, and recoverable by reading it.
 *
 * So anything ambiguous — a rate limit, an exhausted quota, an unknown model id, a 5xx — is
 * deliberately NOT treated as an auth failure. Those are findings; a dead key is not.
 */

/**
 * Substrings that mark a provider rejecting the CREDENTIAL rather than the request.
 *
 * Matched case-insensitively against the driver's error message. The bare status codes are here
 * because several providers return a stringified body whose only machine-readable signal is the
 * code, but they are also the loosest entries — see {@link isAuthFailure} for why that is bounded.
 */
export const AUTH_FAILURE_MARKERS: readonly string[] = [
    'authentication_error',
    'api key is invalid',
    'incorrect api key',
    'invalid api key',
    'invalid_api_key',
    'api key not valid',
    'unauthorized',
    'permission_denied',
    '401',
    '403'
];

/**
 * Whether a driver error message describes a rejected credential.
 *
 * Note the bounded matching on bare status codes: `'401'` as a free substring would also fire on a
 * token count, a model id, or a request id that happens to contain those digits. They are matched
 * only where a status code actually appears — at a word boundary — while the phrase markers match
 * anywhere, since they are unambiguous on their own.
 */
export function isAuthFailure(message: string | null | undefined): boolean {
    if (!message) {
        return false;
    }
    const lowered = message.toLowerCase();
    return AUTH_FAILURE_MARKERS.some((marker) =>
        /^\d+$/.test(marker)
            ? new RegExp(`(^|[^\\d])${marker}([^\\d]|$)`).test(lowered)
            : lowered.includes(marker));
}

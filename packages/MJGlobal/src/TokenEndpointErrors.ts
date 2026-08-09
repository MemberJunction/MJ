/**
 * Safe error-detail extraction for OAuth2 token-endpoint responses.
 *
 * ## Why this exists
 *
 * An OAuth2 token endpoint is the one kind of HTTP call where a **credential
 * arrives in the response body**. Auth mechanisms that merely sign or encode a
 * secret they already hold (HTTP Basic, OAuth 1.0a) never parse a response, so
 * they have no body to mishandle. Token endpoints do, and across this codebase
 * every instance of "credential written to a log" traced back to one of them.
 *
 * Two distinct ways the body leaks:
 *
 * 1. **On success-shaped responses.** Code that guards with
 *    `if (!response.ok || !parsed.access_token)` also fires on an HTTP 200 whose
 *    token sits somewhere the parser did not look — a vendor envelope, a nested
 *    `data` object. The body echoed in that branch *is* the access token.
 * 2. **On genuine failures.** RFC 6749 says an error response carries no token,
 *    which makes raw-body echoing look safe. It is not: token endpoints commonly
 *    echo the *failing request* back in the error body, and that request carries
 *    `client_secret` — and, on a refresh, the refresh token. So the body leaks a
 *    different credential rather than none.
 *
 * The safe subset is narrow and specified: RFC 6749 §5.2 defines `error` and
 * `error_description` as the fields describing a failure, and they carry no
 * credentials. This helper surfaces those two and nothing else.
 */

/** The RFC 6749 §5.2 error fields, the only body content safe to surface. */
interface OAuth2ErrorBody {
    error?: unknown;
    error_description?: unknown;
}

/** Caps a vendor-supplied string so a hostile endpoint cannot flood the log. */
const MAX_DETAIL_LENGTH = 200;

function asBoundedString(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length === 0) {
        return undefined;
    }
    return value.length > MAX_DETAIL_LENGTH ? `${value.slice(0, MAX_DETAIL_LENGTH)}…` : value;
}

/**
 * Builds a log-safe description of a token-endpoint failure from its response body.
 *
 * Returns only the RFC 6749 §5.2 `error` / `error_description` fields. Any other
 * body content — including a body that is not valid JSON — is withheld, since it
 * cannot be shown to be credential-free.
 *
 * The return value is prefixed with `" — "` so it appends cleanly to a message
 * that already states the HTTP status, and is the empty string when there is
 * nothing safe to add.
 *
 * @param body Raw response body text from the token endpoint.
 * @returns `" — invalid_client: Client authentication failed"`, `" — response
 *          body withheld (may contain credentials)"`, or `""`.
 *
 * @example
 * ```ts
 * throw new Error(
 *     `Token request failed: ${response.status}` +
 *     describeTokenEndpointFailure(await response.text())
 * );
 * ```
 */
export function describeTokenEndpointFailure(body: string | null | undefined): string {
    if (!body) {
        return '';
    }

    let parsed: OAuth2ErrorBody;
    try {
        parsed = JSON.parse(body) as OAuth2ErrorBody;
    } catch {
        // A body that will not parse cannot be shown to be credential-free.
        return ' — response body withheld (may contain credentials)';
    }

    if (!parsed || typeof parsed !== 'object') {
        return ' — response body withheld (may contain credentials)';
    }

    const code = asBoundedString(parsed.error);
    const description = asBoundedString(parsed.error_description);

    if (code && description) {
        return ` — ${code}: ${description}`;
    }
    if (code) {
        return ` — ${code}`;
    }
    if (description) {
        return ` — ${description}`;
    }
    return ' — response body withheld (may contain credentials)';
}

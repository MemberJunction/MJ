/**
 * BasicAuthHeaderBuilder — shared HTTP Basic Authentication header helper for REST
 * integration connectors. Centralizes the RFC 7617 `Authorization: Basic <base64>`
 * construction so concrete connectors never inline base64 / crypto logic (the
 * connector-code-conventions "no inline crypto / no inline base64" rule).
 *
 * RFC 7617 is `Basic base64(userid ":" password)` — the userid MUST NOT contain a
 * colon (the password may). For Neon CRM the userid is the org id and the password is
 * the API key; for other vendors it is username:password or apiKey:"" etc. This helper
 * does ONLY the encoding — it never logs, stores, or transports the credential bytes.
 *
 * The base64 encoding is `Buffer.from(...).toString('base64')` — the Node standard
 * library primitive, kept behind one tested helper rather than copy-pasted into every
 * connector. No round-trip, no secret retention.
 */

/** Inputs for a single HTTP Basic Authorization header value. */
export interface BasicAuthRequest {
    /** The userid component (left of the colon). For Neon CRM, the org id. MUST NOT contain ':'. */
    Username: string;
    /** The password component (right of the colon). For Neon CRM, the API key. May contain ':'. */
    Password: string;
}

/**
 * Builds the value for an HTTP Basic `Authorization` header: `Basic <base64(user:pass)>`.
 * Throws on a colon in the username (ambiguous per RFC 7617) or on an empty username.
 */
export function buildBasicAuthHeaderValue(req: BasicAuthRequest): string {
    if (req.Username == null || req.Username.length === 0) {
        throw new Error('BasicAuthHeaderBuilder: Username (userid) is required and cannot be empty.');
    }
    if (req.Username.includes(':')) {
        throw new Error('BasicAuthHeaderBuilder: Username (userid) MUST NOT contain a colon per RFC 7617.');
    }
    const encoded = Buffer.from(`${req.Username}:${req.Password ?? ''}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
}

/**
 * APIKeyHeaderBuilder — convenience over {@link buildBasicAuthHeaderValue} returning a
 * ready-to-spread header object. Useful when a connector wants the full `Authorization`
 * header pair rather than just the value.
 */
export function buildBasicAuthHeader(req: BasicAuthRequest): { Authorization: string } {
    return { Authorization: buildBasicAuthHeaderValue(req) };
}

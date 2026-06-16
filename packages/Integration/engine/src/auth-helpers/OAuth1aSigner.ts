/**
 * OAuth1aSigner — shared OAuth 1.0a request-signing helper for REST integration
 * connectors. Centralizes the OAuth 1.0a signature-base-string construction +
 * HMAC signing so concrete connectors never inline crypto (the
 * connector-code-conventions "no inline crypto" rule).
 *
 * This is the form NetSuite's Token-Based Authentication (TBA) uses: a long-lived
 * consumer key/secret + token id/secret, signed per request with HMAC-SHA256 and
 * a per-account `realm`. It is also the generic OAuth 1.0a one-legged signing flow
 * any vendor that still requires OAuth 1.0a header signing can reuse.
 *
 * The crypto is `node:crypto`'s `createHmac` + `randomBytes` — the standard library
 * primitives, kept here behind a single, tested helper rather than copy-pasted into
 * every connector. There is no token round-trip here (TBA tokens are pre-provisioned);
 * this helper only SIGNS a request and emits the `Authorization` header value.
 */
import { createHmac, randomBytes } from 'node:crypto';

/** HMAC variants OAuth 1.0a permits. NetSuite TBA mandates HMAC-SHA256. */
export type OAuth1aSignatureMethod = 'HMAC-SHA256' | 'HMAC-SHA1';

/** Inputs needed to sign one request with OAuth 1.0a TBA. */
export interface OAuth1aSignRequest {
    /** OAuth consumer key (a.k.a. client id / integration key). */
    ConsumerKey: string;
    /** OAuth consumer secret. */
    ConsumerSecret: string;
    /** OAuth token id (the TBA access token id). */
    TokenId: string;
    /** OAuth token secret. */
    TokenSecret: string;
    /** HTTP method of the request being signed (uppercased internally). */
    Method: string;
    /** Full request URL, including any query string (query params are folded into the base string). */
    Url: string;
    /**
     * OAuth `realm` parameter. NetSuite requires the account id (uppercased, `-` → `_`,
     * e.g. `1234567` or `1234567_SB1`). Optional — omitted from the header when absent.
     */
    Realm?: string;
    /** Signature method. Defaults to `HMAC-SHA256` (NetSuite TBA's requirement). */
    SignatureMethod?: OAuth1aSignatureMethod;
    /**
     * Deterministic nonce + timestamp override — for unit testing only. Production callers
     * leave this undefined so a fresh random nonce + current timestamp are generated.
     */
    NonceOverride?: string;
    TimestampOverride?: string;
}

/**
 * RFC 3986 percent-encoding (stricter than `encodeURIComponent`, which leaves
 * `! ' ( ) *` unescaped). OAuth 1.0a requires these to be escaped too.
 */
export function percentEncodeRFC3986(value: string): string {
    return encodeURIComponent(value)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
}

/**
 * Stateless OAuth 1.0a signer. One static method builds the `Authorization` header
 * value for a request; connectors call it per request.
 */
export class OAuth1aSigner {
    /**
     * Builds the full `Authorization: OAuth ...` header value for a single request,
     * computing the HMAC signature over the canonical signature base string.
     *
     * Spec steps implemented (RFC 5849 §3.4):
     *  1. Collect oauth_* params + the request's query params.
     *  2. Percent-encode, sort, and `&`-join them (the normalized parameter string).
     *  3. Build the base string `METHOD&encode(baseURL)&encode(params)`.
     *  4. Sign with key `encode(consumerSecret)&encode(tokenSecret)`.
     *  5. Emit `OAuth realm="...", oauth_consumer_key="...", ..., oauth_signature="..."`.
     */
    public static BuildAuthorizationHeader(req: OAuth1aSignRequest): string {
        const method = req.Method.toUpperCase();
        const sigMethod: OAuth1aSignatureMethod = req.SignatureMethod ?? 'HMAC-SHA256';
        const timestamp = req.TimestampOverride ?? Math.floor(Date.now() / 1000).toString();
        const nonce = req.NonceOverride ?? randomBytes(16).toString('hex');

        const oauthParams: Record<string, string> = {
            oauth_consumer_key: req.ConsumerKey,
            oauth_nonce: nonce,
            oauth_signature_method: sigMethod,
            oauth_timestamp: timestamp,
            oauth_token: req.TokenId,
            oauth_version: '1.0',
        };

        const { baseUrl, queryParams } = OAuth1aSigner.splitUrl(req.Url);

        // All params (oauth + query) participate in the signature base string.
        const allParams: Record<string, string> = { ...oauthParams, ...queryParams };
        const normalizedParams = Object.keys(allParams)
            .sort()
            .map(k => `${percentEncodeRFC3986(k)}=${percentEncodeRFC3986(allParams[k])}`)
            .join('&');

        const baseString = `${method}&${percentEncodeRFC3986(baseUrl)}&${percentEncodeRFC3986(normalizedParams)}`;
        const signingKey = `${percentEncodeRFC3986(req.ConsumerSecret)}&${percentEncodeRFC3986(req.TokenSecret)}`;
        const algo = sigMethod === 'HMAC-SHA1' ? 'sha1' : 'sha256';
        const signature = createHmac(algo, signingKey).update(baseString).digest('base64');

        // The Authorization header contains ONLY the oauth_* params (NOT the query params)
        // plus the signature; values are quoted + percent-encoded.
        const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
        const paramList = Object.keys(headerParams)
            .sort()
            .map(k => `${percentEncodeRFC3986(k)}="${percentEncodeRFC3986(headerParams[k])}"`)
            .join(', ');

        const realmPrefix = req.Realm ? `realm="${percentEncodeRFC3986(req.Realm)}", ` : '';
        return `OAuth ${realmPrefix}${paramList}`;
    }

    /** Splits a URL into its base (scheme://host/path, no query) + a decoded query-param map. */
    private static splitUrl(url: string): { baseUrl: string; queryParams: Record<string, string> } {
        const qIdx = url.indexOf('?');
        if (qIdx === -1) return { baseUrl: url, queryParams: {} };
        const baseUrl = url.substring(0, qIdx);
        const queryParams: Record<string, string> = {};
        new URLSearchParams(url.substring(qIdx + 1)).forEach((v, k) => { queryParams[k] = v; });
        return { baseUrl, queryParams };
    }
}

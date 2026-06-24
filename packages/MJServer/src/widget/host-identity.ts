/**
 * @fileoverview Host-passed identity (D1 strategy `host-identity`). When a widget is
 * embedded in an already-authenticated host portal, the host signs a short-lived
 * assertion (its own RS256 key) describing the visitor; the widget posts it to
 * `POST /widget/session`, which verifies it against the host's registered public key
 * and folds the host-provided identity into the minted guest claims. The minted token
 * is still validated by the same `magic-link` AuthProviderFactory path + synthesized by
 * `buildMagicLinkSessionUser` — host-identity is a MINT-TIME strategy, not a second
 * session-validation provider (it converges on the one pathway, per D1).
 *
 * Pure + unit-testable: verification takes the PEM as an argument.
 *
 * @module @memberjunction/server/widget
 */

import jwt from 'jsonwebtoken';

/** The visitor identity a host asserts. Standard OIDC-ish claims so synthesis is uniform. */
export interface HostAssertedIdentity {
    email: string;
    firstName?: string;
    lastName?: string;
    /** The host's opaque user id for this visitor (audit correlation; not an MJ user id). */
    hostUserId?: string;
}

/** Why a host-assertion verification failed. */
export type HostAssertionError = 'missing' | 'bad_signature' | 'expired' | 'no_email' | 'no_key';

/** Result of verifying a host assertion. `identity` is present iff `ok` is true. */
export interface HostAssertionResult {
    ok: boolean;
    identity?: HostAssertedIdentity;
    errorCode?: HostAssertionError;
}

/**
 * Verifies a host-signed RS256 assertion JWT against the host's registered public key
 * (PEM) and extracts the asserted visitor identity. The assertion's `aud` should be the
 * widget key (bound at the host) and it must carry an `email`. Never throws — returns a
 * structured result.
 */
export function verifyHostAssertion(
    assertion: string | undefined,
    hostPublicKeyPem: string | undefined,
    expectedAudience: string,
): HostAssertionResult {
    if (!assertion) {
        return { ok: false, errorCode: 'missing' };
    }
    if (!hostPublicKeyPem) {
        return { ok: false, errorCode: 'no_key' };
    }
    let payload: jwt.JwtPayload;
    try {
        payload = jwt.verify(assertion, hostPublicKeyPem, {
            algorithms: ['RS256'],
            audience: expectedAudience,
        }) as jwt.JwtPayload;
    } catch (e) {
        // jsonwebtoken throws TokenExpiredError for expiry; everything else is a signature/format fault.
        return { ok: false, errorCode: e instanceof jwt.TokenExpiredError ? 'expired' : 'bad_signature' };
    }
    const identity = extractHostIdentity(payload);
    if (!identity.email) {
        return { ok: false, errorCode: 'no_email' };
    }
    return { ok: true, identity };
}

/** Pulls the visitor identity from a verified host-assertion payload (standard claim names). */
export function extractHostIdentity(payload: jwt.JwtPayload): HostAssertedIdentity {
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    return {
        email: str(payload.email) ?? '',
        firstName: str(payload.given_name) ?? str(payload['firstName']),
        lastName: str(payload.family_name) ?? str(payload['lastName']),
        hostUserId: str(payload.sub),
    };
}

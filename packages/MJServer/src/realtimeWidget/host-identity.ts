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

import type jwt from 'jsonwebtoken';
import { HostIdentityProvider, type HostAssertionError } from '@memberjunction/auth-providers';

export type { HostAssertionError };

/** The visitor identity a host asserts. Standard OIDC-ish claims so synthesis is uniform. */
export interface HostAssertedIdentity {
    email: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    firstName?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    lastName?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    /** The host's opaque user id for this visitor (audit correlation; not an MJ user id). */
    hostUserId?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/** Result of verifying a host assertion. `identity` is present iff `ok` is true. */
export interface HostAssertionResult {
    ok: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    Identity?: HostAssertedIdentity;
    errorCode?: HostAssertionError;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/**
 * The single shared {@link HostIdentityProvider} instance the mint path verifies through. The base
 * `BaseAuthProvider` constructor builds a (never-contacted) JWKS client; host-identity verifies against
 * static per-widget PEM keys, so we pass a placeholder `jwksUri`. Built once — verification is stateless.
 */
const hostIdentityProvider = new HostIdentityProvider({
    name: 'host-identity',
    type: 'host-identity',
    issuer: 'host-identity',
    audience: 'host-identity',
    jwksUri: 'https://host-identity.local/unused',
});

/**
 * Verifies a host-signed RS256 assertion against the host's registered public key (PEM) and extracts the
 * asserted visitor identity. Thin adapter over {@link HostIdentityProvider.VerifyHostAssertion} (the single
 * implementation, registered in the AuthProviderFactory) preserving this module's result shape. Never throws.
 */
export function VerifyHostAssertion(
    assertion: string | undefined,
    hostPublicKeyPem: string | undefined,
    expectedAudience: string,
): HostAssertionResult {
    const result = hostIdentityProvider.VerifyHostAssertion(assertion, hostPublicKeyPem, expectedAudience);
    if (!result.ok || !result.userInfo?.email) {
        return { ok: false, errorCode: result.errorCode };
    }
    return {
        ok: true,
        Identity: {
            email: result.userInfo.email,
            firstName: result.userInfo.firstName,
            lastName: result.userInfo.lastName,
            hostUserId: result.hostUserId,
        },
    };
}

/** @deprecated Use {@link VerifyHostAssertion}. */
export function verifyHostAssertion(
    assertion: string | undefined,
    hostPublicKeyPem: string | undefined,
    expectedAudience: string,
): HostAssertionResult {
    return VerifyHostAssertion(assertion, hostPublicKeyPem, expectedAudience);
}

/** Pulls the visitor identity from a verified host-assertion payload (delegates to the provider). */
export function ExtractHostIdentity(payload: jwt.JwtPayload): HostAssertedIdentity {
    const info = hostIdentityProvider.extractUserInfo(payload);
    return {
        email: info.email ?? '',
        firstName: info.firstName,
        lastName: info.lastName,
        hostUserId: typeof payload.sub === 'string' ? payload.sub : undefined,
    };
}

/** @deprecated Use {@link ExtractHostIdentity}. */
export function extractHostIdentity(payload: jwt.JwtPayload): HostAssertedIdentity {
    return ExtractHostIdentity(payload);
}

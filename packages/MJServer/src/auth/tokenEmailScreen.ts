/**
 * Decides which email address of a signature-checked IdP token the user lookup may use.
 *
 * - A token whose `email_verified` claim is false (boolean or text) is always refused.
 * - A provider configured with `requireVerifiedEmail: true` also needs `email_verified` to be true,
 *   and only its `email` claim is used: `preferred_username`, `cognito:username` and similar
 *   fallbacks are not email claims and the provider does not verify them.
 */
import type { JwtPayload } from 'jsonwebtoken';
import type { AuthProviderConfig } from '@memberjunction/core';
import { AuthProviderFactory, type IAuthProvider } from '@memberjunction/auth-providers';
import { EmailsMatch, type LoginIdentityClaims } from './loginEmailResolution.js';

const providersRequiringVerifiedEmail = new WeakSet<IAuthProvider>();

/** The result of {@link ScreenTokenEmailClaims}. `Claims` is null when the token is refused. */
export interface TokenEmailScreenResult {
  Claims: LoginIdentityClaims | null;
  /** Why the token is refused. Contains no claim values. */
  Reason?: string;
}

/** Stores the `requireVerifiedEmail` setting of a provider when it is registered. */
export function RecordRequireVerifiedEmailSetting(provider: IAuthProvider, config: AuthProviderConfig): void {
  if (config.requireVerifiedEmail === true) {
    providersRequiringVerifiedEmail.add(provider);
  } else {
    providersRequiringVerifiedEmail.delete(provider);
  }
}

/** True when any registered provider for this issuer has `requireVerifiedEmail: true`. */
export function IssuerRequiresVerifiedEmail(issuer: string | undefined): boolean {
  if (!issuer) {
    return false;
  }
  return AuthProviderFactory.Instance.getAllByIssuer(issuer).some((p) => providersRequiringVerifiedEmail.has(p));
}

/** Reads the OIDC `email_verified` claim. Accepts a boolean or the text "true"/"false"; anything else is undefined. */
export function ReadEmailVerifiedClaim(payload: JwtPayload): boolean | undefined {
  const raw: unknown = payload.email_verified;
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw === 'string') {
    const text = raw.trim().toLowerCase();
    if (text === 'true') return true;
    if (text === 'false') return false;
  }
  return undefined;
}

/**
 * Returns the identity claims the user lookup may use, or null claims when the token's email
 * address cannot be accepted.
 *
 * @param payload the signature-checked token payload
 * @param claims the identity the provider extracted from the payload
 * @param requireVerifiedEmail the provider's `requireVerifiedEmail` setting
 */
export function ScreenTokenEmailClaims(payload: JwtPayload, claims: LoginIdentityClaims, requireVerifiedEmail: boolean): TokenEmailScreenResult {
  const emailVerified = ReadEmailVerifiedClaim(payload);
  if (emailVerified === false) {
    return { Claims: null, Reason: 'the identity provider marks the email address as not verified' };
  }
  if (!requireVerifiedEmail) {
    return { Claims: claims };
  }
  if (emailVerified !== true) {
    return { Claims: null, Reason: 'the provider requires email_verified to be true and the token does not assert it' };
  }
  const emailClaim = typeof payload.email === 'string' ? payload.email : undefined;
  if (!claims.email || !EmailsMatch(claims.email, emailClaim)) {
    return { Claims: null, Reason: 'the provider requires a verified email claim and the token has none' };
  }
  return { Claims: { email: claims.email } };
}

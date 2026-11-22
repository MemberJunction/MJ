import type { JwtPayload } from 'jsonwebtoken';

/**
 * Outcome of checking a token's OIDC `email_verified` claim.
 *
 * `Reason` is `'unverified'` when the identity provider states the email is not verified, and
 * `'missing'` when the claim is absent and the provider is configured to require it.
 */
export interface EmailVerifiedCheck {
  /** Whether the token may be used to resolve a user. */
  Allowed: boolean;
  /** Set only when `Allowed` is false. */
  Reason?: EmailVerifiedRefusalReason;
}

/** Why a token was refused by {@link CheckEmailVerified}. */
export type EmailVerifiedRefusalReason = 'unverified' | 'missing';

/**
 * Reads the OIDC `email_verified` claim off a token payload as a three-state value.
 *
 * Most providers send a boolean. Some send the strings `"true"` / `"false"`, so those are read
 * case-insensitively. Anything else (absent, null, another type or string) is `undefined`.
 */
export function ReadEmailVerifiedClaim(payload: JwtPayload): boolean | undefined {
  const raw: unknown = payload['email_verified'];
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}

/**
 * Decides whether a token may be used to resolve a user by its email.
 *
 * - `email_verified` false (boolean or string): always refused.
 * - `email_verified` true: always allowed.
 * - claim absent: allowed unless `requireEmailVerified` is true. Several providers never send the
 *   claim, so requiring it is opt-in per provider (`requireEmailVerified` in the provider config).
 *
 * @param payload the signature-verified token payload
 * @param requireEmailVerified whether the token's provider requires the claim to be present and true
 */
export function CheckEmailVerified(payload: JwtPayload, requireEmailVerified: boolean): EmailVerifiedCheck {
  const claim = ReadEmailVerifiedClaim(payload);
  if (claim === false) {
    return { Allowed: false, Reason: 'unverified' };
  }
  if (claim === undefined && requireEmailVerified) {
    return { Allowed: false, Reason: 'missing' };
  }
  return { Allowed: true };
}

/** Log-safe description of a refused {@link EmailVerifiedCheck}; names no user and no token. */
export function DescribeEmailVerifiedRefusal(reason: EmailVerifiedRefusalReason | undefined): string {
  return reason === 'missing'
    ? 'the token has no email_verified claim and the provider sets requireEmailVerified'
    : 'the identity provider reports the email as not verified';
}

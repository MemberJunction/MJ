import type { JwtPayload } from 'jsonwebtoken';
import { AuthenticationError } from 'type-graphql';
import { AuthProviderFactory, CheckEmailVerified, DescribeEmailVerifiedRefusal } from '@memberjunction/auth-providers';

/**
 * Refuses a signature-verified token whose identity provider does not vouch for its email.
 *
 * Runs before any user lookup or auto-provisioning. A token that states `email_verified: false`
 * is always refused. A token without the claim is refused only when its provider sets
 * `requireEmailVerified` (see `authProviders` in `mj.config.cjs`).
 *
 * @throws AuthenticationError when the token is refused
 */
export function AssertTokenEmailVerified(payload: JwtPayload): void {
  const issuer = payload.iss;
  const requireEmailVerified = issuer ? AuthProviderFactory.Instance.RequiresEmailVerified(issuer) : false;
  const check = CheckEmailVerified(payload, requireEmailVerified);
  if (check.Allowed) {
    return;
  }
  // Names the issuer and reason only: no token, no email.
  console.warn(`[Auth] Login refused for issuer ${issuer ?? 'unknown'}: ${DescribeEmailVerifiedRefusal(check.Reason)}`);
  throw new AuthenticationError('Email address is not verified by the identity provider');
}

import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';

/**
 * Authentication provider for MemberJunction-issued magic-link session tokens.
 *
 * Unlike Auth0/Okta/etc., the tokens this provider validates are minted by MJ
 * itself (RS256) when an external user redeems a magic-link invite. MJ publishes
 * its public key at a JWKS endpoint, and this provider is registered with that
 * endpoint as its `jwksUri` — so the standard issuer-driven JWT validation path
 * in MJServer (`context.ts`) verifies these tokens with no special-casing.
 *
 * The minted tokens carry standard OIDC identity claims (`email`, `given_name`,
 * `family_name`) plus magic-link scope claims (`mj_app_id`, `mj_role`,
 * `mj_magic_link`). Only the identity claims are needed here; scope is enforced
 * at provisioning time and by the assigned restricted role, not re-derived on
 * every request.
 */
@RegisterClass(BaseAuthProvider, 'magic-link')
export class MagicLinkProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Extracts user identity from a MJ-issued magic-link JWT payload.
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    const email = payload.email as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ').slice(1).join(' ') || fullName?.split(' ')[0],
      fullName: fullName || [firstName, lastName].filter(Boolean).join(' ') || undefined,
      preferredUsername: email,
    };
  }
}

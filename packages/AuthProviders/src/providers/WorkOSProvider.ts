import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';


/**
 * WorkOS (AuthKit) authentication provider implementation.
 *
 * Validates JWT access tokens minted by WorkOS AuthKit / User Management. These tokens are
 * signed with RS256 and verified against the per-environment JWKS endpoint
 * (`https://api.workos.com/sso/jwks/<clientId>`); their `iss` claim is
 * `https://api.workos.com/user_management/<clientId>`.
 *
 * ## Email is required — and is NOT in a WorkOS token by default
 * MemberJunction resolves the signed-in user by **email**, but a WorkOS AuthKit access token
 * only carries identity/session claims (`sub`, `sid`, `org_id`, `role`, `permissions`) out of
 * the box — it does **not** include `email`. To use WorkOS with MJ you must add the email (and
 * ideally the name) to the token via a WorkOS **JWT Template**:
 *
 * ```json
 * {
 *   "email": "{{user.email}}",
 *   "given_name": "{{user.first_name}}",
 *   "family_name": "{{user.last_name}}"
 * }
 * ```
 *
 * See `WORKOS.md` in this package for the full, step-by-step integration guide.
 */
@RegisterClass(BaseAuthProvider, 'workos')
export class WorkOSProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Extracts user information from a WorkOS AuthKit JWT payload.
   *
   * `email`, `given_name`, and `family_name` are expected to be supplied by a WorkOS JWT
   * Template (see class docs). `sub` is the stable WorkOS user id (`user_...`). We fall back
   * through standard OIDC claim names so a token shaped by a custom template (e.g. one that
   * only sets `name`) still resolves a usable identity.
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    const email = payload.email as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;
    // WorkOS access tokens have no `preferred_username`; email is the natural handle.
    const preferredUsername = payload.preferred_username as string | undefined || email;
    // `sub` is the WorkOS user identifier (e.g. "user_01H...").
    const userId = payload.sub as string | undefined;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername,
      userId
    };
  }

  /**
   * Validates WorkOS-specific configuration.
   *
   * Beyond the base requirements (`name`, `issuer`, `audience`, `jwksUri`), WorkOS needs a
   * `clientId` — it appears in both the issuer and JWKS URLs and identifies the AuthKit
   * environment.
   */
  validateConfig(): boolean {
    const baseValid = super.validateConfig();
    const hasClientId = !!this.config.clientId;

    return baseValid && hasClientId;
  }
}

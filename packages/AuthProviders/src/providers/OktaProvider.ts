import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';


/**
 * Okta authentication provider implementation
 */
@RegisterClass(BaseAuthProvider, 'okta')
export class OktaProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Configures Okta from OKTA_DOMAIN + OKTA_CLIENT_ID, with OKTA_ISSUER overriding the issuer
   * for orgs that use a custom authorization server rather than the default one.
   *
   * NEW capability: Okta had no env-var form before the discovery hook existed — it was one of
   * the providers the old hard-coded block did not cover, so it required a config-file entry.
   */
  static ConfigFromEnvironment(env: NodeJS.ProcessEnv): AuthProviderConfig | null {
    if (!env.OKTA_DOMAIN || !env.OKTA_CLIENT_ID) {
      return null;
    }
    const issuer = env.OKTA_ISSUER || `https://${env.OKTA_DOMAIN}/oauth2/default`;
    return {
      name: 'okta',
      type: 'okta',
      issuer,
      audience: env.OKTA_AUDIENCE || env.OKTA_CLIENT_ID,
      jwksUri: `${issuer.replace(/\/$/, '')}/v1/keys`,
      clientId: env.OKTA_CLIENT_ID,
      domain: env.OKTA_DOMAIN
    };
  }

  /**
   * Extracts user information from Okta JWT payload
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    // Okta uses standard OIDC claims plus some custom ones
    const email = payload.email as string | undefined || payload.preferred_username as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;
    const preferredUsername = payload.preferred_username as string | undefined || email;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername
    };
  }

  /**
   * Validates Okta-specific configuration
   */
  validateConfig(): boolean {
    const baseValid = super.validateConfig();
    const hasClientId = !!this.config.clientId;
    const hasDomain = !!this.config.domain;
    
    return baseValid && hasClientId && hasDomain;
  }
}
import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';

/**
 * Microsoft Authentication Library (MSAL) provider implementation
 */
@RegisterClass(BaseAuthProvider, 'msal')
export class MSALProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Configures Microsoft Entra ID from TENANT_ID + WEB_CLIENT_ID.
   *
   * Mapping preserved byte-for-byte from the env block that previously lived in MJServer's
   * config — including the provider name 'azure', which predates the Entra rename and is kept
   * so existing deployments' registered provider names do not shift.
   */
  static configFromEnvironment(env: NodeJS.ProcessEnv): AuthProviderConfig | null {
    if (!env.TENANT_ID || !env.WEB_CLIENT_ID) {
      return null;
    }
    return {
      name: 'azure',
      type: 'msal',
      issuer: `https://login.microsoftonline.com/${env.TENANT_ID}/v2.0`,
      audience: env.WEB_CLIENT_ID,
      jwksUri: `https://login.microsoftonline.com/${env.TENANT_ID}/discovery/v2.0/keys`,
      clientId: env.WEB_CLIENT_ID,
      tenantId: env.TENANT_ID
    };
  }

  /**
   * Extracts user information from MSAL/Azure AD JWT payload
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    // MSAL/Azure AD uses some custom claims
    const email = payload.email as string | undefined || payload.preferred_username as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;
    const preferredUsername = payload.preferred_username as string | undefined;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername
    };
  }

  /**
   * Validates MSAL-specific configuration
   */
  validateConfig(): boolean {
    const baseValid = super.validateConfig();
    const hasClientId = !!this.config.clientId;
    const hasTenantId = !!this.config.tenantId;
    
    return baseValid && hasClientId && hasTenantId;
  }
}
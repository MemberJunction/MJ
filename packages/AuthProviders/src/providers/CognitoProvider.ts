import { JwtPayload } from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';
import { BaseAuthProvider } from '../BaseAuthProvider.js';


/**
 * AWS Cognito authentication provider implementation
 */
@RegisterClass(BaseAuthProvider, 'cognito')
export class CognitoProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Configures Amazon Cognito from COGNITO_USER_POOL_ID + COGNITO_CLIENT_ID + AWS_REGION.
   *
   * Mapping preserved byte-for-byte from the env block that previously lived in MJServer's config.
   */
  static configFromEnvironment(env: NodeJS.ProcessEnv): AuthProviderConfig | null {
    if (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID || !env.AWS_REGION) {
      return null;
    }
    return {
      name: 'cognito',
      type: 'cognito',
      issuer: `https://cognito-idp.${env.AWS_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`,
      audience: env.COGNITO_CLIENT_ID,
      jwksUri: `https://cognito-idp.${env.AWS_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
      clientId: env.COGNITO_CLIENT_ID,
      region: env.AWS_REGION,
      userPoolId: env.COGNITO_USER_POOL_ID
    };
  }

  /**
   * Extracts user information from Cognito JWT payload
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo {
    // Cognito uses custom claims with 'cognito:' prefix for some fields
    const email = payload.email as string | undefined || 
                  payload['cognito:username'] as string | undefined;
    const fullName = payload.name as string | undefined;
    const firstName = payload.given_name as string | undefined;
    const lastName = payload.family_name as string | undefined;
    const preferredUsername = payload['cognito:username'] as string | undefined || 
                             payload.preferred_username as string | undefined || 
                             email;

    return {
      email,
      firstName: firstName || fullName?.split(' ')[0],
      lastName: lastName || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername
    };
  }

  /**
   * Validates Cognito-specific configuration
   */
  validateConfig(): boolean {
    const baseValid = super.validateConfig();
    const hasClientId = !!this.config.clientId;
    const hasRegion = !!this.config.region;
    const hasUserPoolId = !!this.config.userPoolId;
    
    return baseValid && hasClientId && hasRegion && hasUserPoolId;
  }
}
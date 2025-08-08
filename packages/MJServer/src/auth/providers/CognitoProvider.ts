import { JwtPayload } from 'jsonwebtoken';
import { BaseAuthProvider } from '../BaseAuthProvider.js';
import { AuthProviderConfig } from '../IAuthProvider.js';

/**
 * AWS Cognito authentication provider implementation
 */
export class CognitoProvider extends BaseAuthProvider {
  constructor(config: AuthProviderConfig) {
    super(config);
  }

  /**
   * Extracts user information from Cognito JWT payload
   */
  extractUserInfo(payload: JwtPayload): {
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    preferredUsername?: string;
  } {
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
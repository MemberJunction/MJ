import { JwtHeader, JwtPayload, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { IAuthProvider, AuthProviderConfig } from './IAuthProvider.js';

/**
 * Base implementation of IAuthProvider with common functionality
 */
export abstract class BaseAuthProvider implements IAuthProvider {
  name: string;
  issuer: string;
  audience: string;
  jwksUri: string;
  protected config: AuthProviderConfig;
  protected jwksClient: jwksClient.JwksClient;

  constructor(config: AuthProviderConfig) {
    this.config = config;
    this.name = config.name;
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.jwksUri = config.jwksUri;

    // Initialize JWKS client
    this.jwksClient = jwksClient({
      jwksUri: this.jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000 // 10 minutes
    });
  }

  /**
   * Validates that required configuration is present
   */
  validateConfig(): boolean {
    return !!(this.name && this.issuer && this.audience && this.jwksUri);
  }

  /**
   * Gets the signing key for token verification
   */
  getSigningKey(header: JwtHeader, callback: SigningKeyCallback): void {
    this.jwksClient.getSigningKey(header.kid)
      .then((key) => {
        const signingKey = 'publicKey' in key ? key.publicKey : key.rsaPublicKey;
        callback(null, signingKey);
      })
      .catch((err) => {
        console.error(`Error getting signing key for provider ${this.name}:`, err);
        callback(err);
      });
  }

  /**
   * Checks if a given issuer URL belongs to this provider
   */
  matchesIssuer(issuer: string): boolean {
    // Handle trailing slashes and case sensitivity
    const normalizedIssuer = issuer.toLowerCase().replace(/\/$/, '');
    const normalizedProviderIssuer = this.issuer.toLowerCase().replace(/\/$/, '');
    return normalizedIssuer === normalizedProviderIssuer;
  }

  /**
   * Abstract method for extracting user info - must be implemented by each provider
   */
  abstract extractUserInfo(payload: JwtPayload): {
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    preferredUsername?: string;
  };
}
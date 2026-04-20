/**
 * @fileoverview PKCE (Proof Key for Code Exchange) challenge generator
 *
 * Implements RFC 7636 PKCE challenge generation using S256 method.
 * S256 is the only supported method as per OAuth 2.1 requirements.
 *
 * @module @memberjunction/ai-mcp-client/oauth/PKCEGenerator
 */

import { createHash, randomBytes } from 'crypto';
import type { PKCEChallenge } from './types.js';

/**
 * Generates PKCE code verifier and challenge for OAuth 2.1 authorization flows.
 *
 * Uses cryptographically secure random bytes and SHA-256 hashing per RFC 7636.
 * The code_verifier is 64 characters (48 bytes base64url encoded), providing
 * strong entropy for security.
 *
 * @example
 * ```typescript
 * const generator = new PKCEGenerator();
 * const challenge = generator.generate();
 *
 * // Use in authorization request:
 * const authUrl = new URL(authEndpoint);
 * authUrl.searchParams.set('code_challenge', challenge.codeChallenge);
 * authUrl.searchParams.set('code_challenge_method', challenge.codeChallengeMethod);
 *
 * // Store code_verifier for token exchange:
 * await storeVerifier(challenge.codeVerifier);
 * ```
 */
export class PKCEGenerator {
    /** Length of random bytes to generate (results in 64 char base64url string) */
    private static readonly VERIFIER_BYTES = 48;

    /**
     * Generates a new PKCE code verifier and challenge pair.
     *
     * @returns PKCE challenge data including verifier, challenge, and method
     */
    public generate(): PKCEChallenge {
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);

        return {
            codeVerifier,
            codeChallenge,
            codeChallengeMethod: 'S256'
        };
    }

    /**
     * Generates a cryptographically secure code verifier.
     *
     * Per RFC 7636 section 4.1:
     * - code_verifier is a high-entropy cryptographic random string
     * - Length between 43 and 128 characters
     * - Uses unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
     *
     * We use 48 random bytes which base64url encodes to 64 characters.
     *
     * @returns Base64url-encoded code verifier string
     */
    private generateCodeVerifier(): string {
        const buffer = randomBytes(PKCEGenerator.VERIFIER_BYTES);
        return this.base64UrlEncode(buffer);
    }

    /**
     * Generates the S256 code challenge from a code verifier.
     *
     * Per RFC 7636 section 4.2:
     * code_challenge = BASE64URL(SHA256(code_verifier))
     *
     * @param codeVerifier - The code verifier to hash
     * @returns Base64url-encoded SHA-256 hash of the verifier
     */
    private generateCodeChallenge(codeVerifier: string): string {
        const hash = createHash('sha256')
            .update(codeVerifier)
            .digest();
        return this.base64UrlEncode(hash);
    }

    /**
     * Encodes a buffer as a base64url string (RFC 4648 section 5).
     *
     * Base64url differs from standard base64:
     * - '+' is replaced with '-'
     * - '/' is replaced with '_'
     * - Padding '=' is removed
     *
     * @param buffer - Buffer to encode
     * @returns Base64url-encoded string
     */
    private base64UrlEncode(buffer: Buffer): string {
        return buffer
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Generates a cryptographically secure state parameter for CSRF protection.
     *
     * The state parameter is used to:
     * 1. Prevent CSRF attacks on the OAuth callback
     * 2. Correlate the callback to the original authorization request
     *
     * @param length - Number of random bytes (default: 32, resulting in 43 chars)
     * @returns Base64url-encoded state string
     */
    public generateState(length = 32): string {
        const buffer = randomBytes(length);
        return this.base64UrlEncode(buffer);
    }

    /**
     * Validates that a code verifier meets RFC 7636 requirements.
     *
     * @param verifier - The code verifier to validate
     * @returns true if valid, false otherwise
     */
    public validateCodeVerifier(verifier: string): boolean {
        // Length must be 43-128 characters
        if (verifier.length < 43 || verifier.length > 128) {
            return false;
        }

        // Must contain only unreserved characters
        const validPattern = /^[A-Za-z0-9\-._~]+$/;
        return validPattern.test(verifier);
    }
}

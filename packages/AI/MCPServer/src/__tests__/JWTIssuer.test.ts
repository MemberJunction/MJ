/**
 * Unit tests for JWTIssuer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createJWTIssuer, validateSigningSecret, type JWTIssuerConfig } from '../auth/JWTIssuer';

const TEST_SECRET = 'a'.repeat(64); // 64 chars = valid secret
const DEFAULT_CONFIG: JWTIssuerConfig = {
    signingSecret: TEST_SECRET,
    expiresIn: '1h',
    issuer: 'urn:mj:mcp-server',
    audience: 'http://localhost:3100',
};

describe('createJWTIssuer', () => {
    describe('sign()', () => {
        it('should produce a valid JWT string', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            const result = issuer.sign({
                email: 'user@example.com',
                mjUserId: 'user-uuid-1',
                scopes: ['entity:read'],
                upstreamProvider: 'azure-ad',
                upstreamSub: 'azure-sub-1',
            });

            expect(result.token).toBeTruthy();
            expect(typeof result.token).toBe('string');
            // JWT has 3 parts separated by dots
            expect(result.token.split('.')).toHaveLength(3);
        });

        it('should include correct claims', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            const result = issuer.sign({
                email: 'user@example.com',
                mjUserId: 'user-uuid-1',
                scopes: ['entity:read', 'action:execute'],
                upstreamProvider: 'azure-ad',
                upstreamSub: 'azure-sub-1',
            });

            const decoded = jwt.decode(result.token) as Record<string, unknown>;
            expect(decoded.iss).toBe('urn:mj:mcp-server');
            expect(decoded.sub).toBe('user@example.com');
            expect(decoded.aud).toBe('http://localhost:3100');
            expect(decoded.email).toBe('user@example.com');
            expect(decoded.mjUserId).toBe('user-uuid-1');
            expect(decoded.scopes).toEqual(['entity:read', 'action:execute']);
            expect(decoded.upstreamProvider).toBe('azure-ad');
            expect(decoded.upstreamSub).toBe('azure-sub-1');
        });

        it('should set correct expiration', () => {
            const issuer = createJWTIssuer({ ...DEFAULT_CONFIG, expiresIn: '30m' });
            const result = issuer.sign({
                email: 'user@example.com',
                mjUserId: 'user-uuid-1',
                scopes: [],
                upstreamProvider: 'test',
                upstreamSub: 'sub-1',
            });

            expect(result.expiresIn).toBe(1800); // 30 * 60 seconds
            expect(result.expiresAt).toBeInstanceOf(Date);
            // ExpiresAt should be roughly 30 minutes from now
            const thirtyMinutesFromNow = Date.now() + 30 * 60 * 1000;
            expect(Math.abs(result.expiresAt.getTime() - thirtyMinutesFromNow)).toBeLessThan(2000);
        });

        it('should handle different expiration formats', () => {
            const testCases: [string, number][] = [
                ['60s', 60],
                ['5m', 300],
                ['2h', 7200],
                ['1d', 86400],
            ];

            for (const [format, expectedSeconds] of testCases) {
                const issuer = createJWTIssuer({ ...DEFAULT_CONFIG, expiresIn: format });
                const result = issuer.sign({
                    email: 'test@test.com',
                    mjUserId: 'u1',
                    scopes: [],
                    upstreamProvider: 'test',
                    upstreamSub: 's1',
                });
                expect(result.expiresIn).toBe(expectedSeconds);
            }
        });

        it('should default to 1h for invalid expiration format', () => {
            const issuer = createJWTIssuer({ ...DEFAULT_CONFIG, expiresIn: 'invalid' });
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const result = issuer.sign({
                email: 'test@test.com',
                mjUserId: 'u1',
                scopes: [],
                upstreamProvider: 'test',
                upstreamSub: 's1',
            });
            expect(result.expiresIn).toBe(3600);
            consoleSpy.mockRestore();
        });
    });

    describe('verify()', () => {
        it('should verify a token signed by the same issuer', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            const { token } = issuer.sign({
                email: 'user@example.com',
                mjUserId: 'user-uuid-1',
                scopes: ['entity:read'],
                upstreamProvider: 'azure-ad',
                upstreamSub: 'azure-sub-1',
            });

            const claims = issuer.verify(token);
            expect(claims.email).toBe('user@example.com');
            expect(claims.mjUserId).toBe('user-uuid-1');
            expect(claims.scopes).toEqual(['entity:read']);
        });

        it('should throw for token with wrong secret', () => {
            const issuer1 = createJWTIssuer(DEFAULT_CONFIG);
            const issuer2 = createJWTIssuer({
                ...DEFAULT_CONFIG,
                signingSecret: 'b'.repeat(64),
            });

            const { token } = issuer1.sign({
                email: 'test@test.com',
                mjUserId: 'u1',
                scopes: [],
                upstreamProvider: 'test',
                upstreamSub: 's1',
            });

            expect(() => issuer2.verify(token)).toThrow();
        });

        it('should throw for tampered token', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            const { token } = issuer.sign({
                email: 'test@test.com',
                mjUserId: 'u1',
                scopes: [],
                upstreamProvider: 'test',
                upstreamSub: 's1',
            });

            // Tamper with the token payload
            const parts = token.split('.');
            parts[1] = parts[1] + 'tampered';
            const tampered = parts.join('.');

            expect(() => issuer.verify(tampered)).toThrow();
        });
    });

    describe('isProxyToken()', () => {
        it('should return true for tokens from this issuer', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            const { token } = issuer.sign({
                email: 'test@test.com',
                mjUserId: 'u1',
                scopes: [],
                upstreamProvider: 'test',
                upstreamSub: 's1',
            });

            expect(issuer.isProxyToken(token)).toBe(true);
        });

        it('should return false for tokens from different issuer', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            const otherToken = jwt.sign({ iss: 'other-issuer' }, 'secret');
            expect(issuer.isProxyToken(otherToken)).toBe(false);
        });

        it('should return false for invalid token', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            expect(issuer.isProxyToken('not-a-jwt')).toBe(false);
        });

        it('should return false for empty string', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            expect(issuer.isProxyToken('')).toBe(false);
        });
    });

    describe('config property', () => {
        it('should expose issuer, audience, and expiresIn', () => {
            const issuer = createJWTIssuer(DEFAULT_CONFIG);
            expect(issuer.config.issuer).toBe('urn:mj:mcp-server');
            expect(issuer.config.audience).toBe('http://localhost:3100');
            expect(issuer.config.expiresIn).toBe('1h');
        });
    });
});

describe('validateSigningSecret()', () => {
    it('should reject a 32-char raw string secret (needs > 32 bytes)', () => {
        const result = validateSigningSecret('a'.repeat(32));
        expect(result.valid).toBe(false);
    });

    it('should accept a long string secret', () => {
        const result = validateSigningSecret('a'.repeat(64));
        expect(result.valid).toBe(true);
    });

    it('should reject empty string', () => {
        const result = validateSigningSecret('');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
    });

    it('should reject short secrets', () => {
        const result = validateSigningSecret('short');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('at least 32 bytes');
    });

    it('should accept a base64-encoded secret that decodes to 32+ bytes', () => {
        // 44 base64 chars encode 33 bytes
        const base64Secret = Buffer.from('x'.repeat(33)).toString('base64');
        const result = validateSigningSecret(base64Secret);
        expect(result.valid).toBe(true);
    });
});

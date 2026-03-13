/**
 * Unit tests for MCP Server auth types
 * Validates type shape and interface contracts
 */

import { describe, it, expect } from 'vitest';
import type {
    AuthMode,
    MCPServerAuthSettings,
    OAuthErrorCode,
    OAuthValidationResult,
    AuthResult,
    MCPSessionContext,
    ProtectedResourceMetadata,
    ProxyJWTClaims,
    SignProxyJWTOptions,
    APIScopeInfo,
    ConsentRequest,
    ConsentResponse,
} from '../auth/types';

describe('Auth Types', () => {
    describe('AuthMode', () => {
        it('should accept all valid modes', () => {
            const modes: AuthMode[] = ['apiKey', 'oauth', 'both', 'none'];
            expect(modes).toHaveLength(4);
        });
    });

    describe('MCPServerAuthSettings', () => {
        it('should accept minimal settings', () => {
            const settings: MCPServerAuthSettings = {
                mode: 'apiKey',
            };
            expect(settings.mode).toBe('apiKey');
        });

        it('should accept full settings', () => {
            const settings: MCPServerAuthSettings = {
                mode: 'oauth',
                resourceIdentifier: 'https://mcp.example.com',
                autoResourceIdentifier: false,
            };
            expect(settings.resourceIdentifier).toBe('https://mcp.example.com');
        });
    });

    describe('OAuthErrorCode', () => {
        it('should accept all valid error codes', () => {
            const codes: OAuthErrorCode[] = [
                'invalid_token',
                'expired_token',
                'invalid_audience',
                'unknown_issuer',
                'user_not_found',
                'user_inactive',
                'provider_unavailable',
            ];
            expect(codes).toHaveLength(7);
        });
    });

    describe('OAuthValidationResult', () => {
        it('should represent a valid result', () => {
            const result: OAuthValidationResult = {
                valid: true,
                userInfo: {
                    email: 'user@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                    fullName: 'John Doe',
                },
            };
            expect(result.valid).toBe(true);
        });

        it('should represent an invalid result', () => {
            const result: OAuthValidationResult = {
                valid: false,
                error: {
                    code: 'expired_token',
                    message: 'Token has expired',
                },
            };
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('expired_token');
        });
    });

    describe('AuthResult', () => {
        it('should represent successful apiKey auth', () => {
            const result: AuthResult = {
                authenticated: true,
                method: 'apiKey',
                scopes: ['entity:read'],
                apiKeyContext: {
                    apiKey: 'mj_sk_test',
                    apiKeyId: 'key-1',
                    apiKeyHash: 'hash-1',
                },
            };
            expect(result.authenticated).toBe(true);
            expect(result.method).toBe('apiKey');
        });

        it('should represent successful oauth auth', () => {
            const result: AuthResult = {
                authenticated: true,
                method: 'oauth',
                scopes: ['entity:read', 'entity:write'],
                oauthContext: {
                    issuer: 'https://login.example.com',
                    subject: 'user-sub',
                    email: 'user@example.com',
                    expiresAt: new Date(),
                    scopes: ['entity:read', 'entity:write'],
                },
            };
            expect(result.method).toBe('oauth');
        });

        it('should represent failed auth', () => {
            const result: AuthResult = {
                authenticated: false,
                method: 'none',
                error: {
                    status: 401,
                    code: 'invalid_token',
                    message: 'Token is invalid',
                },
            };
            expect(result.authenticated).toBe(false);
            expect(result.error?.status).toBe(401);
        });
    });

    describe('ProtectedResourceMetadata', () => {
        it('should represent full metadata', () => {
            const metadata: ProtectedResourceMetadata = {
                resource: 'http://localhost:3100',
                authorization_servers: ['https://login.microsoftonline.com/tenant/v2.0'],
                scopes_supported: ['entity:read', 'entity:write'],
                bearer_methods_supported: ['header'],
                resource_name: 'MJ MCP Server',
                resource_documentation: 'https://docs.memberjunction.org',
            };
            expect(metadata.resource).toBe('http://localhost:3100');
            expect(metadata.authorization_servers).toHaveLength(1);
        });
    });

    describe('ProxyJWTClaims', () => {
        it('should represent valid proxy claims', () => {
            const claims: ProxyJWTClaims = {
                iss: 'urn:mj:mcp-server',
                sub: 'user@example.com',
                aud: 'http://localhost:3100',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600,
                email: 'user@example.com',
                mjUserId: 'user-uuid',
                scopes: ['entity:read'],
                upstreamProvider: 'azure-ad',
                upstreamSub: 'azure-sub-1',
            };
            expect(claims.iss).toBe('urn:mj:mcp-server');
        });
    });

    describe('ConsentRequest', () => {
        it('should represent a consent request', () => {
            const request: ConsentRequest = {
                requestId: 'req-123',
                requestedAt: new Date(),
                user: {
                    email: 'user@example.com',
                    firstName: 'John',
                    mjUserId: 'user-uuid',
                },
                upstreamProvider: 'azure-ad',
                upstreamSub: 'sub-1',
                availableScopes: [{
                    ID: 'scope-1',
                    Name: 'read',
                    FullPath: 'entity:read',
                    ParentID: null,
                    Category: 'Entities',
                    Description: 'Read entities',
                    IsActive: true,
                }],
                redirectUri: 'http://localhost/callback',
                clientId: 'client-1',
            };
            expect(request.requestId).toBe('req-123');
            expect(request.availableScopes).toHaveLength(1);
        });
    });

    describe('ConsentResponse', () => {
        it('should represent a consent response', () => {
            const response: ConsentResponse = {
                requestId: 'req-123',
                grantedScopes: ['entity:read', 'entity:write'],
                consentedAt: new Date(),
            };
            expect(response.grantedScopes).toHaveLength(2);
        });
    });
});

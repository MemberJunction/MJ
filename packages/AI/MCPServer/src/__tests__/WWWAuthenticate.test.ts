/**
 * Unit tests for WWWAuthenticate header generation
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the OAuthConfig module
vi.mock('../auth/OAuthConfig.js', () => ({
    getResourceIdentifier: () => 'http://localhost:3100',
}));

import { buildWWWAuthenticateHeader } from '../auth/WWWAuthenticate';

describe('buildWWWAuthenticateHeader()', () => {
    it('should build minimal header with resource_metadata', () => {
        const header = buildWWWAuthenticateHeader();
        expect(header).toContain('Bearer');
        expect(header).toContain('resource_metadata="http://localhost:3100/.well-known/oauth-protected-resource"');
    });

    it('should include error parameter', () => {
        const header = buildWWWAuthenticateHeader({
            error: 'insufficient_scope',
        });
        expect(header).toContain('error="insufficient_scope"');
    });

    it('should include scope parameter', () => {
        const header = buildWWWAuthenticateHeader({
            scope: 'entity:read entity:write',
        });
        expect(header).toContain('scope="entity:read entity:write"');
    });

    it('should include error_description', () => {
        const header = buildWWWAuthenticateHeader({
            error: 'invalid_token',
            errorDescription: 'Token has expired',
        });
        expect(header).toContain('error="invalid_token"');
        expect(header).toContain('error_description="Token has expired"');
    });

    it('should escape quotes in error_description', () => {
        const header = buildWWWAuthenticateHeader({
            error: 'invalid_token',
            errorDescription: 'Token "abc" is invalid',
        });
        expect(header).toContain('error_description="Token \\"abc\\" is invalid"');
    });

    it('should use custom resourceMetadataUrl', () => {
        const header = buildWWWAuthenticateHeader({
            resourceMetadataUrl: 'https://api.example.com',
        });
        expect(header).toContain('resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"');
    });

    it('should combine all parameters correctly', () => {
        const header = buildWWWAuthenticateHeader({
            error: 'insufficient_scope',
            scope: 'entity:write',
            errorDescription: 'Write access required',
        });
        expect(header).toMatch(/^Bearer /);
        expect(header).toContain('error="insufficient_scope"');
        expect(header).toContain('resource_metadata=');
        expect(header).toContain('scope="entity:write"');
        expect(header).toContain('error_description="Write access required"');
    });
});

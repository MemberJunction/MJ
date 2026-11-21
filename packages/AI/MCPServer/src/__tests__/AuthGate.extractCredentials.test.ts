/**
 * ExtractCredentials decides where the MCP server will read an API key from. The key it finds can
 * be the system key, so a key must never be taken from the URL: a URL is kept in access logs,
 * proxy logs, browser history and Referer headers.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: () => ({ IsValidAPIKeyFormat: (token: string) => token.startsWith('mj_sk_') }),
}));
vi.mock('@memberjunction/core', () => ({ RunView: class RunView {} }));
vi.mock('../auth/OAuthConfig.js', () => ({ GetAuthMode: vi.fn(), IsOAuthEnabled: vi.fn() }));
vi.mock('../auth/TokenValidator.js', () => ({ ValidateBearerToken: vi.fn(), ResolveOAuthUser: vi.fn() }));
vi.mock('../auth/WWWAuthenticate.js', () => ({
    Send401Response: vi.fn(), Send403Response: vi.fn(), Send503Response: vi.fn(),
}));

import { ExtractCredentials } from '../auth/AuthGate';

function request(url: string, headers: Record<string, string> = {}): Request {
    return { url, headers: { host: 'mcp.example.com', ...headers } } as unknown as Request;
}

describe('ExtractCredentials', () => {
    it.each([
        ['/mcp?apiKey=mj_sk_fromquery'],
        ['/mcp?api_key=mj_sk_fromquery'],
        ['/sse?apiKey=mj_sk_fromquery&api_key=mj_sk_other'],
    ])('does not read an API key from the query string of %s', (url) => {
        const credentials = ExtractCredentials(request(url));

        expect(credentials.apiKey).toBeUndefined();
        expect(credentials.apiKeySource).toBeUndefined();
    });

    it('reads the key from x-api-key, then x-mj-api-key', () => {
        expect(ExtractCredentials(request('/mcp', { 'x-api-key': 'mj_sk_a', 'x-mj-api-key': 'mj_sk_b' })))
            .toMatchObject({ apiKey: 'mj_sk_a', apiKeySource: 'x-api-key' });
        expect(ExtractCredentials(request('/mcp', { 'x-mj-api-key': 'mj_sk_b' })))
            .toMatchObject({ apiKey: 'mj_sk_b', apiKeySource: 'x-mj-api-key' });
    });

    it('reads an MJ API key sent as a Bearer token', () => {
        expect(ExtractCredentials(request('/mcp', { authorization: 'Bearer mj_sk_c' })))
            .toMatchObject({ apiKey: 'mj_sk_c', apiKeySource: 'authorization' });
    });

    it('keeps a header key when the URL also carries one', () => {
        const credentials = ExtractCredentials(request('/mcp?apiKey=mj_sk_fromquery', { 'x-mj-api-key': 'mj_sk_header' }));

        expect(credentials.apiKey).toBe('mj_sk_header');
    });

    it('treats any other Bearer token as an OAuth token, not an API key', () => {
        const credentials = ExtractCredentials(request('/mcp', { authorization: 'Bearer eyJhbGciOi.payload.sig' }));

        expect(credentials.bearerToken).toBe('eyJhbGciOi.payload.sig');
        expect(credentials.apiKey).toBeUndefined();
    });
});

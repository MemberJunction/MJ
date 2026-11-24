/**
 * ExtractCredentials decides where the MCP server will read an API key from. The key it finds can
 * be the system key, so a key must never be taken from the URL: a URL is kept in access logs,
 * proxy logs, browser history and Referer headers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import type { UserInfo } from '@memberjunction/core';

const runViewCalls: Array<{ params: Record<string, unknown>; contextUser: unknown }> = [];

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: () => ({ IsValidAPIKeyFormat: (token: string) => token.startsWith('mj_sk_') }),
}));
vi.mock('@memberjunction/core', () => ({
    RunView: class RunView {
        public async RunView(params: Record<string, unknown>, contextUser?: unknown) {
            runViewCalls.push({ params, contextUser });
            return { Success: true, Results: [{ Scope: 'entity:read' }] };
        }
    },
}));
vi.mock('../auth/OAuthConfig.js', () => ({ GetAuthMode: vi.fn(), IsOAuthEnabled: vi.fn() }));
vi.mock('../auth/TokenValidator.js', () => ({ ValidateBearerToken: vi.fn(), ResolveOAuthUser: vi.fn() }));
vi.mock('../auth/WWWAuthenticate.js', () => ({
    Send401Response: vi.fn(), Send403Response: vi.fn(), Send503Response: vi.fn(),
}));

import { AuthenticateRequest, ExtractCredentials } from '../auth/AuthGate';
import { GetAuthMode } from '../auth/OAuthConfig.js';
import { ValidateBearerToken, ResolveOAuthUser } from '../auth/TokenValidator.js';

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

    it('logs a warning when a caller passes an API key in query parameters', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const credentials = ExtractCredentials(request('/mcp?apiKey=mj_sk_secret'));

        expect(credentials.apiKey).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('API keys in query parameters are no longer accepted')
        );
        warn.mockRestore();
    });
});

describe('AuthenticateRequest security hardening', () => {
    afterEach(() => {
        runViewCalls.length = 0;
        vi.restoreAllMocks();
    });

    it('escapes apiKeyId and passes systemUser as contextUser when loading API key scopes', async () => {
        vi.mocked(GetAuthMode).mockReturnValue('apiKey');
        const sysUser = { ID: 'sys-1', Email: 'sys@example.com' } as unknown as UserInfo;
        const callerUser = { ID: 'u-1', Email: 'caller@example.com' } as unknown as UserInfo;

        const result = await AuthenticateRequest(
            request('/mcp', { 'x-api-key': 'mj_sk_valid' }),
            {
                validateApiKey: async () => ({
                    valid: true,
                    user: callerUser,
                    apiKeyId: "id' OR '1'='1",
                    apiKeyHash: 'hash-1',
                }),
                getSystemUser: () => sysUser,
            }
        );

        expect(result.authenticated).toBe(true);
        expect(runViewCalls).toHaveLength(1);
        expect(runViewCalls[0].params.ExtraFilter).toBe("APIKeyID = 'id'' OR ''1''=''1'");
        expect(runViewCalls[0].contextUser).toBe(sysUser);
    });

    it.each(['user_not_found', 'user_inactive'] as const)(
        'returns generic 403 Access denied without echoing the probed email on OAuth %s',
        async (errorCode) => {
            vi.mocked(GetAuthMode).mockReturnValue('oauth');
            vi.mocked(ValidateBearerToken).mockResolvedValue({
                valid: true,
                payload: { iss: 'https://idp.example.com', sub: 'sub-1', exp: 9999999999 },
                userInfo: { email: 'probed-victim@example.com' },
            });
            vi.mocked(ResolveOAuthUser).mockResolvedValue({
                error: {
                    code: errorCode,
                    message: `No user found for email probed-victim@example.com`,
                },
            });
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            const result = await AuthenticateRequest(
                request('/mcp', { authorization: 'Bearer eyJhbGciOi.payload.sig' }),
                {
                    validateApiKey: async () => ({ valid: false }),
                    getSystemUser: () => undefined,
                }
            );

            expect(result.authenticated).toBe(false);
            expect(result.error).toEqual({
                status: 403,
                code: 'access_denied',
                message: 'Access denied',
            });
            expect(JSON.stringify(result)).not.toContain('probed-victim@example.com');
            warn.mockRestore();
        }
    );
});

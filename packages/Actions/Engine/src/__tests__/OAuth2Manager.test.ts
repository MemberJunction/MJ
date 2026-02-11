import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuth2Manager, OAuth2Config, OAuth2TokenData } from '../generic/OAuth2Manager';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OAuth2Manager', () => {
    let manager: OAuth2Manager;
    const baseConfig: OAuth2Config = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        tokenEndpoint: 'https://auth.example.com/token',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('constructor', () => {
        it('should initialize with basic config', () => {
            manager = new OAuth2Manager(baseConfig);
            expect(manager.isTokenValid()).toBe(false);
            expect(manager.getTokenState()).toBeNull();
        });

        it('should initialize with pre-existing tokens', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'existing-token',
                refreshToken: 'existing-refresh',
                tokenExpiresAt: Date.now() + 3600000,
            });

            expect(manager.isTokenValid()).toBe(true);
            expect(manager.getTokenState()).toBeDefined();
            expect(manager.getTokenState()!.accessToken).toBe('existing-token');
        });

        it('should use default refreshBufferMs of 60000', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'token',
                tokenExpiresAt: Date.now() + 59000, // 59 seconds - less than 60s buffer
            });

            expect(manager.isTokenValid()).toBe(false);
        });

        it('should use custom refreshBufferMs', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'token',
                refreshBufferMs: 5000, // 5 seconds
                tokenExpiresAt: Date.now() + 10000, // 10 seconds from now
            });

            expect(manager.isTokenValid()).toBe(true);
        });
    });

    describe('isTokenValid', () => {
        it('should return false when no access token', () => {
            manager = new OAuth2Manager(baseConfig);
            expect(manager.isTokenValid()).toBe(false);
        });

        it('should return false when token is about to expire within buffer', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'tok',
                tokenExpiresAt: Date.now() + 30000, // 30 seconds, but buffer is 60s
            });
            expect(manager.isTokenValid()).toBe(false);
        });

        it('should return true when token is valid and not near expiration', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'tok',
                tokenExpiresAt: Date.now() + 120000, // 2 minutes
            });
            expect(manager.isTokenValid()).toBe(true);
        });
    });

    describe('getAuthorizationUrl', () => {
        it('should throw when no authorization endpoint configured', () => {
            manager = new OAuth2Manager(baseConfig);
            expect(() => manager.getAuthorizationUrl()).toThrow('Authorization endpoint not configured');
        });

        it('should build authorization URL with client_id and response_type', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                authorizationEndpoint: 'https://auth.example.com/authorize',
            });

            const url = manager.getAuthorizationUrl();
            expect(url).toContain('https://auth.example.com/authorize?');
            expect(url).toContain('client_id=test-client-id');
            expect(url).toContain('response_type=code');
        });

        it('should include redirect_uri when configured', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                authorizationEndpoint: 'https://auth.example.com/authorize',
                redirectUri: 'https://app.example.com/callback',
            });

            const url = manager.getAuthorizationUrl();
            expect(url).toContain('redirect_uri=');
            expect(url).toContain(encodeURIComponent('https://app.example.com/callback'));
        });

        it('should include scopes when configured', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                authorizationEndpoint: 'https://auth.example.com/authorize',
                scopes: ['read', 'write', 'admin'],
            });

            const url = manager.getAuthorizationUrl();
            expect(url).toContain('scope=read+write+admin');
        });

        it('should include state parameter when provided', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                authorizationEndpoint: 'https://auth.example.com/authorize',
            });

            const url = manager.getAuthorizationUrl('csrf-state-123');
            expect(url).toContain('state=csrf-state-123');
        });

        it('should include additional params when provided', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                authorizationEndpoint: 'https://auth.example.com/authorize',
            });

            const url = manager.getAuthorizationUrl(undefined, { prompt: 'consent', foo: 'bar' });
            expect(url).toContain('prompt=consent');
            expect(url).toContain('foo=bar');
        });
    });

    describe('exchangeAuthorizationCode', () => {
        it('should exchange code for tokens', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                redirectUri: 'https://app.example.com/callback',
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'new-access-token',
                    refresh_token: 'new-refresh-token',
                    expires_in: 3600,
                    token_type: 'Bearer',
                }),
            });

            const result = await manager.exchangeAuthorizationCode('auth-code-123');

            expect(result.accessToken).toBe('new-access-token');
            expect(result.refreshToken).toBe('new-refresh-token');

            // Verify fetch was called with correct params
            expect(mockFetch).toHaveBeenCalledWith(
                'https://auth.example.com/token',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/x-www-form-urlencoded',
                    }),
                })
            );
        });
    });

    describe('getClientCredentialsToken', () => {
        it('should obtain token via client credentials', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                scopes: ['api.read'],
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'cc-access-token',
                    expires_in: 7200,
                }),
            });

            const result = await manager.getClientCredentialsToken();

            expect(result.accessToken).toBe('cc-access-token');
        });
    });

    describe('refreshAccessToken', () => {
        it('should refresh token using refresh token', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                refreshToken: 'my-refresh-token',
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'refreshed-access-token',
                    refresh_token: 'new-refresh-token',
                    expires_in: 3600,
                }),
            });

            const result = await manager.refreshAccessToken();

            expect(result.accessToken).toBe('refreshed-access-token');
            expect(result.refreshToken).toBe('new-refresh-token');
        });

        it('should throw when no refresh token is available', async () => {
            manager = new OAuth2Manager(baseConfig);
            await expect(manager.refreshAccessToken()).rejects.toThrow('No refresh token available');
        });
    });

    describe('getAccessToken', () => {
        it('should return existing valid token', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'valid-token',
                tokenExpiresAt: Date.now() + 3600000,
            });

            const token = await manager.getAccessToken();
            expect(token).toBe('valid-token');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should refresh token when expired', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'expired-token',
                refreshToken: 'refresh-tok',
                tokenExpiresAt: Date.now() - 1000, // expired
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'new-token',
                    expires_in: 3600,
                }),
            });

            const token = await manager.getAccessToken();
            expect(token).toBe('new-token');
        });

        it('should fall back to client credentials when no refresh token', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'expired-token',
                tokenExpiresAt: Date.now() - 1000,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'cc-token',
                    expires_in: 3600,
                }),
            });

            const token = await manager.getAccessToken();
            expect(token).toBe('cc-token');
        });

        it('should throw when refresh fails', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'expired',
                refreshToken: 'refresh',
                tokenExpiresAt: Date.now() - 1000,
            });

            mockFetch.mockResolvedValue({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                text: vi.fn().mockResolvedValue('invalid_grant'),
            });

            await expect(manager.getAccessToken()).rejects.toThrow('Failed to refresh access token');
        });

        it('should deduplicate concurrent refresh requests', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                refreshToken: 'refresh',
                accessToken: 'expired',
                tokenExpiresAt: Date.now() - 1000,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'deduped-token',
                    expires_in: 3600,
                }),
            });

            // Call getAccessToken twice concurrently
            const [token1, token2] = await Promise.all([
                manager.getAccessToken(),
                manager.getAccessToken(),
            ]);

            expect(token1).toBe('deduped-token');
            expect(token2).toBe('deduped-token');
            // fetch should only be called once because the second request should reuse the same promise
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('requestToken (via public methods)', () => {
        it('should use tokenRequestTransform when configured', async () => {
            const transform = vi.fn((params: Record<string, string>) => ({
                ...params,
                extra_param: 'added',
            }));

            manager = new OAuth2Manager({
                ...baseConfig,
                scopes: ['api'],
                tokenRequestTransform: transform,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ access_token: 'tok', expires_in: 3600 }),
            });

            await manager.getClientCredentialsToken();

            expect(transform).toHaveBeenCalled();
        });

        it('should use tokenResponseTransform when configured', async () => {
            const transform = vi.fn(() => ({
                access_token: 'transformed-token',
                expires_in: 1800,
            }));

            manager = new OAuth2Manager({
                ...baseConfig,
                tokenResponseTransform: transform,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ non_standard: 'response' }),
            });

            const result = await manager.getClientCredentialsToken();

            expect(transform).toHaveBeenCalled();
            expect(result.accessToken).toBe('transformed-token');
        });

        it('should include additional headers in token request', async () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                additionalHeaders: { 'X-Custom-Header': 'custom-value' },
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ access_token: 'tok', expires_in: 3600 }),
            });

            await manager.getClientCredentialsToken();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-Custom-Header': 'custom-value',
                    }),
                })
            );
        });

        it('should call onTokenUpdate callback', async () => {
            const onUpdate = vi.fn();

            manager = new OAuth2Manager({
                ...baseConfig,
                onTokenUpdate: onUpdate,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'new-tok',
                    refresh_token: 'new-ref',
                    expires_in: 3600,
                }),
            });

            await manager.getClientCredentialsToken();

            expect(onUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    accessToken: 'new-tok',
                    refreshToken: 'new-ref',
                })
            );
        });

        it('should throw on HTTP error response', async () => {
            manager = new OAuth2Manager(baseConfig);

            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: vi.fn().mockResolvedValue('invalid_client'),
            });

            await expect(manager.getClientCredentialsToken()).rejects.toThrow(
                'OAuth2 token request failed'
            );
        });

        it('should assume 1-year expiration when no expires_in', async () => {
            manager = new OAuth2Manager(baseConfig);

            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    access_token: 'long-lived-token',
                    // No expires_in
                }),
            });

            const result = await manager.getClientCredentialsToken();

            expect(result.accessToken).toBe('long-lived-token');
            // Expiration should be roughly 1 year from now
            const oneYear = 365 * 24 * 60 * 60 * 1000;
            expect(result.expiresAt).toBeGreaterThan(Date.now() + oneYear - 10000);
        });
    });

    describe('setTokens', () => {
        it('should set access token', () => {
            manager = new OAuth2Manager(baseConfig);
            manager.setTokens('manual-token');

            const state = manager.getTokenState();
            expect(state!.accessToken).toBe('manual-token');
        });

        it('should set refresh token when provided', () => {
            manager = new OAuth2Manager(baseConfig);
            manager.setTokens('access', 'refresh');

            const state = manager.getTokenState();
            expect(state!.refreshToken).toBe('refresh');
        });

        it('should set expiration when expiresIn is provided', () => {
            manager = new OAuth2Manager(baseConfig);
            const before = Date.now();
            manager.setTokens('access', undefined, 3600);
            const after = Date.now();

            const state = manager.getTokenState();
            expect(state!.expiresAt).toBeGreaterThanOrEqual(before + 3600000);
            expect(state!.expiresAt).toBeLessThanOrEqual(after + 3600000);
        });

        it('should invoke onTokenUpdate callback', () => {
            const onUpdate = vi.fn();
            manager = new OAuth2Manager({ ...baseConfig, onTokenUpdate: onUpdate });

            manager.setTokens('tok', 'ref', 1800);

            expect(onUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    accessToken: 'tok',
                    refreshToken: 'ref',
                })
            );
        });
    });

    describe('clearTokens', () => {
        it('should clear all tokens', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'tok',
                refreshToken: 'ref',
                tokenExpiresAt: Date.now() + 3600000,
            });

            expect(manager.getTokenState()).not.toBeNull();

            manager.clearTokens();

            expect(manager.getTokenState()).toBeNull();
            expect(manager.isTokenValid()).toBe(false);
        });
    });

    describe('getTokenState', () => {
        it('should return null when no tokens', () => {
            manager = new OAuth2Manager(baseConfig);
            expect(manager.getTokenState()).toBeNull();
        });

        it('should return current token state', () => {
            manager = new OAuth2Manager({
                ...baseConfig,
                accessToken: 'tok',
                refreshToken: 'ref',
                tokenExpiresAt: 1234567890,
            });

            const state = manager.getTokenState();
            expect(state).toEqual({
                accessToken: 'tok',
                refreshToken: 'ref',
                expiresAt: 1234567890,
            });
        });
    });
});

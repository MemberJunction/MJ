import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @memberjunction/core
vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn(),
    RunView: vi.fn(),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

// Mock @memberjunction/core-entities
vi.mock('@memberjunction/core-entities', () => ({
    CompanyIntegrationEntity: class {},
    IntegrationEntity: class {},
}));

// Mock @memberjunction/actions-base
vi.mock('@memberjunction/actions-base', () => ({
    ActionResultSimple: class {},
    RunActionParams: class {},
    ActionParam: class {},
}));

import { BaseOAuthAction } from '../generic/BaseOAuthAction';
import { Metadata, LogError, LogStatus } from '@memberjunction/core';

// Concrete implementation for testing
class TestOAuthAction extends BaseOAuthAction {
    public refreshCallCount = 0;
    public refreshShouldFail = false;
    public refreshNewToken = 'refreshed-token-123';

    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string; Message: string }> {
        return { Success: true, ResultCode: 'SUCCESS', Message: 'OK' };
    }

    protected async refreshAccessToken(): Promise<void> {
        this.refreshCallCount++;
        if (this.refreshShouldFail) {
            throw new Error('Refresh failed');
        }
        if (this._companyIntegration) {
            (this._companyIntegration as Record<string, unknown>).AccessToken = this.refreshNewToken;
        }
    }

    // Expose protected members for testing
    public testInitializeOAuth(id: string) {
        return this.initializeOAuth(id);
    }
    public testGetAccessToken() {
        return this.getAccessToken();
    }
    public testGetRefreshToken() {
        return this.getRefreshToken();
    }
    public testIsTokenExpired() {
        return this.isTokenExpired();
    }
    public testMakeAuthenticatedRequest<T>(fn: (token: string) => Promise<T>, retry?: boolean) {
        return this.makeAuthenticatedRequest(fn, retry);
    }
    public testIsAuthError(error: unknown) {
        return this.isAuthError(error);
    }
    public testUpdateStoredTokens(token: string, refresh?: string, expires?: number) {
        return this.updateStoredTokens(token, refresh, expires);
    }
    public testGetCustomAttribute(num: 1 | 2 | 3 | 4 | 5) {
        return this.getCustomAttribute(num);
    }
    public testSetCustomAttribute(num: 1 | 2 | 3 | 4 | 5, val: string) {
        return this.setCustomAttribute(num, val);
    }
    public testHandleOAuthError(error: unknown) {
        return this.handleOAuthError(error);
    }

    // Allow setting internal state for testing
    public setCompanyIntegration(ci: Record<string, unknown>) {
        this._companyIntegration = ci as never;
    }
    public setIntegration(i: Record<string, unknown>) {
        this._integration = i as never;
    }
}

describe('BaseOAuthAction', () => {
    let action: TestOAuthAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new TestOAuthAction();
    });

    describe('oauthParams', () => {
        it('should return CompanyIntegrationID param', () => {
            const params = (action as Record<string, unknown>)['oauthParams'] as Array<Record<string, unknown>>;
            expect(params).toBeDefined();
            expect(params).toHaveLength(1);
            expect(params[0].Name).toBe('CompanyIntegrationID');
            expect(params[0].Type).toBe('Input');
        });
    });

    describe('initializeOAuth', () => {
        it('should load company integration and integration entities', async () => {
            const mockCI = {
                Load: vi.fn().mockResolvedValue(true),
                get IntegrationID() { return 'int-1'; },
                get AccessToken() { return 'token-123'; },
                get TokenExpirationDate() { return null; },
            };
            const mockIntegration = {
                Load: vi.fn().mockResolvedValue(true),
            };

            (Metadata as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
                GetEntityObject: vi.fn()
                    .mockResolvedValueOnce(mockCI)
                    .mockResolvedValueOnce(mockIntegration),
            }));

            const result = await action.testInitializeOAuth('ci-123');
            expect(result).toBe(true);
            expect(mockCI.Load).toHaveBeenCalledWith('ci-123');
        });

        it('should return false when company integration fails to load', async () => {
            const mockCI = {
                Load: vi.fn().mockResolvedValue(false),
            };

            (Metadata as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
                GetEntityObject: vi.fn().mockResolvedValue(mockCI),
            }));

            const result = await action.testInitializeOAuth('bad-id');
            expect(result).toBe(false);
            expect(LogError).toHaveBeenCalled();
        });

        it('should return false when GetEntityObject returns null', async () => {
            (Metadata as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
                GetEntityObject: vi.fn().mockResolvedValue(null),
            }));

            const result = await action.testInitializeOAuth('ci-123');
            expect(result).toBe(false);
            expect(LogError).toHaveBeenCalled();
        });
    });

    describe('getAccessToken / getRefreshToken', () => {
        it('should return null when no company integration', () => {
            expect(action.testGetAccessToken()).toBeNull();
            expect(action.testGetRefreshToken()).toBeNull();
        });

        it('should return token values from company integration', () => {
            action.setCompanyIntegration({
                AccessToken: 'access-tok',
                RefreshToken: 'refresh-tok',
            });

            expect(action.testGetAccessToken()).toBe('access-tok');
            expect(action.testGetRefreshToken()).toBe('refresh-tok');
        });
    });

    describe('isTokenExpired', () => {
        it('should return false when no expiration date', () => {
            action.setCompanyIntegration({ TokenExpirationDate: null });
            expect(action.testIsTokenExpired()).toBe(false);
        });

        it('should return false when token is far from expiration', () => {
            const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
            action.setCompanyIntegration({ TokenExpirationDate: futureDate });
            expect(action.testIsTokenExpired()).toBe(false);
        });

        it('should return true when token expires within 5 minutes', () => {
            const soonDate = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
            action.setCompanyIntegration({ TokenExpirationDate: soonDate });
            expect(action.testIsTokenExpired()).toBe(true);
        });

        it('should return true when token is already expired', () => {
            const pastDate = new Date(Date.now() - 1000);
            action.setCompanyIntegration({ TokenExpirationDate: pastDate });
            expect(action.testIsTokenExpired()).toBe(true);
        });
    });

    describe('isAuthError', () => {
        it('should detect 401 status code', () => {
            expect(action.testIsAuthError({ response: { status: 401 } })).toBe(true);
        });

        it('should detect 403 status code', () => {
            expect(action.testIsAuthError({ response: { status: 403 } })).toBe(true);
        });

        it('should detect statusCode 401', () => {
            expect(action.testIsAuthError({ statusCode: 401 })).toBe(true);
        });

        it('should detect "unauthorized" in error message', () => {
            expect(action.testIsAuthError({ message: 'Unauthorized request' })).toBe(true);
        });

        it('should detect "invalid_token" in error message', () => {
            expect(action.testIsAuthError({ message: 'invalid_token' })).toBe(true);
        });

        it('should detect "expired_token" in error code', () => {
            expect(action.testIsAuthError({ code: 'expired_token' })).toBe(true);
        });

        it('should detect "authentication" in error message', () => {
            expect(action.testIsAuthError({ message: 'Authentication required' })).toBe(true);
        });

        it('should return false for non-auth errors', () => {
            expect(action.testIsAuthError({ message: 'Connection timeout' })).toBe(false);
            expect(action.testIsAuthError({ response: { status: 500 } })).toBe(false);
        });

        it('should handle null/undefined error gracefully', () => {
            expect(action.testIsAuthError(null)).toBe(false);
            expect(action.testIsAuthError(undefined)).toBe(false);
            expect(action.testIsAuthError({})).toBe(false);
        });
    });

    describe('makeAuthenticatedRequest', () => {
        it('should call the request function with current token', async () => {
            action.setCompanyIntegration({ AccessToken: 'my-token' });

            const fn = vi.fn().mockResolvedValue('response-data');
            const result = await action.testMakeAuthenticatedRequest(fn);

            expect(fn).toHaveBeenCalledWith('my-token');
            expect(result).toBe('response-data');
        });

        it('should throw when no access token available', async () => {
            action.setCompanyIntegration({ AccessToken: null });

            await expect(
                action.testMakeAuthenticatedRequest(vi.fn())
            ).rejects.toThrow('No access token available');
        });

        it('should retry with refreshed token on auth error', async () => {
            action.setCompanyIntegration({ AccessToken: 'old-token' });
            action.refreshNewToken = 'new-token';

            const fn = vi.fn()
                .mockRejectedValueOnce({ message: 'unauthorized', response: { status: 401 } })
                .mockResolvedValueOnce('success');

            const result = await action.testMakeAuthenticatedRequest(fn, true);

            expect(fn).toHaveBeenCalledTimes(2);
            expect(result).toBe('success');
            expect(action.refreshCallCount).toBe(1);
        });

        it('should not retry when retryOnAuthFailure is false', async () => {
            action.setCompanyIntegration({ AccessToken: 'my-token' });

            const error = { message: 'unauthorized', response: { status: 401 } };
            const fn = vi.fn().mockRejectedValue(error);

            await expect(
                action.testMakeAuthenticatedRequest(fn, false)
            ).rejects.toEqual(error);
        });

        it('should rethrow non-auth errors without retry', async () => {
            action.setCompanyIntegration({ AccessToken: 'my-token' });

            const error = new Error('Network error');
            const fn = vi.fn().mockRejectedValue(error);

            await expect(
                action.testMakeAuthenticatedRequest(fn, true)
            ).rejects.toThrow('Network error');
            expect(action.refreshCallCount).toBe(0);
        });

        it('should throw when refresh fails to produce new token', async () => {
            action.setCompanyIntegration({ AccessToken: 'old-token' });
            action.refreshNewToken = ''; // empty after refresh
            // Override to null out the token
            action['refreshAccessToken'] = async () => {
                action.refreshCallCount++;
                if (action._companyIntegration) {
                    (action._companyIntegration as Record<string, unknown>).AccessToken = null;
                }
            };

            const fn = vi.fn().mockRejectedValue({ message: 'unauthorized' });

            await expect(
                action.testMakeAuthenticatedRequest(fn, true)
            ).rejects.toThrow('Failed to refresh access token');
        });
    });

    describe('updateStoredTokens', () => {
        it('should update access token', async () => {
            const ci = {
                AccessToken: 'old',
                RefreshToken: 'old-refresh',
                TokenExpirationDate: null as Date | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            action.setCompanyIntegration(ci);

            await action.testUpdateStoredTokens('new-access');

            expect(ci.AccessToken).toBe('new-access');
            expect(ci.Save).toHaveBeenCalled();
        });

        it('should update refresh token when provided', async () => {
            const ci = {
                AccessToken: 'old',
                RefreshToken: 'old-refresh',
                TokenExpirationDate: null as Date | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            action.setCompanyIntegration(ci);

            await action.testUpdateStoredTokens('new-access', 'new-refresh');

            expect(ci.RefreshToken).toBe('new-refresh');
        });

        it('should set expiration date when expiresIn is provided', async () => {
            const ci = {
                AccessToken: 'old',
                RefreshToken: null,
                TokenExpirationDate: null as Date | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            action.setCompanyIntegration(ci);

            const before = Date.now();
            await action.testUpdateStoredTokens('new-access', undefined, 3600);
            const after = Date.now();

            expect(ci.TokenExpirationDate).toBeInstanceOf(Date);
            const expTime = ci.TokenExpirationDate!.getTime();
            expect(expTime).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100);
            expect(expTime).toBeLessThanOrEqual(after + 3600 * 1000 + 100);
        });

        it('should throw when company integration is not initialized', async () => {
            await expect(
                action.testUpdateStoredTokens('token')
            ).rejects.toThrow('Company integration not initialized');
        });
    });

    describe('getCustomAttribute / setCustomAttribute', () => {
        it('should return null when company integration is not set', () => {
            expect(action.testGetCustomAttribute(1)).toBeNull();
        });

        it('should return custom attribute value', () => {
            action.setCompanyIntegration({
                CustomAttribute1: 'val1',
                CustomAttribute2: 'val2',
                CustomAttribute3: 'val3',
                CustomAttribute4: 'val4',
                CustomAttribute5: 'val5',
            });

            expect(action.testGetCustomAttribute(1)).toBe('val1');
            expect(action.testGetCustomAttribute(2)).toBe('val2');
            expect(action.testGetCustomAttribute(5)).toBe('val5');
        });

        it('should set custom attribute and save', async () => {
            const ci = {
                CustomAttribute1: 'old',
                Save: vi.fn().mockResolvedValue(true),
            };
            action.setCompanyIntegration(ci);

            await action.testSetCustomAttribute(1, 'new-value');

            expect(ci.CustomAttribute1).toBe('new-value');
            expect(ci.Save).toHaveBeenCalled();
        });

        it('should throw when setting attribute without company integration', async () => {
            await expect(
                action.testSetCustomAttribute(1, 'value')
            ).rejects.toThrow('Company integration not initialized');
        });
    });

    describe('handleOAuthError', () => {
        it('should return INVALID_TOKEN for auth errors', () => {
            const error = { message: 'unauthorized', response: { status: 401 } };
            const result = action.testHandleOAuthError(error);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_TOKEN');
            expect(result.Message).toContain('Authentication failed');
        });

        it('should return ERROR for non-auth errors', () => {
            const error = new Error('Something went wrong');
            const result = action.testHandleOAuthError(error);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('ERROR');
            expect(result.Message).toBe('Something went wrong');
        });

        it('should handle non-Error objects', () => {
            const result = action.testHandleOAuthError('string error');

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('ERROR');
            expect(result.Message).toBe('Unknown error occurred');
        });
    });
});

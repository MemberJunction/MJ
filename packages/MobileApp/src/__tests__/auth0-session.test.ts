import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the Auth0 session teardown. `expo-web-browser`, `expo-auth-session` and
 * `expo-secure-store` are native modules, so they are mocked; the mutable `wb` state drives
 * what the auth session sheet reports back.
 */
const wb = vi.hoisted(() => ({
    resultType: 'success' as 'success' | 'cancel' | 'dismiss',
    throws: false,
    lastCall: null as { url: string; returnUrl: string } | null,
}));

vi.mock('expo-web-browser', () => ({
    openAuthSessionAsync: (url: string, returnUrl: string) => {
        wb.lastCall = { url, returnUrl };
        return wb.throws ? Promise.reject(new Error('no browser')) : Promise.resolve({ type: wb.resultType });
    },
}));
vi.mock('expo-auth-session', () => ({
    makeRedirectUri: ({ scheme, path }: { scheme: string; path: string }) => `${scheme}://${path}`,
    exchangeCodeAsync: vi.fn(),
    refreshAsync: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
}));

import { BuildAuth0LogoutUrl, EndAuth0Session } from '@/auth/auth0-session';
import { Env } from '@/config/env';

beforeEach(() => {
    wb.resultType = 'success';
    wb.throws = false;
    wb.lastCall = null;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('BuildAuth0LogoutUrl', () => {
    it('targets the tenant /v2/logout endpoint with client_id and returnTo', () => {
        const url = new URL(BuildAuth0LogoutUrl('mjmobile://auth'));
        expect(url.origin).toBe(`https://${Env.auth0Domain}`);
        expect(url.pathname).toBe('/v2/logout');
        expect(url.searchParams.get('client_id')).toBe(Env.auth0ClientId);
        expect(url.searchParams.get('returnTo')).toBe('mjmobile://auth');
    });
});

describe('EndAuth0Session', () => {
    it('opens the logout URL in an auth session that returns to the app redirect URI', async () => {
        await EndAuth0Session();
        expect(wb.lastCall?.returnUrl).toBe('mjmobile://auth');
        expect(wb.lastCall?.url).toContain('/v2/logout?');
        expect(wb.lastCall?.url).toContain('returnTo=mjmobile%3A%2F%2Fauth');
    });

    it('resolves true when Auth0 redirected back to the app', async () => {
        await expect(EndAuth0Session()).resolves.toBe(true);
    });

    it('resolves false when the user dismissed the sheet', async () => {
        wb.resultType = 'cancel';
        await expect(EndAuth0Session()).resolves.toBe(false);
    });

    it('resolves false instead of throwing when the browser cannot be opened', async () => {
        wb.throws = true;
        await expect(EndAuth0Session()).resolves.toBe(false);
    });
});

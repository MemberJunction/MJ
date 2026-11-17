/**
 * The configured auth mode defaults to 'both'. With no OAuth provider configured, startup works out
 * that only API keys can work; every later check must use that effective mode, or a 401 advertises
 * OAuth discovery that leads nowhere.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../config.js', () => ({
    McpServerAuth: { mode: 'both' },
    McpServerSettings: {},
}));

import { GetAuthMode, IsOAuthEnabled, SetEffectiveAuthMode } from '../auth/OAuthConfig.js';

afterEach(() => SetEffectiveAuthMode(undefined));

describe('SetEffectiveAuthMode', () => {
    it('uses the configured mode until startup records an effective one', () => {
        expect(GetAuthMode()).toBe('both');
        expect(IsOAuthEnabled()).toBe(true);
    });

    it('REGRESSION: once startup falls back to apiKey, OAuth reads as off everywhere', () => {
        SetEffectiveAuthMode('apiKey');

        expect(GetAuthMode()).toBe('apiKey');
        expect(IsOAuthEnabled()).toBe(false);
    });

    it('clears back to the configured mode', () => {
        SetEffectiveAuthMode('apiKey');
        SetEffectiveAuthMode(undefined);

        expect(GetAuthMode()).toBe('both');
    });
});

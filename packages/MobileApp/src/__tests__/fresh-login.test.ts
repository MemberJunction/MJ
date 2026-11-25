import { describe, it, expect, beforeEach } from 'vitest';
import { PrefsStorage } from '@/data/preferences';
import {
    ClearFreshLoginRequired,
    FRESH_LOGIN_KEY,
    IsFreshLoginRequired,
    MarkFreshLoginRequired,
} from '@/auth/fresh-login';
import { ClearUserPreferences } from '@/data/preferences';

beforeEach(() => {
    PrefsStorage.clearAll();
});

describe('fresh-login flag', () => {
    it('is off by default so ordinary launches keep silent SSO', () => {
        expect(IsFreshLoginRequired()).toBe(false);
    });

    it('raises and lowers', () => {
        MarkFreshLoginRequired();
        expect(IsFreshLoginRequired()).toBe(true);
        expect(PrefsStorage.getBoolean(FRESH_LOGIN_KEY)).toBe(true);
        ClearFreshLoginRequired();
        expect(IsFreshLoginRequired()).toBe(false);
    });

    it('survives the per-user preference wipe that runs during sign-out', () => {
        MarkFreshLoginRequired();
        ClearUserPreferences();
        expect(IsFreshLoginRequired()).toBe(true);
    });
});

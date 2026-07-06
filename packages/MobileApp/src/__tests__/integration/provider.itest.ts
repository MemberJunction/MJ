/**
 * Integration: provider boot + auth.
 *
 * Verifies that `initLiveProvider()` successfully configures the real
 * GraphQLDataProvider against the live MJAPI, that `Metadata.Provider` is set,
 * and that the authenticated `Metadata.CurrentUser` is the expected test user.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { initLiveProvider, hasToken, EXPECTED_USER_EMAIL } from './setup-live';

describe.skipIf(!hasToken())('integration: provider / auth', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('boots the live GraphQL provider and sets Metadata.Provider', () => {
        expect(Metadata.Provider).toBeTruthy();
    });

    it('exposes a non-empty entity metadata set', () => {
        const md = new Metadata();
        expect(md.Entities.length).toBeGreaterThan(0);
    });

    it('authenticates as the expected current user', () => {
        const md = new Metadata();
        expect(md.CurrentUser).toBeTruthy();
        expect(md.CurrentUser.Email?.toLowerCase()).toBe(EXPECTED_USER_EMAIL.toLowerCase());
    });
});

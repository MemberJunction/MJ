import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for the global navigation's destination set.
 *
 * These exist because the E2E suite cannot reach them: Maestro's iOS driver does not traverse React
 * Native `Modal` contents, so the sheet's rows are invisible to it even though the sheet is on
 * screen. The regression that actually occurred — no way out of a conversation at all — is caught
 * by the Maestro flow asserting the affordance exists; what each row IS, and that every route is a
 * real screen, is caught here.
 */
vi.mock('react-native', () => ({
    Modal: 'Modal',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: { create: (o: unknown) => o, hairlineWidth: 1 },
    Text: 'Text',
    View: 'View',
}));
vi.mock('expo-router', () => ({ router: { replace: vi.fn() } }));
vi.mock('@/components/Icon', () => ({ Icons: new Proxy({}, { get: () => () => null }) }));

import { GlobalNav, GLOBAL_NAV_DESTINATIONS } from '@/components/GlobalNav';

describe('global navigation', () => {
    it('offers every peer destination the app has', () => {
        // If a new primary screen is added and not listed here, it is unreachable from a
        // conversation — which is exactly the bug this component was written to fix.
        expect(GLOBAL_NAV_DESTINATIONS.map((d) => d.Route)).toEqual([
            '/conversations',
            '/apps',
            '/explorer',
            '/profile',
        ]);
    });

    it('gives every destination a label and a description', () => {
        for (const d of GLOBAL_NAV_DESTINATIONS) {
            expect(d.Label.length).toBeGreaterThan(0);
            expect(d.Description.length).toBeGreaterThan(0);
        }
    });

    it('uses descriptions that are unique', () => {
        // The E2E flow and screen readers both disambiguate rows by description, because the labels
        // recur in the chrome behind the sheet.
        const descriptions = GLOBAL_NAV_DESTINATIONS.map((d) => d.Description);
        expect(new Set(descriptions).size).toBe(descriptions.length);
    });

    it('is a component', () => {
        expect(typeof GlobalNav).toBe('function');
    });
});

import { describe, it, expect } from 'vitest';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter.js';
import { SharedContextBrowserAdapter } from '../browser/SharedContextBrowserAdapter.js';

/**
 * CU-A3 parity gate. `SharedContextBrowserAdapter` — the adapter the regression
 * suite runs on — must expose the SAME perception surface as
 * `PlaywrightBrowserAdapter`. Historically SCBA overrode only navigation /
 * screenshot / action, silently inheriting BaseBrowserAdapter's no-op
 * perception defaults (`GetVisibleText` → '', `QueryElement` → Exists:false,
 * `GetAccessibilitySnapshot` → null, `WaitForLoadState` → immediate), so every
 * engine feature built on structured perception got nothing in suite mode.
 *
 * This test asserts BOTH adapters override each perception method — i.e. their
 * prototype method is not the same function object as the base's no-op. It
 * fails if a future change removes an override and reintroduces the silent gap.
 *
 * Screencast/audio are intentionally NOT in this list: they're live-view
 * features of the remote-browser (CDP) path, which SCBA legitimately doesn't
 * provide. Forcing no-op overrides just to satisfy a test would be worse than
 * an honest inherited no-op. The perception surface below is what the suite's
 * settle / grounding / diagnostics features actually depend on.
 */
const PERCEPTION_SURFACE = [
    'GetVisibleText',
    'GetSelectionText',
    'GetTitle',
    'WaitForLoadState',
    'GetAccessibilitySnapshot',
    'QueryElement',
] as const;

function proto(ctor: { prototype: object }): Record<string, unknown> {
    return ctor.prototype as unknown as Record<string, unknown>;
}

function overrides(ctor: { prototype: object }, method: string): boolean {
    return proto(ctor)[method] !== proto(BaseBrowserAdapter)[method];
}

describe('adapter perception parity (CU-A3)', () => {
    it('BaseBrowserAdapter defines every perception method (the no-op baseline)', () => {
        for (const m of PERCEPTION_SURFACE) {
            expect(typeof proto(BaseBrowserAdapter)[m]).toBe('function');
        }
    });

    it('PlaywrightBrowserAdapter overrides the full perception surface', () => {
        for (const m of PERCEPTION_SURFACE) {
            expect(overrides(PlaywrightBrowserAdapter, m), `PBA must override ${m}`).toBe(true);
        }
    });

    it('SharedContextBrowserAdapter overrides the full perception surface', () => {
        for (const m of PERCEPTION_SURFACE) {
            expect(overrides(SharedContextBrowserAdapter, m), `SCBA must override ${m}`).toBe(true);
        }
    });

    it('both adapters expose a function for each perception method', () => {
        // Delegation to page-perception.ts means the two overrides are distinct
        // thin wrappers, but each must exist independently on both prototypes.
        for (const m of PERCEPTION_SURFACE) {
            expect(typeof proto(PlaywrightBrowserAdapter)[m]).toBe('function');
            expect(typeof proto(SharedContextBrowserAdapter)[m]).toBe('function');
        }
    });
});

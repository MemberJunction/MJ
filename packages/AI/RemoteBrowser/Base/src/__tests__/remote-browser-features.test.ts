import { describe, it, expect, vi } from 'vitest';

/**
 * `remote-browser-features` imports `MJAIRemoteBrowserProviderEntity` for the `featuresOf` parameter
 * type (erased) AND uses it nowhere at runtime except reading `.SupportedFeaturesObject`. We stub
 * core-entities with a constructable double exposing that one accessor.
 */
class MockRemoteBrowserProviderEntity {
    public SupportedFeaturesObject: Record<string, boolean> | null = null;
    constructor(init?: { SupportedFeaturesObject?: Record<string, boolean> | null }) {
        if (init) {
            Object.assign(this, init);
        }
    }
}

vi.mock('@memberjunction/core-entities', () => ({
    MJAIRemoteBrowserProviderEntity: MockRemoteBrowserProviderEntity,
}));

import { featuresOf, KNOWN_REMOTE_BROWSER_FEATURE_KEYS } from '../remote-browser-features';
import { MJAIRemoteBrowserProviderEntity } from '@memberjunction/core-entities';

function makeProvider(
    features: Record<string, boolean> | null,
): MJAIRemoteBrowserProviderEntity {
    return new MockRemoteBrowserProviderEntity({ SupportedFeaturesObject: features }) as unknown as MJAIRemoteBrowserProviderEntity;
}

describe('featuresOf', () => {
    it('returns the typed flags when present', () => {
        const p = makeProvider({ RawCdpControl: true, LiveView: true });
        expect(featuresOf(p).RawCdpControl).toBe(true);
        expect(featuresOf(p).LiveView).toBe(true);
    });

    it('returns an empty object when SupportedFeaturesObject is null (fail-closed)', () => {
        const p = makeProvider(null);
        expect(featuresOf(p)).toEqual({});
        expect(featuresOf(p).HumanTakeover).toBeUndefined();
    });
});

describe('KNOWN_REMOTE_BROWSER_FEATURE_KEYS', () => {
    it('lists all 12 capability keys', () => {
        expect(KNOWN_REMOTE_BROWSER_FEATURE_KEYS).toHaveLength(12);
    });

    it('contains the control-substrate, viewing, and operational keys', () => {
        const keys = new Set<string>(KNOWN_REMOTE_BROWSER_FEATURE_KEYS as readonly string[]);
        for (const expected of [
            'RawCdpControl',
            'NativeAIControl',
            'LiveView',
            'HumanTakeover',
            'ScreenStreaming',
            'Stealth',
            'ProxyEgress',
            'SessionRecording',
            'PersistentContext',
            'MultiTab',
            'FileDownloads',
            'CaptchaSolving',
        ]) {
            expect(keys.has(expected)).toBe(true);
        }
    });

    it('has no duplicate keys', () => {
        const unique = new Set<string>(KNOWN_REMOTE_BROWSER_FEATURE_KEYS as readonly string[]);
        expect(unique.size).toBe(KNOWN_REMOTE_BROWSER_FEATURE_KEYS.length);
    });
});

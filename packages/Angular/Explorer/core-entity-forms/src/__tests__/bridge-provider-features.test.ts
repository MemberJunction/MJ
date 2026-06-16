import { describe, it, expect } from 'vitest';
import {
    BRIDGE_FEATURE_GROUPS,
    BRIDGE_FEATURE_KEYS,
    isFeatureEnabled,
    setFeature,
    countEnabledFeatures,
} from '../lib/custom/BridgeProviders/bridge-provider-features';

describe('bridge-provider-features', () => {
    describe('layout', () => {
        it('groups all 16 documented capability flags', () => {
            expect(BRIDGE_FEATURE_KEYS).toHaveLength(16);
            expect(BRIDGE_FEATURE_GROUPS.map(g => g.title)).toEqual([
                'Join methods',
                'Media tracks',
                'Signals & telephony',
            ]);
        });

        it('has no duplicate keys', () => {
            expect(new Set(BRIDGE_FEATURE_KEYS).size).toBe(BRIDGE_FEATURE_KEYS.length);
        });

        it('every feature has a label and description', () => {
            for (const group of BRIDGE_FEATURE_GROUPS) {
                for (const f of group.features) {
                    expect(f.label.length).toBeGreaterThan(0);
                    expect(f.description.length).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('isFeatureEnabled', () => {
        it('returns false for null features', () => {
            expect(isFeatureEnabled(null, 'AudioIn')).toBe(false);
        });
        it('returns false for an absent key', () => {
            expect(isFeatureEnabled({}, 'AudioIn')).toBe(false);
        });
        it('treats explicit false as disabled', () => {
            expect(isFeatureEnabled({ AudioIn: false }, 'AudioIn')).toBe(false);
        });
        it('returns true only for explicit true', () => {
            expect(isFeatureEnabled({ AudioIn: true }, 'AudioIn')).toBe(true);
        });
    });

    describe('setFeature', () => {
        it('does not mutate the input object', () => {
            const input = { AudioIn: true };
            const out = setFeature(input, 'AudioOut', true);
            expect(input).toEqual({ AudioIn: true });
            expect(out).not.toBe(input);
        });

        it('enabling sets the key to true', () => {
            expect(setFeature(null, 'AudioIn', true)).toEqual({ AudioIn: true });
        });

        it('disabling omits the key entirely (not persisted as false)', () => {
            const out = setFeature({ AudioIn: true, AudioOut: true }, 'AudioIn', false);
            expect(out).toEqual({ AudioOut: true });
            expect('AudioIn' in out).toBe(false);
        });

        it('disabling an already-absent key is a no-op result', () => {
            expect(setFeature({ AudioOut: true }, 'AudioIn', false)).toEqual({ AudioOut: true });
        });

        it('handles a null starting object when enabling', () => {
            expect(setFeature(null, 'Recording', true)).toEqual({ Recording: true });
        });
    });

    describe('countEnabledFeatures', () => {
        it('returns 0 for null', () => {
            expect(countEnabledFeatures(null)).toBe(0);
        });
        it('counts only explicit-true flags', () => {
            expect(countEnabledFeatures({ AudioIn: true, AudioOut: false, Recording: true })).toBe(2);
        });
    });
});

import { describe, expect, it } from 'vitest';
import type { ComponentSpec } from '@memberjunction/react-runtime';
import { SetupStyles } from '@memberjunction/react-runtime';
import { BuildMobileComponentStyles } from '../interactive/component-styles';
import { SettingsKeyForSpec } from '../interactive/user-settings';
import { Colors } from '../theme/tokens';

/**
 * @fileoverview The rest of the prop bag an interactive component receives.
 *
 * `components` and `libraries` are covered by `library-registry.test.ts`. These cover the three
 * props that were silently absent on mobile while the same component received them on the web:
 * `styles`, and the `savedUserSettings` / `onSaveUserSettings` pair, whose storage key is the
 * compatibility surface — two hosts computing different keys would give one user two profiles.
 */

describe('BuildMobileComponentStyles', () => {
    it('carries the app theme, not the runtime default palette', () => {
        // The default is a purple that is not MJ's. A component reading styles.colors.primary
        // should get the brand colour the rest of the app uses.
        const styles = BuildMobileComponentStyles(null);
        expect(styles.colors.primary).toBe(Colors.brand);
        expect(styles.colors.primary).not.toBe(SetupStyles().colors.primary);
    });

    it('maps surfaces and text from the same tokens the web reads', () => {
        const styles = BuildMobileComponentStyles(null);
        expect(styles.colors.background).toBe(Colors.bg);
        expect(styles.colors.surface).toBe(Colors.surface);
        expect(styles.colors.text).toBe(Colors.ink);
    });

    it('keeps the runtime default for a token this app does not mirror', () => {
        // Absent tokens must fall back rather than be invented — a wrong brand colour is harder
        // to spot than a default one.
        expect(BuildMobileComponentStyles(null).colors.secondary).toBe(SetupStyles().colors.secondary);
    });

    it('applies the spec style overrides above the theme', () => {
        // `styleOverrides` is how "make the charts blue" reaches a component as data instead of as
        // a hardcoded literal in generated code. Mobile discarded it entirely.
        const spec = {
            name: 'X',
            code: 'function X() { return null; }',
            styleOverrides: { chartPalette: ['#123456', '#654321'] },
        } as ComponentSpec;
        expect(BuildMobileComponentStyles(spec).chartPalette).toEqual(['#123456', '#654321']);
    });

    it('returns a full styles object for a spec with no overrides', () => {
        const styles = BuildMobileComponentStyles({ name: 'X', code: 'x' } as ComponentSpec);
        expect(styles.typography).toBeDefined();
        expect(styles.spacing).toBeDefined();
        expect(styles.colors).toBeDefined();
    });
});

describe('SettingsKeyForSpec', () => {
    it('derives a key from the component identity', () => {
        const key = SettingsKeyForSpec({ name: 'ModelBoard', namespace: 'Global' } as ComponentSpec);
        expect(key).toBeTruthy();
        expect(key).toContain('modelboard');
    });

    it('produces the same key for the same component regardless of the rest of the spec', () => {
        // This is the cross-device promise: settings saved from a desktop open on a phone because
        // both hosts compute one key from namespace + name.
        const a = SettingsKeyForSpec({ name: 'Board', namespace: 'Global', code: 'v1' } as ComponentSpec);
        const b = SettingsKeyForSpec({ name: 'Board', namespace: 'Global', code: 'v2-rewritten' } as ComponentSpec);
        expect(a).toBe(b);
    });

    it('distinguishes two components with the same name in different namespaces', () => {
        const a = SettingsKeyForSpec({ name: 'Board', namespace: 'Sales' } as ComponentSpec);
        const b = SettingsKeyForSpec({ name: 'Board', namespace: 'Finance' } as ComponentSpec);
        expect(a).not.toBe(b);
    });

    it('returns null when there is no stable scope to key by', () => {
        // A key invented for an unidentifiable component would collide with the next one.
        expect(SettingsKeyForSpec({} as ComponentSpec)).toBeNull();
        expect(SettingsKeyForSpec(null)).toBeNull();
    });
});

/**
 * Unit tests for ShellPreferences (SLICE-S1) — the UserInfoEngine-backed
 * composed-shell prefs. Contracts: Show Projects defaults ON (D-S7 opt-OUT
 * semantics — only the literal string 'false' disables), density defaults
 * comfortable, writes go through the debounced setter, and reads never throw
 * when the engine isn't configured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = new Map<string, string>();
const setDebounced = vi.fn((key: string, value: string) => { settings.set(key, value); });
let getSetting = vi.fn((key: string): string | undefined => settings.get(key));

vi.mock('@memberjunction/core-entities', () => ({
    UserInfoEngine: {
        get Instance() {
            return {
                GetSetting: (key: string) => getSetting(key),
                SetSettingDebounced: setDebounced,
                Config: () => Promise.resolve(),
            };
        },
    },
}));

import { ShellPreferences } from '../lib/utils/shell-preferences';

describe('ShellPreferences', () => {
    beforeEach(() => {
        settings.clear();
        setDebounced.mockClear();
        getSetting = vi.fn((key: string) => settings.get(key));
    });

    it('ShowProjects defaults ON when no setting exists (D-S7 visible-by-default)', () => {
        expect(ShellPreferences.ShowProjects).toBe(true);
    });

    it("ShowProjects is OFF only for the literal 'false'; any other value stays ON", () => {
        settings.set('mj.conversations.showProjects.v1', 'false');
        expect(ShellPreferences.ShowProjects).toBe(false);
        settings.set('mj.conversations.showProjects.v1', 'true');
        expect(ShellPreferences.ShowProjects).toBe(true);
        settings.set('mj.conversations.showProjects.v1', 'garbage');
        expect(ShellPreferences.ShowProjects).toBe(true);
    });

    it('SetShowProjects round-trips through the debounced writer', () => {
        ShellPreferences.SetShowProjects(false);
        expect(setDebounced).toHaveBeenCalledWith('mj.conversations.showProjects.v1', 'false');
        expect(ShellPreferences.ShowProjects).toBe(false);
        ShellPreferences.SetShowProjects(true);
        expect(ShellPreferences.ShowProjects).toBe(true);
    });

    it("SidebarDensity defaults comfortable; only the literal 'compact' switches it", () => {
        expect(ShellPreferences.SidebarDensity).toBe('comfortable');
        settings.set('mj.conversations.sidebarDensity.v1', 'compact');
        expect(ShellPreferences.SidebarDensity).toBe('compact');
        settings.set('mj.conversations.sidebarDensity.v1', 'anything-else');
        expect(ShellPreferences.SidebarDensity).toBe('comfortable');
    });

    it('SetSidebarDensity round-trips through the debounced writer', () => {
        ShellPreferences.SetSidebarDensity('compact');
        expect(setDebounced).toHaveBeenCalledWith('mj.conversations.sidebarDensity.v1', 'compact');
        expect(ShellPreferences.SidebarDensity).toBe('compact');
    });

    it('reads fall back to defaults when the engine throws (not configured yet)', () => {
        getSetting = vi.fn(() => { throw new Error('engine not configured'); });
        expect(ShellPreferences.ShowProjects).toBe(true);
        expect(ShellPreferences.SidebarDensity).toBe('comfortable');
    });
});

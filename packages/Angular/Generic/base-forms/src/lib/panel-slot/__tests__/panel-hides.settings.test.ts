import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The collector reads the user's hide list on every call, and `UserInfoEngine.GetSetting` scans
 * the user's settings each time. The list is remembered per user and entity until the settings
 * change or a hide is written.
 */

const hoisted = vi.hoisted(() => ({
    settings: new Map<string, string>(),
    reads: 0,
    userID: 'user-1' as string | null,
    observers: [] as Array<() => void>,
}));

vi.mock('@memberjunction/core-entities', async () => ({
    ...(await vi.importActual<Record<string, unknown>>('@memberjunction/core-entities/dist/custom/FormScope/FormPanelHides.js')),
    UserInfoEngine: {
        get Instance() {
            return {
                get LoadedForUserId() { return hoisted.userID; },
                GetSetting: (key: string) => { hoisted.reads++; return hoisted.settings.get(key); },
                SetSettingDebounced: (key: string, value: string) => { hoisted.settings.set(key, value); },
                // Replays on subscribe, as the engine's BehaviorSubject does.
                ObserveProperty: () => ({
                    subscribe: (fn: () => void) => { hoisted.observers.push(fn); fn(); return { unsubscribe() {} }; },
                }),
            };
        },
    },
}));

import { ForgetHiddenPanelsSettings, HiddenPanelKeys, HiddenPanelsSetting, SetPanelHidden } from '../panel-hides';

const KEY = 'mj.formPanels.hidden.morecheese: courses';
const ENTITY = 'MoreCheese: Courses';
const settingsChanged = () => hoisted.observers.forEach((notify) => notify());

beforeEach(() => {
    ForgetHiddenPanelsSettings();
    hoisted.settings.clear();
    hoisted.reads = 0;
    hoisted.userID = 'user-1';
});

describe('HiddenPanelsSetting', () => {
    it('reads the setting once, then answers from memory', () => {
        hoisted.settings.set(KEY, '["a"]');
        expect(HiddenPanelsSetting(ENTITY)).toBe('["a"]');
        expect(HiddenPanelsSetting(ENTITY)).toBe('["a"]');
        expect(hoisted.reads).toBe(1);
    });

    it('reads it again once the user\'s settings change', () => {
        hoisted.settings.set(KEY, '["a"]');
        HiddenPanelsSetting(ENTITY);
        hoisted.settings.set(KEY, '["b"]');
        settingsChanged();
        expect(HiddenPanelsSetting(ENTITY)).toBe('["b"]');
    });

    it('sees a hide written here at once, before the debounced save lands', () => {
        expect(HiddenPanelKeys(ENTITY)).toEqual([]);
        SetPanelHidden(ENTITY, 'panel:x', true);
        expect(HiddenPanelKeys(ENTITY)).toEqual(['panel:x']);
    });

    it('keeps one user\'s list apart from another\'s', () => {
        hoisted.settings.set(KEY, '["a"]');
        HiddenPanelsSetting(ENTITY);
        hoisted.userID = 'user-2';
        hoisted.settings.set(KEY, '["b"]');
        expect(HiddenPanelsSetting(ENTITY)).toBe('["b"]');
    });
});

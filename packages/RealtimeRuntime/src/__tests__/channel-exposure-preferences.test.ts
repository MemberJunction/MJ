import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserInfoEngine } from '@memberjunction/core-entities';
import {
    InMemoryChannelExposurePreferences,
    ParseExposurePreferences,
    SerializeExposurePreferences,
    UserSettingsExposurePreferences,
    VISUAL_PERCEPTION_SETTING_KEY,
} from '../session/channel-exposure-preferences';

afterEach(() => vi.restoreAllMocks());

describe('persisted choice format', () => {
    it('is stored under the documented per-user setting key', () => {
        expect(VISUAL_PERCEPTION_SETTING_KEY).toBe('mj.realtime.visualPerception.v1');
    });

    it('round-trips choices with normalized keys', () => {
        const map = new Map([['whiteboard', 'state' as const], ['remotebrowser', 'none' as const]]);
        expect(ParseExposurePreferences(SerializeExposurePreferences(map))).toEqual(map);
    });

    it('stores only the choices the user made, as a plain object', () => {
        expect(SerializeExposurePreferences(new Map([['whiteboard', 'state' as const]]))).toBe('{"whiteboard":"state"}');
        expect(SerializeExposurePreferences(new Map())).toBe('{}');
    });

    it('parses tolerantly: corrupt, wrong-shaped and invalid values contribute nothing and never throw', () => {
        expect(ParseExposurePreferences(undefined).size).toBe(0);
        expect(ParseExposurePreferences(null).size).toBe(0);
        expect(ParseExposurePreferences('').size).toBe(0);
        expect(ParseExposurePreferences('{not json').size).toBe(0);
        expect(ParseExposurePreferences('[]').size).toBe(0);
        expect(ParseExposurePreferences('"str"').size).toBe(0);
        const parsed = ParseExposurePreferences('{"Whiteboard":"state","Media":"everything","  ":"none","Form":3}');
        expect([...parsed]).toEqual([['whiteboard', 'state']]);
    });
});

describe('InMemoryChannelExposurePreferences', () => {
    it('remembers choices case-insensitively and clears them with undefined', () => {
        const store = new InMemoryChannelExposurePreferences();
        expect(store.Get('Whiteboard')).toBeUndefined();
        store.Set('Whiteboard', 'state');
        expect(store.Get('whiteboard')).toBe('state');
        expect(store.Get(' WHITEBOARD ')).toBe('state');
        store.Set('whiteboard', undefined);
        expect(store.Get('Whiteboard')).toBeUndefined();
    });
});

describe('UserSettingsExposurePreferences', () => {
    function engine() {
        const get = vi.spyOn(UserInfoEngine.Instance, 'GetSetting');
        const set = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
        return { get, set };
    }

    it('keeps choices in memory only when there is no user to persist for (anonymous / connect-only)', () => {
        const { get, set } = engine();
        const store = new UserSettingsExposurePreferences(() => false);
        store.Set('Whiteboard', 'state');
        expect(store.Get('whiteboard')).toBe('state');
        expect(set).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
    });

    it('persists a signed-in user\'s choice (debounced) under the per-user setting key', () => {
        const { get, set } = engine();
        get.mockReturnValue(undefined);
        const store = new UserSettingsExposurePreferences(() => true);
        store.Set('Whiteboard', 'state');
        expect(set).toHaveBeenCalledWith('mj.realtime.visualPerception.v1', '{"whiteboard":"state"}');
    });

    it('merges with what is already saved instead of overwriting other channels\' choices', () => {
        const { get, set } = engine();
        get.mockReturnValue('{"media":"none"}');
        const store = new UserSettingsExposurePreferences(() => true);
        store.Set('Whiteboard', 'state');
        expect(JSON.parse(set.mock.calls[0][1])).toEqual({ media: 'none', whiteboard: 'state' });
    });

    it('clearing a choice removes it from the saved value', () => {
        const { get, set } = engine();
        get.mockReturnValue('{"media":"none","whiteboard":"state"}');
        const store = new UserSettingsExposurePreferences(() => true);
        store.Set('Whiteboard', undefined);
        expect(JSON.parse(set.mock.calls[0][1])).toEqual({ media: 'none' });
    });

    it('reads a saved choice back from the user settings', () => {
        const { get } = engine();
        get.mockReturnValue('{"whiteboard":"none"}');
        const store = new UserSettingsExposurePreferences(() => true);
        expect(store.Get('Whiteboard')).toBe('none');
        expect(store.Get('Other')).toBeUndefined();
    });

    it('a choice still takes effect when persisting is unavailable at the moment it is made', () => {
        const { get } = engine();
        get.mockReturnValue(undefined);
        let signedIn = false;
        const store = new UserSettingsExposurePreferences(() => signedIn);
        store.Set('Whiteboard', 'state');
        signedIn = true;
        expect(store.Get('Whiteboard')).toBe('state'); // memory is the fallback while the saved value is silent
    });

    it('logs once and falls back to memory when the settings cache cannot be read (never throws)', () => {
        const { get } = engine();
        get.mockImplementation(() => {
            throw new Error('engine not loaded');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const store = new UserSettingsExposurePreferences(() => true);
        expect(store.Get('Whiteboard')).toBeUndefined();
        expect(store.Get('Whiteboard')).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

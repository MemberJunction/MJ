import { describe, expect, it } from 'vitest';
import {
    FORM_CHROME_RAIL_PINNED_DEFAULT,
    FormChromeRailPinnedKey,
    ParseRailPinnedSetting,
    SerializeRailPinnedSetting,
} from '../form-chrome-rail-pref';

describe('form chrome rail pin prefs', () => {
    it('defaults to pinned', () => {
        expect(FORM_CHROME_RAIL_PINNED_DEFAULT).toBe(true);
        expect(ParseRailPinnedSetting(undefined)).toBe(true);
        expect(ParseRailPinnedSetting(null)).toBe(true);
        expect(ParseRailPinnedSetting('')).toBe(true);
    });

    it('scopes the setting key to the lowercased entity name', () => {
        expect(FormChromeRailPinnedKey('MJ_BizApps_Orders: Order Headers')).toBe(
            'mj.formChrome.mj_bizapps_orders: order headers.railPinned',
        );
    });

    it('reads 0/false as unpinned and 1/true as pinned', () => {
        expect(ParseRailPinnedSetting('0')).toBe(false);
        expect(ParseRailPinnedSetting('false')).toBe(false);
        expect(ParseRailPinnedSetting('1')).toBe(true);
        expect(ParseRailPinnedSetting('true')).toBe(true);
    });

    it('serializes as 1/0 for UserInfoEngine', () => {
        expect(SerializeRailPinnedSetting(true)).toBe('1');
        expect(SerializeRailPinnedSetting(false)).toBe('0');
    });
});

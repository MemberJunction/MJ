import { describe, expect, it } from 'vitest';
import {
    ClampRailWidth,
    FORM_CHROME_RAIL_PINNED_DEFAULT,
    FORM_CHROME_RAIL_WIDTH_DEFAULT,
    FORM_CHROME_RAIL_WIDTH_MAX,
    FORM_CHROME_RAIL_WIDTH_MIN,
    FormChromeRailPinnedKey,
    FormChromeRailWidthKey,
    ParseRailPinnedSetting,
    ParseRailWidthSetting,
    SerializeRailPinnedSetting,
    SerializeRailWidthSetting,
    ShouldPersistChromeActiveGroup,
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

    it('does not persist left-nav active group on unsaved records', () => {
        expect(ShouldPersistChromeActiveGroup(true)).toBe(true);
        expect(ShouldPersistChromeActiveGroup(false)).toBe(false);
        expect(ShouldPersistChromeActiveGroup(undefined)).toBe(false);
        expect(ShouldPersistChromeActiveGroup(null)).toBe(false);
    });
});

describe('form chrome rail width prefs', () => {
    it('scopes the width key to the lowercased entity name', () => {
        expect(FormChromeRailWidthKey('MJ_BizApps_Orders: Subscriptions')).toBe(
            'mj.formChrome.mj_bizapps_orders: subscriptions.railWidth',
        );
    });

    it('clamps to the allowed band', () => {
        expect(ClampRailWidth(FORM_CHROME_RAIL_WIDTH_DEFAULT)).toBe(FORM_CHROME_RAIL_WIDTH_DEFAULT);
        expect(ClampRailWidth(80)).toBe(FORM_CHROME_RAIL_WIDTH_MIN);
        expect(ClampRailWidth(800)).toBe(FORM_CHROME_RAIL_WIDTH_MAX);
        expect(ClampRailWidth(Number.NaN)).toBe(FORM_CHROME_RAIL_WIDTH_DEFAULT);
    });

    it('parses a stored pixel width and falls back when missing', () => {
        expect(ParseRailWidthSetting(undefined)).toBe(FORM_CHROME_RAIL_WIDTH_DEFAULT);
        expect(ParseRailWidthSetting('240')).toBe(240);
        expect(ParseRailWidthSetting('12')).toBe(FORM_CHROME_RAIL_WIDTH_MIN);
        expect(SerializeRailWidthSetting(241.6)).toBe('242');
    });
});

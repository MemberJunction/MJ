import { describe, it, expect } from 'vitest';
import {
  USER_STATE_KEY_PREFIX,
  resolveUserStateScope,
  userStateStorageKey,
  parseStoredUserSettings,
  mergeUserSettings,
  applyUserSettingsUpdate
} from '../utilities/user-state';

describe('user-state helpers', () => {
  describe('resolveUserStateScope', () => {
    it('prefers an explicit scope over namespace/name', () => {
      expect(resolveUserStateScope('Form/Contacts', 'crm', 'ContactForm')).toBe('form/contacts');
    });

    it('lowercases the explicit scope', () => {
      expect(resolveUserStateScope('MyDashboard', null, null)).toBe('mydashboard');
    });

    it('trims surrounding whitespace from the explicit scope', () => {
      expect(resolveUserStateScope('  Spaced  ', null, null)).toBe('spaced');
    });

    it('combines namespace and name when no explicit scope is given', () => {
      expect(resolveUserStateScope(undefined, 'CRM/Analytics', 'AccountDashboard'))
        .toBe('crm/analytics/accountdashboard');
    });

    it('uses just the name when there is no namespace', () => {
      expect(resolveUserStateScope(undefined, undefined, 'SalesReport')).toBe('salesreport');
      expect(resolveUserStateScope(null, '   ', 'SalesReport')).toBe('salesreport');
    });

    it('returns null when no stable scope can be derived', () => {
      expect(resolveUserStateScope(undefined, undefined, undefined)).toBeNull();
      expect(resolveUserStateScope('', '', '')).toBeNull();
      expect(resolveUserStateScope('   ', 'crm', '   ')).toBeNull();
    });
  });

  describe('userStateStorageKey', () => {
    it('prefixes a resolved scope with the unique root namespace', () => {
      expect(userStateStorageKey('form/contacts')).toBe(`${USER_STATE_KEY_PREFIX}form/contacts`);
      expect(userStateStorageKey('form/contacts')).toBe('InteractiveComponents_UserState_Root/form/contacts');
    });

    it('returns null for a null scope', () => {
      expect(userStateStorageKey(null)).toBeNull();
    });
  });

  describe('parseStoredUserSettings', () => {
    it('parses a valid JSON object', () => {
      expect(parseStoredUserSettings('{"sortBy":"Name","page":2}')).toEqual({ sortBy: 'Name', page: 2 });
    });

    it('returns an empty object for null/undefined/empty input', () => {
      expect(parseStoredUserSettings(null)).toEqual({});
      expect(parseStoredUserSettings(undefined)).toEqual({});
      expect(parseStoredUserSettings('')).toEqual({});
    });

    it('returns an empty object for invalid JSON instead of throwing', () => {
      expect(parseStoredUserSettings('{not valid json')).toEqual({});
    });

    it('returns an empty object for non-object JSON (arrays, primitives)', () => {
      expect(parseStoredUserSettings('[1,2,3]')).toEqual({});
      expect(parseStoredUserSettings('42')).toEqual({});
      expect(parseStoredUserSettings('"hello"')).toEqual({});
      expect(parseStoredUserSettings('null')).toEqual({});
    });
  });

  describe('mergeUserSettings', () => {
    it('lets stored values win over host defaults', () => {
      const merged = mergeUserSettings({ sortBy: 'CloseDate', viewMode: 'grid' }, { sortBy: 'Name' });
      expect(merged).toEqual({ sortBy: 'Name', viewMode: 'grid' });
    });

    it('keeps host defaults that the stored settings do not override', () => {
      expect(mergeUserSettings({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
    });

    it('handles null/undefined on either side', () => {
      expect(mergeUserSettings(null, { x: 1 })).toEqual({ x: 1 });
      expect(mergeUserSettings({ x: 1 }, null)).toEqual({ x: 1 });
      expect(mergeUserSettings(null, null)).toEqual({});
      expect(mergeUserSettings(undefined, undefined)).toEqual({});
    });

    it('returns a new object (does not mutate inputs)', () => {
      const defaults = { a: 1 };
      const stored = { b: 2 };
      const merged = mergeUserSettings(defaults, stored);
      expect(merged).not.toBe(defaults);
      expect(merged).not.toBe(stored);
      expect(defaults).toEqual({ a: 1 });
      expect(stored).toEqual({ b: 2 });
    });
  });

  describe('applyUserSettingsUpdate', () => {
    it('overlays incoming keys onto the current snapshot', () => {
      expect(applyUserSettingsUpdate({ viewMode: 'grid', sortBy: 'CloseDate' }, { sortBy: 'Name' }))
        .toEqual({ viewMode: 'grid', sortBy: 'Name' });
    });

    it('preserves untouched keys when a component passes only a delta', () => {
      // The AI-forgot-the-spread case: a delta must not wipe other preferences.
      expect(applyUserSettingsUpdate({ viewMode: 'grid', page: 3 }, { sortBy: 'Name' }))
        .toEqual({ viewMode: 'grid', page: 3, sortBy: 'Name' });
    });

    it('survives the stale-prop spread (two sequential saves keep both changes)', () => {
      // Component spreads the mount-time prop both times; the host snapshot
      // must still accumulate both changes.
      const mountProp = { viewMode: 'grid' };
      let snapshot = applyUserSettingsUpdate(mountProp, { ...mountProp, sortBy: 'Name' });
      snapshot = applyUserSettingsUpdate(snapshot, { ...mountProp, viewMode: 'list' });
      expect(snapshot).toEqual({ viewMode: 'list', sortBy: 'Name' });
    });

    it('removes a key when its incoming value is explicitly null', () => {
      expect(applyUserSettingsUpdate({ sortBy: 'Name', viewMode: 'grid' }, { sortBy: null }))
        .toEqual({ viewMode: 'grid' });
    });

    it('removes a key when its incoming value is undefined', () => {
      expect(applyUserSettingsUpdate({ sortBy: 'Name', viewMode: 'grid' }, { sortBy: undefined }))
        .toEqual({ viewMode: 'grid' });
    });

    it('treats a full-object payload as a superset (replace-equivalent)', () => {
      expect(applyUserSettingsUpdate({ a: 1, b: 2 }, { a: 10, b: 20 })).toEqual({ a: 10, b: 20 });
    });

    it('handles null/undefined on either side', () => {
      expect(applyUserSettingsUpdate(null, { x: 1 })).toEqual({ x: 1 });
      expect(applyUserSettingsUpdate({ x: 1 }, null)).toEqual({ x: 1 });
      expect(applyUserSettingsUpdate(null, null)).toEqual({});
    });

    it('returns a new object (does not mutate inputs)', () => {
      const current = { a: 1 };
      const incoming = { b: 2 };
      const next = applyUserSettingsUpdate(current, incoming);
      expect(next).not.toBe(current);
      expect(next).not.toBe(incoming);
      expect(current).toEqual({ a: 1 });
      expect(incoming).toEqual({ b: 2 });
    });
  });
});

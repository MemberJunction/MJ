import { describe, it, expect } from 'vitest';
import {
  USER_STATE_KEY_PREFIX,
  ResolveUserStateScope,
  UserStateStorageKey,
  ParseStoredUserSettings,
  MergeUserSettings,
  ApplyUserSettingsUpdate
} from '../utilities/user-state';

describe('user-state helpers', () => {
  describe('resolveUserStateScope', () => {
    it('prefers an explicit scope over namespace/name', () => {
      expect(ResolveUserStateScope('Form/Contacts', 'crm', 'ContactForm')).toBe('form/contacts');
    });

    it('lowercases the explicit scope', () => {
      expect(ResolveUserStateScope('MyDashboard', null, null)).toBe('mydashboard');
    });

    it('trims surrounding whitespace from the explicit scope', () => {
      expect(ResolveUserStateScope('  Spaced  ', null, null)).toBe('spaced');
    });

    it('combines namespace and name when no explicit scope is given', () => {
      expect(ResolveUserStateScope(undefined, 'CRM/Analytics', 'AccountDashboard'))
        .toBe('crm/analytics/accountdashboard');
    });

    it('uses just the name when there is no namespace', () => {
      expect(ResolveUserStateScope(undefined, undefined, 'SalesReport')).toBe('salesreport');
      expect(ResolveUserStateScope(null, '   ', 'SalesReport')).toBe('salesreport');
    });

    it('returns null when no stable scope can be derived', () => {
      expect(ResolveUserStateScope(undefined, undefined, undefined)).toBeNull();
      expect(ResolveUserStateScope('', '', '')).toBeNull();
      expect(ResolveUserStateScope('   ', 'crm', '   ')).toBeNull();
    });
  });

  describe('userStateStorageKey', () => {
    it('prefixes a resolved scope with the unique root namespace', () => {
      expect(UserStateStorageKey('form/contacts')).toBe(`${USER_STATE_KEY_PREFIX}form/contacts`);
      expect(UserStateStorageKey('form/contacts')).toBe('InteractiveComponents_UserState_Root/form/contacts');
    });

    it('returns null for a null scope', () => {
      expect(UserStateStorageKey(null)).toBeNull();
    });
  });

  describe('parseStoredUserSettings', () => {
    it('parses a valid JSON object', () => {
      expect(ParseStoredUserSettings('{"sortBy":"Name","page":2}')).toEqual({ sortBy: 'Name', page: 2 });
    });

    it('returns an empty object for null/undefined/empty input', () => {
      expect(ParseStoredUserSettings(null)).toEqual({});
      expect(ParseStoredUserSettings(undefined)).toEqual({});
      expect(ParseStoredUserSettings('')).toEqual({});
    });

    it('returns an empty object for invalid JSON instead of throwing', () => {
      expect(ParseStoredUserSettings('{not valid json')).toEqual({});
    });

    it('returns an empty object for non-object JSON (arrays, primitives)', () => {
      expect(ParseStoredUserSettings('[1,2,3]')).toEqual({});
      expect(ParseStoredUserSettings('42')).toEqual({});
      expect(ParseStoredUserSettings('"hello"')).toEqual({});
      expect(ParseStoredUserSettings('null')).toEqual({});
    });
  });

  describe('mergeUserSettings', () => {
    it('lets stored values win over host defaults', () => {
      const merged = MergeUserSettings({ sortBy: 'CloseDate', viewMode: 'grid' }, { sortBy: 'Name' });
      expect(merged).toEqual({ sortBy: 'Name', viewMode: 'grid' });
    });

    it('keeps host defaults that the stored settings do not override', () => {
      expect(MergeUserSettings({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
    });

    it('handles null/undefined on either side', () => {
      expect(MergeUserSettings(null, { x: 1 })).toEqual({ x: 1 });
      expect(MergeUserSettings({ x: 1 }, null)).toEqual({ x: 1 });
      expect(MergeUserSettings(null, null)).toEqual({});
      expect(MergeUserSettings(undefined, undefined)).toEqual({});
    });

    it('returns a new object (does not mutate inputs)', () => {
      const defaults = { a: 1 };
      const stored = { b: 2 };
      const merged = MergeUserSettings(defaults, stored);
      expect(merged).not.toBe(defaults);
      expect(merged).not.toBe(stored);
      expect(defaults).toEqual({ a: 1 });
      expect(stored).toEqual({ b: 2 });
    });
  });

  describe('applyUserSettingsUpdate', () => {
    it('overlays incoming keys onto the current snapshot', () => {
      expect(ApplyUserSettingsUpdate({ viewMode: 'grid', sortBy: 'CloseDate' }, { sortBy: 'Name' }))
        .toEqual({ viewMode: 'grid', sortBy: 'Name' });
    });

    it('preserves untouched keys when a component passes only a delta', () => {
      // The AI-forgot-the-spread case: a delta must not wipe other preferences.
      expect(ApplyUserSettingsUpdate({ viewMode: 'grid', page: 3 }, { sortBy: 'Name' }))
        .toEqual({ viewMode: 'grid', page: 3, sortBy: 'Name' });
    });

    it('survives the stale-prop spread (two sequential saves keep both changes)', () => {
      // Component spreads the mount-time prop both times; the host snapshot
      // must still accumulate both changes.
      const mountProp = { viewMode: 'grid' };
      let snapshot = ApplyUserSettingsUpdate(mountProp, { ...mountProp, sortBy: 'Name' });
      snapshot = ApplyUserSettingsUpdate(snapshot, { ...mountProp, viewMode: 'list' });
      expect(snapshot).toEqual({ viewMode: 'list', sortBy: 'Name' });
    });

    it('removes a key when its incoming value is explicitly null', () => {
      expect(ApplyUserSettingsUpdate({ sortBy: 'Name', viewMode: 'grid' }, { sortBy: null }))
        .toEqual({ viewMode: 'grid' });
    });

    it('removes a key when its incoming value is undefined', () => {
      expect(ApplyUserSettingsUpdate({ sortBy: 'Name', viewMode: 'grid' }, { sortBy: undefined }))
        .toEqual({ viewMode: 'grid' });
    });

    it('treats a full-object payload as a superset (replace-equivalent)', () => {
      expect(ApplyUserSettingsUpdate({ a: 1, b: 2 }, { a: 10, b: 20 })).toEqual({ a: 10, b: 20 });
    });

    it('handles null/undefined on either side', () => {
      expect(ApplyUserSettingsUpdate(null, { x: 1 })).toEqual({ x: 1 });
      expect(ApplyUserSettingsUpdate({ x: 1 }, null)).toEqual({ x: 1 });
      expect(ApplyUserSettingsUpdate(null, null)).toEqual({});
    });

    it('returns a new object (does not mutate inputs)', () => {
      const current = { a: 1 };
      const incoming = { b: 2 };
      const next = ApplyUserSettingsUpdate(current, incoming);
      expect(next).not.toBe(current);
      expect(next).not.toBe(incoming);
      expect(current).toEqual({ a: 1 });
      expect(incoming).toEqual({ b: 2 });
    });
  });
});

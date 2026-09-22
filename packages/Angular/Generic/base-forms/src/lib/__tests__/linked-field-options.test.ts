/**
 * Tests for the per-dropdown user preference store, focused on recent picks — the one entry
 * the field writes on the user's behalf rather than at their explicit request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = vi.hoisted(() => ({ backing: new Map<string, string>() }));

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    Instance: {
      GetSetting: (key: string) => settings.backing.get(key),
      SetSettingDebounced: (key: string, value: string) => {
        settings.backing.set(key, value);
      },
    },
  },
}));

import { LinkedFieldOptionsStore } from '../field/linked-field-options';

describe('LinkedFieldOptionsStore recent picks', () => {
  beforeEach(() => settings.backing.clear());

  it('keeps the newest first, de-duplicated case-insensitively, capped at max', () => {
    const store = LinkedFieldOptionsStore.Instance;
    for (const pk of ['a', 'b', 'A', 'c', 'd']) {
      store.PushRecentPick('Orders', 'BillToOrganizationID', pk, 3);
    }
    expect(store.RecentPicks('Orders', 'BillToOrganizationID')).toEqual(['d', 'c', 'A']);
  });

  it('is keyed per host entity and field', () => {
    const store = LinkedFieldOptionsStore.Instance;
    store.PushRecentPick('Orders', 'BillToOrganizationID', 'a');
    expect(store.RecentPicks('Orders', 'ShipToOrganizationID')).toEqual([]);
    expect(store.RecentPicks('Contracts', 'BillToOrganizationID')).toEqual([]);
  });

  it('ignores a blank pick rather than storing an empty key', () => {
    const store = LinkedFieldOptionsStore.Instance;
    store.PushRecentPick('Orders', 'BillToOrganizationID', '   ');
    expect(store.RecentPicks('Orders', 'BillToOrganizationID')).toEqual([]);
  });

  it('returns a copy, so a caller cannot mutate the stored list', () => {
    const store = LinkedFieldOptionsStore.Instance;
    store.PushRecentPick('Orders', 'BillToOrganizationID', 'a');
    store.RecentPicks('Orders', 'BillToOrganizationID').push('b');
    expect(store.RecentPicks('Orders', 'BillToOrganizationID')).toEqual(['a']);
  });

  it('leaves the other preferences on the same field alone', () => {
    const store = LinkedFieldOptionsStore.Instance;
    store.SetSort('Orders', 'BillToOrganizationID', 'Name', 'asc');
    store.PushRecentPick('Orders', 'BillToOrganizationID', 'a');
    expect(store.Get('Orders', 'BillToOrganizationID')).toMatchObject({
      sortField: 'Name',
      sortDir: 'asc',
      recentPicks: ['a'],
    });
  });
});

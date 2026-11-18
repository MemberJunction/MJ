import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
}));

import {
  DEFAULT_EXTENSION_NAV_ITEM_SEQUENCE,
  IsNavItemSettingName,
  MergeNavItemExtensions,
  ParseNavItemSetting,
} from '../nav-item-extensions';
import type { NavItem } from '../interfaces/nav-item.interface';

const appItems: NavItem[] = [
  { Label: 'Overview', ResourceType: 'Custom', DriverClass: 'OverviewResource', isDefault: true },
  { Label: 'Approvals', ResourceType: 'Custom', DriverClass: 'ApprovalsResource' },
  { Label: 'Governance', ResourceType: 'Custom', DriverClass: 'GovernanceResource' },
];

function setting(name: string, item: Partial<NavItem> | string) {
  return { Name: name, Value: typeof item === 'string' ? item : JSON.stringify(item) };
}

describe('IsNavItemSettingName', () => {
  it('accepts NavItem.<key> and rejects other names', () => {
    expect(IsNavItemSettingName('NavItem.tasks.priorities')).toBe(true);
    expect(IsNavItemSettingName('NavItem.')).toBe(false);
    expect(IsNavItemSettingName('navitem.tasks')).toBe(false);
    expect(IsNavItemSettingName('feature.flag')).toBe(false);
    expect(IsNavItemSettingName(null)).toBe(false);
  });
});

describe('ParseNavItemSetting', () => {
  it('parses a nav item and drops isDefault', () => {
    const item = ParseNavItemSetting(setting('NavItem.x', { Label: 'X', ResourceType: 'Custom', DriverClass: 'XResource', isDefault: true }));
    expect(item).toEqual({ Label: 'X', ResourceType: 'Custom', DriverClass: 'XResource' });
  });

  it('accepts a Route instead of a ResourceType', () => {
    expect(ParseNavItemSetting(setting('NavItem.x', { Label: 'X', Route: '/x' }))?.Route).toBe('/x');
  });

  it('rejects invalid JSON, non-objects, a missing Label and a missing target', () => {
    expect(ParseNavItemSetting(setting('NavItem.x', '{not json'))).toBeNull();
    expect(ParseNavItemSetting(setting('NavItem.x', '[1,2]'))).toBeNull();
    expect(ParseNavItemSetting(setting('NavItem.x', { ResourceType: 'Custom' }))).toBeNull();
    expect(ParseNavItemSetting(setting('NavItem.x', { Label: '  ', ResourceType: 'Custom' }))).toBeNull();
    expect(ParseNavItemSetting(setting('NavItem.x', { Label: 'X' }))).toBeNull();
  });
});

describe('MergeNavItemExtensions', () => {
  it('returns the application items unchanged without extensions', () => {
    expect(MergeNavItemExtensions(appItems, []).map((i) => i.Label)).toEqual(['Overview', 'Approvals', 'Governance']);
  });

  it('places an extension by its Sequence among the application items', () => {
    const merged = MergeNavItemExtensions(appItems, [
      setting('NavItem.tasks.priorities', { Label: 'Priorities', ResourceType: 'Custom', Sequence: 15 }),
    ]);
    expect(merged.map((i) => i.Label)).toEqual(['Overview', 'Priorities', 'Approvals', 'Governance']);
  });

  it(`appends extensions without a Sequence (default ${DEFAULT_EXTENSION_NAV_ITEM_SEQUENCE}) ordered by setting name`, () => {
    const merged = MergeNavItemExtensions(appItems, [
      setting('NavItem.b', { Label: 'Bravo', ResourceType: 'Custom' }),
      setting('NavItem.a', { Label: 'Alpha', ResourceType: 'Custom' }),
    ]);
    expect(merged.map((i) => i.Label)).toEqual(['Overview', 'Approvals', 'Governance', 'Alpha', 'Bravo']);
  });

  it('keeps the application item first on a Sequence tie', () => {
    const merged = MergeNavItemExtensions(appItems, [
      setting('NavItem.tie', { Label: 'Tie', ResourceType: 'Custom', Sequence: 20 }),
    ]);
    expect(merged.map((i) => i.Label)).toEqual(['Overview', 'Approvals', 'Tie', 'Governance']);
  });

  it('honors an explicit Sequence on application items', () => {
    const merged = MergeNavItemExtensions(
      [{ Label: 'Late', ResourceType: 'Custom', Sequence: 500 }, { Label: 'Early', ResourceType: 'Custom' }],
      [setting('NavItem.mid', { Label: 'Mid', ResourceType: 'Custom', Sequence: 100 })],
    );
    expect(merged.map((i) => i.Label)).toEqual(['Early', 'Mid', 'Late']);
  });

  it('skips an extension whose Label is already present, invalid values and other setting names', () => {
    const merged = MergeNavItemExtensions(appItems, [
      setting('NavItem.dupe', { Label: 'Overview', ResourceType: 'Custom' }),
      setting('NavItem.dupe2', { Label: 'Extra', ResourceType: 'Custom' }),
      setting('NavItem.dupe3', { Label: 'Extra', ResourceType: 'Custom' }),
      setting('NavItem.bad', '{oops'),
      setting('feature.flag', { Label: 'Not a nav item', ResourceType: 'Custom' }),
    ]);
    expect(merged.map((i) => i.Label)).toEqual(['Overview', 'Approvals', 'Governance', 'Extra']);
  });

  it('never makes an extension the default item', () => {
    const merged = MergeNavItemExtensions(appItems, [
      setting('NavItem.first', { Label: 'First', ResourceType: 'Custom', Sequence: 1, isDefault: true }),
    ]);
    expect(merged[0].Label).toBe('First');
    expect(merged[0].isDefault).toBeUndefined();
    expect(merged.filter((i) => i.isDefault).map((i) => i.Label)).toEqual(['Overview']);
  });
});

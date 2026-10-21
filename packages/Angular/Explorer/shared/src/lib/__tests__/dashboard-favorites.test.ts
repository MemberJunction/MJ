// The helpers import @memberjunction/ng-shared-generic, a partial-compiled Angular library.
// Load the JIT compiler first (same convention as the other node-env Angular suites).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { IsDashboardEntity, DashboardFavoriteIds } from '../dashboard-favorites';

describe('dashboard favorites helpers', () => {
  it('recognizes the dashboards entity with or without prefix', () => {
    expect(IsDashboardEntity('MJ: Dashboards')).toBe(true);
    expect(IsDashboardEntity('Dashboards')).toBe(true);
    expect(IsDashboardEntity('Accounts')).toBe(false);
    expect(IsDashboardEntity(undefined)).toBe(false);
    expect(IsDashboardEntity(null)).toBe(false);
  });

  it('returns only dashboard record ids, in the order given', () => {
    const favorites = [
      { Entity: 'MJ: Dashboards', RecordID: 'd1' },
      { Entity: 'Accounts', RecordID: 'a1' },
      { Entity: 'Dashboards', RecordID: 'd2' },
    ];
    expect(DashboardFavoriteIds(favorites)).toEqual(['d1', 'd2']);
  });

  it('lists each dashboard once, keeping the first occurrence', () => {
    const favorites = [
      { Entity: 'MJ: Dashboards', RecordID: 'd1' },
      { Entity: 'MJ: Dashboards', RecordID: 'd2' },
      { Entity: 'MJ: Dashboards', RecordID: 'D1' },
    ];
    expect(DashboardFavoriteIds(favorites)).toEqual(['d1', 'd2']);
  });
});

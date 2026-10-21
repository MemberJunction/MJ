import { describe, it, expect } from 'vitest';
import type { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { DashboardCategoryPath, FormatDashboardDate, IsDashboardNotSetUp } from './dashboard-card.helpers';

/** A dashboard with the type and saved configuration given. The entity types UIConfigDetails as a string; the helper also takes null. */
const dashboard = (Type: MJDashboardEntity['Type'], UIConfigDetails: string | null) =>
  ({ Type, UIConfigDetails }) as unknown as Pick<MJDashboardEntity, 'Type' | 'UIConfigDetails'>;

/** A saved configuration with one panel. */
const ONE_PANEL = JSON.stringify({
  layout: { root: { type: 'stack', content: [{ type: 'component', title: 'Pipeline', componentState: { title: 'Pipeline' } }] } },
  settings: {},
});

describe('IsDashboardNotSetUp', () => {
  it.each([
    ['no configuration', null],
    ['an empty configuration', ''],
    ['an empty object', '{}'],
    ['a null layout (what a new dashboard saves)', JSON.stringify({ layout: null, settings: { theme: 'light' } })],
    ['the legacy tile format', '{"columns":4,"rowHeight":150,"resizable":true,"reorderable":true,"items":[]}'],
    ['a layout with no panels', JSON.stringify({ layout: { root: { type: 'row', content: [] } }, settings: {} })],
    ['invalid JSON', '{"layout":'],
  ])('is true for a Config dashboard with %s', (_label, details) => {
    expect(IsDashboardNotSetUp(dashboard('Config', details))).toBe(true);
  });

  it('is false for a Config dashboard with a panel', () => {
    expect(IsDashboardNotSetUp(dashboard('Config', ONE_PANEL))).toBe(false);
  });

  it.each(['Code', 'Dynamic Code'] as const)('is false for a %s dashboard, whatever its configuration', type => {
    expect(IsDashboardNotSetUp(dashboard(type, '{}'))).toBe(false);
    expect(IsDashboardNotSetUp(dashboard(type, null))).toBe(false);
  });
});

describe('FormatDashboardDate', () => {
  const NOW = new Date('2026-10-06T15:00:00');
  const hoursBefore = (hours: number): Date => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

  it('reads "Today" for a time less than a day ago', () => {
    expect(FormatDashboardDate(hoursBefore(5), NOW)).toBe('Today');
  });

  it('reads "Yesterday" for a time one day ago', () => {
    expect(FormatDashboardDate(hoursBefore(30), NOW)).toBe('Yesterday');
  });

  it('counts the days under a week', () => {
    expect(FormatDashboardDate(hoursBefore(3 * 24 + 2), NOW)).toBe('3 days ago');
    expect(FormatDashboardDate(hoursBefore(6 * 24 + 23), NOW)).toBe('6 days ago');
  });

  it('shows the local date for a week ago or earlier', () => {
    const weekAgo = hoursBefore(7 * 24);
    expect(FormatDashboardDate(weekAgo, NOW)).toBe(weekAgo.toLocaleDateString());
  });

  it('reads "Today" for a time a little after now, as when the server clock is ahead', () => {
    expect(FormatDashboardDate(new Date(NOW.getTime() + 90 * 1000), NOW)).toBe('Today');
  });

  it('is empty for no date', () => {
    expect(FormatDashboardDate(null, NOW)).toBe('');
    expect(FormatDashboardDate(undefined, NOW)).toBe('');
  });
});

describe('DashboardCategoryPath', () => {
  const c = (ID: string, Name: string, ParentID: string | null) => ({ ID, Name, ParentID }) as unknown as MJDashboardCategoryEntity;
  const CATS = [c('pipe', 'Pipeline', 'SALES'), c('sales', 'Sales', null), c('ops', 'Operations', null)];

  it('joins the names from the top category down', () => {
    expect(DashboardCategoryPath('PIPE', CATS)).toBe('Sales › Pipeline');
    expect(DashboardCategoryPath('ops', CATS)).toBe('Operations');
  });

  it('returns null for no category or a category that is not in the list', () => {
    expect(DashboardCategoryPath(null, CATS)).toBeNull();
    expect(DashboardCategoryPath('', CATS)).toBeNull();
    expect(DashboardCategoryPath('unknown', CATS)).toBeNull();
  });

  it('stops at a category it has already visited', () => {
    const loop = [c('x', 'X', 'y'), c('y', 'Y', 'x')];
    expect(DashboardCategoryPath('x', loop)).toBe('Y › X');
  });
});

import { describe, it, expect } from 'vitest';
import { CanOpenInDashboardTab, DashboardMatchSplit, MatchDashboards, SplitDashboardMatches } from './omnibar-dashboard-matches';

const d = (ID: string, Name: string, Description = '', Category: string | null = null) => ({ ID, Name, Description, Category, User: 'Ana' });

describe('MatchDashboards', () => {
  const all = [d('1', 'Sales pipeline', 'Open opportunities', 'Sales'), d('2', 'Ops health', 'Queue depth'), d('3', 'Pipeline forecast', '', 'Sales'), d('4', 'AR aging', 'Receivables by pipe stage')];

  it('matches name, description and category, case-insensitively', () => {
    expect(MatchDashboards(all, 'PIPE', 10).map(x => x.ID)).toEqual(['3', '1', '4']);
    expect(MatchDashboards(all, 'sales', 10).map(x => x.ID)).toEqual(['1', '3']);
  });

  it('lists an exact name first, even after three longer names that contain it, and caps the result', () => {
    const sales = [d('1', 'Sales pipeline'), d('2', 'Sales by region'), d('3', 'Sales forecast'), d('4', 'Sales')];
    expect(MatchDashboards(sales, 'Sales', 3).map(x => x.ID)).toEqual(['4', '1', '2']);
    expect(MatchDashboards(sales, '  sALES ', 3).map(x => x.ID)).toEqual(['4', '1', '2']);
  });

  it('ranks exact name, then name prefix, then name contains, then description or category, in input order within a rank', () => {
    const mixed = [
      d('1', 'AR aging', 'Receivables from sales'),
      d('2', 'Ops health', '', 'Sales'),
      d('3', 'Q3 sales review'),
      d('4', 'Sales pipeline'),
      d('5', 'Regional sales'),
      d('6', 'Sales'),
    ];
    expect(MatchDashboards(mixed, 'sales', 10).map(x => x.ID)).toEqual(['6', '4', '3', '5', '1', '2']);
  });

  it('returns nothing for a blank query', () => {
    expect(MatchDashboards(all, '  ', 10)).toEqual([]);
  });

  it('accepts a null description', () => {
    const noDescription = [{ ID: '5', Name: 'Churn watch', Description: null, Category: null, User: 'Bo' }];
    expect(MatchDashboards(noDescription, 'churn', 10).map(x => x.ID)).toEqual(['5']);
    expect(MatchDashboards(noDescription, 'renewal', 10)).toEqual([]);
  });
});

describe('SplitDashboardMatches', () => {
  const ids = (split: DashboardMatchSplit<{ ID: string }>) => ({
    name: split.NameMatches.map((x) => x.ID),
    other: split.DescriptionOrCategoryMatches.map((x) => x.ID),
  });

  it('keeps exact, prefix and contains name matches apart from description or category matches, best first', () => {
    const mixed = [
      d('1', 'AR aging', 'Receivables from sales'),
      d('2', 'Ops health', '', 'Sales'),
      d('3', 'Q3 sales review'),
      d('4', 'Sales pipeline'),
      d('5', 'Regional sales'),
      d('6', 'Sales'),
    ];
    expect(ids(SplitDashboardMatches(mixed, 'sales', 10))).toEqual({ name: ['6', '4', '3', '5'], other: ['1', '2'] });
  });

  it('puts a dashboard that matches only by description in the second list', () => {
    const boards = [d('rb', 'Revenue Board', 'Weekly sales numbers by team'), d('ops', 'Ops health')];
    expect(ids(SplitDashboardMatches(boards, 'weekly', 3))).toEqual({ name: [], other: ['rb'] });
  });

  it('shares the cap between the two lists and fills it with name matches first', () => {
    const detail = [d('x1', 'Revenue', 'Weekly one'), d('x2', 'Margins', '', 'Weekly reviews'), d('x3', 'Churn', 'Weekly three')];
    const twoNames = [...detail, d('n1', 'Weekly KPIs'), d('n2', 'Ops weekly')];
    const fourNames = [...twoNames, d('n3', 'Weekly'), d('n4', 'Weekly ops')];

    expect(ids(SplitDashboardMatches(twoNames, 'weekly', 3))).toEqual({ name: ['n1', 'n2'], other: ['x1'] });
    expect(ids(SplitDashboardMatches(fourNames, 'weekly', 3))).toEqual({ name: ['n3', 'n1', 'n4'], other: [] });
    expect(ids(SplitDashboardMatches(detail, 'weekly', 3))).toEqual({ name: [], other: ['x1', 'x2', 'x3'] });
  });

  it('returns two empty lists for a blank query', () => {
    expect(ids(SplitDashboardMatches([d('1', 'Sales')], '  ', 3))).toEqual({ name: [], other: [] });
  });
});

describe('CanOpenInDashboardTab', () => {
  it('accepts Config dashboards and Code dashboards that name a driver class', () => {
    expect(CanOpenInDashboardTab({ Type: 'Config', DriverClass: null })).toBe(true);
    expect(CanOpenInDashboardTab({ Type: 'Code', DriverClass: 'EntityAdmin' })).toBe(true);
  });

  it('rejects Code dashboards without a driver class and Dynamic Code dashboards', () => {
    expect(CanOpenInDashboardTab({ Type: 'Code', DriverClass: null })).toBe(false);
    expect(CanOpenInDashboardTab({ Type: 'Code', DriverClass: '' })).toBe(false);
    expect(CanOpenInDashboardTab({ Type: 'Dynamic Code', DriverClass: null })).toBe(false);
  });
});

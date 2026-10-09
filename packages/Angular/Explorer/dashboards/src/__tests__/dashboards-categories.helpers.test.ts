import { describe, it, expect } from 'vitest';
import type { MJDashboardCategoryEntity, MJDashboardCategoryLinkEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import {
  BuildCategoryRows,
  BuildEffectiveCategoryMap,
  CategoryRow,
  CategoryRowSummary,
} from '../DashboardBrowser/dashboards-categories.helpers';

const ME = 'user-me';
const ANA = 'user-ana';

const cat = (ID: string, Name: string, ParentID: string | null, UserID = ME) =>
  ({ ID, Name, ParentID, UserID }) as unknown as MJDashboardCategoryEntity;
const dash = (ID: string, UserID: string, CategoryID: string | null, Type = 'Config') =>
  ({ ID, Name: ID, UserID, CategoryID, Type }) as unknown as MJDashboardEntity;
const link = (DashboardID: string, UserID: string, DashboardCategoryID: string | null) =>
  ({ DashboardID, UserID, DashboardCategoryID }) as unknown as MJDashboardCategoryLinkEntity;

const CATEGORIES = [
  cat('sales', 'Sales', null),
  cat('pipeline', 'Pipeline', 'SALES'),
  cat('ops', 'Ops', null),
  cat('archive', 'Archive', null),
  cat('linked', 'Linked', null),
  cat('orphan', 'Orphan', 'gone'),
  cat('ana-shared', 'Shared by Ana', null, ANA),
];

const DASHBOARDS = [
  dash('revenue', ME, 'sales'),
  dash('pipeline-health', ME, 'pipeline'),
  dash('code-thing', ME, 'archive', 'Code'),
  // Ana's dashboard, filed by the user under Linked.
  dash('partner-kpis', ANA, 'ana-folder'),
  // Ana's dashboard in the user's Ops folder, not filed by the user: Browse shows it at the root.
  dash('board-pack', ANA, 'ops'),
];

const LINKS = [link('partner-kpis', ME, 'linked'), link('board-pack', ANA, 'ana-folder')];

function rows(): CategoryRow[] {
  const effective = BuildEffectiveCategoryMap(DASHBOARDS, LINKS, ME);
  return BuildCategoryRows(CATEGORIES, DASHBOARDS, effective, ME);
}

const rowFor = (name: string): CategoryRow => {
  const found = rows().find(r => r.Category.Name === name);
  if (!found) throw new Error(`No row for ${name}`);
  return found;
};

describe('BuildEffectiveCategoryMap', () => {
  it('maps each shared dashboard to the category the user filed it in, or null, and skips owned dashboards', () => {
    const map = BuildEffectiveCategoryMap(DASHBOARDS, LINKS, ME);
    expect([...map.entries()]).toEqual([
      ['partner-kpis', 'linked'],
      ['board-pack', null],
    ]);
  });

  it('compares user and dashboard ids in any letter case', () => {
    const map = BuildEffectiveCategoryMap([dash('D-1', 'ANA-1', null)], [link('d-1', 'USER-ME', 'c-1')], 'user-me');
    expect(map.get('D-1')).toBe('c-1');
  });
});

describe('BuildCategoryRows', () => {
  it('lists the tree depth first, each level by name, with orphans at the top level', () => {
    expect(rows().map(r => `${'  '.repeat(r.Depth)}${r.Category.Name}`)).toEqual([
      'Archive',
      'Linked',
      'Ops',
      'Orphan',
      'Sales',
      '  Pipeline',
      'Shared by Ana',
    ]);
  });

  it('counts the Config dashboards Browse shows in each category, including shared ones the user filed there', () => {
    expect(rows().map(r => `${r.Category.Name}:${r.DashboardCount}`)).toEqual([
      'Archive:0',
      'Linked:1',
      'Ops:0',
      'Orphan:0',
      'Sales:1',
      'Pipeline:1',
      'Shared by Ana:0',
    ]);
  });

  it('counts direct sub-categories', () => {
    expect(rowFor('Sales').SubCategoryCount).toBe(1);
    expect(rowFor('Pipeline').SubCategoryCount).toBe(0);
  });

  it('allows deleting only an owned category with no sub-categories and no dashboards of any type', () => {
    expect(rows().filter(r => r.CanDelete).map(r => r.Category.Name)).toEqual(['Orphan']);
    // Archive holds a Code dashboard; Ops holds a dashboard it does not show; Shared by Ana is not the user's.
    expect(rowFor('Archive').CanDelete).toBe(false);
    expect(rowFor('Ops').CanDelete).toBe(false);
    expect(rowFor('Shared by Ana').CanDelete).toBe(false);
  });

  it('skips categories that only reach each other through their parents', () => {
    const loop = [cat('x', 'X', 'y'), cat('y', 'Y', 'x'), cat('top', 'Top', null)];
    expect(BuildCategoryRows(loop, [], new Map(), ME).map(r => r.Category.Name)).toEqual(['Top']);
  });
});

describe('CategoryRowSummary', () => {
  const row = (DashboardCount: number, SubCategoryCount: number) => ({ DashboardCount, SubCategoryCount }) as CategoryRow;

  it('counts dashboards and sub-categories in words', () => {
    expect(CategoryRowSummary(row(0, 0))).toBe('0 dashboards');
    expect(CategoryRowSummary(row(1, 0))).toBe('1 dashboard');
    expect(CategoryRowSummary(row(2, 1))).toBe('2 dashboards · 1 sub-category');
    expect(CategoryRowSummary(row(1, 3))).toBe('1 dashboard · 3 sub-categories');
  });
});

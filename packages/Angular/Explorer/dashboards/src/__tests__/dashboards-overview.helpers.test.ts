import { describe, it, expect } from 'vitest';
import type { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { CategoryPath, ContinueDashboards, FavoriteDashboards, NewestFirst, SharedWithMe } from '../DashboardBrowser/dashboards-overview.helpers';

const d = (ID: string, UserID: string) => ({ ID, UserID, Name: ID } as unknown as MJDashboardEntity);
const ALL = [d('a', 'me'), d('b', 'ana'), d('c', 'me'), d('s', 'system')];

describe('ContinueDashboards', () => {
  it('returns recent dashboards in recents order, capped', () => {
    expect(ContinueDashboards(ALL, ['c', 'zzz', 'a', 'b'], 2).map(x => x.ID)).toEqual(['c', 'a']);
  });

  it('matches ids in any letter case and lists each dashboard once', () => {
    const upper = [d('AAAA-1', 'me'), d('bbbb-2', 'me')];
    expect(ContinueDashboards(upper, ['aaaa-1', 'AAAA-1', 'BBBB-2'], 5).map(x => x.ID)).toEqual(['AAAA-1', 'bbbb-2']);
  });

  it('returns nothing for a max of 0', () => {
    expect(ContinueDashboards(ALL, ['a', 'b'], 0)).toEqual([]);
  });
});

describe('SharedWithMe', () => {
  it('returns dashboards the user does not own', () => {
    expect(SharedWithMe(ALL, 'me').map(x => x.ID)).toEqual(['b', 's']);
  });

  it('compares the owner id in any letter case', () => {
    expect(SharedWithMe([d('a', 'ME-1'), d('b', 'ana')], 'me-1').map(x => x.ID)).toEqual(['b']);
  });
});

describe('FavoriteDashboards', () => {
  it('returns the favorites in favorites order, skipping ids that are not in the list', () => {
    expect(FavoriteDashboards(ALL, ['s', 'gone', 'a']).map(x => x.ID)).toEqual(['s', 'a']);
  });
});

describe('NewestFirst', () => {
  const at = (ID: string, updated: string) => ({ ID, __mj_UpdatedAt: new Date(updated) } as unknown as MJDashboardEntity);

  it('sorts by last update, newest first, without changing the input', () => {
    const input = [at('old', '2026-01-01'), at('new', '2026-03-01'), at('mid', '2026-02-01')];
    expect(NewestFirst(input).map(x => x.ID)).toEqual(['new', 'mid', 'old']);
    expect(input.map(x => x.ID)).toEqual(['old', 'new', 'mid']);
  });
});

describe('CategoryPath', () => {
  const c = (ID: string, Name: string, ParentID: string | null) => ({ ID, Name, ParentID } as unknown as MJDashboardCategoryEntity);
  const CATS = [c('pipe', 'Pipeline', 'SALES'), c('sales', 'Sales', null), c('ops', 'Operations', null)];

  it('joins the names from the top category down', () => {
    expect(CategoryPath('PIPE', CATS)).toBe('Sales › Pipeline');
    expect(CategoryPath('ops', CATS)).toBe('Operations');
  });

  it('returns null for no category or a category that is not in the list', () => {
    expect(CategoryPath(null, CATS)).toBeNull();
    expect(CategoryPath('unknown', CATS)).toBeNull();
  });

  it('stops at a category it has already visited', () => {
    const loop = [c('x', 'X', 'y'), c('y', 'Y', 'x')];
    expect(CategoryPath('x', loop)).toBe('Y › X');
  });
});

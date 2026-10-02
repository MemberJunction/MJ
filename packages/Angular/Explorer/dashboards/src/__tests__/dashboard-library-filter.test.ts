import { describe, it, expect } from 'vitest';
import type { MJDashboardEntity, MJDashboardCategoryEntity } from '@memberjunction/core-entities';
import {
  FilterDashboardsForLibrary,
  BrowseLocation,
  BuildLibraryRailSections,
  CountLibraryDashboards,
  CountDashboardsByCategory,
  DASHBOARD_LIBRARY_FILTERS,
  DashboardLibraryFilter,
  EffectiveCategoryId,
  IsBrowsableDashboard,
  IsDashboardLibraryFilter,
  LibraryFilterContext,
  LocationQueryParams,
  ParseLibraryFilter,
  ParseRailItemId,
  RailActiveItemId,
  ResolveBrowseLocation,
  SameBrowseLocation,
  ToggleExpandedId,
  WithExpandedAncestors,
} from '../DashboardBrowser/dashboard-library-filter';

const d = (ID: string, UserID: string) => ({ ID, UserID, Name: ID, Type: 'Config', CategoryID: null } as unknown as MJDashboardEntity);
const DASH = [d('a', 'me'), d('b', 'ana'), d('c', 'me')];
const CTX: LibraryFilterContext = { CurrentUserId: 'me', FavoriteIds: ['b'], RecentIds: ['c', 'a'] };

describe('FilterDashboardsForLibrary', () => {
  it('all returns everything', () => {
    expect(FilterDashboardsForLibrary(DASH, 'all', CTX).map(x => x.ID)).toEqual(['a', 'b', 'c']);
  });
  it('mine keeps dashboards the user owns', () => {
    expect(FilterDashboardsForLibrary(DASH, 'mine', CTX).map(x => x.ID)).toEqual(['a', 'c']);
  });
  it('shared keeps dashboards owned by others', () => {
    expect(FilterDashboardsForLibrary(DASH, 'shared', CTX).map(x => x.ID)).toEqual(['b']);
  });
  it('favorites keeps favorite ids', () => {
    expect(FilterDashboardsForLibrary(DASH, 'favorites', CTX).map(x => x.ID)).toEqual(['b']);
  });
  it('recent keeps and orders by the recents list', () => {
    expect(FilterDashboardsForLibrary(DASH, 'recent', CTX).map(x => x.ID)).toEqual(['c', 'a']);
  });
  it('compares ids without regard to case and skips unknown or repeated recents', () => {
    const upper = [d('AA-1', 'ME'), d('BB-2', 'ANA')];
    const ctx: LibraryFilterContext = { CurrentUserId: 'me', FavoriteIds: ['bb-2'], RecentIds: ['bb-2', 'zz-9', 'BB-2', 'aa-1'] };
    expect(FilterDashboardsForLibrary(upper, 'mine', ctx).map(x => x.ID)).toEqual(['AA-1']);
    expect(FilterDashboardsForLibrary(upper, 'favorites', ctx).map(x => x.ID)).toEqual(['BB-2']);
    expect(FilterDashboardsForLibrary(upper, 'recent', ctx).map(x => x.ID)).toEqual(['BB-2', 'AA-1']);
  });
});

describe('BuildLibraryRailSections', () => {
  it('builds Library items with counts and a Categories tree with children', () => {
    const cats = [
      { ID: 'sales', Name: 'Sales', ParentID: null },
      { ID: 'pipe', Name: 'Pipeline', ParentID: 'sales' },
    ] as unknown as MJDashboardCategoryEntity[];
    const sections = BuildLibraryRailSections({ all: 3, mine: 2, shared: 1, favorites: 1, recent: 2 }, cats, new Map([['sales', 2], ['pipe', 1]]), 1);
    expect(sections[0].label).toBe('Library');
    expect(sections[0].items.map(i => i.id)).toEqual(['lib:all', 'lib:mine', 'lib:shared', 'lib:favorites', 'lib:recent']);
    expect(sections[0].items[0].badge).toBe(3);
    expect(sections[1].label).toBe('Categories');
    expect(sections[1].items[0].id).toBe('cat:sales');
    expect(sections[1].items[0].children?.[0].id).toBe('cat:pipe');
    expect(sections[1].items[sections[1].items.length - 1].id).toBe('cat:unc');
  });

  it('shows a category whose parent the user cannot see at the top level', () => {
    const cats = [{ ID: 'orphan', Name: 'Orphan', ParentID: 'hidden-parent' }] as unknown as MJDashboardCategoryEntity[];
    const sections = BuildLibraryRailSections({ all: 0, mine: 0, shared: 0, favorites: 0, recent: 0 }, cats, new Map(), 0);
    expect(sections[1].items.map(i => i.id)).toEqual(['cat:orphan', 'cat:unc']);
  });

  it('stops at a parent loop instead of recursing forever', () => {
    const cats = [
      { ID: 'root', Name: 'Root', ParentID: null },
      { ID: 'x', Name: 'X', ParentID: 'y' },
      { ID: 'y', Name: 'Y', ParentID: 'x' },
    ] as unknown as MJDashboardCategoryEntity[];
    const sections = BuildLibraryRailSections({ all: 0, mine: 0, shared: 0, favorites: 0, recent: 0 }, cats, new Map(), 0);
    expect(sections[1].items.map(i => i.id)).toEqual(['cat:root', 'cat:unc']);
  });
});

/**
 * The rail badge for an item must equal the number of dashboard cards mj-dashboard-browser shows
 * when that item is clicked. The browser keeps only Config dashboards; a Library filter other than
 * All shows its list flat; a category shows the dashboards whose effective category it is.
 */
describe('rail counts match the cards the browser shows', () => {
  const ME = 'U-ME';
  const SALES = 'CAT-SALES';
  const PIPE = 'CAT-PIPE';
  const CATS = [
    { ID: SALES, Name: 'Sales', ParentID: null },
    { ID: PIPE, Name: 'Pipeline', ParentID: SALES },
  ] as unknown as MJDashboardCategoryEntity[];

  const dash = (ID: string, UserID: string, CategoryID: string | null, Type = 'Config'): MJDashboardEntity =>
    ({ ID, UserID, Name: ID, CategoryID, Type } as unknown as MJDashboardEntity);

  const OWNED_ROOT = dash('D-OWNED-ROOT', ME, null);
  const OWNED_SALES = dash('D-OWNED-SALES', ME, SALES);
  const OWNED_CODE = dash('D-OWNED-CODE', ME, SALES, 'Code');
  const SHARED_LINKED = dash('D-SHARED-LINKED', 'U-ANA', SALES);
  const SHARED_UNLINKED = dash('D-SHARED-UNLINKED', 'U-ANA', PIPE);
  const SHARED_DYNAMIC = dash('D-SHARED-DYNAMIC', 'U-ANA', null, 'Dynamic Code');
  const ALL = [OWNED_ROOT, OWNED_SALES, OWNED_CODE, SHARED_LINKED, SHARED_UNLINKED, SHARED_DYNAMIC];

  /** Shared dashboards: the viewer linked one into Pipeline; the unlinked one sits at the root. */
  const EFFECTIVE = new Map<string, string | null>([
    [SHARED_LINKED.ID, PIPE],
    [SHARED_UNLINKED.ID, null],
    [SHARED_DYNAMIC.ID, null],
  ]);

  const CONTEXT: LibraryFilterContext = {
    CurrentUserId: ME,
    FavoriteIds: [OWNED_CODE.ID, SHARED_LINKED.ID, OWNED_ROOT.ID],
    RecentIds: [SHARED_DYNAMIC.ID, OWNED_SALES.ID, SHARED_UNLINKED.ID],
  };

  /** The dashboards mj-dashboard-browser shows in flat mode: the Config ones it is given. */
  const shownFlat = (list: MJDashboardEntity[]): MJDashboardEntity[] => list.filter(x => x.Type === 'Config');

  /** The dashboards mj-dashboard-browser shows in a folder (null = root) in folder mode. */
  const shownInFolder = (folderId: string | null): MJDashboardEntity[] =>
    shownFlat(ALL).filter(x => {
      const effective = EFFECTIVE.has(x.ID) ? EFFECTIVE.get(x.ID) ?? null : x.CategoryID || null;
      return folderId ? effective === folderId : !effective;
    });

  const FILTERS: DashboardLibraryFilter[] = ['all', 'mine', 'shared', 'favorites', 'recent'];

  it.each(FILTERS)('the %s badge equals the cards the browser shows for that filter', filter => {
    const counts = CountLibraryDashboards(ALL, CONTEXT);
    expect(counts[filter]).toBe(shownFlat(FilterDashboardsForLibrary(ALL, filter, CONTEXT)).length);
  });

  it('leaves Code and Dynamic Code dashboards out of every Library count', () => {
    expect(CountLibraryDashboards(ALL, CONTEXT)).toEqual({ all: 4, mine: 2, shared: 2, favorites: 2, recent: 2 });
  });

  it('each category badge equals the cards the browser shows in that folder', () => {
    const { ByCategory: byCategory } = CountDashboardsByCategory(ALL, CATS, EFFECTIVE);
    expect(byCategory.get(SALES) ?? 0).toBe(shownInFolder(SALES).length);
    expect(byCategory.get(PIPE) ?? 0).toBe(shownInFolder(PIPE).length);
  });

  it('the Uncategorized badge equals the dashboards the browser shows at the root', () => {
    expect(CountDashboardsByCategory(ALL, CATS, EFFECTIVE).Uncategorized).toBe(shownInFolder(null).length);
  });

  it('counts a shared dashboard where the viewer filed it, or at the root when not filed', () => {
    const { ByCategory: byCategory, Uncategorized: uncategorized } = CountDashboardsByCategory(ALL, CATS, EFFECTIVE);
    expect(byCategory.get(SALES)).toBe(1); // OWNED_SALES only: the Code one is left out, SHARED_LINKED moved to Pipeline
    expect(byCategory.get(PIPE)).toBe(1); // SHARED_LINKED; SHARED_UNLINKED's owner category does not count
    expect(uncategorized).toBe(2); // OWNED_ROOT + SHARED_UNLINKED
  });

  it('keys category counts by the category id, matching ids without regard to case', () => {
    const lower = dash('D-LOWER', ME, SALES.toLowerCase());
    expect(CountDashboardsByCategory([lower], CATS, new Map()).ByCategory.get(SALES)).toBe(1);
  });

  it('IsBrowsableDashboard keeps only Config dashboards', () => {
    expect(ALL.filter(IsBrowsableDashboard).map(x => x.ID)).toEqual(shownFlat(ALL).map(x => x.ID));
  });

  it('EffectiveCategoryId prefers the effective map, even when it maps to the root', () => {
    expect(EffectiveCategoryId(SHARED_LINKED, EFFECTIVE)).toBe(PIPE);
    expect(EffectiveCategoryId(SHARED_UNLINKED, EFFECTIVE)).toBeNull();
    expect(EffectiveCategoryId(OWNED_SALES, EFFECTIVE)).toBe(SALES);
    expect(EffectiveCategoryId(OWNED_ROOT, EFFECTIVE)).toBeNull();
  });
});

describe('Browse location and the URL', () => {
  it('IsDashboardLibraryFilter accepts exactly the five filters', () => {
    expect(DASHBOARD_LIBRARY_FILTERS.every(f => IsDashboardLibraryFilter(f))).toBe(true);
    expect(DASHBOARD_LIBRARY_FILTERS).toEqual(['all', 'mine', 'shared', 'favorites', 'recent']);
    expect(IsDashboardLibraryFilter('Favorites')).toBe(false);
    expect(IsDashboardLibraryFilter('')).toBe(false);
    expect(IsDashboardLibraryFilter(undefined)).toBe(false);
    expect(IsDashboardLibraryFilter(3)).toBe(false);
  });

  it('ParseLibraryFilter accepts the five filters and falls back to all', () => {
    expect(ParseLibraryFilter('favorites')).toBe('favorites');
    expect(ParseLibraryFilter('recent')).toBe('recent');
    expect(ParseLibraryFilter('bogus')).toBe('all');
    expect(ParseLibraryFilter('')).toBe('all');
    expect(ParseLibraryFilter(undefined)).toBe('all');
  });

  it('ResolveBrowseLocation reads lib and category, and a category wins over a filter', () => {
    expect(ResolveBrowseLocation({ lib: 'favorites' })).toEqual({ Filter: 'favorites', CategoryId: null });
    expect(ResolveBrowseLocation({ category: 'CAT-1' })).toEqual({ Filter: 'all', CategoryId: 'CAT-1' });
    expect(ResolveBrowseLocation({ lib: 'mine', category: 'CAT-1' })).toEqual({ Filter: 'all', CategoryId: 'CAT-1' });
    expect(ResolveBrowseLocation({ lib: 'bogus' })).toEqual({ Filter: 'all', CategoryId: null });
  });

  it('ResolveBrowseLocation returns null when the params name no location', () => {
    expect(ResolveBrowseLocation({})).toBeNull();
    expect(ResolveBrowseLocation({ dashboard: 'D-1' })).toBeNull();
  });

  it('SameBrowseLocation compares the filter and the category id (without regard to case)', () => {
    expect(SameBrowseLocation({ Filter: 'all', CategoryId: null }, { Filter: 'all', CategoryId: null })).toBe(true);
    expect(SameBrowseLocation({ Filter: 'all', CategoryId: 'CAT-1' }, { Filter: 'all', CategoryId: 'cat-1' })).toBe(true);
    expect(SameBrowseLocation({ Filter: 'all', CategoryId: null }, { Filter: 'mine', CategoryId: null })).toBe(false);
    expect(SameBrowseLocation({ Filter: 'all', CategoryId: 'CAT-1' }, { Filter: 'all', CategoryId: null })).toBe(false);
    expect(SameBrowseLocation({ Filter: 'all', CategoryId: 'CAT-1' }, { Filter: 'all', CategoryId: 'CAT-2' })).toBe(false);
  });

  it('LocationQueryParams writes only what differs from All, and round-trips', () => {
    expect(LocationQueryParams({ Filter: 'favorites', CategoryId: null })).toEqual({ lib: 'favorites', category: null });
    expect(LocationQueryParams({ Filter: 'all', CategoryId: 'CAT-1' })).toEqual({ lib: null, category: 'CAT-1' });
    expect(LocationQueryParams({ Filter: 'all', CategoryId: null })).toEqual({ lib: null, category: null });
    const location: BrowseLocation = { Filter: 'shared', CategoryId: null };
    const written = LocationQueryParams(location);
    expect(ResolveBrowseLocation({ lib: written.lib ?? '' })).toEqual(location);
  });
});

describe('rail item ids', () => {
  const CATS = [
    { ID: 'CAT-SALES', Name: 'Sales', ParentID: null },
    { ID: 'CAT-PIPE', Name: 'Pipeline', ParentID: 'CAT-SALES' },
    { ID: 'CAT-DEEP', Name: 'Deep', ParentID: 'CAT-PIPE' },
  ] as unknown as MJDashboardCategoryEntity[];

  it('ParseRailItemId maps Library, category and Uncategorized items to a location', () => {
    expect(ParseRailItemId('lib:favorites')).toEqual({ Filter: 'favorites', CategoryId: null });
    expect(ParseRailItemId('cat:CAT-PIPE')).toEqual({ Filter: 'all', CategoryId: 'CAT-PIPE' });
    expect(ParseRailItemId('cat:unc')).toEqual({ Filter: 'all', CategoryId: null });
  });

  it('ParseRailItemId ignores ids it does not know', () => {
    expect(ParseRailItemId('lib:bogus')).toBeNull();
    expect(ParseRailItemId('other')).toBeNull();
  });

  it('RailActiveItemId marks the category, else the Library filter', () => {
    expect(RailActiveItemId({ Filter: 'favorites', CategoryId: null }, CATS)).toBe('lib:favorites');
    expect(RailActiveItemId({ Filter: 'all', CategoryId: null }, CATS)).toBe('lib:all');
    expect(RailActiveItemId({ Filter: 'all', CategoryId: 'cat-pipe' }, CATS)).toBe('cat:CAT-PIPE');
    expect(RailActiveItemId({ Filter: 'all', CategoryId: 'CAT-GONE' }, CATS)).toBe('cat:CAT-GONE');
  });

  it('ToggleExpandedId adds a missing id and removes a present one', () => {
    expect(ToggleExpandedId(['cat:A'], 'cat:B')).toEqual(['cat:A', 'cat:B']);
    expect(ToggleExpandedId(['cat:A', 'cat:B'], 'cat:A')).toEqual(['cat:B']);
  });

  it('WithExpandedAncestors expands every folder above a category', () => {
    expect(WithExpandedAncestors(['cat:CAT-SALES'], 'CAT-DEEP', CATS)).toEqual(['cat:CAT-SALES', 'cat:CAT-PIPE']);
  });

  it('WithExpandedAncestors returns the same list when nothing needs expanding', () => {
    const expanded = ['cat:CAT-SALES', 'cat:CAT-PIPE'];
    expect(WithExpandedAncestors(expanded, 'CAT-DEEP', CATS)).toBe(expanded);
    expect(WithExpandedAncestors(expanded, null, CATS)).toBe(expanded);
    expect(WithExpandedAncestors(expanded, 'CAT-SALES', CATS)).toBe(expanded);
  });
});

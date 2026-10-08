import { describe, it, expect, vi } from 'vitest';
import { DASHBOARD_PART_TYPE_NAMES, ValidatePartConfig } from './dashboard-part-config';
import { RankByQuery, SOURCE_KINDS, SearchDashboardSources, type SourceSearchDeps } from './dashboard-source-search';

describe('RankByQuery', () => {
  const items = [
    { name: 'Revenue by Region', description: null },
    { name: 'Revenue', description: null },
    { name: 'Orders', description: 'Monthly revenue and orders' },
    { name: 'Top Revenue Accounts', description: null },
  ];
  it('orders exact, prefix, contains, then description', () => {
    expect(RankByQuery(items, 'revenue', 10).map(i => i.name)).toEqual(['Revenue', 'Revenue by Region', 'Top Revenue Accounts', 'Orders']);
  });
  it('drops items that do not match', () => {
    expect(RankByQuery(items, 'zzz', 10)).toEqual([]);
  });
  it('returns the first items by name for an empty query', () => {
    expect(RankByQuery(items, '', 2).map(i => i.name)).toEqual(['Orders', 'Revenue']);
  });
  it('treats a blank query as empty', () => {
    expect(RankByQuery(items, '   ', 2).map(i => i.name)).toEqual(['Orders', 'Revenue']);
  });
  it('ignores case and outer spaces in the query', () => {
    expect(RankByQuery(items, '  REVENUE BY ', 10).map(i => i.name)).toEqual(['Revenue by Region']);
  });
  it('keeps the order it was given within a tier', () => {
    const tied = [
      { name: 'Net Sales', description: null },
      { name: 'Gross Sales', description: null },
      { name: 'Sales Tax', description: null },
    ];
    expect(RankByQuery(tied, 'sales', 10).map(i => i.name)).toEqual(['Sales Tax', 'Net Sales', 'Gross Sales']);
  });
  it('returns nothing for a limit below 1', () => {
    expect(RankByQuery(items, 'revenue', 0)).toEqual([]);
    expect(RankByQuery(items, '', -1)).toEqual([]);
  });
  it('does not reorder the list it is given', () => {
    RankByQuery(items, '', 10);
    expect(items.map(i => i.name)).toEqual(['Revenue by Region', 'Revenue', 'Orders', 'Top Revenue Accounts']);
  });
});

describe('SearchDashboardSources', () => {
  const deps: SourceSearchDeps = {
    ListArtifacts: async () => [
      { ID: 'a1', Name: 'Revenue Chart', Description: null, Type: 'Component', LatestVersion: 3 },
      { ID: 'a2', Name: 'Revenue PDF', Description: null, Type: 'PDF', LatestVersion: 1 },
    ],
    ListViews: () => [{ ID: 'v1', Name: 'Revenue Accounts', Description: null, Entity: 'Accounts', EntityID: 'e1' }],
    ListQueries: () => [{ ID: 'q1', Name: 'Revenue by Month', Description: null, Category: 'Sales' }],
    ListEntities: () => [{ ID: 'e1', Name: 'Accounts', DisplayName: 'Accounts', Description: 'Customer accounts' }],
  };
  it('searches every kind and builds suggested configs', async () => {
    const results = await SearchDashboardSources(deps, 'revenue', ['artifact', 'view', 'query', 'entity'], 10);
    expect(results.map(r => [r.kind, r.id])).toEqual([['artifact', 'a1'], ['artifact', 'a2'], ['view', 'v1'], ['query', 'q1']]);
    expect(results[0]).toMatchObject({ fitsDashboard: true, suggestedConfig: { type: 'Artifact', artifactId: 'a1', versionNumber: 3 } });
    expect(results[1].fitsDashboard).toBe(false);
    expect(results[2].suggestedConfig).toEqual({ type: 'View', viewId: 'v1', entityName: 'Accounts' });
    expect(results[3].suggestedConfig).toEqual({ type: 'Query', queryId: 'q1' });
  });
  it('limits per kind and honours the kinds filter', async () => {
    const results = await SearchDashboardSources(deps, 'revenue', ['artifact'], 1);
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('artifact');
  });
  it('matches entities by display name and description', async () => {
    const results = await SearchDashboardSources(deps, 'customer', ['entity'], 10);
    expect(results.map(r => r.name)).toEqual(['Accounts']);
    expect(results[0].suggestedConfig).toEqual({ type: 'View', entityName: 'Accounts' });
  });
  it('gives each result its name, description and type', async () => {
    const results = await SearchDashboardSources(deps, '', ['view', 'query', 'entity'], 10);
    expect(results).toEqual([
      { kind: 'view', id: 'v1', name: 'Revenue Accounts', description: null, type: 'Accounts', fitsDashboard: true, suggestedConfig: { type: 'View', viewId: 'v1', entityName: 'Accounts' } },
      { kind: 'query', id: 'q1', name: 'Revenue by Month', description: null, type: 'Sales', fitsDashboard: true, suggestedConfig: { type: 'Query', queryId: 'q1' } },
      { kind: 'entity', id: 'e1', name: 'Accounts', description: 'Customer accounts', type: 'entity', fitsDashboard: true, suggestedConfig: { type: 'View', entityName: 'Accounts' } },
    ]);
  });
  it('returns the kinds in one fixed order, whatever the order of the filter', async () => {
    const results = await SearchDashboardSources(deps, 'revenue', ['query', 'artifact'], 10);
    expect(results.map(r => r.kind)).toEqual(['artifact', 'artifact', 'query']);
  });
  it('reads only the lists of the kinds it searches', async () => {
    const spied = {
      ListArtifacts: vi.fn(deps.ListArtifacts),
      ListViews: vi.fn(deps.ListViews),
      ListQueries: vi.fn(deps.ListQueries),
      ListEntities: vi.fn(deps.ListEntities),
    };
    await SearchDashboardSources(spied, 'revenue', ['view'], 10);
    expect(spied.ListViews).toHaveBeenCalledTimes(1);
    expect(spied.ListArtifacts).not.toHaveBeenCalled();
    expect(spied.ListQueries).not.toHaveBeenCalled();
    expect(spied.ListEntities).not.toHaveBeenCalled();
  });
  it('gives the artifact list the query without its outer spaces, so the list can filter by it', async () => {
    const listArtifacts = vi.fn<SourceSearchDeps['ListArtifacts']>(async () => []);
    const spied: SourceSearchDeps = { ...deps, ListArtifacts: listArtifacts };
    await SearchDashboardSources(spied, '  Revenue Chart  ', ['artifact'], 10);
    await SearchDashboardSources(spied, '   ', ['artifact'], 10);
    expect(listArtifacts.mock.calls).toEqual([['Revenue Chart'], ['']]);
  });
  it('leaves out versionNumber when the latest version is not known, so the panel shows the latest', async () => {
    const unversioned: SourceSearchDeps = {
      ...deps,
      ListArtifacts: async () => [{ ID: 'a3', Name: 'Pipeline', Description: null, Type: 'Report', LatestVersion: null }],
    };
    const [result] = await SearchDashboardSources(unversioned, 'pipeline', ['artifact'], 10);
    expect(result.suggestedConfig).toEqual({ type: 'Artifact', artifactId: 'a3' });
    expect(result.suggestedConfig).not.toHaveProperty('versionNumber');
  });
  it('says which artifact types suit a panel, by their names in the artifact type metadata', async () => {
    const types = ['Component', 'Report', 'Data', 'Data Snapshot', 'Search Result Set', 'HTML', 'SVG Image', 'Markdown Document', 'markdown document', 'PDF', 'Image', 'JSON', null];
    const artifacts = types.map((Type, index) => ({ ID: `a${index}`, Name: `Artifact ${index}`, Description: null, Type, LatestVersion: 1 }));
    const results = await SearchDashboardSources({ ...deps, ListArtifacts: async () => artifacts }, 'artifact', ['artifact'], 50);
    expect(results.map(r => [r.type, r.fitsDashboard])).toEqual([
      ['Component', true],
      ['Report', true],
      ['Data', true],
      ['Data Snapshot', true],
      ['Search Result Set', true],
      ['HTML', true],
      ['SVG Image', true],
      ['Markdown Document', true],
      ['markdown document', true],
      ['PDF', false],
      ['Image', false],
      ['JSON', false],
      [null, false],
    ]);
  });
  it('builds a suggested config that AddPanel accepts, for every kind', async () => {
    const withUnversioned: SourceSearchDeps = {
      ...deps,
      ListArtifacts: async query => [...(await deps.ListArtifacts(query)), { ID: 'a3', Name: 'Pipeline', Description: null, Type: 'Report', LatestVersion: null }],
    };
    const results = await SearchDashboardSources(withUnversioned, '', SOURCE_KINDS, 10);
    expect(results).toHaveLength(6);
    for (const { suggestedConfig } of results) {
      const partType = DASHBOARD_PART_TYPE_NAMES.find(name => name === suggestedConfig['type']);
      expect(partType ? ValidatePartConfig(partType, suggestedConfig) : 'no part type').toMatchObject({ ok: true });
    }
  });
  it('names an entity by its name when it has no display name', async () => {
    const plain: SourceSearchDeps = { ...deps, ListEntities: () => [{ ID: 'e2', Name: 'Invoices', DisplayName: null, Description: null }] };
    const results = await SearchDashboardSources(plain, 'invoice', ['entity'], 10);
    expect(results).toEqual([
      { kind: 'entity', id: 'e2', name: 'Invoices', description: null, type: 'entity', fitsDashboard: true, suggestedConfig: { type: 'View', entityName: 'Invoices' } },
    ]);
  });
});

/**
 * Tests for MJ's stock foreign-key lookup: what SQL it asks for, how the metadata and input
 * filters combine, which column a typed query is matched against, and when it ranks through the
 * platform search API rather than a LIKE.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, type EntityFieldInfo, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import { DefaultFKLookupStrategy, CombineFilters } from '../field/default-fk-lookup-strategy';
import type { FKLookupContext } from '../field/fk-lookup-strategy';

const PARTY_FIELDS = [
  { ID: 'P1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
  { ID: 'P2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, IsNameField: true },
  { ID: 'P3', Name: 'City', Type: 'nvarchar', Length: 100, AllowsNull: true },
];

function partyEntity(options: { compositeKey?: boolean } = {}): EntityInfo {
  return new EntityInfo({
    ID: 'E0000002-0000-0000-0000-000000000002',
    Name: 'Test Parties',
    Status: 'Active',
    BaseTable: 'Party',
    BaseView: 'vwParties',
    Fields: [
      ...PARTY_FIELDS,
      ...(options.compositeKey
        ? [{ ID: 'P5', Name: 'TenantID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true }]
        : []),
    ],
  });
}

type Rows = Record<string, unknown>[];

/**
 * Records every RunView it is asked for, and answers SearchEntity with the supplied IDs. `rows`
 * may be a function of the RunView params, for paths that issue more than one query.
 */
function fakeProvider(searchIds: string[], rows: Rows | ((params: RunViewParams) => Rows)) {
  const runViewCalls: RunViewParams[] = [];
  const provider = {
    runViewCalls,
    SearchEntity: vi.fn(async () =>
      searchIds.map((id, i) => ({
        entityRecordDocumentId: null,
        recordId: id,
        score: 1 - i * 0.1,
        matchType: 'lexical' as const,
        components: { lexical: 1 - i * 0.1 },
      }))
    ),
    RunView: vi.fn(async (params: RunViewParams) => {
      runViewCalls.push(params);
      const results = typeof rows === 'function' ? rows(params) : rows;
      return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ErrorMessage: '' };
    }),
  };
  return provider as unknown as IMetadataProvider & { runViewCalls: RunViewParams[]; SearchEntity: ReturnType<typeof vi.fn> };
}

function fieldInfo(overrides: Partial<EntityFieldInfo> = {}): EntityFieldInfo {
  return {
    RelatedEntity: 'Test Parties',
    RelatedEntityFilter: null,
    RelatedEntityOrderBy: null,
    RelatedEntityDisplayType: 'Search',
    ...overrides,
  } as EntityFieldInfo;
}

function context(overrides: Partial<FKLookupContext>, provider: IMetadataProvider): FKLookupContext {
  return {
    Record: {} as FKLookupContext['Record'],
    FieldInfo: fieldInfo(),
    RelatedEntity: partyEntity(),
    Provider: provider,
    Fields: ['ID', 'Name', 'City'],
    PkField: 'ID',
    NameField: 'Name',
    SearchField: 'Name',
    Query: '',
    Scope: 'primary',
    MaxRows: 20,
    Options: {},
    ...overrides,
  };
}

const HYBRID = { SearchMode: 'hybrid' };

describe('CombineFilters', () => {
  it('parenthesizes and AND-joins, dropping empties', () => {
    expect(CombineFilters(`Kind = 'Org'`, '', null, 'IsDeleted = 0')).toBe(`(Kind = 'Org') AND (IsDeleted = 0)`);
  });

  it('returns an empty string when nothing is supplied', () => {
    expect(CombineFilters(null, undefined, '  ')).toBe('');
  });
});

describe('DefaultFKLookupStrategy', () => {
  it('browses ordered by the name field on an empty query', async () => {
    const provider = fakeProvider([], [{ ID: '1', Name: 'Alpha' }]);
    const groups = await new DefaultFKLookupStrategy().Lookup(context({ Query: '' }, provider));

    expect(provider.SearchEntity).not.toHaveBeenCalled();
    expect(provider.runViewCalls[0].OrderBy).toBe('[Name]');
    expect(provider.runViewCalls[0].MaxRows).toBe(20);
    expect(provider.runViewCalls[0].Fields).toEqual(['ID', 'Name', 'City']);
    expect(groups[0].Rows.map(r => r.Values.Name)).toEqual(['Alpha']);
  });

  it('prefers the metadata order-by, and the input order-by over that', async () => {
    const provider = fakeProvider([], []);
    const strategy = new DefaultFKLookupStrategy();

    await strategy.Lookup(
      context({ FieldInfo: fieldInfo({ RelatedEntityOrderBy: '[City]' }) }, provider)
    );
    expect(provider.runViewCalls[0].OrderBy).toBe('[City]');

    await strategy.Lookup(
      context({ FieldInfo: fieldInfo({ RelatedEntityOrderBy: '[City]' }), Options: { OrderBy: '[Name] DESC' } }, provider)
    );
    expect(provider.runViewCalls[1].OrderBy).toBe('[Name] DESC');
  });

  it('matches a typed query with one escaped LIKE on the name field, prefix matches first', async () => {
    const provider = fakeProvider(['9'], [{ ID: '1', Name: 'Executive Summary' }, { ID: '2', Name: 'Summit' }]);
    const groups = await new DefaultFKLookupStrategy().Lookup(context({ Query: 'sum' }, provider));

    expect(provider.SearchEntity).not.toHaveBeenCalled();
    expect(provider.runViewCalls).toHaveLength(1);
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[Name] LIKE '%sum%'`);
    expect(provider.runViewCalls[0].OrderBy).toBe('[Name]');
    expect(groups[0].Rows.map(r => r.Values.Name)).toEqual(['Summit', 'Executive Summary']);
  });

  it('matches the column the user chose on the scope pill, even in hybrid mode', async () => {
    const provider = fakeProvider(['1'], [{ ID: '1', Name: 'Northwind', City: 'Springfield' }]);
    await new DefaultFKLookupStrategy().Lookup(
      context({ Query: 'spring', SearchField: 'City', Options: HYBRID }, provider)
    );

    expect(provider.SearchEntity).not.toHaveBeenCalled();
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[City] LIKE '%spring%'`);
    expect(provider.runViewCalls[0].OrderBy).toBe('[City]');
  });

  it('ranks through the search API when the field opts into hybrid mode, hydrating in search order', async () => {
    const provider = fakeProvider(['2', '1'], [{ ID: '1', Name: 'Summit' }, { ID: '2', Name: 'Executive Summary' }]);
    const groups = await new DefaultFKLookupStrategy().Lookup(context({ Query: 'sum', Options: HYBRID }, provider));

    expect(provider.SearchEntity).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'Test Parties', searchText: 'sum', options: { mode: 'hybrid', topK: 80 } })
    );
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[ID] IN ('2','1')`);
    expect(groups[0].Rows.map(r => r.Values.Name)).toEqual(['Executive Summary', 'Summit']);
  });

  it('falls back to LIKE when the filter removes every hybrid hit', async () => {
    const provider = fakeProvider(['9'], params =>
      params.ExtraFilter?.includes(' IN (') ? [] : [{ ID: '1', Name: 'Summit' }]
    );
    const groups = await new DefaultFKLookupStrategy().Lookup(
      context({ Query: 'sum', Options: HYBRID, FieldInfo: fieldInfo({ RelatedEntityFilter: `Kind = 'Org'` }) }, provider)
    );

    expect(provider.runViewCalls).toHaveLength(2);
    expect(provider.runViewCalls[1].ExtraFilter).toContain(`[Name] LIKE '%sum%'`);
    expect(provider.runViewCalls[1].ExtraFilter).toContain(`Kind = 'Org'`);
    expect(groups[0].Rows.map(r => r.Values.Name)).toEqual(['Summit']);
  });

  it('applies the metadata filter and the input filter with AND', async () => {
    const provider = fakeProvider([], []);
    await new DefaultFKLookupStrategy().Lookup(
      context(
        { FieldInfo: fieldInfo({ RelatedEntityFilter: `Kind = 'Org'` }), Options: { ExtraFilter: 'IsDeleted = 0' } },
        provider
      )
    );

    expect(provider.runViewCalls[0].ExtraFilter).toBe(`(Kind = 'Org') AND (IsDeleted = 0)`);
  });

  it('scopes recent picks with the same filter and offers no scope toggle of its own', () => {
    const strategy = new DefaultFKLookupStrategy();
    const provider = fakeProvider([], []);
    const scoped = context({ FieldInfo: fieldInfo({ RelatedEntityFilter: `Kind = 'Org'` }) }, provider);

    expect(strategy.RecentFilter(scoped)).toBe(`(Kind = 'Org')`);
    expect(strategy.ScopeLabels(scoped)).toBeNull();
  });

  it('applies the typed text on a field metadata marks as a dropdown, without the search API', async () => {
    const provider = fakeProvider(['1'], [{ ID: '1', Name: 'Alpha' }]);
    await new DefaultFKLookupStrategy().Lookup(
      context({ Query: 'al', Options: HYBRID, FieldInfo: fieldInfo({ RelatedEntityDisplayType: 'Dropdown' }) }, provider)
    );

    expect(provider.SearchEntity).not.toHaveBeenCalled();
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[Name] LIKE '%al%'`);
    expect(provider.runViewCalls[0].OrderBy).toBe('[Name]');
  });

  it('skips the search API for a composite-key entity, whose IDs are not SQL literals', async () => {
    const provider = fakeProvider(['a|b'], [{ ID: '1', Name: 'Summit' }]);
    await new DefaultFKLookupStrategy().Lookup(
      context({ Query: 'sum', Options: HYBRID, RelatedEntity: partyEntity({ compositeKey: true }) }, provider)
    );

    expect(provider.SearchEntity).not.toHaveBeenCalled();
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[Name] LIKE '%sum%'`);
  });

  it('escapes LIKE wildcards so 50% is a literal', async () => {
    const provider = fakeProvider([], [{ ID: '1', Name: '50% off' }]);
    await new DefaultFKLookupStrategy().Lookup(context({ Query: '50%' }, provider));

    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[Name] LIKE '%50[%]%'`);
  });

  it('honours the searched field UserSearchPredicateAPI', async () => {
    const entity = partyEntity();
    const nameField = entity.Fields.find(f => f.Name === 'Name');
    if (nameField) nameField.UserSearchPredicateAPI = 'BeginsWith';
    const provider = fakeProvider([], []);

    await new DefaultFKLookupStrategy().Lookup(context({ Query: 'sum', RelatedEntity: entity }, provider));
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[Name] LIKE 'sum%'`);
  });

  it('returns no rows rather than throwing when the search API is unavailable and the view fails', async () => {
    const provider = {
      SearchEntity: vi.fn(async () => {
        throw new Error('no search resolver');
      }),
      RunView: vi.fn(async () => ({ Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: 'boom' })),
    } as unknown as IMetadataProvider;

    const groups = await new DefaultFKLookupStrategy().Lookup(context({ Query: 'sum', Options: HYBRID }, provider));
    expect(groups[0].Rows).toEqual([]);
  });
});

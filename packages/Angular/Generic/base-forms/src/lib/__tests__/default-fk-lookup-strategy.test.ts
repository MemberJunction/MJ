/**
 * Tests for MJ's stock foreign-key lookup: what SQL it asks for, how the scope and metadata
 * filters combine, and when it searches rather than browses.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, type EntityFieldInfo, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import {
  DefaultFKLookupStrategy,
  BuildStatusFilter,
  CombineFilters,
  HasActiveStatus,
} from '../field/default-fk-lookup-strategy';
import type { FKLookupContext } from '../field/fk-lookup-strategy';

const PARTY_FIELDS = [
  { ID: 'P1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
  { ID: 'P2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, IsNameField: true },
  { ID: 'P3', Name: 'City', Type: 'nvarchar', Length: 100, AllowsNull: true },
];

const ACTIVE_STATUS_FIELD = {
  ID: 'P4',
  Name: 'Status',
  Type: 'nvarchar',
  Length: 25,
  AllowsNull: false,
  EntityFieldValues: [{ Value: 'Active' }, { Value: 'Inactive' }],
};

function partyEntity(options: { withStatus?: boolean; compositeKey?: boolean } = {}): EntityInfo {
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
      ...(options.withStatus ? [ACTIVE_STATUS_FIELD] : []),
    ],
  });
}

/** Records every RunView it is asked for, and answers SearchEntity with the supplied IDs. */
function fakeProvider(searchIds: string[], rows: Record<string, unknown>[]) {
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
      return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ErrorMessage: '' };
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
    Query: '',
    Scope: 'primary',
    MaxRows: 20,
    Options: {},
    ...overrides,
  };
}

describe('CombineFilters', () => {
  it('parenthesizes and AND-joins, dropping empties', () => {
    expect(CombineFilters(`Kind = 'Org'`, '', null, 'IsDeleted = 0')).toBe(`(Kind = 'Org') AND (IsDeleted = 0)`);
  });

  it('returns an empty string when nothing is supplied', () => {
    expect(CombineFilters(null, undefined, '  ')).toBe('');
  });
});

describe('HasActiveStatus / BuildStatusFilter', () => {
  it('sees an Active value list on a Status field', () => {
    expect(HasActiveStatus(partyEntity({ withStatus: true }))).toBe(true);
    expect(HasActiveStatus(partyEntity())).toBe(false);
  });

  it('filters to Active in the primary scope only', () => {
    const withStatus = partyEntity({ withStatus: true });
    expect(BuildStatusFilter(withStatus, 'primary')).toBe(`[Status] = 'Active'`);
    expect(BuildStatusFilter(withStatus, 'all')).toBe('');
    expect(BuildStatusFilter(partyEntity(), 'primary')).toBe('');
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

  it('searches then hydrates by ID, ranking prefix matches first', async () => {
    const provider = fakeProvider(['2', '1'], [{ ID: '1', Name: 'Summit' }, { ID: '2', Name: 'Executive Summary' }]);
    const groups = await new DefaultFKLookupStrategy().Lookup(context({ Query: 'sum' }, provider));

    expect(provider.SearchEntity).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'Test Parties', searchText: 'sum' })
    );
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[ID] IN ('2','1')`);
    expect(groups[0].Rows.map(r => r.Values.Name)).toEqual(['Summit', 'Executive Summary']);
  });

  it('searches lexically by default and over-fetches to absorb the post-filter shrink', async () => {
    const provider = fakeProvider(['1'], [{ ID: '1', Name: 'Summit' }]);
    await new DefaultFKLookupStrategy().Lookup(context({ Query: 'sum', MaxRows: 20 }, provider));

    expect(provider.SearchEntity).toHaveBeenCalledWith(
      expect.objectContaining({ options: { mode: 'lexical', topK: 80 } })
    );
  });

  it('asks for hybrid ranking when the field opts in', async () => {
    const provider = fakeProvider(['1'], [{ ID: '1', Name: 'Summit' }]);
    await new DefaultFKLookupStrategy().Lookup(
      context({ Query: 'sum', Options: { SearchMode: 'hybrid' } }, provider)
    );

    expect(provider.SearchEntity).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ mode: 'hybrid' }) })
    );
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

  it('offers an include-inactive scope only when the entity has a Status with Active', () => {
    const strategy = new DefaultFKLookupStrategy();
    const provider = fakeProvider([], []);

    expect(strategy.ScopeLabels(context({ RelatedEntity: partyEntity({ withStatus: true }) }, provider))).toEqual({
      primary: 'Active only',
      all: 'Include inactive',
    });
    expect(strategy.ScopeLabels(context({}, provider))).toBeNull();
  });

  it('hides non-active rows in the primary scope and shows them in the all scope', async () => {
    const provider = fakeProvider([], []);
    const strategy = new DefaultFKLookupStrategy();
    const withStatus = partyEntity({ withStatus: true });

    await strategy.Lookup(context({ RelatedEntity: withStatus, Scope: 'primary' }, provider));
    expect(provider.runViewCalls[0].ExtraFilter).toBe(`([Status] = 'Active')`);

    await strategy.Lookup(context({ RelatedEntity: withStatus, Scope: 'all' }, provider));
    expect(provider.runViewCalls[1].ExtraFilter).toBe('');
  });

  it('browses rather than searches when metadata marks the field as a dropdown', async () => {
    const provider = fakeProvider(['1'], [{ ID: '1', Name: 'Alpha' }]);
    await new DefaultFKLookupStrategy().Lookup(
      context({ Query: 'al', FieldInfo: fieldInfo({ RelatedEntityDisplayType: 'Dropdown' }) }, provider)
    );

    expect(provider.SearchEntity).not.toHaveBeenCalled();
    expect(provider.runViewCalls[0].OrderBy).toBe('[Name]');
  });

  it('skips the search API for a composite-key entity, whose IDs are not SQL literals', async () => {
    const provider = fakeProvider(['a|b'], [{ ID: '1', Name: 'Summit' }]);
    await new DefaultFKLookupStrategy().Lookup(
      context({ Query: 'sum', RelatedEntity: partyEntity({ compositeKey: true }) }, provider)
    );

    expect(provider.SearchEntity).not.toHaveBeenCalled();
    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[Name] LIKE '%sum%'`);
  });

  it('escapes LIKE wildcards on the fallback path so 50% is a literal', async () => {
    const provider = fakeProvider([], [{ ID: '1', Name: '50% off' }]);
    await new DefaultFKLookupStrategy().Lookup(context({ Query: '50%' }, provider));

    expect(provider.runViewCalls[0].ExtraFilter).toContain(`[Name] LIKE '%50[%]%'`);
  });

  it('honours the name field UserSearchPredicateAPI on the fallback path', async () => {
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

    const groups = await new DefaultFKLookupStrategy().Lookup(context({ Query: 'sum' }, provider));
    expect(groups[0].Rows).toEqual([]);
  });
});

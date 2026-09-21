/**
 * DOM coverage for the record-merge wiring in <mj-grid-view-renderer>.
 *
 * The grid's Merge button emitted `MergeRecordsRequested` with no subscriber until this wrapper
 * took it, so these specs pin the three decisions it now makes: whether the button is offered at
 * all, what it refuses, and what it sends to `MergeRecords`. The grid and the merge panel are
 * stubbed — this is about the wrapper's own logic.
 */
import { describe, it, expect, vi } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { renderComponentFixture, query, text, createFakeProvider } from '@memberjunction/ng-test-utils';
import { EntityInfo, type IMetadataProvider, type RecordMergeRequest } from '@memberjunction/core';
import { RecordComparisonService } from '@memberjunction/ng-record-merge';
import { GridViewRendererComponent } from './grid-view-renderer.component';

@Component({ standalone: true, selector: 'mj-entity-data-grid', template: '' })
class GridStub {
  @Input() Provider: unknown; @Input() Data: unknown; @Input() ExportDataProvider: unknown; @Input() Params: unknown;
  @Input() FilterText = ''; @Input() GridState: unknown; @Input() Height = ''; @Input() AllowLoad = false;
  @Input() AutoLoadEntityActions = false; @Input() ShowToolbar = false; @Input() ShowSearch = false;
  @Input() ToolbarConfig: unknown; @Input() SelectionMode = 'single'; @Input() ShowAddToListButton = false;
  @Input() ShowPager = false; @Input() PageSize = 100; @Input() TotalRowCount = 0; @Input() PagerPageNumber = 1;
  @Input() ShowMergeButton = false;
  @Output() MergeRecordsRequested = new EventEmitter<unknown>();
}

@Component({ standalone: true, selector: 'mj-record-merge-panel', template: '<div class="merge-panel-stub"></div>' })
class MergePanelStub {
  @Input() Fields: unknown; @Input() Config: unknown; @Input() MergeEnabled = true; @Input() IsMerging = false;
  @Output() MergeConfirmed = new EventEmitter<unknown>();
  @Output() MergeCancelled = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-list-management-dialog', template: '' })
class ListDialogStub {
  @Input() Provider: unknown; @Input() visible = false; @Input() config: unknown;
  @Output() complete = new EventEmitter<unknown>();
  @Output() cancel = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-ev-confirm-dialog', template: '' })
class ConfirmDialogStub {
  @Input() IsOpen = false; @Input() Title = ''; @Input() Message = ''; @Input() DetailMessage = '';
  @Input() ConfirmText = ''; @Input() ConfirmStyle = ''; @Input() Icon = '';
  @Output() Confirmed = new EventEmitter<void>();
  @Output() Cancelled = new EventEmitter<void>();
}

const PARTY_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const PARTY_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const TENANT = 'tttttttt-0000-0000-0000-000000000003';

function partyEntity(options: { allowMerge?: boolean; canUpdate?: boolean; canDelete?: boolean; compositeKey?: boolean } = {}): EntityInfo {
  const entity = new EntityInfo({
    ID: 'E0000002-0000-0000-0000-000000000002',
    Name: 'Test Parties',
    Status: 'Active',
    BaseTable: 'Party',
    BaseView: 'vwParties',
    AllowRecordMerge: options.allowMerge ?? true,
    Fields: [
      { ID: 'P1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      { ID: 'P2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, IsNameField: true },
      ...(options.compositeKey
        ? [{ ID: 'P3', Name: 'TenantID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true }]
        : []),
    ],
  });
  entity.GetUserPermisions = () => ({
    CanRead: true,
    CanCreate: true,
    CanUpdate: options.canUpdate ?? true,
    CanDelete: options.canDelete ?? true,
  }) as ReturnType<EntityInfo['GetUserPermisions']>;
  return entity;
}

function provider(overrides: Partial<Record<string, unknown>> = {}): IMetadataProvider {
  const fake = createFakeProvider({ runViewResults: [] });
  Object.assign(fake, {
    // No IS-A children in these fixtures, and no dependencies to preview.
    GetRecordDependencies: async () => [],
    MergeRecords: async () => ({ Success: true, OverallStatus: 'Complete' }),
    ...overrides,
  });
  return fake;
}

function render(entity: EntityInfo | null, p: IMetadataProvider) {
  return renderComponentFixture(GridViewRendererComponent, {
    imports: [GridStub, MergePanelStub, ListDialogStub, ConfirmDialogStub],
    declarations: [GridViewRendererComponent],
    providers: [
      {
        provide: RecordComparisonService,
        useValue: {
          GetRecordComparison: async () => ({
            Success: true,
            Output: {
              EntityName: 'Test Parties',
              Records: [],
              Fields: [
                { FieldName: 'ID', DisplayName: 'ID', Category: null, Differs: false,
                  Cells: [{ ColumnIndex: 0, Value: PARTY_A, EqualsReference: true }, { ColumnIndex: 1, Value: PARTY_B, EqualsReference: false }] },
                { FieldName: 'Name', DisplayName: 'Name', Category: null, Differs: true,
                  Cells: [{ ColumnIndex: 0, Value: 'Northwind Institute', EqualsReference: true }, { ColumnIndex: 1, Value: 'Northwind Institute (Regional)', EqualsReference: false }] },
              ],
            },
          }),
        },
      },
    ],
    inputs: { entity, records: [], config: {}, Provider: p },
  });
}

type MergeHost = {
  effectiveShowMergeButton: boolean;
  mergeNotice: string | null;
  mergeState: {
    Fields: { FieldName: string; HasConflict: boolean; IsReadOnly: boolean }[];
    DependencyNote: string | null;
    Config: { LeftRecordID: string; RightRecordID: string };
  } | null;
  onMergeRequested(e: { entityInfo: EntityInfo; records: Record<string, unknown>[] }): Promise<void>;
  onMergeConfirmed(e: unknown): Promise<void>;
};

function host(fixture: ReturnType<typeof render>): MergeHost {
  return fixture.componentInstance as unknown as MergeHost;
}

const twoParties = [{ ID: PARTY_A, Name: 'Northwind Institute' }, { ID: PARTY_B, Name: 'Northwind Institute (Regional)' }];

describe('GridViewRendererComponent merge wiring', () => {
  it('offers the Merge button when the entity allows merge and the user can update and delete', () => {
    expect(host(render(partyEntity(), provider())).effectiveShowMergeButton).toBe(true);
  });

  it('hides the Merge button when the entity does not allow merge', () => {
    expect(host(render(partyEntity({ allowMerge: false }), provider())).effectiveShowMergeButton).toBe(false);
  });

  it('hides the Merge button when the user cannot delete the loser', () => {
    expect(host(render(partyEntity({ canDelete: false }), provider())).effectiveShowMergeButton).toBe(false);
  });

  it('hides the Merge button when there is no entity', () => {
    expect(host(render(null, provider())).effectiveShowMergeButton).toBe(false);
  });

  it('refuses a request with other than two records — the panel is two-sided', async () => {
    const f = render(partyEntity(), provider());
    await host(f).onMergeRequested({ entityInfo: partyEntity(), records: [...twoParties, { ID: 'c3', Name: 'Third' }] });
    f.detectChanges();

    expect(host(f).mergeState).toBeNull();
    expect(text(f, '.mj-ev-merge-notice')).toContain('exactly two');
  });

  it('opens the panel with the compared fields and a dependency preview', async () => {
    const f = render(partyEntity(), provider());
    await host(f).onMergeRequested({ entityInfo: partyEntity(), records: twoParties });
    f.detectChanges();

    const state = host(f).mergeState;
    expect(state?.Fields.map(x => x.FieldName)).toEqual(['ID', 'Name']);
    expect(state?.Fields.find(x => x.FieldName === 'ID')?.IsReadOnly).toBe(true);
    expect(state?.Fields.find(x => x.FieldName === 'Name')?.HasConflict).toBe(true);
    expect(state?.DependencyNote).toContain('0 on the left');
    expect(query(f, '.merge-panel-stub')).not.toBeNull();
  });

  it('surfaces a comparison failure rather than opening an empty panel', async () => {
    const f = renderComponentFixture(GridViewRendererComponent, {
      imports: [GridStub, MergePanelStub, ListDialogStub, ConfirmDialogStub],
      declarations: [GridViewRendererComponent],
      providers: [
        {
          provide: RecordComparisonService,
          useValue: { GetRecordComparison: async () => ({ Success: false, ErrorMessage: 'comparison unavailable' }) },
        },
      ],
      inputs: { entity: partyEntity(), records: [], config: {}, Provider: provider() },
    });
    await host(f).onMergeRequested({ entityInfo: partyEntity(), records: twoParties });
    f.detectChanges();

    expect(host(f).mergeState).toBeNull();
    expect(text(f, '.mj-ev-merge-notice')).toContain('comparison unavailable');
  });

  it('carries both key columns of a composite-key entity through the merge', async () => {
    const mergeRecords = vi.fn(async (_request: RecordMergeRequest) => ({ Success: true, OverallStatus: 'Complete' }));
    const entity = partyEntity({ compositeKey: true });
    const f = render(entity, provider({ MergeRecords: mergeRecords }));
    const records = [
      { ID: PARTY_A, TenantID: TENANT, Name: 'Northwind Institute' },
      { ID: PARTY_B, TenantID: TENANT, Name: 'Northwind Institute (Regional)' },
    ];

    await host(f).onMergeRequested({ entityInfo: entity, records });
    // Both PK columns are read-only in the comparison, not just the first.
    expect(host(f).mergeState?.Fields.find(x => x.FieldName === 'ID')?.IsReadOnly).toBe(true);

    await host(f).onMergeConfirmed({
      Config: {
        EntityName: 'Test Parties',
        LeftRecordID: host(f).mergeState!.Config.LeftRecordID,
        RightRecordID: host(f).mergeState!.Config.RightRecordID,
        SurvivorSide: 'left',
        LeftLabel: 'Northwind Institute',
        RightLabel: 'Northwind Institute (Regional)',
      },
      ResolvedFields: [],
    });

    const request = mergeRecords.mock.calls[0][0];
    expect(request.SurvivingRecordCompositeKey.KeyValuePairs.map(kv => kv.FieldName).sort()).toEqual(['ID', 'TenantID']);
    expect(request.RecordsToMerge[0].KeyValuePairs.map(kv => String(kv.Value))).toContain(PARTY_B);
  });

  it('merges the loser into the survivor and reloads the page', async () => {
    const mergeRecords = vi.fn(async (_request: RecordMergeRequest) => ({ Success: true, OverallStatus: 'Complete' }));
    const f = render(partyEntity(), provider({ MergeRecords: mergeRecords }));
    const reloads: unknown[] = [];
    f.componentInstance.dataRequest.subscribe((r: unknown) => reloads.push(r));

    // The panel only exists once a request opened it, and confirming is a no-op without it.
    await host(f).onMergeRequested({ entityInfo: partyEntity(), records: twoParties });
    await host(f).onMergeConfirmed({
      Config: {
        EntityName: 'Test Parties',
        LeftRecordID: PARTY_A,
        RightRecordID: PARTY_B,
        SurvivorSide: 'left',
        LeftLabel: 'Northwind Institute',
        RightLabel: 'Northwind Institute (Regional)',
      },
      ResolvedFields: [
        { FieldName: 'ID', HasConflict: true, IsReadOnly: true, SelectedSide: 'left', LeftValue: PARTY_A, RightValue: PARTY_B },
        { FieldName: 'Name', HasConflict: true, IsReadOnly: false, SelectedSide: 'right', LeftValue: 'Northwind Institute', RightValue: 'Northwind Institute (Regional)' },
      ],
    });
    f.detectChanges();

    expect(mergeRecords).toHaveBeenCalledTimes(1);
    const request = mergeRecords.mock.calls[0][0];
    expect(request.EntityName).toBe('Test Parties');
    expect(request.RecordsToMerge).toHaveLength(1);
    // Only the field resolved AWAY from the survivor travels; the read-only key never does.
    expect(request.FieldMap).toEqual([{ FieldName: 'Name', Value: 'Northwind Institute (Regional)' }]);
    expect(reloads).toHaveLength(1);
    expect(text(f, '.mj-ev-merge-notice')).toContain('merged');
  });

  it('reports a failed merge and does not reload', async () => {
    const f = render(partyEntity(), provider({
      MergeRecords: async () => ({ Success: false, OverallStatus: 'Dependencies could not be repointed' }),
    }));
    const reloads: unknown[] = [];
    f.componentInstance.dataRequest.subscribe((r: unknown) => reloads.push(r));

    await host(f).onMergeRequested({ entityInfo: partyEntity(), records: twoParties });
    await host(f).onMergeConfirmed({
      Config: { EntityName: 'Test Parties', LeftRecordID: PARTY_A, RightRecordID: PARTY_B, SurvivorSide: 'left', LeftLabel: 'a', RightLabel: 'b' },
      ResolvedFields: [],
    });
    f.detectChanges();

    expect(reloads).toHaveLength(0);
    expect(text(f, '.mj-ev-merge-notice')).toContain('Dependencies could not be repointed');
  });
});

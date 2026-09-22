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
import { MJButtonDirective, MJDialogComponent } from '@memberjunction/ng-ui-components';
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
      { ID: 'P1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'P2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, IsNameField: true, AllowUpdateAPI: true },
      { ID: 'P4', Name: 'Entity', Type: 'nvarchar', Length: 200, AllowsNull: true, IsVirtual: true, AllowUpdateAPI: false },
      ...(options.compositeKey
        ? [{ ID: 'P3', Name: 'TenantID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false }]
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
    imports: [GridStub, MergePanelStub, ListDialogStub, ConfirmDialogStub, MJDialogComponent, MJButtonDirective],
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
                { FieldName: 'Entity', DisplayName: 'Entity', Category: null, Differs: true,
                  Cells: [{ ColumnIndex: 0, Value: 'Parties', EqualsReference: true }, { ColumnIndex: 1, Value: 'Parties (Regional)', EqualsReference: false }] },
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
    Fields: { FieldName: string; HasConflict: boolean; IsReadOnly: boolean; SelectedSide: string }[];
    DependencyNote: string | null;
    Config: { LeftRecordID: string; RightRecordID: string; SurvivorSide: 'left' | 'right'; LeftLabel: string; RightLabel: string; EntityName: string };
  } | null;
  onMergeRequested(e: { entityInfo: EntityInfo; records: Record<string, unknown>[] }): Promise<void>;
  onMergeConfirmed(e: unknown): Promise<void>;
  onSurvivorChange(side: 'left' | 'right'): void;
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
    expect(state?.Fields.map(x => x.FieldName)).toEqual(['ID', 'Name', 'Entity']);
    expect(state?.Fields.find(x => x.FieldName === 'ID')?.IsReadOnly).toBe(true);
    expect(state?.Fields.find(x => x.FieldName === 'Name')?.HasConflict).toBe(true);
    expect(state?.Fields.find(x => x.FieldName === 'Name')?.IsReadOnly).toBe(false);
    // A joined display column the ORM will never write is not offered as a choice.
    expect(state?.Fields.find(x => x.FieldName === 'Entity')?.IsReadOnly).toBe(true);
    expect(state?.DependencyNote).toContain('0 on the left');
    expect(query(f, '.merge-panel-stub')).not.toBeNull();
  });

  it('lets the user choose the survivor, defaulting the other fields to that record', async () => {
    const mergeRecords = vi.fn(async (_request: RecordMergeRequest) => ({ Success: true, OverallStatus: 'Complete' }));
    const f = render(partyEntity(), provider({ MergeRecords: mergeRecords }));
    await host(f).onMergeRequested({ entityInfo: partyEntity(), records: twoParties });
    f.detectChanges();
    expect(text(f, '.mj-ev-merge-survivor-note')).toContain('Northwind Institute (Regional) will be deleted');

    host(f).onSurvivorChange('right');
    const state = host(f).mergeState!;
    expect(state.Config.SurvivorSide).toBe('right');
    expect(state.Fields.find(x => x.FieldName === 'Name')?.SelectedSide).toBe('right');
    expect(text(f, '.mj-ev-merge-survivor-note')).toContain('Northwind Institute will be deleted');

    await host(f).onMergeConfirmed({ Config: state.Config, ResolvedFields: state.Fields });
    const request = mergeRecords.mock.calls[0][0];
    expect(request.SurvivingRecordCompositeKey.KeyValuePairs[0].Value).toBe(PARTY_B);
    expect(request.RecordsToMerge[0].KeyValuePairs[0].Value).toBe(PARTY_A);
    expect(request.FieldMap).toEqual([]);
  });

  it('refuses to merge records of an IS-A subtype entity', async () => {
    const entity = partyEntity();
    entity.ParentID = 'E0000009-0000-0000-0000-000000000009';
    const f = render(entity, provider());
    await host(f).onMergeRequested({ entityInfo: entity, records: twoParties });
    f.detectChanges();

    expect(host(f).mergeState).toBeNull();
    expect(text(f, '.mj-ev-merge-notice')).toContain('extend a parent type');
  });

  it('reports a failed pre-flight query instead of rejecting silently', async () => {
    const failing = renderComponentFixture(GridViewRendererComponent, {
      imports: [GridStub, MergePanelStub, ListDialogStub, ConfirmDialogStub, MJDialogComponent, MJButtonDirective],
      declarations: [GridViewRendererComponent],
      providers: [
        { provide: RecordComparisonService, useValue: { GetRecordComparison: async () => { throw new Error('socket closed'); } } },
      ],
      inputs: { entity: partyEntity(), records: [], config: {}, Provider: provider() },
    });
    await host(failing).onMergeRequested({ entityInfo: partyEntity(), records: twoParties });
    failing.detectChanges();

    expect(host(failing).mergeState).toBeNull();
    expect(text(failing, '.mj-ev-merge-notice')).toContain('socket closed');
  });

  it('surfaces a comparison failure rather than opening an empty panel', async () => {
    const f = renderComponentFixture(GridViewRendererComponent, {
      imports: [GridStub, MergePanelStub, ListDialogStub, ConfirmDialogStub, MJDialogComponent, MJButtonDirective],
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

  it('writes a conflict the user resolved to the blank side, rather than silently dropping it', async () => {
    // The gap Robert found: `undefined` (the user did not move this field off the survivor) and a
    // chosen blank both arrive as an absent value. Deciding from the value dropped the second,
    // leaving the survivor's old value while reporting a successful merge — unrecoverable, since
    // the loser is deleted.
    const mergeRecords = vi.fn(async (_request: RecordMergeRequest) => ({ Success: true, OverallStatus: 'Complete' }));
    const f = render(partyEntity(), provider({ MergeRecords: mergeRecords }));

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
        // Chose the right side, whose value is blank — a clear, not a no-op.
        { FieldName: 'Name', HasConflict: true, IsReadOnly: false, SelectedSide: 'right', LeftValue: 'Northwind Institute', RightValue: null },
        // Cleared a custom value — also a clear.
        { FieldName: 'Website', HasConflict: true, IsReadOnly: false, SelectedSide: 'custom', CustomValue: null, LeftValue: 'a', RightValue: 'b' },
        // Resolved to the survivor's own side: still nothing to write.
        { FieldName: 'City', HasConflict: true, IsReadOnly: false, SelectedSide: 'left', LeftValue: 'Springfield', RightValue: 'Riverton' },
      ],
    });

    expect(mergeRecords.mock.calls[0][0].FieldMap).toEqual([
      { FieldName: 'Name', Value: null },
      { FieldName: 'Website', Value: null },
    ]);
  });

  it('probes an IS-A child with the child\'s own key column name, not the parent\'s', async () => {
    // An IS-A child shares its parent's key semantically, not necessarily by column name. Filtering
    // the child view with the parent's names fails, and a failed probe refuses the merge — which
    // would disable merge for that entity permanently.
    const parent = partyEntity();
    const child = new EntityInfo({
      ID: 'E0000003-0000-0000-0000-000000000003',
      Name: 'Test Sales Accounts',
      Status: 'Active',
      BaseTable: 'SalesAccount',
      BaseView: 'vwSalesAccounts',
      Fields: [{ ID: 'C1', Name: 'AccountID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true }],
    });
    Object.defineProperty(parent, 'ChildEntities', { get: () => [child] });

    const filters: (string | undefined)[] = [];
    const p = provider({
      RunViews: async (params: { EntityName: string; ExtraFilter?: string }[]) => {
        filters.push(...params.map(x => x.ExtraFilter));
        return params.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 }));
      },
    });
    const f = render(parent, p);
    await host(f).onMergeRequested({ entityInfo: parent, records: twoParties });

    expect(filters[0]).toContain('[AccountID]');
    expect(filters[0]).not.toContain('[ID]');
    // Probe answered "no subtype rows", so the merge panel opened.
    expect(host(f).mergeState).not.toBeNull();
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

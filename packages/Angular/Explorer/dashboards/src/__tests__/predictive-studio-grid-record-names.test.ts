import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInInjectionContext, Injector, ChangeDetectorRef } from '@angular/core';
import { NavigationService } from '@memberjunction/ng-shared';
import type { IMetadataProvider, EntityInfo, EntityRecordNameInput, EntityRecordNameResult } from '@memberjunction/core';
import { PSPredictionsGridComponent, type PredictionGridRow } from '../PredictiveStudio/components/ps-predictions-grid.component';
import { PredictiveStudioScoreHistoryService } from '../PredictiveStudio/predictive-studio-score-history.service';

describe('PSPredictionsGridComponent - Record Column & Lazy Viewport Lookup', () => {
  let component: PSPredictionsGridComponent;

  beforeEach(() => {
    const mockInjector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } },
        { provide: NavigationService, useValue: { OpenEntityRecord: vi.fn() } },
        { provide: PredictiveStudioScoreHistoryService, useValue: { LoadRecordScoreHistory: vi.fn() } },
      ],
    });

    runInInjectionContext(mockInjector, () => {
      component = new PSPredictionsGridComponent();
    });

    component.setupColumnDefs();
  });

  it('sets the record column header strictly to "Record" without hardcoded "Member"', () => {
    const recordCol = component.columnDefs.find((col) => col.field === 'recordName');
    expect(recordCol).toBeDefined();
    expect(recordCol?.headerName).toBe('Record');
  });

  it('renders record link with open-in-explorer icon and data-action="open-record"', () => {
    const recordCol = component.columnDefs.find((col) => col.field === 'recordName');
    expect(recordCol?.cellRenderer).toBeDefined();

    const mockRow: PredictionGridRow = {
      recordId: 'rec-uuid-1234',
      recordName: 'Anneke Bergman',
      score: 0.88,
      scoreFormatted: '88.0%',
      riskPct: 12,
      band: 'low',
      class: 'Renewed',
      drivers: [],
      status: 'Succeeded',
      scoredAtDate: new Date('2026-09-19T12:00:00Z'),
    };

    const renderedHtml = (recordCol!.cellRenderer as (params: { data: PredictionGridRow }) => string)({
      data: mockRow,
    });

    expect(renderedHtml).toContain('pg-record-link');
    expect(renderedHtml).toContain('data-action="open-record"');
    expect(renderedHtml).toContain('fa-arrow-up-right-from-square');
    expect(renderedHtml).toContain('Anneke Bergman');
    expect(renderedHtml).toContain('rec-uuid-1234');
  });

  it('falls back to recordId when recordName is not yet resolved', () => {
    const recordCol = component.columnDefs.find((col) => col.field === 'recordName');
    const mockRow: PredictionGridRow = {
      recordId: 'rec-uuid-9999',
      recordName: 'rec-uuid-9999',
      score: 0.25,
      scoreFormatted: '25.0%',
      riskPct: 75,
      band: 'high',
      class: 'Lapsed',
      drivers: [],
      status: 'Succeeded',
      scoredAtDate: null,
    };

    const renderedHtml = (recordCol!.cellRenderer as (params: { data: PredictionGridRow }) => string)({
      data: mockRow,
    });

    expect(renderedHtml).toContain('rec-uuid-9999');
    expect(renderedHtml).not.toContain('pg-record-id ps-mono');
  });

  it('lazily queries GetEntityRecordNames ONLY for visible uncached rows', async () => {
    const mockEntity: Partial<EntityInfo> = {
      Name: 'MoreCheese: Membership Periods',
      FirstPrimaryKey: { Name: 'ID' } as unknown as EntityInfo['FirstPrimaryKey'],
      PrimaryKeys: [{ Name: 'ID' }] as unknown as EntityInfo['PrimaryKeys'],
    };

    const mockGetEntityRecordNames = vi.fn().mockImplementation(
      async (inputs: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> => {
        return inputs.map((inp) => ({
          Success: true,
          Status: 'Success',
          CompositeKey: inp.CompositeKey,
          EntityName: inp.EntityName,
          RecordName: `Member for ${inp.CompositeKey.GetValueByIndex(0)}`,
        }));
      },
    );

    const mockProvider = {
      EntityByName: vi.fn().mockReturnValue(mockEntity),
      GetEntityRecordNames: mockGetEntityRecordNames,
      CurrentUser: undefined,
    } as unknown as IMetadataProvider;

    Object.defineProperty(component, 'ProviderToUse', { get: () => mockProvider });
    component.resolvedEntityName = 'MoreCheese: Membership Periods';

    const visibleRows: PredictionGridRow[] = [
      {
        recordId: 'uuid-1',
        recordName: 'uuid-1',
        score: 0.9,
        scoreFormatted: '90%',
        riskPct: 10,
        band: 'low',
        class: null,
        drivers: [],
        status: 'Succeeded',
        scoredAtDate: null,
      },
      {
        recordId: 'uuid-2',
        recordName: 'uuid-2',
        score: 0.4,
        scoreFormatted: '40%',
        riskPct: 60,
        band: 'medium',
        class: null,
        drivers: [],
        status: 'Succeeded',
        scoredAtDate: null,
      },
    ];

    const mockGridApi = {
      getRenderedNodes: vi.fn().mockReturnValue([
        { data: visibleRows[0] },
        { data: visibleRows[1] },
      ]),
      refreshCells: vi.fn(),
    };

    (component as unknown as { gridApi: unknown }).gridApi = mockGridApi;
    component.allRows = [...visibleRows];

    // Execute lazy resolution
    await (component as unknown as { resolveVisibleRecordNames: () => Promise<void> }).resolveVisibleRecordNames();

    expect(mockGetEntityRecordNames).toHaveBeenCalledTimes(1);
    const calledInputs = mockGetEntityRecordNames.mock.calls[0][0] as EntityRecordNameInput[];
    expect(calledInputs.length).toBe(2);
    expect(calledInputs[0].EntityName).toBe('MoreCheese: Membership Periods');
    expect(calledInputs[0].CompositeKey.GetValueByIndex(0)).toBe('uuid-1');
    expect(calledInputs[1].CompositeKey.GetValueByIndex(0)).toBe('uuid-2');

    // Verify rows updated
    expect(visibleRows[0].recordName).toBe('Member for uuid-1');
    expect(visibleRows[1].recordName).toBe('Member for uuid-2');

    // Second call: cached, no additional server calls
    await (component as unknown as { resolveVisibleRecordNames: () => Promise<void> }).resolveVisibleRecordNames();
    expect(mockGetEntityRecordNames).toHaveBeenCalledTimes(1);
  });
});

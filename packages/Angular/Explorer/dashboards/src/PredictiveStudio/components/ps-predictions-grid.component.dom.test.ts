import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import type { RunViewParams } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { PredictiveStudioEngine, type PSRunDetailRow } from '../engine/predictive-studio.engine';
import { PSPredictionsGridComponent, type PredictionGridRowsLoadedEvent } from './ps-predictions-grid.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-predictions-grid>'s tiers. The grid reads the model through its `Provider` (a fake that serves
 * the model row) and the run through `PredictiveStudioEngine.LoadRunDetails` (spied). Classification models tier by
 * risk, so a renewal model's 0.95 score is low risk; regression models tier by their outcome bands on the raw value.
 */

/** The model fields the grid reads to resolve its problem type, outcome config and polarity. */
type ModelRow = Pick<MJMLModelEntity, 'ID' | 'ProblemType' | 'TargetVariable' | 'Lineage'>;

const detail = (recordId: string, score: number): PSRunDetailRow => ({
  ID: `d-${recordId}`,
  RecordID: recordId,
  ResultPayload: JSON.stringify({ score }),
  Status: 'Succeeded',
  CompletedAt: new Date('2026-10-01T00:00:00Z'),
  __mj_CreatedAt: new Date('2026-10-01T00:00:00Z'),
});

async function renderGrid(model: ModelRow, rows: PSRunDetailRow[], capped = false): Promise<{ fixture: ComponentFixture<PSPredictionsGridComponent>; loaded: PredictionGridRowsLoadedEvent[] }> {
  vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails').mockResolvedValue({ Rows: rows, Capped: capped });
  const provider = createFakeProvider<ModelRow>({ runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: ML Models' ? [model] : []) });
  let loaded: PredictionGridRowsLoadedEvent[] = [];
  const fixture = renderComponentFixture(PSPredictionsGridComponent, {
    inputs: { modelId: model.ID, RunId: 'run-1', Provider: provider },
    providers: [{ provide: NavigationService, useValue: {} }],
    setup: (instance) => {
      loaded = capture(instance.RowsLoaded);
    },
  });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return { fixture, loaded };
}

/** The tier chip buttons' text, e.g. "High risk (2)". */
const tierChips = (fixture: ComponentFixture<PSPredictionsGridComponent>): string[] =>
  queryAll(fixture, '.pg-tier-btn').map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());

afterEach(() => vi.restoreAllMocks());

describe('PSPredictionsGridComponent (DOM) — tiers', () => {
  const renewal: ModelRow = { ID: 'm-renew', ProblemType: 'classification', TargetVariable: 'Renewed', Lineage: null };

  it('a renewal model tiers by risk: a 0.95 score is low risk and High holds the riskiest rows', async () => {
    const { fixture } = await renderGrid(renewal, [detail('r-safe', 0.95), detail('r-lapse1', 0.1), detail('r-lapse2', 0.2), detail('r-mid', 0.5)]);
    const grid = fixture.componentInstance;
    expect(grid.IsRenewalModel).toBe(true);
    expect(grid.AllRows.find((r) => r.recordId === 'r-safe')?.band).toBe('low');
    expect(grid.AllRows.find((r) => r.recordId === 'r-safe')?.status).toBe('Low risk');
    expect(grid.AllRows.filter((r) => r.band === 'high').map((r) => r.recordId).sort()).toEqual(['r-lapse1', 'r-lapse2']);
    expect(tierChips(fixture)).toEqual(['All (4)', 'High risk (2)', 'Medium risk (1)', 'Low risk (1)']);
    expect(grid.ColumnDefs.find((c) => c.field === 'riskPct')?.hide).toBe(false);
  });

  it('emits the parsed rows once, with the capped flag', async () => {
    const { loaded } = await renderGrid(renewal, [detail('a', 0.9), detail('b', 0.3)], true);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].Capped).toBe(true);
    expect(loaded[0].Rows.map((r) => r.RecordID)).toEqual(['b', 'a']);
  });

  it('shows the capped notice when the run was capped', async () => {
    const { fixture } = await renderGrid(renewal, [detail('a', 0.9)], true);
    expect(query(fixture, '[data-testid="ps-predictions-capped"]')?.textContent).toContain(PredictiveStudioEngine.MaxRunDetailRowsLabel);
  });

  it('shows no capped notice for a complete run', async () => {
    const { fixture } = await renderGrid(renewal, [detail('a', 0.9)], false);
    expect(query(fixture, '[data-testid="ps-predictions-capped"]')).toBeNull();
  });

  it('a regression model tiers by its outcome bands on the raw value and hides the risk column', async () => {
    const revenue: ModelRow = { ID: 'm-rev', ProblemType: 'regression', TargetVariable: 'Revenue', Lineage: null };
    const { fixture } = await renderGrid(revenue, [detail('big', 3000), detail('mid', 1000), detail('small1', 100), detail('small2', 50)]);
    const grid = fixture.componentInstance;
    expect(grid.IsRenewalModel).toBe(false);
    expect(grid.AllRows.find((r) => r.recordId === 'big')?.band).toBe('high');
    expect(grid.AllRows.find((r) => r.recordId === 'big')?.status).toBe('High Value');
    expect(grid.AllRows.find((r) => r.recordId === 'small1')?.band).toBe('standard');
    expect(tierChips(fixture)).toEqual(['All (4)', 'High Value (1)', 'Medium Value (1)', 'Standard Value (2)']);
    expect(grid.ColumnDefs.find((c) => c.field === 'riskPct')?.hide).toBe(true);
  });

  it('labels the driver chips and the CSV drivers column with the direction of risk', async () => {
    const payload = (score: number, drivers: object[]) => ({ ...detail('r1', score), ResultPayload: JSON.stringify({ score, drivers }) });
    const { fixture } = await renderGrid(renewal, [payload(0.9, [{ feature: 'AutoRenew', value: 1.2 }])]);
    const grid = fixture.componentInstance;
    const row = grid.AllRows[0];
    expect(row.drivers[0].Up).toBe(false);
    const driversCol = grid.ColumnDefs.find((c) => c.field === 'drivers');
    const html = (driversCol?.cellRenderer as (p: { data: typeof row }) => string)({ data: row });
    expect(html).toContain('title="Auto Renew: lowers risk"');
    expect(html).toContain('fa-arrow-down');

    const blobs: Blob[] = [];
    const urlApi = URL as typeof URL & { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    urlApi.createObjectURL = (b: Blob) => {
      blobs.push(b);
      return 'blob:test';
    };
    urlApi.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    grid.ExportCSV();
    // jsdom's Blob has no text(); FileReader reads it.
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]);
    });
    expect(csv.split('\n')[0]).toContain('"Top Drivers (+ raises risk, − lowers risk)"');
    expect(csv.split('\n')[1]).toContain('−Auto Renew');
  });
});

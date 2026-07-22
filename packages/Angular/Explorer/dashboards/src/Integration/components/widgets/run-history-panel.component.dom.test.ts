import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { RunHistoryPanelComponent } from './run-history-panel.component';
import { IntegrationDataService, IntegrationRunRow, RunDetailRow } from '../../services/integration-data.service';

/**
 * DOM coverage for <app-run-history-panel>. It injects IntegrationDataService — faked here with just
 * the three members the component touches (LoadRunHistory, LoadRunDetails, FormatDuration). Loading
 * is driven off the CompanyIntegrationID input via ngOnChanges; we set it via setInput and await the
 * async LoadRuns() flip (default CD, so a plain detectChanges after the microtask suffices).
 * mj-loading / mj-empty-state are stubbed. Covers: empty state, the run table + status chips, and
 * the row-click → detail-load expansion.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '<span class="stub-loading">{{ text }}</span>' })
class LoadingStub { @Input() text = ''; @Input() size = ''; }

@Component({ standalone: true, selector: 'mj-empty-state', template: '<div class="stub-empty">{{ Title }}</div>' })
class EmptyStateStub { @Input() Title = ''; @Input() Icon = ''; @Input() Size = ''; }

function runRow(over: Partial<IntegrationRunRow> = {}): IntegrationRunRow {
  return {
    ID: 'r1', CompanyIntegrationID: 'ci1', StartedAt: '2026-01-01T10:00:00Z', EndedAt: '2026-01-01T10:01:00Z',
    TotalRecords: 42, Status: 'Success', ErrorLog: null, Integration: 'HubSpot', Company: 'Acme', RunByUser: 'Jane', ...over,
  };
}

function fakeService(runs: IntegrationRunRow[], details: RunDetailRow[] = []): IntegrationDataService {
  return {
    LoadRunHistory: async () => runs,
    LoadRunDetails: async () => details,
    FormatDuration: (ms: number) => `${Math.round(ms / 1000)}s`,
  } as unknown as IntegrationDataService;
}

/**
 * Render with CompanyIntegrationID supplied up-front (via `inputs`) so ngOnChanges fires its async
 * LoadRuns() during the first (strict) pass while Runs is still []. After the LoadRuns() promise
 * resolves the array flips (0 → N rows) post-render, which strict CD would flag as NG0100 — so we
 * repaint with the non-strict `detectChanges(false)` after the microtask.
 */
async function render(service: IntegrationDataService): Promise<ReturnType<typeof renderComponentFixture<RunHistoryPanelComponent>>> {
  const fixture = renderComponentFixture(RunHistoryPanelComponent, {
    imports: [CommonModule, LoadingStub, EmptyStateStub],
    declarations: [RunHistoryPanelComponent],
    providers: [{ provide: IntegrationDataService, useValue: service }],
    inputs: { CompanyIntegrationID: 'ci1' },
  });
  await new Promise((r) => setTimeout(r, 0));
  // The async LoadRuns() mutated a plain property post-render; mark the view dirty then repaint
  // non-strict (the 0→N flip would otherwise trip strict CD's NG0100 check).
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('RunHistoryPanelComponent (DOM)', () => {
  it('renders the empty state when the service returns no runs', async () => {
    const fixture = await render(fakeService([]));
    expect(query(fixture, '.stub-empty')).not.toBeNull();
    expect(text(fixture, '.stub-empty')).toContain('No runs recorded yet');
    expect(query(fixture, '.history-table')).toBeNull();
  });

  it('renders a table row per run with its status chip', async () => {
    const fixture = await render(fakeService([runRow({ ID: 'a', Status: 'Success' }), runRow({ ID: 'b', Status: 'Failed' })]));
    expect(queryAll(fixture, 'tbody tr.run-row').length).toBe(2);
    expect(query(fixture, '.run-status-chip.chip-green')).not.toBeNull();
    expect(query(fixture, '.run-status-chip.chip-red')).not.toBeNull();
  });

  it('expands an entity-breakdown detail row when a run is clicked', async () => {
    const details: RunDetailRow[] = [{
      EntityID: 'e1', Entity: 'Contacts', RecordsProcessed: 10, RecordsCreated: 4,
      RecordsUpdated: 6, RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0,
    }];
    const fixture = await render(fakeService([runRow({ ID: 'a' })], details));
    expect(query(fixture, '.detail-panel')).toBeNull();

    (query(fixture, 'tbody tr.run-row') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);

    expect(query(fixture, '.detail-panel')).not.toBeNull();
    expect(text(fixture, '.detail-table')).toContain('Contacts');
  });
});

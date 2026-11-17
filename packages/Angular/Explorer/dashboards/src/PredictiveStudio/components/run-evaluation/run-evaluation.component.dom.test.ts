import { describe, expect, it, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PSRunEvaluationComponent } from './run-evaluation.component';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { VersionRowDoubles } from '../versioned-list/version-rows.test-support';
import { WidgetFixtures } from '../evaluation-results/widget-fixtures';

const MODEL_ID = 'AAAAAAAA-1111-4222-8333-555555555555';
const RUN_ID = 'BBBBBBBB-1111-4222-8333-666666666666';

/** The widget over a store with no rows, initialized and loaded for the given model and run. */
async function render(modelId: string | null, runId: string | null): Promise<ComponentFixture<PSRunEvaluationComponent>> {
  const store = VersionRowDoubles.CreateStore([]);
  const fixture = TestBed.createComponent(PSRunEvaluationComponent);
  fixture.componentInstance.Provider = store.Provider;
  fixture.componentInstance.ModelID = modelId;
  fixture.componentInstance.TrainingRunID = runId;
  fixture.detectChanges();
  // ngOnInit starts a load it does not await; awaiting a second load here supersedes it, so the test sees the loaded state
  await fixture.componentInstance.Load();
  return fixture;
}

describe('PSRunEvaluationComponent inputs (DOM)', () => {
  it('does not reload when the model ID is set again in another case, and reloads for another model', async () => {
    const widget = (await render(MODEL_ID, null)).componentInstance;
    const load = vi.spyOn(widget, 'Load');
    widget.ModelID = MODEL_ID.toLowerCase();
    expect(load).not.toHaveBeenCalled();
    widget.ModelID = RUN_ID;
    expect(load).toHaveBeenCalledTimes(1);
    await load.mock.results[0]?.value;
  });

  it('does not reload when the training run ID is set again in another case, and reloads for another run', async () => {
    const widget = (await render(null, RUN_ID)).componentInstance;
    const load = vi.spyOn(widget, 'Load');
    widget.TrainingRunID = RUN_ID.toLowerCase();
    expect(load).not.toHaveBeenCalled();
    widget.TrainingRunID = MODEL_ID;
    expect(load).toHaveBeenCalledTimes(1);
    await load.mock.results[0]?.value;
  });
});

describe('PSRunEvaluationComponent snapshot counts (DOM)', () => {
  const SNAPSHOT_ID = 'CCCCCCCC-1111-4222-8333-777777777777';

  /** A provider whose views return the run (by ID) and its Training Snapshot (by ID), and records every read. */
  function storeWithRunAndSnapshot(reads: RunViewParams[]): IMetadataProvider {
    const run = { ID: RUN_ID, ValidationResults: WidgetFixtures.StoredRunJson(), ResultingModelID: null, Status: 'Completed', TrainingSnapshotID: SNAPSHOT_ID };
    const snapshot = { ID: SNAPSHOT_ID, UncoveredHistoryRowsExcluded: JSON.stringify([{ entity: 'Members', field: 'Tier', rows: 12 }]) };
    const provider: IMetadataProvider = Object.create(null);
    const runView = async (params: RunViewParams): Promise<RunViewResult<typeof run | typeof snapshot>> => {
      reads.push(params);
      const rows = params.EntityName === 'MJ: ML Training Runs' ? [run] : params.EntityName === 'MJ: ML Training Snapshots' ? [snapshot] : [];
      return VersionRowDoubles.ViewResult<typeof run | typeof snapshot>(rows);
    };
    Object.assign(provider, { CurrentUser: { ID: 'u1' }, RunView: runView, RunViews: async (all: RunViewParams[]) => Promise.all(all.map(runView)) });
    return provider;
  }

  it('reads the run\'s Training Snapshot and shows its uncovered history rows with the run\'s resolution counts', async () => {
    const reads: RunViewParams[] = [];
    const fixture = TestBed.createComponent(PSRunEvaluationComponent);
    fixture.componentInstance.Provider = storeWithRunAndSnapshot(reads);
    fixture.componentInstance.TrainingRunID = RUN_ID;
    fixture.detectChanges();
    await fixture.componentInstance.Load();
    const host: HTMLElement = fixture.nativeElement;
    expect(reads.some((r) => r.EntityName === 'MJ: ML Training Snapshots' && r.ExtraFilter === `ID='${SNAPSHOT_ID}'`)).toBe(true);
    expect(host.querySelector('[data-testid="ps-eval-rows"]')?.textContent).toContain('1756');
    expect(host.querySelector('[data-testid="ps-eval-uncovered"]')?.textContent).toContain('Members.Tier: 12');
  });
});

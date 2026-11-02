import { describe, expect, it, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PSRunEvaluationComponent } from './run-evaluation.component';
import { VersionRowDoubles } from '../versioned-list/version-rows.test-support';

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

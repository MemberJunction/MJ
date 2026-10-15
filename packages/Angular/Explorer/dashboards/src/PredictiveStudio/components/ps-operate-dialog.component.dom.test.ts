import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSOperateDialogComponent } from './ps-operate-dialog.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-operate-dialog> — "Operate this model" (scope + output knobs → run/schedule). It
 * extends BaseAngularComponent (reads `ProviderToUse`, supplied via `Provider`) and opens on the Visible
 * setter, loading views/lists/fields for the model's training entity through RunView (the fake provider
 * returns empty rows, so no backend). The engine fake supplies `ModelByID` + `Pipelines`. We assert the
 * scope/output segmented controls, the writeback column field gating, and the Cancel → Close emission.
 * Standalone.
 */

const ENGINE = {
  ModelByID: () => ({ ID: 'm1', ProblemType: 'classification', PipelineID: 'p1' }),
  Pipelines: [{ ID: 'p1', TargetEntityID: 'e1' }],
  Config: async () => undefined,
} as unknown as PredictiveStudioEngine;

const render = (visible = true) =>
  renderComponentFixture(PSOperateDialogComponent, {
    inputs: {
      // Provider MUST be applied before Visible: the Visible setter runs init() (which reads
      // ProviderToUse) synchronously during setInput, and inputs apply in insertion order.
      Provider: createFakeProvider({ runViewResults: [], entities: [] }),
      modelId: 'm1',
      modelLabel: 'Renewal Model',
      engine: ENGINE,
      Visible: visible,
    },
  });

describe('PSOperateDialogComponent (DOM)', () => {
  it('renders the dialog body with the scope + output segmented controls', () => {
    const fixture = render(true);
    expect(query(fixture, '[data-testid="ps-operate-dialog"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-operate-scope"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-operate-output"]')).not.toBeNull();
  });

  it('names the model in the live summary', () => {
    const fixture = render(true);
    expect(query(fixture, '[data-testid="ps-operate-summary"]')?.textContent).toContain('Renewal Model');
  });

  it('hides the writeback column input until write-back output is chosen', () => {
    const fixture = render(true);
    expect(query(fixture, '[data-testid="ps-operate-column"]')).toBeNull();
    const writebackBtn = queryAll(fixture, '[data-testid="ps-operate-output"] button')[1] as HTMLElement;
    writebackBtn.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="ps-operate-column"]')).not.toBeNull();
  });

  it('reveals the view picker when the "saved view" scope is chosen', () => {
    const fixture = render(true);
    expect(query(fixture, '[data-testid="ps-operate-view"]')).toBeNull();
    const viewBtn = queryAll(fixture, '[data-testid="ps-operate-scope"] button')[1] as HTMLElement;
    viewBtn.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="ps-operate-view"]')).not.toBeNull();
  });

  it('exposes the Run now + Schedule action buttons', () => {
    const fixture = render(true);
    expect(query(fixture, '[data-testid="ps-operate-run"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-operate-schedule"]')).not.toBeNull();
  });

  it('emits Close({changed:false}) when Cancel is clicked', () => {
    const fixture = render(true);
    const closed = capture(fixture.componentInstance.Close);
    fixture.componentInstance.onCancel();
    expect(closed).toEqual([{ changed: false }]);
  });
});

describe('PSOperateDialogComponent Run now notice (F16 sweep)', () => {
  const output = { processRunID: 'run-1', processed: 4, success: 3, error: 1, skipped: 0 };

  it('reports a Failed run as an error with the run\'s message, not as scored', () => {
    const notice = PSOperateDialogComponent.RunNowNotice({ Success: true, Output: { ...output, status: 'Failed', errorMessage: 'Circuit breaker: error rate 25.0%' } });

    expect(notice).toEqual({ Style: 'error', Message: 'The run failed: Circuit breaker: error rate 25.0% (the process was created and can be run again).' });
  });

  it('reports a completed run as scored, and one that stopped as a warning', () => {
    expect(PSOperateDialogComponent.RunNowNotice({ Success: true, Output: { ...output, error: 0, status: 'Completed' } }))
      .toEqual({ Style: 'success', Message: 'Scored 3/4 record(s) — Completed.' });
    expect(PSOperateDialogComponent.RunNowNotice({ Success: true, Output: { ...output, status: 'Completed' } }))
      .toEqual({ Style: 'warning', Message: 'Scored 3/4 record(s) — Completed, 1 error(s).' });
    expect(PSOperateDialogComponent.RunNowNotice({ Success: true, Output: { ...output, status: 'Cancelled' } }).Style).toBe('warning');
  });

  it('reports an operation failure with its error', () => {
    expect(PSOperateDialogComponent.RunNowNotice({ Success: false, ErrorMessage: 'not authorized' })).toEqual({ Style: 'error', Message: 'not authorized' });
  });
});

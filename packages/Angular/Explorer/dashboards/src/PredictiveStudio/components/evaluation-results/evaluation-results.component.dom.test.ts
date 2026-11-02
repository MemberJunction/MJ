import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PSEvaluationResultsComponent } from './evaluation-results.component';
import { EvaluationViews } from './evaluation-view';
import { WidgetFixtures } from './widget-fixtures';
import { PSDomQueries } from '../ps-dom-queries.test-support';

describe('PSEvaluationResultsComponent (DOM)', () => {
  function render(json: string | null, runStatus: 'Completed' | 'Failed' | 'Running' | null = 'Completed'): HTMLElement {
    const fixture = TestBed.createComponent(PSEvaluationResultsComponent);
    fixture.componentInstance.State = EvaluationViews.DescribeRun({ ValidationResults: json, Lineage: null, RunStatus: runStatus });
    fixture.detectChanges();
    return PSDomQueries.HostElement(fixture);
  }

  it('shows the outcome, the reason, scores with intervals, baselines, calibration and leakage flags', () => {
    const host = render(WidgetFixtures.StoredRunJson());
    expect(host.querySelector('[data-testid="ps-eval-outcome"]')?.textContent).toContain('Ships — a simple baseline');
    expect(host.querySelector('[data-testid="ps-eval-reason"]')?.textContent).toContain('0.0239 [0.0110, 0.0360]');
    expect(host.querySelector('[data-testid="ps-eval-scores"]')?.textContent).toContain('0.3712 [0.3330, 0.4130]');
    expect(host.querySelectorAll('[data-testid="ps-eval-baseline"]').length).toBe(3);
    expect(host.querySelectorAll('[data-testid="ps-eval-optimistic"]').length).toBe(1);
    expect(host.querySelector('[data-testid="ps-eval-optimistic"]')?.textContent).toContain('optimistic');
    expect(host.querySelector('[data-testid="ps-eval-calibration"]')?.textContent).toContain('0.826');
    expect(host.querySelector('[data-testid="ps-eval-leakage"]')?.textContent).toContain('TicketCode');
  });

  it('says plainly when a run was not evaluated under a protocol', () => {
    const host = render(JSON.stringify({ metrics: { auc: 0.9 } }));
    expect(host.querySelector('[data-testid="ps-eval-empty"]')?.textContent).toContain('not evaluated under an Evaluation Protocol');
  });

  it('says a run has not finished, and does not claim it was never evaluated', () => {
    const host = render(null, 'Running');
    expect(host.querySelector('[data-testid="ps-eval-not-finished"]')?.textContent).toContain('has not finished yet (Running)');
    expect(host.querySelector('[data-testid="ps-eval-empty"]')).toBeNull();
  });

  it('shows the stage and reason of a refused run', () => {
    const host = render(WidgetFixtures.RefusedRunJson(), 'Failed');
    expect(host.querySelector('[data-testid="ps-eval-refused"]')?.textContent).toContain('refused at the carve stage: No row is dated on or after the cutoff 2026-01-01');
  });

  it('says when stored results cannot be read', () => {
    const host = render(JSON.stringify({ schema: 'ps-run-results/v2', status: 'completed' }));
    expect(host.querySelector('[data-testid="ps-eval-unreadable"]')?.textContent).toContain('cannot be read');
  });
});

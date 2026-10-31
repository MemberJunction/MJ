import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PSEvaluationResultsComponent } from './evaluation-results.component';
import { EvaluationViews } from './evaluation-view';
import { WidgetFixtures } from './widget-fixtures';

describe('PSEvaluationResultsComponent (DOM)', () => {
  function render(json: string | null): HTMLElement {
    const fixture = TestBed.createComponent(PSEvaluationResultsComponent);
    fixture.componentInstance.View = EvaluationViews.BuildEvaluationView({ ValidationResults: json, Lineage: null });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
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
    const host = render(null);
    expect(host.querySelector('[data-testid="ps-eval-empty"]')?.textContent).toContain('not evaluated under an Evaluation Protocol');
  });
});

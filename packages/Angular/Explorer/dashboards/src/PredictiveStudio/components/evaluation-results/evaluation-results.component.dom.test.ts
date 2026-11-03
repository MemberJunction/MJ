import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PSEvaluationResultsComponent } from './evaluation-results.component';
import { EvaluationViews } from './evaluation-view';
import { WidgetFixtures } from './widget-fixtures';
import { PSDomQueries } from '../ps-dom-queries.test-support';
import type { GateDecision, StoredGateRecord } from '@memberjunction/predictive-studio-core';

describe('PSEvaluationResultsComponent (DOM)', () => {
  function render(json: string | null, runStatus: 'Completed' | 'Failed' | 'Running' | null = 'Completed', uncovered: string | null = null): HTMLElement {
    const fixture = TestBed.createComponent(PSEvaluationResultsComponent);
    fixture.componentInstance.State = EvaluationViews.DescribeRun({ ValidationResults: json, Lineage: null, RunStatus: runStatus, UncoveredHistoryRows: uncovered });
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

  it('shows the snapshot counts above the test set: resolved, censored, label-known, empty-label and uncovered rows', () => {
    const host = render(WidgetFixtures.StoredRunJson(), 'Completed', JSON.stringify([{ entity: 'Members', field: 'Tier', rows: 12 }]));
    const rows = host.querySelector('[data-testid="ps-eval-rows"]');
    const cells = Array.from(rows?.querySelectorAll('tr') || []).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim()).join(' = '));
    expect(cells).toEqual([
      'Rows read = 6673',
      'Resolved (trained and tested on) = 4873',
      'Censored (outcome not yet known) = 1756',
      'Label already known at the decision date = 44',
      'Empty label = 0',
      'Duplicates removed = 0',
    ]);
    expect(host.querySelector('[data-testid="ps-eval-uncovered"]')?.textContent).toContain('Members.Tier: 12');
    const scores = host.querySelector('[data-testid="ps-eval-scores"]');
    expect(rows !== null && scores !== null && (rows.compareDocumentPosition(scores) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('says when the run has no Training Snapshot to read uncovered rows from', () => {
    const host = render(WidgetFixtures.StoredRunJson());
    expect(host.querySelector('[data-testid="ps-eval-uncovered"]')?.textContent).toContain('no Training Snapshot');
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

  describe('the finalist tag', () => {
    const shipped: GateDecision = { outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: null };
    const stored = WidgetFixtures.StoredRunEnvelope();
    const title = (host: HTMLElement): string => host.querySelector('[data-testid="ps-eval-optimistic"]')?.getAttribute('title') || '';
    const shippedGate = (): StoredGateRecord | null => (stored.gate === null ? null : { ...stored.gate, transcribed: shipped, decision: shipped });

    it('says the winner was the best of several tries when the search had several candidates and the finalist shipped', () => {
      expect(title(render(WidgetFixtures.StoredRunJson({ gate: shippedGate() })))).toContain('best of several tries');
    });

    it('does not call the finalist the winner when the gate kept a simple baseline', () => {
      const text = title(render(WidgetFixtures.StoredRunJson()));
      expect([text.includes('best of several tries'), text.includes('did not ship')]).toEqual([false, true]);
    });

    it('does not claim a selection when the search had one candidate', () => {
      const one = stored.trainer === null ? null : { ...stored.trainer, innerScores: stored.trainer.innerScores.slice(0, 1) };
      const text = title(render(WidgetFixtures.StoredRunJson({ trainer: one, gate: shippedGate() })));
      expect([text.includes('best of several tries'), text.includes('only candidate')]).toEqual([false, true]);
    });

    const tag = (host: HTMLElement): string => host.querySelector('[data-testid="ps-eval-optimistic"]')?.textContent?.trim() || '';

    it('tags a lone candidate "only candidate", never optimistic, and the finalist of several "finalist · optimistic"', () => {
      const one = stored.trainer === null ? null : { ...stored.trainer, innerScores: stored.trainer.innerScores.slice(0, 1) };
      expect(tag(render(WidgetFixtures.StoredRunJson({ trainer: one, gate: shippedGate() })))).toBe('only candidate');
      expect(tag(render(WidgetFixtures.StoredRunJson({ gate: shippedGate() })))).toBe('finalist · optimistic');
    });
  });
});

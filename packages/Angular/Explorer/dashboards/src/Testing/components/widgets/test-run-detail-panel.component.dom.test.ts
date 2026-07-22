import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { TestRunDetailPanelComponent } from './test-run-detail-panel.component';
import type { TestRunSummary } from '../../services/testing-instrumentation.service';

/**
 * DOM coverage for <app-test-run-detail-panel>. No injected services — pure @Input presentation with
 * ngModel-bound feedback fields (FormsModule). The four presentational children
 * (test-status-badge / score-indicator / cost-display / oracle-breakdown-table) are stubbed as
 * lightweight standalone components. `resultDetails` is left null so the mj-accordion-panel branch
 * (structural mjAccordionBody templates) is never entered — keeping the render infra-free. Covers:
 * whole-panel gating on `testRun`, the header, close/oracle/target gating, and close / viewTarget /
 * submitFeedback outputs.
 */

@Component({ standalone: true, selector: 'app-test-status-badge', template: '' })
class StatusBadgeStub { @Input() status = ''; }
@Component({ standalone: true, selector: 'app-score-indicator', template: '' })
class ScoreStub { @Input() score = 0; @Input() showBar = false; @Input() showIcon = false; }
@Component({ standalone: true, selector: 'app-cost-display', template: '' })
class CostStub { @Input() cost = 0; @Input() showIcon = false; }
@Component({ standalone: true, selector: 'app-oracle-breakdown-table', template: '<div class="stub-oracle"></div>' })
class OracleStub { @Input() results: unknown[] = []; }

function testRun(over: Partial<TestRunSummary> = {}): TestRunSummary {
  return {
    id: 't1', testId: 'test-1', testName: 'Sentiment check', suiteName: 'Suite A', testType: 'Oracle',
    status: 'Passed', score: 0.92, duration: 4200, cost: 0.0031, runDateTime: new Date('2026-01-01T10:00:00Z'),
    targetType: 'MJ: AI Prompt Runs', targetLogID: 'log-9', ...over,
  };
}

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(TestRunDetailPanelComponent, {
    imports: [CommonModule, FormsModule, StatusBadgeStub, ScoreStub, CostStub, OracleStub],
    declarations: [TestRunDetailPanelComponent],
    inputs,
  });

describe('TestRunDetailPanelComponent (DOM)', () => {
  it('renders nothing when testRun is not provided', () => {
    const fixture = render({});
    expect(query(fixture, '.test-run-detail-panel')).toBeNull();
  });

  it('renders the header with test name and type when a run is provided', () => {
    const fixture = render({ testRun: testRun(), oracleResults: [], resultDetails: null });
    expect(text(fixture, '.header-left h3')).toContain('Sentiment check');
    expect(text(fixture, '.test-type')).toContain('Oracle');
  });

  it('hides the close button when not closeable', () => {
    expect(query(render({ testRun: testRun(), closeable: false, resultDetails: null }), '.close-btn')).toBeNull();
  });

  it('shows the close button and emits close on click when closeable', () => {
    const fixture = render({ testRun: testRun(), closeable: true, resultDetails: null });
    const closed = capture(fixture.componentInstance.close);
    (query(fixture, '.close-btn') as HTMLElement).click();
    expect(closed.length).toBe(1);
  });

  it('hides the oracle breakdown when oracleResults is empty', () => {
    expect(query(render({ testRun: testRun(), oracleResults: [], resultDetails: null }), '.stub-oracle')).toBeNull();
  });

  it('renders the oracle breakdown when oracleResults is non-empty', () => {
    const fixture = render({ testRun: testRun(), oracleResults: [{ name: 'x' }], resultDetails: null });
    expect(query(fixture, '.stub-oracle')).not.toBeNull();
  });

  it('emits viewTarget with type/id when the target link is clicked', () => {
    const fixture = render({ testRun: testRun(), oracleResults: [], resultDetails: null });
    const viewed = capture(fixture.componentInstance.viewTarget);
    (query(fixture, '.target-link') as HTMLElement).click();
    expect(viewed).toEqual([{ type: 'MJ: AI Prompt Runs', id: 'log-9' }]);
  });

  it('emits submitFeedback with the default rating/isCorrect/comments when submitted', () => {
    const fixture = render({ testRun: testRun(), oracleResults: [], resultDetails: null });
    const submitted = capture(fixture.componentInstance.submitFeedback);
    const submitBtn = queryAll(fixture, '.submit-btn').find((b) => b.textContent?.includes('Submit Feedback')) as HTMLElement;
    submitBtn.click();
    expect(submitted).toEqual([{ rating: 5, isCorrect: true, comments: '' }]);
  });
});

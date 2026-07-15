import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { OracleBreakdownTableComponent, OracleResult } from './oracle-breakdown-table.component';

/**
 * DOM coverage for <app-oracle-breakdown-table> (module-declared) — a results table with an
 * aggregate score, one row per oracle result (status icon, name, formatted duration), an error row
 * for any result carrying an errorMessage, a summary footer (oracles run count), and an empty-state
 * when there are no results. The presentational child widgets (score-indicator / status-badge /
 * cost-display) are stubbed as lightweight standalone components so we can assert the table
 * structure without their internals. Pure @Input → single synchronous render.
 */

@Component({ standalone: true, selector: 'app-score-indicator', template: '' })
class ScoreIndicatorStub { @Input() score = 0; @Input() showBar = false; }
@Component({ standalone: true, selector: 'app-test-status-badge', template: '' })
class StatusBadgeStub { @Input() status = ''; @Input() showIcon = false; }
@Component({ standalone: true, selector: 'app-cost-display', template: '' })
class CostDisplayStub { @Input() cost = 0; @Input() showIcon = false; @Input() decimals = 2; }

const result = (over: Partial<OracleResult> = {}): OracleResult =>
  ({ name: 'Exact Match', status: 'Passed', score: 0.9, cost: 0.0001, duration: 250, ...over }) as OracleResult;

const render = (results: OracleResult[]) =>
  renderComponentFixture(OracleBreakdownTableComponent, {
    imports: [MJEmptyStateComponent, ScoreIndicatorStub, StatusBadgeStub, CostDisplayStub],
    declarations: [OracleBreakdownTableComponent],
    inputs: { results },
  });

describe('OracleBreakdownTableComponent (DOM)', () => {
  it('shows the empty-state (no table) when there are no results', () => {
    const fixture = render([]);
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.oracle-table')).toBeNull();
    expect(query(fixture, '.aggregate-score')).toBeNull();
  });

  it('renders one row per oracle result with the aggregate header', () => {
    const fixture = render([result({ name: 'A' }), result({ name: 'B' })]);
    expect(queryAll(fixture, '.table-row').length).toBe(2);
    expect(query(fixture, '.aggregate-score')).not.toBeNull();
  });

  it('shows each oracle name and formats sub-second durations in ms', () => {
    const fixture = render([result({ name: 'Semantic Match', duration: 250 })]);
    expect(text(fixture, '.oracle-name span')).toBe('Semantic Match');
    expect(fixture.nativeElement.textContent).toContain('250ms');
  });

  it('marks a result with an error and renders its error message row', () => {
    const fixture = render([result({ status: 'Error', errorMessage: 'boom happened' })]);
    expect(query(fixture, '.table-row.has-error')).not.toBeNull();
    expect(text(fixture, '.error-message')).toContain('boom happened');
  });

  it('reports the number of oracles run in the summary footer', () => {
    const fixture = render([result({ name: 'A' }), result({ name: 'B' }), result({ name: 'C' })]);
    expect(query(fixture, '.breakdown-summary')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('3');
  });

  it('shows a passed-status icon for a passed oracle', () => {
    const fixture = render([result({ status: 'Passed' })]);
    expect(query(fixture, '.oracle-icon.fa-check-circle')).not.toBeNull();
  });
});

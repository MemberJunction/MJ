import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EvaluationViews, type EvaluationRunState, type EvaluationView, type IntervalCell } from './evaluation-view';

/**
 * L1 widget: a training run's protocol results — outcome and reason, test-set scores with intervals, baselines on the
 * same rows, improvement over the flat guess, candidates (the winner's inner score labelled optimistic), calibration
 * and leakage flags — or, for a run without protocol results, why: never evaluated under a protocol, not finished,
 * refused at a stage, or unreadable. Renders the state it is given; reads no data.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-evaluation-results',
  imports: [CommonModule],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (EvaluatedView; as v) {
      <section class="ps-eval" data-testid="ps-eval">
        <header [class]="'ps-eval-outcome outcome-' + v.Outcome" data-testid="ps-eval-outcome">
          <strong>{{ v.OutcomeTitle }}</strong>
          <span class="ps-eval-headline">{{ v.Headline }}</span>
          <p class="ps-eval-reason" data-testid="ps-eval-reason">{{ v.Reason }}</p>
        </header>

        <h4>Test set — {{ v.Holdout.Rows }} rows, read once</h4>
        <table class="ps-eval-table" data-testid="ps-eval-scores">
          <thead><tr><th>Metric</th><th>Value [95% interval]</th></tr></thead>
          <tbody>
            <tr><td>{{ v.Holdout.Metric }} (primary)</td><td>{{ Cell(v.Holdout.Cell) }}</td></tr>
            @for (m of v.Secondary; track m.Metric) { <tr><td>{{ m.Metric }}</td><td>{{ Cell(m.Cell) }}</td></tr> }
          </tbody>
        </table>

        <h4>Baselines on the same rows</h4>
        <table class="ps-eval-table">
          <thead><tr><th>Baseline</th><th>Role</th><th>{{ v.Holdout.Metric }} [95% interval]</th></tr></thead>
          <tbody>
            @for (b of v.Baselines; track b.Name) { <tr data-testid="ps-eval-baseline"><td>{{ b.Name }}</td><td>{{ b.Role }}</td><td>{{ Cell(b.Cell) }}</td></tr> }
          </tbody>
        </table>

        <h4>Improvement over the flat guess (higher is better)</h4>
        <table class="ps-eval-table" data-testid="ps-eval-versus-flat">
          <tbody>
            @for (r of v.VersusFlatGuess; track r.Member) { <tr><td>{{ r.Member }}</td><td>{{ Cell(r.Cell) }}</td></tr> }
          </tbody>
        </table>

        <h4>Candidates — inner cross-validation on development rows</h4>
        <table class="ps-eval-table" data-testid="ps-eval-candidates">
          <tbody>
            @for (s of v.InnerScores; track s.Candidate) {
              <tr>
                <td>{{ s.Candidate }}</td><td>{{ Cell(s.Cell) }}</td>
                <td>@if (s.IsFinalist) { <span class="ps-eval-optimistic" data-testid="ps-eval-optimistic" title="The winner's inner score was the best of several tries, so it is optimistic.">finalist · optimistic</span> }</td>
              </tr>
            }
          </tbody>
        </table>

        @if (v.Calibration; as c) {
          <h4>Calibration</h4>
          <p data-testid="ps-eval-calibration">{{ c.Method }} · slope {{ c.Slope }} · intercept {{ c.Intercept }}</p>
          <table class="ps-eval-table">
            <thead><tr><th>Predicted range</th><th>Mean predicted</th><th>Observed</th><th>Rows</th></tr></thead>
            <tbody>
              @for (b of c.Bins; track b.Range) { <tr><td>{{ b.Range }}</td><td>{{ b.Predicted }}</td><td>{{ b.Observed }}</td><td>{{ b.N }}</td></tr> }
            </tbody>
          </table>
        }

        @if (v.OperatingPoint; as op) {
          <h4>At the review capacity</h4>
          <p data-testid="ps-eval-operating-point">Precision in the top {{ op.Capacity }}: {{ Cell(op.Precision) }} (base rate {{ op.BaseRate }})</p>
        }

        <h4>Leakage audit</h4>
        @if (v.LeakageFlags.length === 0) {
          <p data-testid="ps-eval-leakage-none">No leakage flags.</p>
        } @else {
          <ul class="ps-eval-flags" data-testid="ps-eval-leakage">
            @for (f of v.LeakageFlags; track f) { <li>{{ f }}</li> }
          </ul>
        }
      </section>
    } @else if (State; as st) {
      @switch (st.Kind) {
        @case ('not-finished') { <p class="ps-eval-empty" data-testid="ps-eval-not-finished">This run has not finished yet ({{ RunStatusText }}).</p> }
        @case ('refused') { <p class="ps-refusals" data-testid="ps-eval-refused">This run was refused at the {{ RefusedStage }} stage: {{ Detail }}</p> }
        @case ('unreadable') { <p class="ps-refusals" data-testid="ps-eval-unreadable">This run's stored results cannot be read: {{ Detail }}</p> }
        @default { <p class="ps-eval-empty" data-testid="ps-eval-empty">This run was not evaluated under an Evaluation Protocol.</p> }
      }
    }
  `,
})
export class PSEvaluationResultsComponent {
  /** The run's results state (`EvaluationViews.DescribeRun`); null renders nothing (no run read yet). */
  @Input() State: EvaluationRunState | null = null;

  /** The view when the run was evaluated under a protocol; null otherwise. */
  public get EvaluatedView(): EvaluationView | null {
    return this.State !== null && this.State.Kind === 'evaluated' ? this.State.View : null;
  }

  public get RunStatusText(): string {
    return this.State !== null && this.State.Kind === 'not-finished' ? this.State.RunStatus : '';
  }

  public get RefusedStage(): string {
    return this.State !== null && this.State.Kind === 'refused' ? this.State.Stage : '';
  }

  public get Detail(): string {
    return this.State !== null && (this.State.Kind === 'refused' || this.State.Kind === 'unreadable') ? this.State.Detail : '';
  }

  /** A value with its interval, as the tables show it. */
  public Cell(c: IntervalCell): string {
    return EvaluationViews.FormatInterval(c);
  }
}

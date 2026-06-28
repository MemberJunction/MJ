import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import {
  PSCompareColumn,
  PSCompareMetricRow,
  buildCompareMetricRows,
  deriveCompareColumns,
} from '../predictive-studio.view-models';

/** A selectable session option for the compare picker. */
interface SessionOption {
  id: string;
  name: string;
  scoredCount: number;
}

/**
 * Compare Runs panel — a live side-by-side comparison of the top scored iterations (training runs)
 * within a selected experiment session. Fully live:
 *
 * - A session picker lists every session that has ≥2 scored iterations (only those are comparable).
 * - The top runs of the selected session are derived via {@link deriveCompareColumns} and rendered as
 *   side-by-side columns; the real metric rows (holdout score, compute cost) come from
 *   {@link buildCompareMetricRows}, with the best column per row highlighted.
 *
 * Empty/prompt state when nothing is comparable. 100% entity-agnostic.
 */
@Component({
  standalone: true,
  selector: 'ps-compare',
  imports: [CommonModule, FormsModule],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-compare.component.scss'],
  template: `
    <div class="ps-panel ps-compare" data-testid="ps-compare-panel">
      @if (sessionOptions.length === 0) {
        <div class="ps-empty" data-testid="ps-compare-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-chart-column"></i></span>
          <h3>Nothing to compare yet</h3>
          <p>Run an experiment with at least two scored iterations and you'll be able to line up their metrics side-by-side here to pick a winner.</p>
        </div>
      } @else {
        <!-- toolbar: session picker -->
        <div class="cmp-toolbar">
          <div class="ps-field" style="margin:0;min-width:280px">
            <label>Session to compare</label>
            <select class="ps-input" data-testid="ps-compare-session" [(ngModel)]="selectedSessionId" (ngModelChange)="rebuild()">
              @for (s of sessionOptions; track s.id) {
                <option [value]="s.id">{{ s.name }} · {{ s.scoredCount }} scored</option>
              }
            </select>
          </div>
          <span class="ps-spacer"></span>
          <span class="ps-small ps-muted">{{ runs.length }} top runs · ranked by score</span>
        </div>

        @if (runs.length < 2) {
          <div class="ps-callout info">
            <i class="fa-solid fa-circle-info"></i>
            <div class="ps-small">This session has fewer than two scored iterations — pick another session to compare.</div>
          </div>
        } @else {
          <div class="ps-card" data-testid="ps-compare-layout-side">
            <div class="ps-card-head"><h3>Side-by-side comparison</h3><span class="ps-muted ps-small">Best value in each row highlighted</span></div>
            <div class="ps-card-body" style="overflow-x:auto">
              <div class="cmp-grid" [style.grid-template-columns]="gridTemplate">
                <div class="stub">Run / Metric</div>
                @for (r of runs; track r.key) {
                  <div class="colhead" [style.border-top-color]="r.color">
                    <div class="rn">{{ r.label }}</div>
                    <div class="ps-muted ps-small">{{ r.algorithm }} · {{ r.descriptor }}</div>
                    <span class="ps-badge" [class]="r.isBest ? 'green' : 'gray'">{{ r.isBest ? 'Top scorer' : r.status }}</span>
                  </div>
                }
                @for (row of metricRows; track row.label) {
                  <div class="rowhdr"><span>{{ row.label }}</span><span class="h ps-muted ps-small">{{ row.qualifier }}</span></div>
                  @for (v of row.values; track $index) {
                    <div class="cell" [class.best]="$index === row.bestIndex">
                      <span class="v">{{ v }}</span>
                      @if ($index === row.bestIndex) { <span class="best-pill">BEST</span> }
                    </div>
                  }
                }
              </div>
            </div>
          </div>
          <div class="ps-callout info">
            <i class="fa-solid fa-circle-info"></i>
            <div class="ps-small">
              <strong>{{ verdict }}</strong>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class PSCompareComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;

  /** Sessions with ≥2 scored iterations — the comparable set. */
  public sessionOptions: SessionOption[] = [];
  public selectedSessionId = '';
  public runs: PSCompareColumn[] = [];
  public metricRows: PSCompareMetricRow[] = [];

  ngOnInit(): void {
    this.buildSessionOptions();
    this.selectedSessionId = this.sessionOptions[0]?.id ?? '';
    this.rebuild();
  }

  /** List sessions that have at least two scored iterations (the only ones worth comparing). */
  private buildSessionOptions(): void {
    const sessions = this.engine?.Sessions ?? [];
    this.sessionOptions = sessions
      .map((s) => {
        const scoredCount = this.engine.IterationRowsForSession(s.ID).filter((it) => it.Score != null).length;
        return { id: s.ID, name: s.Name, scoredCount };
      })
      .filter((o) => o.scoredCount >= 2);
  }

  /** Derive the compare columns + metric rows for the selected session. */
  public rebuild(): void {
    if (!this.selectedSessionId) {
      this.runs = [];
      this.metricRows = [];
      return;
    }
    const rows = this.engine.IterationRowsForSession(this.selectedSessionId);
    this.runs = deriveCompareColumns(rows, 3);
    this.metricRows = buildCompareMetricRows(this.runs);
  }

  /** CSS grid template — stub column + one fraction per run column. */
  public get gridTemplate(): string {
    return `200px repeat(${this.runs.length}, 1fr)`;
  }

  /** A plain-language verdict naming the best run by holdout score. */
  public get verdict(): string {
    const best = this.runs.find((r) => r.isBest);
    if (!best || best.holdoutAuc == null) return 'Pick the run that wins on the holdout score — the honest out-of-sample number.';
    return `${best.label} (${best.algorithm}) leads on the holdout score at ${best.holdoutAuc.toFixed(3)} — prefer the holdout number over training metrics when promoting.`;
  }
}

import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { PSCompareRun, SAMPLE_COMPARE_RUNS } from '../predictive-studio.types';

type CompareMode = 'side' | 'overlay' | 'champion';

interface MetricRow {
  label: string;
  qualifier: string;
  values: string[];
  bestIndex: number;
  warningIndex?: number;
}

/**
 * Compare Runs panel — all three mockup layouts (compare-1/2/3) as switchable display modes:
 *   side      → side-by-side metric columns (compare-1)
 *   overlay   → grouped bars + ROC overlay charts (compare-2)
 *   champion  → champion-vs-challenger promotion review (compare-3)
 * The view toggle swaps only the body; the run selection + Promote action stay constant.
 */
@Component({
  standalone: true,
  selector: 'ps-compare',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-compare.component.scss'],
  template: `
    <div class="ps-panel ps-compare" data-testid="ps-compare-panel">
      <!-- toolbar: view toggle + promote -->
      <div class="cmp-toolbar">
        <div class="ps-seg" data-testid="ps-compare-modes">
          <button data-testid="ps-compare-mode-side" [class.on]="mode === 'side'" (click)="mode = 'side'"><i class="fa-solid fa-table-columns"></i> Side-by-side</button>
          <button data-testid="ps-compare-mode-overlay" [class.on]="mode === 'overlay'" (click)="mode = 'overlay'"><i class="fa-solid fa-chart-line"></i> Overlay</button>
          <button data-testid="ps-compare-mode-champion" [class.on]="mode === 'champion'" (click)="mode = 'champion'"><i class="fa-solid fa-code-compare"></i> Champion / Challenger</button>
        </div>
        <span class="ps-spacer"></span>
        <span class="ps-small ps-muted">3 runs · FY25 holdout</span>
        <button mjButton variant="primary" size="sm"><i class="fa-solid fa-trophy"></i> Promote Winner</button>
      </div>

      <!-- overfit watch callout (shared) -->
      <div class="ps-callout warn">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <div class="ps-small">
          <strong>Overfit watch — Run B (LightGBM, full).</strong> Train AUC 0.930 but Holdout 0.859 → a
          <strong>0.071 gap</strong>, nearly 2× the others. Prefer the run that wins on <strong>Holdout AUC</strong>,
          the honest number — not Train.
        </div>
      </div>

      <!-- ========== SIDE-BY-SIDE ========== -->
      @if (mode === 'side') {
        <div class="ps-card" data-testid="ps-compare-layout-side">
          <div class="ps-card-head"><h3>Side-by-side comparison</h3><span class="ps-muted ps-small">Best value in each row highlighted</span></div>
          <div class="ps-card-body" style="overflow-x:auto">
            <div class="cmp-grid">
              <div class="stub">Run / Metric</div>
              @for (r of runs; track r.key) {
                <div class="colhead" [style.border-top-color]="r.color">
                  <div class="rn">{{ r.label }}</div>
                  <div class="ps-muted ps-small">{{ r.algorithm }} · {{ r.descriptor }}</div>
                  <span class="ps-badge" [class]="r.statusBadge.variant">{{ r.statusBadge.text }}</span>
                </div>
              }
              @for (row of metricRows; track row.label) {
                <div class="rowhdr"><span>{{ row.label }}</span><span class="h ps-muted ps-small">{{ row.qualifier }}</span></div>
                @for (v of row.values; track $index) {
                  <div class="cell" [class.best]="$index === row.bestIndex" [class.warn]="$index === row.warningIndex">
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
            <strong>Verdict:</strong> Run A wins on Holdout AUC (0.864) and F1 (0.79). Run B's single feature
            <span class="ps-mono">days_since_act</span> dominates at <strong>0.63</strong> (> 0.60) — a leakage risk.
            Run C is the most interpretable but trades ~0.05 AUC.
          </div>
        </div>
      }

      <!-- ========== OVERLAY ========== -->
      @if (mode === 'overlay') {
        <div class="ps-card" data-testid="ps-compare-layout-overlay">
          <div class="ps-card-body legend-row">
            @for (r of runs; track r.key) {
              <span class="li"><span class="sw" [style.background]="r.color"></span> {{ r.label }} — {{ r.algorithm }} ({{ r.descriptor }})</span>
            }
            <span class="ps-spacer"></span>
            <span class="ps-muted ps-small">Metric of record: <strong>Holdout AUC</strong></span>
          </div>
        </div>
        <div class="chart-grid">
          <div class="ps-card">
            <div class="ps-card-head"><h3>Metrics — grouped bars</h3><span class="ps-muted ps-small">Train vs Holdout AUC, F1</span></div>
            <div class="ps-card-body">
              <svg viewBox="0 0 460 260" class="chart">
                @for (g of metricGroups; track g.label; let gi = $index) {
                  @for (r of runs; track r.key; let ri = $index) {
                    <rect [attr.x]="40 + gi * 140 + ri * 30" [attr.y]="barY(g.values[ri])"
                      width="26" [attr.height]="220 - barY(g.values[ri])" [attr.fill]="r.color" rx="3"></rect>
                  }
                  <text [attr.x]="40 + gi * 140 + 45" y="238" class="axis-lbl">{{ g.label }}</text>
                }
                <line x1="36" y1="220" x2="450" y2="220" class="axis"></line>
              </svg>
              <div class="ps-small ps-muted">Train bars tower over Holdout — the over-fit you must discount.</div>
            </div>
          </div>
          <div class="ps-card">
            <div class="ps-card-head"><h3>ROC curves — holdout</h3><span class="ps-muted ps-small">AUC = area under curve</span></div>
            <div class="ps-card-body">
              <svg viewBox="0 0 300 260" class="chart">
                <line x1="40" y1="220" x2="280" y2="220" class="axis"></line>
                <line x1="40" y1="20" x2="40" y2="220" class="axis"></line>
                <line x1="40" y1="220" x2="280" y2="20" class="chance"></line>
                @for (r of runs; track r.key) {
                  <path [attr.d]="rocPath(r)" [attr.stroke]="r.color" stroke-width="2.5" fill="none"></path>
                }
              </svg>
              <div class="roc-legend">
                @for (r of runs; track r.key) {
                  <span><span class="sw" [style.background]="r.color"></span> {{ r.key }} {{ r.holdoutAuc | number:'1.3-3' }}</span>
                }
              </div>
            </div>
          </div>
          <div class="ps-card span2">
            <div class="ps-card-head"><h3>Feature importance — grouped by feature</h3><span class="ps-muted ps-small">Bars over the 0.60 line flagged</span></div>
            <div class="ps-card-body">
              <svg viewBox="0 0 920 240" class="chart">
                <line x1="60" y1="200" x2="910" y2="200" class="axis"></line>
                <line x1="60" [attr.y1]="impY(0.60)" x2="910" [attr.y2]="impY(0.60)" class="threshold"></line>
                <text x="62" [attr.y]="impY(0.60) - 4" class="axis-lbl warn-lbl">0.60 dominance threshold</text>
                @for (feat of featureNames; track feat; let fi = $index) {
                  @for (r of runs; track r.key; let ri = $index) {
                    <rect [attr.x]="72 + fi * 142 + ri * 26" [attr.y]="impY(impVal(r, fi))"
                      width="22" [attr.height]="200 - impY(impVal(r, fi))"
                      [attr.fill]="impVal(r, fi) > 0.6 ? 'var(--mj-status-warning)' : r.color" rx="3"></rect>
                  }
                  <text [attr.x]="72 + fi * 142 + 40" y="216" class="axis-lbl">{{ feat }}</text>
                }
              </svg>
            </div>
          </div>
        </div>
      }

      <!-- ========== CHAMPION / CHALLENGER ========== -->
      @if (mode === 'champion') {
        <div class="ps-callout warn reco" data-testid="ps-compare-layout-champion">
          <i class="fa-solid fa-hand"></i>
          <div>
            <strong>Hold — gain is within noise; keep the champion.</strong>
            <div class="ps-small" style="margin-top:4px">
              Challenger improves Holdout AUC by only <strong>+0.005</strong> (inside the ±0.006 bootstrap CI) while
              losing interpretability and pushing one feature past the 0.60 dominance line. Not worth a re-deploy.
            </div>
          </div>
          <span class="ps-spacer"></span>
          <button mjButton variant="secondary" size="sm">Re-run later</button>
          <button mjButton variant="danger" size="sm">Reject promotion</button>
        </div>

        <div class="vs-head">
          <div class="vs-card champ">
            <div class="role"><i class="fa-solid fa-crown"></i> Champion · Published v4</div>
            <div class="title">{{ champion.label }} — {{ champion.algorithm }}</div>
            <div class="ps-muted ps-small">{{ champion.descriptor }} · serving production</div>
            <div class="vs-stats">
              <div><div class="ps-muted ps-small">Holdout AUC</div><strong>{{ champion.holdoutAuc | number:'1.3-3' }}</strong></div>
              <div><div class="ps-muted ps-small">F1</div><strong>{{ champion.f1 }}</strong></div>
              <div><div class="ps-muted ps-small">Overfit gap</div><strong class="warn-txt">{{ champion.overfitGap | number:'1.3-3' }}</strong></div>
            </div>
          </div>
          <div class="vs-mid">VS</div>
          <div class="vs-card chall">
            <div class="role"><i class="fa-solid fa-flask"></i> Challenger · Candidate v5-rc</div>
            <div class="title">{{ challenger.label }} — {{ challenger.algorithm }}</div>
            <div class="ps-muted ps-small">{{ challenger.descriptor }} · staging / shadow</div>
            <div class="vs-stats">
              <div><div class="ps-muted ps-small">Holdout AUC</div><strong>{{ challenger.holdoutAuc | number:'1.3-3' }}</strong></div>
              <div><div class="ps-muted ps-small">F1</div><strong>{{ challenger.f1 }}</strong></div>
              <div><div class="ps-muted ps-small">Overfit gap</div><strong class="err-txt">{{ challenger.overfitGap | number:'1.3-3' }}</strong></div>
            </div>
          </div>
        </div>

        <div class="ps-section-title">Challenger Δ vs champion</div>
        <div class="delta-row">
          <div class="delta down"><div class="lab">Holdout AUC</div><div class="big"><i class="fa-solid fa-arrow-down"></i> −0.005</div><div class="ctx ps-muted ps-small">0.859 vs 0.864 · within ±0.006 CI</div></div>
          <div class="delta down"><div class="lab">Overfit gap</div><div class="big"><i class="fa-solid fa-arrow-up"></i> +0.025</div><div class="ctx ps-muted ps-small">0.071 vs 0.046 · worse generalization</div></div>
          <div class="delta up"><div class="lab">Train time</div><div class="big"><i class="fa-solid fa-arrow-down"></i> −14s</div><div class="ctx ps-muted ps-small">28s vs 42s · faster to retrain</div></div>
          <div class="delta down"><div class="lab">Feature dominance</div><div class="big"><i class="fa-solid fa-triangle-exclamation"></i> 0.63</div><div class="ctx ps-muted ps-small">days_since_act > 0.60 · risk added</div></div>
        </div>
      }
    </div>
  `,
})
export class PSCompareComponent {
  public mode: CompareMode = 'side';
  // TODO: bind to live data — Compare Runs has no live multi-run-selection surface in
  // PredictiveStudioEngine yet, so this panel renders a representative demo comparison.
  public runs: PSCompareRun[] = SAMPLE_COMPARE_RUNS;
  public featureNames = ['tenure', 'days_since_act', 'engagement', 'events_signup', 'emb_aggregate', 'city'];

  public get champion(): PSCompareRun {
    return this.runs[0];
  }
  public get challenger(): PSCompareRun {
    return this.runs[1];
  }

  public get metricRows(): MetricRow[] {
    const auc = this.runs.map((r) => r.holdoutAuc);
    const train = this.runs.map((r) => r.trainAuc);
    const gap = this.runs.map((r) => r.overfitGap);
    const f1 = this.runs.map((r) => r.f1);
    const imp = this.runs.map((r) => r.maxImportance);
    return [
      { label: 'Holdout AUC', qualifier: 'the honest number', values: auc.map((v) => v.toFixed(3)), bestIndex: this.maxIndex(auc) },
      { label: 'Train AUC', qualifier: 'in-sample · optimistic', values: train.map((v) => v.toFixed(3)), bestIndex: this.maxIndex(train) },
      { label: 'Overfit gap', qualifier: 'train − holdout · lower is better', values: gap.map((v) => v.toFixed(3)), bestIndex: this.minIndex(gap) },
      { label: 'F1', qualifier: 'balance of precision/recall', values: f1.map((v) => v.toFixed(2)), bestIndex: this.maxIndex(f1) },
      { label: 'Train time', qualifier: 'wall-clock', values: this.runs.map((r) => r.trainTime), bestIndex: 1 },
      { label: 'Max feature share', qualifier: 'dominance risk over 0.60', values: imp.map((v) => v.toFixed(2)), bestIndex: this.minIndex(imp), warningIndex: this.maxIndex(imp) },
      { label: 'Interpretability', qualifier: 'explainability', values: this.runs.map((r) => r.interpretability), bestIndex: 2 },
    ];
  }

  public get metricGroups(): { label: string; values: number[] }[] {
    return [
      { label: 'Train AUC', values: this.runs.map((r) => r.trainAuc) },
      { label: 'Holdout AUC', values: this.runs.map((r) => r.holdoutAuc) },
      { label: 'F1', values: this.runs.map((r) => r.f1) },
    ];
  }

  /** Map a 0.70..0.95 metric onto a 0..220 chart Y (top = high). */
  public barY(v: number): number {
    const min = 0.7;
    const max = 0.95;
    const norm = Math.max(0, Math.min(1, (v - min) / (max - min)));
    return 220 - norm * 200;
  }

  /** Map a 0..0.65 importance onto a 0..200 chart Y. */
  public impY(v: number): number {
    const norm = Math.max(0, Math.min(1, v / 0.65));
    return 200 - norm * 180;
  }

  public impVal(run: PSCompareRun, featureIndex: number): number {
    const bar = run.importance[featureIndex];
    const v = bar ? parseFloat(bar.value) : NaN;
    return isNaN(v) ? 0 : v;
  }

  /** A smooth ROC-ish curve whose bow scales with AUC. */
  public rocPath(run: PSCompareRun): string {
    const x0 = 40;
    const y0 = 220;
    const x1 = 280;
    const y1 = 20;
    const bow = (run.holdoutAuc - 0.5) * 2; // 0..1
    const cx = x0 + (x1 - x0) * 0.15;
    const cy = y0 - (y0 - y1) * (0.4 + bow * 0.55);
    return `M ${x0} ${y0} Q ${cx} ${cy}, ${x1} ${y1}`;
  }

  private maxIndex(arr: number[]): number {
    return arr.reduce((best, v, i, a) => (v > a[best] ? i : best), 0);
  }
  private minIndex(arr: number[]): number {
    return arr.reduce((best, v, i, a) => (v < a[best] ? i : best), 0);
  }
}

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { EvaluationProtocolSpec, HoldoutSplit, InnerValidation } from '@memberjunction/predictive-studio-core';

/** One labelled line of a version summary. */
export interface SummaryRow {
  readonly Label: string;
  readonly Value: string;
}

/**
 * L1 widget: the plain-language reading of one Evaluation Protocol version. On the latest version it offers
 * "Create version N+1" and emits `EditRequested`; the host decides what editing means.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-protocol-summary',
  imports: [CommonModule, MJButtonDirective],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Protocol; as p) {
      <dl class="ps-summary" data-testid="ps-protocol-summary">
        @for (r of Rows(p); track r.Label) { <dt>{{ r.Label }}</dt><dd>{{ r.Value }}</dd> }
      </dl>
      @if (IsLatest && CanEdit) {
        <div class="ps-form-actions">
          <button mjButton variant="outline" size="sm" type="button" data-testid="ps-protocol-edit" (click)="EditRequested.emit()">Create version {{ p.version + 1 }}</button>
        </div>
      }
    }
  `,
})
export class PSProtocolSummaryComponent {
  @Input() Protocol: EvaluationProtocolSpec | null = null;
  /** True when this is the lineage's latest version (only the latest can be followed by a new version). */
  @Input() IsLatest = false;
  /** True when the host lets this user author a new version. */
  @Input() CanEdit = false;
  /** The user asked to author the next version. */
  @Output() EditRequested = new EventEmitter<void>();

  /** The plain-language reading of one protocol version. */
  public static ProtocolSummaryRows(p: EvaluationProtocolSpec): readonly SummaryRow[] {
    return [
      { Label: 'Test set', Value: PSProtocolSummaryComponent.holdoutText(p.holdout) },
      { Label: 'Selection', Value: PSProtocolSummaryComponent.innerValidationText(p.innerValidation) },
      { Label: 'Primary score', Value: `${p.primaryScore.metric} (lower is better)` },
      { Label: 'Baselines', Value: p.baselines.map((b) => b.kind).join(', ') },
      { Label: 'Ships only if', Value: `the lower 95% bound of its improvement is above ${p.promotion.margin} on the same rows` },
      { Label: 'Outcomes', Value: p.allowedOutcomes.join(' · ') },
      { Label: 'Smallest class in the test set', Value: `${p.minMinorityClassRows} rows (below that, no model ships)` },
      { Label: 'Calibration', Value: p.calibration.kind },
      { Label: 'Leakage audit', Value: `single-feature held-out AUC above ${p.leakageAudit.singleFeatureHeldOutAucMax} is flagged; time-shifted label and drop-column tests` },
      { Label: 'Never used as inputs', Value: [...p.exclusions.denyFields, ...p.exclusions.denySources].join(', ') || 'none' },
      { Label: 'Budget', Value: `${p.budgets.maxCandidates} candidates, ${p.budgets.maxComputeSeconds} s, hard stop` },
      { Label: 'Seed', Value: String(p.seed) },
      { Label: 'Guard fields changed by', Value: p.guardFieldsEditableBy === 'non-agent' ? 'protocol configuration — never an agent tool call' : 'users only (human-only)' },
    ];
  }

  /** The summary rows of `p`, for the template. */
  public Rows(p: EvaluationProtocolSpec): readonly SummaryRow[] {
    return PSProtocolSummaryComponent.ProtocolSummaryRows(p);
  }

  private static holdoutText(h: HoldoutSplit): string {
    switch (h.kind) {
      case 'date-carved': {
        const end = h.holdoutEnd === null ? '' : ` and before ${h.holdoutEnd}`;
        const report = h.newEntityReport === null ? '' : `; new-entity report holds out ${Math.round(h.newEntityReport.holdoutFraction * 100)}% of ${h.newEntityReport.groupKey}`;
        return `rows whose ${h.dateColumn} is on or after ${h.cutoff}${end}${report}`;
      }
      case 'seeded-random':
        return `a seeded random ${Math.round(h.fraction * 100)}% of rows (one decision date for every row)`;
      case 'rolling-origin':
        return `${h.origins} rolling origins, horizon ${h.horizonPeriods}, ${h.window} window`;
    }
  }

  private static innerValidationText(iv: InnerValidation): string {
    switch (iv.kind) {
      case 'blocked-time':
        return `${iv.folds} blocked-in-time folds, gap ${iv.gapPeriods}`;
      case 'grouped-kfold':
        return `${iv.folds} folds × ${iv.repeats} repeats, grouped by ${iv.groupKey}`;
      case 'repeated-stratified-kfold':
        return `${iv.folds} folds × ${iv.repeats} repeats`;
    }
  }
}

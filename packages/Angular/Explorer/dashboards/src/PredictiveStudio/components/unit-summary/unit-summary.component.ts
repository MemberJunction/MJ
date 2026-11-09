import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import {
  PredictionUnit, TaskTypeRules,
  type CensoringCutoff, type DecisionSpec, type IncumbentHeuristic, type PredictionUnitSpec, type TaskType, type TemporalSpec, type UnitRows,
} from '@memberjunction/predictive-studio-core';
import type { SummaryRow } from '../protocol-summary/protocol-summary.component';

/**
 * L1 widget: the plain-language reading of one Prediction Unit version. On the latest version it offers
 * "Create version N+1" and emits `EditRequested`; the host decides what editing means.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-unit-summary',
  imports: [CommonModule, MJButtonDirective],
  styleUrls: ['../ps-widgets.css'],
  template: `
    @if (Unit; as u) {
      <dl class="ps-summary" data-testid="ps-unit-summary">
        @for (r of Rows(u); track r.Label) { <dt>{{ r.Label }}</dt><dd>{{ r.Value }}</dd> }
      </dl>
      @if (IsLatest && CanEdit) {
        <div class="ps-form-actions">
          <button mjButton variant="outline" size="sm" type="button" data-testid="ps-unit-edit" (click)="EditRequested.emit()">Create version {{ u.version + 1 }}</button>
        </div>
      }
    }
  `,
})
export class PSUnitSummaryComponent {
  @Input() Unit: PredictionUnitSpec | null = null;
  /** True when this is the lineage's latest version (only the latest can be followed by a new version). */
  @Input() IsLatest = false;
  /** True when the host lets this user author a new version. */
  @Input() CanEdit = false;
  /** The user asked to author the next version. */
  @Output() EditRequested = new EventEmitter<void>();

  /** The plain-language reading of one unit version. */
  public static UnitSummaryRows(u: PredictionUnitSpec): readonly SummaryRow[] {
    const rows: SummaryRow[] = [
      { Label: 'One row is', Value: PSUnitSummaryComponent.rowsText(u.rows) },
      { Label: 'Outcome', Value: `${PredictionUnit.DescribeLabelRule(u)} (label version ${u.label.labelVersion})` },
      { Label: 'Task', Value: PSUnitSummaryComponent.taskText(u.label.outcome) },
      { Label: 'Censoring', Value: PSUnitSummaryComponent.cutoffText(u.censoring.cutoff) },
      { Label: 'Change history', Value: `uncovered rows: ${u.history.onUncoveredRow}; external-source rows: ${u.history.externalSourceRows}` },
      { Label: 'Group key', Value: u.groupKey || 'none' },
    ];
    if (u.temporal !== null) rows.push({ Label: 'Temporal Spec', Value: PSUnitSummaryComponent.temporalText(u.temporal) });
    rows.push(
      { Label: 'Decision', Value: PSUnitSummaryComponent.decisionText(u.decision) },
      { Label: 'Existing rule', Value: PSUnitSummaryComponent.incumbentText(u.incumbent) },
    );
    return rows;
  }

  /** The summary rows of `u`, for the template. */
  public Rows(u: PredictionUnitSpec): readonly SummaryRow[] {
    return PSUnitSummaryComponent.UnitSummaryRows(u);
  }

  private static rowsText(rows: UnitRows): string {
    if (rows.kind === 'grain-x-periods') {
      return `a ${rows.grainEntity} record per period of ${rows.childEntity} (${rows.foreignKey}, dated by ${rows.periodDate})`;
    }
    const d = rows.decisionDate;
    const date = d.kind === 'column' ? `decided on ${d.column}`
      : d.kind === 'column-offset' ? `decided ${d.offsetDays} days after ${d.column}`
        : `all decided on ${d.date}${d.advance === 'each-run' ? ' (advances each run)' : ''}`;
    return `a ${rows.grainEntity} record, ${date}`;
  }

  private static taskText(task: TaskType): string {
    const s = TaskTypeRules.ScoreSemantics(task);
    switch (task.kind) {
      case 'binary':
        return `binary: ${task.classOrder.join(', ')}; the score is P(${s.ScoreRefersTo}), ${s.AdverseDirection === 'higher-score-is-adverse' ? 'higher is adverse' : 'lower is adverse'}`;
      case 'multiclass':
        return `multiclass: ${task.classOrder.join(', ')}; adverse: ${task.adverseIndices.map((i) => task.classOrder[i] || '?').join(', ')}`;
      case 'non-negative':
        return `non-negative (Tweedie power ${task.tweediePower})`;
      case 'forecast':
        return `forecast of a ${task.valueKind} value`;
      case 'continuous':
      case 'count':
        return task.kind;
    }
  }

  private static cutoffText(c: CensoringCutoff): string {
    switch (c.kind) {
      case 'now': return 'rows whose outcome window has not ended by now are left out';
      case 'fixed': return `rows whose outcome window has not ended by ${c.at} are left out`;
      case 'corpus-end': return `rows whose outcome window ends after the latest ${c.entity}.${c.field} are left out`;
    }
  }

  private static temporalText(t: TemporalSpec): string {
    const windows = t.rollingWindows.map((w) => `${w.aggregate} of ${w.periods} ending at lag ${w.endLag}`).join(', ') || 'none';
    return `per ${t.period} on ${t.timeColumn}; horizon ${t.horizonPeriods}; lags ${t.lags.join(', ') || 'none'}; rolling windows ${windows}`;
  }

  private static decisionText(d: DecisionSpec): string {
    const capacity = d.capacityPerPeriod === null ? 'no fixed capacity' : `${d.capacityPerPeriod} per ${d.period}`;
    return `${d.actorRole} will ${d.action} (${capacity})`;
  }

  private static incumbentText(h: IncumbentHeuristic): string {
    return h.kind === 'none' ? 'none' : `"${h.name}": ${h.scoreExpression}`;
  }
}

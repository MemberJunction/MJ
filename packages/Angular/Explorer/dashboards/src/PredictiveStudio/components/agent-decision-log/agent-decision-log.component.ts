import { ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import type { MJAgentDecisionLogEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

/** One decision row as the widget shows it (the stored columns it reads). */
export type AgentDecisionLogRow = Pick<MJAgentDecisionLogEntity, 'ID' | 'SessionRunID' | 'AgentRunID' | 'Step' | 'Decision' | 'Rationale' | 'PayloadHash' | 'ResultingPayloadHash' | 'PromptRunID' | 'BuildApprovalRequestID'>;

/** The plain-language name of each decision. */
const DECISION_LABELS: Readonly<Record<MJAgentDecisionLogEntity['Decision'], string>> = {
  'draft-unit': 'Drafted the prediction unit',
  profile: 'Profiled the data',
  'draft-protocol': 'Drafted the evaluation protocol',
  'present-plan': 'Presented the plan for approval',
  'request-build': 'Started the approved build',
  report: 'Reported',
  'decline-no-signal': 'Declined: no usable signal',
  'decline-small-data': 'Declined: too little data',
  'decline-unresolved-reference': 'Declined: the plan names things that do not exist',
};

/**
 * L1 widget (PR 5, A4; §5.1.6): a Model Development Agent session's decision log — one entry per control-path
 * transition, in `Step` order across every run of the session, with the code rule's message, the run that took it and
 * the plan hash before and after. The host passes the rows, or a `SessionRunID` the widget reads through its `Provider`
 * (multi-provider: never the global provider). Read-only: the log is append-only.
 */
@Component({
  standalone: true,
  selector: 'mj-ps-agent-decision-log',
  imports: [CommonModule, SharedGenericModule],
  templateUrl: './agent-decision-log.component.html',
  styleUrls: ['../ps-widgets.css', './agent-decision-log.component.css'],
})
export class PSAgentDecisionLogComponent extends BaseAngularComponent {
  private _rows: readonly AgentDecisionLogRow[] = [];
  private _sessionRunId: string | null = null;

  /** The rows to show (the host read them). Ignored while {@link SessionRunID} is set. */
  @Input()
  set Rows(value: readonly AgentDecisionLogRow[]) {
    this._rows = value || [];
    if (!this._sessionRunId) this.Shown = PSAgentDecisionLogComponent.Ordered(this._rows);
  }
  get Rows(): readonly AgentDecisionLogRow[] {
    return this._rows;
  }

  /** The session to read and show: its first run's ID. */
  @Input()
  set SessionRunID(value: string | null) {
    if (value === this._sessionRunId) return;
    this._sessionRunId = value;
    if (value) void this.LoadSession(value);
    else this.Shown = PSAgentDecisionLogComponent.Ordered(this._rows);
  }
  get SessionRunID(): string | null {
    return this._sessionRunId;
  }

  /** The rows shown, in `Step` order. */
  public Shown: readonly AgentDecisionLogRow[] = [];
  /** True while the session's rows are read. */
  public IsLoading = false;
  /** Why the rows could not be read, or null. */
  public LoadError: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  /** Reads `sessionRunId`'s rows through this component's provider. */
  public async LoadSession(sessionRunId: string): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<AgentDecisionLogRow>({
      EntityName: 'MJ: Agent Decision Logs',
      ExtraFilter: `SessionRunID='${EscapeSQLString(sessionRunId)}'`,
      Fields: ['ID', 'SessionRunID', 'AgentRunID', 'Step', 'Decision', 'Rationale', 'PayloadHash', 'ResultingPayloadHash', 'PromptRunID', 'BuildApprovalRequestID'],
      OrderBy: 'Step ASC',
      ResultType: 'simple',
    });
    this.IsLoading = false;
    if (result.Success) this.Shown = PSAgentDecisionLogComponent.Ordered(result.Results);
    else this.LoadError = result.ErrorMessage || 'The decision log could not be read.';
    this.cdr.markForCheck();
  }

  /** The plain-language name of a decision. */
  public Label(row: AgentDecisionLogRow): string {
    return DECISION_LABELS[row.Decision] || row.Decision;
  }

  /** True for a decision that ends the session. */
  public IsTerminal(row: AgentDecisionLogRow): boolean {
    return row.Decision === 'report' || row.Decision.startsWith('decline-');
  }

  /** A hash shortened for display (its first 8 characters). */
  public Short(hash: string): string {
    return (hash || '').trim().slice(0, 8);
  }

  /** The rows in `Step` order. */
  public static Ordered(rows: readonly AgentDecisionLogRow[]): AgentDecisionLogRow[] {
    return [...rows].sort((a, b) => a.Step - b.Step);
  }
}

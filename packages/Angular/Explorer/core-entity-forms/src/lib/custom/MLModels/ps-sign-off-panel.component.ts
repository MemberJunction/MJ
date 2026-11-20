import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RunView, type RemoteOpInvokeOptions, type RunViewResult } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import {
  PredictiveStudioGetModelEvidenceOperation,
  PredictiveStudioPromoteModelOperation,
  PredictiveStudioSignOffModelOperation,
  type MJMLEvaluationProtocolEntity,
  type MJMLModelEntity,
  type MJMLModelPublishRecordEntity,
  type PredictiveStudioEvidenceSnapshot,
  type PredictiveStudioLeakageFlagKind,
} from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective, MJConfirmDialogComponent, type MJConfirmDialogType } from '@memberjunction/ng-ui-components';
import { EvaluationProtocol, LifecycleLabels, TransitionRefusalText } from '@memberjunction/predictive-studio-core';

/** The confirmation the panel is asking for. */
type PendingAction = 'publish' | 'approve' | 'reject';

/** What the protocol pinned by the model asks of a publish. */
interface SignOffPolicy {
  /** The protocol's optional `requiresHumanSignOff`. */
  readonly RequiresHumanSignOff: boolean;
  /** Days the registry job keeps a sign-off wait open (`signOffExpiryDays`). */
  readonly SignOffExpiryDays: number;
}

/** How each confirmation is presented in `MJConfirmDialogComponent`. */
interface ConfirmPresentation {
  readonly Title: string;
  readonly ConfirmText: string;
  readonly Type: MJConfirmDialogType;
}

const CONFIRM: Readonly<Record<PendingAction, ConfirmPresentation>> = {
  publish: { Title: 'Publish model', ConfirmText: 'Publish', Type: 'warning' },
  approve: { Title: 'Approve the sign-off', ConfirmText: 'Approve', Type: 'info' },
  reject: { Title: 'Reject the sign-off', ConfirmText: 'Reject', Type: 'danger' },
};

/** The words of each leakage flag kind on its override checkbox. */
const FLAG_WORDS: Readonly<Record<PredictiveStudioLeakageFlagKind, string>> = {
  'single-feature-auc': 'A single feature predicts the outcome on its own',
  'time-shifted-label': 'The model still scores well against a time-shifted label',
  'drop-column': 'Dropping one column changes the score sharply',
  'high-cardinality-id': 'An identifier-like column is used as a feature',
};

/** One day in milliseconds. */
const DAY_MS = 86_400_000;

/**
 * **PSSignOffPanelComponent** (L2) — the optional publish and sign-off flow of a Validated or KeepBaseline model, on
 * its stored evidence (`PredictiveStudio.GetModelEvidence`): the holdout primary score with its interval, the paired
 * comparisons, the gate decision and branch, each leakage flag with an override checkbox, the data window and the
 * snapshot hash — every number from the evidence JSON. Publish directly (the user is the approver) or, when the pinned
 * protocol requires a sign-off or a flag is flagged, Approve or Reject with a reason (required when an override is
 * ticked) and then Publish. A model the protocol holds for sign-off shows "Sign-off required by the protocol" with the
 * date the registry job closes the wait. Every confirmation goes through `MJConfirmDialogComponent`; every refusal is
 * shown in plain words. No automated outcome waits on this panel.
 */
@Component({
  standalone: true,
  selector: 'ps-sign-off-panel',
  imports: [CommonModule, FormsModule, MJButtonDirective, MJConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ps-so" data-testid="ps-sign-off-panel">
      <div class="ps-so-head">
        <h3>Publish</h3>
        <span class="ps-so-sub">on the model's stored evidence</span>
      </div>

      @if (Loading) {
        <div class="ps-so-note"><i class="fa-solid fa-circle-notch fa-spin"></i> Reading the stored evidence…</div>
      } @else if (LoadError) {
        <div class="ps-so-error" data-testid="ps-sign-off-load-error">{{ LoadError }}</div>
      } @else if (Evidence; as ev) {
        @if (Policy?.RequiresHumanSignOff) {
          <div class="ps-so-callout" data-testid="ps-sign-off-required">
            <i class="fa-solid fa-user-check"></i>
            <span>
              Sign-off required by the protocol.
              @if (WaitClosesOn; as closes) {
                The registry job closes the wait on <strong>{{ closes | date: 'mediumDate' }}</strong> if no sign-off arrives.
              }
            </span>
          </div>
        }

        <div class="ps-so-grid">
          <div class="ps-so-cell">
            <div class="ps-so-label">Holdout {{ ev.holdoutPrimary.metric }}</div>
            <div class="ps-so-value" data-testid="ps-evidence-primary">{{ ev.holdoutPrimary.value | number: '1.3-3' }}</div>
            <div class="ps-so-muted">{{ ev.holdoutPrimary.interval.level * 100 | number: '1.0-0' }}% interval [{{ ev.holdoutPrimary.interval.lower | number: '1.3-3' }}, {{ ev.holdoutPrimary.interval.upper | number: '1.3-3' }}] · n = {{ ev.holdoutPrimary.n }}</div>
          </div>
          <div class="ps-so-cell">
            <div class="ps-so-label">Gate decision</div>
            <div class="ps-so-value small" data-testid="ps-evidence-gate">{{ ev.gate.outcome }}</div>
            <div class="ps-so-muted">{{ ev.gate.branch }}</div>
          </div>
          <div class="ps-so-cell">
            <div class="ps-so-label">Data window</div>
            <div class="ps-so-value small">{{ ev.dataWindow.from }} → {{ ev.dataWindow.to }}</div>
            <div class="ps-so-muted ps-so-mono" [title]="ev.snapshotHash">snapshot {{ ev.snapshotHash.slice(0, 12) }}…</div>
          </div>
        </div>

        @if (Comparisons.length > 0) {
          <div class="ps-so-section">Paired comparisons</div>
          @for (c of Comparisons; track c.Name) {
            <div class="ps-so-cmp" data-testid="ps-evidence-comparison">
              <span>{{ c.Name }}</span>
              <span class="ps-so-mono">{{ c.Value | number: '1.3-3' }} [{{ c.Lower | number: '1.3-3' }}, {{ c.Upper | number: '1.3-3' }}]</span>
              <span [class]="c.Beats ? 'ps-so-beats yes' : 'ps-so-beats no'">{{ c.Beats ? 'beats' : 'does not beat' }}</span>
            </div>
          }
        }

        @if (ev.leakageFlags.length > 0) {
          <div class="ps-so-section">Leakage flags — tick each one you override</div>
          @for (flag of ev.leakageFlags; track flag.kind) {
            <label class="ps-so-flag">
              <input type="checkbox" [attr.data-testid]="'ps-override-' + flag.kind" [checked]="IsOverridden(flag.kind)"
                [disabled]="Busy" (change)="ToggleOverride(flag.kind)" />
              <span>{{ FlagWords(flag.kind) }}</span>
            </label>
          }
        }

        @if (ShowsSignOff) {
          <div class="ps-so-section">Sign-off</div>
          <textarea class="ps-so-reason" rows="3" data-testid="ps-sign-off-reason" [(ngModel)]="Reason" [disabled]="Busy"
            [placeholder]="Overrides.size > 0 ? 'Why each ticked flag is acceptable (required)…' : 'Why you approve or reject…'"></textarea>
          <div class="ps-so-actions">
            <button mjButton variant="primary" size="sm" data-testid="ps-sign-off-approve" [disabled]="!CanApprove" (click)="Ask('approve')">
              <i class="fa-solid fa-check"></i> Approve
            </button>
            <button mjButton variant="secondary" size="sm" data-testid="ps-sign-off-reject" [disabled]="!CanReject" (click)="Ask('reject')">
              <i class="fa-solid fa-xmark"></i> Reject
            </button>
            @if (SignOffRecordId) {
              <span class="ps-so-ok" data-testid="ps-sign-off-recorded"><i class="fa-solid fa-circle-check"></i> Sign-off recorded</span>
            }
            @if (Rejected) {
              <span class="ps-so-muted" data-testid="ps-sign-off-rejected">Rejection recorded; the model stays {{ Model?.Status }}.</span>
            }
          </div>
        }

        <div class="ps-so-actions">
          <span class="ps-so-muted ps-so-hint">{{ PublishHint }}</span>
          <button mjButton variant="primary" size="sm" data-testid="ps-sign-off-publish" [disabled]="!CanPublish" (click)="Ask('publish')">
            <i class="fa-solid fa-arrow-up"></i> Publish
          </button>
        </div>
      }

      @if (RefusalMessage) {
        <div class="ps-so-error" data-testid="ps-sign-off-refusal">{{ RefusalMessage }}</div>
      }

      <mj-confirm-dialog
        [Visible]="Pending !== null"
        [Processing]="Busy"
        [Title]="PendingPresentation.Title"
        [Message]="PendingMessage"
        [Type]="PendingPresentation.Type"
        [ConfirmText]="PendingPresentation.ConfirmText"
        (Confirmed)="Confirm()"
        (Cancelled)="Cancel()">
      </mj-confirm-dialog>
    </div>
  `,
  styles: [`
    .ps-so { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 14px 16px; background: var(--mj-bg-surface); }
    .ps-so-head { display: flex; align-items: baseline; gap: 8px; }
    .ps-so-head h3 { margin: 0; font-size: 15px; color: var(--mj-text-primary); }
    .ps-so-sub, .ps-so-muted { font-size: 12px; color: var(--mj-text-muted); }
    .ps-so-note { font-size: 13px; color: var(--mj-text-muted); }
    .ps-so-error { font-size: 13px; color: var(--mj-status-error-text); background: var(--mj-status-error-bg); border: 1px solid var(--mj-status-error-border); border-radius: 6px; padding: 8px 10px; }
    .ps-so-callout { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--mj-status-info-text); background: var(--mj-status-info-bg); border: 1px solid var(--mj-status-info-border); border-radius: 6px; padding: 8px 10px; }
    .ps-so-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .ps-so-cell { background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-subtle); border-radius: 8px; padding: 8px 10px; }
    .ps-so-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-secondary); }
    .ps-so-value { font-size: 20px; font-weight: 600; color: var(--mj-text-primary); }
    .ps-so-value.small { font-size: 14px; }
    .ps-so-mono { font-family: var(--mj-font-mono, monospace); }
    .ps-so-section { font-size: 12px; font-weight: 600; color: var(--mj-text-secondary); margin-top: 4px; }
    .ps-so-cmp { display: flex; gap: 10px; font-size: 13px; color: var(--mj-text-primary); }
    .ps-so-beats.yes { color: var(--mj-status-success-text); }
    .ps-so-beats.no { color: var(--mj-status-warning-text); }
    .ps-so-flag { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--mj-text-primary); }
    .ps-so-reason { width: 100%; box-sizing: border-box; border: 1px solid var(--mj-border-default); border-radius: 6px; padding: 6px 8px; font: inherit; color: var(--mj-text-primary); background: var(--mj-bg-surface); }
    .ps-so-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .ps-so-hint { flex: 1; }
    .ps-so-ok { font-size: 12px; color: var(--mj-status-success-text); }
  `],
})
export class PSSignOffPanelComponent extends BaseAngularComponent implements OnChanges {
  /** The model to publish (Validated or KeepBaseline). */
  @Input() Model: MJMLModelEntity | null = null;

  /** The new status after an applied publish (the status the gate returned). */
  @Output() Published = new EventEmitter<MJMLModelEntity['Status']>();

  /** The model's stored evidence, or null before it is read. */
  public Evidence: PredictiveStudioEvidenceSnapshot | null = null;

  /** What the pinned protocol asks of a publish, or null when the model pins none. */
  public Policy: SignOffPolicy | null = null;

  /** When the newest no-sign-off refusal was recorded (the wait opened), or null. */
  public WithheldAt: Date | null = null;

  /** The leakage flags the user has ticked to override. */
  public Overrides = new Set<PredictiveStudioLeakageFlagKind>();

  /** The sign-off reason. */
  public Reason = '';

  /** The approving sign-off recorded in this session, consumed by the publish. */
  public SignOffRecordId: string | null = null;

  /** True once a rejection was recorded. */
  public Rejected = false;

  /** The confirmation being asked for, or null. */
  public Pending: PendingAction | null = null;

  /** True while the evidence loads. */
  public Loading = false;

  /** True while a confirmed action runs. */
  public Busy = false;

  /** Why the evidence could not be read, or null. */
  public LoadError: string | null = null;

  /** The last refusal or error of an action, in plain words, or null. */
  public RefusalMessage: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);

  /** Reloads the evidence and the protocol's sign-off policy when the model changes. */
  public async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['Model'] || changes['Provider']) await this.Reload();
  }

  /** Reads the evidence, the pinned protocol's sign-off policy and the open wait; resets the flow. */
  public async Reload(): Promise<void> {
    this.Evidence = null;
    this.Policy = null;
    this.WithheldAt = null;
    this.Overrides = new Set();
    this.Reason = '';
    this.SignOffRecordId = null;
    this.Rejected = false;
    this.RefusalMessage = null;
    this.LoadError = null;
    if (!this.Model) return;
    this.Loading = true;
    this.cdr.markForCheck();
    try {
      const [evidence] = await Promise.all([this.LoadEvidence(this.Model.ID), this.LoadPolicy(this.Model)]);
      this.Evidence = evidence;
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  /** The evidence of the model through `PredictiveStudio.GetModelEvidence`; throws its error message when refused. */
  protected async LoadEvidence(modelId: string): Promise<PredictiveStudioEvidenceSnapshot> {
    const result = await new PredictiveStudioGetModelEvidenceOperation().Execute({ modelId }, this.opContext());
    if (!result.Success || !result.Output) throw new Error(result.ErrorMessage || 'The stored evidence could not be read.');
    return result.Output.evidence;
  }

  /**
   * The pinned protocol's sign-off policy and the newest no-sign-off refusal of the model (one batched `RunViews`): the
   * wait opened when that refusal was recorded.
   */
  protected async LoadPolicy(model: MJMLModelEntity): Promise<void> {
    const protocolId = model.EvaluationProtocolID;
    const results = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews([
      {
        EntityName: 'MJ: ML Evaluation Protocols',
        ExtraFilter: protocolId ? `ID='${EscapeSQLString(protocolId)}'` : '1=0',
        ResultType: 'entity_object',
      },
      {
        EntityName: 'MJ: ML Model Publish Records',
        ExtraFilter: `ModelID='${EscapeSQLString(model.ID)}' AND Kind='refusal'`,
        OrderBy: 'RecordedAt DESC',
        ResultType: 'entity_object',
      },
    ]);
    // RunViews answers in request order: index 0 is the protocol read, index 1 the refusal records read.
    const protocols: RunViewResult<MJMLEvaluationProtocolEntity> | undefined = results[0];
    const refusals: RunViewResult<MJMLModelPublishRecordEntity> | undefined = results[1];
    if (!protocols?.Success) throw new Error(`The model's Evaluation Protocol could not be read: ${protocols?.ErrorMessage || 'the view returned no result'}`);
    if (!refusals?.Success) throw new Error(`The model's refusal records could not be read: ${refusals?.ErrorMessage || 'the view returned no result'}`);
    const protocol = protocols.Results[0];
    if (protocol) {
      const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(protocol);
      if (!parsed.Ok) throw new Error(`The model's Evaluation Protocol could not be read: ${parsed.Errors.join('; ')}`);
      this.Policy = { RequiresHumanSignOff: parsed.Value.promotion.requiresHumanSignOff, SignOffExpiryDays: parsed.Value.promotion.signOffExpiryDays };
    }
    const waitOpened = refusals.Results.find((r) => r.RefusalObject?.kind === 'no-sign-off');
    this.WithheldAt = waitOpened ? waitOpened.RecordedAt : null;
  }

  /** The date the registry job closes the sign-off wait, or null when no wait is open. */
  public get WaitClosesOn(): Date | null {
    if (!this.Policy?.RequiresHumanSignOff || !this.WithheldAt) return null;
    return new Date(this.WithheldAt.getTime() + this.Policy.SignOffExpiryDays * DAY_MS);
  }

  /** The paired comparisons of the evidence, in name order. */
  public get Comparisons(): { readonly Name: string; readonly Value: number; readonly Lower: number; readonly Upper: number; readonly Beats: boolean }[] {
    const comparisons = this.Evidence?.comparisons || {};
    return Object.keys(comparisons)
      .sort()
      .map((name) => {
        const c = comparisons[name];
        return { Name: name, Value: c.value, Lower: c.ci[0], Upper: c.ci[1], Beats: c.beats };
      });
  }

  /** True when a publish needs an approving sign-off first: the protocol requires one, or the evidence has flags. */
  public get NeedsSignOff(): boolean {
    return (this.Policy?.RequiresHumanSignOff || false) || (this.Evidence?.leakageFlags.length || 0) > 0;
  }

  /** True when the Approve/Reject section is shown. */
  public get ShowsSignOff(): boolean {
    return this.NeedsSignOff || this.Overrides.size > 0;
  }

  /** True when the reason rule is met: a reason is required once any override is ticked. */
  private get reasonSatisfied(): boolean {
    return this.Overrides.size === 0 || this.Reason.trim().length > 0;
  }

  /** Approve needs the reason rule and every flag overridden (an approval that leaves a flag would not publish). */
  public get CanApprove(): boolean {
    const flags = this.Evidence?.leakageFlags || [];
    return !this.Busy && this.SignOffRecordId === null && this.reasonSatisfied && flags.every((f) => this.Overrides.has(f.kind));
  }

  /** Reject needs a reason. */
  public get CanReject(): boolean {
    return !this.Busy && this.SignOffRecordId === null && this.Reason.trim().length > 0;
  }

  /** Publish needs the evidence, and an approving sign-off when one is needed. */
  public get CanPublish(): boolean {
    return !this.Busy && this.Evidence !== null && !this.Rejected && (!this.NeedsSignOff || this.SignOffRecordId !== null);
  }

  /** What the Publish button will do, or why it waits. */
  public get PublishHint(): string {
    if (this.Rejected) return 'The sign-off was rejected.';
    if (this.NeedsSignOff && this.SignOffRecordId === null) return 'Approve a sign-off first; the publish consumes it.';
    return 'You are recorded as the approver. The lifecycle gate re-checks the stored evidence.';
  }

  /** True when `kind` is ticked. */
  public IsOverridden(kind: PredictiveStudioLeakageFlagKind): boolean {
    return this.Overrides.has(kind);
  }

  /** Ticks or unticks the override of `kind`. */
  public ToggleOverride(kind: PredictiveStudioLeakageFlagKind): void {
    const next = new Set(this.Overrides);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    this.Overrides = next;
    this.cdr.markForCheck();
  }

  /** The words of a flag kind. */
  public FlagWords(kind: PredictiveStudioLeakageFlagKind): string {
    return FLAG_WORDS[kind];
  }

  /** Opens the confirmation for `action`. */
  public Ask(action: PendingAction): void {
    this.RefusalMessage = null;
    this.Pending = action;
    this.cdr.markForCheck();
  }

  /** Closes the confirmation without acting. */
  public Cancel(): void {
    if (this.Busy) return;
    this.Pending = null;
    this.cdr.markForCheck();
  }

  /** How the open confirmation is presented. */
  public get PendingPresentation(): ConfirmPresentation {
    return CONFIRM[this.Pending || 'publish'];
  }

  /** The open confirmation's message. */
  public get PendingMessage(): string {
    switch (this.Pending) {
      case 'publish':
        return 'Publish this model? The lifecycle gate re-checks its stored evidence and archives the model it replaces.';
      case 'approve':
        return this.Overrides.size > 0
          ? `Approve publishing this model, overriding ${this.Overrides.size} leakage flag(s) with your reason?`
          : 'Approve publishing this model on its stored evidence?';
      case 'reject':
        return 'Reject publishing this model? The rejection is recorded with your reason.';
      default:
        return '';
    }
  }

  /** Runs the confirmed action. */
  public async Confirm(): Promise<void> {
    const action = this.Pending;
    if (!action || this.Busy || !this.Model) return;
    this.Busy = true;
    this.cdr.markForCheck();
    try {
      if (action === 'publish') await this.publish(this.Model);
      else await this.signOff(this.Model, action);
    } catch (e) {
      this.RefusalMessage = e instanceof Error ? e.message : String(e);
    } finally {
      this.Busy = false;
      this.Pending = null;
      this.cdr.markForCheck();
    }
  }

  /** Records the sign-off through `PredictiveStudio.SignOffModel`. */
  private async signOff(model: MJMLModelEntity, decision: 'approve' | 'reject'): Promise<void> {
    const result = await new PredictiveStudioSignOffModelOperation().Execute(
      { modelId: model.ID, purpose: 'publish', decision, reason: this.Reason.trim(), overridesFlags: [...this.Overrides] },
      this.opContext(),
    );
    if (!result.Success || !result.Output) {
      this.RefusalMessage = result.ErrorMessage || 'The sign-off was not recorded.';
      return;
    }
    if (decision === 'approve') this.SignOffRecordId = result.Output.signOffRecordId;
    else this.Rejected = true;
  }

  /** Publishes through `PredictiveStudio.PromoteModel` and maps its result (§5.3). */
  private async publish(model: MJMLModelEntity): Promise<void> {
    const result = await new PredictiveStudioPromoteModelOperation().Execute(
      { modelId: model.ID, transition: 'publish', signOffId: this.SignOffRecordId || undefined, reason: this.Reason.trim() || undefined },
      this.opContext(),
    );
    if (!result.Success || !result.Output) {
      this.RefusalMessage = result.ErrorMessage || 'The publish failed.';
      return;
    }
    if (!result.Output.applied) {
      this.RefusalMessage = result.Output.refusal ? TransitionRefusalText.For(result.Output.refusal) : `The lifecycle gate did not publish the model; it stays ${result.Output.status}.`;
      return;
    }
    const status = result.Output.status;
    if (!LifecycleLabels.IsPersistedStatus(status)) {
      this.RefusalMessage = `The model was published, but the gate returned an unknown status (${status || 'none'}).`;
      return;
    }
    this.Published.emit(status);
  }

  /** The provider and user every operation runs as: the caller's, never a system user. */
  private opContext(): RemoteOpInvokeOptions {
    const provider = this.ProviderToUse;
    return { provider, user: provider.CurrentUser };
  }
}

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLModelEntity, MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { TransitionRefusalText } from '@memberjunction/predictive-studio-core';
import { PSInitiatorLinks, type PSInitiatorLink, type PSOpenRecordRequest } from './ps-model-detail-events';

/** One publish-history row as shown. */
interface PublishHistoryRowVM {
  readonly ID: string;
  readonly KindLabel: string;
  readonly KindClass: 'green' | 'amber' | 'blue';
  readonly Approver: string;
  readonly Initiator: PSInitiatorLink;
  readonly RecordedAt: Date;
  readonly GateDecision: string | null;
  readonly EvidenceSha256: string | null;
  readonly RefusalText: string | null;
  readonly Transient: boolean;
  readonly Reason: string | null;
}

/** The words of each publish-record purpose. */
const PURPOSE_WORDS: Readonly<Record<MJMLModelPublishRecordEntity['Purpose'], string>> = {
  publish: 'Publish',
  rollback: 'Rollback',
  adopt: 'Adoption',
  evaluate: 'Evaluation',
};

/** The words of each gate outcome. */
const GATE_OUTCOME_WORDS: Readonly<Record<NonNullable<MJMLModelPublishRecordEntity['GateDecisionObject']>['outcome'], string>> = {
  model: 'ships the model',
  'keep-simple-baseline': 'keeps the simple baseline',
  'no-signal': 'no signal',
};

/**
 * **PSPublishHistoryComponent** (L2) — a model's `MJ: ML Model Publish Records`, newest first: what happened (a publish,
 * a rollback, a pre-change adoption, a withheld attempt, a sign-off), the approver (the automated gate or the person),
 * the initiator (agent run, Process Run, scheduled job run or person, each a link the host opens), the time, the gate
 * decision, the evidence hash, a refusal in plain words and whether it was transient. Reads through the host's
 * provider; never routes — a link click is the {@link OpenRecord} request.
 */
@Component({
  standalone: true,
  selector: 'ps-publish-history',
  imports: [CommonModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ps-ph" data-testid="ps-publish-history">
      @if (Loading) {
        <div class="ps-ph-note"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading the publish history…</div>
      } @else if (ErrorMessage) {
        <div class="ps-ph-error" data-testid="ps-publish-history-error">{{ ErrorMessage }}</div>
      } @else if (Rows.length === 0) {
        <div class="ps-ph-note" data-testid="ps-publish-history-empty">No publish, refusal or sign-off has been recorded for this model.</div>
      } @else {
        @for (r of Rows; track r.ID; let i = $index) {
          <div class="ps-ph-row" data-testid="ps-publish-history-row">
            <div class="ps-ph-line">
              <span class="ps-ph-kind" [class]="'ps-ph-kind ' + r.KindClass">{{ r.KindLabel }}</span>
              <span class="ps-ph-meta">by {{ r.Approver }}</span>
              <span class="ps-ph-meta">· started by
                @if (r.Initiator.Record; as rec) {
                  <button mjButton variant="flat" size="sm" type="button" data-testid="ps-publish-initiator" [attr.data-record-id]="rec.RecordID"
                    [attr.data-entity]="rec.EntityName" (click)="Open(rec)">{{ r.Initiator.Label }}</button>
                } @else {
                  <span data-testid="ps-publish-initiator">{{ r.Initiator.Label }}</span>
                }
              </span>
              <span class="ps-ph-time">{{ r.RecordedAt | date: 'medium' }}</span>
            </div>
            @if (r.GateDecision) {
              <div class="ps-ph-detail">Gate decision: {{ r.GateDecision }}</div>
            }
            @if (r.RefusalText) {
              <div class="ps-ph-refusal" data-testid="ps-publish-refusal">
                {{ r.RefusalText }}
                <span class="ps-ph-transient">{{ r.Transient ? '(transient)' : '(final)' }}</span>
              </div>
            }
            @if (r.Reason) {
              <div class="ps-ph-detail">Reason: {{ r.Reason }}</div>
            }
            @if (r.EvidenceSha256) {
              <div class="ps-ph-hash" [title]="r.EvidenceSha256">evidence {{ r.EvidenceSha256.slice(0, 12) }}…</div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .ps-ph { display: flex; flex-direction: column; gap: 8px; }
    .ps-ph-note { font-size: 13px; color: var(--mj-text-muted); padding: 8px 0; }
    .ps-ph-error { font-size: 13px; color: var(--mj-status-error-text); background: var(--mj-status-error-bg); border: 1px solid var(--mj-status-error-border); border-radius: 6px; padding: 8px 10px; }
    .ps-ph-row { border: 1px solid var(--mj-border-subtle); border-radius: 8px; padding: 10px 12px; background: var(--mj-bg-surface); }
    .ps-ph-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .ps-ph-kind { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; }
    .ps-ph-kind.green { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
    .ps-ph-kind.amber { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
    .ps-ph-kind.blue { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); }
    .ps-ph-meta { font-size: 13px; color: var(--mj-text-secondary); display: inline-flex; align-items: center; gap: 4px; }
    .ps-ph-time { margin-left: auto; font-size: 12px; color: var(--mj-text-muted); }
    .ps-ph-detail { font-size: 12px; color: var(--mj-text-secondary); margin-top: 4px; }
    .ps-ph-refusal { font-size: 13px; color: var(--mj-status-warning-text); margin-top: 4px; }
    .ps-ph-transient { color: var(--mj-text-muted); font-size: 12px; }
    .ps-ph-hash { font-family: var(--mj-font-family-mono); font-size: 11px; color: var(--mj-text-muted); margin-top: 4px; }
  `],
})
export class PSPublishHistoryComponent extends BaseAngularComponent implements OnInit {
  /** The model whose records are listed; a change reloads (after the first load in `ngOnInit`). */
  @Input()
  set Model(value: MJMLModelEntity | null) {
    if (value === this.model) return;
    this.model = value;
    if (this.initialized) void this.Reload();
  }
  get Model(): MJMLModelEntity | null {
    return this.model;
  }

  /** A request to open the record a link names (an initiator); the host navigates. */
  @Output() OpenRecord = new EventEmitter<PSOpenRecordRequest>();

  /** The rows, newest first. */
  public Rows: readonly PublishHistoryRowVM[] = [];

  /** True while the records load. */
  public Loading = false;

  /** Why the records could not be read, or null. */
  public ErrorMessage: string | null = null;

  private readonly cdr = inject(ChangeDetectorRef);
  private model: MJMLModelEntity | null = null;
  /** True once `ngOnInit` ran: every input, the Provider included, is bound, so a Model change reloads. */
  private initialized = false;
  /** Counts loads; a load whose token is no longer the latest drops its result (the model changed while it read). */
  private loadToken = 0;

  /** The first load, once every input (the Provider included) is bound. */
  public ngOnInit(): void {
    this.initialized = true;
    void this.Reload();
  }

  /** Reads the model's publish records and rebuilds the rows; a load the model changed under discards what it read. */
  public async Reload(): Promise<void> {
    const token = ++this.loadToken;
    const model = this.Model;
    if (!model) {
      this.Rows = [];
      this.Loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.Loading = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
    try {
      const records = await this.LoadRecords(model.ID);
      if (token !== this.loadToken) return;
      this.Rows = records.map((r) => PSPublishHistoryComponent.ToRow(r));
    } catch (e) {
      if (token !== this.loadToken) return;
      this.Rows = [];
      this.ErrorMessage = `The publish history could not be read: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      if (token === this.loadToken) {
        this.Loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  /** Emits the request to open `record`. */
  public Open(record: PSOpenRecordRequest): void {
    this.OpenRecord.emit(record);
  }

  /** The model's publish records, newest first, through the host's provider (one batched `RunViews`). */
  protected async LoadRecords(modelId: string): Promise<MJMLModelPublishRecordEntity[]> {
    const [result] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews<MJMLModelPublishRecordEntity>([
      {
        EntityName: 'MJ: ML Model Publish Records',
        ExtraFilter: `ModelID='${EscapeSQLString(modelId)}'`,
        OrderBy: 'RecordedAt DESC',
        ResultType: 'entity_object',
      },
    ]);
    if (!result?.Success) throw new Error(result?.ErrorMessage || 'the view returned no result');
    return result.Results;
  }

  /** One record as a row. */
  public static ToRow(r: MJMLModelPublishRecordEntity): PublishHistoryRowVM {
    const refusal = r.RefusalObject;
    const gate = r.GateDecisionObject;
    return {
      ID: r.ID,
      KindLabel: PSPublishHistoryComponent.KindLabel(r),
      KindClass: r.Kind === 'publish' ? 'green' : r.Kind === 'refusal' ? 'amber' : 'blue',
      Approver: r.ApproverKind === 'automated-gate' ? 'automated gate' : r.User || 'a person',
      Initiator: PSInitiatorLinks.For(r.InitiatorObject),
      RecordedAt: r.RecordedAt,
      GateDecision: gate ? `${GATE_OUTCOME_WORDS[gate.outcome]} (${gate.branch})` : null,
      EvidenceSha256: r.EvidenceSha256,
      RefusalText: refusal ? TransitionRefusalText.For(refusal) : null,
      Transient: r.Transient,
      Reason: r.Reason,
    };
  }

  /** What a record says happened. */
  public static KindLabel(r: MJMLModelPublishRecordEntity): string {
    switch (r.Kind) {
      case 'publish':
        return r.Purpose === 'rollback' ? 'Rolled back to this model' : r.Purpose === 'adopt' ? 'Adopted (trained before the gate, re-verified)' : 'Published';
      case 'refusal':
        return `${PURPOSE_WORDS[r.Purpose]} withheld`;
      case 'sign-off':
        return r.Decision === 'reject' ? 'Sign-off: rejected' : 'Sign-off: approved';
    }
  }
}

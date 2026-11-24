import { ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJButtonDirective, MJDialogComponent } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  PredictiveStudioCreateScoringProcessOperation,
  RecordProcessRunNowOperation,
  MJUserViewEntity,
  MJListEntity,
  MJScheduledJobTypeEntity,
} from '@memberjunction/core-entities';
import { SchedulingModule } from '@memberjunction/ng-scheduling';
import type { ScheduledJobDialogResult } from '@memberjunction/ng-scheduling';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import {
  OperateModelState,
  OperateScopeMode,
  OperateOutputMode,
  OperateValueKind,
  MapStateToCreateScoringInput,
  DescribeOperateMappingError,
  OperateRunNoticeOf,
} from './ps-operate-dialog.mapping';

const RUN_RECORD_PROCESS_JOB_TYPE = 'Run Record Process';

/**
 * **Operate this model** — the dialog that turns a published model into a running one. It composes
 * three primitives, no bespoke transport:
 *  - **what** → the `PredictiveStudio.CreateScoringProcess` Remote Op (persists an on-demand
 *    `WorkType='ML Model'` Record Process; write-back when an output column is chosen, generic otherwise);
 *  - **now** → the generic `RecordProcess.RunNow` Remote Op on that process;
 *  - **when** → the generic `@memberjunction/ng-scheduling` dialog (a "Run Record Process" scheduled job).
 *
 * The target entity is FIXED to the model's training entity (the model's features only assemble against
 * that entity), so the knobs are **scope** (everyone / a saved view / a list) and **output** (generic /
 * write-back column). Pure submit→input mapping lives in `ps-operate-dialog.mapping.ts` (unit-tested).
 */
@Component({
  standalone: true,
  selector: 'ps-operate-dialog',
  imports: [CommonModule, MJButtonDirective, MJDialogComponent, SchedulingModule],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-operate-dialog.component.css'],
  template: `
    <mj-dialog [Visible]="Visible" [Title]="'Operate · ' + ModelLabel" [Width]="640" (Close)="OnCancel()">
      <div class="ps-operate" data-testid="ps-operate-dialog">
        <!-- target entity (fixed to the model's training entity) -->
        <div class="ps-callout info op-target">
          <i class="fa-solid fa-table"></i>
          <div class="ps-small">
            Scores <strong>{{ State.TargetEntityName || '—' }}</strong> — the entity this model was trained on.
          </div>
        </div>

        <!-- SCOPE -->
        <div class="ps-field">
          <label>Which records?</label>
          <div class="ps-seg" data-testid="ps-operate-scope">
            <button [class.on]="State.ScopeMode === 'all'" (click)="SetScope('all')"><i class="fa-solid fa-globe"></i> Everyone</button>
            <button [class.on]="State.ScopeMode === 'view'" (click)="SetScope('view')"><i class="fa-solid fa-table-list"></i> A saved view</button>
            <button [class.on]="State.ScopeMode === 'list'" (click)="SetScope('list')"><i class="fa-solid fa-list-check"></i> A list</button>
          </div>
          @if (State.ScopeMode === 'view') {
            <select class="mj-input" data-testid="ps-operate-view" [value]="State.ViewId || ''" (change)="State.ViewId = $any($event.target).value">
              <option value="" disabled>Choose a view…</option>
              @for (v of Views; track v.ID) { <option [value]="v.ID">{{ v.Name }}</option> }
            </select>
            @if (Views.length === 0) { <div class="ps-small ps-muted op-hint">No saved views for {{ State.TargetEntityName }} yet — pick Everyone or a list.</div> }
          }
          @if (State.ScopeMode === 'list') {
            <select class="mj-input" data-testid="ps-operate-list" [value]="State.ListId || ''" (change)="State.ListId = $any($event.target).value">
              <option value="" disabled>Choose a list…</option>
              @for (l of Lists; track l.ID) { <option [value]="l.ID">{{ l.Name }}</option> }
            </select>
            @if (Lists.length === 0) { <div class="ps-small ps-muted op-hint">No lists for {{ State.TargetEntityName }} yet — pick Everyone or a view.</div> }
          }
        </div>

        <!-- OUTPUT -->
        <div class="ps-field">
          <label>Where do predictions go?</label>
          <div class="ps-seg" data-testid="ps-operate-output">
            <button [class.on]="State.OutputMode === 'generic'" (click)="State.OutputMode = 'generic'"><i class="fa-solid fa-clock-rotate-left"></i> Run history only</button>
            <button [class.on]="State.OutputMode === 'writeback'" (click)="State.OutputMode = 'writeback'"><i class="fa-solid fa-pen-to-square"></i> Write back to a column</button>
          </div>
          @if (State.OutputMode === 'writeback') {
            <input class="mj-input" type="text" list="ps-operate-fields" data-testid="ps-operate-column"
              placeholder="Column on {{ State.TargetEntityName }} (e.g. RenewalProbability)"
              [value]="State.OutputField" (input)="State.OutputField = $any($event.target).value" />
            <datalist id="ps-operate-fields">@for (f of EntityFields; track f) { <option [value]="f"></option> }</datalist>
            @if (IsClassification) {
              <div class="ps-seg sm" style="margin-top:8px">
                <button [class.on]="State.ValueKind === 'score'" (click)="State.ValueKind = 'score'">Probability</button>
                <button [class.on]="State.ValueKind === 'class'" (click)="State.ValueKind = 'class'">Predicted class</button>
              </div>
            }
          }
        </div>

        <!-- live summary -->
        <div class="ps-callout op-summary" data-testid="ps-operate-summary">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <div class="ps-small" [innerHTML]="Summary"></div>
        </div>
      </div>

      <!-- footer (affirmative on the left, MJ convention) -->
      <div class="op-footer">
        <button mjButton variant="primary" size="sm" data-testid="ps-operate-run" [disabled]="Busy" (click)="OnRunNow()">
          <i class="fa-solid fa-play"></i> Run now
        </button>
        <button mjButton variant="secondary" size="sm" data-testid="ps-operate-schedule" [disabled]="Busy" (click)="OnSchedule()">
          <i class="fa-solid fa-clock"></i> Schedule…
        </button>
        <span class="ps-spacer"></span>
        @if (Busy) { <span class="ps-small ps-muted"><i class="fa-solid fa-spinner fa-spin"></i> {{ BusyLabel }}</span> }
        <button mjButton variant="flat" size="sm" [disabled]="Busy" (click)="OnCancel()">Cancel</button>
      </div>
    </mj-dialog>

    <!-- WHEN: the generic scheduling dialog, opened after the Record Process is created -->
    <mj-scheduled-job-dialog
      [Visible]="ScheduleOpen"
      [JobTypeID]="JobTypeId"
      [DefaultConfiguration]="SchedConfig"
      [HideJobType]="true"
      (Close)="OnScheduleClose($event)">
    </mj-scheduled-job-dialog>
  `,
})
export class PSOperateDialogComponent extends BaseAngularComponent {
  @Input() modelId = '';
  @Input() ModelLabel = '';

  @Input() engine!: PredictiveStudioEngine;
  @Input() provider: IMetadataProvider | null = null;
  @Input() CurrentUser: UserInfo | null = null;

  /** Opening the dialog (false → true) initializes the knobs + loads views/lists/fields for the model's entity. */
  @Input()
  set Visible(value: boolean) {
    const opening = value && !this._visible;
    this._visible = value;
    if (opening) {
      void this.init();
    }
  }
  get Visible(): boolean {
    return this._visible;
  }
  private _visible = false;

  @Output() Close = new EventEmitter<{ changed: boolean }>();

  private cdr = inject(ChangeDetectorRef);
  private notifications = inject(MJNotificationService);

  public State: OperateModelState = this.blankState();

  public Views: MJUserViewEntity[] = [];

  public Lists: MJListEntity[] = [];

  public EntityFields: string[] = [];

  public IsClassification = false;

  public Busy = false;

  public BusyLabel = '';

  // scheduling sub-dialog
  public ScheduleOpen = false;

  public JobTypeId: string | null = null;

  public SchedConfig: string | null = null;

  // ---- init / load (DB-light: a couple of small scoped RunViews on open) ----

  private async init(): Promise<void> {
    this.State = this.blankState();
    this.Views = [];
    this.Lists = [];
    this.EntityFields = [];
    this.ScheduleOpen = false;

    const model = this.engine?.ModelByID(this.modelId);
    this.IsClassification = model?.ProblemType === 'classification';
    const pipeline = model ? this.engine.Pipelines.find((p) => UUIDsEqual(p.ID, model.PipelineID)) : undefined;
    const entity = pipeline?.TargetEntityID
      ? this.ProviderToUse.Entities.find((e) => UUIDsEqual(e.ID, pipeline.TargetEntityID))
      : undefined;
    this.State.TargetEntityName = entity?.Name ?? '';
    this.EntityFields = (entity?.Fields ?? []).map((f) => f.Name).sort((a, b) => a.localeCompare(b));

    await Promise.all([this.loadViews(entity?.ID), this.loadLists(entity?.ID), this.resolveJobType()]);
    this.cdr.detectChanges();
  }

  private async loadViews(entityId: string | undefined): Promise<void> {
    if (!entityId) return;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const r = await rv.RunView<MJUserViewEntity>(
      { EntityName: 'MJ: User Views', ExtraFilter: `EntityID='${entityId}'`, OrderBy: 'Name', ResultType: 'entity_object' },
      this.ProviderToUse.CurrentUser,
    );
    this.Views = r.Success ? (r.Results ?? []) : [];
  }

  private async loadLists(entityId: string | undefined): Promise<void> {
    if (!entityId) return;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const r = await rv.RunView<MJListEntity>(
      { EntityName: 'MJ: Lists', ExtraFilter: `EntityID='${entityId}'`, OrderBy: 'Name', ResultType: 'entity_object' },
      this.ProviderToUse.CurrentUser,
    );
    this.Lists = r.Success ? (r.Results ?? []) : [];
  }

  /** Resolve the "Run Record Process" scheduled-job-type id the generic scheduler dialog needs. */
  private async resolveJobType(): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const r = await rv.RunView<MJScheduledJobTypeEntity>(
      { EntityName: 'MJ: Scheduled Job Types', ExtraFilter: `Name='${RUN_RECORD_PROCESS_JOB_TYPE}'`, ResultType: 'entity_object' },
      this.ProviderToUse.CurrentUser,
    );
    this.JobTypeId = r.Success ? (r.Results?.[0]?.ID ?? null) : null;
  }

  public SetScope(mode: OperateScopeMode): void {
    this.State.ScopeMode = mode;
  }

  // ---- live summary ----

  public get Summary(): string {
    const entity = this.State.TargetEntityName || 'the entity';
    const scope =
      this.State.ScopeMode === 'all'
        ? `every record in <strong>${entity}</strong>`
        : this.State.ScopeMode === 'view'
          ? `the <strong>${this.viewName() ?? 'selected'}</strong> view of ${entity}`
          : `the <strong>${this.listName() ?? 'selected'}</strong> list of ${entity}`;
    const output =
      this.State.OutputMode === 'writeback'
        ? this.State.OutputField.trim()
          ? `writes the ${this.State.ValueKind === 'class' ? 'predicted class' : 'probability'} into <strong>${this.State.OutputField.trim()}</strong>`
          : `writes back to a column you choose`
        : `records each prediction as a Feature Value (no column written)`;
    return `Scores ${scope} with <strong>${this.ModelLabel}</strong> and ${output}.`;
  }

  private viewName(): string | null {
    return this.Views.find((v) => UUIDsEqual(v.ID, this.State.ViewId ?? ''))?.Name ?? null;
  }
  private listName(): string | null {
    return this.Lists.find((l) => UUIDsEqual(l.ID, this.State.ListId ?? ''))?.Name ?? null;
  }

  // ---- actions ----

  /** Create the scoring Record Process, then run it once immediately. */
  public async OnRunNow(): Promise<void> {
    const rpId = await this.createProcess('Creating + running…');
    if (!rpId) return;
    try {
      const run = new RecordProcessRunNowOperation();
      const result = await run.Execute({ recordProcessID: rpId }, { provider: this.provider ?? undefined, user: this.CurrentUser ?? undefined });
      if (result.Success && result.Output) {
        const notice = OperateRunNoticeOf(result.Output);
        this.notifications.CreateSimpleNotification(notice.Message, notice.Style, notice.Style === 'success' ? 5000 : 8000);
        await this.refreshAndClose();
      } else {
        this.notifications.CreateSimpleNotification(result.ErrorMessage || 'Run failed (the process was created and can be run again).', 'error', 6000);
      }
    } catch (e) {
      this.notifications.CreateSimpleNotification(`Run error: ${this.msg(e)}`, 'error', 6000);
    } finally {
      this.Busy = false;
      this.cdr.detectChanges();
    }
  }

  /** Create the scoring Record Process, then hand it to the generic scheduler dialog. */
  public async OnSchedule(): Promise<void> {
    if (!this.JobTypeId) {
      this.notifications.CreateSimpleNotification('Scheduling is unavailable — the "Run Record Process" job type was not found.', 'error', 6000);
      return;
    }
    const rpId = await this.createProcess('Creating process…');
    if (!rpId) return;
    this.Busy = false;
    this.SchedConfig = JSON.stringify({ RecordProcessID: rpId });
    this.ScheduleOpen = true;
    this.cdr.detectChanges();
  }

  public async OnScheduleClose(result: ScheduledJobDialogResult): Promise<void> {
    this.ScheduleOpen = false;
    if (result?.Saved) {
      this.notifications.CreateSimpleNotification(`Scheduled "${this.ModelLabel}" to score on a recurring cadence.`, 'success', 5000);
      await this.refreshAndClose();
    } else {
      // The on-demand Record Process still exists (it can be run or scheduled later) — just close.
      this.notifications.CreateSimpleNotification('Scoring process created (not scheduled). You can run or schedule it anytime.', 'info', 4500);
      await this.refreshAndClose();
    }
  }

  public OnCancel(): void {
    if (this.Busy) return;
    this.Close.emit({ changed: false });
  }

  // ---- shared op plumbing ----

  /** Map knobs → input and create the scoring Record Process via the Remote Op. Returns its id, or null on failure. */
  private async createProcess(label: string): Promise<string | null> {
    const mapped = MapStateToCreateScoringInput(this.State);
    if (!mapped.ok) {
      this.notifications.CreateSimpleNotification(DescribeOperateMappingError(mapped.error), 'warning', 4000);
      return null;
    }
    this.Busy = true;
    this.BusyLabel = label;
    this.cdr.detectChanges();
    try {
      const op = new PredictiveStudioCreateScoringProcessOperation();
      const result = await op.Execute(mapped.input, { provider: this.provider ?? undefined, user: this.CurrentUser ?? undefined });
      if (result.Success && result.Output?.recordProcessId) {
        return result.Output.recordProcessId;
      }
      this.notifications.CreateSimpleNotification(result.ErrorMessage || 'Could not create the scoring process.', 'error', 6000);
      this.Busy = false;
      return null;
    } catch (e) {
      this.notifications.CreateSimpleNotification(`Could not create the scoring process: ${this.msg(e)}`, 'error', 6000);
      this.Busy = false;
      return null;
    }
  }

  private async refreshAndClose(): Promise<void> {
    await this.engine.Config(true, this.CurrentUser ?? undefined, this.provider ?? undefined);
    this.Busy = false;
    this.Close.emit({ changed: true });
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private blankState(): OperateModelState {
    return {
      ModelId: this.modelId,
      TargetEntityName: '',
      ScopeMode: 'all',
      ViewId: null,
      ListId: null,
      OutputMode: 'generic',
      OutputField: '',
      ValueKind: 'score',
    };
  }
}

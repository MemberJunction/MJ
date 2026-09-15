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
    <mj-dialog [Visible]="Visible" [Title]="'Operate · ' + modelLabel" [Width]="640" (Close)="onCancel()">
      <div class="ps-operate" data-testid="ps-operate-dialog">
        <!-- target entity (fixed to the model's training entity) -->
        <div class="ps-callout info op-target">
          <i class="fa-solid fa-table"></i>
          <div class="ps-small">
            Scores <strong>{{ state.targetEntityName || '—' }}</strong> — the entity this model was trained on.
          </div>
        </div>

        <!-- SCOPE -->
        <div class="ps-field">
          <label>Which records?</label>
          <div class="ps-seg" data-testid="ps-operate-scope">
            <button [class.on]="state.scopeMode === 'all'" (click)="setScope('all')"><i class="fa-solid fa-globe"></i> Everyone</button>
            <button [class.on]="state.scopeMode === 'view'" (click)="setScope('view')"><i class="fa-solid fa-table-list"></i> A saved view</button>
            <button [class.on]="state.scopeMode === 'list'" (click)="setScope('list')"><i class="fa-solid fa-list-check"></i> A list</button>
          </div>
          @if (state.scopeMode === 'view') {
            <select class="mj-input" data-testid="ps-operate-view" [value]="state.viewId || ''" (change)="state.viewId = $any($event.target).value">
              <option value="" disabled>Choose a view…</option>
              @for (v of views; track v.ID) { <option [value]="v.ID">{{ v.Name }}</option> }
            </select>
            @if (views.length === 0) { <div class="ps-small ps-muted op-hint">No saved views for {{ state.targetEntityName }} yet — pick Everyone or a list.</div> }
          }
          @if (state.scopeMode === 'list') {
            <select class="mj-input" data-testid="ps-operate-list" [value]="state.listId || ''" (change)="state.listId = $any($event.target).value">
              <option value="" disabled>Choose a list…</option>
              @for (l of lists; track l.ID) { <option [value]="l.ID">{{ l.Name }}</option> }
            </select>
            @if (lists.length === 0) { <div class="ps-small ps-muted op-hint">No lists for {{ state.targetEntityName }} yet — pick Everyone or a view.</div> }
          }
        </div>

        <!-- OUTPUT -->
        <div class="ps-field">
          <label>Where do predictions go?</label>
          <div class="ps-seg" data-testid="ps-operate-output">
            <button [class.on]="state.outputMode === 'generic'" (click)="state.outputMode = 'generic'"><i class="fa-solid fa-clock-rotate-left"></i> Run history only</button>
            <button [class.on]="state.outputMode === 'writeback'" (click)="state.outputMode = 'writeback'"><i class="fa-solid fa-pen-to-square"></i> Write back to a column</button>
          </div>
          @if (state.outputMode === 'writeback') {
            <input class="mj-input" type="text" list="ps-operate-fields" data-testid="ps-operate-column"
              placeholder="Column on {{ state.targetEntityName }} (e.g. RenewalProbability)"
              [value]="state.outputField" (input)="state.outputField = $any($event.target).value" />
            <datalist id="ps-operate-fields">@for (f of entityFields; track f) { <option [value]="f"></option> }</datalist>
            @if (isClassification) {
              <div class="ps-seg sm" style="margin-top:8px">
                <button [class.on]="state.valueKind === 'score'" (click)="state.valueKind = 'score'">Probability</button>
                <button [class.on]="state.valueKind === 'class'" (click)="state.valueKind = 'class'">Predicted class</button>
              </div>
            }
          }
        </div>

        <!-- live summary -->
        <div class="ps-callout op-summary" data-testid="ps-operate-summary">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <div class="ps-small" [innerHTML]="summary"></div>
        </div>
      </div>

      <!-- footer (affirmative on the left, MJ convention) -->
      <div class="op-footer">
        <button mjButton variant="primary" size="sm" data-testid="ps-operate-run" [disabled]="busy" (click)="onRunNow()">
          <i class="fa-solid fa-play"></i> Run now
        </button>
        <button mjButton variant="secondary" size="sm" data-testid="ps-operate-schedule" [disabled]="busy" (click)="onSchedule()">
          <i class="fa-solid fa-clock"></i> Schedule…
        </button>
        <span class="ps-spacer"></span>
        @if (busy) { <span class="ps-small ps-muted"><i class="fa-solid fa-spinner fa-spin"></i> {{ busyLabel }}</span> }
        <button mjButton variant="flat" size="sm" [disabled]="busy" (click)="onCancel()">Cancel</button>
      </div>
    </mj-dialog>

    <!-- WHEN: the generic scheduling dialog, opened after the Record Process is created -->
    <mj-scheduled-job-dialog
      [Visible]="scheduleOpen"
      [JobTypeID]="jobTypeId"
      [DefaultConfiguration]="schedConfig"
      [HideJobType]="true"
      (Close)="onScheduleClose($event)">
    </mj-scheduled-job-dialog>
  `,
})
export class PSOperateDialogComponent extends BaseAngularComponent {
  @Input() modelId = '';
  @Input() ModelLabel = '';

  /** @deprecated Use {@link ModelLabel}. */
  @Input() set modelLabel(value: PSOperateDialogComponent['ModelLabel']) {
    this.ModelLabel = value;
  }
  /** @deprecated Use {@link ModelLabel}. */
  get modelLabel(): PSOperateDialogComponent['ModelLabel'] {
    return this.ModelLabel;
  }
  @Input() engine!: PredictiveStudioEngine;
  @Input() provider: IMetadataProvider | null = null;
  @Input() CurrentUser: UserInfo | null = null;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo | null) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo | null {
    return this.CurrentUser;
  }

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

  /** @deprecated Use {@link State}. */
  public get state(): OperateModelState {
    return this.State;
  }
  /** @deprecated Use {@link State}. */
  public set state(value: OperateModelState) {
    this.State = value;
  }
  public Views: MJUserViewEntity[] = [];

  /** @deprecated Use {@link Views}. */
  public get views(): MJUserViewEntity[] {
    return this.Views;
  }
  /** @deprecated Use {@link Views}. */
  public set views(value: MJUserViewEntity[]) {
    this.Views = value;
  }
  public Lists: MJListEntity[] = [];

  /** @deprecated Use {@link Lists}. */
  public get lists(): MJListEntity[] {
    return this.Lists;
  }
  /** @deprecated Use {@link Lists}. */
  public set lists(value: MJListEntity[]) {
    this.Lists = value;
  }
  public EntityFields: string[] = [];

  /** @deprecated Use {@link EntityFields}. */
  public get entityFields(): string[] {
    return this.EntityFields;
  }
  /** @deprecated Use {@link EntityFields}. */
  public set entityFields(value: string[]) {
    this.EntityFields = value;
  }
  public IsClassification = false;

  /** @deprecated Use {@link IsClassification}. */
  public get isClassification() {
    return this.IsClassification;
  }
  /** @deprecated Use {@link IsClassification}. */
  public set isClassification(value) {
    this.IsClassification = value;
  }
  public Busy = false;

  /** @deprecated Use {@link Busy}. */
  public get busy() {
    return this.Busy;
  }
  /** @deprecated Use {@link Busy}. */
  public set busy(value) {
    this.Busy = value;
  }
  public BusyLabel = '';

  /** @deprecated Use {@link BusyLabel}. */
  public get busyLabel() {
    return this.BusyLabel;
  }
  /** @deprecated Use {@link BusyLabel}. */
  public set busyLabel(value) {
    this.BusyLabel = value;
  }

  // scheduling sub-dialog
  public ScheduleOpen = false;

  /** @deprecated Use {@link ScheduleOpen}. */
  public get scheduleOpen() {
    return this.ScheduleOpen;
  }
  /** @deprecated Use {@link ScheduleOpen}. */
  public set scheduleOpen(value) {
    this.ScheduleOpen = value;
  }
  public JobTypeId: string | null = null;

  /** @deprecated Use {@link JobTypeId}. */
  public get jobTypeId(): string | null {
    return this.JobTypeId;
  }
  /** @deprecated Use {@link JobTypeId}. */
  public set jobTypeId(value: string | null) {
    this.JobTypeId = value;
  }
  public SchedConfig: string | null = null;

  /** @deprecated Use {@link SchedConfig}. */
  public get schedConfig(): string | null {
    return this.SchedConfig;
  }
  /** @deprecated Use {@link SchedConfig}. */
  public set schedConfig(value: string | null) {
    this.SchedConfig = value;
  }

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
    this.State.targetEntityName = entity?.Name ?? '';
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
    this.State.scopeMode = mode;
  }

  /** @deprecated Use {@link SetScope}. */
  public setScope(mode: OperateScopeMode): void {
    return this.SetScope(mode);
  }

  // ---- live summary ----

  public get Summary(): string {
    const entity = this.State.targetEntityName || 'the entity';
    const scope =
      this.State.scopeMode === 'all'
        ? `every record in <strong>${entity}</strong>`
        : this.State.scopeMode === 'view'
          ? `the <strong>${this.viewName() ?? 'selected'}</strong> view of ${entity}`
          : `the <strong>${this.listName() ?? 'selected'}</strong> list of ${entity}`;
    const output =
      this.State.outputMode === 'writeback'
        ? this.State.outputField.trim()
          ? `writes the ${this.State.valueKind === 'class' ? 'predicted class' : 'probability'} into <strong>${this.State.outputField.trim()}</strong>`
          : `writes back to a column you choose`
        : `records predictions in the run history (no column written)`;
    return `Scores ${scope} with <strong>${this.ModelLabel}</strong> and ${output}.`;
  }

  /** @deprecated Use {@link Summary}. */
  public get summary(): string {
    return this.Summary;
  }

  private viewName(): string | null {
    return this.Views.find((v) => UUIDsEqual(v.ID, this.State.viewId ?? ''))?.Name ?? null;
  }
  private listName(): string | null {
    return this.Lists.find((l) => UUIDsEqual(l.ID, this.State.listId ?? ''))?.Name ?? null;
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
        this.notifications.CreateSimpleNotification(
          `Scored ${result.Output.success}/${result.Output.processed} record(s) — ${result.Output.status}.`,
          result.Output.status === 'Completed' ? 'success' : 'warning',
          5000,
        );
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

  /** @deprecated Use {@link OnRunNow}. */
  public async onRunNow(): Promise<void> {
    return this.OnRunNow();
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

  /** @deprecated Use {@link OnSchedule}. */
  public async onSchedule(): Promise<void> {
    return this.OnSchedule();
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

  /** @deprecated Use {@link OnScheduleClose}. */
  public async onScheduleClose(result: ScheduledJobDialogResult): Promise<void> {
    return this.OnScheduleClose(result);
  }

  public onCancel(): void {
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
      modelId: this.modelId,
      targetEntityName: '',
      scopeMode: 'all',
      viewId: null,
      listId: null,
      outputMode: 'generic',
      outputField: '',
      valueKind: 'score',
    };
  }
}

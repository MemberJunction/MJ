import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError, RunView, type AuthorizationInfo, type EntityInfo, type RunViewResult } from '@memberjunction/core';
import {
  PredictiveStudioWithdrawScoringBindingOperation,
  type MJMLModelEntity,
  type MJMLModelScoringBindingEntity,
  type MJMLTrainingPipelineEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual, ValidationErrorInfo } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { PredictionViewAuthorization } from '@memberjunction/predictive-studio-core';

/** The `MJ: ML Training Pipelines` fields the editor reads. */
type PipelineRow = Pick<MJMLTrainingPipelineEntity, 'ID' | 'Name' | 'TargetEntityID'>;

/** The binding fields the editor writes, as the form holds them. */
interface BindingDraft {
  /** The binding being edited; null for a new one. */
  Binding: MJMLModelScoringBindingEntity | null;
  FeatureName: string;
  TargetEntityID: string | null;
  ViewAuthorizationID: string | null;
  /** The retention box's value: a number, or null for an empty box ("keep all history"). Angular's number input writes a number, not text. */
  RetentionDays: number | null;
  CopyToColumn: boolean;
  TargetColumn: string | null;
  TargetColumnSource: string;
}

/** The fields whose refusals the editor shows beside them; any other refusal is shown above the buttons. */
const FIELD_ERROR_SOURCES = ['FeatureName', 'TargetEntityID', 'ViewAuthorizationID', 'RetentionDays', 'TargetColumn', 'TargetColumnSource', 'MLTrainingPipelineID'] as const;
type FieldErrorSource = (typeof FIELD_ERROR_SOURCES)[number];

/**
 * **PSScoringBindingEditorComponent** — creates, edits and withdraws the scoring bindings of a model's training pipeline
 * (§5.8.2). A binding defines a prediction feature: the pipeline's Published model scores the target entity's records
 * into `MJ: Feature Values` under the binding's feature name, visible to the users who hold its view authorization
 * (default "View Model Predictions"), kept for its retention, and optionally copied into an existing column of the
 * target entity — a copied value is governed by that entity's field permissions, not the binding's authorization (§5.4).
 *
 * Saves go through the entity layer, so the server's `MJMLModelScoringBindingEntityServer` validation decides, and each
 * `ValidationErrorInfo` it returns is shown beside its field. Withdrawal goes through
 * `PredictiveStudio.WithdrawScoringBinding`. An L2 composite hosted by the model detail's Bindings section (D4-48): no
 * router, no Explorer dependency.
 */
@Component({
  standalone: true,
  selector: 'ps-scoring-binding-editor',
  templateUrl: './ps-scoring-binding-editor.component.html',
  styleUrls: ['./ps-scoring-binding-editor.component.css'],
  imports: [CommonModule, FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSScoringBindingEditorComponent extends BaseAngularComponent implements OnInit {
  /**
   * The model whose training pipeline's bindings are edited. A new model re-reads the bindings once the editor is
   * initialized (the first read runs in `ngOnInit`, after every input — `Provider` included — is bound). The host binds
   * `Provider` once for the editor's life: `BaseAngularComponent` declares it a plain input field, which a subclass
   * cannot override with a setter (TS2610), so a later provider swap is not re-read.
   */
  @Input()
  set Model(value: MJMLModelEntity | null) {
    if (value === this._model) return;
    this._model = value;
    if (this.initialized) void this.load();
  }
  get Model(): MJMLModelEntity | null {
    return this._model;
  }

  /** Emitted after a binding is saved. */
  @Output() Saved = new EventEmitter<MJMLModelScoringBindingEntity>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(MJNotificationService);

  /** The pipeline's bindings, oldest first. */
  public Bindings: MJMLModelScoringBindingEntity[] = [];

  /** The binding form; null when closed. */
  public Draft: BindingDraft | null = null;

  /** Refusals of the last save, by field. */
  public FieldErrors: Partial<Record<FieldErrorSource, string[]>> = {};

  /** A save refusal not tied to a field the form shows. */
  public GeneralError: string | null = null;

  /** The binding awaiting withdrawal confirmation. */
  public PendingWithdrawal: MJMLModelScoringBindingEntity | null = null;

  /** True while the pipeline and its bindings are being read. */
  public Loading = false;

  /** True while a save or a withdrawal is in flight; the form's controls are disabled. */
  public Busy = false;

  /** Why the last read failed, shown in place of the list; null after a successful read. */
  public LoadError: string | null = null;

  /** The draft target entity's fields a column copy can write (updatable, not a key, not read-only); kept in step with the draft. */
  public CopyColumns: string[] = [];

  private _model: MJMLModelEntity | null = null;

  /** True once `ngOnInit` ran: a later {@link Model} change re-reads. */
  private initialized = false;

  /** Incremented by each read; a read whose token is no longer current drops its result (a newer model is shown). */
  private loadToken = 0;

  /** The pipeline's target entity, the default target of a new binding. */
  private pipeline: PipelineRow | null = null;

  /** Reads the model's bindings once every input is bound. */
  public ngOnInit(): void {
    this.initialized = true;
    void this.load();
  }

  /** The authorizations a binding can name, by name (read from the provider's metadata on load). */
  public Authorizations: AuthorizationInfo[] = [];

  /** The entities a binding can target, by name (read from the provider's metadata on load). */
  public Entities: EntityInfo[] = [];

  /** Sets the draft's target entity and the column-copy choices that follow from it. */
  public SetTargetEntity(entityId: string | null): void {
    if (!this.Draft) return;
    this.Draft.TargetEntityID = entityId;
    this.refreshCopyColumns();
    this.cdr.markForCheck();
  }

  /** The default copy source for the model's output: the adverse probability of a classification, the value of a regression. */
  public get DefaultCopySource(): string {
    return this.Model?.ProblemType === 'regression' ? '$.Value' : '$.AdverseProbability';
  }

  /** The display name of a binding's target entity. */
  public EntityName(binding: MJMLModelScoringBindingEntity): string {
    if (binding.TargetEntity) return binding.TargetEntity;
    return (binding.TargetEntityID && this.ProviderToUse.EntityByID(binding.TargetEntityID)?.Name) || '—';
  }

  /** The display name of a binding's view authorization, or a warning when it has none. */
  public AuthorizationName(binding: MJMLModelScoringBindingEntity): string {
    if (!binding.ViewAuthorizationID) return 'no view authorization — nobody sees its predictions';
    return binding.ViewAuthorization || this.ProviderToUse.Authorizations.find((a) => UUIDsEqual(a.ID, binding.ViewAuthorizationID))?.Name || binding.ViewAuthorizationID;
  }

  /** The refusals of a field. */
  public ErrorsFor(source: FieldErrorSource): string[] {
    return this.FieldErrors[source] || [];
  }

  /** The column-copy refusals (the column and its source). */
  public get CopyErrors(): string[] {
    return [...this.ErrorsFor('TargetColumn'), ...this.ErrorsFor('TargetColumnSource')];
  }

  /** Opens the form for a new binding of the model's pipeline, with the seeded view authorization and no column copy. */
  public StartNew(): void {
    const seeded = PredictionViewAuthorization.FindDefault(this.ProviderToUse.Authorizations);
    this.Draft = {
      Binding: null,
      FeatureName: '',
      TargetEntityID: this.pipeline?.TargetEntityID || null,
      ViewAuthorizationID: seeded ? seeded.ID : null,
      RetentionDays: null,
      CopyToColumn: false,
      TargetColumn: null,
      TargetColumnSource: this.DefaultCopySource,
    };
    this.refreshCopyColumns();
    this.clearErrors();
    this.cdr.markForCheck();
  }

  /** Opens the form on an existing binding. Its feature name and target entity key its stored values, so they stay. */
  public StartEdit(binding: MJMLModelScoringBindingEntity): void {
    this.Draft = {
      Binding: binding,
      FeatureName: binding.FeatureName,
      TargetEntityID: binding.TargetEntityID,
      ViewAuthorizationID: binding.ViewAuthorizationID,
      RetentionDays: binding.RetentionDays,
      CopyToColumn: binding.TargetColumn !== null,
      TargetColumn: binding.TargetColumn,
      TargetColumnSource: binding.TargetColumnSource || this.DefaultCopySource,
    };
    this.refreshCopyColumns();
    this.clearErrors();
    this.cdr.markForCheck();
  }

  /** Closes the form without saving (ignored while a save is in flight). */
  public Cancel(): void {
    if (this.Busy) return;
    this.Draft = null;
    this.refreshCopyColumns();
    this.clearErrors();
    this.cdr.markForCheck();
  }

  /** Toggles the optional column copy. */
  public ToggleCopy(): void {
    if (!this.Draft) return;
    this.Draft.CopyToColumn = !this.Draft.CopyToColumn;
    this.cdr.markForCheck();
  }

  /**
   * Saves the draft through the entity layer; on a refusal, shows each validation error beside its field. A refused or
   * failed save of an existing binding reverts that binding to its stored values, so its list row never shows what was
   * typed; the form keeps the typed values for another try.
   */
  public async Save(): Promise<void> {
    const draft = this.Draft;
    if (!draft || this.Busy || !this.Model) return;
    this.Busy = true;
    this.clearErrors();
    this.cdr.markForCheck();
    try {
      const binding = draft.Binding || (await this.newBinding());
      this.applyDraft(binding, draft);
      if (await binding.Save()) {
        this.Draft = null;
        this.notifications.CreateSimpleNotification(`Saved the scoring binding "${binding.FeatureName}".`, 'success', 3500);
        this.Saved.emit(binding);
        await this.load();
      } else {
        this.showRefusal(binding);
        if (draft.Binding) draft.Binding.Revert();
      }
    } catch (e) {
      this.GeneralError = e instanceof Error ? e.message : String(e);
      if (draft.Binding) draft.Binding.Revert();
    } finally {
      this.Busy = false;
      this.cdr.markForCheck();
    }
  }

  /** Asks to withdraw `binding`. */
  public RequestWithdraw(binding: MJMLModelScoringBindingEntity): void {
    this.PendingWithdrawal = binding;
    this.cdr.markForCheck();
  }

  /** Dismisses the withdrawal confirmation (ignored while the withdrawal is in flight). */
  public CancelWithdraw(): void {
    if (this.Busy) return;
    this.PendingWithdrawal = null;
    this.cdr.markForCheck();
  }

  /** Withdraws the pending binding through `PredictiveStudio.WithdrawScoringBinding`, then re-reads the bindings. */
  public async ConfirmWithdraw(): Promise<void> {
    const binding = this.PendingWithdrawal;
    if (!binding || this.Busy) return;
    this.Busy = true;
    this.cdr.markForCheck();
    try {
      const result = await new PredictiveStudioWithdrawScoringBindingOperation().Execute(
        { bindingId: binding.ID },
        { provider: this.ProviderToUse, user: this.ProviderToUse.CurrentUser },
      );
      if (result.Success && result.Output) {
        this.notifications.CreateSimpleNotification(
          `Withdrew "${binding.FeatureName}": ${result.Output.cleared} copied value(s) cleared, ${result.Output.keptHuman} value(s) a person entered kept.`,
          'success',
          5000,
        );
        this.PendingWithdrawal = null;
        await this.load();
      } else {
        this.notifications.CreateSimpleNotification(result.ErrorMessage || `Could not withdraw "${binding.FeatureName}".`, 'error', 6000);
      }
    } catch (e) {
      this.notifications.CreateSimpleNotification(`The withdrawal failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
    } finally {
      this.Busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Reads the pipeline and its bindings in one batch. Each read takes a token; when the model changes while a read is in
   * flight, the older read's result (or failure) is dropped, so the list always belongs to the current model.
   */
  private async load(): Promise<void> {
    const token = ++this.loadToken;
    const pipelineId = this.Model?.PipelineID;
    if (!pipelineId) {
      this.Bindings = [];
      this.pipeline = null;
      this.Loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.Loading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      this.Authorizations = [...this.ProviderToUse.Authorizations].sort((a, b) => a.Name.localeCompare(b.Name));
      this.Entities = [...this.ProviderToUse.Entities].sort((a, b) => a.Name.localeCompare(b.Name));
      const id = EscapeSQLString(pipelineId);
      const results = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews(
        [
          { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${id}'`, Fields: ['ID', 'Name', 'TargetEntityID'], MaxRows: 1, ResultType: 'simple' },
          { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `MLTrainingPipelineID='${id}'`, OrderBy: '__mj_CreatedAt ASC', ResultType: 'entity_object' },
        ],
        this.ProviderToUse.CurrentUser,
      );
      if (token !== this.loadToken) return;
      // RunViews answers in request order: index 0 is the pipeline read, index 1 the bindings read.
      const pipelineRes = PSScoringBindingEditorComponent.succeeded<PipelineRow>(results[0], 'the pipeline');
      const bindingRes = PSScoringBindingEditorComponent.succeeded<MJMLModelScoringBindingEntity>(results[1], 'the bindings');
      this.pipeline = pipelineRes.Results[0] || null;
      this.Bindings = bindingRes.Results;
    } catch (e) {
      if (token !== this.loadToken) return;
      this.LoadError = `Could not read the scoring bindings: ${e instanceof Error ? e.message : String(e)}`;
      LogError(`[PSScoringBindingEditor] ${this.LoadError}`);
    } finally {
      if (token === this.loadToken) {
        this.Loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  /** `result` when it succeeded; throws naming `what` when it failed or is missing. */
  private static succeeded<T>(result: RunViewResult<T> | undefined, what: string): RunViewResult<T> {
    if (!result?.Success) throw new Error(`reading ${what} failed: ${result?.ErrorMessage || 'the view returned no result'}`);
    return result;
  }

  /** Recomputes {@link CopyColumns} from the draft's target entity. */
  private refreshCopyColumns(): void {
    const entity = this.Draft?.TargetEntityID ? this.ProviderToUse.EntityByID(this.Draft.TargetEntityID) : undefined;
    this.CopyColumns = entity ? entity.Fields.filter((f) => f.AllowUpdateAPI && !f.ReadOnly && !f.IsPrimaryKey).map((f) => f.Name) : [];
  }

  private async newBinding(): Promise<MJMLModelScoringBindingEntity> {
    const binding = await this.ProviderToUse.GetEntityObject<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', this.ProviderToUse.CurrentUser);
    binding.NewRecord();
    return binding;
  }

  /** Writes the draft onto the binding. A new binding scores the model's pipeline; no column copy clears both copy fields. */
  private applyDraft(binding: MJMLModelScoringBindingEntity, draft: BindingDraft): void {
    if (!draft.Binding && this.Model) {
      binding.MLTrainingPipelineID = this.Model.PipelineID;
      binding.FeatureName = draft.FeatureName.trim();
      binding.TargetEntityID = draft.TargetEntityID;
    }
    binding.ViewAuthorizationID = draft.ViewAuthorizationID;
    binding.RetentionDays = typeof draft.RetentionDays === 'number' && Number.isFinite(draft.RetentionDays) ? draft.RetentionDays : null;
    binding.TargetColumn = draft.CopyToColumn ? draft.TargetColumn : null;
    binding.TargetColumnSource = draft.CopyToColumn ? draft.TargetColumnSource.trim() || null : null;
  }

  /** Shows a save's validation errors beside their fields, and anything else above the buttons. */
  private showRefusal(binding: MJMLModelScoringBindingEntity): void {
    const errors = (binding.LatestResult?.Errors || []).filter((e): e is ValidationErrorInfo => e instanceof ValidationErrorInfo);
    const byField: Partial<Record<FieldErrorSource, string[]>> = {};
    const other: string[] = [];
    for (const e of errors) {
      const source = FIELD_ERROR_SOURCES.find((s) => s === e.Source);
      if (source) byField[source] = [...(byField[source] || []), e.Message];
      else other.push(e.Message);
    }
    this.FieldErrors = byField;
    this.GeneralError = other.length > 0 ? other.join(' ') : errors.length === 0 ? binding.LatestResult?.CompleteMessage || 'The binding was not saved.' : null;
  }

  private clearErrors(): void {
    this.FieldErrors = {};
    this.GeneralError = null;
  }
}

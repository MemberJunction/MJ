import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
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

/** The name of the seeded authorization a new binding's predictions are viewed under by default (§5.8.4). */
export const VIEW_MODEL_PREDICTIONS = 'View Model Predictions';

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
export class PSScoringBindingEditorComponent extends BaseAngularComponent implements OnChanges {
  /** The model whose training pipeline's bindings are edited. */
  @Input() Model: MJMLModelEntity | null = null;

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

  public Loading = false;
  public Busy = false;
  public LoadError: string | null = null;

  /** The pipeline's target entity, the default target of a new binding. */
  private pipeline: PipelineRow | null = null;

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['Model'] || changes['Provider']) void this.load();
  }

  /** The authorizations a binding can name, by name (read from the provider's metadata on load). */
  public Authorizations: AuthorizationInfo[] = [];

  /** The entities a binding can target, by name (read from the provider's metadata on load). */
  public Entities: EntityInfo[] = [];

  /** The draft target entity's fields a column copy can write: updatable, not a key, not read-only. */
  public get CopyColumns(): string[] {
    const entity = this.Draft?.TargetEntityID ? this.ProviderToUse.EntityByID(this.Draft.TargetEntityID) : undefined;
    return entity ? entity.Fields.filter((f) => f.AllowUpdateAPI && !f.ReadOnly && !f.IsPrimaryKey).map((f) => f.Name) : [];
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
    const seeded = this.ProviderToUse.Authorizations.find((a) => a.Name === VIEW_MODEL_PREDICTIONS);
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
    this.clearErrors();
    this.cdr.markForCheck();
  }

  public Cancel(): void {
    if (this.Busy) return;
    this.Draft = null;
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

  /** Reads the pipeline and its bindings in one batch. */
  private async load(): Promise<void> {
    const pipelineId = this.Model?.PipelineID;
    if (!pipelineId) {
      this.Bindings = [];
      this.pipeline = null;
      return;
    }
    this.Loading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      this.Authorizations = [...this.ProviderToUse.Authorizations].sort((a, b) => a.Name.localeCompare(b.Name));
      this.Entities = [...this.ProviderToUse.Entities].sort((a, b) => a.Name.localeCompare(b.Name));
      const id = EscapeSQLString(pipelineId);
      const [pipelineRes, bindingRes]: RunViewResult<PipelineRow | MJMLModelScoringBindingEntity>[] = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews<PipelineRow | MJMLModelScoringBindingEntity>(
        [
          { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${id}'`, Fields: ['ID', 'Name', 'TargetEntityID'], MaxRows: 1, ResultType: 'simple' },
          { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `MLTrainingPipelineID='${id}'`, OrderBy: '__mj_CreatedAt ASC', ResultType: 'entity_object' },
        ],
        this.ProviderToUse.CurrentUser,
      );
      for (const r of [pipelineRes, bindingRes]) {
        if (!r?.Success) throw new Error(r?.ErrorMessage || 'the read failed');
      }
      this.pipeline = pipelineRes.Results.filter(PSScoringBindingEditorComponent.isPipelineRow)[0] || null;
      this.Bindings = bindingRes.Results.filter(PSScoringBindingEditorComponent.isBinding);
    } catch (e) {
      this.LoadError = `Could not read the scoring bindings: ${e instanceof Error ? e.message : String(e)}`;
      LogError(`[PSScoringBindingEditor] ${this.LoadError}`);
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
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

  private static isPipelineRow(r: PipelineRow | MJMLModelScoringBindingEntity): r is PipelineRow {
    return 'Name' in r && !('FeatureName' in r);
  }

  private static isBinding(r: PipelineRow | MJMLModelScoringBindingEntity): r is MJMLModelScoringBindingEntity {
    return 'FeatureName' in r;
  }
}

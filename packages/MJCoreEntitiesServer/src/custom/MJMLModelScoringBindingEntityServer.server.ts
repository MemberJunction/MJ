import { BaseEntity, RunView, type EntityDeleteOptions, type EntityInfo, type IMetadataProvider, type UserInfo, type ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
  MJMLModelScoringBindingEntity, type MJMLModelEntity, type MJMLTrainingPipelineEntity, type MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import { JsonParse, RegistrySchemas, TaskTypeRules, type TaskType } from '@memberjunction/predictive-studio-core';
import { FormScopeRefusalResult } from './FormScopeGuard';
import { VersionedRowGuard } from './MJMLPredictionUnitEntityServer.server';

/** The binding columns a save must carry. */
const REQUIRED_FIELDS = ['MLTrainingPipelineID', 'FeatureName', 'TargetEntityID', 'ViewAuthorizationID'] as const;

/** A parsed `TargetColumnSource`: the member of the scored result it names, and the class for `$.Probabilities.<class>`. */
export type CopySourceRef =
  | { readonly Member: 'Value' | 'Class' | 'AdverseProbability' }
  | { readonly Member: 'Probabilities'; readonly ClassName: string };

/** What the copy-source check knows of the pipeline's model output: classification or not, and the class order when known. */
interface OutputKind {
  readonly IsClassification: boolean;
  readonly ClassOrder: readonly string[] | null;
  /** Where the kind was read from, for the refusal text. */
  readonly From: string;
}

/** The model columns the copy-source check reads. */
type PublishedModelRow = Pick<MJMLModelEntity, 'ID' | 'OutputSemantics' | 'ProblemType'>;
/** The pipeline columns the copy-source check reads when the pipeline has no Published model. */
type PipelineRow = Pick<MJMLTrainingPipelineEntity, 'ID' | 'ProblemType'>;
/** The binding columns the uniqueness check reads. */
type BindingKeyRow = Pick<MJMLModelScoringBindingEntity, 'ID'>;
/** The Record Process columns the Feature Pipeline name check reads. */
type FeaturePipelineRow = Pick<MJRecordProcessEntity, 'ID' | 'Name' | 'Configuration'>;

/** The Record Process work type a Feature Pipeline runs as (its `Configuration` is the pipeline's spec). */
const FEATURE_PIPELINE_WORK_TYPE = 'Infer';

/**
 * `MJ: ML Model Scoring Bindings`: a binding defines one prediction feature of a target entity, scored with its training
 * pipeline's Published model. A save is refused, one structured error per rule, when the pipeline, feature name, target
 * entity or view authorization is missing; when the feature name is already used on the target entity by another binding
 * or by a Feature Pipeline's output (the long-format Feature Value key would mix them); when the target column is not an
 * updatable field of the target entity; and when the column has no copy source, or a source that does not parse or that
 * the pipeline's model output cannot give. A delete is refused unless the binding is withdrawn and no Feature Value names
 * it. Every read goes through the entity's own provider.
 */
@RegisterClass(BaseEntity, 'MJ: ML Model Scoring Bindings')
export class MJMLModelScoringBindingEntityServer extends MJMLModelScoringBindingEntity {
  /** The base checks, then the binding's own rules. */
  public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    this.checkRequired(result);
    const provider = this.ProviderToUse;
    if (!VersionedRowGuard.IsMetadataProvider(provider)) {
      VersionedRowGuard.Fail(result, 'MLTrainingPipelineID', "the entity's provider is not a metadata provider, so the binding's pipeline and target entity cannot be read");
      return result;
    }
    if (this.TargetEntityID && this.FeatureName) await this.checkFeatureName(result, provider);
    const target = this.TargetEntityID ? provider.Entities.find((e) => UUIDsEqual(e.ID, this.TargetEntityID)) : undefined;
    if (this.TargetColumn) {
      this.checkTargetColumn(result, target);
      await this.checkCopySource(result, provider);
    }
    return result;
  }

  /** Refused with "Withdraw the binding first" unless the binding is withdrawn and no Feature Value row names it. */
  public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
    const refusal = await this.deleteRefusal();
    if (refusal !== null) {
      this.RegisterResultHistoryEntry(FormScopeRefusalResult('delete', refusal));
      return false;
    }
    return super.Delete(options);
  }

  /**
   * Parses a `TargetColumnSource`: `$.Value`, `$.Class`, `$.AdverseProbability` or `$.Probabilities.<class>`. Pure.
   *
   * @returns the reference, or null when the text is none of those
   */
  public static ParseCopySource(text: string): CopySourceRef | null {
    const t = text.trim();
    if (t === '$.Value' || t === '$.Class' || t === '$.AdverseProbability') return { Member: t.substring(2) as 'Value' | 'Class' | 'AdverseProbability' };
    const prefix = '$.Probabilities.';
    if (t.startsWith(prefix) && t.length > prefix.length) return { Member: 'Probabilities', ClassName: t.substring(prefix.length) };
    return null;
  }

  /**
   * The problem with copying `ref` from a model whose output is `kind`, or null when the output gives it. Pure.
   */
  public static CopySourceProblem(ref: CopySourceRef, kind: OutputKind): string | null {
    if (ref.Member === 'Value') {
      return kind.IsClassification ? `$.Value is a regression output; ${kind.From} is a classification, use $.Class, $.AdverseProbability or $.Probabilities.<class>` : null;
    }
    if (!kind.IsClassification) return `$.${ref.Member} is a classification output; ${kind.From} is a regression, use $.Value`;
    if (ref.Member !== 'Probabilities') return null;
    if (kind.ClassOrder === null) return `$.Probabilities.${ref.ClassName} cannot be checked: ${kind.From} states no class order`;
    return kind.ClassOrder.includes(ref.ClassName) ? null : `"${ref.ClassName}" is not a class of ${kind.From} (classes: ${kind.ClassOrder.join(', ')})`;
  }

  /** One error per required field the base checks did not already name. */
  private checkRequired(result: ValidationResult): void {
    for (const field of REQUIRED_FIELDS) {
      const value = this[field];
      if (value !== null && value !== undefined && String(value).trim().length > 0) continue;
      if (result.Errors.some((e) => e.Source === field)) continue;
      VersionedRowGuard.Fail(result, field, `${field} is required: a scoring binding names its training pipeline, feature name, target entity and view authorization`);
    }
  }

  /** The feature name is unique on the target entity among bindings and is not a Feature Pipeline output there. */
  private async checkFeatureName(result: ValidationResult, provider: IMetadataProvider): Promise<void> {
    const entityFilter = `TargetEntityID='${EscapeSQLString(this.TargetEntityID || '')}' AND FeatureName='${EscapeSQLString(this.FeatureName)}'`;
    const selfFilter = this.IsSaved ? ` AND ID<>'${EscapeSQLString(this.ID)}'` : ''; // pk-filter-ok: MJ: ML Model Scoring Bindings is an MJ core entity keyed by ID
    const other = await VersionedRowGuard.ReadOneRow<BindingKeyRow>(provider, 'MJ: ML Model Scoring Bindings', entityFilter + selfFilter, this.ActiveUser, ['ID']);
    if (other.Error !== null) {
      VersionedRowGuard.Fail(result, 'FeatureName', `Reading the target entity's other scoring bindings failed: ${other.Error}`);
    } else if (other.Row !== null) {
      VersionedRowGuard.Fail(result, 'FeatureName', `Feature name "${this.FeatureName}" is already used by scoring binding ${other.Row.ID} on the same target entity`);
    }
    const pipelines = await MJMLModelScoringBindingEntityServer.readRows<FeaturePipelineRow>(provider, 'MJ: Record Processes',
      `EntityID='${EscapeSQLString(this.TargetEntityID || '')}' AND WorkType='${FEATURE_PIPELINE_WORK_TYPE}'`, this.ActiveUser, ['ID', 'Name', 'Configuration']);
    if (pipelines.Error !== null) {
      VersionedRowGuard.Fail(result, 'FeatureName', `Reading the target entity's Feature Pipelines failed: ${pipelines.Error}`);
      return;
    }
    const clash = pipelines.Rows.find((p) => MJMLModelScoringBindingEntityServer.OutputNames(p.Configuration).some((n) => n.toLowerCase() === this.FeatureName.toLowerCase()));
    if (clash) VersionedRowGuard.Fail(result, 'FeatureName', `Feature name "${this.FeatureName}" is an output of Feature Pipeline "${clash.Name}" on the same target entity`);
  }

  /**
   * The output names a Feature Pipeline's spec declares (`Outputs[].Name`); none for a configuration that does not parse.
   * Pure.
   */
  public static OutputNames(configuration: string | null): string[] {
    const json = JsonParse.ParseJsonText(configuration, 'Configuration');
    if (json.Ok === false || !JsonParse.IsJsonObject(json.Value)) return [];
    const outputs = JsonParse.JsonArrayField(json.Value, 'Outputs') || [];
    return outputs.flatMap((o) => (JsonParse.IsJsonObject(o) ? [JsonParse.JsonString(o, 'Name')] : [])).filter((n): n is string => n !== null);
  }

  /** The target column is an existing, updatable field of the target entity. */
  private checkTargetColumn(result: ValidationResult, target: EntityInfo | undefined): void {
    if (!target) {
      if (this.TargetEntityID) VersionedRowGuard.Fail(result, 'TargetEntityID', `Target entity ${this.TargetEntityID} is not in the provider's metadata`);
      return;
    }
    const column = this.TargetColumn || '';
    const field = target.Fields.find((f) => f.Name.toLowerCase() === column.toLowerCase());
    if (!field) {
      VersionedRowGuard.Fail(result, 'TargetColumn', `Target column "${column}" is not a field of ${target.Name}`);
    } else if (field.IsPrimaryKey || field.IsVirtual || field.ReadOnly || !field.AllowUpdateAPI) {
      VersionedRowGuard.Fail(result, 'TargetColumn', `Target column "${column}" of ${target.Name} is not an updatable field`);
    }
  }

  /** A target column has a copy source that parses and that the pipeline's model output can give. */
  private async checkCopySource(result: ValidationResult, provider: IMetadataProvider): Promise<void> {
    if (!this.TargetColumnSource || this.TargetColumnSource.trim().length === 0) {
      VersionedRowGuard.Fail(result, 'TargetColumnSource', 'TargetColumnSource is required when TargetColumn is set: it names the scored value the column receives');
      return;
    }
    const ref = MJMLModelScoringBindingEntityServer.ParseCopySource(this.TargetColumnSource);
    if (ref === null) {
      VersionedRowGuard.Fail(result, 'TargetColumnSource', `TargetColumnSource "${this.TargetColumnSource}" is not one of $.Value, $.Class, $.AdverseProbability or $.Probabilities.<class>`);
      return;
    }
    if (!this.MLTrainingPipelineID) return;
    const kind = await this.readOutputKind(result, provider);
    if (kind === null) return;
    const problem = MJMLModelScoringBindingEntityServer.CopySourceProblem(ref, kind);
    if (problem !== null) VersionedRowGuard.Fail(result, 'TargetColumnSource', problem);
  }

  /**
   * What the pipeline's model output is: from its newest Published model's `OutputSemantics` (or its `ProblemType` when
   * it has none), else from the pipeline's `ProblemType`. Null when it could not be read, the reason on `result`.
   */
  private async readOutputKind(result: ValidationResult, provider: IMetadataProvider): Promise<OutputKind | null> {
    const pipelineId = EscapeSQLString(this.MLTrainingPipelineID);
    const published = await MJMLModelScoringBindingEntityServer.readRows<PublishedModelRow>(provider, 'MJ: ML Models', `PipelineID='${pipelineId}' AND Status='Published'`,
      this.ActiveUser, ['ID', 'OutputSemantics', 'ProblemType'], 'Version DESC');
    if (published.Error !== null) {
      VersionedRowGuard.Fail(result, 'MLTrainingPipelineID', `Reading the pipeline's Published model failed: ${published.Error}`);
      return null;
    }
    const model = published.Rows[0];
    if (model) return MJMLModelScoringBindingEntityServer.ModelOutputKind(model);
    const pipeline = await VersionedRowGuard.ReadOneRow<PipelineRow>(provider, 'MJ: ML Training Pipelines', `ID='${pipelineId}'`, this.ActiveUser, ['ID', 'ProblemType']); // pk-filter-ok: MJ: ML Training Pipelines is an MJ core entity keyed by ID
    if (pipeline.Error !== null || pipeline.Row === null) {
      VersionedRowGuard.Fail(result, 'MLTrainingPipelineID', pipeline.Error !== null ? `Reading ML Training Pipeline ${this.MLTrainingPipelineID} failed: ${pipeline.Error}` : `ML Training Pipeline ${this.MLTrainingPipelineID} does not exist`);
      return null;
    }
    return { IsClassification: pipeline.Row.ProblemType === 'classification', ClassOrder: null, From: `ML Training Pipeline ${pipeline.Row.ID}` };
  }

  /** A Published model's output kind: its semantics' task when they parse, else its `ProblemType`. Pure. */
  public static ModelOutputKind(model: PublishedModelRow): OutputKind {
    const from = `the Published ML Model ${model.ID}`;
    const semantics = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    if (semantics.Ok === false) return { IsClassification: model.ProblemType === 'classification', ClassOrder: null, From: from };
    const task: TaskType = semantics.Value.task;
    return TaskTypeRules.IsClassificationTask(task)
      ? { IsClassification: true, ClassOrder: [...task.classOrder], From: from }
      : { IsClassification: false, ClassOrder: null, From: from };
  }

  /** Why the binding may not be deleted now, or null when it may. */
  private async deleteRefusal(): Promise<string | null> {
    if (this.Status !== 'Withdrawn') {
      return 'Withdraw the binding first: an active scoring binding is withdrawn (its column copies cleared) before it is deleted';
    }
    const provider = this.ProviderToUse;
    if (!VersionedRowGuard.IsMetadataProvider(provider)) {
      return "Withdraw the binding first: the entity's provider is not a metadata provider, so the binding's Feature Values cannot be counted";
    }
    const rows = await VersionedRowGuard.ReadOneRow<{ ID: string }>(provider, 'MJ: Feature Values', `MLModelScoringBindingID='${EscapeSQLString(this.ID)}'`, this.ActiveUser, ['ID']);
    if (rows.Error !== null) return `Withdraw the binding first: reading the binding's Feature Values failed: ${rows.Error}`;
    return rows.Row === null ? null : 'Withdraw the binding first and delete its Feature Values: Feature Value rows still name this binding';
  }
  /** Every row of `entityName` matching `filter`, as plain rows; a failed read is returned as its error. */
  private static async readRows<TRow>(provider: IMetadataProvider, entityName: string, filter: string, user: UserInfo | undefined, fields: readonly (keyof TRow & string)[], orderBy?: string): Promise<{ readonly Rows: TRow[]; readonly Error: string | null }> {
    const r = await RunView.FromMetadataProvider(provider).RunView<TRow>({ EntityName: entityName, ExtraFilter: filter, Fields: [...fields], ...(orderBy ? { OrderBy: orderBy } : {}), ResultType: 'simple' }, user);
    return r.Success ? { Rows: r.Results, Error: null } : { Rows: [], Error: r.ErrorMessage || 'unknown error' };
  }
}

/**
 * @module feature-assembly/as-of/feature-pin-resolver
 *
 * Resolves, at train time, the pin a Feature Value step reads (I3, D-013, D-058, D5-15, D5-B2-2):
 * - an `llm-derived` step (a Feature Pipeline's output: LLM or Decision type, so `llm-derived` and `decision-derived`
 *   features alike) is pinned to its Record Process's Active `MJ: Feature Pipeline Versions` row — the version number,
 *   prompt version hash, AI model and parameters hash the values were computed under;
 * - a `model-prediction` step is pinned to its scoring binding and the binding's pipeline's Published model.
 * A step with nothing to pin is refused `unpinned-feature-version` (typed, never message text); a step that names a
 * feature the binding does not carry is refused `unresolved-column`. Reads run as the caller (`contextUser`).
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeaturePipelineVersionEntity, MJMLModelEntity, MJMLModelScoringBindingEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID } from '@memberjunction/global';
import type { AssemblyRefusal, FeatureStep, FeatureStepBase, FeatureValuePin, FeatureVersionPin, PredictionFeaturePin } from '@memberjunction/predictive-studio-core';

type LLMDerivedStep = Extract<FeatureStep, { Kind: 'llm-derived' }>;
type ModelPredictionStep = Extract<FeatureStep, { Kind: 'model-prediction' }>;
type VersionRow = Pick<MJFeaturePipelineVersionEntity, 'ID' | 'Version' | 'PromptVersionHash' | 'AIModelID' | 'ParametersHash'>;
type BindingRow = Pick<MJMLModelScoringBindingEntity, 'ID' | 'FeatureName' | 'MLTrainingPipelineID' | 'Status'>;

/** The Feature Pipeline version that is in use (`MJ: Feature Pipeline Versions.Status`). */
const ACTIVE_VERSION: MJFeaturePipelineVersionEntity['Status'] = 'Active';
/** A binding that still scores (`MJ: ML Model Scoring Bindings.Status`). */
const ACTIVE_BINDING: MJMLModelScoringBindingEntity['Status'] = 'Active';
/** The model a pipeline serves (`MJ: ML Models.Status`; one per pipeline, `UX_MLModel_OnePublishedPerPipeline`). */
const PUBLISHED_MODEL: MJMLModelEntity['Status'] = 'Published';

/** Resolves a Feature Value step's pin at train time. */
export class FeaturePinResolver {
  /**
   * The pin `step` reads, or the refusal that stops training.
   *
   * @param step an `llm-derived` or `model-prediction` step (any other kind is refused `unsupported-step-kind`)
   * @param provider the provider every read runs on
   * @param contextUser the user training runs as; every read is theirs
   */
  public static async Resolve(step: FeatureStep, provider: IMetadataProvider, contextUser: UserInfo): Promise<FeatureVersionPin | PredictionFeaturePin | AssemblyRefusal> {
    switch (step.Kind) {
      case 'llm-derived': return FeaturePinResolver.ResolvePipelinePin(step, provider, contextUser);
      case 'model-prediction': return FeaturePinResolver.ResolvePredictionPin(step, provider, contextUser);
      default: {
        const other: FeatureStepBase = step;
        return { kind: 'unsupported-step-kind', stepId: other.Id, stepKind: String(other.Kind) };
      }
    }
  }

  /** True when `step` is a step whose values are Feature Values, so training resolves a pin for it. */
  public static NeedsPin(step: FeatureStep): step is LLMDerivedStep | ModelPredictionStep {
    return step.Kind === 'llm-derived' || step.Kind === 'model-prediction';
  }

  /** True when a resolution is a refusal rather than a pin. */
  public static IsRefusal(r: FeatureValuePin | AssemblyRefusal): r is AssemblyRefusal {
    return 'kind' in r;
  }

  /** An `llm-derived` step's pin: its Record Process (by ID, or by name) and that process's one Active version. */
  protected static async ResolvePipelinePin(step: LLMDerivedStep, provider: IMetadataProvider, contextUser: UserInfo): Promise<FeatureVersionPin | AssemblyRefusal> {
    const unpinned: AssemblyRefusal = { kind: 'unpinned-feature-version', featureName: (step.Columns || [])[0] || step.Id };
    const ref = step.FeaturePipelineRef || '';
    const byKey = IsValidUUID(ref) ? `[ID]='${EscapeSQLString(ref)}'` : `[Name]='${EscapeSQLString(ref)}'`;
    const processes = await FeaturePinResolver.read<Pick<MJRecordProcessEntity, 'ID'>>(provider, contextUser, 'MJ: Record Processes', byKey, ['ID']);
    if (processes.length !== 1) return unpinned;
    const processId = processes[0].ID;
    const versions = await FeaturePinResolver.read<VersionRow>(provider, contextUser, 'MJ: Feature Pipeline Versions',
      `[RecordProcessID]='${EscapeSQLString(processId)}' AND [Status]='${ACTIVE_VERSION}'`, ['ID', 'Version', 'PromptVersionHash', 'AIModelID', 'ParametersHash']);
    if (versions.length !== 1) return unpinned;
    const v = versions[0];
    return { featurePipelineRecordProcessId: processId, pipelineVersion: v.Version, promptVersionHash: v.PromptVersionHash || null, aiModelId: v.AIModelID || null, parametersHash: v.ParametersHash || null };
  }

  /** A `model-prediction` step's pin: its Active binding, carrying the step's feature, and the binding's pipeline's Published model. */
  protected static async ResolvePredictionPin(step: ModelPredictionStep, provider: IMetadataProvider, contextUser: UserInfo): Promise<PredictionFeaturePin | AssemblyRefusal> {
    const unpinned: AssemblyRefusal = { kind: 'unpinned-feature-version', featureName: step.FeatureName };
    const bindings = await FeaturePinResolver.read<BindingRow>(provider, contextUser, 'MJ: ML Model Scoring Bindings',
      `[ID]='${EscapeSQLString(step.ScoringBindingID)}'`, ['ID', 'FeatureName', 'MLTrainingPipelineID', 'Status']);
    const binding = bindings.length === 1 ? bindings[0] : null;
    if (!binding || binding.Status !== ACTIVE_BINDING || !binding.MLTrainingPipelineID) return unpinned;
    if (binding.FeatureName !== step.FeatureName) return { kind: 'unresolved-column', entity: 'MJ: ML Model Scoring Bindings', field: step.FeatureName };
    const models = await FeaturePinResolver.read<Pick<MJMLModelEntity, 'ID'>>(provider, contextUser, 'MJ: ML Models',
      `[PipelineID]='${EscapeSQLString(binding.MLTrainingPipelineID)}' AND [Status]='${PUBLISHED_MODEL}'`, ['ID']);
    if (models.length !== 1) return unpinned;
    return { mlModelScoringBindingId: binding.ID, mlModelId: models[0].ID };
  }

  /** One read as the caller; a failed read throws (an infrastructure failure, not a refusal). */
  private static async read<T>(provider: IMetadataProvider, contextUser: UserInfo, entityName: string, filter: string, fields: string[]): Promise<T[]> {
    const r = await RunView.FromMetadataProvider(provider).RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple', IgnoreMaxRows: true }, contextUser);
    if (!r.Success) throw new Error(`FeaturePinResolver: reading ${entityName} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results || [];
  }
}

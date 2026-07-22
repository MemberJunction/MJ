/**
 * @module scoring/register
 *
 * Work-type registration + dynamic resolution for the scoring processor, WITHOUT
 * modifying the `record-set-processor` substrate (its base package must not
 * depend on Predictive Studio).
 *
 * ## How scoring plugs into Record Set Processing
 *
 * The substrate's `RecordProcessExecutor.buildProcessor()` builds the built-in
 * work types (`FieldRules` / `Action` / `Agent` / `Infer`) directly. To add the
 * `ML Model` work type without editing that package, the
 * {@link MLModelInferenceProcessor} registers itself on the MJGlobal ClassFactory
 * via `@RegisterClass` (mirroring how the substrate's own Remote Operations
 * register, e.g. `@RegisterClass(BaseRemotableOperation, 'RecordProcess.RunNow')`).
 *
 * A thin {@link resolveMLInferenceProcessor} pulls the processor back out by
 * work-type key. The supervisor wires this into the executor seam (a small
 * extension/override of `buildProcessor`) — no change to the base substrate is
 * required, so the package stays Predictive-Studio-free.
 */

import { MJGlobal, RegisterClass, SafeJSONParse } from '@memberjunction/global';
import {
  RecordProcessorRegistry,
  type IRecordProcessor,
  type RecordProcessorBuildContext,
} from '@memberjunction/record-set-processor-base';

import {
  MLModelInferenceProcessor,
  ML_INFERENCE_WORK_TYPE,
  ML_INFERENCE_WORK_TYPE_ALIAS,
} from './ml-model-inference-processor';
import type { MLInferenceDeps, MLModelInferenceProcessorOptions } from './types';
import type { DatedSourceSpec } from '../feature-assembly';

// Register the alias key too, so both `'ML Model'` (the human-readable work-type)
// and `'MLModelInference'` (the identifier-style key) resolve to the processor.
// The primary `'ML Model'` registration lives on the class decorator itself.
RegisterClass(MLModelInferenceProcessor, ML_INFERENCE_WORK_TYPE_ALIAS)(MLModelInferenceProcessor);

/**
 * The set of work-type keys the scoring processor is registered under. A
 * `RecordProcessExecutor` extension checks membership to decide whether to
 * delegate a Record Process's `WorkType` to the ML scorer.
 */
export const ML_INFERENCE_WORK_TYPES: readonly string[] = [ML_INFERENCE_WORK_TYPE, ML_INFERENCE_WORK_TYPE_ALIAS];

/**
 * Whether a Record Process `WorkType` value targets the ML scoring processor.
 *
 * @param workType the `MJ: Record Processes.WorkType` value
 */
export function isMLInferenceWorkType(workType: string | null | undefined): boolean {
  return workType != null && ML_INFERENCE_WORK_TYPES.includes(workType);
}

/**
 * Resolve an {@link MLModelInferenceProcessor} for a work-type key via the
 * MJGlobal ClassFactory, constructed with the supplied options. Returns `null`
 * when the key is not an ML-inference work type (so callers can fall through to
 * the substrate's built-in processors).
 *
 * @param workType the Record Process `WorkType` value (`'ML Model'` / `'MLModelInference'`)
 * @param options the model id + injected seams to construct the processor with
 */
export function resolveMLInferenceProcessor(
  workType: string | null | undefined,
  options: MLModelInferenceProcessorOptions,
): IRecordProcessor | null {
  if (!isMLInferenceWorkType(workType)) {
    return null;
  }
  // CreateInstance dynamically returns the highest-priority registration for the
  // base class + key — here the MLModelInferenceProcessor itself. Constructor args
  // are forwarded by the factory. Falls back to a direct construction if the
  // factory has no registration (defensive — the decorator registers it at import).
  const instance = MJGlobal.Instance.ClassFactory.CreateInstance<MLModelInferenceProcessor>(
    MLModelInferenceProcessor,
    workType ?? ML_INFERENCE_WORK_TYPE,
    options,
  );
  return instance ?? new MLModelInferenceProcessor(options);
}

/**
 * The shape a `MJ: Record Processes.Configuration` JSON carries for an `'ML Model'` work type — the
 * per-Record-Process scoring inputs the factory reads to construct the {@link MLModelInferenceProcessor}.
 * The injected runtime seams ({@link MLInferenceDeps}) are supplied at registration time (closed over by
 * the factory), NOT in this config, so the config stays declarative + storable on the Record Process row.
 */
export interface MLScoringConfiguration {
  /** The `MJ: ML Models` id this Record Process scores with. */
  modelId: string;
  /** Primary-key field on the target entity (defaults to `ID`). */
  primaryKeyField?: string;
  /** Optional dated sources supplying point-in-time ("as-of") features. */
  datedSources?: DatedSourceSpec[];
}

/**
 * Register the {@link MLModelInferenceProcessor} into the Record Set Processing
 * {@link RecordProcessorRegistry} for the `'ML Model'` work type (and the `'MLModelInference'` alias),
 * so `RecordProcessExecutor.buildProcessor()` resolves it automatically — WITHOUT the substrate
 * depending on Predictive Studio. The registered factory closes over the injected {@link MLInferenceDeps}
 * (model loader / artifact loader / sidecar) and reads the per-run {@link MLScoringConfiguration}
 * (the `modelId` etc.) off the Record Process's `Configuration`.
 *
 * Idempotent — calling more than once simply re-registers (last-wins). Call from the engine's
 * startup/bootstrap with the production deps.
 *
 * @param deps the injected runtime seams the ML scorer needs (model loader, artifact loader, sidecar)
 */
export function registerMLScoringProcessor(deps: MLInferenceDeps): void {
  const factory = (context: RecordProcessorBuildContext): IRecordProcessor => {
    const config = context.Configuration ? SafeJSONParse<MLScoringConfiguration>(context.Configuration) : undefined;
    if (!config || !config.modelId) {
      throw new Error(
        `Record Process '${context.RecordProcessName ?? context.RecordProcessID ?? ''}': WorkType=${context.WorkType} requires a Configuration with a 'modelId'`,
      );
    }
    const options: MLModelInferenceProcessorOptions = {
      modelId: config.modelId,
      deps,
      primaryKeyField: config.primaryKeyField,
      datedSources: config.datedSources,
    };
    // Resolve through the ClassFactory so a higher-priority subclass registration (if any) wins.
    return resolveMLInferenceProcessor(context.WorkType, options) ?? new MLModelInferenceProcessor(options);
  };

  const registry = RecordProcessorRegistry.Instance;
  for (const workType of ML_INFERENCE_WORK_TYPES) {
    registry.Register(workType, factory);
  }
}

/**
 * Tree-shaking anchor — call from a server bootstrap to guarantee the
 * `@RegisterClass` registration is not eliminated by the bundler. Referencing the
 * class through this function creates a static code path the bundler keeps.
 */
export function LoadMLModelInferenceProcessor(): void {
  // Reference the class so the module (and its decorator side-effect) is retained.
  void MLModelInferenceProcessor;
}

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

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { IRecordProcessor } from '@memberjunction/record-set-processor-base';

import {
  MLModelInferenceProcessor,
  ML_INFERENCE_WORK_TYPE,
  ML_INFERENCE_WORK_TYPE_ALIAS,
} from './ml-model-inference-processor';
import type { MLModelInferenceProcessorOptions } from './types';

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
 * Tree-shaking anchor — call from a server bootstrap to guarantee the
 * `@RegisterClass` registration is not eliminated by the bundler. Referencing the
 * class through this function creates a static code path the bundler keeps.
 */
export function LoadMLModelInferenceProcessor(): void {
  // Reference the class so the module (and its decorator side-effect) is retained.
  void MLModelInferenceProcessor;
}

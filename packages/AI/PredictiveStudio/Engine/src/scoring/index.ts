/**
 * @module scoring
 *
 * Barrel for the Predictive Studio **scoring** layer (plan §10) — the
 * {@link MLModelInferenceProcessor} Record Set Processing work type, its
 * dependency-injection seams (model loader, artifact loader, sidecar predictor)
 * and their production + in-memory implementations, the work-type registration +
 * dynamic resolver, and the `MJ: ML Model Scoring Binding` lineage helper.
 *
 * See `./ml-model-inference-processor` for the per-record scoring flow.
 */

export * from './types';
export * from './artifact-loader';
export * from './seams';
export * from './ml-model-inference-processor';
export * from './register';
export * from './scoring-binding';

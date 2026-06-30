/**
 * @module scoring
 *
 * Barrel for the Predictive Studio **scoring** layer (plan §10) — the
 * {@link MLModelInferenceProcessor} Record Set Processing work type, its
 * dependency-injection seams (model loader, artifact loader, sidecar predictor)
 * and their production + in-memory implementations, the work-type registration +
 * dynamic resolver, the startup sink that registers it at boot, the
 * `MJ: ML Model Scoring Binding` lineage helper, and the scored-query enricher that
 * lets RunQuery append model predictions to result rows (PS2-3). Also the on-demand
 * `createScoringProcess` builder (the "Operate this model" flow) — the sibling of the
 * scheduled helper that assembles an on-demand `WorkType='ML Model'` Record Process the
 * generic run-now / scheduler dialog then targets.
 *
 * See `./ml-model-inference-processor` for the per-record scoring flow.
 */

export * from './types';
export * from './artifact-loader';
export * from './seams';
export * from './ml-model-inference-processor';
export * from './register';
export * from './startup-register';
export * from './scoring-binding';
export * from './ml-model-score-enricher';
export * from './scoring-process';

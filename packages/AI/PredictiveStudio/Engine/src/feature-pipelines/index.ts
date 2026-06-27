/**
 * @module feature-pipelines
 *
 * Feature Pipeline discovery + monitoring (Predictive Studio SP6). A Feature
 * Pipeline is a categorized `MJ: Record Processes` row (the "category route" — no
 * dedicated entity); this folder provides the `FeaturePipelineEngine` BaseEngine
 * cache and its projection types so the Model Development Agent and the Knowledge
 * Hub UI can discover "what feature pipelines exist, what entity each writes to,
 * and when each last ran".
 */

export * from './types';
export * from './feature-pipeline-engine';

/**
 * @module @memberjunction/predictive-studio-core
 *
 * Type contracts for MemberJunction Predictive Studio — the sidecar
 * request/response contract, the declarative pipeline-spec JSON shapes, the
 * visual FeatureStep DAG, and the strongly-typed modeling-plan payload the
 * Model Development Agent builds — plus the browser-safe, dependency-free
 * runtime logic shared by the server engine, the UI and the agent (trust
 * verdicts, at-risk rules, evaluation lineage). The only runtime dependency
 * is `zod`, for the modeling-plan trust-boundary validators.
 *
 * See `plans/predictive-studio.md` for the full design.
 */

export * from './sidecar-contract';
export * from './pipeline-spec';
export * from './leakage-guard-validation';
export * from './feature-steps';
export * from './modeling-plan-spec';
export * from './modeling-plan-schema';
export * from './metrics-util';
export * from './trust';
export * from './outcome-config';
export * from './json-value';
export * from './task-type';
export * from './at-risk-rules';
export * from './importance-display';
export * from './evaluation-record';
export * from './refusal-codes';
export * from './experiment-sessions';
export * from './prediction-unit';
export * from './assembly-contract';
export * from './evaluation-protocol';
export * from './training-run-results';
export * from './snapshot-format';
export * from './store-schemas';
export * from './incumbent-heuristic';

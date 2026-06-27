/**
 * @module @memberjunction/predictive-studio-core
 *
 * Pure TypeScript type contracts for MemberJunction Predictive Studio — the
 * sidecar request/response contract, the declarative pipeline-spec JSON shapes,
 * the visual FeatureStep DAG, and the strongly-typed modeling-plan payload the
 * Model Development Agent builds. No runtime dependencies; types only.
 *
 * See `plans/predictive-studio.md` for the full design.
 */

export * from './sidecar-contract';
export * from './pipeline-spec';
export * from './feature-steps';
export * from './modeling-plan-spec';

/**
 * @module agent
 *
 * The Predictive Studio Agent's control path and its deterministic builder layer:
 * - {@link ModelingPlanToPipelineConfig} — pure ModelingPlanSpec → pipeline-config mapper
 * - {@link PredictiveStudioPipelineBuilder} — commits it to metadata, trains, publishes gated on trust
 * - {@link PredictiveStudioPipelineBuilderAgent} — the code sub-agent wrapping the builder; it builds only on an approval
 * - {@link AgentControlPath} — the orchestrator's state machine (pure)
 * - {@link BuildApprovalResolver} / {@link BuildApprovalClaims} — the approval rule (D-090) and its atomic claim (D5-23)
 * - {@link AgentSessionLease} — session liveness and the turn lock (D5-38)
 * - {@link PredictiveStudioModelDevAgent} — the orchestrator: code decides every transition with an effect
 * - {@link AgentReadScope} — the development rows of a draft unit, the only rows an agent-callable path reads (G4.2)
 * - {@link PlanMetadataValidator} — every name a presented plan uses, resolved against metadata
 * - {@link CatalogRenderer} — the compact entity catalog the planning sub-agents read (DD-2)
 * - {@link AgentDecisionLog} / {@link AgentSessionReplay} — the session's append-only decision log and its replay (A4)
 * - {@link ProfileVerdict} — the profile's fixed refusals: small data, no usable signal (A4)
 */
export * from './modeling-plan-to-pipeline';
export * from './pipeline-builder';
export * from './pipeline-builder-agent';
export * from './control-path';
export * from './build-approval-claim-write-authorisations';
export * from './build-approval-claims';
export * from './build-approval-resolver';
export * from './agent-session-lease';
export * from './model-dev-orchestrator-agent';
export * from './agent-read-scope';
export * from './plan-metadata-validator';
export * from './catalog-renderer';
export * from './decision-log-write-authorisations';
export * from './decision-log';
export * from './session-replay';
export * from './profile-verdict';
export * from './agent-note-policy';
export * from './run-cost';

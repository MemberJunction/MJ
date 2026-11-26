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

/**
 * @fileoverview Public API for `@memberjunction/feature-pipelines-engine` — server-side execution
 * (`InferProcessor`, pipeline drivers, escalation, human-value guard), golden-set test driver,
 * version steward, and startup registration for Knowledge Hub Feature Pipelines.
 * @module @memberjunction/feature-pipelines-engine
 */

import { RegisterInferRecordProcessor } from './startup/FeaturePipelineStartup';

export * from './processors/InferProcessor';
export * from './processors/FeaturePipelineEscalation';
export * from './processors/FeaturePipelineHumanValueGuard';
export * from './processors/FeaturePipelineErrors';
export * from './drivers/BaseFeaturePipelineDriver';
export * from './drivers/LLMFeaturePipelineDriver';
export * from './drivers/DecisionFeaturePipelineDriver';
export * from './testing/FeaturePipelineGoldenSetDriver';
export * from './testing/golden-set-scoring';
export * from './testing/golden-label-quality';
export * from './steward/FeaturePipelineVersionSteward';
export * from './actions/StewardFeaturePipelineVersionAction';
export * from './startup/FeaturePipelineStartup';

// Register `'Infer'` on module import so callers and tests that import `@memberjunction/feature-pipelines-engine`
// without running `StartupManager` still have `'Infer'` registered in `RecordProcessorRegistry`.
RegisterInferRecordProcessor();

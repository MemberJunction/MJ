export { DuplicateRecordDetector } from './duplicateRecordDetector';
export {
    DUPLICATE_ENTRY_CHECK_SERVER_BUDGET_MS,
    DUPLICATE_ENTRY_CHECK_MAX_FIELD_TEXT_LENGTH,
    DUPLICATE_ENTRY_CHECK_MAX_DECISION_FIELDS,
} from './duplicateEntryCheckTypes';
export type {
    DuplicateEntryCheckStatus,
    DuplicateEntryCandidate,
    DuplicateEntryCheckOptions,
    DuplicateEntryCheckResult,
} from './duplicateEntryCheckTypes';

// Reasoning seam (pluggable LLM reasoning for duplicate detection)
export * from './reasoning/DuplicateReasoningTypes';
export {
    DuplicateReasoningProvider,
    PROMPT_REASONING_PROVIDER_KEY,
    AGENT_REASONING_PROVIDER_KEY,
    DECISION_REASONING_PROVIDER_KEY,
    DECISION_THEN_PROMPT_REASONING_PROVIDER_KEY,
} from './reasoning/DuplicateReasoningProvider';
export { PromptReasoningProvider } from './reasoning/PromptReasoningProvider';
export {
    DecisionReasoningProvider,
    DUPLICATE_DECISION_CALIBRATION,
    DuplicateDecisionCalibrationFor,
    CalibratedDuplicateProbability,
    UNNAMED_DECISION_MODEL,
} from './reasoning/DecisionReasoningProvider';
export type { DuplicateCandidateProbability, DuplicateDecisionResult } from './reasoning/DecisionReasoningProvider';
export { DecisionThenPromptReasoningProvider } from './reasoning/DecisionThenPromptReasoningProvider';
export { MatchedSetDeltaBuilder } from './reasoning/MatchedSetDeltaBuilder';

// Re-export from @memberjunction/core for backward compatibility
// ComputeRRF and ScoredCandidate have moved to @memberjunction/core
export { ComputeRRF, ScoredCandidate } from '@memberjunction/core';

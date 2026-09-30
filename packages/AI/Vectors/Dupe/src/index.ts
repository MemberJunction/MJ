export { DuplicateRecordDetector } from './duplicateRecordDetector';

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
export { DecisionReasoningProvider } from './reasoning/DecisionReasoningProvider';
export type { DuplicateCandidateProbability, DuplicateDecisionResult } from './reasoning/DecisionReasoningProvider';
export { DecisionThenPromptReasoningProvider } from './reasoning/DecisionThenPromptReasoningProvider';
export { MatchedSetDeltaBuilder } from './reasoning/MatchedSetDeltaBuilder';

// Re-export from @memberjunction/core for backward compatibility
// ComputeRRF and ScoredCandidate have moved to @memberjunction/core
export { ComputeRRF, ScoredCandidate } from '@memberjunction/core';

export { DuplicateRecordDetector } from './duplicateRecordDetector';

// Reasoning seam (pluggable LLM reasoning for duplicate detection)
export * from './reasoning/DuplicateReasoningTypes';
export {
    DuplicateReasoningProvider,
    PROMPT_REASONING_PROVIDER_KEY,
    AGENT_REASONING_PROVIDER_KEY,
} from './reasoning/DuplicateReasoningProvider';
export { PromptReasoningProvider } from './reasoning/PromptReasoningProvider';
export { MatchedSetDeltaBuilder } from './reasoning/MatchedSetDeltaBuilder';

// Re-export from @memberjunction/core for backward compatibility
// ComputeRRF and ScoredCandidate have moved to @memberjunction/core
export { ComputeRRF, ScoredCandidate } from '@memberjunction/core';

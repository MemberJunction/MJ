export { ResetMJSingletons, resetMJSingletons, ResetClassFactory, resetClassFactory, ResetObjectCache, resetObjectCache } from './singleton-reset';
export { CreateMockEntity, createMockEntity, type MockEntityOptions } from './mock-entity';
export { MockRunView, mockRunView, MockRunViews, mockRunViews, ResetRunViewMocks, resetRunViewMocks } from './mock-run-view';
export { InstallCustomMatchers, installCustomMatchers } from './custom-matchers';
export type {} from './vitest.d';

// ---- Shared AI test harness (real @memberjunction/ai contracts, no structural fakes) ----
export { TestLLM, RegisterTestLLM, registerTestLLM, type TestLLMOutcome } from './ai/test-llm';
export {
  MakeModelUsage, makeModelUsage,
  MakeSuccessChatResult, makeSuccessChatResult,
  MakeFailedChatResult, makeFailedChatResult,
  MakeDriverFailureChatResult, makeDriverFailureChatResult,
  MakeErrorInfo, makeErrorInfo,
  MakeChatParams, makeChatParams,
  type ModelUsageOverrides,
  type SuccessChatResultOptions,
  type FailedChatResultOptions,
} from './ai/chat-result-factories';
export {
  VENDOR_TYPE,
  VENDOR,
  MODEL_TYPE,
  CONFIG,
  MODEL,
  MakeModelVendor, makeModelVendor,
  MakeModel, makeModel,
  MakePromptModel, makePromptModel,
  BuildRealisticCatalog, buildRealisticCatalog,
  DEFAULT_CONFIGURED_DRIVERS,
  type FxVendorType,
  type FxVendor,
  type FxModelType,
  type FxConfiguration,
  type FxModelVendor,
  type FxModel,
  type FxPromptModel,
  type AICatalog,
} from './ai/catalog-fixtures';

// ---- Shared BaseLLM streaming/ChatResult conformance suite (applied by provider packages) ----
export {
  RunLLMConformanceSuite,
  type ExpectedUsageCounts,
  type FailureSite,
  type LLMConformanceDeviationKind,
  type LLMConformanceDeviation,
  type LLMConformanceSuiteConfig,
} from './ai/llm-conformance';

// ---- Shared native-tool-calling conformance suite (applied by provider packages) ----
export {
  RunLLMToolCallingConformanceSuite,
  type ScriptedToolCall,
  type LLMToolConformanceSuiteConfig,
} from './ai/llm-tool-conformance';
export {
  CreateOpenAICompatibleSeamMock,
  type OpenAICompatibleSeam,
  type OpenAICompatibleChatClient,
  type OpenAICompatibleUsagePayload,
  type OpenAICompatibleResponsePayload,
  type OpenAICompatibleChunkPayload,
  type OpenAICompatibleRequestBody,
  type OpenAICompatibleRequestOptions,
} from './ai/openai-compatible-seam';

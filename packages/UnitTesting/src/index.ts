export { resetMJSingletons, resetClassFactory, resetObjectCache } from './singleton-reset';
export { createMockEntity, type MockEntityOptions } from './mock-entity';
export { mockRunView, mockRunViews, resetRunViewMocks } from './mock-run-view';
export { installCustomMatchers } from './custom-matchers';
export type {} from './vitest.d';

// ---- Shared AI test harness (real @memberjunction/ai contracts, no structural fakes) ----
export { TestLLM, registerTestLLM, type TestLLMOutcome } from './ai/test-llm';
export {
  makeModelUsage,
  makeSuccessChatResult,
  makeFailedChatResult,
  makeDriverFailureChatResult,
  makeErrorInfo,
  makeChatParams,
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
  makeModelVendor,
  makeModel,
  makePromptModel,
  buildRealisticCatalog,
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

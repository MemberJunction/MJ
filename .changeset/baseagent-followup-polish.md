---
"@memberjunction/ai": minor
"@memberjunction/ai-openai": patch
"@memberjunction/ai-anthropic": patch
"@memberjunction/ai-groq": patch
"@memberjunction/ai-cerebras": patch
"@memberjunction/ai-fireworks": minor
"@memberjunction/ai-mistral": patch
"@memberjunction/ai-ollama": patch
"@memberjunction/server": patch
"@memberjunction/sql-converter": minor
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": patch
"@memberjunction/ai-agents": minor
---

Post-#6992 follow-ups & OO AI Transport/BaseModel/BaseLLM architecture:
- Introduce `AITransportManager extends BaseSingleton<AITransportManager>` (`@memberjunction/ai`) managing AI-scoped long-running `undici` HTTP transport (`Configure`, `IsConfigured`, `ResolveFetch` with per-model overrides, late-bound `CreateBoundFetch`, `PrimeNodeBuiltinUndici`, `Reset`), keeping thin `@deprecated` delegates in `httpDispatcher.ts` for backwards compatibility and migrating `MJServer` startup onto `AITransportManager.Instance`.
- Enrich `BaseModel` across all 11 AI modalities with promoted `AdditionalSettings` / `SetAdditionalSettings` / `ClearAdditionalSettings` / `OnAdditionalSettingsChanged`, first-class transport access (`CustomFetch`, late-bound `BoundFetch`, `BuildTransportClientOptions`, `ResolveTransportOverrides`), and lazy/invalidatable SDK client caching (`GetOrCreateClient`, `InvalidateClient`).
- Enrich `BaseLLM` with reusable `ThinkingStreamExtractor` (`CreateThinkingStreamExtractor`), `BuildNormalizedModelUsage`, `BuildErrorChatResult`, and protected OpenAI-compatible tool helpers (`FormatOpenAICompatibleTools` / `ToolChoice` / `ToolCalls` / `ToolResults` / `ParseOpenAICompatibleToolCalls`).
- Refactor `OpenAILLM`, `AnthropicLLM`, `GroqLLM`, `CerebrasLLM`, `MistralLLM`, `OllamaLLM` / `OllamaEmbedding`, and `FireworksLLM` (now cleanly extending `OpenAILLM` directly) onto `BaseModel` / `BaseLLM` OO primitives with zero direct `GetLongRunningAIFetch()` calls (`R2-9`).
- Align `Developer` and `Integration` `MJ: Entity Permissions` grants (read-only) and `Agent Administrator` full CRUD across `MJ: AI Agent Categories`, `MJ: AI Agent Types`, and `MJ: AI Agent Step Types` with server-side admin-only gates (`R6-4` / `C1`), and add `AI: Agent Administration` `MJ: Authorizations` support to `IsAgentAdminOrOwnerUser`.
- Add deterministic T-SQL `JSON_MODIFY` / `JSON_QUERY` (including nested calls and `ISJSON`) to PostgreSQL `jsonb_set` transpilation in `@memberjunction/sql-converter` covering `V202611271804`.
- Wire all remaining `IAgentConfiguration` cascade properties (`payload.*`, `InlineStorageThresholdBytes`, `MinExecutionsPerRun`, `DefaultArtifactTypeID`, `ArtifactCreationMode`, `ChatHandlingOption`, memory retention/archive keys, and `InjectNotes`/`InjectExamples`) through `EffectiveAgentProperties` / `ResolveEffectiveAgentProperties` (`R2-10`).
- Validate `customStepData` against `AIAgentStepType.ConfigSchema` before executing custom step handlers in `BaseAgentStepHandler`, `AgentStepValidationHelper`, and `AgentStepExecutionHelper` (`R2-12`).

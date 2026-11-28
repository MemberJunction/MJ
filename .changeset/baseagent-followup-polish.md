---
"@memberjunction/sql-converter": minor
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": patch
"@memberjunction/ai-agents": minor
"@memberjunction/ai-groq": patch
"@memberjunction/ai-cerebras": patch
"@memberjunction/ai-fireworks": patch
"@memberjunction/ai-mistral": patch
"@memberjunction/ai-ollama": patch
---

Post-#6992 follow-ups:
- Align `Developer` and `Integration` `MJ: Entity Permissions` grants (read-only) and `Agent Administrator` full CRUD across `MJ: AI Agent Categories`, `MJ: AI Agent Types`, and `MJ: AI Agent Step Types` with server-side admin-only gates (`R6-4` / `C1`), and add `AI: Agent Administration` `MJ: Authorizations` support to `IsAgentAdminOrOwnerUser`.
- Add deterministic T-SQL `JSON_MODIFY` / `JSON_QUERY` (including nested calls and `ISJSON`) to PostgreSQL `jsonb_set` transpilation in `@memberjunction/sql-converter` covering `V202611271804`.
- Wire `GetLongRunningAIFetch()` across `GroqLLM`, `CerebrasLLM`, `FireworksLLM`, `MistralLLM`, and `OllamaLLM` (`R2-9`).
- Wire all remaining `IAgentConfiguration` cascade properties (`payload.*`, `InlineStorageThresholdBytes`, `MinExecutionsPerRun`, `DefaultArtifactTypeID`, `ArtifactCreationMode`, `ChatHandlingOption`, memory retention/archive keys, and `InjectNotes`/`InjectExamples`) through `EffectiveAgentProperties` / `ResolveEffectiveAgentProperties` (`R2-10`).
- Validate `customStepData` against `AIAgentStepType.ConfigSchema` before executing custom step handlers in `BaseAgentStepHandler`, `AgentStepValidationHelper`, and `AgentStepExecutionHelper` (`R2-12`).

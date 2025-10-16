# @memberjunction/ai-provider-bundle

## 2.107.0

### Patch Changes

- @memberjunction/ai-anthropic@2.107.0
- @memberjunction/ai-cerebras@2.107.0
- @memberjunction/ai-groq@2.107.0
- @memberjunction/ai-lmstudio@2.107.0
- @memberjunction/ai-local-embeddings@2.107.0
- @memberjunction/ai-mistral@2.107.0
- @memberjunction/ai-ollama@2.107.0
- @memberjunction/ai-openai@2.107.0
- @memberjunction/ai-openrouter@2.107.0
- @memberjunction/ai-xai@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai-anthropic@2.106.0
- @memberjunction/ai-cerebras@2.106.0
- @memberjunction/ai-groq@2.106.0
- @memberjunction/ai-lmstudio@2.106.0
- @memberjunction/ai-local-embeddings@2.106.0
- @memberjunction/ai-mistral@2.106.0
- @memberjunction/ai-ollama@2.106.0
- @memberjunction/ai-openai@2.106.0
- @memberjunction/ai-openrouter@2.106.0
- @memberjunction/ai-xai@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

  - @memberjunction/ai-anthropic@2.105.0
  - @memberjunction/ai-cerebras@2.105.0
  - @memberjunction/ai-groq@2.105.0
  - @memberjunction/ai-lmstudio@2.105.0
  - @memberjunction/ai-local-embeddings@2.105.0
  - @memberjunction/ai-mistral@2.105.0
  - @memberjunction/ai-ollama@2.105.0
  - @memberjunction/ai-openai@2.105.0
  - @memberjunction/ai-openrouter@2.105.0
  - @memberjunction/ai-xai@2.105.0

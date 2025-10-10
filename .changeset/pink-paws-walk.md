---
"@memberjunction/ai": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vectors-pinecone": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-user-view-grid": patch
"@memberjunction/ng-entity-communications": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/communication-types": patch
"@memberjunction/entity-communications-client": patch
"@memberjunction/entity-communications-server": patch
"@memberjunction/communication-ms-graph": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/cli": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/queue": patch
"@memberjunction/server": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/templates-base-types": patch
"@memberjunction/templates": patch
---

This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and centralized all AI provider loading in `AIEngine.LoadAIEngine()` to ensure proper class registration. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible.

Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

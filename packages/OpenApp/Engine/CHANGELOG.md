# @memberjunction/open-app-engine

## 5.4.0

### Patch Changes

- 8a11457: Add centralized fire-and-forget pattern for all long-running GraphQL mutations (RunTest, RunTestSuite, RunAIAgent, RunAIAgentFromConversationDetail) to avoid Azure's ~230s HTTP proxy timeout. Use fire-and-forget mutation to avoid Azure proxy timeouts on agent execution, allow \_\_ prefixed schema names in Open App manifest validation, add inlineSources to Angular tsconfig for vendor sourcemap support, and add .env.\* to gitignore
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/core@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/core@5.3.0
- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Minor Changes

- 61079e9: Add Open App system for installing, managing, and removing third-party apps via `mj app` CLI commands. Includes manifest validation, dependency resolution, schema isolation, migration execution, npm package management, and config-manager integration.

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/core@5.1.0

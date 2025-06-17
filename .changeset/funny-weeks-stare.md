---
"@memberjunction/ai-agents": patch
"@memberjunction/ai": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/core-entities-server": patch
---

  **Breaking circular dependency between AI packages**

  Resolves a circular dependency that was preventing `@memberjunction/core-entities-server` and other packages from
  building during `npm install`.

  **Root Cause:**
  - `@memberjunction/aiengine` imported `AIPromptRunResult` from `@memberjunction/ai-prompts`
  - `@memberjunction/ai-prompts` depended on `@memberjunction/aiengine` in package.json
  - This circular dependency blocked the build chain

  **Solution:**
  - Moved `AIPromptRunResult` and related types to `@memberjunction/ai` as shared types
  - Updated all packages to import from the shared location instead of creating circular references
  - Added comprehensive build failure debugging guide to development documentation

  **Packages Fixed:**
  - `@memberjunction/core-entities-server` now builds successfully
  - All AI packages (`aiengine`, `ai-prompts`, `ai-agents`) build without circular dependency issues
  - Build order now resolves properly in the monorepo
---
"@memberjunction/core": minor
"@memberjunction/react-runtime": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-react": patch
---

- Fix BaseEngine cache callback fingerprint mismatch that broke cross-server invalidation via Redis pub/sub by extracting a shared BuildRunViewParamsForConfig method to ensure consistent RunViewParams across LoadSingleEntityConfig, LoadMultipleEntityConfigs, and RegisterCacheChangeCallbacks
- Eliminate React CDN script execution order race condition in library-loader by enforcing sequential script loading
- Make ChangeDetectorRef optional in BaseResourceComponent to prevent NG0201 injection errors
- Regenerate spDeleteAIPrompt and spDeleteAIConfiguration stored procedures to remove stale AIPromptRun.AgentRunID cascade references

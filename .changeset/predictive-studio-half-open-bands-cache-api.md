---
"@memberjunction/core": minor
"@memberjunction/predictive-studio-core": minor
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

Consolidate metadata cache API methods and update PredictiveStudio outcome config score band semantics per review.

- **Metadata Cache API**:
  - Make `HasCachedRecordName` and `GetCachedRecordNameOnlyIfCached` required methods on `IMetadataProvider`.
  - Remove deprecated `GetCachedRecordNameSync` across core and UI consumers (`navigation.service.ts`, `record-origin-crumb.component.ts`, `app-routing.module.ts`).
- **Predictive Studio Outcome Config**:
  - Score band assignment now uses clean half-open intervals `[Min, Max)` with the highest band inclusive `[Min, Max]`, eliminating floating-point sentinel tolerances.
  - Non-finite and out-of-range normalized model scores (`< 0` or `> 1`) return `null` rather than silently clamping.
  - Non-standard/neutral target variables default to neutral gray band styling without asserting polarity.
  - Warn on JSON parse failures in `resolveOutcomeConfig`.
- **Lockfile & Dev Scripts**:
  - Restored `@memberjunction/tag-engine-base` lockfile sync.
  - Restored MJExplorer dev port 4201.

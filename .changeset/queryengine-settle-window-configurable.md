---
"@memberjunction/core-entities": patch
---

Make `QueryEngine`'s result-deletion settle window settable via the new static `QueryEngine.DefaultDefinitionEditSettleMs` (default 3000ms, unchanged), read by the existing `DefinitionEditSettleMs` getter. Mirrors `ProviderBase.MetadataDatasetRefreshDebounceMs`. Shipped behaviour is identical; the knob lets a test harness collapse the window instead of sleeping past it on every check that creates or edits a query.

---
"@memberjunction/ng-base-forms": patch
---

`ResolveLinkMetadataProvider` falls back to the global metadata provider with a single `??` chain. The behavior is unchanged, and the repo-wide multi-provider compliance scan passes again.

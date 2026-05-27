---
"@memberjunction/core": patch
"@memberjunction/aiengine": patch
---

- `@memberjunction/core`: Add `deferredDelay` configuration parameter to `@RegisterForStartup` options, allowing background engine loading to be delayed by a specified duration in milliseconds.
- `@memberjunction/aiengine`: Implement `IStartupSink` and annotate the server-side `AIEngine` with `@RegisterForStartup` as a deferred engine with a 15-second delay to automatically load metadata and pre-warm embedding models/vector caches in the background.

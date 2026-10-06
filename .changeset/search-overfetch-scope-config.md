---
"@memberjunction/search-engine": patch
---

A search scope can now declare its own permission over-fetch multiplier in `ScopeConfig.permissionOverfetchFactor` (the guide already listed the key; nothing read it). The engine resolves the factor as the caller's `SearchParams.PermissionOverfetchFactor`, else the largest factor any resolved scope declares, else the engine default (2), and holds it to 1–20 whatever the source. A scope whose lanes are trimmed heavily by late permission checks can ask providers for more candidates without every caller having to know to pass the parameter. Also fixed: a non-finite caller value or engine default (`NaN`, `Infinity`) used to flow through `??` into the provider `topK`; it is now treated as absent. Scopes that declare nothing, and callers passing finite values, behave as before.

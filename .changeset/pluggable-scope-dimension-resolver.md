---
"@memberjunction/search-engine": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Make `ScopeDimensionResolver` pluggable via `ClassFactory` (`ScopeDimensionResolverBase`, `SCOPE_DIMENSION_RESOLVER_KEY`, `GetScopeDimensionResolver`) and route `SearchEngine.dimensionResolver` through it, matching `SearchScopePermissionResolver`.

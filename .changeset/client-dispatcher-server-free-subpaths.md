---
"@memberjunction/testing-integration": patch
"@memberjunction/server": patch
---

Add server-free `./registry` and `./checks/*` subpath exports so client-first integration dispatchers stop loading server packages through the root barrel.

The barrel re-exports `./bootstrap` (server) plus every check module, so a client dispatcher reaching for `TestRunner`/`IntegrationCheckRegistry` transitively loaded `@memberjunction/core-entities-server` — and the ClassFactory then resolved entities to their SERVER subclasses (`MJTagScopeEntityServer`) instead of the client classes a browser loads. That silently defeated the point of client-first testing.

`./registry` exports only verified server-free primitives (runner, registry, check types, tiers, config — `check.ts`'s every import is `import type` and therefore erased). Client dispatchers pair it with `./client` plus a direct side-effect import of their own bundle via `./checks/*`, so only the intended checks register.

Verified: `MJ: Tag Scopes` now resolves to `MJTagScopeEntity` (was `MJTagScopeEntityServer`), and the registry contains only the dispatcher's own bundle.

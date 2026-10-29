---
"@memberjunction/server": patch
---

Add `RequestOrigin` to `AppContext`: the request's normalized `Origin` header, so resolvers can enforce an origin allowlist. The origin normalizer the realtime widget allowlist uses moves to a shared `NormalizeOrigin` helper that both use.

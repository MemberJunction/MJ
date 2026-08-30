# @memberjunction/network-utils

## 6.1.0-edge.4

### Patch Changes

- 7857d8e: Add `@memberjunction/network-utils` and remove `axios` from the repository.

  The SSRF guard added for the web/HTTP actions was Actions-specific but the concern is not, so it
  moves into a new dependency-free, Node-only package (`node:dns` + `node:net` only) that any
  server-side package can depend on: `AssertPublicUrl`, `SafeFetch`, `IsBlockedIPAddress`, `SSRFError`.

  The same package ships `HttpClient` / `HttpRequest` — a native-`fetch` HTTP client that replaces
  `axios` across all 11 packages that used it. Consolidating on one client removes the third-party
  dependency and puts the SSRF guard one option flag (`ValidateUrl`) away from every outbound call
  site, which was impossible when each package reached for `axios` directly.

  Also fixes an SSRF sink the original pass missed: the `API Rate Limiter` action takes a
  caller-controlled URL and returns the response body, and is now guarded.

  Public exports use `PascalCase`, per repo convention.

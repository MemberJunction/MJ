---
"@memberjunction/ai-mcp-server": patch
---

Harden `/oauth/authorize` error handling in the MCP OAuth proxy, per RFC 6749 §4.1.2.1 and the OAuth 2.0 Security BCP.

An error may only be reported by redirecting to a request's `redirect_uri` once that URI has been matched against a registered client. Several checks in the authorize handler ran before that match was possible and still reported themselves as an error redirect to the request-supplied URI.

The handler now identifies the client and validates the redirect URI first, and answers every failure in that stage with a locally rendered error page. Only after the match succeeds does a redirectable binding come into scope, so no earlier branch can redirect to a caller-supplied URI however it fails. `sendAuthorizationError()` now requires a redirect URI rather than accepting `undefined`, which makes an unvalidated call a compile error rather than a silent fallback.

Behavior after validation is unchanged and pinned by tests: an unsupported `response_type`, a missing PKCE challenge, or a non-S256 challenge method still redirect to the registered URI carrying `error`, `error_description` and `state`, and a valid request still redirects to the upstream provider.

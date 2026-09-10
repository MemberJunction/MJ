---
"@memberjunction/server": patch
"@memberjunction/ai-mcp-server": patch
---

Security hardening from the first full CodeQL scan of the security-critical packages. None of these changes alter behavior for well-formed requests.

**`@memberjunction/server`**

- The Teams meetings Graph webhook rejects a `validationToken` that is not bounded-length printable ASCII with 400 before echoing anything, and sets `X-Content-Type-Options: nosniff` on the echo. Graph's real token is a short ASCII sentence plus a request id and is unaffected.

**`@memberjunction/ai-mcp-server`**

- **Open redirect closed** in the OAuth proxy's `/oauth/authorize`. Errors raised before the client was known and the `redirect_uri` registered for it (missing or unknown `client_id`, unregistered `redirect_uri`, unsupported `response_type`) were redirected to the caller-supplied `redirect_uri`, so any URL could be used as a bounce. Those errors now render the proxy's error page; errors after validation still redirect per RFC 6749.
- **Rate limiting** on every OAuth proxy route (authorize, callback, token, registration, login, consent, metadata), per client IP, 60 requests per minute by default and configurable through `OAuthProxyConfig.rateLimit`. Same `express-rate-limit` pattern as the server's magic-link and provider-catalog routers.
- Log lines that include caller-supplied values (`client_id`, upstream `error` / `error_description`) quote them so a newline in a parameter cannot forge a log entry.
- The OAuth proxy reads query-string parameters, and the form fields of the token and consent endpoints, through a helper that keeps only plain strings. A repeated parameter (`?code=a&code=b`, `code_verifier[]=…`), which Express parses to an array, is now treated as missing and takes each handler's existing error path instead of reaching string operations or the PKCE hash as an array (which previously produced a 500).
- The upstream token-exchange error log no longer prints the last eight characters of the authorization code or the first eight of the PKCE verifier. The remaining lines (status, endpoint, redirect URI, client id, verifier presence, provider error) are what diagnosing a failed exchange needs.

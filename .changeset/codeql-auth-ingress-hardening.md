---
"@memberjunction/server": patch
"@memberjunction/ai-mcp-server": patch
---

Security hardening from the first full CodeQL scan of the security-critical packages. None of these changes alter behavior for well-formed requests.

**`@memberjunction/server`**

- The Teams meetings Graph webhook rejects a `validationToken` that is not bounded-length printable ASCII with 400 before echoing anything, and sets `X-Content-Type-Options: nosniff` on the echo. Graph's real token is a short ASCII sentence plus a request id and is unaffected.

**`@memberjunction/ai-mcp-server`**

- The OAuth proxy reads query-string parameters, and the form fields of the token and consent endpoints, through a helper that keeps only plain strings. A repeated parameter (`?code=a&code=b`, `code_verifier[]=…`), which Express parses to an array, is now treated as missing and takes each handler's existing error path instead of reaching string operations or the PKCE hash as an array (which previously produced a 500).
- The upstream token-exchange error log no longer prints the last eight characters of the authorization code or the first eight of the PKCE verifier. The remaining lines (status, endpoint, redirect URI, client id, verifier presence, provider error) are what diagnosing a failed exchange needs.

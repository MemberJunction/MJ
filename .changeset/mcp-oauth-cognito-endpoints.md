---
"@memberjunction/ai-mcp-server": patch
"@memberjunction/auth-providers": patch
---

Fix the MCP OAuth proxy against Amazon Cognito: use the hosted-UI domain for the upstream endpoints.

The proxy derived its upstream `/authorize` and `/token` URLs with an Azure AD branch and an Auth0-shaped fallback, so a Cognito provider got `https://cognito-idp.<region>.amazonaws.com/<poolId>/authorize` — the user-pool API host, which answers HTTP 400. Cognito serves OAuth only on the hosted-UI domain (`https://<domain>.auth.<region>.amazoncognito.com/oauth2/authorize` and `/oauth2/token`); the issuer stays on `cognito-idp` and is still what validates tokens. The same fallback also appended `offline_access`, which Cognito rejects as `invalid_scope`.

Endpoint derivation now lives in `resolveUpstreamOAuthEndpoints()` (`@memberjunction/ai-mcp-server/auth/UpstreamEndpoints`) with an explicit Cognito branch. Azure AD and generic-OIDC (Auth0/Okta) URLs are unchanged and pinned by tests. The hosted-UI domain comes from the provider's existing optional `domain` field, which `CognitoProvider.ConfigFromEnvironment` now populates from `COGNITO_DOMAIN` — the same variable and host-only form MJExplorer already reads. `BaseAuthProvider` exposes `domain` alongside `clientId` for the proxy to read. A Cognito upstream configured without a domain now throws a message naming what to set, instead of silently building a URL that 400s.

The provider is also classified from the issuer's **hostname** rather than by substring-matching the whole issuer URL, which is how the Azure AD check worked before. An issuer is caller-supplied configuration, and the flavor decides which host a user's browser is sent to for login, so `https://evil.example/?microsoftonline.com` must not classify as Azure AD. Matching is exact-or-subdomain, so `notmicrosoftonline.com` does not match either. Legitimate issuers — including provider subdomains such as `login.partner.microsoftonline.com` — classify exactly as before.

Token validation is untouched: `domain` is optional and unused outside the OAuth proxy, so an existing Cognito deployment that never sets `COGNITO_DOMAIN` behaves exactly as before.

---
"@memberjunction/core": patch
"@memberjunction/auth-providers": patch
"@memberjunction/server": patch
"@memberjunction/ai-mcp-server": patch
---

Logins check the identity provider's `email_verified` claim before a user is looked up or created.

- A token whose `email_verified` claim is `false` (or the string `"false"`) is refused with an authentication error. A token without the claim is accepted as before.
- New per-provider option `requireEmailVerified` (default `false`) under `authProviders` in `mj.config.cjs`, or in `AdditionalConfiguration` for a provider defined in metadata: when `true`, a token without the claim is refused too. Leave it off for providers that never send the claim (Entra ID / MSAL, some Okta and Cognito token types).
- `@memberjunction/auth-providers` exports `CheckEmailVerified`, `ReadEmailVerifiedClaim` and `AuthProviderFactory.RequiresEmailVerified(issuer)`. MJServer applies the check to every bearer token; the MCP server applies it to upstream identity-provider tokens in the bearer-token validator and the OAuth proxy.

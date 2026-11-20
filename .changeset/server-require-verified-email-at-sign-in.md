---
"@memberjunction/server": patch
"@memberjunction/ai-mcp-server": patch
---

Sign-in refuses an identity provider token whose `email_verified` claim is false, before the user lookup and before automatic user creation. Each auth provider accepts a new `requireVerifiedEmail` option (default off). When it is on, sign-in needs `email_verified` to be true and uses only the token's `email` claim to find the user. A value for the option that is not a boolean turns the strict rule on and logs an error.

The MCP server applies the same rules to bearer tokens and to the upstream token of its OAuth proxy, using the email screen that `@memberjunction/server` now exports.

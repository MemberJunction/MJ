---
"@memberjunction/server": patch
---

Sign-in refuses an identity provider token whose `email_verified` claim is false, before the user lookup and before automatic user creation. Each auth provider accepts a new `requireVerifiedEmail` option (default off). When it is on, sign-in needs `email_verified` to be true and uses only the token's `email` claim to find the user.

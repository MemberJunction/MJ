---
"@memberjunction/server": minor
"@memberjunction/auth-providers": minor
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/core-entities": minor
---

Logins are bound to the identity provider's account, not matched by email alone. A new table, `MJ: User External Identities`, links a User to a provider account by the token's issuer and subject (for Microsoft Entra, tenant ID and object ID). A login resolves to its bound User first. A login with no binding is matched by email once and bound on that match, so existing users are bound on their next sign-in. A bound user stays on their record when their email changes, and the server logs the mismatch. A `USER_EMAIL_MAP` remap still wins and is never bound. An email match is refused when that user is already bound to a different account at the same issuer, and when several User records share the email. Auth providers gain `ExtractSubject`; magic-link and local-dev tokens give no subject.

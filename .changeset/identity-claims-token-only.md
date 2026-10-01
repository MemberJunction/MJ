---
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
---

Identity Claims can be issued without a recipient email, and with an exact expiry.

- **Token-only claims.** `CreateClaim` no longer requires `NormalizedEmail` when the claim type's `Configuration` sets `RequireToken: true`. The claim is stored with an empty `NormalizedEmail`, which no account's normalized email can equal, so email-match redemption and auto-claim on login never reach it, and `GetPendingClaimsForEmail` already returns nothing for an empty address. No email is sent for such a claim. Every other claim type still requires an email, with an error that now names the type.
- **`ExpiresAt`.** `CreateClaimParams` accepts an exact `ExpiresAt` instant, which takes precedence over `ExpiresInDays`, for claims that must live minutes rather than days. An `ExpiresAt` that is invalid or not in the future is refused before anything is saved.

Use case: handing an anonymous visitor's conversation to whoever signs in holding a short-lived link, where the server knows no email and the link must expire in minutes.

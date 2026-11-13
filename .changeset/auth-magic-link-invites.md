---
"@memberjunction/server": patch
---

Magic-link redemption never writes an application's first `Application Roles` row, so an open application stays open to everyone (an allowlisted application still gets the invited role once). `MagicLinkService.CreateInvite` accepts `IdentityMode` (`email` | `anonymous`), `Kind` (`app-session` | `resource-share`), `ResourceTypeID` and `ResourceID` for in-process callers and validates them after the existing issuer, role and redirect checks. An anonymous invite may carry an email as a delivery address only: it is stored and used to send the link, but redemption still resolves the shared Anonymous principal and never binds a user to it. The `POST /magic-link/create` route and redemption are unchanged.

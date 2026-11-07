---
"@memberjunction/server": patch
---

Magic-link redemption never writes an application's first `Application Roles` row, so an open application stays open to everyone (an allowlisted application still gets the invited role once). `MagicLinkService.CreateInvite` accepts `IdentityMode` (`email` | `anonymous`), `Kind` (`app-session` | `resource-share`), `ResourceTypeID` and `ResourceID` for in-process callers, validates them after the existing issuer, role and redirect checks, and never emails anonymous invites. The `POST /magic-link/create` route and redemption are unchanged.

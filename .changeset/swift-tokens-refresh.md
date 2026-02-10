---
"@memberjunction/ng-auth-services": patch
"@memberjunction/server": patch
---

Update auth providers for latest SDK compatibility:
- MSAL: Fix v5.x error codes (timed_out replaces monitor_window_timeout), add proactive token refresh with refreshTokenExpirationOffsetSeconds, use CacheLookupPolicy.Default
- Okta: Replace deprecated handleLoginRedirect() with handleRedirect(), add error handling for invalid_grant, access_denied, and user_canceled_request OAuth errors

Fix GraphQL DeleteOptionsInput schema mismatch:
- Add missing ReplayOnly and IsParentEntityDelete fields to DeleteOptionsInput GraphQL type
- These fields were added to EntityDeleteOptions in MJCore but not synced to the GraphQL schema
- Fixes "Field is not defined by type DeleteOptionsInput" errors when deleting entities

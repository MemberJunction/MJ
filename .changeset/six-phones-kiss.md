---
"@memberjunction/ng-auth-services": patch
---

Fix Okta token refresh to prevent GraphQL re-initialization errors

- Prevents authStateManager from updating userClaims$ during token
  refresh operations
- Uses proper token.renewTokens() method for PKCE flow instead of
  individual renew calls
- Handles expired sessions gracefully without throwing errors
- Adds synchronization delay to ensure authStateManager events are
  processed correctly
- Returns refreshed claims directly without triggering app-wide
  subscription updates

This resolves the "OAuthError: The client specified not to prompt, but
the user is not logged in" error and prevents unnecessary GraphQL client
re-initialization during Okta token refresh operations.

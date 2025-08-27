---
"@memberjunction/ng-auth-services": patch
---

Fix auth provider initialization latency causing multi-second
delays on app startup

- Implemented lazy initialization for MSAL, Auth0, and Okta
  providers to defer expensive operations until authentication is
  actually needed
- MSAL: Deferred handleRedirectPromise() which was blocking for
  several seconds even when no redirect was happening
- Auth0: Removed synchronous auth state subscription from
  constructor
- Okta: Added full lazy initialization pattern with proper null
  safety
- App component: Changed to async auth setup pattern without
  blocking Angular bootstrap
- Added performance logging for GraphQL setup and metadata
  retrieval operations

This reduces MJExplorer startup time from several seconds to under
50ms while maintaining full auth functionality.

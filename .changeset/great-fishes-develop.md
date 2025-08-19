---
"@memberjunction/ng-auth-services": minor
"@memberjunction/server": minor
"@memberjunction/core": patch
---

Implement extensible N-provider authentication architecture

- Created shared authentication types in @memberjunction/core for use
  across frontend and backend
- Refactored authentication to support multiple providers using MJGlobal
  ClassFactory pattern
- Implemented dynamic provider discovery and registration without
  modifying core code
- Added support for multiple concurrent auth providers via authProviders
  array configuration
- Replaced static method with cleaner property pattern for Angular
  provider dependencies
- Eliminated code duplication and removed unused configuration methods
- Maintained full backward compatibility with existing auth
  implementations

This enables teams to add custom authentication providers (SAML,
proprietary SSO, etc.)
without forking or modifying the core authentication modules.

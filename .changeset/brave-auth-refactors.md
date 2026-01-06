---
"@memberjunction/ng-auth-services": minor
"@memberjunction/ng-explorer-core": patch
---

Refactor authentication system to v3.0 with proper encapsulation and eliminate leaky abstractions. This is a breaking change as the authentication provider API has been completely redesigned.

**Breaking Changes:**
- Removed `getUserClaims()` method - replaced with `getUserInfo()` that returns `Observable<StandardUserInfo>`
- Removed direct access to provider-specific token structures (e.g., `claims?.__raw`, `claims?.idToken`)
- New standardized API: `getIdToken()`, `getTokenInfo()`, `refreshToken()`, `classifyError()`, `getProfilePictureUrl()`
- Error handling now uses semantic `AuthErrorType` enum instead of provider-specific error checking

**New Features:**
- Standardized `StandardUserInfo` and `StandardAuthToken` interfaces across all providers
- Semantic error classification with user-friendly messages
- Profile picture URL retrieval abstraction (handles Auth0 claims, Microsoft Graph API, and Okta userinfo)
- Proper encapsulation - consumers no longer need to know which provider is being used

**Migration Guide:**
- Replace `getUserClaims()` with `getUserInfo()` and use async pipe in templates
- Replace token access patterns with `getIdToken()` or `getTokenInfo()`
- Replace provider-specific error checking with `classifyError()` and `AuthErrorType` enum
- Remove any code that checks `authBase.type` - use new abstract methods instead

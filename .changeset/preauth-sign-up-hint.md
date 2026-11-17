---
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-explorer-app": patch
---

Explorer opens the identity provider's sign-up form when a visitor arrives with `?signup=1` (from a public page's "Create account" button). Adds `ReadSignUpHint` / `RemoveSignUpHint` and `MJAuthBase.GetSignUpOptions()` (Auth0, MSAL and WorkOS supply sign-up options).

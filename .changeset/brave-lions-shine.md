---
"@memberjunction/ng-auth-services": patch
---

Fix Auth0 token refresh to properly await completion, preventing 500 errors after token expiration. The refresh() method now correctly converts the Observable to a Promise using firstValueFrom() instead of incorrectly awaiting an Observable directly.

---
"@memberjunction/ng-auth-services": patch
---

The Microsoft (MSAL) sign-in no longer resumes a session as whichever cached account is listed first. On a browser that still holds an earlier person's account, a reload or the end of a sign-in redirect could switch the session to that account. The session now resumes only as the active account (the one the last sign-in set), or as the only cached account; with several cached accounts and none active, the user signs in again.

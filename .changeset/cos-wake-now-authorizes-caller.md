---
"@memberjunction/scheduling-engine": patch
---

`Run User Routine Now` declares `AuthorizesCaller`: it already loads the routine with the caller's permissions and runs only a routine the caller owns, so a UI-role user's "Wake Now" no longer fails with "No Action Authorization grants this action to any role". Found on a clean install, where no role had been granted the action.

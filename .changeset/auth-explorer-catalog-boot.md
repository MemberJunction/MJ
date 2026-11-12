---
"@memberjunction/ng-explorer-app": patch
"@memberjunction/core-entities": patch
---

Explorer boots on catalog-only authentication: when the server's provider catalog resolved a provider, the compiled `AUTH_TYPE` and provider-specific fields are no longer required, and MSAL no longer requires the unused `TENANT_ID`. `UserInfoEngine.CreateDefaultApplications` re-reads the user's applications after a failed save and keeps rows the server created in the same window instead of logging an error.

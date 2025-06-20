---
"@memberjunction/ng-explorer-core": minor
---

added services and system-validation directories to the explorer core package. To these we can components that perform different validation checks when we boot up MJ. The specific error tackled in the PR is the case where a User logs in but has not Roles. Previously we would get a cryptic "Resource Types not Found" error that failed to indicate what the actual problem was, and how in that case we get a banner indicating the lack of roles for the user.

---
"@memberjunction/core": minor
---

Grant the Developer role CanDelete on the ~218 entities where it previously had Create/Update but not Delete, restricted to developer-owned configuration and metadata. Audit logs, OAuth runtime state, global system config, and end-user-owned content remain locked.

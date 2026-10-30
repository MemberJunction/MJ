---
"@memberjunction/core-entities": patch
---

Only the resource's owner, an Owner-level grantee, a sysadmin or the system user can now approve a `MJ: Resource Permissions` request or change what an Approved permission grants (level, type, resource or grantee). Filing an access request stays open to everyone. Sysadmins and the system user can also create Approved shares directly, which the create gate previously refused.

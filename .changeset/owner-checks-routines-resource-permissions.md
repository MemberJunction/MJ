---
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
---

Tighter owner checks for User Routines and Resource Permissions.

- A user who is not an Owner-type user can save a User Routine only with themselves as its `UserID`, on create and on update.
- On the server, an update to a Resource Permission that changes `Status`, `PermissionLevel`, `UserID`, `RoleID`, `Type`, `SharedByUserID`, `ResourceTypeID` or `ResourceRecordID` needs the resource owner or an Owner-level grantee. Without those rights, the grantee or the grantor can only set `Status` to `Revoked`. The resource of a saved row can not change. Owner-type users are exempt.
- On the server, deleting a Resource Permission needs the grantor, the resource owner, an Owner-level grantee, the grantee of the row, or an Owner-type user.

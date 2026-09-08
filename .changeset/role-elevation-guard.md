---
"@memberjunction/core-entities-server": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Security: close the role-elevation path on `MJ: Roles` and `MJ: User Roles` (issue #4282).

Issue #4260 closed the `User.Type` route to elevated capability. Role assignment is the platform's other authority mechanism and was unguarded: no server-side entity subclass existed for either entity, so `ClassFactory` resolved the generated classes, whose `Validate()` knows nothing about who is calling. On a baseline seed — and verified against a live database — the `Developer` and `Integration` roles hold unfiltered `CanCreate`/`CanUpdate`/`CanDelete` on both entities. Reproduced end to end on the real stack before the fix: a caller whose `Type` is `'User'`, holding only `Developer` and `UI`, inserted a row granting itself `Integration` (`Validate()` passed, `Save()` returned `true`), and separately created a brand-new role.

**`MJUserRoleEntityServer`** — a non-Owner may only grant, move or revoke a role they themselves hold. That subset rule is a ceiling: whatever a non-Owner does through this entity, the authority they hand out is authority they already had, so no sequence of calls lets a caller exceed their own grant. Delegated administration, IdP/group sync and onboarding automation — the legitimate non-Owner uses `User.Type` does not have — all keep working. On an update the pre-save `RoleID` is checked as well as the new one, so an assignment cannot be repointed to strip someone of a role the caller does not hold. `UserID` is deliberately not frozen: moving a grant between users stays inside the same ceiling.

**`MJRoleEntityServer`** — a non-Owner may not create, change or delete a role. Every field on this entity is authority-bearing: `Name` is what user/role synchronization matches on, `DirectoryID` maps an external directory group to the role, and `SQLName` decides which database role CodeGen grants object rights to.

Both guards override `Save()` and `Delete()` alongside `Validate()`, so the rules hold on every write path — GraphQL resolvers, Remote Operations, the Create/Update/Delete Record actions, metadata sync, one-off scripts — and cannot be switched off by the `ReplayOnly` save option, which skips `Validate()` while still performing the write. Both are pure: they read only the record's own field state and the caller's already-cached roles, so they cost nothing per save and are unit-testable without a database.

**Upgrade notes.**

- **Explorer's role-management screen stops working for non-Owner administrators.** It has no Owner gate of its own today, so a Developer-role non-Owner reaches it in practice; creating, renaming and deleting roles from it are now refused with a message naming the rule. This is the same trade-off #4260 accepted for the user-management screen.
- **Explorer's bulk role assignment now reports refusals instead of silently doing nothing.** `executeBulkRoleAssign` enrols each row in a transaction group, where `Save()` only queues the write but still validates eagerly — so a refused row returns `false` and is never enrolled. That return was ignored, so an all-refused batch left the group empty, `Submit()` returned `true` for having nothing to do, and the screen reported success having assigned nothing. It now collects each refusal with the user it applies to and surfaces them. Pre-existing, but this change is what makes it common.
- **`SyncRoles` / `SyncUsers` / `SyncRolesAndUsers` are unaffected on a default install** — all three carry `@RequireSystemUser()`, and `getSystemUser()` resolves the seeded `Type='Owner'` system user. A deployment whose system user is **not** an Owner will see those sync paths fail closed at the save, loudly rather than silently, for the same reason #4260 documented.
- **Not closed by this change:** `MJ: Entity Permissions` carries the same unfiltered `Developer`/`Integration` grant, so a holder of either role can still widen a role's permissions directly. That is an independent route with its own decision to make about the invariant, so it is deliberately out of scope here rather than fixed in passing; this changeset does not claim to close it.

New unit coverage in MJCoreEntitiesServer (41 tests across both guards, including the pre-fix reproduction) and a new deterministic integration bundle, **IT89 — Role Privilege Elevation Guard** (`role-elevation`, RE1–RE6), which proves the ClassFactory wiring and both guards against a real provider the way IT88 does for `MJ: Users`.

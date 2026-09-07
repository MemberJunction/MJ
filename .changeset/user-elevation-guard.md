---
"@memberjunction/core-entities-server": patch
---

Security: a non-Owner can no longer create, delete, or change privileged fields on `MJ: Users` rows (#4260)

`MJ: Users` now has a server-side entity subclass enforcing, for any caller whose `Type` is not `'Owner'`:

- **Create is refused outright.** The two config-driven creators of a `MJ: Users` row (JWT auto-provisioning, magic-link provisioning) resolve their creating user against the deployment's `contextUserForNewUserCreation` / `contextUserForProvisioning` setting, which — under the shipped default — names the seeded Owner-type system user. This closes a bypass where a non-Owner could instead create a row with a chosen `Name` (which has no unique index) matching that configured string, and win the "lowest ID" tiebreak `resolvePrincipalFrom` uses to pick which user the server provisions as.
- **`Type` may not be changed** on an existing row — it is the column every Owner check in the platform reads, so writing it was equivalent to granting yourself superuser.
- **Only the caller's own row may be modified**, compared against the pre-save `ID` so that rewriting `ID` cannot bypass it. If the pre-save identity cannot be established at all, the save is now refused rather than silently allowed.
- **`Name` may not be changed** on an existing row — the same `resolvePrincipalFrom` matching described above runs on update too, so renaming yourself is an equally valid path to the same redirection.
- **Delete is refused outright.** MJ deactivates users via `IsActive`; it does not delete them, and an unguarded delete let a non-Owner remove any account, Owners included.

Owner-type callers — admins, and the seeded system user that auto-provisioning and magic-link provisioning run as under the shipped default — are exempt from all of the above, so user administration and JWT/magic-link provisioning are unaffected for a default install. `FirstName`, `LastName` and `Title` remain freely editable by their owner.

**Upgrade note — read before upgrading if you have customized user provisioning or administer users through a non-Owner role:**

- **The broadest change: a non-Owner can no longer modify any OTHER user's row at all**, not merely the `Type` and `Name` fields (both of which are themselves *new* restrictions in this same changeset, not pre-existing ones — see above). Every field on a row that is not the caller's own is now refused for a non-Owner caller. Concretely, this breaks Explorer's user-management screen for any role but Owner: `user-management.component.ts` has no Owner-only gate of its own, so a `Developer`-role admin who already reaches it today edits other users via `user-dialog.component.ts:181` and deactivates them via `toggleUserStatus` (`user-management.component.ts:570`) — after this change, **every one of those saves is refused** for a non-Owner. That is the screen's primary function.
- If your `contextUserForNewUserCreation` or `contextUserForProvisioning` setting names a **non-Owner** user's `Name` or `Email` (the resolution ladder matches those two rungs without checking `Type`; only its System-by-ID and lowest-ID-Owner rungs guarantee an Owner), JWT auto-provisioning and magic-link provisioning will now **fail closed** at save time instead of silently creating rows as that non-Owner. Point the setting at an Owner-type user before upgrading.
- **Deployments that grant non-Owner roles (e.g. `Developer`, `Integration`) update/create/delete access on `MJ: Users` should treat all of the above — create, delete, editing another user's row, and the `Type`/`Name` restrictions — as new behavior for that role**, not as pre-existing restrictions this release only tightens.

This closes the capability half of #4260. The reachability half was fixed separately by narrowing the shipped `newUserRoles` default to `['UI']`. The guard is the durable fix of the two: it holds for any role a deployment grants, including custom ones, on every write path (`Validate()`/`Delete()` run inside `BaseEntity.Save()`/`.Delete()`), whereas the config default only governs who gets the seeded roles.

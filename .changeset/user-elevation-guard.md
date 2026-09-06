---
"@memberjunction/core-entities-server": patch
---

Security: a non-Owner can no longer create, delete, or change privileged fields on `MJ: Users` rows (#4260)

`MJ: Users` now has a server-side entity subclass enforcing, for any caller whose `Type` is not `'Owner'`:

- **Create is refused outright.** Every legitimate creator of a `MJ: Users` row (auto-provisioning, magic-link provisioning, Explorer's user-management UI) already runs as an Owner-type user. This closes a bypass where a non-Owner could instead create a row with a chosen `Name` (which has no unique index) matching the platform's configured principal string, and win the "lowest ID" tiebreak `resolvePrincipalFrom` uses to pick which user the server provisions as.
- **`Type` may not be changed** on an existing row — it is the column every Owner check in the platform reads, so writing it was equivalent to granting yourself superuser.
- **Only the caller's own row may be modified**, compared against the pre-save `ID` so that rewriting `ID` cannot bypass it. If the pre-save identity cannot be established at all, the save is now refused rather than silently allowed.
- **`Name` may not be changed** on an existing row — the same `resolvePrincipalFrom` matching described above runs on update too, so renaming yourself is an equally valid path to the same redirection.
- **Delete is refused outright.** MJ deactivates users via `IsActive`; it does not delete them, and an unguarded delete let a non-Owner remove any account, Owners included.

Owner-type callers — admins, and the seeded system user that auto-provisioning and magic-link provisioning run as — are exempt from all of the above, so user administration and JWT/magic-link provisioning are unaffected. `FirstName`, `LastName` and `Title` remain freely editable by their owner.

**Deployments that grant non-Owner roles (e.g. `Developer`, `Integration`) update/create/delete access on `MJ: Users` should note the create and delete refusals are new behavior**, not just the `Type`/`Name` restrictions.

This closes the capability half of #4260. The reachability half was fixed separately by narrowing the shipped `newUserRoles` default to `['UI']`. The guard is the durable fix of the two: it holds for any role a deployment grants, including custom ones, on every write path (`Validate()`/`Delete()` run inside `BaseEntity.Save()`/`.Delete()`), whereas the config default only governs who gets the seeded roles.

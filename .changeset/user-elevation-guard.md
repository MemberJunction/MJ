---
"@memberjunction/core-entities-server": patch
---

Security: a non-Owner can no longer change `User.Type` or edit another user's row (#4260)

`MJ: Users` now has a server-side entity subclass enforcing three invariants for any caller whose `Type` is not `'Owner'`:

- `Type` may not be changed — it is the column every Owner check in the platform reads, so writing it was equivalent to granting yourself superuser.
- Only the caller's own row may be modified, compared against the pre-save `ID` so that rewriting `ID` cannot bypass it.
- `Name` may not be changed on an existing row. `resolvePrincipalFrom` matches the configured context user against `User.Name` first, breaking ties by lowest ID, so a user able to rename themselves to the configured string could redirect which principal the server provisions as. That ordering is deliberate and is only sound while `Name` is not writable by untrusted parties.

Owner-type callers — admins, and the seeded system user that auto-provisioning runs as — are exempt, so user administration and JWT/magic-link provisioning are unaffected. `FirstName`, `LastName` and `Title` remain freely editable by their owner.

This closes the capability half of #4260. The reachability half was fixed separately by narrowing the shipped `newUserRoles` default to `['UI']`. The guard is the durable fix of the two: it holds for any role a deployment grants, including custom ones, on every write path (`Validate()` runs inside `BaseEntity.Save()`), whereas the config default only governs who gets the seeded roles.

`User.Type` is the column every Owner check in the platform reads, so writing it was equivalent to granting yourself superuser. MJ has no per-role field permission, and an "own row only" RLS filter would not have helped — it still permits setting your *own* `Type` to `'Owner'`.

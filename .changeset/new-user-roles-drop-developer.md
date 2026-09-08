---
"@memberjunction/server": patch
---

Security: auto-provisioned users no longer get the `Developer` role by default (#4260)

`DEFAULT_SERVER_CONFIG.userHandling.newUserRoles` shipped as `['UI', 'Developer']`. On the baseline seed the `Developer` role holds unfiltered `CanUpdate` on 439 of the database's 446 entities, `MJ: Users` among them — where `AllowUpdateAPI` is true and both `Type` and `Name` are updatable fields, with no row-level filter scoping the grant to the caller's own row.

Every gate in the chain passed: the config default assigned the role, `EntityPermission` granted Update, the entity and field `AllowUpdateAPI` flags allowed it, `BaseEntity.CheckPermissions` passed, and CodeGen had already issued `GRANT EXECUTE ON __mj.spUpdateUser TO cdp_Developer`. So anyone who obtained an account through JWT auto-provisioning or a magic-link redeem could write **any** row of `MJ: Users`, including setting their own `Type` to `'Owner'` — the column MJ's superuser checks read. That is privilege escalation from "can obtain a token from the configured IdP" to "platform Owner".

This mattered on more than a bare install. `loadConfig()` deep-merges via `mergeConfigs`, so a host writing a *partial* `userHandling` block inherited this array — the Zod `.default([])` never fired, because the key was never absent after the merge. The shipped default was the effective posture of every deployment that did not name `newUserRoles` explicitly.

**The default is now `['UI']`**, the seeded end-user role: conversations, views, dashboards, artifacts, settings — and no write on `MJ: Users`. The same correction is applied to the `README` example and the in-repo `MJCLI` reference config, both of which are copied into real deployments.

**Upgrade impact.** No migration, and no change for a host that sets `newUserRoles` explicitly. If you relied on the default to give new users developer-level access, set it yourself:

```js
userHandling: { newUserRoles: ['UI', 'Developer'] }
```

Do that only where you're comfortable granting every such identity broad data-plane write across ~439 entities — the guard described below stops it from making them a platform Owner, but the underlying `Developer`/`Integration` update grant is otherwise unfiltered.

**Re-adding `Developer` is no longer an escalation risk, but is still inadvisable.** It does not reopen the `MJ: Users` privilege escalation described above: `@memberjunction/core-entities-server` ships a server-side guard on `MJ: Users` in this same release (see the `user-elevation-guard` changeset) that refuses privilege-elevating writes — create, delete, and changing `Type`, `Name`, or another user's row — for **any** caller whose `Type` is not `'Owner'`. That guard is role-blind: it holds whatever `newUserRoles` names, `Developer` and `Integration` included, and for custom roles this changeset never anticipated.

What it does still hand out is broad data-plane access. `Developer` and `Integration` hold unfiltered `CanUpdate` on 439 of the database's 446 entities. That grant is unchanged here — narrowing it is a behavioural change for existing hosts, needs its own migration, and is tracked separately. It is the real reason not to give either role to every auto-provisioned user.

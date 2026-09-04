---
"@memberjunction/server": patch
---

Fix: the default magic-link provisioning user could never resolve (#4209)

`userHandling.contextUserForNewUserCreation` shipped as `'not.set@nowhere.com'` — the seeded system
user's **Email** — but was resolved with `UserCache.UserByName`, which matches **Name** (`'System'`).
On a stock database the default named the very user it was aiming at and could not reach it. Every
magic-link redeem, and every JWT auto-provisioned user, therefore logged at error level:

```
[MagicLink] Configured provisioning user 'not.set@nowhere.com' not found; falling back to an Owner.
```

and was attributed to whichever user happened to sort first as an Owner — a value that changes with
the order `SELECT * FROM vwUsers` returns, so any audit over `CreatedByUserID` for these users was
reading noise.

**What changed.** Resolution moved into one shared module (`src/auth/principals.ts`) used by
`MagicLinkService`, `NewUserBase` and `WidgetSessionService`, which previously hand-rolled three
mutually inconsistent versions of the same ladder. It now resolves in this order:

1. `User.Name` — tried first, so **every host that resolves today resolves to the same user**
2. `User.Email` — the identity column used everywhere else in MJServer, and the only one the schema
   makes unique (`UQ_User_Email`). This is the rung that fixes MJ's own default
3. the system user, by ID — so it survives the system user being renamed
4. the lowest-ID **active** Owner — a last resort, but a deterministic one

An unresolvable candidate is now reported **once per distinct setting + value** rather than once per
request, so a misconfiguration is still visible without burying real errors underneath it.

**Behaviour changes to be aware of** (all limited to hosts that were already falling back — a host
whose configured user resolves is unaffected):

- Provisioning that previously landed on an arbitrary Owner now lands on the system user, so
  `CreatedByUserID` for newly provisioned users changes — to a stable value. Historical rows are
  untouched.
- The Owner fallback now requires `IsActive`. A deployment whose only Owner is deactivated
  previously provisioned under that inactive account and now resolves to no principal at all,
  failing loudly instead of silently acting as a disabled user.

The shipped default is now `'System'`, and the config comments, `MJServer/README.md` and the
`mj.config.cjs` / docker templates say which columns the setting is matched against — the previous
wording described it purely in email terms, so an operator following it reproduced the bug.

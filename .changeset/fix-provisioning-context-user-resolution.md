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
3. the system user, by ID — so it survives the system user being renamed (active only)
4. the lowest-ID **active** Owner — a last resort, but a deterministic one

An unresolvable candidate is now reported **once per distinct setting + value** rather than once per
request, so a misconfiguration is still visible without burying real errors underneath it.

**Behaviour changes to be aware of** (all limited to hosts that were already falling back — a host
whose configured user resolves is unaffected):

- Provisioning that previously landed on an arbitrary Owner now lands on the system user, so
  `CreatedByUserID` for newly provisioned users changes — to a stable value. Historical rows are
  untouched.
- **No rung returns an inactive user** — the two configured rungs as well as the system rung and
  the Owner fallback. Two cases follow. A setting naming a user who has since been **deactivated**
  no longer resolves to them: it falls through to the system user and says so, naming the account
  as inactive rather than as missing, because the remedy (reactivate it, or name someone else) is
  the opposite of the one a "not found" message implies. And a deployment whose system user (or
  whose only Owner) is deactivated now resolves to no principal at all, failing loudly instead of
  silently provisioning under that disabled account.
- **Every rung breaks ties by lowest ID**, not by array position. `User.Name` has no unique
  constraint, so two rows can share one; resolving that by whatever order
  `SELECT * FROM vwUsers` returned would be the same attribution drift one rung further down.

The shipped default is now `'System'`, and the config comments, `MJServer/README.md`,
`guides/MAGIC_LINK_GUIDE.md` and the `mj.config.cjs` / docker templates say which columns the
setting is matched against — the previous wording described it purely in email terms, so an
operator following it reproduced the bug.

`auth/exampleNewUserSubClass.ts` — the template the docs tell you to copy — resolved the same
setting against `Email` alone, so with the default now naming the system user it could no longer
reach it. It goes through the shared ladder too, and a new source-scanning test
(`principals.callSites.test.ts`) fails if a fourth hand-rolled variant ever appears.

The misconfiguration report is de-duplicated with a bounded LRU rather than a capped `Set`: a
capped set stops admitting once full, so every candidate first seen after that logged on *every*
call — this bug's own symptom, reintroduced for exactly the dynamic caller the cap existed to
defend against.

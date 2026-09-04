# Resolving an Operator-Named Context User

Fixes [#4209](https://github.com/MemberJunction/MJ/issues/4209). Architecture signed off; not yet built.

## 1. Problem

`DEFAULT_SERVER_CONFIG.userHandling.contextUserForNewUserCreation` ships as
`'not.set@nowhere.com'` — an **Email**. Both consumers resolve it through
`UserCache.UserByName`, which matches **Name**. On a stock database the system user is
`Name='System'`, `Email='not.set@nowhere.com'`, so the default names the user it was aiming at
and cannot reach it.

Reproduced against the real shipped code (real `DEFAULT_SERVER_CONFIG`, real
`UserCache.UserByName`, the baseline `__mj.User` seed rows):

```
shipped default = "not.set@nowhere.com"

stock DB, System first in cache
  UserByName    : MISS
  logged        : [MagicLink] Configured provisioning user 'not.set@nowhere.com' not found; falling back to an Owner.
  attributed to : System        ECAFCCEC-6A37-EF11-86D4-000D3A4E707E

same host, admin sorts first
  logged        : [MagicLink] Configured provisioning user 'not.set@nowhere.com' not found; falling back to an Owner.
  attributed to : jane.admin@acme.com  AAAA1111-...

candidate = 'System' (the Name)
  logged        : (none)
  attributed to : System        ECAFCCEC-6A37-EF11-86D4-000D3A4E707E
```

The first two cases are the same host with the same config. Only the row order from
`SELECT * FROM vwUsers` differs, and `CreatedByUserID` changes with it.

Two consequences, both silent: an audit over `CreatedByUserID` for magic-link-provisioned
users reads noise, and every host that took the default logs one error-level line per link
open.

### Wider than the issue states

- **`packages/MJServer/src/auth/newUsers.ts:14`** carries the identical defect — same default,
  same `UserByName`, same arbitrary-Owner fallback. It fires on every JWT auto-provisioned
  user, and `autoCreateNewUsers` defaults to `true`.
- **`packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts:2619`** already documents
  a production incident traced to this placeholder, with a hand-rolled workaround around it.

## 2. How principal resolution works today (grounding)

Three tiers, three columns.

| Tier | What it answers | Column | Where |
|---|---|---|---|
| 1 | Who is the caller? | `Email` | `verifyUserRecord`, `UserResolver.UserByEmail:100`, `ComponentRegistryResolver` (×4), `SearchEntitiesResolver:119`, `PotentialDuplicateRecordResolver:79`, `SyncRolesUsersResolver` (×3), `MagicLinkService.provisionUser:433` |
| 2 | Act as the system | `ID` | `UserCache.GetSystemUser()` → `SYSTEM_USER_ID` (~25 sites); hardened wrapper `auth/index.ts:184` refreshes a cold cache, retries once, then throws |
| 3 | Act as a config-named user | `Name` | `contextUserForNewUserCreation` (`config.ts:28`), `contextUserForProvisioning` (`:332`), `contextUserForLookup` (`:395`) — all via `UserCache.UserByName` |

Tier 3 is the outlier and holds the bug. Two observations make it indefensible as designed:

- **`UserByName` has no caller that legitimately wants a Name lookup.** Its four
  non-MJServer call sites (`QueryGen`, `TestingFramework/CLI`, `AICLI`, `MetadataSync`) all pass
  the literal `"System"` — Tier 2 work done through a Tier 3 mechanism. Its three MJServer
  sites pass an operator config value; two of them are broken.
- **`MagicLinkService` resolves the invitee by Email (`:433`) and the provisioning context user
  by Name (`:702`)** — same file, same request, two different identity columns.

The fallback ladder is already duplicated six ways in three variants:

| Variant | Sites |
|---|---|
| `find(Type==='owner')` | `MagicLinkService:707`, `newUsers.ts:20` |
| `GetSystemUser() ?? find(IsActive && Type==='owner')` | `WidgetSessionService:705`, `TwilioTelephonyRouter:178`, `VonageTelephonyRouter:233`, `RingCentralTelephonyService:301` |
| `GetSystemUser() ?? contextUser` | `IdentityClaimEngineServer:414` |

The second variant is the correct one. The two broken sites use the first.

## 3. Constraints and invariants

| | |
|---|---|
| `User.Name` | `NVARCHAR(100) NOT NULL`, **not unique** |
| `User.Email` | `NVARCHAR(100) NOT NULL`, **UNIQUE** (`UQ_User_Email`) |
| `User.Type` | `NCHAR(15)`, space-padded (`'Owner          '`) — every comparison must `.trim()` |
| System row | ID pinned to a constant; seeded `Name='System'`, `Email='not.set@nowhere.com'` |
| Name ≡ Email | `NewUserBase` sets `user.Name = email` (`newUsers.ts:31`). The seeded `System` and `Anonymous` rows are the only stock rows where the columns diverge — and the default points at one of them |
| Cache ordering | `SELECT * FROM vwUsers` has no `ORDER BY` (`UserCache.ts:112`), and is mutated in place at runtime by `Users.push` (`auth/index.ts:291`, `MagicLinkService:682`). Unstable across boots *and* within a process |
| Config merge | `mergeConfigs` is a lodash deep merge (`config-merger.test.ts:85`) — the default reaches every host that does not set the key |
| Zod default | `''` — an explicitly-empty value is falsy and skips the lookup |
| Trust | The candidate is server config, never user input. No injection surface, and no privilege change in any fallback: System and the Owner fallback are both `Type='Owner'` |
| Tested invariant | Integration check `scoped-anon-elevation.SA2` already asserts `GetSystemUser()` resolves *and* carries grants |

## 4. Edge cases and failure modes

| # | Condition | Today |
|---|---|---|
| 1 | Stock host, shipped default | Name miss → one error line per redeem → arbitrary Owner **(the issue)** |
| 2 | Host copied README's `'admin@example.com'` | Same failure — **changing the default cannot fix it** |
| 3 | Key explicitly `''` | Falsy candidate → Owner fallback with **no log at all** |
| 4 | Cache order differs between boots | `CreatedByUserID` changes for identical host + config |
| 5 | `Users.push` mid-process | Ordering drifts without a restart |
| 6 | Cold cache (`Refresh` failed, swallowed to `LogError`, `_users` stays `[]`) | Lookup and Owner fallback both empty → redeem returns `server_error`; `createNewUser` returns null. `getSystemUser()` would have refreshed and retried |
| 7 | System user deactivated | `GetSystemUser()` ignores `IsActive` — returns an inactive principal, contradicting the fail-closed `isInviterActive` policy in the same file |
| 8 | System user renamed | A hardcoded `'System'` default silently breaks again |
| 9 | Two users share a `Name` | First in arbitrary order wins — `Name` is not unique |
| 10 | Configured Name collides with another user's Email | The issue's stated risk against option 2 — neutralized by trying Name first |
| 11 | `u.Name` null via the `SetUsers` path | `u.Name.trim()` throws; `UserByName` has no guard |
| 12 | Malformed token | `ctxUser` null at `done()`, so `recordRedemption` re-resolves |
| 13 | `docker/regression/scripts/patch-test-api-config.cjs:30` | Pins the sentinel — keeps logging after any default change |

## 5. Options considered

### Option A — change the default to `'System'`
The issue's stated preference. Deep merge means it reaches hosts with no key set, but it does
nothing for modes 2 and 3, and it binds correctness to a non-unique column and a magic string
(mode 8). **Worth doing as a doc fix, not as the mechanism.**

### Option B — Name-or-Email, applied in place
Right semantics, shallow application: it copies the same two-column decision into three call
sites and leaves the six-site, three-variant ladder untouched. Fixes modes 1–3; leaves 4 and 6.

### Option C — one deep module — *recommended*
Extract the ladder once, behind a small interface, and migrate the three config-driven sites.
Fixes modes 1–5, 9, 10, 12 and 13. Modes 7 and 11 are deliberately out of scope (§6); mode 6
needs a decision (§8).

**Deletion test:** delete the module and the ladder reappears in six places — it already has,
in three variants. **Seam test:** two adapters exist today (the broken variant and the
widget/telephony variant), so the seam is real, not hypothetical.

## 6. Design

New file `packages/MJServer/src/auth/principals.ts`. MJServer, not `GenericDatabaseProvider`:
the candidate comes from MJServer config and all three consumers are MJServer, so putting it in
the provider package would couple the provider to config it has no business knowing.

```ts
/** Pure: takes the user list, so it tests without the singleton. */
export function resolveConfiguredPrincipal(
  candidate: string | undefined,
  users: UserInfo[],
  purpose: string,
): PrincipalResolution;
```

The ladder, in order:

1. **`Name`** — exact current semantics. Every host that resolves today resolves to the *same*
   user. This is what neutralizes the issue's objection to option B (mode 10).
2. **`Email`** — unique by constraint, so unambiguous. Fixes the shipped default *and* every
   host that took the README's advice (modes 1, 2).
3. **`GetSystemUser()`** by ID — matches the widget/telephony variant; the only branch immune
   to renames (modes 3, 8).
4. **Active Owner, ordered by ID** — deterministic last resort, not array order (modes 4, 5).

A thin wrapper reads `UserCache.Users` and feeds the pure function; that is the internal seam.
Logging moves inside and fires **once per distinct (candidate, outcome)** rather than per call,
which ends the log poisoning independently of whether resolution succeeds — and also collapses
the second resolution a malformed token triggers through `recordRedemption` (mode 12).

On an empty cache the ladder returns null, exactly as today (mode 6). See §8.

### Call sites migrated

- `MagicLinkService.resolveProvisioningContextUser:699`
- `NewUserBase.createNewUser` (`newUsers.ts:12–24`)
- `WidgetSessionService.resolveLookupUser:696`

### Surfaces corrected

`config.ts:654` (default → `'System'`), `config.ts:331` (comment names the wrong column),
`packages/MJServer/README.md:129`, `packages/MJCLI/mj.config.cjs:231`,
`docker/MJAPI/docker.config.cjs:185`, `docker/regression/scripts/patch-test-api-config.cjs:30`.

### Deliberately out of scope — logged, not fixed

Not broken today, so not in this change's blast radius:

- The telephony trio (`Twilio:178`, `Vonage:233`, `RingCentral:301`) already uses the correct
  ladder; it can adopt the module later.
- Retiring `UserByName` in favour of `GetSystemUser()` at its four `"System"` call sites.
- The `IsActive` gap in `GetSystemUser()` (mode 7) and the null-`Name` guard in `UserByName`
  (mode 11).

## 7. Testing

The pure function is the test surface — `(candidate, users) → resolution`, no singleton, no
mocks. Modes 1, 2, 3, 4, 6, 9 and 10 map onto direct unit cases, seeded from the real baseline
`__mj.User` rows and the real `DEFAULT_SERVER_CONFIG`.

Red first, per the issue's definition of done:

1. The shipped default resolves to the seeded System user; nothing logged.
2. Two cache orderings of the same host resolve identically.
3. An explicitly configured Name still wins over an Email collision.
4. An unresolvable candidate lands on System, not an arbitrary Owner, and logs once.

`magicLink.test.ts` has **zero** coverage of `resolveProvisioningContextUser`, so no existing
expectation changes. The one existing test that moves is `newUsers.test.ts:271`'s `UserByName`
mock — which is precisely what hid this bug — and that is setup, not an expectation.

Baseline before any change: `magicLink.test.ts`, `magicLinkService.provisionLog.test.ts` and
`newUsers.test.ts` are green — 92 tests, 3 files.

Definition of done: `cd packages/MJServer && pnpm test`, then `pnpm run test:integration`.
Changeset at `patch` — no migration, no metadata.

## 8. Open questions

**Mode 6 — cold cache.** The ladder is synchronous, so on an empty `UserCache` every step
misses and it returns null: a redeem fails `server_error`, `createNewUser` returns null. That is
today's behaviour, unchanged. `auth/index.ts:184`'s `getSystemUser()` already solves this
properly — refresh, retry once, then throw — but it is `async`, so routing step 3 through it
makes the resolver async too. All three call sites sit in async contexts, so this looks
cheap; it needs confirming against `WidgetSessionService.resolveLookupUser` before committing
to it. **Decide during implementation; do not silently leave mode 6 unaddressed.**

Approach and doc scope signed off 2026-09-04.

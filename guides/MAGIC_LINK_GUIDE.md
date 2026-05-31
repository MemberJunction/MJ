# Magic Link Access Guide (External, App-Scoped Users)

Magic links let you share a slice of MemberJunction with **external** people — no
password, no pre-existing account — confined to **one Application** and a
**restricted role**. The canonical use case: *"send a recruiter a link that starts
a session where they can look up candidates, while an admin watches the activity."*

This guide covers how the feature works, how to turn it on, and — the part you'll
actually reuse — **how to define an external-access scenario** (a role + the
entities it can touch) declaratively in metadata.

> **Design rationale** lives in [`plans/auth0-magic-link.md`](../plans/auth0-magic-link.md).
> This guide is the operational "how to use & extend it" companion.

---

## 1. Mental model — two layers

There are two distinct layers, and conflating them is the most common mistake:

| Layer | Where it lives | What it is | Lifecycle |
|---|---|---|---|
| **Mechanism** | The MJ framework (this feature) | Magic-link issuing/redemption, RS256 token minting, the auth provider, a baseline `External App User` role | Ships once, reused everywhere |
| **Scenario config** | **Your deployment's metadata** | A named role (e.g. `Recruiter`) + its Entity Permissions (e.g. *read Candidates*) + the target Application | Authored per client/app |
| **The external people** | **Runtime** (provisioned on redemption) | The actual recruiter/guest user records | Created when a link is redeemed; never seeded |

**The external users themselves are NOT metadata.** You can't enumerate who will
redeem a shared link, and the token is a secret (only its SHA-256 hash is stored),
so an invite can't round-trip through a metadata file. Users are provisioned at
redemption time. **The authorization that scopes them IS metadata** — that's the
role and its permissions, and that's what you version-control.

---

## 2. How it works

```
┌──────────────┐  1. POST /magic-link/create        ┌──────────────────────────┐
│ Admin / app  │ ──────(authenticated)─────────────▶ │  MJServer                 │
│  (internal)  │     {email, applicationId, roleId}  │                           │
└──────────────┘                                     │  • MagicLinkInvite record │
        ▲                                            │    (TokenHash only)       │
        │ 5. admin views activity                    │  • emails the link        │
        │    (invite records + audit)                └──────────────────────────┘
                                                                  │
┌──────────────┐  2. emailed link                                │
│  Recruiter   │ ◀───────────────────────────────────────────────┘
│  (external)  │
└──────────────┘  3a. GET /magic-link/redeem?token=…  ┌──────────────────────────┐
        │ ───────────(safe: interstitial)────────────▶│  MJServer                 │
        │  3b. POST (Continue click)                   │  • atomic consume (single-│
        │ ───────────────────────────────────────────▶│    use CAS) then validate │
        │                                              │  • provision user w/      │
        │  4. minted RS256 session JWT                 │    restricted role + app  │
        │ ◀────────────────────────────────────────── │  • mint JWT (RS256)       │
        ▼                                              └──────────────────────────┘
   scoped session — recruiter sees only the
   recruiting app's data; everything else is
   denied at the GraphQL/entity layer
```

MJ signs the session token with **RS256** and publishes the public key at a JWKS
endpoint. The `magic-link` auth provider is registered with that endpoint, so
MJServer's standard issuer-driven JWT validation accepts these tokens with no
special-casing — "the rest of MJ just works."

---

## 3. Enabling the feature

Add a `magicLink` block to `mj.config.cjs` (server config):

```javascript
module.exports = {
  // ...
  magicLink: {
    enabled: true,
    // RS256 private key (PEM, raw or base64). If omitted, an EPHEMERAL keypair is
    // generated at startup (dev only — restart invalidates outstanding sessions).
    rsaPrivateKey: process.env.MJ_MAGIC_LINK_PRIVATE_KEY,
    defaultExpiresInHours: 72,        // unredeemed-link lifetime
    sessionTokenTtlHours: 8,          // minted session lifetime (no refresh tokens)
    restrictedRoleName: 'External App User',   // default role when an invite omits roleId
    // Authorization (secure defaults — see §9):
    //   Who may call POST /create: Owners always; plus members of any role named here.
    //   Empty (default) ⇒ Owner-only. NEVER list the restricted role here.
    inviteIssuerRoleNames: [],                 // e.g. ['App Admin']
    //   Which role an invite may grant: the restricted role always; plus any named here.
    //   Empty (default) ⇒ restricted-role-only. A caller-supplied roleId outside this
    //   set is rejected — this is what blocks granting Owner/Admin to an external user.
    grantableRoleNames: [],                    // e.g. ['Recruiter']
    contextUserForProvisioning: 'system@yourco.com', // owns provisioning writes
    communicationProvider: 'SendGrid', // CommunicationEngine provider for invite emails
    fromAddress: 'no-reply@yourco.com',
    audience: 'mj-magic-link',
  },
};
```

Generate a production key with:

```bash
openssl genpkey -algorithm RSA -pkcs8 -out magic-link.pem -pkeyopt rsa_keygen_bits:2048
export MJ_MAGIC_LINK_PRIVATE_KEY="$(cat magic-link.pem)"   # or base64 it
```

The `magic-link` auth provider is auto-registered at startup (issuer = public URL,
`jwksUri` = `<publicUrl>/magic-link/jwks.json`) — you do **not** add it to
`authProviders` by hand.

---

## 4. Defining an external-access scenario (the recipe)

This is the reusable part. Example: AGU wants recruiters to look up candidates.

### Step 1 — Define the restricted role (metadata)

Either reuse the baseline `External App User` role (shipped in
[`metadata/roles/`](../metadata/roles/)) or create a scenario-specific one. A
named role is clearer when you have several external scenarios:

```jsonc
// metadata/roles/.roles.json  (entity: "MJ: Roles")
[
  {
    "fields": {
      "Name": "Recruiter",
      "Description": "External recruiter via magic link — read-only access to candidate data in the recruiting app. Never assign to internal/SSO users."
    }
  }
]
```

### Step 2 — Grant Entity Permissions to the role (metadata)

This is the **actual security boundary**. Grant the role read (and only read) on
exactly the entities recruiters should see — `Candidates` and nothing else:

```jsonc
// metadata/entity-permissions/.entity-permissions.json  (entity: "MJ: Entity Permissions")
[
  {
    "fields": {
      "EntityID": "@lookup:MJ: Entities.Name=Candidates",
      "RoleID":   "@lookup:MJ: Roles.Name=Recruiter",
      "CanRead":   true,
      "CanCreate": false,
      "CanUpdate": false,
      "CanDelete": false
    }
  }
]
```

> Grant the **narrowest** set. The role's permissions are enforced server-side at
> the GraphQL/entity layer, so a recruiter who hand-types a URL or hits GraphQL
> directly still can't read anything outside this grant. Nav-hiding in the
> Explorer is cosmetic on top of this — never the boundary.

#### Step 2a — The Explorer "boot baseline" (already shipped)

Rendering the MJExplorer shell needs a **small** set of framework entities that the
guest must actually *use* (their own workspace/settings, their identity, and the
app-scope tables). Everything else the shell's startup engines try to load — AI,
Dashboards, Queries, Encryption, Integrations, etc. — a deny-all guest simply
**can't read, and doesn't need to**: `BaseEngine` treats a permission-denied load
as a permanent condition and loads that engine *empty* instead of hanging (see
[§ Engine degradation](#engine-degradation)). So the baseline shipped in
[`metadata/entity-permissions/.entity-permissions.json`](../metadata/entity-permissions/.entity-permissions.json)
for `External App User` is just these **9** grants:

| Entity | Grant | Why |
|---|---|---|
| `MJ: Workspaces`, `MJ: Workspace Items` | **CRUD** | Explorer creates + persists a per-user default workspace on first load. `CanCreate` is required — a read-only grant still hangs. |
| `MJ: User Settings`, `MJ: User Favorites`, `MJ: User Record Logs`, `MJ: User Notification Preferences` | **CRUD** | `UserInfoEngine` bootstraps these per-user stores; preferences are written back. |
| `MJ: User Roles` | **Read** | Server-side `CurrentUserAndRoles` resolves the user's own roles through a permission-checked field — needed to establish `CurrentUser`. |
| `MJ: User Applications` | **Read** | App access check (`CheckUserApplicationAccess`). Without it the invited app reads as "not installed." |
| `MJ: Application Roles` | **Read** | App authorization (the role's `CanAccess` to the invited app). |

This baseline is **framework-level** (every magic-link Explorer user needs it) and
is distinct from the **scenario data perms** in Step 2 (your `Candidates`-style
grants, per-deployment). If you define a scenario-specific role instead of reusing
`External App User`, **copy this baseline onto that role too**, or the shell won't
boot. It grants no business data — only the shell plumbing and the app-scope tables.

> The three `Read` grants (`User Roles`, `User Applications`, `Application Roles`)
> are *entity-wide* reads under MJ's permission model, so a guest could in principle
> query all rows, not just their own. They're the minimum needed to boot + resolve
> app scope. Narrowing these to the current user's own rows is a tracked follow-up
> (server-side: `CurrentUserAndRoles` shouldn't require a blanket entity read).

<a id="engine-degradation"></a>
**Engine degradation (why the baseline is small).** `BaseEngine.HandleSingleViewResult`
classifies a failed config load: if it failed because the context user lacks Read on
that entity, that's *permanent* (a retry never succeeds for this role), so the engine
property loads empty and is marked loaded — the shell finishes booting. Only genuinely
transient failures (network, MJAPI restart) keep retrying. This is general restricted-role
robustness, not magic-link-specific: any least-privilege role boots cleanly without
being granted reads on every engine's entities.

### Step 3 — Make the role able to enter the Application

Recruiters land in one Application (the recruiting app). Grant the role access via
an `Application Role` record (metadata) so the app is reachable, and ensure the
`Candidates` entity is in that app's `Application Entities`:

```jsonc
// metadata/application-roles/.application-roles.json  (entity: "MJ: Application Roles")
[
  {
    "fields": {
      "ApplicationID": "@lookup:MJ: Applications.Name=Recruiting",
      "RoleID":        "@lookup:MJ: Roles.Name=Recruiter",
      "CanAccess":     true,
      "CanAdmin":      false
    }
  }
]
```

### Step 4 — Push

```bash
npx mj sync push --dir=metadata --include="roles,entity-permissions,application-roles"
```

That's the whole scenario, version-controlled. To add another (say `Auditor` with
read on a different entity set), repeat with a new role — invites carry a per-link
`RoleID`, so scenarios coexist.

> **Where this metadata lives:** if `Candidates` is *your client's* entity (not a
> core MJ entity), these permission records belong in **that deployment's**
> metadata, authored once the entity exists — not in the MJ framework repo. The
> framework ships the mechanism, the baseline `External App User` role, and the
> Explorer boot baseline (Step 2a); the **scenario data perms (Step 2) are yours.**

---

## 5. Issuing an invite

Authenticated (internal admin) call:

```http
POST /magic-link/create
Authorization: Bearer <admin session token>
Content-Type: application/json

{
  "email": "recruiter@agency.com",
  "applicationId": "<Recruiting app ID>",
  "roleId": "<Recruiter role ID>",        // omit to use restrictedRoleName default
  "expiresInHours": 72,                    // optional
  "maxUses": 1                             // optional; 1 = single-use
}
```

Response:

```jsonc
{
  "success": true,
  "inviteId": "…",
  "redemptionUrl": "https://api.yourco.com/magic-link/redeem?token=mj_ml_…",
  "rawToken": "mj_ml_…",   // ONLY when no email provider is configured (deliver it yourself)
  "emailSent": true,
  "expiresAt": "2026-06-02T…Z"
}
```

When `communicationProvider` is configured, the link is emailed and `rawToken` is
omitted. Otherwise you get the raw link back to deliver out of band.

---

## 6. Redeeming

Redemption is a **two-step, GET-safe** flow so that link prefetchers and email
security scanners can't burn a single-use token by merely fetching the URL:

1. `GET /magic-link/redeem?token=…` is **side-effect-free** — it returns a small
   interstitial page with a "Continue to sign in" button. No DB write, no token
   minted. (API callers get `405` and must POST.)
2. `POST /magic-link/redeem` (the form submit, or an API client's POST) performs
   the actual redemption: it atomically consumes one use, provisions/links the
   user with the restricted role + single app, and mints an RS256 session JWT.
   For browsers it `302`-redirects into MJExplorer with the token in the URL
   fragment (`#token=…`); API clients add `?format=json` (or `Content-Type:
   application/json`) to get the JWT as JSON.

Single-use is enforced **atomically**: a compare-and-swap `UPDATE` (guarded by
`UseCount < MaxUses AND Status = 'Active' AND ExpiresAt > now`) runs *before* the
token is minted, so two concurrent redemptions of a single-use link race on the
row and exactly one wins (fail-closed). A losing/late redemption is rejected
(`410 Gone`, `errorCode: "consumed"`).

---

## 7. Provisioning behavior

On redemption (`MagicLinkService`):

- **New email** → a new user is created (`Type='User'`, active) with **only** the
  invite's role and **one** `User Application` for the invite's app. The domain
  whitelist (`userHandling.newUserAuthorizedDomains`) is **bypassed** — issuance is
  the gate, not the domain. The user is seeded into `UserCache` so the very next
  request authenticates.
- **Existing email** → the role + app assignment are added idempotently; no
  duplicate user.

---

## 8. Admin: viewing activity

No new mechanism — it's reads over existing data:

- **Invites** — the `MJ: Magic Link Invites` entity records who created each link
  (`CreatedByUserID`), the recipient (`Email`), `UseCount`, `ConsumedAt`, `Status`.
  An admin queries/filters these.
- **What the recruiter did** — enable **`AuditViewRuns`** (and/or record-access
  auditing) on the `Candidates` entity; every recruiter search/view is logged.
  MJ's built-in **Record Changes** captures any mutations.
- A dedicated "magic-link activity" admin dashboard is a reasonable later addition,
  but it's purely a view over the above.

---

## 9. Security model

- **Token is a bearer secret** — only its SHA-256 hash is stored (mirrors API
  keys). The raw token exists only in the link.
- **Single-use + short TTL** — `maxUses` (default 1) and `defaultExpiresInHours`
  bound the link; `sessionTokenTtlHours` bounds the session. No refresh tokens for
  external users.
- **Who may issue invites** — `POST /create` is authorization-gated, not just
  authenticated: the caller must be an **Owner** or a member of a role listed in
  `inviteIssuerRoleNames` (empty ⇒ Owner-only). This stops any authenticated user —
  including an external user already holding a restricted magic-link session — from
  minting invites.
- **Which role an invite may grant** — an invite can only assign the
  `restrictedRoleName` or a role explicitly listed in `grantableRoleNames`. A
  caller-supplied `roleId` outside that set is rejected (`400 invalid_role`). This
  prevents attaching a privileged role (e.g. Owner/Admin) to an external user, even
  for Owner callers — broadening it is an explicit, per-deployment opt-in.
- **The restricted role is the real boundary** — entity permissions are enforced
  server-side. UI confinement is cosmetic.
- **Revocation** — set an invite's `Status` to `Revoked` to kill an unredeemed
  link. To cut off already-issued sessions, rotate the RS256 key (invalidates all
  outstanding magic-link sessions; internal SSO is unaffected).
- **RS256 keypair** — private key in env/secret store, never in the DB or client.

---

## 10. Endpoint & config reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /magic-link/create` | Owner / issuer role | Create + (optionally) email an invite (403 if caller not authorized) |
| `GET /magic-link/redeem?token=…` | Public | Safe interstitial (no side effects); renders "Continue" → POST |
| `POST /magic-link/redeem` | Public | Redeem → consume → provision → mint session JWT |
| `GET /magic-link/jwks.json` | Public | RS256 public key set (used by token validation) |

| `magicLink.*` config | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Master switch (routes + provider) |
| `rsaPrivateKey` | ephemeral | RS256 signing key (PEM, raw or base64) |
| `defaultExpiresInHours` | `72` | Unredeemed-link lifetime |
| `sessionTokenTtlHours` | `8` | Session JWT lifetime |
| `rateLimitWindowMs` | `60000` | Rate-limit window for `/redeem` + `/create` |
| `redeemRateLimitMax` | `20` | Max `/redeem` attempts per IP per window |
| `createRateLimitMax` | `30` | Max `/create` requests per IP per window |
| `restrictedRoleName` | `External App User` | Default role when an invite omits `roleId` |
| `inviteIssuerRoleNames` | `[]` | Roles (besides Owner) allowed to call `/create`. Empty ⇒ Owner-only |
| `grantableRoleNames` | `[]` | Roles (besides the restricted role) an invite may grant |
| `contextUserForProvisioning` | — | User context for provisioning writes |
| `communicationProvider` | — | CommunicationEngine provider for invite email |
| `fromAddress` | — | Invite email From |
| `audience` | `mj-magic-link` | JWT audience + provider audience |

---

## 11. Source map

- `packages/AuthProviders/src/providers/MagicLinkProvider.ts` — token validation provider
- `packages/MJServer/src/auth/magicLink/`
  - `magicLinkCore.ts` — pure helpers (hash, eligibility, claims)
  - `MagicLinkKeys.ts` — RS256 keypair + JWKS + signing
  - `MagicLinkService.ts` — create / redeem / provision / email
  - `MagicLinkRouter.ts` — Express routes + provider registration
- `migrations/v5/V202605291600__v5.39.x__Magic_Link_Invites.sql` — `MagicLinkInvite` table (+ appended CodeGen objects)
- `metadata/roles/` — baseline `External App User` role

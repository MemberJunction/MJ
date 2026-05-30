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
└──────────────┘  3. GET /magic-link/redeem?token=…   ┌──────────────────────────┐
        │ ───────────────────────────────────────────▶│  MJServer                 │
        │                                              │  • validate (single-use, │
        │                                              │    expiry, status)        │
        │  4. minted RS256 session JWT                 │  • provision user w/      │
        │ ◀────────────────────────────────────────── │    restricted role + app  │
        ▼                                              │  • mint JWT (RS256)       │
   scoped session — recruiter sees only the            └──────────────────────────┘
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
> framework ships only the mechanism and the baseline role.

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

`GET /magic-link/redeem?token=…` validates the invite (single-use, expiry, status),
provisions/links the user with the restricted role + single app, marks the invite
consumed, and returns a minted RS256 session JWT.

> **Phase 1 status:** redeem currently returns the token as JSON (testable via
> `curl`). **Phase 2** turns this into a redirect to MJExplorer with the token, plus
> a landing route that stores it and boots the (nav-confined) session.

Single-use is enforced transactionally: `ConsumedAt`/`UseCount` are written in the
same transaction that mints the token. A second redemption of a single-use link is
rejected (`410 Gone`, `errorCode: "consumed"`).

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
| `POST /magic-link/create` | Internal user | Create + (optionally) email an invite |
| `GET /magic-link/redeem?token=…` | Public | Redeem → provision → mint session JWT |
| `GET /magic-link/jwks.json` | Public | RS256 public key set (used by token validation) |

| `magicLink.*` config | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Master switch (routes + provider) |
| `rsaPrivateKey` | ephemeral | RS256 signing key (PEM, raw or base64) |
| `defaultExpiresInHours` | `72` | Unredeemed-link lifetime |
| `sessionTokenTtlHours` | `8` | Session JWT lifetime |
| `restrictedRoleName` | `External App User` | Default role when an invite omits `roleId` |
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

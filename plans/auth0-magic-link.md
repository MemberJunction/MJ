# Magic Link Authentication for External, App-Scoped Users

**Branch:** `feature/auth0-magic-link`
**Status:** Architecture LOCKED — **Option B (MJ-issued)** confirmed 2026-05-29. Resolving remaining scope questions (§10) before phase 1.
**Author:** Pranav (with Claude)
**Date:** 2026-05-29
**Operational guide:** [`guides/MAGIC_LINK_GUIDE.md`](../guides/MAGIC_LINK_GUIDE.md) — how to enable, configure, and define an external-access scenario (this doc is the design rationale; the guide is the how-to).

---

## 1. Problem

We're building a client app on MJ that needs to be shared with **external** users. Today MJ is single-sign-on and internal-only: once you authenticate you can see the whole Explorer; there is no way to expose a slice of the system to the outside world.

We want a **shareable magic link** that:

1. **Passwordless** — recipient clicks an emailed link, no password, no pre-existing MJ account.
2. **App-scoped** — the link grants access to **one** Application, not all of MJ Explorer.
3. **Permission-scoped** — backed by a **restricted role** so access is enforced at the data layer, not just hidden in the nav.
4. **Single-use / expiring** — the link can't be replayed or shared onward indefinitely.
5. **Cost-bounded** — Auth0 only if it stays free; external user volume must not trigger Auth0 MAU billing.

### Locked decisions (from review)

- **Enforcement = restricted Role (real data security).** Nav filtering alone is rejected — external users must be confined at the GraphQL/entity layer, not cosmetically.
- **Deliverable now = this written spec**, reviewed before any implementation.

---

## 2. How MJ auth works today (grounding)

The whole server auth path is **issuer-driven JWT validation** and is provider-agnostic. Adding a new "kind" of login is mostly about producing a JWT that fits this pipeline.

**Validation flow** (`packages/MJServer/src/context.ts` → `getUserPayload`, lines 89–227):

1. Decode JWT, check `exp`.
2. Read `iss` claim → look up provider via `AuthProviderFactory.getByIssuer(iss)`.
3. `verifyAsync()` → `jwt.verify()` using **JWKS** (asymmetric) fetched from the provider's `jwksUri` (`packages/AuthProviders/src/BaseAuthProvider.ts:69`).
4. `extractUserInfoFromPayload()` → provider's `extractUserInfo()` pulls email/name claims.
5. `verifyUserRecord()` (`packages/MJServer/src/auth/index.ts:189`) finds the MJ user by email, or **auto-provisions** if `autoCreateNewUsers` and the email domain matches `newUserAuthorizedDomains`, assigning `newUserRoles` and default app records.

**Provider registration** (`packages/MJServer/src/auth/initializeProviders.ts`): each entry in `configInfo.authProviders[]` is instantiated via `@RegisterClass(BaseAuthProvider, '<type>')` and registered in the factory by issuer. Multiple providers per issuer are supported (audiences aggregated — `auth/index.ts:52`).

**Unauthenticated routes** (`packages/MJServer/src/index.ts:782–800`): the OAuth callback router is mounted **before** `createUnifiedAuthMiddleware`, which is the supported extension point for public endpoints. The existing handler mounts an unauthenticated `callbackRouter` and an authenticated `authenticatedRouter` at `/oauth`.

**Key consequence:** any token whose `iss` resolves to a registered provider and which validates against that provider's JWKS **just works** end-to-end — `verifyUserRecord`, GraphQL context, per-request providers, roles, the lot. The cleanest integration for a custom magic link is therefore *"MJ mints an RS256 JWT and publishes a JWKS endpoint; register MJ itself as a provider."*

### Reusable infrastructure already in the repo (from MCP-OAuth work, tag `601-mcp-oauth`)

| Need | Existing asset | File |
|---|---|---|
| Mint JWTs server-side | `JWTIssuer` (currently HS256 — would extend to RS256) | `packages/AI/MCPServer/src/auth/JWTIssuer.ts` |
| Single-use code / short-lived state store | `AuthorizationStateManager` (TTL, single-use auth codes, PKCE) | `packages/AI/MCPServer/src/auth/OAuthProxyRouter.ts` |
| Hashed-secret store + validate | `APIKeyEngine` (SHA-256 hash, prefix `mj_sk_`, raw never persisted) | `packages/APIKeys/Engine/src/APIKeyEngine.ts` |
| Send the email | `CommunicationEngine.Instance.SendSingleMessage()` | `packages/Communication/engine/src/Engine.ts` |
| Public route mounting | OAuth router mounted pre-auth-middleware | `packages/MJServer/src/index.ts:782` |

---

## 3. Architecture decision: who issues the token?

This is **the** decision; everything downstream depends on it.

### Option A — Auth0-issued (lean on Auth0 passwordless)

Auth0 Passwordless "Email Magic Link" connection sends the email and issues a standard OIDC JWT; MJ validates it with the **existing** `Auth0Provider` (zero provider code). App/role scope rides in a **custom claim** injected by an Auth0 Action (from invite `app_metadata`), or via one Auth0 application per shared app.

- ➕ Minimal MJ code. Auth0 owns email delivery + OTP single-use + security hardening.
- ➕ Matches the original "via Auth0" framing.
- ➖ **Cost: external users are Auth0 MAU.** A public-facing app can blow past the free tier; this directly hits the stated cost gate.
- ➖ App-scope plumbing lives in Auth0 (Actions, app_metadata) — less auditable from MJ, harder to revoke per-link.
- ➖ Auth0 passwordless email-link may require a paid tier / has its own config friction.

### Option B — MJ-issued (custom provider) — *recommended, and what you floated*

MJ generates an invite (scope = app + role + email + expiry + single-use), emails the link itself, and on redemption: validates the invite, **marks it consumed**, provisions/links the user, and **mints an RS256 JWT**. MJ publishes a JWKS endpoint and registers itself as an auth provider, so the existing validation path accepts the token with **no changes to `context.ts`**.

- ➕ **No Auth0 dependency for magic links → no external MAU cost.** Clears the cost gate outright.
- ➕ Invite + scope are first-class MJ records: auditable, revocable, single-use by construction.
- ➕ Reuses `JWTIssuer`, `AuthorizationStateManager`, `APIKeyEngine` hashing, `CommunicationEngine` — most of the hard parts exist.
- ➕ "Rest of our stuff just works" — exactly your stated goal — once MJ is a registered RS256/JWKS provider.
- ➖ MJ becomes a **token issuer**: must manage an RS256 keypair and get signing/expiry/replay right. (Mitigated by reusing `JWTIssuer` + standard `jsonwebtoken`.)
- ➖ More code than Option A. Email deliverability is now our concern (but `CommunicationEngine` already handles it).
- ➖ Departs from the literal "via Auth0" framing — **Option B does not use Auth0 for the magic link at all.**

### Recommendation

**Option B.** The cost gate (external users = Auth0 MAU) and your requirement for true single-use, app-scoped, revocable links point squarely at MJ issuing the token. The MCP-OAuth groundwork means we're extending proven code, not greenfielding a token service. Auth0 stays the SSO for *internal* users; magic links are an MJ-native, separate path.

> **Open question O1 (blocking):** Confirm Option B, or require Auth0 in the loop (Option A / a hybrid where Auth0 proves email ownership and MJ then mints the scoped token). The rest of this spec assumes **B**; if A is chosen, §4–§7 change materially.

---

## 4. Option B — component design

```
┌─────────────┐   1. create invite (app, role, email, ttl)   ┌──────────────────┐
│ Admin / app │ ───────────────────────────────────────────► │  MJServer         │
│  (internal) │                                               │  /magic-link/...  │
└─────────────┘                                               │                   │
                                                              │  • MagicLinkInvite│
   2. email w/ link  ◄──────── CommunicationEngine ────────── │    entity (hashed)│
                                                              │  • JWTIssuer (RS256)
┌─────────────┐   3. GET /magic-link/redeem?token=…           │  • JWKS endpoint  │
│  External   │ ───────────────────────────────────────────► │                   │
│  recipient  │   4. validate+consume → mint JWT → redirect   └──────────────────┘
└─────────────┘        to Explorer w/ token in fragment
        │
        │ 5. Explorer stores token, initializes GraphQL exactly like any provider
        ▼
   App-scoped session (restricted role enforced at entity layer)
```

### 4.1 New/changed pieces

1. **`MagicLinkProvider`** (`packages/AuthProviders/src/providers/MagicLinkProvider.ts`)
   - `@RegisterClass(BaseAuthProvider, 'magic-link')`.
   - `issuer` = MJ public URL (e.g. `https://api.example.com/`), `jwksUri` = MJ's JWKS endpoint.
   - `extractUserInfo()` reads `email`, `given_name`/`family_name`, and the custom scope claims.

2. **RS256 keypair + JWKS endpoint**
   - Extend `JWTIssuer` to support RS256 (it's HS256 today). Keypair from config/secret store.
   - New public route `GET /.well-known/jwks.json` (or under `/magic-link/`) exposing the public key. Mounted **before** the auth middleware.

3. **Invite store** — new entity **`MJ: Magic Link Invites`** (see §5). Token is stored **hashed** (SHA-256, prefix e.g. `mj_ml_`), raw token only in the emailed URL — mirrors `APIKeyEngine`. Fields: target `ApplicationID`, `RoleID`, recipient email, `ExpiresAt`, `ConsumedAt`, `CreatedByUserID`, optional `MaxUses`/`UseCount`.

4. **Endpoints** (unauthenticated router mounted pre-middleware, e.g. `MagicLinkRouter.ts`):
   - `POST /magic-link/create` *(authenticated — internal admin only)*: create invite, send email. Body: `{ email, applicationId, roleId, expiresInHours }`.
   - `GET /magic-link/redeem?token=…` *(public)*: hash token → look up invite → validate (not expired, not consumed) → provision/link user → mark consumed → mint JWT → redirect to Explorer with token.
   - `GET /.well-known/jwks.json` *(public)*: JWKS.

5. **Provisioning** — at **redemption** (not lazily in `verifyUserRecord`): find-or-create the MJ user by the invite's email, assign **only** the invite's `RoleID`, create a single `MJ: User Applications` record for the invite's `ApplicationID`. This keeps the hot validation path untouched and the domain-whitelist logic in `verifyUserRecord` bypassed for this path. A dedicated context user (config) owns the writes.

6. **Restricted role** — a seeded role (e.g. `External App User`) whose **Entity Permissions** grant read (and only the needed CRUD) on exactly the entities the shared app exposes. This is the actual security boundary. Seeded via metadata files (not SQL inserts), per repo convention.

7. **Explorer UI confinement** (`packages/Angular/Explorer/base-application/src/lib/application-manager.ts` already filters nav by `User Applications`). Additional: detect magic-link sessions (claim) and hide the app switcher / global nav so a single-app user can't navigate to chrome they have no data for. Cosmetic layer **on top of** the role enforcement.

### 4.2 JWT claims (minted on redemption)

```jsonc
{
  "iss": "https://api.example.com/",      // MJ public URL → resolves to MagicLinkProvider
  "aud": "mj-magic-link",                 // configured audience
  "sub": "magic-link|<inviteId>",
  "email": "external.user@client.com",
  "given_name": "...", "family_name": "...",
  "mj_app_id": "<ApplicationID>",         // custom claim: scope
  "mj_role": "External App User",         // custom claim: restricted role
  "mj_magic_link": true,                  // marks session for UI confinement
  "exp": 1234567890                        // short-ish session (see O3)
}
```

---

## 5. Data model (migration)

New table **`MagicLinkInvite`** in the MJ core schema. Business columns only — CodeGen adds `__mj_*` timestamps + FK indexes (per `migrations/CLAUDE.md`).

| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | `NEWSEQUENTIALID()` default |
| `TokenHash` | nvarchar(128) | SHA-256 hex of raw token; unique index |
| `Email` | nvarchar(255) | recipient |
| `ApplicationID` | uniqueidentifier FK → Application | scope |
| `RoleID` | uniqueidentifier FK → Role | restricted role |
| `ExpiresAt` | datetimeoffset | hard expiry |
| `ConsumedAt` | datetimeoffset NULL | set on first redeem (single-use) |
| `MaxUses` | int default 1 | allow N-use links if needed |
| `UseCount` | int default 0 | |
| `CreatedByUserID` | uniqueidentifier FK → User | audit |
| `Status` | nvarchar(20) | `Active` / `Consumed` / `Revoked` / `Expired` (computed/maintained) |

- Consolidate into a single `ALTER`/`CREATE`; add `sp_addextendedproperty` for every column.
- Seed the **`External App User`** role + its Entity Permissions and the request-type/lookup data via **metadata files** (`/metadata/...`), not migration INSERTs.
- Migration goes in the highest `migrations/v*/` folder; timestamp re-stamped at merge time per repo rules.
- **Do not** write any TS against new columns until the migration runs + CodeGen regenerates entity types (no `.Get()`/`.Set()` stand-ins).

---

## 6. Config

New `authProviders[]` entry (client + server) for the self-issued provider, plus a `magicLink` section:

```javascript
// mj.config.cjs
authProviders: [
  // ...existing auth0/msal...
  {
    name: 'magic-link',
    type: 'magic-link',
    issuer: process.env.MJ_PUBLIC_URL,           // e.g. https://api.example.com/
    audience: 'mj-magic-link',
    jwksUri: `${process.env.MJ_PUBLIC_URL}/.well-known/jwks.json`,
  },
],
magicLink: {
  enabled: true,
  rsaPrivateKey: process.env.MJ_MAGIC_LINK_PRIVATE_KEY,  // PEM; public half served via JWKS
  defaultExpiresInHours: 72,
  sessionTokenTtlHours: 8,
  restrictedRoleName: 'External App User',
  contextUserForProvisioning: 'system@company.com',
  communicationProvider: 'SendGrid',                     // CommunicationEngine provider name
  emailTemplate: 'magic-link-invite',
}
```

(Keep it simple — one config block, env for secrets. No auto-detection plumbing.)

---

## 7. Security considerations

- **Token = bearer secret.** Store only the SHA-256 hash; raw token lives only in the email URL. Constant-time compare on lookup (hash equality is fine).
- **Single-use enforced transactionally** — `ConsumedAt`/`UseCount` updated in the same tx that mints the JWT; reject if already consumed/expired/revoked.
- **Short link TTL** (hours-days) **and** short session-token TTL — a leaked session JWT expires fast; no refresh tokens for external users.
- **Restricted role is the real boundary** — verify the role's Entity Permissions actually scope to the app's entities and nothing else (write a test that asserts the role can't read sensitive core entities).
- **RS256 keypair** — private key in env/secret store, never in DB or client. Rotating the key invalidates outstanding sessions (acceptable).
- **No auto-provision via domain whitelist on this path** — provisioning is explicit per invite, so we don't accidentally widen the `newUserAuthorizedDomains` door.
- **Rate-limit** `/magic-link/redeem` and `/create`.
- **Revocation** — `Status = Revoked` kills an unconsumed link; revoking an active session requires key rotation or a deny-list (decide in O4).

---

## 8. Testing

- Unit: invite hash/validate (mirror `APIKeyEngine` tests); JWT mint/verify round-trip against the JWKS; expiry + single-use rejection paths.
- Unit: `MagicLinkProvider.extractUserInfo()` claim mapping.
- Integration: redeem → provision → GraphQL call succeeds **only** for the scoped app's entities; a cross-app/cross-entity query is **denied** (the security assertion that matters).
- Vitest, `src/__tests__`, no live DB — mock the data layer.

---

## 9. Implementation phases (architecture signed off; building)

**Phase 1 — server mechanism, verified end-to-end (priority):**

1. **Migration + metadata seed** — `MagicLinkInvite` table, `External App User` role + entity permissions. Run migrate + CodeGen. *(Requires a database — see note below.)*
   - ✅ **Authored (DB-independent):** `migrations/v5/V202605291600__v5.38.x__Magic_Link_Invites.sql` (table), `metadata/roles/.mj-sync.json` + `metadata/roles/.roles.json` (deny-all `External App User` role, pull-scoped via `filter`).
   - ⏳ **Pending DB:** run flyway migrate + CodeGen to generate the `MagicLinkInvite` entity types; `mj sync push --include=roles` to seed the role; attach **app-specific Entity Permissions** to the role (deploy-time, target app's entities — not seeded generically). Migration timestamp to be re-stamped against `next` at merge.
2. ✅ **Server core** — built & compiling:
   - `packages/AuthProviders/src/providers/MagicLinkProvider.ts` — `@RegisterClass(BaseAuthProvider,'magic-link')`, registered in `AuthProviderFactory` + exported.
   - `packages/MJServer/src/auth/magicLink/`:
     - `magicLinkCore.ts` — pure core (token gen, SHA-256 hash, `evaluateInvite`, `buildSessionClaims`).
     - `MagicLinkKeys.ts` — `MagicLinkKeyManager` (BaseSingleton): RS256 keypair (configured PEM or ephemeral), `Sign()`, `GetJWKS()`, stable `kid`.
     - `MagicLinkService.ts` — imperative shell: `createInvite` (hash+persist+email), `redeemInvite` (validate→provision→consume→mint), find-or-create provisioning with restricted role + single app, `CommunicationEngine` email.
     - `MagicLinkRouter.ts` — public router (`/magic-link/redeem`, `/magic-link/jwks.json`) + authenticated router (`/magic-link/create`); `registerMagicLinkAuthProvider()` (auto-registers issuer=publicUrl, jwksUri, audience).
3. ✅ **Config + provider registration** — `magicLink` config section in `MJServer/src/config.ts`; routers mounted in `MJServer/src/index.ts` (public before auth middleware, authenticated after); auth provider auto-registered when `magicLink.enabled`.
4. ✅ **Tests** — `MJServer/src/__tests__/magicLink.test.ts` (14 tests pass): token hashing, invite eligibility (all branches), claim scoping, RS256 mint→JWKS verify round-trip + kid match + tamper rejection.
5. ✅ **Verified live** (2026-05-30) against MJAPI on :4051 with the `MJ_MagicLink` DB:
   - create (system API key) → 200, returns redemption link
   - redeem → 200, provisions `recruiter@agency.com`, mints RS256 JWT (correct `mj_app_id`/`mj_role`/`mj_magic_link` claims)
   - **single-use**: second redeem → 410 `consumed`
   - **auth works**: GraphQL with the minted JWT → 200 (token validates via JWKS, provisioned user resolves); bogus token → 401
   - **DB scoping confirmed**: user has exactly the `External App User` role + the one `Admin` app; invite `Consumed` 1/1
   - ✅ **Scoped-read + cross-entity denial proven** (2026-05-30): granted `External App User` read on `MJ: AI Models` via metadata (`metadata/entity-permissions/`). Recruiter session then: `AllMJAIModels` → 200, 167 rows; `AllMJUsers` / `AllMJApplications` → `"User recruiter@agency.com does not have read permissions on MJ: <Entity>"`. The §8 denial assertion holds — the restricted role is the enforced boundary at the GraphQL/entity layer.

**Phase 2 — end-user "Share" experience (follow-up, same branch):**

6. **Explorer** — magic-link session detection + nav/app-switcher confinement; redemption landing route stores token and boots GraphQL.
7. **In-app Share UI** — dialog inside the shared app that calls `POST /magic-link/create`.

> **DB dependency:** Phase 1 step 1 needs a live database to run the migration + CodeGen, and the strong "no `.Get()`/`.Set()`, wait for CodeGen" rule means TS against the new `MagicLinkInvite` entity can't be written until types are generated. This worktree has **no dedicated DB container** (the `mj-parallel` provisioner was blocked by policy). We either point at an existing dev DB or stand one up before step 1's CodeGen. Migration/metadata **files** can be authored without a DB; only running them needs one.

---

## 10. Open questions (need answers before phase 1)

All resolved 2026-05-29:

- **O1 (RESOLVED):** ✅ **Option B (MJ-issued)** locked in. Auth0 stays internal SSO; magic links are MJ-native.
- **O2 (RESOLVED):** ✅ **Both, phased.** Build the server endpoint + provisioning + token path first and verify end-to-end, then add the in-app "Share" UI as a follow-up phase in the same branch.
- **O3 (RESOLVED — default):** Single short-lived session JWT (`sessionTokenTtlHours`, ~8h); recipient re-redeems the link to return. **No refresh tokens** for external users.
- **O4 (RESOLVED — default):** v1 revocation = set invite `Status = Revoked` (kills unconsumed links) + rely on short session TTL. RS256 **key rotation** is the nuclear option for already-issued sessions. No per-session deny-list in v1.
- **O5 (RESOLVED — default):** Seed **one** `External App User` role for v1; schema keeps per-link `RoleID` so multiple roles can be added later without migration.
- **O6 (RESOLVED):** Plug into MJ's existing **email provider system** (`CommunicationEngine`) — provider name + template are config-driven (`magicLink.communicationProvider` / `magicLink.emailTemplate`), so delivery is swappable and does not block the auth mechanism.

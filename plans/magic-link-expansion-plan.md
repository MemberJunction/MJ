# Magic Link — Expansion & Hardening Plan

> **Status:** Design doc for review (no code yet). Posted so AN-BC / rkihm-BC / cadam11 can review on the branch.
> **Source PR:** [#2726](https://github.com/MemberJunction/MJ/pull/2726) — *feat(auth): MJ-issued magic-link sessions for external, app-scoped users*

---

## Context

PR #2726 shipped a working MJ-issued magic-link feature: MJ signs its own RS256 session JWT, publishes JWKS, registers itself as a `magic-link` auth provider, and drops an external user into a single MJExplorer app on a per-link role. Review (Amith, Robert, Craig) converged on two things:

1. **Hardening** the existing implementation (Craig's four inline code comments; a provisioning-safety gap Pranav flagged himself).
2. **Expanding** the mechanism into adjacent use cases that "keep coming up": Google-Docs-style resource sharing, truly anonymous links, embeddable IFRAMEs (e.g. a Skip report), authorized-domain restriction, vendor-tier gating, and **auditing** — both per-link redemption history and session/login auditing across all of MJ.

Amith's ask (2026-06-03): one consolidated plan that addresses **every** item, with particular attention to the **audit/logging** design and how the **anonymous user** and **URL scoping** will work. Reviewers review the plan, then we build.

This doc is the single source of truth for that. It maps each comment to a disposition, lays out the design decisions for the hard parts, and sequences the work into dependency-ordered phases. The intended cut line: **Phase 1 is the mergeable hardening core for #2726**; the rest stack as follow-on PRs.

---

## Revision — Craig's direction (2026-06-05)

cadam11 answered the v1 Open Questions. Three points change the design's *shape* (not its mechanics); recorded here so the rest of the doc reads in their light.

**1. The scope union is the feature, not a bug to prevent.** v1 Open Question 1 asked "how do we avoid the role-union problem." That framing is wrong. A visitor who clicks two shared links *should* hold the union of what both links granted — "I only ever have what two people explicitly handed me." That's correct capability semantics. The thing to avoid is never the union itself; it's **storing the union as roles on a shared identity**, because then every anon visitor accretes onto the same user and you get the superuser problem. Keep scope **per-session / claims-based** and accretion is structurally impossible. So the anon model is a **shadow `User` table** — rows that aren't real users, just anon sessions — each session unioning the scopes granted by the links it has redeemed, carried as claims. (This generalizes §B below; §B was already claims-based, but framed the union defensively. It's a designed behavior.)

**2. `(Application, Role)` is too broad to be the primary scoping unit.** A role "drags along way more than the one thing you actually meant to share." The intended unit of sharing is a **single FE route plus its supporting resources**:

```
[link] ---< [one UI view / FE route] ---< [N supporting resources]
```

The v1 plan kept `(app, role)` as the Phase 1/2 core and parked resource/route scoping in Phase 5 as an *addition*. That under-commits. Resource/route scope is the **intended** model; the role path is the coarse/legacy one that ships first only because it already works. The genuinely unsettled design problem — the one the bot dodged by falling back to `(app, role)` — is **how a "route + dependent resources" capability maps onto MJ's existing RBAC** (see rewritten Open Question 1). That mapping is the gate on the resource-scoping phase, not an implementation detail of it.

**3. Default to short, re-mintable session tokens for revocability (Open Question 4).** Treat links as revocable shares, not durable permalinks: re-mint a short session JWT per load rather than issue one long-lived token you can't pull back. v1 already composes this way (§H/§D) but defaulted re-minting only for embed. Broaden it — re-minting on each load is the **default** for any share you'd want to revoke; long-lived tokens are the exception that a scenario opts into.

Q2 (vendor/tier model) and Q3 (audit PII/retention) were not addressed and remain open.

---

## Feedback traceability matrix

Every comment on the PR, its disposition, and the phase that addresses it.

| # | Source | Item | Disposition | Phase |
|---|--------|------|-------------|-------|
| 1 | cadam11 (core:22) | Token hash uses hex; base64url smaller / binary avoids strings | Switch hash storage to base64url | 1 |
| 2 | cadam11 (core:123) | `buildConsumeInviteSQL` trusts `qualifiedTable` — injection surface | Derive table from `EntityInfo` internally + assert `^\[\w+\]\.\[\w+\]$` whitelist | 1 |
| 3 | cadam11 (core:147) | Include inviter's ID as a custom claim | Add `mj_invited_by` claim | 1 |
| 4 | cadam11 (Service:486) | Inviter removed before send → invite still valid (Owner fallback) | Fail-closed: invalid if `CreatedByUserID` is not an active user at redeem | 1 |
| 5 | Pranav (self) | No provisioning guard — mistyped email bolts external role onto a real/internal user | Provisioning guard: block (or loud-warn) on Owner / users holding real roles | 1 |
| 6 | AN-BC | Server-side row filtering of User Roles / User Applications reads ("thought we did this already") | Define RLS filters scoping the 3 reads to the current user's own rows (framework-native) | 1 |
| 7 | AN-BC | Are we tracking the email the link went to / sending it? | Already true (Email persisted on invite, becomes provisioned user) — no work | — |
| 8 | AN-BC, rkihm-BC | Audit **magic-link** uses: timestamp, IP, browser, outcome | Dedicated `MJ: Magic Link Redemptions` child table | 1 |
| 9 | AN-BC, rkihm-BC | Audit **all** session/logins across MJ | Hook token-validation middleware → existing `MJ: Audit Logs` | 3 |
| 10 | rkihm-BC | Multiple Applications / Roles per link (even if one-of-each used to start) | Widen schema to child tables now; keep one-of-each flow until multi-enforcement is designed | 2 |
| 11 | AN-BC, Pranav | Shared **Anonymous** user for truly-anon links (don't mint per-email users) | Seed one Anonymous system user; anon links enforce via JWT claims, not DB roles | 4 |
| 12 | AN-BC | Scope a link to a particular **URL / set of URLs** (validated after base URL) | Resource/path scope on the link → JWT claims; UX confinement in Explorer, security at server perms | 5 |
| 13 | AN-BC ↔ rkihm-BC | **Transitive** access: sharing a component shares the right to run its views/queries | Session carries component identity; downstream data runs under the link's granted scope at runtime (no static perm list) | 5 |
| 14 | AN-BC, rkihm-BC | Anonymous **embed** links (Skip report in IFRAME, "get embed code"); may be long-lived | Embed render mode + per-link domain allow-list + CSP `frame-ancestors` + Origin/Referer checks | 6 |
| 15 | rkihm-BC | Authorized **domains/URLs** for embedding — user-level control | Per-link `AllowedDomains` enforced via CSP + header checks | 6 |
| 16 | rkihm-BC | **Vendor/tier** gating — embed only at certain Application-Vendor tiers (e.g. Skip) | Issuance-time capability gate at `/create`; invite *kinds*; licensing stays **out** of the token | 7 |
| 17 | AN-BC / rkihm-BC | JWT lifetime: indefinite vs window vs one-shot | Already composable (`ExpiresAt` + `MaxUses` + `sessionTokenTtlHours`); document per-scenario defaults | (doc) |
| 18 | Pranav (self) | Nothing ever writes `Status='Expired'`; expired-unconsumed reads `Active` | Compute *effective* status (expiry is timestamp-driven); document; admin views must not filter on `Status` alone | 1 |

---

## Current architecture (recap + file map)

Pure core / imperative shell split, fully gated behind `magicLink.enabled`.

| Concern | File | Notes |
|---|---|---|
| Token hash, consume SQL, claim builder, authz helpers | `packages/MJServer/src/auth/magicLink/magicLinkCore.ts` | `hashToken` (SHA-256 hex, :21), `buildConsumeInviteSQL` (:120), `buildSessionClaims` (:134) |
| Invite create / redeem / provisioning | `packages/MJServer/src/auth/magicLink/MagicLinkService.ts` | `CreateInvite` (:70), `RedeemInvite` (:167), `provisionUser` (:283), inviter fallback (:486) |
| RS256 keypair + JWKS | `packages/MJServer/src/auth/magicLink/MagicLinkKeys.ts` | |
| Express routes, rate limits, fragment redirect | `packages/MJServer/src/auth/magicLink/MagicLinkRouter.ts` | GET `/redeem` interstitial (:102), POST `/redeem` (:121), POST `/create` (:140) |
| Server auth provider | `packages/AuthProviders/src/providers/MagicLinkProvider.ts` | `@RegisterClass(BaseAuthProvider,'magic-link')` |
| Client provider | `packages/Angular/Explorer/auth-services/src/lib/providers/mjexplorer-magic-link-provider.service.ts` | reads `#token=`, `GetSessionScope()` (:147) |
| App-lock guard | `packages/Angular/Explorer/explorer-core/src/lib/guards/app-lock-guard.service.ts` | confines to `restrictedToApplicationId` (:22) |
| Config schema | `packages/MJServer/src/config.ts` | `magicLink` block (:224) |
| Migration / entity | `migrations/v5/V202605311600__v5.39.x__Magic_Link_Invites.sql` | `MagicLinkInvite` table; entity `MJ: Magic Link Invites`; subclass `MJMagicLinkInviteEntity` |
| Request context (IP/UA/Origin) | `packages/MJServer/src/context.ts` | `extractAuthInputs` (:233), `getUserPayload` (:89), `createUnifiedAuthMiddleware` (:276) |

**Existing framework facilities we will reuse (not reinvent):**

- **Row-level security** — `RowLevelSecurityFilterInfo` (`packages/MJCore/src/generic/securityInfo.ts:284`), per-permission RLS getters on `EntityInfo` (`entityInfo.ts:334`), `GetUserRowLevelSecurityWhereClause` (`entityInfo.ts:2134`), enforced in `GenericDatabaseProvider.InternalRunView` (`:1534`), with built-in exemption (`UserExemptFromRowLevelSecurity`). FilterText supports `{{UserID}}`-style tokens. **This is the clean fix for item #6.**
- **Audit entities** — `MJ: Audit Logs` (`MJAuditLog`) + `MJ: Audit Log Types` (`MJAuditLogType`) already exist. **This is the home for item #9.**
- **System user** — hard-coded `SYSTEM_USER_ID` in `packages/SQLServerDataProvider/src/UserCache.ts`; `getSystemUser` in `packages/MJServer/src/auth/index.ts:175`. Pattern to mirror for the seeded **Anonymous** user (item #11).
- **Resource rendering** — `ArtifactResource` → `<mj-artifact-viewer-panel>` (`packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/artifact-resource.component.ts:15`) is the rendering primitive an embed mode wraps (item #14).
- **Gap:** No helmet / CSP / `frame-ancestors` / Origin validation anywhere today. CORS uses default `cors()` (`packages/MJServer/src/index.ts:~820`). Embed work (Phase 6) introduces these.

---

## Design decisions (the hard parts)

### A. Audit & logging — two tiers, two homes

Amith asked for both per-link audit and MJ-wide login audit. They are different sizes, so two mechanisms:

**A1 — Magic-link redemption audit (Phase 1).** A dedicated child table pins the per-redemption shape and gives Skip-style sharing a clean history. Today we keep only `UseCount` + last `ConsumedAt` — no per-use history, no IP/UA.

New entity **`MJ: Magic Link Redemptions`** (`MagicLinkRedemption`), one row per redemption *attempt*:

| Column | Type | Notes |
|---|---|---|
| `InviteID` | FK → MagicLinkInvite | |
| `AttemptedAt` | DATETIMEOFFSET | |
| `Outcome` | NVARCHAR(30) | `success` + the existing `RedeemErrorCode` union (`not_found`, `expired`, `consumed`, `revoked`, `invalid`, `provisioning_failed`, `server_error`) |
| `IPAddress` | NVARCHAR(64) | from `extractAuthInputs` |
| `UserAgent` | NVARCHAR(512) | |
| `Origin` | NVARCHAR(512) | nullable; for embed/domain forensics |
| `ProvisionedUserID` | FK → User | nullable (null on failure / anon) |

The redeem path already holds the request, so this is a clean add in `RedeemInvite` (write before returning, on both success and failure). Logged failures are how we'd notice a token being scanned/brute-forced.

**A2 — General session/login audit (Phase 3).** Reuse `MJ: Audit Logs`. Seed `MJ: Audit Log Types` rows (`Session Established`, `Login Failed`). MJ providers are token-validation-only (login happens at the IdP), so the cross-cutting hook is **token validation**, not a login endpoint — one hook in `context.ts` (`getUserPayload` / `createUnifiedAuthMiddleware`) covers **every** provider (Auth0, MSAL, magic-link, …).

Perf guard: do **not** write a row per request. Log only on **session establishment** — keyed by a first-seen cache of `(sub, iat)` so a token logs once per session, not on every call. For magic-link, redemption *is* the login, so A1 already records it; A2 captures the other providers and any token first-seen on the API. The A1 table is the prototype for the A2 column set.

### B. Anonymous identity model (Phase 4)

Today `Email` is `NOT NULL` and **is** the identity; redemption provisions/links a per-email user and enforcement rides on that user's DB roles. That breaks for truly-anon links.

- Seed **one** shared `Anonymous` *principal* (fixed UUID, `Type='User'`, `IsActive`), mirroring the system-user pattern in `UserCache`. This is a **shadow user** — an attribution anchor for rows/audit, **not** a permission holder. No scope ever attaches to its role set.
- Add an invite **`IdentityMode`**: `email` (existing behavior) | `anonymous` (all redemptions resolve to the shared Anonymous principal; `Email` optional).
- **The scope union is a designed behavior, not a hazard** (Craig, 2026-06-05). A visitor who redeems two anon links holds the union of both links' scopes — that's correct capability semantics. The only failure mode is representing that union as *roles on the shared Anonymous user*, which would turn it into a superuser for every visitor at once. So anon enforcement is **claims-based and per-session**: each session's JWT carries the union of scopes (resource/app/capability) granted by the links *that session* has redeemed, and a server-side guard validates against the *claims*, not the user's role set. Accretion across visitors is then structurally impossible — there is no shared mutable role set to accrete onto. The email mode keeps the existing role-based path. Two paths, explicitly.
- **Open mechanics (Phase 4 design):** how a session accumulates scope across multiple redemptions — re-mint a fresh JWT carrying the widened claim union on each new redemption (server reads prior session's claims, adds the new link's scope, re-mints). The session token, not any DB row, is the carrier of the union. This is why short re-mintable tokens (Revision §3) and the anon model fit together.

### C. URL / resource scoping (Phase 5) — *the intended sharing model, per Craig*

Per the Revision above, this is not a bolt-on to `(app, role)` — it **is** the sharing unit MJ is actually trying to ship: one link → one FE route → the N resources that route depends on. The role path is the coarse fallback. The hard part isn't storing the scope; it's mapping a "route + dependent resources" capability onto MJ's RBAC (Open Question 1).

Add a scope dimension beyond `(Application, Role)`:

- Invite gains optional **`ResourceType` + `ResourceID`** and/or a **path allow-list** (paths *after* the Explorer base URL).
- Carried as JWT claims: `mj_resource_type`, `mj_resource_id`, `mj_allowed_paths`.
- **Two enforcement layers, stated honestly:**
  - *Path allow-list in Explorer* = **UX confinement only** (same family as nav-hiding). Extend `SessionScope` (`auth-types.ts`) + `AppLockGuardService` (`app-lock-guard.service.ts:22`) to block navigation beyond the allowed resource/paths. Do **not** sell this as security.
  - *Real boundary* = **server-side** entity/resource permissions. Role links enforce via role perms + RLS; anon/resource links enforce via the claims-based resource guard (B). The data a resource pulls runs under the link's granted scope.
- **Transitive access (#13):** can't enumerate a component's dependency graph up front, so there's no static permission list. The session carries the component's identity and **its data access runs under the link's granted scope at runtime** — sharing the component shares the right to run the views/queries inside it, bounded by the scope claims.

### D. Embed / IFRAME + domain allow-list + CSP (Phase 6)

- Per-link **`AllowedDomains`** (child table) — where the link may be framed.
- Server: introduce **CSP `frame-ancestors`** (currently nothing sets it — add `helmet` or set the header directly near CORS in `packages/MJServer/src/index.ts`) scoped to the link's allowed domains on embed responses, plus **Origin/Referer validation** (Origin already extracted at `context.ts:242`).
- Explorer: a **chrome-less embed render mode** — a lightweight route/component that renders one resource without the shell/tab system, wrapping the existing `ArtifactResource` / resource primitives.
- **"Get embed code"** UI emits `<iframe src="${explorerUrl}/embed/<resourceType>/<id>#token=…">`.
- Long-lived embeds use unlimited/high `MaxUses` + far-future `ExpiresAt`, re-minting a short session JWT on each load — the knobs already compose this way; only the per-scenario *defaults* differ.

### E. Multi-application / role schema (Phase 2)

Robert: widen now to dodge a breaking migration later; the feature isn't published yet, so we can restructure cleanly (Publish-No-Break policy applies only prospectively from published versions).

- Replace single `ApplicationID` / `RoleID` on `MagicLinkInvite` with child tables **`MagicLinkInviteApplication`** and **`MagicLinkInviteRole`**.
- **Keep create/redeem one-of-each** for now. Pranav's caution: the more one link grants, the more the additive-provisioning union problem bites, so we widen the *schema* but defer multi-scope *enforcement* semantics until designed (see Open Questions).

### F. Provisioning guard (Phase 1)

In `provisionUser` / `ensureRoleAndApp` (`MagicLinkService.ts:283–409`), before bolting an external role/app onto an **existing** user: inspect `Type` and existing roles. Config `provisioningGuard: 'block' | 'warn'` (default **block** for `Owner` and for any user already holding non-restricted ("real") roles). At minimum, log loudly. Prevents one mistyped email from handing a colleague an external role.

### G. Vendor / tier gating (Phase 7) — *included per direction; flag for reviewer input*

Robert: embed should be a feature gated to certain Application-Vendor tiers (Skip's external-embed feature). Pranav's constraint: keep **licensing out of the auth token** — enforce at issuance.

Design (resolved per Open Question 2):
- Introduce an invite **`Kind`**: `app-session` | `resource-share` | `anonymous-embed`. Kind drives which scope columns/claims are valid and which capability gate applies.
- **Instance-level** gate: config `allowedInviteKinds` — a deployment opts into embed at all.
- **Pluggable capability resolver** at **`/create`** (issuance time, not in the token): an injectable `IInviteCapabilityProvider.canIssue(kind, application, issuingUser)` resolved via `@RegisterClass`. `/create` refuses to mint a gated `Kind` unless the resolver admits it.
- **No new licensing entity.** MJ stays tier-agnostic. The **default** resolver reads a coarse `Application`-scoped setting (e.g. `ExternalEmbedEnabled` via the existing settings mechanism — not a new column/table), giving no-vendor instances a no-code toggle. Vendors (Skip) register their **own** resolver against their tier model; MJ never learns what a "tier" is. Keeps auth and licensing decoupled (Craig's constraint).

### H. JWT lifetime (documentation only)

Already composable, no code: `ExpiresAt` (link validity) + `MaxUses` (consumption budget) + `sessionTokenTtlHours` (session length). Both clocks are re-checked atomically on every redeem (`WHERE Status='Active' AND UseCount<MaxUses AND ExpiresAt>SYSUTCDATETIME()`). Per-scenario defaults: recruiter one-shot = `maxUses=1` + 8h session; embed = high/∞ `maxUses` + far-future `ExpiresAt` + short re-minted session.

---

## Phased implementation plan (dependency-ordered, no time estimates)

**Phase 1 — Hardening, attribution, redemption audit, server-side row filtering** *(mergeable into #2726)*
- Items 1–6, 8, 18. Craig's four fixes; provisioning guard; RLS filters on User Roles / User Applications / Application Roles; `MJ: Magic Link Redemptions` table + write path; effective-status documentation.
- Touches: `magicLinkCore.ts`, `MagicLinkService.ts`, `config.ts`, new migration (redemption table + RLS filter metadata), `guides/MAGIC_LINK_GUIDE.md`.

**Phase 2 — Multi-app/role schema widening** *(additive, low-risk)*
- Item 10. Child tables; one-of-each flow preserved; CodeGen regen.

**Phase 3 — General session/login audit** *(cross-cutting)*
- Item 9. Seed AuditLogType rows; first-seen `(sub, iat)` hook in `context.ts` → `MJ: Audit Logs`. Uses Phase-1 shape as prototype.

**Phase 4 — Anonymous identity model**
- Item 11. Seed Anonymous user; invite `IdentityMode`; `Email` nullable; claims-based server-side enforcement path.

**Phase 5 — Resource / URL scoping**
- Items 12, 13. Resource/path scope on invite → claims; `SessionScope`/`AppLockGuard` path confinement (UX); server-side resource access under scope claims (security); transitive component data access.

**Phase 6 — Embed / IFRAME + domain allow-list + CSP**
- Items 14, 15. Per-link `AllowedDomains`; helmet/CSP `frame-ancestors` + Origin/Referer checks in MJServer; chrome-less Explorer embed route; "get embed code" UI.

**Phase 7 — Vendor / tier gating**
- Item 16. Invite `Kind`; `allowedInviteKinds` instance config; issuance-time capability seam. **Gated on reviewer decision re: tier model.**

Dependencies: 1 → (2, 3 independent) → 4 → 5 → 6 → 7. Phase 3 can proceed in parallel with 2/4. Anon (4) precedes embed (6) because embed is typically anon; resource scoping (5) precedes embed-of-a-resource (6); tier gating (7) gates embed.

---

## Schema changes summary

| Phase | Change |
|---|---|
| 1 | New table `MagicLinkRedemption` (entity `MJ: Magic Link Redemptions`); new RLS filter metadata on User Roles / User Applications / Application Roles; hash column → base64url (length review); config: `provisioningGuard`, `audit.retentionDays`, `audit.ipStorage` (Q3) |
| 2 | New child tables `MagicLinkInviteApplication`, `MagicLinkInviteRole`; deprecate single `ApplicationID`/`RoleID` |
| 3 | Seed `MJ: Audit Log Types` rows (metadata, not migration INSERT — via `metadata/` per repo convention) |
| 4 | Seed Anonymous user; `MagicLinkInvite.IdentityMode`; `Email` → nullable |
| 5 | `MagicLinkInvite.ResourceType`, `ResourceID`, path allow-list (child table or JSON) |
| 6 | New child table `MagicLinkInviteAllowedDomain`; config for CSP defaults |
| 7 | `MagicLinkInvite.Kind`; capability flag on `Application` *or* new `ApplicationCapability` (TBD); config `allowedInviteKinds` |

All reference-data seeding goes through `metadata/` + `mj sync push` per repo convention — **no SQL `INSERT` seeding** in migrations. All new columns get `sp_addextendedproperty` descriptions; multi-column adds consolidated into single `ALTER TABLE`.

---

## Verification plan (per phase, when built)

- **Phase 1:** Vitest for the pure core (base64url hashing, `qualifiedTable` whitelist rejection, claim contents incl. `mj_invited_by`, inviter-removed → invalid). Manual incognito redemption asserting a `MagicLinkRedemption` row (IP/UA/outcome). Provisioning-guard test: redeem against an Owner's email → blocked + logged. RLS test: guest RunView on User Roles returns only own rows; internal user unaffected (exemption).
- **Phase 2:** Redeem still works one-of-each; child rows written; CodeGen types compile.
- **Phase 3:** New session via each provider → exactly one `Audit Log` row per session (not per request); failed auth → `Login Failed` row.
- **Phase 4:** Anon link → resolves to shared Anonymous user; redeeming a second anon link does **not** accrete roles; access governed by claims.
- **Phase 5:** Resource link confines navigation in Explorer; server denies out-of-scope reads regardless of nav; transitive component views run under scope.
- **Phase 6:** Embed loads in an allowed-domain host page; CSP blocks framing from a disallowed domain; Origin/Referer mismatch rejected; long-lived link re-mints session per load.
- **Phase 7:** `/create` refuses `anonymous-embed` when capability/tier check fails; instance with embed disabled rejects the kind entirely.

Full-flow harness throughout: real redemptions in fresh incognito windows (fresh browser context per email to avoid the `CacheLocal` stale-`UserApplications` edge). `npm run build` per touched package; package unit tests green before each PR.

---

## Open questions for reviewers

The first and last are now **resolved by Craig** (recorded for trail); 2 and 3 carry **proposed answers** (Craig didn't touch them) for reviewer sign-off.

**1. ~~Multi-scope enforcement~~ → Route+resource capability ↦ RBAC mapping *(the real open design problem)*.** Craig settled the union question (it's a feature; carry it as per-session claims — Revision §1). What's still genuinely open is the thing the v1 plan dodged by falling back to `(app, role)`: **how does a "one FE route + its N dependent resources" capability express itself in MJ's permission model at enforcement time?** Concretely:
   - A route isn't a permission primitive in MJ — entities, views, queries, and resources are. So "share this route" has to *resolve* to a set of resource-level grants the server can actually check. Is that resolution (a) computed at issuance and frozen into the invite/claims, or (b) computed at runtime from the route's live dependency graph (which §C/#13 says we can't fully enumerate up front)?
   - For role links the server enforces via role perms + RLS. For claims-based resource links there is **no role** — so we need a server-side **claims authorizer** that, given `mj_resource_*` claims, admits exactly the reads that resource legitimately needs and nothing else. Designing that admit-list semantics (especially for transitive view/query access, #13) is the gate on Phase 5. **Needs a design pass before building.**

**2. Vendor/tier model (Phase 7) — proposed answer: keep MJ tier-agnostic; gate via a pluggable issuance seam, not a licensing entity.** Craig's earlier inline call stands: licensing stays *out* of the token and the invite table, enforced at `/create`. Building on that:
   - **No new MJ licensing/`ApplicationCapability` construct.** MJ has no tier model today and shouldn't grow one to serve this (YAGNI; it would couple auth to licensing — the exact thing Craig warned against).
   - **Two gating layers at `/create`:** (a) **instance config `allowedInviteKinds`** — the deployment-wide on/off for embed at all; (b) a **pluggable capability resolver** — an injectable interface `IInviteCapabilityProvider.canIssue(kind, application, issuingUser)` resolved via `@RegisterClass`. `/create` refuses to mint a gated `Kind` (e.g. `anonymous-embed`) unless the resolver says yes.
   - **Who owns the tier truth:** the **vendor**, not MJ. MJ ships a *default* resolver that reads a coarse `Application`-scoped setting (e.g. an `ExternalEmbedEnabled` flag via the existing settings mechanism — **not** a new column/table) so no-vendor instances still have a no-code toggle. Skip (or any vendor) registers its **own** resolver that consults its tier model. MJ never learns what a "tier" is. This keeps auth and licensing decoupled and evolving independently.

**3. Audit PII/retention — proposed answer: ship controls + conservative defaults, not a baked-in policy.** IP+UA are personal data; the right call is to expose the knobs and let the deploying org set policy to its privacy posture, rather than MJ hardcoding one.
   - **Retention is config-driven + purged by a scheduled job.** `magicLink.audit.retentionDays` (default 365 for the security-sensitive redemption audit). The general session audit (Phase 3) lives in `MJ: Audit Logs` — align with that table's own retention rather than inventing a parallel window; if it has none, default it shorter (e.g. 90) since it's higher-volume and operational, not forensic. Reuse MJ scheduled actions for the purge (keyset-paginate per the deep-pagination guide).
   - **Anonymization knobs.** `audit.ipStorage: 'full' | 'truncated' | 'hashed' | 'none'`. *Truncated* drops the last IPv4 octet / low IPv6 bits; *hashed* stores a salted hash so you can correlate "same client" without keeping the raw IP. **Different defaults per tier, matching purpose:** redemption audit defaults `full` (you want forensics on token scanning/brute-force — that's the whole point of logging failures); general session audit defaults `truncated` (high-volume, operational).
   - **The honest framing for reviewers:** this is a deployment policy decision. MJ provides the controls + sane defaults + guide documentation; it does not ship a one-size GDPR stance.

**4. ~~Anon embed token rotation~~ → resolved (Craig).** Re-mint a short session JWT per load is the **default** for revocable shares, not just embed (Revision §3). Residual *mechanics* (not a policy question): an embed reload re-mints **without** a fresh redemption — the link is already consumed — so a silent re-mint endpoint validates the still-valid invite (`ExpiresAt`/`MaxUses` re-checked) and reissues the short JWT carrying the same scope claims. For multi-link anon sessions (§B), that endpoint also re-emits the accumulated claim union. Spec this endpoint in Phase 4/6; no further reviewer decision needed.

# Pluggable, Metadata-Driven Authentication Providers

**Status:** Proposed — migration + mockup land in this PR; engine/resolver/client implementation lands on the same branch after migration + CodeGen are run locally.
**Branch:** `claude/workos-integration-explore-fn0nw8` (continues from the WorkOS PR)
**Author:** Claude (for amith@bluecypress.io)
**Date:** 2026-06-30

---

## 1. Motivation

Today MemberJunction's auth providers are **not pluggable the MJ way**:

- **Class discovery is hard-wired** — `AuthProviderFactory.ts` contains a literal `import './providers/Auth0Provider.js'` list. The built-ins are baked in; third parties have to lean on the manifest system without a first-class extension story.
- **The provider list is config-file, not metadata** — providers come from the `mj.config.cjs` `authProviders[]` array, not a DB entity. There's no CRUD UI, no audit, no sync, no admin management.
- **The client is single-provider and bespoke** — one `AUTH_TYPE` string selects one `MJAuthBase`, with magic-link special-cased in `forRoot`. No "Sign in with A / B / C" picker.

Every other MJ subsystem (AI Model Vendors, Communication Providers, File Storage Providers, AI Remote Browser Providers) is **metadata-row → `DriverClass` → `ClassFactory` → `@RegisterClass`**. Auth should match. The goal: **define any number of auth providers via subclasses discovered through `@RegisterClass` + metadata, with zero core edits to add one.**

## 2. What stays the same

The runtime validation machinery is already good and is **not** being rewritten:

- `BaseAuthProvider` / `IAuthProvider` (JWKS, retry/backoff, issuer matching, `extractUserInfo`)
- `AuthProviderFactory` (issuer→provider routing, multi-audience `getAllByIssuer`)
- `MJAuthBase` and the concrete `MJ*Provider` browser classes
- The MJServer verify pipeline (`verifyAsync`, `getValidationOptions`, `verifyUserRecord`)

We only change **where the provider list comes from** (DB metadata instead of config) and **how the browser picks one** (server-published catalog instead of a single env string).

## 3. Reference pattern (what we're copying)

| Subsystem | Entity | Driver field | Resolution call site |
|---|---|---|---|
| File Storage | `MJ: File Storage Providers` | `ServerDriverKey` | `MJStorage/src/util.ts` → `ClassFactory.CreateInstance(FileStorageBase, ServerDriverKey)` |
| Remote Browser | `MJ: AI Remote Browser Providers` | `DriverClass` | `ClassFactory.CreateInstance(BaseRemoteBrowserProvider, DriverClass)` |
| Communication | `MJ: Communication Providers` | (engine-cached) | `CommunicationEngineBase.Config()` via `BaseEngine.Load()` |
| **Auth (new)** | **`MJ: Authentication Providers`** | **`DriverClass`** | **`ClassFactory.CreateInstance(BaseAuthProvider, DriverClass, config)`** |

Secrets follow the File Storage model: a nullable `CredentialID` FK → `MJ: Credentials` → decrypted at runtime by `CredentialEngine`; non-secret config in columns/JSON; `.env` as last resort.

## 4. The entity: `__mj.AuthenticationProvider`

Created by the migration in this PR (`migrations/v5/V202606300900__v5.44.x__Pluggable_Auth_Providers.sql`). Table `__mj.AuthenticationProvider` → CodeGen entity name **`MJ: Authentication Providers`** → generated class `MJAuthenticationProviderEntity`.

Columns (see migration for full descriptions):

| Column | Purpose |
|---|---|
| `Name` (unique) | Human name, e.g. "WorkOS Production" |
| `DriverClass` | `@RegisterClass(BaseAuthProvider,'x')` key — the resolution key |
| `Type` | Optional protocol label ("oidc") |
| `Issuer`, `Audience`, `JWKSUri`, `ClientID`, `Domain`, `Scopes` | Non-secret OIDC connection fields |
| `AdditionalConfiguration` (JSON) | Driver-specific extras (WorkOS `apiHostname`, Cognito `region`/`userPoolId`, `redirectUri`) |
| `CredentialID` (FK, nullable) | Optional secret material via `MJ: Credentials` (null for all current providers) |
| `Status` (`Active`/`Disabled`) | Lifecycle; only Active is registered |
| `IsDefault` | Default selection |
| `ClientVisible`, `DisplayName`, `Icon`, `Sequence` | Login-picker presentation |

**Secrets answer (which providers need them):** none of today's providers (Auth0, Okta, MSAL, Cognito, Google, WorkOS) need a server secret — they validate via **public JWKS**, and `ClientID` is public. Secrets only matter for **server-initiated** flows: confidential-client OAuth/token exchange (the `601-mcp-oauth` proxy work), management-API calls, and SCIM/Directory Sync. So `CredentialID` is **optional** and unused until such a provider arrives.

## 5. Server changes (post-CodeGen)

### 5.1 `AuthProviderEngine` — load the catalog at startup

A `BaseEngine` subclass with `@RegisterForStartup`, mirroring `CommunicationEngineBase`. **Synchronous (gating), not `deferred`** — no authenticated request may be served before the catalog is registered.

```ts
// packages/AuthProviders/... (server-side; needs RunView so lives where metadata is available)
@RegisterForStartup({ priority: /* before request serving */, severity: 'error', deferred: false })
export class AuthProviderEngine extends BaseEngine<AuthProviderEngine> {
  private _providers: MJAuthenticationProviderEntity[] = [];   // ← generated by CodeGen

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
    await this.Load([
      { PropertyName: '_providers', EntityName: 'MJ: Authentication Providers',
        Filter: "Status='Active'", CacheLocal: true }
    ], provider, forceRefresh, contextUser);
  }

  public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider) {
    await this.Config(false, contextUser, provider);
    await this.RegisterAll(contextUser);
  }

  /** Build AuthProviderConfig from a row (+ resolve CredentialID via CredentialEngine when set),
   *  instantiate via ClassFactory by DriverClass, and register with AuthProviderFactory. */
  private async RegisterAll(contextUser?: UserInfo) { /* ... */ }
}
```

### 5.2 Switch `initializeAuthProviders` to metadata, with config fallback

`MJServer/src/auth/initializeProviders.ts` becomes a **layered resolver** (the MJStorage precedent):

1. **Primary:** `AuthProviderEngine` rows (DB metadata).
2. **Fallback:** if the table is empty/unavailable, read `configInfo.authProviders[]` exactly as today.
3. **Auto-seed bridge (optional, recommended):** on first boot, if the table is empty **and** config has `authProviders`, create rows from config so the deployment transparently migrates to metadata. Idempotent; logged.

This guarantees **zero-break upgrades** — existing `mj.config.cjs`-based deployments keep working with no changes.

### 5.3 Drop the hard-wired imports

Remove the literal `import './providers/*.js'` list in `AuthProviderFactory.ts`; rely on the bootstrap manifests (`server-bootstrap` covers all `@memberjunction/*` providers; third parties via their supplemental manifest). Optionally keep a `LoadBuiltInAuthProviders()` no-op for belt-and-suspenders. **Net: a third party adds a provider with a `@RegisterClass` subclass + a metadata row — no core edits.**

### 5.4 Public, unauthenticated provider-catalog endpoint

The browser is pre-auth, so it cannot read authenticated metadata. The server exposes the **non-secret** subset of `ClientVisible` + `Active` providers via an **unauthenticated** endpoint (GraphQL query exempted from the auth middleware, or a tiny REST route):

```
GET /auth/providers  →
[ { driverClass, displayName, icon, sequence, clientId, issuer, domain, scopes, additionalConfiguration } ]
```

**Security:** this endpoint returns ONLY public fields — never `CredentialID`, never secret material, never `Disabled`/non-`ClientVisible` rows. Same data the SPA would have had baked into `environment` today, just served from the single source of truth.

## 6. Client changes (post-CodeGen)

### 6.1 Bootstrap from the catalog + multi-IdP picker

`AuthServicesModule.forRoot` / the app initializer fetches `/auth/providers` before login and:

- **0 providers** → fall back to `environment.AUTH_TYPE` (offline/legacy path).
- **1 provider** → behave as today: instantiate that `MJAuthBase` via `ClassFactory` + its `angularProviderFactory`, no picker.
- **2+ providers** → render the **login picker** (see the concept prototypes in `login-redesigns/` — visual reference only, see §6.3). Selecting one instantiates the chosen provider and calls `login()`.

Magic-link stays a conditional provider (its existing "session token present?" check), now expressed as one catalog entry rather than special-cased in `forRoot`.

### 6.2 Where the UI lives — reusable picker vs. per-app surface

The picker must be reusable by **any** MJ-based application, not baked into Explorer. So it splits into two layers:

- **Reusable picker component — `<mj-login-picker>` in `@memberjunction/ng-auth-services`** (the shared auth package every app already imports for `AuthServicesModule` / `MJAuthBase`). It is **presentational and app-agnostic**: `@Input()` the public provider catalog (from `/auth/providers`), `@Output() providerSelected`. It renders each provider as `<button mjButton variant="secondary">` (single-provider → one `variant="primary"` CTA), with the default pill, brand chips, and purely token-driven styling — **no app branding, no Router, no Explorer coupling.** The 0/1/2+ resolution + `ClassFactory` provider instantiation lives beside it in `AuthServicesModule` (already the shared bootstrap). *(A dumb sub-component could live in `@memberjunction/ng-ui-components`, but the picker consumes the auth-catalog shape, so `ng-auth-services` is the cohesive home — keeps `ng-ui-components` free of auth types.)*
- **Per-app login surface (chrome).** Each app supplies its own surrounding login layout and **embeds `<mj-login-picker>`**. For Explorer that's the existing `.login-wrapper` surface in `@memberjunction/ng-explorer-app` (wave banner + wordmark). Another app drops `<mj-login-picker>` into its own login page and gets the identical, accessible picker for free. **The concept prototypes (A / B / C) are *surface* options — all three embed the same reusable picker; only the chrome differs.**
- **Server side is already reusable:** the `/auth/providers` endpoint and `AuthProviderEngine` (`@memberjunction/server`) are app-agnostic — any app pointed at the API gets the same catalog.
- **Admin configuration:** the **Admin app** (`packages/Angular/Explorer/explorer-settings` + the Admin shell). Because `MJ: Authentication Providers` is a normal entity, CRUD comes free via generated forms; we add an **"Authentication Providers" settings page** under Admin (left-nav shell sub-page using `<mj-page-header-interior>`) listing providers with Active/Default/Visible toggles, ordering, and a link to edit each row. This is where an admin enables/orders the picker. (Per-Application provider scoping is a possible future extension; out of scope v1.)

### 6.3 🚨 The prototypes are a VISUAL reference — do NOT port their classes

`login-redesigns/` (concepts **A / B / C** + shared `base.css`; see `login-redesigns/README.md` for the design rationale + decision trail) and `login-mockup.html` are **standalone, dependency-free HTML prototypes for design sign-off only.** They exist so a `.html` can render with zero build. When implementing the reusable `<mj-login-picker>` (§6.2) and embedding it in an app's login surface, **do not copy their scaffolding** — build the picker + chosen chrome natively with scoped, semantically-named styles. Specifically:

- **Do NOT reuse the prototype's bespoke class names** — `.pageA` / `.cardA`, `.pageB` / `.storyB` / `.glassCard` / `.markWM`, `.splitC` / `.asideC` / `.formC`, plus `.provider-list` / `.provider-btn` / `.default-pill`. They are ad-hoc mock scaffolding, not part of any MJ system. **The reusable row markup (icon chip + label + default pill + `mjButton`) belongs to `<mj-login-picker>`; the per-app surface owns only its own layout classes.**
- **Provider rows / single CTA → the real `mjButton` directive.** The prototype's `.mj-btn` / `.mj-btn--secondary` / `.mj-btn--primary` classes are a **hand-rolled mirror** of `MJButtonDirective` (`@memberjunction/ng-ui-components`). Implement each provider row as `<button mjButton variant="secondary">` and the single-provider CTA as `variant="primary"`. The a11y (focus ring, 44px target, `ariaLabel`) comes from the directive — **never copy the mirrored `.mj-btn*` CSS.**
- **Live tokens, not the pasted block.** The prototypes paste a `:root` token subset from `_tokens.scss` so the standalone file has values to resolve. The real component inherits the **live** `--mj-*` tokens automatically — **delete the pasted token block entirely.** The only literals that carry over are the documented exceptions: external brand-chip colors (Microsoft/Google/Okta/WorkOS), white text/overlays on the always-dark brand panels, and the `color-mix`-derived brand navies.
- **Logo + waves via the existing mechanism.** Use the login surface's existing `--mj-logo-wordmark` / `.mj-logo-wordmark-login` and animated-wave banner — not the prototype's `<img src="assets/…svg">` copies.
- **Carry over the mobile fixes** (proven in the prototypes): size the surface with **`100dvh`** (not `100vh`), let provider labels wrap (`white-space: normal; min-width: 0`), and collapse any brand-story copy to just the logo at the mobile breakpoint so the picker stays above the fold.

Pick **one** direction (A / B / C) for sign-off. The provider-row markup + `mjButton` usage is identical across all three — only the surrounding layout differs — so the layout choice is the only thing that changes at implementation time.

## 7. Where everything goes (package map)

| Piece | Location |
|---|---|
| Migration | `migrations/v5/V202606300900__v5.44.x__Pluggable_Auth_Providers.sql` (this PR) |
| Generated entity `MJAuthenticationProviderEntity` | `@memberjunction/core-entities` (CodeGen, local) |
| `AuthProviderEngine` (+ base, if a browser-safe metadata read is ever needed) | server-side auth package / `MJServer` auth dir |
| `initializeProviders.ts` layered resolver | `@memberjunction/server` |
| Drop hard-wired imports | `@memberjunction/auth-providers` (`AuthProviderFactory.ts`) |
| Public `/auth/providers` endpoint | `@memberjunction/server` (resolver/route, auth-exempt) |
| **Reusable** `<mj-login-picker>` (app-agnostic, `mjButton` rows, token-styled) | `@memberjunction/ng-auth-services` |
| Per-app login **surface** that embeds the picker | `@memberjunction/ng-explorer-app` (Explorer chrome); any other app supplies its own |
| Admin settings page | `@memberjunction/ng-explorer-settings` (+ Admin nav) |
| Login concept prototypes (visual reference only) | `plans/pluggable-auth-providers/login-redesigns/` (A/B/C + `base.css`) and `login-mockup.html` (this PR) |

## 8. CodeGen handoff (why this is one PR but two pushes)

I cannot run migrations or CodeGen in the remote environment, and MJ's rules forbid writing code against not-yet-generated entity types. So:

1. **This push:** plan + migration + HTML mockup (no code depends on the generated entity → tree stays buildable).
2. **You (local):** run the migration, then `mj codegen` → generates `MJAuthenticationProviderEntity`, the view, the sprocs, and registers the entity. Commit the generated output.
3. **Next push (same branch/PR):** `AuthProviderEngine`, the layered `initializeProviders`, the public endpoint, the login picker, and the Admin page — all of which compile against the now-generated entity. Plus unit tests.

All of it ships in **one PR**.

## 9. Testing plan (phase 3)

- **Engine:** rows → registered providers; Active filter respected; `CredentialID` resolution path; config fallback when table empty; auto-seed idempotency.
- **Endpoint:** returns only public fields; excludes `Disabled`/non-`ClientVisible`; never leaks `CredentialID`/secrets; works unauthenticated.
- **Client:** 0/1/2+ provider branching (fallback / direct / picker); picker selection instantiates the right `MJAuthBase`; magic-link coexistence preserved.

## 10. Back-compat & rollout

- `mj.config.cjs authProviders[]` remains fully supported as a fallback (and optional auto-seed source). No deployment must change anything to keep working.
- The migration is additive (new table only); no existing schema touched → consistent with the publish/no-breaking-changes policy.
- WorkOS (just added) becomes the first natural catalog citizen.

## 11. Open questions

1. **Auto-seed from config** on first boot — do it automatically, or require an explicit admin action / CLI command? (Recommendation: automatic + logged, opt-out via a config flag.)
2. **Per-Application provider scoping** (different apps → different IdPs) — defer to a follow-up, or model now with an optional join? (Recommendation: defer.)
3. **Endpoint shape** — GraphQL auth-exempt query vs. tiny REST route. (Recommendation: REST `/auth/providers` — simplest for a truly pre-auth fetch, no Apollo bootstrap needed.)

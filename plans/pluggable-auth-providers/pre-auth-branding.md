# Pre-auth branding: can Theme Studio reach the login screen?

**Status:** design note. Nothing here is built. Written 2026-08-06 while reviewing PR #2985
(pluggable auth providers), to answer two questions raised on that PR:

- @AN-BC, 2026-08-05: *"maybe the Theme Builder work already does that?"*
- @MattC-BC: *"any reason we can't extend the theme to be before auth? any reason for that?"*

**Verdict up front:** Theme Studio does **not** cover pre-auth branding today, and nothing
architectural prevents extending it. The work is additive. But pre-auth is not the hard part:
**scoping is**, and that prerequisite is the same regardless of who consumes it.

---

## 1. What Theme Studio does today

Two independent axes, deliberately kept separate ([theme.service.ts:132-137](../../packages/Angular/Generic/shared/src/lib/theme.service.ts#L132-L137)):

| Axis | Scope | Keyed off |
|---|---|---|
| Light/dark **mode** | per-user | `Explorer.Theme` in `MJ: User Settings` |
| Brand **overlay** | per-user, else instance-wide | `Explorer.SelectedBrandTheme`, else `IsDefault = 1` |

The theme itself is a shared row in `MJ: Themes`. There is no per-user copy: editing a theme in
Theme Studio edits a record every user on that theme sees. "Set as default" clears `IsDefault` on
every other row ([theme-manager-dashboard.component.ts:153-167](../../packages/Angular/Explorer/dashboards/src/ThemeStudio/theme-manager-dashboard.component.ts#L153-L167)),
so exactly one theme is the instance default and it applies to everyone who has not chosen their own.

Resolution at login, in [`applyDefaultBrandTheme()`](../../packages/Angular/Explorer/workspace-initializer/src/lib/services/workspace-initializer.service.ts#L194-L237):

```
user's SelectedBrandTheme  →  IsDefault = 1  →  stock MJ tokens
```

**The available scopes are therefore "global" and "per-user", with nothing in between.** That gap is
the actual subject of this note. "Everyone at ISA sees mimo's branding" has nowhere to live.

## 2. Why it is post-auth today

Incidental, not principled. Themes are a normal MJ entity, so reads go through `RunView` →
GraphQL → `MJThemeResolver`, which sits behind `createUnifiedAuthMiddleware`. That is true of
everything in MJ. Nobody decided themes must be post-auth; the login screen was simply not in
scope when Theme Studio was built.

Concretely, none of this reaches an anonymous visitor:

| Blocker | Evidence |
|---|---|
| Overlay loads after the authenticated bootstrap | `applyDefaultBrandTheme()` runs after `setupGraphQLClient(token)` and `SharedService.RefreshData()` |
| Theme reads go through the authed provider | `RunView` on `MJ: Themes` → `MJThemeResolver`, behind `createUnifiedAuthMiddleware` |
| Resolution is per-user or global, never per-org | `Explorer.SelectedBrandTheme`, else the single `IsDefault` row |
| `MJ: Themes` has no scoping column | no `OrganizationID` / `TenantID` / `RoleID`; MJ core has no Tenant entity, and the multi-tenancy middleware runs post-auth |

**Someone already wanted this.** `ThemeService.Reset()` deliberately preserves the brand overlay
through logout ([theme.service.ts:409-412](../../packages/Angular/Generic/shared/src/lib/theme.service.ts#L409-L412)):

> Remove the base-theme attribute only. We deliberately KEEP the org brand overlay
> (`data-theme-overlay` + its CSS + `_brandOverlayId`) so the brand survives logout and stays on
> the login screen.

It was implemented as a session-scoped attribute rather than a real pre-auth fetch, so it does not
survive a reload. See the testing trap in §6.

## 3. What constrains a pre-auth implementation

Four things, in rising order of how much they shape the design.

### 3.1 Pre-auth you only have the hostname

Post-auth you know the user, therefore their org. Anonymous, you have only the HTTP request. Host
or subdomain is the only realistic key.

This is a hard cap, not a detail: **if two organizations share a hostname, they cannot be branded
differently before login.** State that up front rather than discovering it during implementation.

### 3.2 Do not make the endpoint enumerable

Key strictly off the actual request host. An endpoint accepting `?org=acme` lets anyone walk it and
enumerate the customer list, their display names, and their logos.

The `/auth/providers` precedent argued disclosure was acceptable because every published value was
already compiled into the browser bundle. That argument holds for branding on the host you are
already visiting. It does **not** hold for an endpoint that answers questions about hosts you are not on.

### 3.3 `CustomCSS` is the genuinely sensitive part

`MJ: Themes.CustomCSS` is admin-authored raw CSS. Serving it to anonymous visitors on the
credential-entry page is meaningfully different from serving it to authenticated users.

The theme engine already takes the CSS trust boundary seriously. It strips `@import` outright, and
says why ([derive.ts:227-231](../../packages/ThemeEngine/src/derive.ts#L227-L231)):

> `@import` is STRIPPED entirely, not hoisted: a scoped theme overlay has no legitimate need to
> pull another stylesheet, an org-wide `@import` of a remote URL is a cross-origin request from
> every user's session (data-exfiltration surface) [...]

But `@font-face` is deliberately **hoisted** to top level and carries `src: url(...)`, and any
scoped rule can use `background-image: url(...)`. Remote fetches stay reachable by design. Today
they fire only for logged-in users; pre-auth they would fire for every anonymous visitor to the
login page.

**The risk grows once themes are scoped.** Today one global theme is authored by one trusted admin.
Scope themes per-org and org A's admin is authoring CSS, at which point a bug in scoping or host
resolution puts org A's CSS on org B's login screen. That exposure is created by the scoping work,
not by pre-auth, but the two land together.

**Recommendation:** publish seeds, logos and overrides pre-auth. Do **not** publish `CustomCSS`
pre-auth, or gate it behind an explicit per-theme "safe for login screen" flag. Seeds plus logos
already deliver the brand.

### 3.4 It sits on the critical path of first paint

Two operational consequences:

- **Fail open.** Return an empty payload rather than an error, so a theming problem cannot take the
  login screen down. `AuthProviderCatalogRouter` already does exactly this and is the model.
- **Cache the emitted CSS.** The current overlay is a runtime `Blob` object URL that dies on reload
  ([theme.service.ts:54-61](../../packages/Angular/Generic/shared/src/lib/theme.service.ts#L54-L61)).
  Pre-auth you want the emitted CSS cached by theme id plus a content hash, or you accept a flash of
  unbranded content on every cold load.

## 4. What is already reusable

Better than expected:

- **`@memberjunction/theme-engine` has zero runtime dependencies and does not import
  `@memberjunction/core`.** Its derivation (`derive()`, `emitOverlayCss()`, `emitLogoOverlayCss()`)
  can run server-side unchanged. Its README already anticipates "a future server-side overlay endpoint."
- **`/auth/providers` from PR #2985 is a working template.** Rate limiting, `Cache-Control`,
  allow-list projection, and empty-on-failure are all solved there. See
  [`AuthProviderCatalogRouter.ts`](../../packages/MJServer/src/auth/AuthProviderCatalogRouter.ts) and
  its client mirror [`auth-provider-catalog.ts`](../../packages/Angular/Explorer/auth-services/src/lib/auth-provider-catalog.ts).
- **The login surface already carries the `data-theme-overlay` attribute plumbing**, so the CSS has
  somewhere to attach.

## 5. Suggested shape, in dependency order

1. **Add a scope to `MJ: Themes`.** Follow the domain-agnostic pattern MJ already uses for search:
   `PrimaryScopeEntityID` + `PrimaryScopeRecordID`, rather than a hardcoded `OrganizationID`. That
   covers organization **and** role (see §6.2 of [`plan.md`](plan.md) and @dray-mc's 2026-08-06 note)
   without MJ core growing a Tenant entity. **This is the prerequisite, and it is independent of pre-auth.**
2. **Add host resolution.** Map request host or subdomain to a scope record.
3. **Mount a public branding router** before `createUnifiedAuthMiddleware`, modelled on
   `AuthProviderCatalogRouter`, projecting through an explicit allow-list. Publish seeds, the four
   logo URLs, overrides, and the white-label flag. Withhold `CustomCSS` per §3.3.
4. **Derive server-side** with `theme-engine`, or ship seeds and derive client-side. Server-side
   avoids shipping the derivation library to the pre-auth bundle.
5. **Fetch pre-bootstrap**, alongside the provider catalog, and inject a `<style>` before first paint.

## 6. Testing trap

`ThemeService.Reset()` keeps the brand overlay on logout and `mj-theme-overlay` survives in local
storage, but the overlay CSS is a `Blob` object URL that dies on reload.

**Logging out therefore makes the login screen look branded when it is not.** A cold load, a new
browser, or an incognito window shows stock MJ. Always verify pre-auth branding on a cold load.

## 7. Open decisions

- Scope axis: organization only, or organization **and** role? Dray's framing favours role as the
  interesting one, scoped "just like all the other scoped stuff" (search, skills, prompts).
- Where does host-to-scope mapping live: a column on the scope record, config, or a new entity?
- Is `CustomCSS` ever publishable pre-auth, and if so behind what flag and what review?
- Does the white-label entitlement live with the theme, or with the scope record?
- Admin surface for all of the above.

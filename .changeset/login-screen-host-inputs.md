---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-auth-services": patch
---

Login screen: fully themable through the design-token system, like every other Explorer surface.

The sign-in page was the one surface a white-labelled deployment could not restyle without CSS
against its internal class names: the banner's gradient geometry was burned into the stylesheet
(only its two stops were tokens), the banner text was pinned to a primitive
(`--mj-color-neutral-0`), the logo box was hardcoded at 297×45, the "Welcome back" / "Sign in to
continue." copy was welded into the template, and `mj-explorer-app` bound none of the picker's
existing inputs.

- **New `--mj-login-*` token group** (documented in THEMING.md): `--mj-login-banner-bg` (the whole
  background — default is the stock gradient over the existing `--mj-login-grad-*` stops, so a
  theme can retarget the stops or replace the value wholesale), `--mj-login-banner-text` /
  `-text-secondary`, `--mj-login-banner-logo` + `-logo-width`/`-height`,
  `--mj-login-banner-flex` / `--mj-login-panel-flex` (the editorial split),
  `--mj-login-panel-bg`, `--mj-login-picker-max-width`. Defaults reproduce the stock design
  exactly; dark mode keeps working through the existing dark-block gradient stops.
- **Explorer's login stylesheet consumes the group** — no primitives, no hardcoded geometry; the
  dead `.mj-logo-mark-login` block is gone.
- **Six host inputs on `MJExplorerAppComponent`**, all defaulting to today's behaviour:
  `LoginHeading` (`null` for none), `LoginShowPoweredBy`, `LoginBannerAlignment`
  (`'start' | 'center'`), `LoginBannerTitle` / `LoginBannerSubtitle` (the story-panel copy,
  `null` collapses), `LoginBannerLogoLabel` (the brand image's accessible name — the artwork
  comes from a token the component cannot read, so the name is host API).

No behaviour or visual change for an app that binds nothing and themes nothing.

---
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-auth-services": patch
---

Login screen: a composable Explorer surface — theme it, rearrange it, extend it.

The sign-in page was the one Explorer surface a deployment could not adapt without forking the
component or writing CSS against its internal class names. It is now customized the same three
ways the rest of MJ is, each additive and each defaulting to today's rendering:

- **Tokens** — a `--mj-login-*` group covers the whole surface: `--mj-login-banner-bg` (the story
  panel's background; the stock gradient is its default, so a theme can retarget just the
  `--mj-login-grad-*` stops or replace the value outright), banner text and logo, the
  editorial split, the panel surface, the picker width, and both card surfaces. Only the gradient
  stops carry dark-mode values — everything else either references a semantic token that swaps on
  its own or is theme-constant by design. Documented in THEMING.md.
- **Layout** — `LoginLayout`: `'split'` (stock), `'split-reverse'` (mirrored; DOM order unchanged,
  so the story stays first for a screen reader), `'centered'` (one column: story on a full-bleed
  banner background, sign-in options in a card on top). A layout moves regions; it never drops one.
- **Content** — `LoginHeading`, `LoginShowPoweredBy`, `LoginBannerAlignment`, `LoginBannerTitle`,
  `LoginBannerSubtitle`, `LoginBannerLogoLabel`, and `LoginCards`: a `MJLoginCard[]` of tiles
  (icon, title, text, optional sanitized link) each naming its region, so content a deployment
  wants to add is configuration rather than markup.
- **Slots** — the `mjLoginSlot` directive (the shape of `mjChatSlot` in `ng-conversations`) projects
  templates into `bannerContent` (replaces the brand block), `bannerFooter`, `panelHeader` and
  `panelFooter`. Replace-vs-augment is stated per slot; a footer slot takes over from that region's
  cards. `<mj-login-picker>` is deliberately not replaceable — a host surrounds sign-in, not owns it.

Also fixes a latent clipping bug this made easy to hit: the app shell sets
`html, body { overflow: hidden }`, so login content taller than the viewport was unreachable — which
already affected a tenant with many identity providers on a short screen. Both columns now scroll
their own content and centre with auto margins rather than `justify-content: center`, which would
strand the overflow above the scroll origin.

No behaviour or visual change for an app that binds nothing, projects nothing and themes nothing.

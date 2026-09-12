---
"@memberjunction/ng-explorer-app": patch
---

Login screen: let the hosting app set the heading, the attribution and the banner alignment.

`mj-login-picker` has always carried `Heading` and `ShowPoweredBy` inputs, but `mj-explorer-app` bound
neither and exposed nothing of its own — so an app that embeds `<mj-explorer-app>` could only reach
them with CSS against the picker's internal class names, which is exactly what a component API is
supposed to make unnecessary. Three inputs, defaults unchanged:

- **`LoginHeading`** (default `'Log in'`, `null` for none) → the picker's `Heading`. With a single
  configured provider the picker renders one primary CTA labelled with the action, so the default
  heading puts the same word above the button it labels; a white-labelled deployment usually wants
  just the button.
- **`LoginShowPoweredBy`** (default `true`) → the picker's `ShowPoweredBy`.
- **`LoginBannerAlignment`** (`'start'` — Login C's editorial split, the default — or `'center'`) →
  centers the story panel's brand block on the wide layout. The stacked (≤900px) layout already
  centers it; this makes the same choice available above that breakpoint, which is what a logo-led
  brand tends to want.

No behaviour change for an app that binds nothing.

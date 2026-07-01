# Login redesigns — concepts & design rationale

Three visual directions for the pluggable-auth login (the multi-IdP picker), plus a
shared `base.css`. **These are standalone HTML prototypes for design sign-off only** —
see [`../plan.md` §6.3](../plan.md) for the "do not port these classes" implementation
rules. This file records *why* the design landed where it did.

| File | Direction | In one line |
|---|---|---|
| `Login A - Centered Focus.html` | **A · Centered Focus** | One calm card centered on a tinted page. Most conservative. |
| `Login B - Immersive Brand.html` | **B · Immersive Brand** | A navy brand stage (left) + an elevated form card (right), centered as a balanced pair. |
| `Login C - Editorial Split.html` | **C · Editorial Split** | Two-pane split — a navy brand panel (logo + welcome) beside a quiet form. |
| `base.css` | shared | Tokens + the `mjButton`-mirroring provider rows every concept reuses. |
| `index.html` | gallery | Side-by-side preview of A/B/C (review only). |

## Core principles (and why)

1. **Reusable, so brand-neutral by design.** The picker ships once as a shared,
   app-agnostic component (`<mj-login-picker>` in `@memberjunction/ng-auth-services`);
   each application supplies its own surrounding chrome. Because **apps built on MJ
   carry different branding**, the surfaces avoid MemberJunction-specific identity:
   - **No product messaging.** Marketing copy ("Your data, connected.", "One workspace
     for your whole member data platform.", "Sign in to your MemberJunction workspace")
     was replaced with generic, host-agnostic text ("Welcome back", "Sign in to
     continue.", "Log in").
   - **No heavy background logos.** The oversized MJ watermark (B) and corner watermark
     (A) were removed. A single **modest foreground logo** remains as a host-supplied
     placeholder (we show the MJ mark only as a stand-in).
   - **Branding is injected, not baked in:** logo + product name/copy by the host; brand
     color via the themeable `--mj-*` tokens (override `--mj-brand-primary` et al.).

2. **"Powered by MemberJunction" on every surface.** Precisely *because* the host brand
   varies, the MJ attribution must always appear. It sits at the bottom of the
   form/card (a shared `.powered-by`), so it's visible on desktop **and** mobile even
   when a brand panel collapses.

3. **Provider rows are the real `mjButton`, not copied CSS.** Each row is
   `<button mjButton variant="secondary">` (single-provider CTA = `variant="primary"`).
   The accessibility — focus ring, 44px touch target, `ariaLabel` — comes from the
   shared `MJButtonDirective`, so it can't drift. The prototype's `.mj-btn*` classes are
   a hand-rolled mirror of that directive purely so a dependency-free `.html` can render.

4. **Real design tokens, no hardcoded values.** All color/spacing/type/radius/shadow
   resolve to `--mj-*` tokens pasted from `_tokens.scss`. This gives dark mode and
   white-labeling for free (override token *values*). The only literals left are the
   documented exceptions: external brand-chip colors (Microsoft/Google/Okta/WorkOS),
   white text/overlays on the always-dark brand panels, and `color-mix`-derived brand
   navies.

5. **Match the real app's shell.** Montserrat (the actual Explorer UI font, applied
   globally in `styles/_typography.scss` even though the token lists Inter) and a
   full-screen surface (`100dvh`).

6. **Mobile is first-class.** `100dvh` (not `100vh`, which the browser chrome overlaps);
   provider labels wrap (`white-space: normal; min-width: 0`) so long labels don't force
   horizontal overflow; and C's brand panel stays compact so the picker never scrolls
   below the fold.

## Provider-row standards

- **Label verb — always "Continue with `<Provider>`".** The modern auth convention
  (Google Identity, Auth0, Clerk), and it reads whether the user is signing in or up.
  Applied uniformly across A/B/C **and** the single-provider CTA (previously A said
  "Continue with", B used bare names, C said "Sign in with" — now unified).
- **Iconography.** A recognizable **brand mark** on a brand-colored chip where one
  exists (Microsoft, Google, Apple, GitHub, … — a Font Awesome brand glyph in the
  prototype, an official brand SVG in production per each provider's brand guidelines);
  a **monogram chip** (the DisplayName's initial) as the fallback for providers with no
  standard mark (WorkOS, Okta, custom OIDC). Every chip is 34px with a hairline border,
  so the row rhythm is identical and each chip reads on both light and dark cards. The
  `Icon` metadata field carries the mark; the monogram is derived from `DisplayName`.
- **Contrast / reduced motion (a11y).** Chip fills carry a hairline border for edge
  definition on both themes (fixes the dark WorkOS chip disappearing on the dark card);
  provider glyphs meet AA for their size; the muted "Powered by" text meets AA; the
  hover lift is disabled under `prefers-reduced-motion`; and the focus ring + 44px
  target come from `mjButton`.

## Decision trail (how we got here)

- Started from a single MJ-branded mock → split into three surface directions (A/B/C),
  all embedding the **same** picker so only layout differs.
- Tokenized everything (removed bespoke px/hex) so the design speaks the real token
  system and is near-mechanical to implement.
- Applied the `mjButton` treatment to every row for guaranteed a11y.
- **Decoupled from MJ** on request: neutralized messaging and removed background logos,
  since the login is reusable across differently-branded apps.
- Added the always-on **"Powered by MemberJunction"** attribution.
- Simplified **C**: dropped the headline + feature-list "spiel" (unnecessary verbiage);
  the brand panel is now logo + "Welcome back" / "Sign in to continue.", form on the right.

## What's still a design choice (open)

- Which direction (A / B / C) to ship — the picker + `mjButton` usage is identical
  across all three, so the layout is the only decision.
- Whether B's brand stage wants subtle **abstract** (non-logo) background interest now
  that the watermark is gone.
- **Scaling to many providers (deferred — noted, not designed).** The picker is a
  vertical list sized for a handful of IdPs (the common case). Beyond ~6 it grows tall;
  revisit then with a scrollable list (`max-height` + overflow) or a search/filter.
  Flagged here so it isn't forgotten.
- **Undesigned surfaces/states** (bigger UX gaps, tracked separately): the Admin
  "Authentication Providers" management page, and the picker's **loading / error /
  redirecting** states. Real logins live or die on these.

# Login redesigns — concepts & design rationale

Three visual directions for the pluggable-auth login (the multi-IdP picker), plus a
shared `base.css`. **These are standalone HTML prototypes for design sign-off only** —
see [`../plan.md` §6.3](../plan.md) for the "do not port these classes" implementation
rules. This file records *why* the design landed where it did.

> ✅ **Selected direction: C · Editorial Split.** A and B are retained here as the
> alternatives considered (see the decision trail). Because the reusable picker +
> `mjButton` usage is identical across all three, only **C's layout** carries forward to
> implementation — the principles and standards below apply regardless.

| File | Direction | In one line |
|---|---|---|
| `Login C - Editorial Split.html` | **C · Editorial Split** ✅ **(selected)** | Two-pane split — a brand panel (logo + welcome) beside a quiet form. |
| `Login A - Centered Focus.html` | A · Centered Focus | One calm card centered on a tinted page. Most conservative. |
| `Login B - Immersive Brand.html` | B · Immersive Brand | A flat brand stage (left) + an elevated form card (right), centered as a balanced pair. |
| `base.css` | shared | Tokens + the `mjButton`-mirroring provider rows every concept reuses. |
| `index.html` | gallery | Side-by-side preview of A/B/C (review only). |

## Core principles (and why)

1. **Reusable, so brand-neutral by design — and brandable at RUNTIME, per organization
   (ideally per channel), not per app.** The picker ships once as a shared, app-agnostic
   component (`<mj-login-picker>` in `@memberjunction/ng-auth-services`). The end user
   perceives they are logging into **their organization's** product (e.g. ISA's *mimo*,
   ASAE's *Stellar*) — not MemberJunction, and not "the app" — so the surfaces carry **no**
   MJ-specific identity and take branding as **runtime inputs resolved before login**:
   - **No product messaging.** Marketing copy ("Your data, connected.", "One workspace
     for your whole member data platform.", "Sign in to your MemberJunction workspace")
     was replaced with generic, host-agnostic text ("Welcome back", "Sign in to
     continue.", "Log in").
   - **No heavy background logos.** The oversized MJ watermark (B) and corner watermark
     (A) were removed. A single **modest foreground logo** remains — a runtime-supplied
     placeholder (we show the MJ mark only as a stand-in).
   - **Branding is resolved at runtime, per tenant/channel — never baked into a build.**
     Logo, product name, and brand color (token override) are resolved **per organization**,
     and ideally **per channel** (BCSaaS), from tenant config served pre-auth (e.g. by
     host/subdomain, alongside the public provider-catalog endpoint) — **not** a per-app
     or per-build customization each app maintains on its own.

2. **"Powered by MemberJunction" — shown by default, removable by CONFIG (never a code
   change).** The attribution sits at the bottom of the form/card (a shared `.powered-by`),
   visible on desktop **and** mobile even when a brand panel collapses. It is **on by
   default**, but **full white-label (attribution removed) is a supported, paid tier** — so
   hiding it must be a **per-tenant configuration flag**, never a code fork or a per-app
   customization. (In-app, a "Powered by" credit may still appear post-login; the *login*
   attribution follows the tenant's white-label entitlement.)

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

- ~~Which direction (A / B / C) to ship~~ — **decided: C · Editorial Split.** A/B kept
  as alternatives-considered for reference.
- **Per-organization / per-channel branding resolution (needs design).** How the login
  resolves *which tenant's* branding — logo, product name, brand color, and the
  white-label (hide-"Powered by") flag — **before** the user authenticates: e.g. by
  host/subdomain → organization, or a channel identifier (BCSaaS), served pre-auth
  alongside the public provider-catalog endpoint. This is what makes a user feel they're
  signing into *their org's* product (ISA's *mimo*, ASAE's *Stellar*). Includes where the
  config lives (per-tenant metadata) and the admin surface to manage it + the white-label
  entitlement.
- **Scaling to many providers (deferred — noted, not designed).** The picker is a
  vertical list sized for a handful of IdPs (the common case). Beyond ~6 it grows tall;
  revisit then with a scrollable list (`max-height` + overflow) or a search/filter.
  Flagged here so it isn't forgotten.
- **Undesigned surfaces/states** (bigger UX gaps, tracked separately): the Admin
  "Authentication Providers" management page, and the picker's **loading / error /
  redirecting** states. Real logins live or die on these.

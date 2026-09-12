/**
 * Public shapes for composing the Explorer login screen.
 *
 * The login screen is customized three ways, in increasing order of effort:
 *
 * 1. **Tokens** — every color, image and proportion on the surface comes from the
 *    `--mj-login-*` group (see `packages/Angular/Generic/shared/THEMING.md`).
 * 2. **Inputs** — copy, attribution, alignment and {@link MJLoginLayout} on
 *    `<mj-explorer-app>`, plus {@link MJLoginCard}s for extra content a deployment can
 *    express as data rather than markup.
 * 3. **Slots** — `[loginBannerContent]`, `[loginBannerFooter]`, `[loginPanelHeader]` and
 *    `[loginPanelFooter]` project arbitrary markup, following the same attribute-selector
 *    convention as MJ's page chrome (`[meta]` / `[actions]` / `[toolbar]`).
 *
 * @since 6.1.0
 */

/**
 * How the story panel and the sign-in column are arranged.
 *
 * - `'split'` — the editorial split of the stock design: story panel leading, sign-in column
 *   trailing, in the ratio the `--mj-login-*-flex` tokens set.
 * - `'split-reverse'` — the same split with the sign-in column leading. DOM order is unchanged
 *   (the story stays first for a screen reader); only the visual order flips.
 * - `'centered'` — one centered column: the story content sits on a full-bleed
 *   `--mj-login-banner-bg`, and the sign-in column becomes a card on top of it. The classic
 *   white-label sign-in page, and what the stacked (≤900px) layout already approximates.
 */
export type MJLoginLayout = 'split' | 'split-reverse' | 'centered';

/**
 * Which region of the login screen a card renders in.
 *
 * `'banner'` cards sit on the story panel's background (so they take their colors from
 * `--mj-login-banner-card-*`); `'panel'` cards sit beneath the sign-in options on the panel
 * surface (`--mj-login-card-*`). In the `'centered'` layout the regions stack, and each keeps
 * the surface it was designed against.
 */
export type MJLoginCardRegion = 'banner' | 'panel';

/**
 * One card on the login screen — a trust mark, a support route, a policy link, a feature note.
 *
 * Cards exist so that content a deployment wants to *add* does not require an Angular template:
 * a per-tenant branding record or an environment file can carry this array. Anything richer
 * than a card projects into the matching slot instead, which suppresses the cards for that
 * region (documented on the slots themselves).
 */
export interface MJLoginCard {
  /** Which region the card renders in. Defaults to `'panel'` — beneath the sign-in options. */
  region?: MJLoginCardRegion;

  /**
   * Font Awesome class for the leading icon, e.g. `'fa-solid fa-shield-halved'`. MJ uses Font
   * Awesome throughout; omit for a card with no icon.
   */
  icon?: string;

  /** The card's heading. The one required field — a card with no title has nothing to say. */
  title: string;

  /** Supporting line under the title. */
  text?: string;

  /**
   * Makes the card a link. Angular sanitizes the bound URL, so a `javascript:` href from
   * configuration is neutralized rather than executed.
   */
  href?: string;

  /**
   * Opens {@link href} in a new tab — usually what a policy or support link wants, so the
   * half-finished sign-in is not navigated away from. Implies `rel="noopener noreferrer"`.
   */
  newTab?: boolean;
}

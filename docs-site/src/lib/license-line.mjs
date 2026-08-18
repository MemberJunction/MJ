import { documentedMajor } from './documented-line.mjs';

/**
 * The license the release line THIS BUILD documents ships under.
 *
 * MemberJunction relicensed from ISC to the Business Source License 1.1 at
 * v6.0.0. Every version released before that stays ISC forever, so the docs
 * cannot state one license sitewide.
 *
 * This has to be derived rather than hardcoded because docs.yml overlays the
 * whole docs-site/ directory — hand-authored pages included — from next onto
 * every line's content checkout. A literal "BUSL 1.1" in a page would
 * therefore also render on /v5, mislabelling software that is ISC-licensed.
 *
 * @see .github/workflows/docs.yml — "Overlay docs-site tooling from the triggering commit"
 */
const BUSL_FIRST_MAJOR = 6;

/** True when this build's line ships under the BUSL rather than the ISC License. */
export const isBusl = documentedMajor >= BUSL_FIRST_MAJOR;

/**
 * Full license name, for prose and the site footer.
 *
 * Not "BUSL License" — BUSL already expands to Business Source License, so
 * that phrasing reads "Business Source License License".
 */
export const licenseName = isBusl ? 'Business Source License 1.1' : 'ISC License';

/** Short form for the landing badge, where the full name overflows the pill. */
export const licenseShort = isBusl ? 'BUSL 1.1' : 'ISC';

/** How the source model is described in badges: BUSL is source-available, not open source. */
export const sourceModel = isBusl ? 'Source Available' : 'Open Source';

/**
 * Where this line's LICENSE file lives on GitHub.
 *
 * A pre-BUSL line must not link at the default branch: that file now carries
 * the BUSL, so the link would hand an ISC user the wrong license. Those lines
 * are maintained on their own lts/N branch, which still carries the ISC text.
 */
export const licenseUrl = isBusl
  ? 'https://github.com/MemberJunction/MJ/blob/main/LICENSE'
  : `https://github.com/MemberJunction/MJ/blob/lts/${documentedMajor}/LICENSE`;

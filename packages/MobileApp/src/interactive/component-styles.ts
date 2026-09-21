/**
 * @fileoverview The `styles` prop interactive components receive on mobile.
 *
 * ## The gap this closes
 *
 * `MJReactComponent` bridges the host's live MJ theme into `ComponentStyles` and then layers the
 * spec's own `styleOverrides` on top, so a component reads `styles.colors.primary` and gets the
 * deployment's brand colour, and an agent asked for "blue charts" produces blue charts. Mobile
 * passed `undefined`, which `buildComponentProps` turns into the runtime's frozen defaults — a
 * purple palette that is not MJ's, and `styleOverrides` silently discarded.
 *
 * ## Why the mapping is not repeated here
 *
 * The web reads `--mj-*` custom properties off the document. React Native has no stylesheet, but it
 * has the same token VALUES — `src/theme/tokens.ts` mirrors `_tokens.scss` deliberately. So rather
 * than restate which token feeds `colors.primary`, this passes a reader into the runtime's own
 * `BuildStylesFromTheme`, which walks the same table the browser walks. One mapping, two hosts.
 *
 * Tokens this app does not define fall back to the runtime's defaults, exactly as they do for a web
 * page whose theme omits them.
 */

import { ApplyStyleOverrides, BuildStylesFromTheme } from '@memberjunction/react-runtime';
import type { ComponentSpec } from '@memberjunction/react-runtime';
// `ComponentStyles` is defined by the component contract itself, so it comes from the contract
// package rather than from the runtime that happens to build one.
import type { ComponentStyles } from '@memberjunction/interactive-component-types';
import { Colors } from '@/theme/tokens';

/**
 * This app's `--mj-*` token values, keyed by the token name the runtime's mapping asks for.
 *
 * Only the tokens `src/theme/tokens.ts` actually carries appear here. Inventing values for the rest
 * would be worse than omitting them: a wrong brand colour is harder to notice than a default one,
 * and the runtime already has a considered default for every slot.
 *
 * The chart palette is deliberately absent — this app has no `--mj-viz-*` mirror, and a palette
 * guessed from the UI accent ramp would not match what the same component draws on the web. Until
 * the viz tokens are mirrored, components get the runtime's palette, which is at least the same one
 * everywhere.
 */
const MJ_TOKENS: Readonly<Record<string, string>> = {
    // Brand
    '--mj-brand-primary': Colors.brand,
    '--mj-brand-primary-hover': Colors.brandHover,
    '--mj-brand-primary-light': Colors.brandSoft,

    // Surfaces
    '--mj-bg-page': Colors.bg,
    '--mj-bg-surface': Colors.surface,
    '--mj-bg-surface-hover': Colors.userBg,

    // Text
    '--mj-text-primary': Colors.ink,
    '--mj-text-secondary': Colors.ink2,
    '--mj-text-muted': Colors.ink3,
    '--mj-text-inverse': Colors.inverse,

    // Borders
    '--mj-border-subtle': Colors.line,
    '--mj-border-default': Colors.line2,
    '--mj-border-strong': Colors.line3,
};

/**
 * Builds the `styles` prop for a component, theme first and the spec's own requests on top.
 *
 * @param spec The spec being rendered; its `styleOverrides` are applied last.
 * @returns A full `ComponentStyles`, never partial — components index into it without guarding.
 */
export function BuildMobileComponentStyles(spec: ComponentSpec | null | undefined): ComponentStyles {
    const base = BuildStylesFromTheme((token) => MJ_TOKENS[token]);
    // Overrides come from the generation pipeline as data — the reason a component never carries a
    // hardcoded colour for "make the charts blue". Applied above the theme because they are an
    // explicit request, not a deployment preference.
    return ApplyStyleOverrides(base, spec?.styleOverrides);
}

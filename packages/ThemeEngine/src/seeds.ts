/**
 * @fileoverview The brand "seed" set (org theming decision #2 / proposal 16.5):
 * a theme stores ~8 seeds, NOT tokens. The full --mj-* contract is derived from
 * these at load. A theme is a *brand*; light/dark is the user's mode layered under
 * it, so seeds carry no per-mode values.
 * @module @memberjunction/theme-engine
 */

/** The small set of brand inputs an org actually authors. Only `primary` is required. */
export interface ThemeSeeds {
  /** Primary brand hue anchor (hex). Placed at the brand-500 slot. */
  primary: string;
  /** Accent hue anchor (hex) — light highlights/emphasis. Defaults to `primary`. */
  accent?: string;
  /** Optional tertiary hue anchor (hex) — secondary actions/info. Defaults to `accent`. */
  tertiary?: string;
  /**
   * Neutral character (audit G2): OKLCH chroma of the mid-neutral, i.e. how much
   * brand hue bleeds into the gray stack. 0 = pure gray, ~0.08 = strongly tinted.
   * Default 0.037 reproduces MJ's slate neutrals.
   */
  neutralChroma?: number;
  /**
   * Vibrancy: global saturation multiplier for the brand/accent/tertiary ramps.
   * 1 = as-seeded; <1 muted, >1 punchier. Default 1.
   */
  vibrancy?: number;
  /** Shape: base corner radius in px, mapped to --mj-radius-md. Default 8. */
  radius?: number;
  /**
   * Depth (audit G3): elevation intensity 0..1 driving brand-tinted shadow
   * strength. 1 reproduces MJ's brand shadows. Default 1.
   */
  depth?: number;
  /** Type (audit G1): body font stack -> --mj-font-family. Default MJ Inter stack. */
  fontFamily?: string;
  /** Monospace font stack -> --mj-font-family-mono. */
  fontFamilyMono?: string;
  /**
   * Viz (audit G4): explicit categorical chart palette override. When omitted the
   * palette is derived by rotating hue around the brand.
   */
  vizPalette?: string[];
}

/** Seeds with every optional field resolved to its default. */
export type ResolvedSeeds = Required<Omit<ThemeSeeds, 'vizPalette'>> & Pick<ThemeSeeds, 'vizPalette'>;

const MJ_FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MJ_FONT_MONO = "'JetBrains Mono', 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace";

/**
 * Seeds that, when derived, reproduce MJ's own default theme within tolerance.
 * Used as the fixture for the reproduction test and as the fallback theme.
 */
export const MJ_DEFAULT_SEEDS: ThemeSeeds = {
  primary: '#0076b6',
  accent: '#5cc0ed',
  tertiary: '#06b6d4',
  neutralChroma: 0.037,
  vibrancy: 1,
  radius: 8,
  depth: 1,
  fontFamily: MJ_FONT,
  fontFamilyMono: MJ_FONT_MONO,
};

/** Fill in seed defaults. */
export function resolveSeeds(seeds: ThemeSeeds): ResolvedSeeds {
  const accent = seeds.accent ?? seeds.primary;
  return {
    primary: seeds.primary,
    accent,
    tertiary: seeds.tertiary ?? accent,
    neutralChroma: seeds.neutralChroma ?? 0.037,
    vibrancy: seeds.vibrancy ?? 1,
    radius: seeds.radius ?? 8,
    depth: seeds.depth ?? 1,
    fontFamily: seeds.fontFamily ?? MJ_FONT,
    fontFamilyMono: seeds.fontFamilyMono ?? MJ_FONT_MONO,
    vizPalette: seeds.vizPalette,
  };
}

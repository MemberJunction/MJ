/**
 * @fileoverview Perceptual ramp generation (audit G5). Each brand family carries a
 * measured OKLCH "shape" (per-step lightness + chroma) lifted from MJ's own default
 * ramps. A seed supplies the HUE (and a chroma scale relative to the family anchor);
 * we re-hue the shape and rescale its chroma. Feeding MJ's own seeds back therefore
 * reproduces MJ's ramps within rounding tolerance, while any other hue inherits MJ's
 * proven, perceptually-uniform lightness structure.
 * @module @memberjunction/theme-engine
 */

import { hexToOKLCH, oklchToHex, OKLCH } from './color.js';

/** One step of a ramp: its numeric key (50..950) and its measured OKLCH L/C. */
export interface RampStop {
  step: number;
  L: number;
  C: number;
}

/** Measured shape of MJ's primary blue ramp. `anchor` is the step the seed maps to. */
export const BRAND_SHAPE: RampStop[] = [
  { step: 50, L: 0.9562, C: 0.016 },
  { step: 100, L: 0.8687, C: 0.0488 },
  { step: 200, L: 0.7832, C: 0.0801 },
  { step: 300, L: 0.7017, C: 0.1074 },
  { step: 350, L: 0.6361, C: 0.117 },
  { step: 400, L: 0.6447, C: 0.1229 },
  { step: 450, L: 0.5952, C: 0.1237 },
  { step: 500, L: 0.544, C: 0.1322 },
  { step: 600, L: 0.5033, C: 0.1211 },
  { step: 700, L: 0.448, C: 0.1064 },
  { step: 800, L: 0.391, C: 0.0911 },
  { step: 900, L: 0.254, C: 0.0633 },
];

/** Measured shape of MJ's accent ramp. Accent seed maps to the 400 slot. */
export const ACCENT_SHAPE: RampStop[] = [
  { step: 50, L: 0.9791, C: 0.0125 },
  { step: 100, L: 0.9554, C: 0.025 },
  { step: 200, L: 0.9055, C: 0.0555 },
  { step: 300, L: 0.894, C: 0.0686 },
  { step: 400, L: 0.7656, C: 0.1131 },
  { step: 500, L: 0.6927, C: 0.1209 },
  { step: 600, L: 0.6167, C: 0.1171 },
  { step: 700, L: 0.5217, C: 0.0983 },
  { step: 800, L: 0.4533, C: 0.0822 },
  { step: 900, L: 0.3998, C: 0.0696 },
];

/** Measured shape of MJ's tertiary cyan ramp. Tertiary seed maps to the 500 slot. */
export const TERTIARY_SHAPE: RampStop[] = [
  { step: 50, L: 0.9841, C: 0.0189 },
  { step: 100, L: 0.9563, C: 0.0443 },
  { step: 200, L: 0.9167, C: 0.0772 },
  { step: 300, L: 0.8651, C: 0.1153 },
  { step: 400, L: 0.7971, C: 0.1339 },
  { step: 500, L: 0.7148, C: 0.1257 },
  { step: 600, L: 0.6089, C: 0.1109 },
  { step: 700, L: 0.5198, C: 0.0936 },
  { step: 800, L: 0.45, C: 0.0771 },
  { step: 900, L: 0.3982, C: 0.0664 },
];

/** Measured shape of MJ's slate neutral ramp. Chroma is driven by the `neutralChroma` seed. */
export const NEUTRAL_SHAPE: RampStop[] = [
  { step: 0, L: 1, C: 0 },
  { step: 50, L: 0.9842, C: 0.0034 },
  { step: 100, L: 0.9683, C: 0.0069 },
  { step: 200, L: 0.9288, C: 0.0126 },
  { step: 300, L: 0.869, C: 0.0198 },
  { step: 400, L: 0.7107, C: 0.0351 },
  { step: 500, L: 0.5544, C: 0.0407 },
  { step: 600, L: 0.4455, C: 0.0374 },
  { step: 700, L: 0.3717, C: 0.0392 },
  { step: 800, L: 0.2795, C: 0.0368 },
  { step: 900, L: 0.2077, C: 0.0398 },
  { step: 950, L: 0.1288, C: 0.0406 },
];

/** Chroma of the neutral shape at its mid step, i.e. the `neutralChroma` reference point. */
export const NEUTRAL_REFERENCE_CHROMA = 0.0407;

/** The step in each brand family that its seed color represents. */
export const FAMILY_ANCHOR: Record<'brand' | 'accent' | 'tertiary', number> = {
  brand: 500,
  accent: 400,
  tertiary: 500,
};

/**
 * Re-hue and re-scale a family shape from a seed color. Every step keeps the shape's
 * lightness; its hue becomes the seed's hue; its chroma is the shape chroma scaled so
 * the anchor step matches the seed's chroma, times `vibrancy`.
 */
export function generateBrandRamp(
  shape: RampStop[],
  anchorStep: number,
  seedHex: string,
  vibrancy: number,
): Record<number, string> {
  const seed = hexToOKLCH(seedHex);
  const anchorC = shape.find((s) => s.step === anchorStep)?.C ?? 1;
  const chromaScale = (anchorC > 0 ? seed.c / anchorC : 1) * vibrancy;
  const out: Record<number, string> = {};
  for (const stop of shape) {
    const color: OKLCH = { l: stop.L, c: stop.C * chromaScale, h: seed.h };
    out[stop.step] = oklchToHex(color);
  }
  return out;
}

/**
 * The neutral ramp: shape lightness preserved, hue bled from the brand (G2), chroma
 * scaled to the requested `neutralChroma` mid-target.
 */
export function generateNeutralRamp(brandHueDeg: number, neutralChroma: number): Record<number, string> {
  const chromaScale = neutralChroma / NEUTRAL_REFERENCE_CHROMA;
  const out: Record<number, string> = {};
  for (const stop of NEUTRAL_SHAPE) {
    out[stop.step] = oklchToHex({ l: stop.L, c: stop.C * chromaScale, h: brandHueDeg });
  }
  return out;
}

/**
 * @fileoverview Per-mode accessibility validation (proposal 8 / 16.4.4). Runs WCAG
 * contrast on the brand-critical foreground/background pairs — including hover
 * states — and, when a pair fails, computes a concrete clamp: the nearest lightness
 * for the offending color that reaches the target ratio.
 * @module @memberjunction/theme-engine
 */

import { contrastRatio, hexToOKLCH, oklchToHex, relativeLuminance } from './color.js';

/** WCAG AA thresholds. Normal text 4.5:1; large text / UI affordances 3:1. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

/** One evaluated contrast pair. */
export interface ContrastCheck {
  /** Human-readable pair name, e.g. "text-on-primary (hover)". */
  name: string;
  /** Foreground hex. */
  fg: string;
  /** Background hex. */
  bg: string;
  /** Achieved ratio (1..21). */
  ratio: number;
  /** Required ratio for this pair. */
  required: number;
  passes: boolean;
  /**
   * When failing, a suggested replacement for `clampTarget` ('bg' or 'fg') that
   * reaches `required` by shifting lightness, or null if unreachable in gamut.
   */
  suggestion?: { adjust: 'fg' | 'bg'; hex: string } | null;
}

/** Full report across both user modes. `passes` is true only if every pair passes. */
export interface ContrastReport {
  light: ContrastCheck[];
  dark: ContrastCheck[];
  passes: boolean;
}

/** A pair to evaluate; `clamp` names which side to move if it fails. */
export interface PairSpec {
  name: string;
  fg: string;
  bg: string;
  required: number;
  clamp: 'fg' | 'bg';
}

/**
 * Search OKLCH lightness of `color` (away from `other`'s luminance) for the nearest
 * value that reaches `target` contrast against `other`. Returns null if unreachable.
 */
function clampLightness(color: string, other: string, target: number): string | null {
  const base = hexToOKLCH(color);
  // Move away from the other color's luminance: if we're already the darker of the
  // pair, get darker still; otherwise get lighter. (Moving toward it lowers contrast.)
  const goDarker = relativeLuminance(color) <= relativeLuminance(other);
  const steps = 100;
  for (let i = 1; i <= steps; i++) {
    const l = goDarker ? base.l - (base.l * i) / steps : base.l + ((1 - base.l) * i) / steps;
    const candidate = oklchToHex({ l, c: base.c, h: base.h });
    if (contrastRatio(candidate, other) >= target) return candidate;
  }
  return null;
}

/** Evaluate one list of pairs. */
function evaluate(pairs: PairSpec[]): ContrastCheck[] {
  return pairs.map((p) => {
    const ratio = contrastRatio(p.fg, p.bg);
    const passes = ratio >= p.required;
    const check: ContrastCheck = {
      name: p.name,
      fg: p.fg,
      bg: p.bg,
      ratio: Math.round(ratio * 100) / 100,
      required: p.required,
      passes,
    };
    if (!passes) {
      const moving = p.clamp === 'fg' ? p.fg : p.bg;
      const against = p.clamp === 'fg' ? p.bg : p.fg;
      const hex = clampLightness(moving, against, p.required);
      check.suggestion = hex ? { adjust: p.clamp, hex } : null;
    }
    return check;
  });
}

/** Build and evaluate the report from resolved per-mode token maps. */
export function buildContrastReport(
  light: Record<string, string>,
  dark: Record<string, string>,
): ContrastReport {
  const pairsFor = (t: Record<string, string>): PairSpec[] => [
    { name: 'text-on-primary', fg: t['--mj-brand-on-primary'], bg: t['--mj-brand-primary'], required: AA_LARGE, clamp: 'bg' },
    { name: 'text-on-primary (hover)', fg: t['--mj-brand-on-primary'], bg: t['--mj-brand-primary-hover'], required: AA_LARGE, clamp: 'bg' },
    { name: 'text-on-accent', fg: t['--mj-brand-on-accent'], bg: t['--mj-brand-accent'], required: AA_LARGE, clamp: 'bg' },
    { name: 'text-primary-on-surface', fg: t['--mj-text-primary'], bg: t['--mj-bg-surface'], required: AA_TEXT, clamp: 'fg' },
    { name: 'text-secondary-on-surface', fg: t['--mj-text-secondary'], bg: t['--mj-bg-surface'], required: AA_TEXT, clamp: 'fg' },
    { name: 'link-on-surface', fg: t['--mj-text-link'], bg: t['--mj-bg-surface'], required: AA_TEXT, clamp: 'fg' },
    { name: 'link-on-surface (hover)', fg: t['--mj-text-link-hover'], bg: t['--mj-bg-surface'], required: AA_TEXT, clamp: 'fg' },
  ];
  const l = evaluate(pairsFor(light));
  const d = evaluate(pairsFor(dark));
  return { light: l, dark: d, passes: [...l, ...d].every((c) => c.passes) };
}

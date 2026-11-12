/**
 * @fileoverview Per-mode accessibility validation (proposal 8 / 16.4.4). Runs WCAG
 * contrast on the brand-critical foreground/background pairs — including hover
 * states — and, when a pair fails, computes a concrete clamp: the nearest lightness
 * for the offending color that reaches the target ratio.
 * @module @memberjunction/theme-engine
 */

import { ContrastRatio, HexToOKLCH, OklchToHex, RelativeLuminance } from './color.js';

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
  const base = HexToOKLCH(color);
  // Move away from the other color's luminance: if we're already the darker of the
  // pair, get darker still; otherwise get lighter. (Moving toward it lowers contrast.)
  const goDarker = RelativeLuminance(color) <= RelativeLuminance(other);
  const steps = 100;
  for (let i = 1; i <= steps; i++) {
    const l = goDarker ? base.l - (base.l * i) / steps : base.l + ((1 - base.l) * i) / steps;
    const candidate = OklchToHex({ l, c: base.c, h: base.h });
    if (ContrastRatio(candidate, other) >= target) return candidate;
  }
  return null;
}

/** Evaluate one list of pairs. */
function evaluate(pairs: PairSpec[]): ContrastCheck[] {
  return pairs.map((p) => {
    const ratio = ContrastRatio(p.fg, p.bg);
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
export function BuildContrastReport(
  light: Record<string, string>,
  dark: Record<string, string>,
): ContrastReport {
  const pairsFor = (t: Record<string, string>): PairSpec[] => {
    const canvasBg = t['--mj-bg-canvas'];
    const sunkenBg = t['--mj-surface-sunken-bg'] ?? t['--mj-bg-surface-sunken'];
    const baseBg = t['--mj-surface-base-bg'] ?? t['--mj-bg-surface'];
    const elevatedBg = t['--mj-surface-elevated-bg'] ?? t['--mj-bg-surface-elevated'] ?? t['--mj-bg-surface'];
    const overlayBg = t['--mj-surface-overlay-bg'] ?? t['--mj-bg-surface-overlay'] ?? elevatedBg;

    const pairs: PairSpec[] = [
      { name: 'text-on-primary', fg: t['--mj-brand-on-primary'], bg: t['--mj-brand-primary'], required: AA_LARGE, clamp: 'bg' },
      { name: 'text-on-primary (hover)', fg: t['--mj-brand-on-primary'], bg: t['--mj-brand-primary-hover'], required: AA_LARGE, clamp: 'bg' },
      { name: 'text-on-accent', fg: t['--mj-brand-on-accent'], bg: t['--mj-brand-accent'], required: AA_LARGE, clamp: 'bg' },
      { name: 'text-primary-on-surface', fg: t['--mj-text-primary'], bg: baseBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'text-secondary-on-surface', fg: t['--mj-surface-base-text-secondary'] ?? t['--mj-text-secondary'], bg: baseBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'text-muted-on-surface', fg: t['--mj-surface-base-text-muted'] ?? t['--mj-text-muted'] ?? t['--mj-text-secondary'], bg: baseBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'link-on-surface', fg: t['--mj-surface-base-text-link'] ?? t['--mj-text-link'], bg: baseBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'link-on-surface (hover)', fg: t['--mj-surface-base-text-link-hover'] ?? t['--mj-text-link-hover'], bg: baseBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'text-primary-on-elevated', fg: t['--mj-text-primary'], bg: elevatedBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'text-secondary-on-elevated', fg: t['--mj-surface-elevated-text-secondary'] ?? t['--mj-text-secondary'], bg: elevatedBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'text-muted-on-elevated', fg: t['--mj-surface-elevated-text-muted'] ?? t['--mj-text-muted'] ?? t['--mj-text-secondary'], bg: elevatedBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'link-on-elevated', fg: t['--mj-surface-elevated-text-link'] ?? t['--mj-text-link'], bg: elevatedBg, required: AA_TEXT, clamp: 'fg' },
      { name: 'link-on-elevated (hover)', fg: t['--mj-surface-elevated-text-link-hover'] ?? t['--mj-text-link-hover'], bg: elevatedBg, required: AA_TEXT, clamp: 'fg' },
    ];

    if (canvasBg && t['--mj-text-primary'] && t['--mj-text-secondary']) {
      pairs.push(
        { name: 'text-primary-on-canvas', fg: t['--mj-text-primary'], bg: canvasBg, required: AA_TEXT, clamp: 'fg' },
        { name: 'text-secondary-on-canvas', fg: t['--mj-text-secondary'], bg: canvasBg, required: AA_TEXT, clamp: 'fg' },
      );
    }
    if (sunkenBg && t['--mj-text-primary']) {
      pairs.push(
        { name: 'text-primary-on-sunken', fg: t['--mj-text-primary'], bg: sunkenBg, required: AA_TEXT, clamp: 'fg' },
        { name: 'text-secondary-on-sunken', fg: t['--mj-surface-sunken-text-secondary'] ?? t['--mj-text-secondary'], bg: sunkenBg, required: AA_TEXT, clamp: 'fg' },
      );
    }
    if (overlayBg && t['--mj-text-primary']) {
      pairs.push(
        { name: 'text-primary-on-overlay', fg: t['--mj-text-primary'], bg: overlayBg, required: AA_TEXT, clamp: 'fg' },
        { name: 'text-secondary-on-overlay', fg: t['--mj-surface-overlay-text-secondary'] ?? t['--mj-surface-elevated-text-secondary'] ?? t['--mj-text-secondary'], bg: overlayBg, required: AA_TEXT, clamp: 'fg' },
        { name: 'text-muted-on-overlay', fg: t['--mj-surface-overlay-text-muted'] ?? t['--mj-surface-elevated-text-muted'] ?? t['--mj-text-muted'] ?? t['--mj-text-secondary'], bg: overlayBg, required: AA_TEXT, clamp: 'fg' },
        { name: 'link-on-overlay', fg: t['--mj-surface-overlay-text-link'] ?? t['--mj-surface-elevated-text-link'] ?? t['--mj-text-link'], bg: overlayBg, required: AA_TEXT, clamp: 'fg' },
        { name: 'link-on-overlay (hover)', fg: t['--mj-surface-overlay-text-link-hover'] ?? t['--mj-surface-elevated-text-link-hover'] ?? t['--mj-text-link-hover'], bg: overlayBg, required: AA_TEXT, clamp: 'fg' },
      );
    }

    return pairs;
  };
  const l = evaluate(pairsFor(light));
  const d = evaluate(pairsFor(dark));
  return { light: l, dark: d, passes: [...l, ...d].every((c) => c.passes) };
}

/** @deprecated Use {@link BuildContrastReport}. */
export function buildContrastReport(
  light: Record<string, string>,
  dark: Record<string, string>,
): ContrastReport {
  return BuildContrastReport(light, dark);
}

/** Alias for {@link BuildContrastReport} matching Phase 0 WS6b spec naming. */
export const CheckDerivedThemeContrast = BuildContrastReport;

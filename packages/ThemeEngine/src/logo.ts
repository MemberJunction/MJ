/**
 * @fileoverview Logo validation for the theme pipeline (proposal 16.6). Logos are
 * variant uploads, never recolored — so validation only checks that an upload FITS
 * its slot (type, size, dimensions, aspect ratio) and, for SVGs, reports whether the
 * artwork is detectably single-fill (the only case where "treat as monochrome" is
 * offered). Framework-agnostic: no DOM, no network — it takes already-extracted file
 * facts, so the Angular uploader and a future server endpoint share one rule set.
 * @module @memberjunction/theme-engine
 */

/** A theme's logo variant URLs + header geometry, for overlay emission (16.6). */
export interface ThemeLogos {
  /** Logo mark for light surfaces -> --mj-logo-mark (light mode). */
  lightMarkURL?: string;
  /** Logo mark for dark surfaces -> --mj-logo-mark (dark mode). Enables the mode swap. */
  darkMarkURL?: string;
  /** Full wordmark -> --mj-logo-wordmark. */
  wordmarkURL?: string;
  /** Single-fill monochrome variant -> --mj-logo-mono. */
  monochromeURL?: string;
  /** Header mark box width in px -> --mj-logo-width. */
  width?: number;
  /** Header mark box height in px -> --mj-logo-height. */
  height?: number;
}

/** Escape a URL for safe embedding inside a CSS `url("...")` value. */
function cssUrl(u: string): string {
  return `url("${u.replace(/["\\\n]/g, encodeURIComponent)}")`;
}

/**
 * Emit the logo overlay CSS for a theme (org-theming Phase 4). Logos are variant
 * uploads, never recolored (16.6): dark mode *swaps artwork* via a mode-specific
 * block, and when only one variant exists we emit a light `--mj-logo-plate-bg` in
 * dark mode so the single mark stays legible on a plate (no filter transforms).
 *
 * Returns CSS scoped to `[data-theme-overlay="<id>"]` (+ a dark companion block);
 * append it to the color overlay so one Blob carries the whole brand.
 */
export function emitLogoOverlayCss(themeId: string, logos: ThemeLogos): string {
  const sel = `[data-theme-overlay="${themeId}"]`;
  const base: string[] = [];
  if (logos.lightMarkURL) {
    base.push(`--mj-logo-mark: ${cssUrl(logos.lightMarkURL)};`);
    // --mj-logo-mark-inverse is the light-on-dark artwork; fall back to the light mark.
    base.push(`--mj-logo-mark-inverse: ${cssUrl(logos.darkMarkURL ?? logos.lightMarkURL)};`);
  }
  if (logos.wordmarkURL) base.push(`--mj-logo-wordmark: ${cssUrl(logos.wordmarkURL)};`);
  if (logos.monochromeURL) base.push(`--mj-logo-mono: ${cssUrl(logos.monochromeURL)};`);
  if (logos.width) base.push(`--mj-logo-width: ${Math.round(logos.width)}px;`);
  if (logos.height) base.push(`--mj-logo-height: ${Math.round(logos.height)}px;`);

  let css = base.length ? `${sel} {\n  ${base.join('\n  ')}\n}\n` : '';

  if (logos.darkMarkURL) {
    // Dark mode swaps to the dark-surface artwork.
    css += `${sel}[data-theme="dark"] {\n  --mj-logo-mark: ${cssUrl(logos.darkMarkURL)};\n}\n`;
  } else if (logos.lightMarkURL) {
    // Only a light-surface mark exists: plate it on white in dark mode so it stays legible.
    css += `${sel}[data-theme="dark"] {\n  --mj-logo-plate-bg: #ffffff;\n}\n`;
  }

  return css;
}

/** The four logo variant slots a theme can carry (16.6). */
export type LogoSlot = 'mark' | 'wordmark' | 'monochrome';

/** File facts the caller extracts (byte length, mime, intrinsic size, SVG source). */
export interface LogoInput {
  slot: LogoSlot;
  /** MIME type, e.g. 'image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'. */
  mime: string;
  /** File size in bytes. */
  byteLength: number;
  /** Raw SVG markup (when the upload is an SVG) — enables single-fill detection. */
  svgText?: string;
  /** Intrinsic width in px (raster pixels, or the SVG viewBox/width). */
  width?: number;
  /** Intrinsic height in px. */
  height?: number;
}

/** Outcome of validating one upload. `ok` is false when there is any error. */
export interface LogoValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** True only for an SVG with at most one distinct fill/stroke color. */
  isSingleFillSvg: boolean;
  /** width / height when both are known. */
  aspectRatio?: number;
}

/** Per-slot rules. Aspect ranges bound the header/wordmark geometry. */
interface SlotRule {
  maxBytes: number;
  /** Minimum raster dimension (px) on the smaller side; SVG is resolution-free. */
  rasterMinPx: number;
  /** Inclusive [min, max] width/height ratio. */
  aspect: [number, number];
}

const RULES: Record<LogoSlot, SlotRule> = {
  // Header mark: roughly square up to ~2:1 landscape.
  mark: { maxBytes: 512 * 1024, rasterMinPx: 64, aspect: [0.5, 2.0] },
  // Wordmark: wide lockup.
  wordmark: { maxBytes: 1024 * 1024, rasterMinPx: 24, aspect: [2.0, 10.0] },
  // Monochrome: same envelope as the mark.
  monochrome: { maxBytes: 512 * 1024, rasterMinPx: 64, aspect: [0.5, 2.0] },
};

const SVG_MIME = 'image/svg+xml';
const ACCEPTED_RASTER = ['image/png', 'image/webp', 'image/jpeg'];

/** Pull an intrinsic width/height from an SVG's viewBox (preferred) or width/height. */
export function svgDimensions(svgText: string): { width?: number; height?: number } {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s*["']/i.exec(svgText);
  if (vb) return { width: parseFloat(vb[1]), height: parseFloat(vb[2]) };
  const w = /\bwidth\s*=\s*["']\s*([\d.]+)/i.exec(svgText);
  const h = /\bheight\s*=\s*["']\s*([\d.]+)/i.exec(svgText);
  return { width: w ? parseFloat(w[1]) : undefined, height: h ? parseFloat(h[1]) : undefined };
}

/**
 * Detect whether an SVG paints with at most one color — the only case where
 * recoloring to a single monochrome tint is safe. `none` and `currentColor` are
 * ignored (they carry no fixed hue); a gradient or >1 distinct color is not single-fill.
 */
export function isSingleFillSvg(svgText: string): boolean {
  if (/<(linear|radial)Gradient|url\(#/i.test(svgText)) return false;
  const colors = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const v = raw.trim().toLowerCase();
    if (!v || v === 'none' || v === 'currentcolor' || v === 'transparent' || v === 'inherit') return;
    colors.add(v);
  };
  // fill="..."/stroke="..." attributes and fill:/stroke: within style="..."
  for (const m of svgText.matchAll(/\b(?:fill|stroke)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of svgText.matchAll(/(?:fill|stroke)\s*:\s*([^;"'}]+)/gi)) add(m[1]);
  return colors.size <= 1;
}

/** Validate one logo upload against its slot's rules. */
export function validateLogo(input: LogoInput): LogoValidationResult {
  const rule = RULES[input.slot];
  const errors: string[] = [];
  const warnings: string[] = [];
  const isSvg = input.mime === SVG_MIME;

  if (!isSvg && !ACCEPTED_RASTER.includes(input.mime)) {
    errors.push(`Unsupported file type "${input.mime}". Use SVG (preferred), PNG, or WebP.`);
  }
  if (input.byteLength > rule.maxBytes) {
    errors.push(`File is ${(input.byteLength / 1024).toFixed(0)} KB; the ${input.slot} limit is ${(rule.maxBytes / 1024).toFixed(0)} KB.`);
  }

  let { width, height } = input;
  if (isSvg && input.svgText && (width === undefined || height === undefined)) {
    const d = svgDimensions(input.svgText);
    width = width ?? d.width;
    height = height ?? d.height;
  }

  if (!isSvg) {
    warnings.push('SVG is preferred for logos — it stays crisp at every size.');
    if (input.mime === 'image/jpeg') {
      warnings.push('JPEG has no transparency; it will show a rectangular background on colored surfaces.');
    }
    if (width !== undefined && height !== undefined) {
      if (Math.min(width, height) < rule.rasterMinPx) {
        errors.push(`Raster logo is ${width}×${height}px; the ${input.slot} needs at least ${rule.rasterMinPx}px on the smaller side.`);
      }
    } else {
      warnings.push('Could not read the image dimensions to validate size/aspect ratio.');
    }
  }

  let aspectRatio: number | undefined;
  if (width && height) {
    aspectRatio = width / height;
    const [lo, hi] = rule.aspect;
    if (aspectRatio < lo || aspectRatio > hi) {
      errors.push(
        `Aspect ratio ${aspectRatio.toFixed(2)}:1 does not fit the ${input.slot} slot (expected ${lo}:1 to ${hi}:1). ` +
          (input.slot === 'wordmark' ? 'Wordmarks should be a wide lockup.' : 'Use a squarer mark for the header.'),
      );
    }
  }

  const singleFill = isSvg && !!input.svgText && isSingleFillSvg(input.svgText);

  return { ok: errors.length === 0, errors, warnings, isSingleFillSvg: singleFill, aspectRatio };
}

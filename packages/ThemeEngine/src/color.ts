/**
 * @fileoverview Color math for the theme engine: sRGB <-> OKLab <-> OKLCH
 * conversions (Bjorn Ottosson's OKLab), gamut clamping, and WCAG 2.x contrast.
 * Dependency-free so the derivation module stays importable in any runtime.
 * @module @memberjunction/theme-engine
 */

/** A color in the OKLCH space. `l` 0..1, `c` >= 0 (chroma), `h` 0..360 degrees. */
export interface OKLCH {
  l: number;
  c: number;
  h: number;
}

/** Linear-light RGB, each channel 0..1. */
interface LinearRGB {
  r: number;
  g: number;
  b: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Parse `#rgb` / `#rrggbb` into 0..255 channels. Throws on anything else. */
export function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`Not a hex color: "${hex}"`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex2 = (n: number): string => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');

/** sRGB gamma-encoded channel (0..1) -> linear. */
const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** Linear channel (0..1) -> sRGB gamma-encoded. */
const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

function hexToLinear(hex: string): LinearRGB {
  const { r, g, b } = parseHex(hex);
  return { r: srgbToLinear(r / 255), g: srgbToLinear(g / 255), b: srgbToLinear(b / 255) };
}

function linearToOKLab(rgb: LinearRGB): { L: number; a: number; b: number } {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function okLabToLinear(L: number, a: number, b: number): LinearRGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** Convert a hex color to OKLCH. */
export function hexToOKLCH(hex: string): OKLCH {
  const { L, a, b } = linearToOKLab(hexToLinear(hex));
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/**
 * Convert OKLCH to a hex string. If the color falls outside the sRGB gamut we
 * reduce chroma toward the achromatic axis (preserving L and H) until it fits,
 * then hard-clamp any residual channel error. This keeps hues perceptually
 * stable instead of the hue-shifting that naive per-channel clamping causes.
 */
export function oklchToHex(color: OKLCH): string {
  const { l } = color;
  let { c } = color;
  const hRad = (color.h * Math.PI) / 180;
  const cos = Math.cos(hRad);
  const sin = Math.sin(hRad);

  const fits = (chroma: number): LinearRGB | null => {
    const rgb = okLabToLinear(l, chroma * cos, chroma * sin);
    const eps = 1e-4;
    if (rgb.r >= -eps && rgb.r <= 1 + eps && rgb.g >= -eps && rgb.g <= 1 + eps && rgb.b >= -eps && rgb.b <= 1 + eps) {
      return rgb;
    }
    return null;
  };

  let rgb = fits(c);
  if (!rgb) {
    // Binary-search the largest in-gamut chroma at this L/H.
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    c = lo;
    rgb = okLabToLinear(l, c * cos, c * sin);
  }
  return `#${toHex2(linearToSrgb(rgb.r))}${toHex2(linearToSrgb(rgb.g))}${toHex2(linearToSrgb(rgb.b))}`;
}

/** WCAG 2.x relative luminance (0..1) of a hex color. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const lin = (v: number) => srgbToLinear(v / 255);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio (1..21) between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Perceptual distance (Euclidean in OKLab) between two hex colors. */
export function deltaEOK(a: string, b: string): number {
  const A = linearToOKLab(hexToLinear(a));
  const B = linearToOKLab(hexToLinear(b));
  return Math.sqrt((A.L - B.L) ** 2 + (A.a - B.a) ** 2 + (A.b - B.b) ** 2);
}

/** Mix two hex colors in linear-light space; `t` 0..1 is the weight of `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToLinear(a);
  const B = hexToLinear(b);
  const k = clamp01(t);
  return `#${toHex2(linearToSrgb(A.r + (B.r - A.r) * k))}${toHex2(
    linearToSrgb(A.g + (B.g - A.g) * k),
  )}${toHex2(linearToSrgb(A.b + (B.b - A.b) * k))}`;
}

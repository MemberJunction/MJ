import { describe, expect, it } from 'vitest';
import { emitLogoOverlayCss, isSingleFillSvg, svgDimensions, validateLogo } from '../logo.js';

const svg = (body: string, vb = '0 0 64 64') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

describe('svgDimensions', () => {
  it('reads the viewBox', () => {
    expect(svgDimensions(svg('', '0 0 120 40'))).toEqual({ width: 120, height: 40 });
  });
  it('falls back to width/height attributes', () => {
    expect(svgDimensions('<svg width="200" height="50"></svg>')).toEqual({ width: 200, height: 50 });
  });
});

describe('isSingleFillSvg', () => {
  it('is true for one fill color', () => {
    expect(isSingleFillSvg(svg('<path fill="#0076b6" d="M0 0h64v64H0z"/>'))).toBe(true);
  });
  it('treats currentColor/none as no fixed color', () => {
    expect(isSingleFillSvg(svg('<path fill="currentColor"/><rect fill="none"/>'))).toBe(true);
  });
  it('is false for multiple distinct colors', () => {
    expect(isSingleFillSvg(svg('<path fill="#0076b6"/><path fill="#e91e63"/>'))).toBe(false);
  });
  it('is false when a gradient is present', () => {
    expect(isSingleFillSvg(svg('<linearGradient id="g"/><path fill="url(#g)"/>'))).toBe(false);
  });
  it('reads fill from inline style', () => {
    expect(isSingleFillSvg(svg('<path style="fill:#0076b6;stroke:none"/>'))).toBe(true);
  });
});

describe('validateLogo', () => {
  it('accepts a well-formed single-fill SVG mark', () => {
    const r = validateLogo({ slot: 'mark', mime: 'image/svg+xml', byteLength: 4000, svgText: svg('<path fill="#0076b6" d="M0 0h64v64H0z"/>') });
    expect(r.ok).toBe(true);
    expect(r.isSingleFillSvg).toBe(true);
    expect(r.aspectRatio).toBeCloseTo(1, 5);
  });

  it('flags a mis-shaped (too wide) mark by aspect ratio', () => {
    const r = validateLogo({ slot: 'mark', mime: 'image/svg+xml', byteLength: 3000, svgText: svg('', '0 0 300 40') });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /aspect ratio/i.test(e))).toBe(true);
  });

  it('accepts a wide wordmark but rejects a square one', () => {
    expect(validateLogo({ slot: 'wordmark', mime: 'image/svg+xml', byteLength: 3000, svgText: svg('', '0 0 300 60') }).ok).toBe(true);
    expect(validateLogo({ slot: 'wordmark', mime: 'image/svg+xml', byteLength: 3000, svgText: svg('', '0 0 64 64') }).ok).toBe(false);
  });

  it('enforces the file-size cap', () => {
    const r = validateLogo({ slot: 'mark', mime: 'image/png', byteLength: 2 * 1024 * 1024, width: 128, height: 128 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /limit/i.test(e))).toBe(true);
  });

  it('warns that SVG is preferred and enforces raster min-size', () => {
    const small = validateLogo({ slot: 'mark', mime: 'image/png', byteLength: 5000, width: 32, height: 32 });
    expect(small.ok).toBe(false);
    expect(small.warnings.some((w) => /svg is preferred/i.test(w))).toBe(true);
    expect(small.errors.some((e) => /smaller side/i.test(e))).toBe(true);
  });

  it('rejects an unsupported file type', () => {
    expect(validateLogo({ slot: 'mark', mime: 'image/gif', byteLength: 1000, width: 64, height: 64 }).ok).toBe(false);
  });
});

describe('emitLogoOverlayCss', () => {
  it('emits mark + geometry scoped to the theme id', () => {
    const css = emitLogoOverlayCss('acme', { lightMarkURL: '/logos/acme.svg', width: 40, height: 24 });
    expect(css).toContain('[data-theme-overlay="acme"]');
    expect(css).toContain('--mj-logo-mark: url("/logos/acme.svg")');
    expect(css).toContain('--mj-logo-width: 40px');
    expect(css).toContain('--mj-logo-height: 24px');
  });

  it('swaps the mark in dark mode when a dark variant exists', () => {
    const css = emitLogoOverlayCss('acme', { lightMarkURL: '/l.svg', darkMarkURL: '/d.svg' });
    expect(css).toContain('[data-theme-overlay="acme"][data-theme="dark"]');
    expect(css).toContain('--mj-logo-mark: url("/d.svg")');
    expect(css).not.toContain('--mj-logo-plate-bg');
    // inverse falls back to the dark variant
    expect(css).toContain('--mj-logo-mark-inverse: url("/d.svg")');
  });

  it('plates a single-variant mark in dark mode (no filter transform)', () => {
    const css = emitLogoOverlayCss('acme', { lightMarkURL: '/only.svg' });
    expect(css).toContain('[data-theme-overlay="acme"][data-theme="dark"]');
    expect(css).toContain('--mj-logo-plate-bg: #ffffff');
    expect(css).toContain('--mj-logo-mark-inverse: url("/only.svg")');
  });

  it('returns no base block when there are no logos', () => {
    expect(emitLogoOverlayCss('acme', {})).toBe('');
  });
});

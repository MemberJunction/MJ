import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  deltaEOK,
  derive,
  emitOverlayCss,
  hexToOKLCH,
  MJ_DEFAULT_SEEDS,
  oklchToHex,
} from '../index.js';

/** OKLab ΔE ~0.02 is roughly one just-noticeable difference; 0.03 allows for MJ's
 *  hand-tuned per-step hue drift that the seed-anchored ramp does not replicate. */
const TOLERANCE = 0.03;

describe('color math', () => {
  it('round-trips hex through OKLCH within a hair', () => {
    for (const hex of ['#0076b6', '#5cc0ed', '#06b6d4', '#1e293b', '#f59e0b', '#ffffff', '#020617']) {
      expect(deltaEOK(hex, oklchToHex(hexToOKLCH(hex)))).toBeLessThan(0.005);
    }
  });

  it('computes WCAG contrast extremes', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 1);
  });

  it('holds hue when clamping an out-of-gamut OKLCH color', () => {
    // Very high chroma at mid lightness is outside sRGB; hue must survive the clamp.
    const requested = { l: 0.6, c: 0.4, h: 30 };
    const back = hexToOKLCH(oklchToHex(requested));
    expect(Math.abs(back.h - 30)).toBeLessThan(3);
  });
});

describe('derive() reproduces MJ defaults within tolerance', () => {
  const t = derive(MJ_DEFAULT_SEEDS);

  const expectClose = (actual: string, expected: string) =>
    expect(deltaEOK(actual, expected), `${actual} vs ${expected}`).toBeLessThan(TOLERANCE);

  it('light brand family', () => {
    expectClose(t.tokens.light['--mj-brand-primary'], '#0076b6');
    expectClose(t.tokens.light['--mj-brand-primary-hover'], '#006aa3');
    expectClose(t.tokens.light['--mj-brand-primary-active'], '#005a8a');
    expectClose(t.tokens.light['--mj-brand-secondary'], '#092340');
  });

  it('light accent + tertiary', () => {
    expectClose(t.tokens.light['--mj-brand-accent'], '#5cc0ed');
    expectClose(t.tokens.light['--mj-brand-accent-hover'], '#38a9d9');
    expectClose(t.tokens.light['--mj-brand-tertiary'], '#06b6d4');
    expectClose(t.tokens.light['--mj-brand-tertiary-hover'], '#0891b2');
  });

  it('neutrals (text + surface)', () => {
    expectClose(t.tokens.light['--mj-text-primary'], '#1e293b');
    expectClose(t.tokens.light['--mj-bg-surface'], '#ffffff');
    expectClose(t.tokens.light['--mj-bg-page'], '#f8fafc');
    expectClose(t.tokens.dark['--mj-bg-page'], '#0f172a');
  });

  it('dark re-point resolves to lighter brand steps', () => {
    // Dark mode maps primary to brand-400 (MJ #2699cc), lighter than the light-mode 500.
    expectClose(t.tokens.dark['--mj-brand-primary'], '#2699cc');
    expect(hexToOKLCH(t.tokens.dark['--mj-brand-primary']).l).toBeGreaterThan(
      hexToOKLCH(t.tokens.light['--mj-brand-primary']).l,
    );
  });
});

describe('derived extras', () => {
  const t = derive(MJ_DEFAULT_SEEDS);

  it('emits 10 brand-rooted viz colors, the first near the brand hue', () => {
    for (let i = 1; i <= 10; i++) expect(t.overlayVars[`--mj-viz-${i}`]).toMatch(/^#[0-9a-f]{6}$/);
    const brandHue = hexToOKLCH('#0076b6').h;
    expect(Math.abs(hexToOKLCH(t.overlayVars['--mj-viz-1']).h - brandHue)).toBeLessThan(5);
  });

  it('emits brand-tinted shadows and the shape/type tokens', () => {
    expect(t.overlayVars['--mj-shadow-brand-sm']).toContain('rgba(');
    expect(t.overlayVars['--mj-radius-md']).toBe('8px');
    expect(t.overlayVars['--mj-radius-sm']).toBe('4px');
    expect(t.overlayVars['--mj-font-family']).toContain('Inter');
  });

  it('respects the shape (radius) seed', () => {
    const rounded = derive({ ...MJ_DEFAULT_SEEDS, radius: 12 });
    expect(rounded.overlayVars['--mj-radius-md']).toBe('12px');
    expect(rounded.overlayVars['--mj-radius-lg']).toBe('18px');
  });

  it('serializes an overlay scoped to the theme id', () => {
    const css = emitOverlayCss('acme', t);
    expect(css).toContain('[data-theme-overlay="acme"]');
    expect(css).toContain('--mj-color-brand-500:');
    expect(css).toContain('--mj-viz-1:');
  });

  it('applies advanced token overrides over the derived vars (override wins)', () => {
    const css = emitOverlayCss('acme', t, { overrides: { '--mj-brand-primary': '#ff0000', '--mj-radius-md': '999px' } });
    expect(css).toContain('--mj-brand-primary: #ff0000;');
    expect(css).toContain('--mj-radius-md: 999px;');
    // an unrelated derived var is still present
    expect(css).toContain('--mj-viz-1:');
  });

  it('appends raw custom CSS auto-scoped under the overlay selector', () => {
    const css = emitOverlayCss('acme', t, { customCss: '.mj-shell { background: red; }' });
    // two blocks scoped to the same overlay: the token block + the custom block
    expect(css.match(/\[data-theme-overlay="acme"\]/g)?.length).toBe(2);
    expect(css).toContain('.mj-shell { background: red; }');
  });

  it('omits the custom block when customCss is blank/whitespace', () => {
    const css = emitOverlayCss('acme', t, { customCss: '   ' });
    expect(css.match(/\[data-theme-overlay="acme"\]/g)?.length).toBe(1);
  });

  it('hoists @keyframes out of the scoped wrapper (nesting forbids it inside)', () => {
    const custom = '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\nmj-app-switcher { animation: spin 2s infinite; }';
    const css = emitOverlayCss('acme', t, { customCss: custom });
    // @keyframes must appear at top level, NOT inside the overlay block
    const kfIndex = css.indexOf('@keyframes spin');
    const scopedIndex = css.lastIndexOf('[data-theme-overlay="acme"] {\nmj-app-switcher');
    expect(kfIndex).toBeGreaterThan(-1);
    expect(scopedIndex).toBeGreaterThan(kfIndex); // keyframes emitted before the wrapped rule
    // the keyframes line is not indented inside a wrapper brace right before it
    expect(css).toContain('mj-app-switcher { animation: spin 2s infinite; }');
  });
});

describe('contrast validation', () => {
  const report = derive(MJ_DEFAULT_SEEDS).contrast;

  it('passes every light-mode pair for the MJ default theme', () => {
    expect(report.light.every((c) => c.passes)).toBe(true);
  });

  it("flags MJ's known dark primary-hover gap and suggests a working clamp", () => {
    // Real finding: dark mode lightens the primary on hover to brand-300, and white
    // (on-primary) over it is only ~2.63:1 — under the 3:1 UI bar. The validator must
    // catch it and propose a clamp that actually clears the threshold.
    const hover = report.dark.find((c) => c.name === 'text-on-primary (hover)');
    expect(hover?.passes).toBe(false);
    expect(hover?.suggestion?.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrastRatio(hover!.fg, hover!.suggestion!.hex)).toBeGreaterThanOrEqual(hover!.required);
  });
});

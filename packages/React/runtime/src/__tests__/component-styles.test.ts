import { describe, it, expect, afterEach } from 'vitest';
import { ComponentStyles, StyleOverrides } from '@memberjunction/interactive-component-types';
import { SetupStyles, BuildStylesFromTheme, ApplyStyleOverrides } from '../utilities/component-styles';

/**
 * Installs a `getComputedStyle` stub resolving the given token map, so the theme
 * bridge can be exercised in the node test environment (which has no DOM).
 * Returns a throwaway element to pass as the bridge's `root`.
 */
function stubTheme(tokens: Record<string, string>): Element {
  (globalThis as Record<string, unknown>).getComputedStyle = () => ({
    getPropertyValue: (token: string) => tokens[token] ?? '',
  });
  return {} as Element;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).getComputedStyle;
});

describe('SetupStyles visualization defaults', () => {
  it('ships a multi-stop sequential ramp', () => {
    const scale = SetupStyles().sequentialScale;
    expect(scale && scale.length).toBeGreaterThan(1);
  });

  it('ships a diverging ramp with both endpoints', () => {
    const diverging = SetupStyles().divergingScale;
    expect(diverging?.low).toBeTruthy();
    expect(diverging?.high).toBeTruthy();
  });
});

describe('BuildStylesFromTheme visualization ramps', () => {
  it('populates both ramps from --mj-viz-seq-* / --mj-viz-div-* tokens', () => {
    const root = stubTheme({
      '--mj-viz-seq-1': '#eef', '--mj-viz-seq-2': '#99f', '--mj-viz-seq-3': '#22a',
      '--mj-viz-div-low': '#c00', '--mj-viz-div-mid': '#eee', '--mj-viz-div-high': '#0c0',
    });

    const styles = BuildStylesFromTheme(root);

    expect(styles.sequentialScale).toEqual(['#eef', '#99f', '#22a']);
    expect(styles.divergingScale).toEqual({ low: '#c00', mid: '#eee', high: '#0c0' });
  });

  it('omits mid when the theme does not define it', () => {
    const root = stubTheme({ '--mj-viz-div-low': '#c00', '--mj-viz-div-high': '#0c0' });

    expect(BuildStylesFromTheme(root).divergingScale).toEqual({ low: '#c00', high: '#0c0' });
  });

  it('keeps the default ramp when only one sequential stop resolves', () => {
    // A single stop cannot be interpolated, so a partially-themed page should
    // fall back rather than render a one-color "ramp".
    const root = stubTheme({ '--mj-viz-seq-1': '#eef' });

    expect(BuildStylesFromTheme(root).sequentialScale).toEqual(SetupStyles().sequentialScale);
  });

  it('keeps the default diverging ramp when an endpoint is missing', () => {
    const root = stubTheme({ '--mj-viz-div-low': '#c00' });

    expect(BuildStylesFromTheme(root).divergingScale).toEqual(SetupStyles().divergingScale);
  });
});

describe('ApplyStyleOverrides', () => {
  const base = (): ComponentStyles => SetupStyles();
  const userRequest = (partial: Partial<StyleOverrides>): StyleOverrides =>
    ({ source: 'user-request', ...partial }) as StyleOverrides;

  it('returns the base untouched when there are no overrides', () => {
    const input = base();
    expect(ApplyStyleOverrides(input, undefined)).toBe(input);
  });

  it('returns the base untouched when no slot carries a usable value', () => {
    const input = base();
    expect(ApplyStyleOverrides(input, userRequest({ chartPalette: [] }))).toBe(input);
  });

  it('replaces the chart palette with the requested colors', () => {
    const styles = ApplyStyleOverrides(base(), userRequest({ chartPalette: ['#00f', '#fc0'] }));
    expect(styles.chartPalette).toEqual(['#00f', '#fc0']);
  });

  it('replaces the diverging ramp for a red-to-green request', () => {
    const styles = ApplyStyleOverrides(base(), userRequest({ divergingScale: { low: '#f00', high: '#0f0' } }));
    expect(styles.divergingScale).toEqual({ low: '#f00', high: '#0f0' });
  });

  it('ignores a diverging override missing an endpoint', () => {
    const overrides = { source: 'user-request', divergingScale: { low: '#f00' } } as unknown as StyleOverrides;
    expect(ApplyStyleOverrides(base(), overrides).divergingScale).toEqual(SetupStyles().divergingScale);
  });

  it('ignores a single-stop sequential override', () => {
    const styles = ApplyStyleOverrides(base(), userRequest({ sequentialScale: ['#00f'] }));
    expect(styles.sequentialScale).toEqual(SetupStyles().sequentialScale);
  });

  it('leaves non-visualization tokens alone', () => {
    const input = base();
    const styles = ApplyStyleOverrides(input, userRequest({ chartPalette: ['#00f'] }));
    expect(styles.colors.primary).toBe(input.colors.primary);
    expect(styles.typography.fontFamily).toBe(input.typography.fontFamily);
  });

  it('does not mutate the base styles', () => {
    const input = base();
    const original = [...(input.chartPalette ?? [])];
    ApplyStyleOverrides(input, userRequest({ chartPalette: ['#00f', '#fc0'] }));
    expect(input.chartPalette).toEqual(original);
  });

  it('applies overrides over theme-bridged styles, not just defaults', () => {
    const root = stubTheme({ '--mj-viz-1': '#111', '--mj-viz-2': '#222' });
    const themed = BuildStylesFromTheme(root);

    const styles = ApplyStyleOverrides(themed, userRequest({ chartPalette: ['#00f'] }));

    expect(styles.chartPalette).toEqual(['#00f']);
    // The theme still supplies everything the user did not ask about.
    expect(styles.colors.primary).toBe(themed.colors.primary);
  });
});

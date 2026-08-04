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

describe('SetupStyles overlay and status defaults', () => {
  it('ships an overlay scrim and status text/border colors', () => {
    const colors = SetupStyles().colors;
    expect(colors.overlay).toBeTruthy();
    for (const key of [
      'successText', 'successBorder',
      'warningText', 'warningBorder',
      'errorText', 'errorBorder',
      'infoText', 'infoBorder',
    ]) {
      expect(colors[key]).toBeTruthy();
    }
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

describe('BuildStylesFromTheme overlay and status bridging', () => {
  it('bridges the overlay scrim from --mj-bg-overlay', () => {
    const root = stubTheme({ '--mj-bg-overlay': 'rgba(15, 23, 42, 0.5)' });

    expect(BuildStylesFromTheme(root).colors.overlay).toBe('rgba(15, 23, 42, 0.5)');
  });

  it('bridges status text and border tokens', () => {
    const root = stubTheme({
      '--mj-status-success-text': '#0a7d43',
      '--mj-status-error-border': '#f5c2c0',
    });

    const styles = BuildStylesFromTheme(root);

    expect(styles.colors.successText).toBe('#0a7d43');
    expect(styles.colors.errorBorder).toBe('#f5c2c0');
  });

  it('keeps the defaults when the tokens are absent', () => {
    const root = stubTheme({});
    const styles = BuildStylesFromTheme(root);
    const defaults = SetupStyles().colors;

    expect(styles.colors.overlay).toBe(defaults.overlay);
    expect(styles.colors.warningText).toBe(defaults.warningText);
  });
});

describe('ApplyStyleOverrides', () => {
  const base = (): ComponentStyles => SetupStyles();
  const userRequest = (partial: Partial<StyleOverrides>): StyleOverrides =>
    ({ ...partial, source: 'user-request' });

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
    const overrides = userRequest({ divergingScale: { low: '#f00', high: '' } });
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

describe('ApplyStyleOverrides fontScale', () => {
  const orgDefault = (partial: Partial<StyleOverrides>): StyleOverrides =>
    ({ ...partial, source: 'organization-default' });

  it('scales every fontSize token up together for large', () => {
    // The point of doing this here rather than in the generator: one factor, whole ladder.
    const styles = ApplyStyleOverrides(SetupStyles(), orgDefault({ fontScale: 'large' }));
    expect(styles.typography.fontSize).toEqual({
      xs: '14px', sm: '15px', md: '18px', lg: '20px', xl: '25px', xxl: '30px', xxxl: '40px',
    });
  });

  it('scales every fontSize token down together for small', () => {
    const styles = ApplyStyleOverrides(SetupStyles(), orgDefault({ fontScale: 'small' }));
    expect(styles.typography.fontSize).toEqual({
      xs: '10px', sm: '11px', md: '12px', lg: '14px', xl: '18px', xxl: '21px', xxxl: '28px',
    });
  });

  it('treats normal as no override at all', () => {
    const input = SetupStyles();
    expect(ApplyStyleOverrides(input, orgDefault({ fontScale: 'normal' }))).toBe(input);
  });

  it('ignores an unrecognized scale rather than guessing a factor', () => {
    const input = SetupStyles();
    const overrides = orgDefault({ fontScale: 'huge' as unknown as 'large' });
    expect(ApplyStyleOverrides(input, overrides)).toBe(input);
  });

  it('holds a floor so small cannot render text illegible', () => {
    const base = SetupStyles();
    base.typography.fontSize = { xs: '9px', sm: '12px', md: '14px', lg: '16px', xl: '20px' };
    const styles = ApplyStyleOverrides(base, orgDefault({ fontScale: 'small' }));
    expect(styles.typography.fontSize.xs).toBe('10px');
  });

  it('leaves sizes not expressed in px alone rather than guessing', () => {
    const base = SetupStyles();
    base.typography.fontSize = { sm: '0.875rem', md: '14px', lg: 'clamp(1rem, 2vw, 2rem)', xl: '20px' };
    const styles = ApplyStyleOverrides(base, orgDefault({ fontScale: 'large' }));
    expect(styles.typography.fontSize).toEqual({
      sm: '0.875rem', md: '18px', lg: 'clamp(1rem, 2vw, 2rem)', xl: '25px',
    });
  });

  it('keeps fontFamily, weights, spacing and colors untouched', () => {
    const input = SetupStyles();
    const styles = ApplyStyleOverrides(input, orgDefault({ fontScale: 'large' }));
    expect(styles.typography.fontFamily).toBe(input.typography.fontFamily);
    expect(styles.typography.fontWeight).toEqual(input.typography.fontWeight);
    expect(styles.spacing).toEqual(input.spacing);
    expect(styles.colors.primary).toBe(input.colors.primary);
  });

  it('does not mutate the base ladder', () => {
    const input = SetupStyles();
    ApplyStyleOverrides(input, orgDefault({ fontScale: 'large' }));
    expect(input.typography.fontSize.md).toBe('14px');
  });

  it('combines with a color override in one pass', () => {
    const styles = ApplyStyleOverrides(
      SetupStyles(), orgDefault({ fontScale: 'small', chartPalette: ['#00f', '#fc0'] }));
    expect(styles.chartPalette).toEqual(['#00f', '#fc0']);
    expect(styles.typography.fontSize.md).toBe('12px');
  });
});

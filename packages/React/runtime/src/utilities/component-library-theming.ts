/**
 * @fileoverview Auto-themes component libraries (Ant Design) from the MJ theme so
 * their built-in components inherit light/dark just like custom `styles.*` elements
 * do. Library components (antd `Table`, `Input`, `Select`, …) do not read `styles.*`
 * on their own — without their theme provider they render in the library's built-in
 * LIGHT theme even when the host is in dark mode. The host wraps the mounted React
 * tree once, and the provider's context flows to every library component below.
 * @module @memberjunction/react-runtime/utilities
 */

import { ComponentStyles } from '@memberjunction/interactive-component-types';
import { unwrapLibraryComponent } from './component-unwrapper';

/** Relative luminance (0 = black, 1 = white) of a hex or rgb()/rgba() color; 1 if unparseable. */
function colorLuminance(color: string | undefined): number {
  if (!color) return 1;
  const s = String(color).trim();
  let r: number, g: number, b: number;
  const hex = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const m = /rgba?\(([^)]+)\)/i.exec(s);
    if (!m) return 1;
    const p = m[1].split(',').map((x) => parseFloat(x));
    r = p[0]; g = p[1]; b = p[2];
    if ([r, g, b].some((v) => Number.isNaN(v))) return 1;
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Parse a radius token (e.g. '8px' or a size map) into a number for antd's borderRadius. */
function radiusToNumber(radius: ComponentStyles['borders']['radius'] | undefined): number | undefined {
  const raw = typeof radius === 'string' ? radius : (radius && (radius.md || radius.sm || radius.lg));
  if (!raw) return undefined;
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Builds an Ant Design v5 `ConfigProvider` `theme` config from ComponentStyles:
 * maps the MJ color/typography tokens onto antd seed/map tokens and selects antd's
 * dark algorithm when the theme's background is dark. `antdLib` is the loaded antd
 * module (used only to read its `theme` algorithm namespace). Unmapped tokens are
 * omitted so antd falls back to its own defaults.
 */
export function buildAntdThemeConfig(
  styles: Partial<ComponentStyles> | undefined,
  antdLib: unknown,
): Record<string, unknown> {
  const colors = (styles?.colors || {}) as Record<string, string | undefined>;
  const themeNS = antdLib ? unwrapLibraryComponent(antdLib, 'theme') : undefined;
  const isDark = colorLuminance(colors['background']) < 0.5;

  const token: Record<string, unknown> = {
    colorPrimary: colors['primary'],
    colorInfo: colors['info'] || colors['primary'],
    colorSuccess: colors['success'],
    colorWarning: colors['warning'],
    colorError: colors['error'],
    colorBgContainer: colors['surface'],
    colorBgElevated: colors['surface'],
    colorBgLayout: colors['background'],
    colorText: colors['text'],
    colorTextSecondary: colors['textSecondary'],
    colorBorder: colors['border'],
    colorBorderSecondary: colors['borderLight'] || colors['border'],
    fontFamily: styles?.typography?.fontFamily,
  };
  const radius = radiusToNumber(styles?.borders?.radius);
  if (radius !== undefined) token['borderRadius'] = radius;
  for (const k of Object.keys(token)) {
    if (token[k] == null) delete token[k];
  }

  const config: Record<string, unknown> = { token };
  const algorithm = themeNS && (isDark ? themeNS.darkAlgorithm : themeNS.defaultAlgorithm);
  if (algorithm) {
    config['algorithm'] = algorithm;
  }
  return config;
}

/**
 * Wraps a React element in loaded component libraries' theme providers so their
 * built-in components inherit the MJ theme (including dark mode). Currently themes
 * Ant Design via `ConfigProvider` when the `antd` library is loaded; otherwise
 * returns the element unchanged. Because `ConfigProvider` supplies React context,
 * one wrap at the root themes every antd component in the subtree — including those
 * inside child components. `libraries` is keyed by global-variable name (e.g. `antd`).
 *
 * A generated component that also wraps its own `ConfigProvider` simply nests under
 * this one (antd merges nested configs), so this is safe alongside component-level
 * theming.
 */
export function wrapWithLibraryThemeProviders(
  React: { createElement: (type: unknown, props: unknown, ...children: unknown[]) => unknown },
  element: unknown,
  libraries: Record<string, unknown> | undefined,
  styles: Partial<ComponentStyles> | undefined,
): unknown {
  const antdLib = libraries?.['antd'];
  if (!antdLib) return element;

  const ConfigProvider = unwrapLibraryComponent(antdLib, 'ConfigProvider');
  if (!ConfigProvider) return element;

  try {
    return React.createElement(ConfigProvider, { theme: buildAntdThemeConfig(styles, antdLib) }, element);
  } catch {
    // Never let theming wrap break rendering — fall back to the unwrapped element.
    return element;
  }
}

/**
 * @fileoverview Default component styles for React runtime
 * @module @memberjunction/react-runtime/utilities
 */

import { ComponentStyles } from '@memberjunction/interactive-component-types';

/**
 * Creates the default component styles for Skip components
 * These provide a modern, contemporary look and feel
 * Copied from skip-chat implementation
 */
export function SetupStyles(): ComponentStyles {
  // Return modern, contemporary styles for generated components
  return {
    colors: {
      // Primary colors - modern purple/blue gradient feel
      primary: '#5B4FE9',
      primaryHover: '#4940D4',
      primaryActive: '#3E37B8',
      primaryLight: '#E8E6FF',

      // Secondary colors - sophisticated gray
      secondary: '#64748B',
      secondaryHover: '#475569',
      
      // Status colors
      success: '#10B981',
      successLight: '#D1FAE5',
      warning: '#F59E0B',
      warningLight: '#FEF3C7',
      error: '#EF4444',
      errorLight: '#FEE2E2',
      info: '#3B82F6',
      infoLight: '#DBEAFE',
      
      // Base colors
      background: '#FFFFFF',
      surface: '#F8FAFC',
      surfaceHover: '#F1F5F9',
      
      // Text colors with better contrast
      text: '#1E293B',
      textSecondary: '#64748B',
      textTertiary: '#94A3B8',
      textInverse: '#FFFFFF',

      // Link colors
      link: '#5B4FE9',
      linkHover: '#4940D4',

      // Border colors
      border: '#E2E8F0',
      borderLight: '#F1F5F9',
      borderFocus: '#5B4FE9',
      
      // Shadows (as color strings for easy use)
      shadow: 'rgba(0, 0, 0, 0.05)',
      shadowMedium: 'rgba(0, 0, 0, 0.1)',
      shadowLarge: 'rgba(0, 0, 0, 0.15)',
    },
    spacing: {
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
      xxl: '48px',
      xxxl: '64px',
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
      fontSize: {
        xs: '11px',
        sm: '12px',
        md: '14px',
        lg: '16px',
        xl: '20px',
        xxl: '24px',
        xxxl: '32px',
      },
      fontWeight: {
        light: '300',
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      lineHeight: {
        tight: '1.25',
        normal: '1.5',
        relaxed: '1.75',
      },
    },
    borders: {
      radius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },
      width: {
        thin: '1px',
        medium: '2px',
        thick: '3px',
      },
    },
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    },
    transitions: {
      fast: '150ms ease-in-out',
      normal: '250ms ease-in-out',
      slow: '350ms ease-in-out',
    },
    overflow: 'auto', // Default overflow style
    // Default categorical palette for multi-series charts. Overridden per-theme
    // from the host's `--mj-viz-*` tokens by BuildStylesFromTheme().
    chartPalette: [
      '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
      '#00BCD4', '#F44336', '#8BC34A', '#FF5722', '#3F51B5',
    ],
  }
}

// Also export with the original name for backward compatibility
export const createDefaultComponentStyles = SetupStyles;

/**
 * The `--mj-*` semantic token → `ComponentStyles` mapping used by the theme bridge.
 * Keys are ComponentStyles color paths; values are the CSS custom property to read.
 * Only theme-defining tokens with a clear semantic equivalent are mapped; every
 * other field keeps its `SetupStyles()` default.
 */
const THEME_COLOR_TOKEN_MAP: Record<string, string> = {
  // Brand / primary + interactive states
  primary: '--mj-brand-primary',
  primaryHover: '--mj-brand-primary-hover',
  primaryActive: '--mj-brand-primary-active',
  primaryLight: '--mj-brand-primary-light',
  // Status
  success: '--mj-status-success',
  successLight: '--mj-status-success-bg',
  warning: '--mj-status-warning',
  warningLight: '--mj-status-warning-bg',
  error: '--mj-status-error',
  errorLight: '--mj-status-error-bg',
  info: '--mj-status-info',
  infoLight: '--mj-status-info-bg',
  // Surfaces (MJ: page = tinted, surface = elevated/white in light mode)
  background: '--mj-bg-page',
  surface: '--mj-bg-surface',
  surfaceHover: '--mj-bg-surface-hover',
  // Text
  text: '--mj-text-primary',
  textSecondary: '--mj-text-secondary',
  textTertiary: '--mj-text-muted',
  textInverse: '--mj-text-inverse',
  // Links
  link: '--mj-text-link',
  linkHover: '--mj-text-link-hover',
  // Borders / focus
  border: '--mj-border-default',
  borderLight: '--mj-border-subtle',
  borderFocus: '--mj-border-focus',
};

/** Number of `--mj-viz-N` categorical tokens the bridge probes for `chartPalette`. */
const VIZ_TOKEN_COUNT = 10;

/**
 * Reads the live MJ theme (`--mj-*` custom properties on the document root) and
 * layers it over `SetupStyles()`, producing a `ComponentStyles` that follows the
 * host's active theme — including dark mode and interactive-state (hover/active/
 * focus) families — instead of the frozen default palette. This is the Phase 1
 * theme bridge that gives generated components shell↔content cohesion.
 *
 * DOM-guarded: in non-DOM environments (Node test harness, SSR) there is no
 * computed theme to read, so it returns `SetupStyles()` unchanged. Any individual
 * token that is absent falls back to its `SetupStyles()` default, so a page
 * without MJ tokens loaded also degrades cleanly.
 *
 * @param root optional element to read tokens from (defaults to document root).
 */
export function BuildStylesFromTheme(root?: Element): ComponentStyles {
  const base = SetupStyles();

  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
  if (!el || typeof getComputedStyle === 'undefined') {
    return base;
  }

  const cs = getComputedStyle(el);
  const read = (token: string): string => cs.getPropertyValue(token).trim();

  for (const [path, token] of Object.entries(THEME_COLOR_TOKEN_MAP)) {
    const value = read(token);
    if (value) {
      base.colors[path] = value;
    }
  }

  const palette: string[] = [];
  for (let i = 1; i <= VIZ_TOKEN_COUNT; i++) {
    const value = read(`--mj-viz-${i}`);
    if (value) {
      palette.push(value);
    }
  }
  if (palette.length > 0) {
    base.chartPalette = palette;
  }

  return base;
}
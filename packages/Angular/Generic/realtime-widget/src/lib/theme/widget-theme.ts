/**
 * Theming. The widget carries NO colours of its own: every surface — its own and the hosted realtime
 * overlay — reads only `var(--mj-*)`, so a page repaints the whole tree by overriding those tokens on the
 * element. Logo and greeting are DATA, not tokens.
 *
 * Lifted from the Caliber widget's branding helper, minus the server-merge rules (Caliber resolves branding
 * per protocol on the server; this widget is configured by the page that embeds it).
 */
import type { WidgetThemeMode } from '../types';

/**
 * Builds the `--mj-*` custom-property map applied to the host element. Keys are normalised so a page may
 * pass either `brand-primary` or `--mj-brand-primary`; both land as `--mj-brand-primary`. Values are passed
 * through verbatim (colours, radii, spacing) — the widget never synthesises a colour, so light/dark parity
 * is preserved. Anything malformed is dropped, not guessed at.
 */
export function BuildThemeTokenMap(tokens: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(tokens ?? {})) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    const key = normaliseTokenKey(rawKey);
    if (key !== null) {
      out[key] = value.trim();
    }
  }
  return out;
}

/** `brand-primary` → `--mj-brand-primary`; `--mj-x` → `--mj-x`; anything else (a non-mj custom property, empty) → null. */
function normaliseTokenKey(rawKey: string): string | null {
  const trimmed = rawKey.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('--mj-')) {
    return trimmed;
  }
  if (trimmed.startsWith('--')) {
    return null; // a non-mj custom property is outside the token contract
  }
  return `--mj-${trimmed.replace(/^mj-/, '')}`;
}

/**
 * Resolves the `data-theme` value to put on the element — MJ's dark token block is keyed on
 * `[data-theme="dark"]` — or `null` to leave the element alone.
 *
 *  - `light` / `dark` are explicit and always applied.
 *  - `auto` defers to the PAGE: when an ancestor already carries `data-theme` (an MJ application, or a site
 *    that follows MJ's convention), nothing is applied and the ancestor wins; otherwise it follows the
 *    visitor's OS preference.
 *
 * @param mode The configured mode.
 * @param pageDeclaresTheme Whether an ancestor of the element already has a `data-theme`.
 * @param prefersDark Whether the OS prefers dark.
 */
export function ResolveDataTheme(mode: WidgetThemeMode, pageDeclaresTheme: boolean, prefersDark: boolean): 'light' | 'dark' | null {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  if (pageDeclaresTheme) {
    return null;
  }
  return prefersDark ? 'dark' : 'light';
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Stylesheet contract tests for `button.scss`.
 *
 * Verifies:
 * 1. Every `--mj-button-*` custom property conforms to the Tier 3 grammar in `plans/ui-foundation/NAMING.md`
 *    (component, optional variant/size, closed property vocabulary, optional state).
 * 2. Every private working variable uses the `--_mj-button-` prefix, and zero public `--mj-button-*`
 *    variables are declared on `:root` (preserving container-scoped resolution).
 * 3. Hover and active rules wrap their `:not(...)` exclusions in `:where()`, keeping specificity at `(0,2,0)`
 *    so `:focus-visible` wins when a button is both hovered and keyboard-focused.
 * 4. Spatial motion (`transform`) is gated behind `@media (prefers-reduced-motion: no-preference)`, and
 *    `[aria-disabled="true"]` is styled alongside `:disabled` and excluded from hover/active rules.
 */
describe('ui-components stylesheets: button.scss contract', () => {
  const buttonScss = readFileSync(join(__dirname, 'button.scss'), 'utf8');
  const namingMd = readFileSync(resolve(__dirname, '../../../../../../../plans/ui-foundation/NAMING.md'), 'utf8');
  /** Strip block comments so comment prose does not count as token declarations or references. */
  const uncommentedScss = buttonScss.replace(/\/\*[\s\S]*?\*\//g, '');

  const variants = ['primary', 'secondary', 'outline', 'flat', 'danger', 'success', 'warning', 'icon', 'sm', 'lg'];
  const properties = [
    'bg',
    'text',
    'border',
    'border-width',
    'border-style',
    'radius',
    'shadow',
    'height',
    'min-height',
    'width',
    'max-width',
    'padding',
    'gap',
    'font-size',
    'font-weight',
    'icon-size',
    'opacity',
    'transform',
  ];
  const states = ['hover', 'active', 'focus', 'disabled', 'selected', 'checked', 'error'];

  const grammarRegex = new RegExp(
    `^--mj-button(?:-(?:${variants.join('|')}))?-(?:${properties.join('|')})(?:-(?:${states.join('|')}))?$`
  );

  it('every property word used by button.scss appears in NAMING.md Tier 3 property table', () => {
    for (const prop of properties) {
      expect(namingMd, `NAMING.md lists property "${prop}"`).toContain(`\`${prop}\``);
    }
  });

  it('every --mj-button-* custom property in button.scss matches the NAMING.md Tier 3 grammar', () => {
    const referenced = Array.from(
      new Set(Array.from(uncommentedScss.matchAll(/--mj-button-[a-z0-9-]+/g)).map((m) => m[0]))
    ).sort();

    expect(referenced.length).toBeGreaterThanOrEqual(100);
    const invalid = referenced.filter((token) => !grammarRegex.test(token));
    expect(invalid).toEqual([]);
  });

  it('leaves public --mj-button-* tokens unset on :root and prefixes private vars with --_mj-button-', () => {
    expect(uncommentedScss).not.toMatch(/:root\s*\{[^}]*--mj-button-/);

    const privateVars = Array.from(
      new Set(Array.from(uncommentedScss.matchAll(/--_[a-zA-Z0-9-]+/g)).map((m) => m[0]))
    );
    expect(privateVars.length).toBeGreaterThan(0);
    for (const priv of privateVars) {
      expect(priv.startsWith('--_mj-button-'), `private token ${priv}`).toBe(true);
    }
  });

  it('wraps hover and active exclusions in :where() and places :focus-visible after hover/active', () => {
    expect(uncommentedScss).not.toMatch(/&:hover:not\(/);
    expect(uncommentedScss).not.toMatch(/&:active:not\(/);
    expect(uncommentedScss).toContain(
      '&:where(:not(:disabled):not([disabled]):not([aria-disabled="true"]):not(.mj-btn--flat):not(.mj-btn--icon):not(.mj-btn--outline):not(.mj-btn--sm)):hover'
    );

    const hoverIdx = uncommentedScss.indexOf('&:where(:not(:disabled)');
    const focusIdx = uncommentedScss.indexOf('&:focus-visible');
    expect(hoverIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThan(hoverIdx);
  });

  it('gates spatial transform behind prefers-reduced-motion: no-preference and styles aria-disabled', () => {
    expect(uncommentedScss).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(uncommentedScss).toContain('&[aria-disabled="true"]');
    expect(uncommentedScss).toContain('.mj-btn--full');
  });
});

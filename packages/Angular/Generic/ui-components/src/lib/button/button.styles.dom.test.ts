import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Extracts only the Tier 3 Property Vocabulary markdown table's first column ("Word") from NAMING.md,
 * ignoring column 3 rationales and prose elsewhere in the file (which mention forbidden words such
 * as `fill` and `btn` in backticks).
 */
function parseTier3PropertyWords(namingMd: string): Set<string> {
  const startMarker = 'Property vocabulary. Fixed list;';
  const endMarker = '\nWorked examples,';
  const startIdx = namingMd.indexOf(startMarker);
  const endIdx = namingMd.indexOf(endMarker, startIdx);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not locate Tier 3 Property vocabulary table in NAMING.md');
  }

  const section = namingMd.slice(startIdx, endIdx);
  const words = new Set<string>();
  for (const line of section.split('\n')) {
    const rowMatch = /^\|([^|]+)\|/.exec(line.trim());
    if (!rowMatch) {
      continue;
    }
    const firstCol = rowMatch[1].trim();
    if (firstCol === 'Word' || /^-+$/.test(firstCol)) {
      continue;
    }
    for (const tokenMatch of firstCol.matchAll(/`([a-z-]+)`/g)) {
      words.add(tokenMatch[1]);
    }
  }
  return words;
}

/**
 * Stylesheet contract tests for `button.scss`.
 *
 * Verifies:
 * 1. Every `--mj-button-*` custom property conforms to the Tier 3 grammar in `plans/ui-foundation/NAMING.md`
 *    (component, optional variant/size, closed property vocabulary parsed strictly from the Tier 3 table,
 *    optional state), and square controls never expose a separate width axis (`--mj-button-icon-width`).
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
  const tablePropertySet = parseTier3PropertyWords(namingMd);
  const properties = Array.from(tablePropertySet);
  const states = ['hover', 'active', 'focus', 'disabled', 'selected', 'checked', 'error'];

  const grammarRegex = new RegExp(
    `^--mj-button(?:-(?:${variants.join('|')}))?-(?:${properties.join('|')})(?:-(?:${states.join('|')}))?$`
  );

  it('parses strictly column 1 of the NAMING.md Tier 3 property table and excludes prose backticks', () => {
    expect(tablePropertySet.has('bg')).toBe(true);
    expect(tablePropertySet.has('opacity')).toBe(true);
    expect(tablePropertySet.has('transform')).toBe(true);
    expect(tablePropertySet.has('fill')).toBe(false);
    expect(tablePropertySet.has('btn')).toBe(false);
  });

  it('every --mj-button-* custom property in button.scss matches the NAMING.md Tier 3 grammar and square-control rule', () => {
    const referenced = Array.from(
      new Set(Array.from(uncommentedScss.matchAll(/--mj-button-[a-z0-9-]+/g)).map((m) => m[0]))
    ).sort();

    expect(referenced.length).toBeGreaterThanOrEqual(100);
    const invalid = referenced.filter((token) => !grammarRegex.test(token));
    expect(invalid).toEqual([]);
    expect(referenced).not.toContain('--mj-button-icon-width');
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
    expect(hoverIdx).toBeGreaterThan(0);
    expect(focusIdx).toBeGreaterThan(hoverIdx);
  });

  it('gates spatial transform behind prefers-reduced-motion: no-preference and styles aria-disabled', () => {
    expect(uncommentedScss).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(uncommentedScss).toContain('&[aria-disabled="true"]');
    expect(uncommentedScss).toContain('.mj-btn--full');
  });
});

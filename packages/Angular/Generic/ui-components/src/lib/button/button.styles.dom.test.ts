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
 * 1. Every `--mj-button-*` custom property conforms to the Tier 3 grammar in `plans/ui-foundation/NAMING.md`:
 *    `--mj-button[-<variant>]-<property>[-<condition>][-<interaction>]`, obeys the no-stacking `icon-icon-size`
 *    rule, and never exposes a separate width axis on square controls (`--mj-button-icon-width`).
 * 2. Every private working variable uses the `--_mj-button-` prefix, zero public `--mj-button-*`
 *    variables are declared on `:root` (preserving container-scoped resolution), and base `gap` keeps a `px`
 *    fallback (`8px`) so embedded hosts with non-16px root font sizes do not shrink button spacing.
 * 3. Base `.mj-btn` hover/active lift rules wrap `:not(...)` exclusions in `:where()` (`(0,2,0)`) before
 *    `:focus-visible` (`(0,2,0)`), while all 9 variant/`selected` hover rules and all 8 variant active rules
 *    keep `(0,3,0)` via `:not(:disabled, [disabled], [aria-disabled="true"])`.
 * 4. Both hover and active `transform` declarations sit inside `@media (prefers-reduced-motion: no-preference)`,
 *    `:focus-visible` carries a `@media (forced-colors: active)` `outline` fallback, `.mj-btn--outline:active`
 *    chains through `--mj-button-outline-text-hover`, `@media (pointer: coarse)` enforces the `44px` touch floor
 *    via `max(...)`, `.mj-btn--full` sets `width: 100%`, and `[aria-disabled="true"]` is styled alongside `:disabled`.
 */
describe('ui-components stylesheets: button.scss contract', () => {
  const buttonScss = readFileSync(join(__dirname, 'button.scss'), 'utf8');
  const namingMd = readFileSync(resolve(__dirname, '../../../../../../../plans/ui-foundation/NAMING.md'), 'utf8');
  /** Strip block comments so comment prose does not count as token declarations or references. */
  const uncommentedScss = buttonScss.replace(/\/\*[\s\S]*?\*\//g, '');

  const variants = ['primary', 'secondary', 'outline', 'flat', 'danger', 'success', 'warning', 'icon', 'sm', 'lg'];
  const tablePropertySet = parseTier3PropertyWords(namingMd);
  const properties = Array.from(tablePropertySet);
  const conditions = ['selected', 'checked', 'error'];
  const interactions = ['hover', 'active', 'focus', 'disabled'];

  const grammarRegex = new RegExp(
    `^--mj-button(?:-(?:${variants.join('|')}))?-(?:${properties.join('|')})(?:-(?:${conditions.join('|')}))?(?:-(?:${interactions.join('|')}))?$`
  );
  const isValidButtonToken = (token: string): boolean =>
    grammarRegex.test(token) && !token.includes('-icon-icon-size');

  it('parses strictly column 1 of the NAMING.md Tier 3 property table and enforces condition-before-interaction and no-stacking rules', () => {
    expect(tablePropertySet.has('bg')).toBe(true);
    expect(tablePropertySet.has('opacity')).toBe(true);
    expect(tablePropertySet.has('transform')).toBe(true);
    expect(tablePropertySet.has('fill')).toBe(false);
    expect(tablePropertySet.has('btn')).toBe(false);

    expect(isValidButtonToken('--mj-button-bg-selected-hover')).toBe(true);
    expect(isValidButtonToken('--mj-button-sm-icon-size')).toBe(true);
    expect(isValidButtonToken('--mj-button-bg-hover-selected')).toBe(false);
    expect(isValidButtonToken('--mj-button-icon-icon-size')).toBe(false);
  });

  it('every --mj-button-* custom property in button.scss matches the NAMING.md Tier 3 grammar and square-control rule', () => {
    const referenced = Array.from(
      new Set(Array.from(uncommentedScss.matchAll(/--mj-button-[a-z0-9-]+/g)).map((m) => m[0]))
    ).sort();

    expect(referenced.length).toBeGreaterThanOrEqual(110);
    const invalid = referenced.filter((token) => !isValidButtonToken(token));
    expect(invalid).toEqual([]);
    expect(referenced).not.toContain('--mj-button-icon-width');
    expect(referenced).toContain('--mj-button-bg-selected-hover');
  });

  it('leaves public --mj-button-* tokens unset on :root, prefixes private vars with --_mj-button-, and keeps px gap fallback', () => {
    expect(uncommentedScss).not.toMatch(/:root\s*\{[^}]*--mj-button-/);
    expect(uncommentedScss).toContain('gap: var(--mj-button-gap, 8px);');

    const privateVars = Array.from(
      new Set(Array.from(uncommentedScss.matchAll(/--_[a-zA-Z0-9-]+/g)).map((m) => m[0]))
    );
    expect(privateVars.length).toBeGreaterThan(0);
    for (const priv of privateVars) {
      expect(priv.startsWith('--_mj-button-'), `private token ${priv}`).toBe(true);
    }
  });

  it('lowers base lift hover/active via :where() before :focus-visible while keeping all 9 variant/selected hover and 8 active rules at (0,3,0)', () => {
    expect(uncommentedScss).not.toMatch(/&:hover:not\(:disabled\):not\(/);
    expect(uncommentedScss).not.toMatch(
      /&:where\(:not\(:disabled\):not\(\[disabled\]\):not\(\[aria-disabled="true"\]\)\):(hover|active)/
    );
    expect(uncommentedScss).toContain(
      '&:where(:not(:disabled):not([disabled]):not([aria-disabled="true"]):not(.mj-btn--flat):not(.mj-btn--icon):not(.mj-btn--outline):not(.mj-btn--sm)):hover'
    );

    const variantHovers = Array.from(
      uncommentedScss.matchAll(/&:hover:not\(:disabled,\s*\[disabled\],\s*\[aria-disabled="true"\]\)/g)
    );
    const variantActives = Array.from(
      uncommentedScss.matchAll(/&:active:not\(:disabled,\s*\[disabled\],\s*\[aria-disabled="true"\]\)/g)
    );
    expect(variantHovers.length).toBe(9);
    expect(variantActives.length).toBe(8);

    const hoverIdx = uncommentedScss.indexOf('&:where(:not(:disabled)');
    const focusIdx = uncommentedScss.indexOf('&:focus-visible');
    expect(hoverIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThan(hoverIdx);
  });

  it('pins reduced-motion transform blocks, forced-colors focus outline, coarse 44px max() floor, outline active text chain, full-width 100%, and aria-disabled', () => {
    expect(uncommentedScss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*transform:\s*var\(--mj-button-transform-hover,\s*translateY\(-2px\)\);?\s*\}/
    );
    expect(uncommentedScss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*transform:\s*var\(--mj-button-transform-active,\s*translateY\(0\)\);?\s*\}/
    );
    expect(uncommentedScss).toMatch(
      /&:focus-visible\s*\{[\s\S]*?@media\s*\(forced-colors:\s*active\)\s*\{\s*outline:\s*var\(--mj-ring-width,\s*2px\)\s+solid\s+ButtonText;/
    );
    expect(uncommentedScss).toContain(
      'color: var(--mj-button-outline-text-active, var(--mj-button-outline-text-hover, var(--mj-brand-on-primary)));'
    );
    expect(uncommentedScss).toContain(
      '--_mj-button-height: max(var(--mj-control-height-md, 44px), var(--mj-button-height, 44px));'
    );
    expect(uncommentedScss).toContain(
      '--_mj-button-height: max(var(--mj-control-height-sm, 44px), var(--mj-button-sm-height, 44px));'
    );
    expect(uncommentedScss).toMatch(/\.mj-btn--full\s*\{\s*width:\s*100%;\s*\}/);
    expect(uncommentedScss).toContain('&[aria-disabled="true"]');
  });
});

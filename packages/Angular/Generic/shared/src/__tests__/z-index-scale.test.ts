import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Z-INDEX SCALE in `_tokens.scss` is the stacking contract hosts build against: a dialog
 * opened FROM a drawer must land above that drawer (LXP P13 — `mj-dialog`'s backdrop shipped at
 * 1000 under `.sp-panel` at 1001, so the modal rendered under the surface that launched it).
 * jsdom has no stacking, so this reads what the token file declares; the ui-components
 * stylesheet spec checks the components point at these rungs.
 */
describe('design tokens: z-index scale', () => {
  const tokens = readFileSync(resolve(__dirname, '../lib/_tokens.scss'), 'utf8');

  /** Every `--mj-z-*` token declared in the light `:root` block, by name → numeric value. */
  function zScale(): Map<string, number> {
    const scale = new Map<string, number>();
    const root = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('[data-theme="dark"]'));
    for (const match of root.matchAll(/(--mj-z-[a-z-]+):\s*(-?\d+)\s*;/g)) {
      scale.set(match[1], Number(match[2]));
    }
    return scale;
  }

  it('publishes a drawer rung and a dialog rung', () => {
    const scale = zScale();
    expect(scale.has('--mj-z-drawer')).toBe(true);
    expect(scale.has('--mj-z-dialog')).toBe(true);
  });

  it('stacks the dialog ABOVE the drawer, so a modal opened from a slide panel is reachable', () => {
    const scale = zScale();
    const drawer = scale.get('--mj-z-drawer') ?? Number.NaN;
    const dialog = scale.get('--mj-z-dialog') ?? Number.NaN;
    // The panel itself sits one above its backdrop (calc(drawer + 1)), so the dialog needs real headroom.
    expect(dialog).toBeGreaterThan(drawer + 1);
  });

  it('keeps every rung a distinct integer (two surfaces on one number is an undocumented tie)', () => {
    const values = Array.from(zScale().values());
    expect(values.every((v) => Number.isInteger(v))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });
});

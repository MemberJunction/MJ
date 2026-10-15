import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Stacking contract between `mj-dialog` and `mj-slide-panel` (LXP P13): the dialog backdrop and
 * the slide panel used to carry hardcoded z-indexes (1000 and 1001), so a dialog opened FROM a
 * drawer rendered under it. Both now read the shared `--mj-z-*` scale, and the ordering lives in
 * ONE place (`_tokens.scss`, pinned by ng-shared's z-index-scale spec). jsdom has no stacking, so
 * these read the declarations as text — what matters is WHICH rung each selector names.
 */
describe('ui-components stylesheets: dialog vs drawer stacking', () => {
  const dialogCss = readFileSync(join(__dirname, 'dialog', 'dialog.scss'), 'utf8');
  const panelCss = readFileSync(join(__dirname, 'slide-panel', 'slide-panel.component.css'), 'utf8');

  /** The `z-index` value declared by the rule whose selector list is exactly `selector`, or null. */
  function zIndexOf(css: string, selector: string): string | null {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (!block) {
      return null;
    }
    const decl = /z-index\s*:\s*([^;]+);/.exec(block[1]);
    return decl ? decl[1].replace(/\s+/g, ' ').trim() : null;
  }

  it('the dialog backdrop sits on the dialog rung', () => {
    expect(zIndexOf(dialogCss, '.mj-dialog-backdrop')).toBe('var(--mj-z-dialog)');
  });

  it('the slide-panel backdrop sits on the drawer rung', () => {
    expect(zIndexOf(panelCss, '.sp-backdrop')).toBe('var(--mj-z-drawer)');
  });

  it('the slide panel and its centered-dialog mode sit one above their own backdrop, still on the drawer rung', () => {
    expect(zIndexOf(panelCss, '.sp-panel')).toBe('calc(var(--mj-z-drawer) + 1)');
    expect(zIndexOf(panelCss, '.sp-dialog')).toBe('calc(var(--mj-z-drawer) + 1)');
  });

  it('neither stylesheet hardcodes a stacking number any more', () => {
    for (const css of [dialogCss, panelCss]) {
      const hardcoded = Array.from(css.matchAll(/z-index\s*:\s*(\d{3,})\s*;/g)).map((m) => m[1]);
      expect(hardcoded).toEqual([]);
    }
  });
});

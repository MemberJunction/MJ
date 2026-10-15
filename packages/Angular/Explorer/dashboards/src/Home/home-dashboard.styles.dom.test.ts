import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Home's stylesheet, as the browser parses it. jsdom has no layout and no theme, so these specs check what the
 * stylesheet declares; a browser check covers the look in the light and dark themes.
 */
describe('Home stylesheet', () => {
  let styleElement: HTMLStyleElement;
  let rules: CSSStyleRule[];

  beforeAll(() => {
    styleElement = document.createElement('style');
    styleElement.textContent = readFileSync(join(__dirname, 'home-dashboard.component.css'), 'utf8');
    document.head.appendChild(styleElement);
    const sheet = styleElement.sheet;
    if (!sheet) {
      throw new Error('jsdom did not parse the Home stylesheet');
    }
    rules = Array.from(sheet.cssRules).filter((rule): rule is CSSStyleRule => 'selectorText' in rule);
  });

  afterAll(() => {
    styleElement.remove();
  });

  /** What the last rule with exactly this selector declares for the property, or null when no rule does. */
  function declared(selector: string, property: string): string | null {
    let found: string | null = null;
    for (const rule of rules) {
      const value = rule.style.getPropertyValue(property);
      if (value && rule.selectorText.trim() === selector) {
        found = value.trim();
      }
    }
    return found;
  }

  it("darkens a pin's picture under its Open button with the overlay token, which stays dark in the dark theme", () => {
    expect(declared('.pin-overlay', 'background')).toBe('var(--mj-bg-overlay)');
  });
});

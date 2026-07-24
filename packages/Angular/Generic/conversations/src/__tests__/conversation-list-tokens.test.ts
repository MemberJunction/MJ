import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Design-token guard for the conversation list's INLINE styles.
 *
 * The repo's CI gate (`npm run check:ui-tokens`) scans changed .css/.scss files,
 * so hardcoded colors inside a component's inline `styles:` block in a .ts file
 * escape it — which is exactly how the renameHighlight keyframes shipped with
 * hardcoded tailwind blue/purple/emerald rgba values that ignored theming. This
 * spec mirrors the gate for this component's source so the violation class can't
 * come back: every color must be a var(--…) token (or a color-mix over one),
 * with the same shadow-neutral exemptions the CI gate allows
 * (rgba(0,0,0,x) / rgba(255,255,255,x)).
 */
describe('conversation-list inline styles — design tokens only', () => {
  const source = readFileSync(
    resolve(__dirname, '../lib/components/conversation/conversation-list.component.ts'),
    'utf8'
  );
  const stylesMatch = source.match(/styles:\s*\[`([\s\S]*?)`\]/);

  it('has an inline styles block to check', () => {
    expect(stylesMatch).not.toBeNull();
  });

  const styles = stylesMatch?.[1] ?? '';

  it('contains no hardcoded hex colors', () => {
    const hexes = styles.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
  });

  it('contains no rgb()/rgba() except shadow neutrals', () => {
    const rgbas = (styles.match(/rgba?\([^)]*\)/g) ?? []).filter(
      (v) => !/^rgba?\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*,/.test(v)
    );
    expect(rgbas).toEqual([]);
  });

  it('contains no hsl()/hsla()', () => {
    const hsls = styles.match(/hsla?\([^)]*\)/g) ?? [];
    expect(hsls).toEqual([]);
  });

  it('keeps the white-label indirection tokens in place', () => {
    // The public host-overridable tokens with their stock fallbacks…
    expect(styles).toContain('--conv-list-bg: var(--mj-conversations-list-bg, var(--mj-brand-secondary))');
    expect(styles).toContain('--conv-list-ink: var(--mj-conversations-list-ink, var(--mj-brand-on-secondary))');
    expect(styles).toContain('--conv-list-active-ink: var(--mj-conversations-list-active-ink, var(--mj-brand-on-secondary))');
    // …and no rule may bypass the indirection by using the raw brand tokens for
    // panel background/ink. Exactly ONE deliberate on-secondary use survives:
    // the bulk-delete button's ink sits on the error-red button, not the panel
    // (see the comment at that rule) — anything beyond that is a regression.
    const bodyAfterHost = styles.slice(styles.indexOf('}'));
    expect(bodyAfterHost).not.toContain('var(--mj-brand-secondary)');
    expect(bodyAfterHost.match(/var\(--mj-brand-on-secondary\)/g) ?? []).toHaveLength(1);
  });

  it('active-row child rules derive from the ACTIVE ink, not the panel ink', () => {
    // A host remapping the panel ink (e.g. to --mj-text-primary on a light
    // surface) must not darken text sitting on the brand-colored active row.
    const activeRules = styles.match(/\.conversation-item\.active[^{]*\{[^}]*\}/g) ?? [];
    expect(activeRules.length).toBeGreaterThan(0);
    for (const rule of activeRules) {
      expect(rule).not.toContain('var(--conv-list-ink)');
      expect(rule).not.toContain('var(--mj-brand-primary-hover)');
    }
  });
});

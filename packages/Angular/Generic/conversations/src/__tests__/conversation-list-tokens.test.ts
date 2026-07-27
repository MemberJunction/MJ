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
 *
 * Known blind spots, inherited from the CI gate this mirrors: NAMED css colors
 * (`white`, `navy`) and inline `style="…"` attributes in the template are not
 * detected by either. If you add a color, write it as a token — the guard is a
 * backstop, not a proof.
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

  /**
   * Everything AFTER the `:host { … }` block — i.e. the rules that must go through the
   * --conv-list-* indirection rather than reading the raw brand tokens the :host block
   * legitimately names as fallbacks.
   *
   * Anchored on the `:host` selector and its FIRST `}` rather than `styles.indexOf('}')`
   * — a stray `}` in the (long) explanatory comment inside :host would otherwise move
   * this boundary and silently defang every assertion below it.
   */
  const hostStart = styles.indexOf(':host');
  const bodyAfterHost = styles.slice(styles.indexOf('}', hostStart) + 1);

  it('locates the :host block and a non-empty body after it', () => {
    expect(hostStart).toBeGreaterThanOrEqual(0);
    expect(bodyAfterHost).toContain('.conversation-list');
    expect(bodyAfterHost).not.toContain(':host');
  });

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
    expect(styles).toContain('--conv-list-bg: var(--mj-chat-list-bg, var(--mj-brand-secondary))');
    expect(styles).toContain('--conv-list-ink: var(--mj-chat-list-ink, var(--mj-brand-on-secondary))');
    expect(styles).toContain('--conv-list-active-bg: var(--mj-chat-list-active-bg, var(--mj-brand-primary))');
    expect(styles).toContain('--conv-list-active-ink: var(--mj-chat-list-active-ink, var(--mj-brand-on-secondary))');
    expect(styles).toContain('--conv-list-active-hover-bg: var(--mj-chat-list-active-hover-bg, var(--mj-brand-primary-hover))');
    // …the accent trio (action color) with its stock fallbacks…
    expect(styles).toContain('--conv-list-accent: var(--mj-chat-list-accent, var(--mj-brand-primary))');
    expect(styles).toContain('--conv-list-accent-ink: var(--mj-chat-list-accent-ink, var(--mj-text-inverse))');
    expect(styles).toContain('--conv-list-accent-hover: var(--mj-chat-list-accent-hover, var(--mj-brand-primary-hover))');
    // …and the row-hover wash, defaulting to the prior ink-derived tint.
    expect(styles).toContain('--conv-list-hover-bg: var(--mj-chat-list-hover-bg, color-mix(in srgb, var(--conv-list-ink) 8%, transparent))');
    expect(styles).toContain('.conversation-item:hover { background: var(--conv-list-hover-bg);');
    // …and no rule may bypass the indirection by using the raw brand tokens for
    // panel background/ink. Exactly ONE deliberate on-secondary use survives:
    // the bulk-delete button's ink sits on the error-red button, not the panel
    // (see the comment at that rule) — anything beyond that is a regression.
    expect(bodyAfterHost).not.toContain('var(--mj-brand-secondary)');
    expect(bodyAfterHost.match(/var\(--mj-brand-on-secondary\)/g) ?? []).toHaveLength(1);
  });

  it('routes the panel action surfaces through the accent token, not raw brand-primary', () => {
    // The New Conversation button and drag-over highlights read the accent token
    // so a host can retint actions independently of the active row.
    expect(styles).toContain('.btn-new-conversation:hover { background: var(--conv-list-accent-hover); }');
    expect(styles).toContain('background: var(--conv-list-accent);'); // btn-new-conversation bg
    expect(styles).toContain('color: var(--conv-list-accent-ink);'); // btn-new-conversation label
    expect(styles).toContain('accent-color: var(--conv-list-accent);'); // bulk-select checkbox
    // brand-primary survives in the body ONLY inside the multi-hue message-drag
    // glow's color-mix gradients (deliberately kept) — never as a bare
    // `background:`/`border-color:` on an action element (those route through the
    // accent token now).
    expect(bodyAfterHost).not.toMatch(/background:\s*var\(--mj-brand-primary\)/);
    expect(bodyAfterHost).not.toMatch(/border-color:\s*var\(--mj-brand-primary\)/);
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

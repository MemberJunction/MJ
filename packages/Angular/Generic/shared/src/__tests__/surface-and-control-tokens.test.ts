import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contract tests for Workstream 6b tokens in `_tokens.scss` (UNIFIED_PLAN.md Phase 0 / NAMING.md):
 * - Surface & elevation ramp B (`sunken`, `base`, `elevated`, `overlay`)
 * - Sunken has no hover/selected state tokens
 * - Control-height scale `32px / 40px / 52px` on desktop, `44px` for `sm` and `md` under `@media (pointer: coarse)`
 * - Radius role tokens (`--mj-radius-{control,surface,overlay,pill}`)
 * - Ambient layer off by default (`--mj-ambient: none`, `--mj-ambient-strength: 0`)
 * - Dark text tiers re-declared on elevated/overlay surfaces
 * - `.mj-surface-*` classes re-pointing `--mj-text-{secondary,muted,link,link-hover}`
 */
describe('design tokens: WS6b surface ramp, control heights, radius roles, and ambient defaults', () => {
  const tokens = readFileSync(resolve(__dirname, '../lib/_tokens.scss'), 'utf8');
  const rootStart = tokens.indexOf(':root {');
  const darkStart = tokens.indexOf('[data-theme="dark"]');
  const coarseStart = tokens.indexOf('@media (pointer: coarse)');
  const rootBlock = tokens.slice(rootStart, darkStart);
  const darkBlock = tokens.slice(darkStart, coarseStart);
  const tailBlock = tokens.slice(coarseStart);

  function extractVars(block: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const match of block.matchAll(/(--mj-[a-z0-9-]+):\s*([^;]+);/g)) {
      map.set(match[1], match[2].trim());
    }
    return map;
  }

  const rootVars = extractVars(rootBlock);
  const darkVars = extractVars(darkBlock);

  it('declares the 4 Tier-2 radius role tokens in :root', () => {
    expect(rootVars.get('--mj-radius-control')).toBe('var(--mj-radius-md)');
    expect(rootVars.get('--mj-radius-surface')).toBe('var(--mj-radius-lg)');
    expect(rootVars.get('--mj-radius-overlay')).toBe('var(--mj-radius-lg)');
    expect(rootVars.get('--mj-radius-pill')).toBe('var(--mj-radius-full)');
  });

  it('declares the 3-step control-height scale (32 / 40 / 52px) in :root and 44px for sm/md on coarse pointers', () => {
    expect(rootVars.get('--mj-control-height-sm')).toBe('32px');
    expect(rootVars.get('--mj-control-height-md')).toBe('40px');
    expect(rootVars.get('--mj-control-height-lg')).toBe('52px');

    const coarseBlock = tailBlock.slice(0, tailBlock.indexOf('.mj-surface-sunken'));
    const coarseVars = extractVars(coarseBlock);
    expect(coarseVars.get('--mj-control-height-sm')).toBe('44px');
    expect(coarseVars.get('--mj-control-height-md')).toBe('44px');
    expect(coarseVars.has('--mj-control-height-lg')).toBe(false);
  });

  it('declares ambient layer off by default in :root', () => {
    expect(rootVars.get('--mj-ambient')).toBe('none');
    expect(rootVars.get('--mj-ambient-strength')).toBe('0');
  });

  it('maps the 4 surface levels per NAMING.md (Ramp B) with no state tokens on sunken', () => {
    // sunken: bg, border, shadow only — no hover or selected state tokens
    expect(rootVars.get('--mj-surface-sunken-bg')).toBe('var(--mj-bg-surface-sunken)');
    expect(rootVars.get('--mj-surface-sunken-border')).toBe('1px solid var(--mj-border-subtle)');
    expect(rootVars.get('--mj-surface-sunken-shadow')).toBe('var(--mj-shadow-inner)');
    expect(rootVars.has('--mj-surface-sunken-bg-hover')).toBe(false);
    expect(rootVars.has('--mj-surface-sunken-bg-selected')).toBe(false);
    expect(rootVars.has('--mj-surface-sunken-border-selected')).toBe(false);

    // base, elevated, overlay have bg, border, shadow, bg-hover, bg-selected, border-selected
    for (const level of ['base', 'elevated', 'overlay'] as const) {
      expect(rootVars.has(`--mj-surface-${level}-bg`)).toBe(true);
      expect(rootVars.has(`--mj-surface-${level}-border`)).toBe(true);
      expect(rootVars.has(`--mj-surface-${level}-shadow`)).toBe(true);
      expect(rootVars.has(`--mj-surface-${level}-bg-hover`)).toBe(true);
      expect(rootVars.has(`--mj-surface-${level}-bg-selected`)).toBe(true);
      expect(rootVars.has(`--mj-surface-${level}-border-selected`)).toBe(true);
    }

    // overlay sits on elevated bg
    expect(rootVars.get('--mj-surface-overlay-bg')).toBe('var(--mj-bg-surface-elevated)');
    expect(rootVars.get('--mj-surface-elevated-shadow')).toBe('var(--mj-shadow-md)');
    expect(rootVars.get('--mj-surface-overlay-shadow')).toBe('var(--mj-shadow-xl)');
  });

  it('re-declares dark text tiers on elevated and overlay surfaces while keeping base and sunken on standard dark text', () => {
    expect(rootVars.get('--mj-surface-text-muted-selected')).toBe('var(--mj-text-secondary)');
    expect(darkVars.get('--mj-surface-base-text-secondary')).toBe('var(--mj-text-secondary)');
    expect(darkVars.get('--mj-surface-base-text-muted')).toBe('var(--mj-text-muted)');
    expect(darkVars.get('--mj-surface-elevated-text-secondary')).toBe('var(--mj-color-neutral-200)');
    expect(darkVars.get('--mj-surface-elevated-text-muted')).toBe('var(--mj-color-neutral-300)');
    expect(darkVars.get('--mj-surface-elevated-text-link')).toBe('var(--mj-color-brand-200)');
    expect(darkVars.get('--mj-surface-elevated-text-link-hover')).toBe('var(--mj-color-brand-100)');
    expect(darkVars.get('--mj-surface-overlay-text-secondary')).toBe('var(--mj-surface-elevated-text-secondary)');
    expect(darkVars.get('--mj-surface-overlay-text-muted')).toBe('var(--mj-surface-elevated-text-muted)');
  });

  it('ships .mj-surface-{sunken,base,elevated,overlay} classes that re-point text tokens', () => {
    for (const level of ['sunken', 'base', 'elevated', 'overlay'] as const) {
      expect(tailBlock).toContain(`.mj-surface-${level}`);
      expect(tailBlock).toContain(`--mj-text-secondary: var(--mj-surface-${level}-text-secondary);`);
      expect(tailBlock).toContain(`--mj-text-muted: var(--mj-surface-${level}-text-muted);`);
      expect(tailBlock).toContain(`--mj-text-link: var(--mj-surface-${level}-text-link);`);
      expect(tailBlock).toContain(`--mj-text-link-hover: var(--mj-surface-${level}-text-link-hover);`);
    }
    expect(tailBlock).not.toContain('.mj-surface-sunken.is-hover');
    expect(tailBlock).not.toContain('.mj-surface-sunken.is-selected');
  });

  it('preserves canvas and card background tokens in :root and dark blocks', () => {
    expect(rootVars.get('--mj-bg-canvas')).toBe('var(--mj-color-neutral-100)');
    expect(rootVars.get('--mj-bg-surface-card')).toBe('var(--mj-color-neutral-50)');
    expect(darkVars.get('--mj-bg-canvas')).toBe('var(--mj-color-neutral-900)');
    expect(darkVars.get('--mj-bg-surface-card')).toBe('color-mix(in srgb-linear, var(--mj-color-neutral-800) 68%, var(--mj-color-neutral-700))');
  });
});

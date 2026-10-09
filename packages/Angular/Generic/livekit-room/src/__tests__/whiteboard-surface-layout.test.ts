import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The room's whiteboard surface styles only itself. The board host it renders lays itself out (a flex column: its
 * header, then the board filling the rest), and a rule on it from the surface, scoped and so more specific than the
 * host's own `:host`, replaced that layout: `.lk-wb { display: block }` left the board with no height, an empty
 * whiteboard in the room and in a share of it. Layout cannot be measured in jsdom, so this reads the surface's styles.
 */
const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../lib/components/livekit-whiteboard-surface.component.ts'), 'utf8');

/** The selectors of the component's style rules. */
function selectors(): string[] {
  const styles = SOURCE.slice(SOURCE.indexOf('styles: ['));
  const block = styles.slice(styles.indexOf('`') + 1, styles.indexOf('`', styles.indexOf('`') + 1));
  return [...block.matchAll(/([^{}]+)\{[^}]*\}/g)].map((match) => match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim());
}

describe('the room whiteboard surface', () => {
  it('styles only its own host, leaving the board host its layout', () => {
    expect(selectors()).toEqual([':host']);
  });
});

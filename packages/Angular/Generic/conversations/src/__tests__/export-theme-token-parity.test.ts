import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The exported HTML stylesheet and the auto-snapshot token set must stay in 1:1
 * correspondence.
 *
 * A token the stylesheet READS but the snapshot doesn't CAPTURE silently falls back to
 * its legacy literal, so a themed export comes out half-branded — the failure looks like
 * "some of the colors didn't take" and is easy to miss by eye. The reverse (captured but
 * never read) is dead weight in the emitted `:root{}` block.
 *
 * Source-text based on purpose: the stylesheet is a template literal built inside
 * `exportAsHTML`, so there's no runtime artifact to assert against.
 */
describe('export stylesheet ↔ DEFAULT_EXPORT_THEME_TOKENS parity', () => {
  const source = readFileSync(resolve(__dirname, '../lib/services/export.service.ts'), 'utf8');

  /** Tokens referenced as var(--mj-…) inside the emitted stylesheet.
   *  NB: search for the closing tag AFTER the block start — `buildRootBlock` emits its
   *  own `</style>` earlier in the file and would otherwise invert this slice. */
  const styleStart = source.indexOf('const styles = options.includeCSS');
  const styleBlock = source.slice(styleStart, source.indexOf('</style>', styleStart));
  const read = new Set(
    (styleBlock.match(/var\((--mj-[a-z-]+)/g) ?? []).map((m) => m.replace('var(', ''))
  );

  /** Tokens the auto-snapshot captures. */
  const declStart = source.indexOf('DEFAULT_EXPORT_THEME_TOKENS: readonly');
  const declBlock = source.slice(declStart, source.indexOf('];', declStart));
  const captured = new Set((declBlock.match(/'(--mj-[a-z-]+)'/g) ?? []).map((m) => m.replace(/'/g, '')));

  it('finds both sets', () => {
    expect(read.size).toBeGreaterThan(5);
    expect(captured.size).toBeGreaterThan(5);
  });

  it('captures every token the stylesheet reads (else a themed export is half-branded)', () => {
    expect([...read].filter((t) => !captured.has(t)).sort()).toEqual([]);
  });

  it('captures nothing the stylesheet never reads (dead weight in the :root block)', () => {
    expect([...captured].filter((t) => !read.has(t)).sort()).toEqual([]);
  });
});

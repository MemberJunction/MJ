import { describe, it, expect } from 'vitest';
import { Marked } from 'marked';
import { createCollapsibleHeadingsExtension } from '../extensions/collapsible-headings.extension.js';

function render(markdown: string, opts?: Parameters<typeof createCollapsibleHeadingsExtension>[0]): string {
  const marked = new Marked();
  marked.use(createCollapsibleHeadingsExtension(opts));
  return marked.parse(markdown) as string;
}

describe('createCollapsibleHeadingsExtension', () => {
  it('wraps headings at/below startLevel in collapsible sections', () => {
    const html = render('## A\n\nbody', { startLevel: 2 });
    expect(html).toContain('class="collapsible-section"');
    expect(html).toContain('collapsible-heading-wrapper');
    expect(html).toContain('collapsible-content');
    expect(html).toContain('data-level="2"');
  });

  it('does not wrap headings above startLevel', () => {
    const html = render('# Top\n\nbody', { startLevel: 2 });
    // h1 is above startLevel 2 → plain heading, no section wrapper around it
    expect(html).toContain('<h1');
    expect(html).not.toContain('data-level="1"');
  });

  it('nests a deeper heading inside its parent section', () => {
    const html = render('## Parent\n\np\n\n### Child\n\nc', { startLevel: 2 });
    const parentIdx = html.indexOf('data-level="2"');
    const childIdx = html.indexOf('data-level="3"');
    const parentContentIdx = html.indexOf('collapsible-content');
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(childIdx).toBeGreaterThan(parentContentIdx);
  });

  it('marks sections collapsed when defaultExpanded is false', () => {
    const html = render('## A\n\nbody', { startLevel: 2, defaultExpanded: false });
    expect(html).toContain('collapsible-section collapsed');
  });

  it('honors autoExpandLevels (h2 expanded, h3 collapsed)', () => {
    const html = render('## A\n\np\n\n### B\n\nc', { startLevel: 2, autoExpandLevels: [2] });
    // h2 expanded → no "collapsed" class on the level-2 section opening
    expect(html).toContain('data-level="2"');
    // The level-3 section should carry the collapsed class.
    expect(html).toMatch(/collapsible-section collapsed" data-level="3"/);
  });
});

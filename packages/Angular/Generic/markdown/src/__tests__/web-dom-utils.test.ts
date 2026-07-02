import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeSvgContent } from '../lib/extensions/svg-renderer.extension';
import {
  addCopyButtonsToCodeBlocks,
  removeCopyButtonsFromCodeBlocks,
} from '../lib/extensions/code-copy.extension';
import {
  toggleCollapsibleSection,
  expandAllSections,
  collapseAllSections,
  expandToHeading,
} from '../lib/extensions/collapsible-headings.extension';

function container(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

// Prevent fixtures (and their duplicate ids) from leaking across tests.
afterEach(() => {
  document.body.innerHTML = '';
});

describe('sanitizeSvgContent', () => {
  it('removes <script> elements', () => {
    const el = container('<svg><script>alert(1)</script><circle/></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('circle')).not.toBeNull();
  });

  it('strips inline event-handler attributes', () => {
    const el = container('<svg><rect onclick="hack()" onload="x()"/></svg>');
    sanitizeSvgContent(el);
    const rect = el.querySelector('rect');
    expect(rect?.hasAttribute('onclick')).toBe(false);
    expect(rect?.hasAttribute('onload')).toBe(false);
  });

  it('removes javascript: hrefs', () => {
    const el = container('<svg><a href="javascript:evil()">x</a></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('removes foreignObject and external <use>', () => {
    const el = container('<svg><foreignObject></foreignObject><use href="https://evil.test/x"/></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('foreignObject')).toBeNull();
    expect(el.querySelector('use')).toBeNull();
  });
});

describe('addCopyButtonsToCodeBlocks / removeCopyButtonsFromCodeBlocks', () => {
  it('adds a copy button with a formatted language label', () => {
    const el = container('<pre><code class="language-ts">const x = 1;</code></pre>');
    addCopyButtonsToCodeBlocks(el);
    expect(el.querySelector('.code-copy-btn')).not.toBeNull();
    expect(el.querySelector('.code-language-label')?.textContent).toBe('TypeScript');
  });

  it('does not double-add a toolbar', () => {
    const el = container('<pre><code class="language-js">a</code></pre>');
    addCopyButtonsToCodeBlocks(el);
    addCopyButtonsToCodeBlocks(el);
    expect(el.querySelectorAll('.code-toolbar')).toHaveLength(1);
  });

  it('removes toolbars on cleanup', () => {
    const el = container('<pre><code class="language-js">a</code></pre>');
    addCopyButtonsToCodeBlocks(el);
    removeCopyButtonsFromCodeBlocks(el);
    expect(el.querySelector('.code-toolbar')).toBeNull();
  });
});

describe('collapsible DOM helpers', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = container(
      '<div class="collapsible-section" data-level="2">' +
        '<div class="collapsible-heading-wrapper"><button class="collapsible-toggle" aria-expanded="true"></button><h2 id="parent">Parent</h2></div>' +
        '<div class="collapsible-content">' +
          '<div class="collapsible-section collapsed" data-level="3">' +
            '<div class="collapsible-heading-wrapper"><button class="collapsible-toggle" aria-expanded="false"></button><h3 id="child">Child</h3></div>' +
            '<div class="collapsible-content"><p>c</p></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  });

  it('toggleCollapsibleSection flips the collapsed class and aria-expanded', () => {
    const parent = el.querySelector('.collapsible-section') as HTMLElement;
    toggleCollapsibleSection(parent);
    expect(parent.classList.contains('collapsed')).toBe(true);
    expect(parent.querySelector('.collapsible-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('expandAllSections clears every collapsed section', () => {
    expandAllSections(el);
    expect(el.querySelectorAll('.collapsible-section.collapsed')).toHaveLength(0);
  });

  it('collapseAllSections collapses every section', () => {
    collapseAllSections(el);
    expect(el.querySelectorAll('.collapsible-section:not(.collapsed)')).toHaveLength(0);
  });

  it('expandToHeading reveals ancestor sections of a heading', () => {
    // child section starts collapsed; expanding to #child should clear it
    expandToHeading(el, 'child');
    const child = el.querySelector('[data-level="3"]') as HTMLElement;
    expect(child.classList.contains('collapsed')).toBe(false);
  });
});

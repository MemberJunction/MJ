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

  it('strips javascript: from xlink:href', () => {
    const el = container('<svg><a xlink:href="javascript:evil()">x</a></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('a')?.hasAttribute('xlink:href')).toBe(false);
  });

  it('keeps a local <use> reference (only external ones are removed)', () => {
    const el = container('<svg><use href="#icon"/></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('use')).not.toBeNull();
  });

  it('is a no-op on a container with no dangerous content', () => {
    const el = container('<svg><circle cx="1" cy="1" r="1"/></svg>');
    sanitizeSvgContent(el);
    expect(el.querySelector('circle')).not.toBeNull();
  });

  it('does not throw on an empty container', () => {
    const el = container('');
    expect(() => sanitizeSvgContent(el)).not.toThrow();
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

  it('adds a copy button but no language label for a code block without a language class', () => {
    const el = container('<pre><code>plain code</code></pre>');
    addCopyButtonsToCodeBlocks(el);
    expect(el.querySelector('.code-copy-btn')).not.toBeNull();
    expect(el.querySelector('.code-language-label')).toBeNull();
  });

  it('omits the language label when showLanguageLabel is false', () => {
    const el = container('<pre><code class="language-ts">a</code></pre>');
    addCopyButtonsToCodeBlocks(el, { showLanguageLabel: false });
    expect(el.querySelector('.code-copy-btn')).not.toBeNull();
    expect(el.querySelector('.code-language-label')).toBeNull();
  });

  it('honors a custom button/toolbar class and can remove it again', () => {
    const el = container('<pre><code class="language-js">a</code></pre>');
    addCopyButtonsToCodeBlocks(el, { toolbarClass: 'my-bar', buttonClass: 'my-btn' });
    expect(el.querySelector('.my-btn')).not.toBeNull();
    removeCopyButtonsFromCodeBlocks(el, 'my-bar');
    expect(el.querySelector('.my-bar')).toBeNull();
  });

  it('is a no-op on a container with no code blocks', () => {
    const el = container('<p>no code here</p>');
    expect(() => addCopyButtonsToCodeBlocks(el)).not.toThrow();
    expect(el.querySelector('.code-toolbar')).toBeNull();
  });

  it('removeCopyButtonsFromCodeBlocks is safe when there are no toolbars', () => {
    const el = container('<pre><code>a</code></pre>');
    expect(() => removeCopyButtonsFromCodeBlocks(el)).not.toThrow();
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

  it('toggleCollapsibleSection expands a section that starts collapsed', () => {
    const child = el.querySelector('[data-level="3"]') as HTMLElement;
    expect(child.classList.contains('collapsed')).toBe(true);
    toggleCollapsibleSection(child);
    expect(child.classList.contains('collapsed')).toBe(false);
    expect(child.querySelector('.collapsible-toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('expandToHeading is a no-op for an unknown heading id (no throw)', () => {
    const child = el.querySelector('[data-level="3"]') as HTMLElement;
    expect(() => expandToHeading(el, 'does-not-exist')).not.toThrow();
    // The child that was collapsed stays collapsed — nothing was touched.
    expect(child.classList.contains('collapsed')).toBe(true);
  });

  it('expand/collapse helpers are safe on a container with no sections', () => {
    const empty = container('<p>nothing collapsible</p>');
    expect(() => expandAllSections(empty)).not.toThrow();
    expect(() => collapseAllSections(empty)).not.toThrow();
  });
});

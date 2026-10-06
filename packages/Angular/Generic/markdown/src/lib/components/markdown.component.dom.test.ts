import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { MarkdownComponent } from './markdown.component';
import { MarkdownRenderEvent } from '@memberjunction/markdown-core';

/**
 * DOM-level spec for <mj-markdown>. The component is module-declared
 * (standalone:false), so we render it via `declarations` + `imports: [CommonModule]`
 * and configure it through `@Input`s.
 *
 * It uses the real (providedIn:'root') MarkdownService, which parses markdown
 * synchronously via marked.js. We assert on the rendered output that lands in the
 * `[innerHTML]`-bound container, plus the container-class binding and the `rendered`
 * @Output. Mermaid/Prism async post-processing is NOT asserted here (mermaid needs a
 * real browser; that's a live-test concern) — we only verify the deterministic,
 * media-free template surface.
 */
describe('MarkdownComponent (DOM)', () => {
  function render(inputs: Record<string, unknown>): ComponentFixture<MarkdownComponent> {
    return renderComponentFixture(MarkdownComponent, {
      imports: [CommonModule],
      declarations: [MarkdownComponent],
      inputs,
    });
  }

  const container = (f: ComponentFixture<MarkdownComponent>): HTMLElement => f.nativeElement.querySelector('.mj-markdown-container') as HTMLElement;

  it('renders the static container element', () => {
    const f = render({ data: '' });
    expect(query(f, '.mj-markdown-container')).not.toBeNull();
  });

  it('renders markdown content into the innerHTML-bound container', () => {
    const f = render({ data: '# Hello World' });
    const c = container(f);
    const heading = c.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toContain('Hello World');
  });

  it('renders inline markdown formatting (bold) as the corresponding HTML element', () => {
    const f = render({ data: 'This is **strong** text' });
    expect(container(f).querySelector('strong')?.textContent).toBe('strong');
  });

  it('renders a fenced code block as a <pre><code> structure', () => {
    const f = render({ data: '```\nconst x = 1;\n```' });
    const c = container(f);
    expect(c.querySelector('pre')).not.toBeNull();
    expect(c.querySelector('pre code')).not.toBeNull();
  });

  it('renders an empty container when data is empty', () => {
    const f = render({ data: '' });
    // No data => renderedContent stays '' => no rendered child markup.
    expect(container(f).children.length).toBe(0);
  });

  it('applies the containerClass input to the container element', () => {
    const f = render({ data: '# X', containerClass: 'my-custom-class' });
    expect(container(f).classList.contains('my-custom-class')).toBe(true);
  });

  it('emits the rendered @Output with hasCodeBlocks=true for code content', async () => {
    const f = render({ data: '' });
    const events = capture<MarkdownRenderEvent>(f.componentInstance.rendered);

    // Setting data after first render drives ngOnChanges -> render() -> postRenderProcessing
    // is scheduled on a microtask. Use setInput (zoneless-correct), then flush the microtask.
    f.componentRef.setInput('data', '```\nconst x = 1;\n```');
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1];
    expect(last.hasCodeBlocks).toBe(true);
    expect(last.hasMermaid).toBe(false);
  });

  it('emits the rendered @Output with hasCodeBlocks=false for prose-only content', async () => {
    const f = render({ data: '' });
    const events = capture<MarkdownRenderEvent>(f.componentInstance.rendered);

    f.componentRef.setInput('data', 'Just some plain prose.');
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1].hasCodeBlocks).toBe(false);
  });

  /**
   * Sanitization, as seen through the component. With `enableHtml` or the default
   * `enableSvgRenderer`, Angular's sanitizer is bypassed and the HTML the service returns
   * (sanitized by DOMPurify in parse()) is trusted. jsdom does not execute handlers or
   * load images, so assertions are structural: the vector is gone, the layout survives.
   */
  describe('sanitization', () => {
    const attributeNamesIn = (root: HTMLElement): string[] =>
      Array.from(root.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes).map((a) => a.name.toLowerCase()));
    const passthrough = (data: string) => container(render({ data, enableHtml: true }));

    it('removes <script> elements, including ones with a spaced end tag', () => {
      const c = passthrough('<div>before</div><script>alert(1)</script ><div>after</div>');
      expect(c.querySelector('script')).toBeNull();
      expect(c.textContent).toContain('before');
      expect(c.textContent).toContain('after');
      expect(c.textContent).not.toContain('alert(1)');
    });

    it('removes every on* handler, whatever its name or quoting', () => {
      const c = passthrough('<img src="x" onerror="alert(1)"><div onpointerrawupdate=alert(1) ONMOUSEENTER="alert(1)">t</div><svg onload="alert(1)"><circle r="1"/></svg>');
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
      expect(c.querySelector('img')).not.toBeNull();
      expect(c.querySelector('svg circle')).not.toBeNull();
    });

    it.each([
      ['javascript:', '<a href="javascript:alert(1)">x</a>'],
      ['vbscript:', '<a href="vbscript:msgbox(1)">x</a>'],
      ['data:text/html', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
      ['data:image/svg+xml on a link', '<a href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+">x</a>'],
      ['whitespace inside the scheme', '<a href="java\tscript:alert(1)">x</a>'],
      ['entity inside the scheme', '<a href="jav&#x09;ascript:alert(1)">x</a>'],
      ['newline inside the scheme', '<a href="java\nscript:alert(1)">x</a>'],
      ['upper-case scheme', '<a href="JAVASCRIPT:alert(1)">x</a>'],
    ])('drops the link target for %s', (_label, html) => {
      const a = passthrough(html).querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.hasAttribute('href')).toBe(false);
    });

    it('drops javascript: from a form action', () => {
      const c = passthrough('<form action="javascript:alert(1)"><button>go</button></form>');
      expect(c.querySelector('form')?.hasAttribute('action')).toBe(false);
    });

    it.each([
      ['iframe', '<iframe src="https://evil.test/"></iframe>'],
      ['iframe with srcdoc', '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'],
      ['object', '<object data="https://evil.test/x.swf"></object>'],
      ['embed', '<embed src="https://evil.test/x.swf">'],
      ['base', '<base href="https://evil.test/">'],
    ])('removes %s while keeping the surrounding content', (_label, html) => {
      const c = passthrough('<p>before</p>' + html + '<p>after</p>');
      expect(c.querySelector('iframe, object, embed, base')).toBeNull();
      expect(c.textContent).toContain('before');
      expect(c.textContent).toContain('after');
    });

    it('removes <foreignObject> and SMIL animation from inline SVG, keeps shapes', () => {
      const c = passthrough('<svg><foreignObject><body onload="alert(1)"></body></foreignObject><circle r="1"><animate attributeName="r" to="2"/></circle></svg>');
      expect(c.querySelector('foreignObject, animate')).toBeNull();
      expect(c.querySelector('svg circle')).not.toBeNull();
    });

    it('keeps a same-document <use> and removes an external one', () => {
      const c = passthrough('<svg><defs><symbol id="ic"><circle r="1"/></symbol></defs><use href="#ic"/><use href="https://evil.test/s.svg#x"/></svg>');
      const uses = Array.from(c.querySelectorAll('use')).map((u) => u.getAttribute('href'));
      expect(uses).toEqual(['#ic']);
    });

    it('keeps layout HTML, inline styles, data attributes and data: images', () => {
      const c = passthrough(
        '<table class="grid" data-role="report"><tr><td style="color: red">cell</td></tr></table>' +
          '<input type="text" value="v"><details><summary>s</summary>body</details>' +
          '<img src="data:image/png;base64,iVBORw0KGgo=" alt="pixel">',
      );
      expect(c.querySelector('table.grid')?.getAttribute('data-role')).toBe('report');
      expect(c.querySelector('td')?.getAttribute('style')).toContain('color');
      expect(c.querySelector('input')?.getAttribute('value')).toBe('v');
      expect(c.querySelector('details summary')?.textContent).toBe('s');
      expect(c.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png/);
    });

    it('keeps a leading <style> block (mockups start that way)', () => {
      const c = passthrough('<style>.card{color:red}</style><div class="card">x</div>');
      expect(c.querySelector('style')?.textContent).toContain('.card');
      expect(c.querySelector('div.card')).not.toBeNull();
    });

    it('keeps target on links and enforces rel=noopener', () => {
      const c = passthrough('<a href="https://example.test/page" target="_blank">site</a><a href="#section">local</a>');
      const [ext, local] = Array.from(c.querySelectorAll('a'));
      expect(ext.getAttribute('href')).toBe('https://example.test/page');
      expect(ext.getAttribute('target')).toBe('_blank');
      expect(ext.getAttribute('rel')).toContain('noopener');
      expect(local.getAttribute('href')).toBe('#section');
      expect(local.hasAttribute('rel')).toBe(false);
    });

    it('keeps heading ids that collide with document properties', () => {
      // DOMPurify's default DOM-clobbering guard would strip these; heading anchors must work.
      const c = container(render({ data: '# Title' + '\n\n' + '## Location' + '\n\n' + '## Overview' }));
      expect(c.querySelector('h1')?.id).toBe('title');
      expect(c.querySelector('h2')?.id).toBe('location');
      expect(Array.from(c.querySelectorAll('h2')).map((h) => h.id)).toEqual(['location', 'overview']);
    });

    it('sanitizes HTML that marked miscoded into a code block and the service unwrapped', () => {
      // A bare fenced block whose text is structural HTML is unwrapped by the service (no
      // language class), then sanitized like any other passthrough markup.
      const c = passthrough('```' + '\n' + '<div class="card"><img src="x" onerror="alert(1)"><p>inner</p></div>' + '\n' + '```');
      expect(c.querySelector('pre')).toBeNull();
      expect(c.querySelector('div.card p')?.textContent).toBe('inner');
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
    });

    it('strips handlers and script from a rendered SVG code fence (enableSvgRenderer)', () => {
      const data = '```svg' + '\n' + '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><circle r="1"/></svg>' + '\n' + '```';
      const c = container(render({ data, enableSvgRenderer: true }));
      expect(c.querySelector('svg')).not.toBeNull();
      expect(c.querySelector('script')).toBeNull();
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
    });

    it('enableJavaScript=true is the documented opt-out and leaves script elements in place', () => {
      // jsdom (as vitest configures it) executes this script and logs "Not implemented:
      // window.alert" to stderr. Expected here and only here.
      const c = container(render({ data: '<div>x</div><script>alert(1)</script>', enableHtml: true, enableJavaScript: true }));
      expect(c.querySelector('script')).not.toBeNull();
    });

    it('Angular sanitizer path (no passthrough, no SVG renderer) still strips handlers', () => {
      const c = container(render({ data: 'text <img src="x" onerror="alert(1)">', enableSvgRenderer: false }));
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
    });
  });
});

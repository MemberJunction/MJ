import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MarkdownComponent } from './markdown.component';

/**
 * Cross-site scripting spec for <mj-markdown> in the modes that bypass Angular's sanitizer.
 *
 * With `enableHtml` (HTML passthrough) or `enableSvgRenderer` on, the component trusts the
 * rendered HTML via `bypassSecurityTrustHtml`, so the component's own sanitizer is the only
 * thing between model or user supplied markup and the DOM. Every case here is a payload that
 * the previous deny-list sanitizer let through or that a sanitizer commonly misses.
 *
 * Assertions inspect the rendered DOM in the `[innerHTML]`-bound container. jsdom does not
 * execute inline handlers or load images, so the assertion is structural: the vector is gone
 * and the surrounding layout markup is intact.
 */
describe('MarkdownComponent sanitization (DOM)', () => {
  function render(inputs: Record<string, unknown>): ComponentFixture<MarkdownComponent> {
    return renderComponentFixture(MarkdownComponent, {
      imports: [CommonModule],
      declarations: [MarkdownComponent],
      inputs,
    });
  }
  const container = (f: ComponentFixture<MarkdownComponent>): HTMLElement =>
    f.nativeElement.querySelector('.mj-markdown-container') as HTMLElement;
  const passthrough = (data: string) => container(render({ data, enableHtml: true }));

  function attributeNamesIn(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes).map((a) => a.name.toLowerCase()));
  }

  describe('HTML passthrough mode (enableHtml) strips script vectors', () => {
    it('removes <script> elements, including ones with a spaced end tag', () => {
      const c = passthrough('<div>before</div><script>alert(1)</script ><div>after</div>');
      expect(c.querySelector('script')).toBeNull();
      expect(c.textContent).toContain('before');
      expect(c.textContent).toContain('after');
      expect(c.textContent).not.toContain('alert(1)');
    });

    it('removes every on* event handler, whatever its name or quoting', () => {
      const c = passthrough(
        '<img src="x" onerror="alert(1)"><div onpointerrawupdate=alert(1) ONMOUSEENTER="alert(1)">t</div><svg onload="alert(1)"><circle r="1"/></svg>',
      );
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
      expect(c.querySelector('img')).not.toBeNull();
      expect(c.querySelector('div')?.textContent).toBe('t');
      expect(c.querySelector('svg circle')).not.toBeNull();
    });

    it.each([
      ['javascript:', '<a href="javascript:alert(1)">x</a>'],
      ['vbscript:', '<a href="vbscript:msgbox(1)">x</a>'],
      ['data:text/html', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
      ['data: with any type on a link', '<a href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+">x</a>'],
      ['whitespace-obfuscated scheme', '<a href="java\tscript:alert(1)">x</a>'],
      ['entity-obfuscated scheme', '<a href="jav&#x09;ascript:alert(1)">x</a>'],
      ['newline inside scheme', '<a href="java\nscript:alert(1)">x</a>'],
      ['upper-case scheme', '<a href="JAVASCRIPT:alert(1)">x</a>'],
    ])('drops the link target for %s', (_label, html) => {
      const c = passthrough(html);
      const a = c.querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.hasAttribute('href')).toBe(false);
      expect(a?.textContent).toBe('x');
    });

    it('drops javascript: from form actions and formaction', () => {
      const c = passthrough('<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">go</button></form>');
      expect(c.querySelector('form')?.hasAttribute('action')).toBe(false);
      expect(c.querySelector('button')?.hasAttribute('formaction')).toBe(false);
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

    it('removes <foreignObject> from inline SVG', () => {
      const c = passthrough('<svg><foreignObject><body onload="alert(1)"></body></foreignObject><rect width="1" height="1"/></svg>');
      expect(c.querySelector('foreignObject')).toBeNull();
      expect(c.querySelector('svg rect')).not.toBeNull();
    });

    it('keeps layout HTML, inline styles, data attributes and images with data: sources', () => {
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

    it('keeps ordinary http links and anchors', () => {
      const c = passthrough('<a href="https://example.test/page" target="_blank">site</a><a href="#section">local</a>');
      const links = Array.from(c.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      expect(links).toEqual(['https://example.test/page', '#section']);
    });

    it('sanitizes HTML that marked miscoded into a code block and the service unwrapped', () => {
      const c = passthrough('<div><img src="x" onerror="alert(1)"><p>inner</p></div>');
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
      expect(c.querySelector('p')?.textContent).toBe('inner');
    });
  });

  describe('SVG renderer mode (enableSvgRenderer)', () => {
    it('strips handlers and script from a rendered SVG code fence', () => {
      const data = '```svg\n<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><circle r="1"/></svg>\n```';
      const c = container(render({ data, enableSvgRenderer: true }));
      expect(c.querySelector('svg')).not.toBeNull();
      expect(c.querySelector('script')).toBeNull();
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
      expect(c.querySelector('circle')).not.toBeNull();
    });
  });

  describe('explicit opt-in and default mode', () => {
    it('enableJavaScript=true is the documented opt-out and leaves script elements in place', () => {
      // jsdom (as vitest configures it) executes this script and logs "Not implemented:
      // window.alert" to stderr. That noise is expected here and only here: it is the one
      // case in this file where script is meant to survive.
      const c = container(render({ data: '<div>x</div><script>alert(1)</script>', enableHtml: true, enableJavaScript: true }));
      expect(c.querySelector('script')).not.toBeNull();
    });

    it('default mode (no passthrough) still strips handlers through Angular sanitizer', () => {
      const c = container(render({ data: 'text <img src="x" onerror="alert(1)">' }));
      expect(attributeNamesIn(c).some((n) => n.startsWith('on'))).toBe(false);
    });
  });
});

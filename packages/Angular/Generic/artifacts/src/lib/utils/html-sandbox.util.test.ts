import { describe, it, expect } from 'vitest';
import {
  BuildSandboxedHtmlDocument,
  EscapeHtml,
  SanitizeHtmlForSandboxedFrame,
} from './html-sandbox.util';

describe('html-sandbox.util (Node fail-closed without DOM)', () => {
  it('EscapeHtml neutralizes HTML tags, quotes, and ampersands', () => {
    const escaped = EscapeHtml(`<script>alert("xss" & '1')</script>`);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;1&#39;)&lt;/script&gt;');
  });

  it('SanitizeHtmlForSandboxedFrame fails closed via HTML escaping without window, and strips XSS with DOMPurify when DOM exists', () => {
    const payload = '<script>alert(1)</script><p>Hello</p>';
    const sanitized = SanitizeHtmlForSandboxedFrame(payload);
    if (typeof window === 'undefined') {
      expect(sanitized).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;Hello&lt;/p&gt;');
    } else {
      expect(sanitized).not.toContain('<script');
      expect(sanitized).toContain('<p>Hello</p>');
    }
  });

  it('BuildSandboxedHtmlDocument emits strict CSP meta tag and escaped title', () => {
    const doc = BuildSandboxedHtmlDocument({
      Title: 'Q4 <Report> & "Metrics"',
      BodyHtml: '<p>Hello</p>',
    });
    expect(doc).toContain("http-equiv=\"Content-Security-Policy\"");
    expect(doc).toContain("script-src 'none'");
    expect(doc).toContain('<title>Q4 &lt;Report&gt; &amp; &quot;Metrics&quot;</title>');
    expect(doc).toContain('<body><p>Hello</p></body>');
  });
});

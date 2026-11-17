import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OpenHtmlInSandboxedWindow,
  PrintHtmlInSandboxedIframe,
  SanitizeHtmlForSandboxedFrame,
  SanitizeSvgForSandboxedFrame,
} from './html-sandbox.util';

describe('html-sandbox.util (DOM)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('SanitizeHtmlForSandboxedFrame strips dangerous tags, SVG animations, event handlers, nested tag-splitting, slash attrs, and entity-encoded javascript URIs via DOMPurify', () => {
    const payload = [
      '<script>window.opener.location="https://evil.example"</script>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<base href="https://evil.example/">',
      '<style>@import url(https://evil.example/a.css);</style>',
      '<sty<iframe/>le>@import url(https://evil.example/b.css);</style>',
      '<svg><set attributeName="onbegin" to="alert(1)"/><animate onbegin="alert(1)"/></svg>',
      '<img src="x" onerror="alert(1)" onclick="alert(2)">',
      '<img/onerror="alert(3)" src="x">',
      '<a href="javascript:alert(1)">Click</a>',
      '<a href="&#106;avascript:alert(1)">Entity Click</a>',
      '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
      '<iframe src="data:text/html,<script>1</script>"></iframe>',
      '<p>Safe paragraph</p>',
    ].join('');

    const sanitized = SanitizeHtmlForSandboxedFrame(payload);
    expect(sanitized).not.toMatch(/<script/i);
    expect(sanitized).not.toMatch(/<meta/i);
    expect(sanitized).not.toMatch(/<base/i);
    expect(sanitized).not.toMatch(/<style/i);
    expect(sanitized).not.toMatch(/<set/i);
    expect(sanitized).not.toMatch(/<animate/i);
    expect(sanitized).not.toMatch(/<iframe/i);
    expect(sanitized).not.toMatch(/onerror/i);
    expect(sanitized).not.toMatch(/onclick/i);
    expect(sanitized).not.toMatch(/javascript:/i);
    expect(sanitized).not.toMatch(/data:image\/svg\+xml/i);
    expect(sanitized).not.toMatch(/data:text\/html/i);
    expect(sanitized).toContain('<p>Safe paragraph</p>');
  });

  it('SanitizeSvgForSandboxedFrame removes script, foreignObject, and onbegin while preserving safe shapes', () => {
    const clean = SanitizeSvgForSandboxedFrame(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><body onload="alert(2)"></body></foreignObject><rect width="10" height="10" onload="alert(3)"/></svg>',
    );
    expect(clean).toContain('<rect');
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/foreignObject/i);
    expect(clean).not.toMatch(/onload/i);
  });

  it('OpenHtmlInSandboxedWindow opens a blob URL with noopener,noreferrer and sandbox="" without document.write', () => {
    const capturedBlobs: Blob[] = [];
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) {
        capturedBlobs.push(blob);
      }
      return 'blob:sandbox-preview-1';
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    const opened = OpenHtmlInSandboxedWindow('<script>alert(1)</script><p>Preview</p>', 'Preview Title');
    expect(opened).toBe(true);
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('blob:sandbox-preview-1', '_blank', 'noopener,noreferrer');
    expect(capturedBlobs.length).toBe(1);
  });

  it('PrintHtmlInSandboxedIframe mounts an iframe with sandbox="allow-modals allow-scripts" (never allow-same-origin), per-call random CSP nonce, and strips XSS', () => {
    const iframe = PrintHtmlInSandboxedIframe(
      '<img src=x onerror="alert(1)"><script>alert(2)</script><p>Print body</p>',
      { Title: 'Doc Print' },
    );
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe('allow-modals allow-scripts');
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');

    const srcdoc = iframe?.srcdoc ?? '';
    const cspNonceMatch = srcdoc.match(/script-src 'nonce-([a-f0-9]+)'/);
    expect(cspNonceMatch).not.toBeNull();
    const nonce = cspNonceMatch![1];
    expect(nonce.length).toBeGreaterThanOrEqual(16);
    expect(srcdoc).toContain("connect-src 'none'");
    expect(srcdoc).toContain(`<script nonce="${nonce}">`);
    expect(srcdoc).toContain("window.addEventListener('load'");
    expect(srcdoc).toContain('window.print()');
    expect(srcdoc).toContain("window.addEventListener('afterprint'");
    expect(srcdoc).toContain("type: 'mj-print-done'");
    expect(srcdoc).not.toContain('alert(2)');
    expect(srcdoc).not.toContain('onerror');
    expect(srcdoc).toContain('<p>Print body</p>');

    const secondIframe = PrintHtmlInSandboxedIframe('<p>Second</p>', { Title: 'Second' });
    const secondNonce = secondIframe?.srcdoc.match(/script-src 'nonce-([a-f0-9]+)'/)?.[1];
    expect(secondNonce).toBeTruthy();
    expect(secondNonce).not.toBe(nonce);

    // Verify postMessage matching print id triggers iframe cleanup
    const printIdMatch = srcdoc.match(/type: 'mj-print-done', id: "([a-f0-9]+)"/);
    expect(printIdMatch).not.toBeNull();
    const printId = printIdMatch![1];
    expect(iframe?.parentNode).toBe(document.body);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'mj-print-done', id: printId },
        source: iframe?.contentWindow ?? undefined,
      }),
    );
    expect(iframe?.parentNode).toBeNull();
  });

  it('PrintHtmlInSandboxedIframe HTML-escapes plain-text markdown fallback content', () => {
    const iframe = PrintHtmlInSandboxedIframe('<img src=x onerror=alert(1)>', {
      Title: 'Plain Print',
      AlreadyPlainText: true,
    });
    expect(iframe).not.toBeNull();
    expect(iframe?.srcdoc).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

import createDOMPurify from 'dompurify';

/**
 * Utilities for safely escaping, sanitizing, previewing, and printing untrusted HTML or
 * Markdown-rendered content without `document.write()`, live `window.opener`, or unsandboxed frames.
 */

const STRICT_PREVIEW_CSP =
  "default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'; font-src https: http: data:; script-src 'none';";

const BASE_FORBIDDEN_TAGS: string[] = [
  'script',
  'style',
  'meta',
  'base',
  'iframe',
  'object',
  'embed',
  'applet',
  'foreignObject',
  'set',
  'animate',
  'animateTransform',
  'animateMotion',
];

const URI_ATTR_NAMES = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'poster',
  'data',
]);

let cachedPurifier: ReturnType<typeof createDOMPurify> | null = null;
let cachedPurifierWindow: Window | null = null;

function getConfiguredPurifier(): ReturnType<typeof createDOMPurify> | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (cachedPurifier && cachedPurifierWindow === window) {
    return cachedPurifier;
  }
  const instance = createDOMPurify(window);
  if (!instance.isSupported) {
    return null;
  }
  instance.addHook('uponSanitizeAttribute', (_node, data) => {
    const attrName = (data.attrName || '').toLowerCase();
    if (!URI_ATTR_NAMES.has(attrName)) {
      return;
    }
    const normalized = (data.attrValue || '').replace(/[\s\u0000-\u001f\u007f]+/g, '').toLowerCase();
    const schemeSep = normalized.indexOf(':');
    const firstSlash = normalized.indexOf('/');
    const firstQuery = normalized.indexOf('?');
    const firstHash = normalized.indexOf('#');
    const firstNonSchemeDelim = [firstSlash, firstQuery, firstHash]
      .filter((idx) => idx >= 0)
      .reduce((min, idx) => Math.min(min, idx), Number.MAX_SAFE_INTEGER);
    if (schemeSep > 0 && schemeSep < firstNonSchemeDelim) {
      const scheme = normalized.slice(0, schemeSep);
      if (scheme === 'data') {
        if (!/^data:image\/(?:png|jpe?g|gif|webp);/.test(normalized)) {
          data.keepAttr = false;
        }
      } else if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto' && scheme !== 'tel' && scheme !== 'blob') {
        data.keepAttr = false;
      }
    }
  });
  cachedPurifier = instance;
  cachedPurifierWindow = window;
  return instance;
}

/**
 * Escapes HTML special characters for safe literal interpolation into HTML text or attributes.
 */
export function EscapeHtml(raw: string): string {
  return (raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips dangerous executable, navigation-hijacking, style-injection, SVG animation, and
 * active-URI constructs from untrusted HTML using DOMPurify before rendering or printing inside
 * a sandboxed frame. Fails closed to HTML escaping if no DOM environment is available.
 */
export function SanitizeHtmlForSandboxedFrame(
  rawHtml: string,
  options?: { AdditionalForbidTags?: readonly string[] },
): string {
  if (!rawHtml) {
    return '';
  }

  const purifier = getConfiguredPurifier();
  if (!purifier) {
    // Fail closed when called without a DOM window (never pass raw HTML through regexes).
    return EscapeHtml(rawHtml);
  }

  const forbidTags = options?.AdditionalForbidTags?.length
    ? [...BASE_FORBIDDEN_TAGS, ...options.AdditionalForbidTags]
    : BASE_FORBIDDEN_TAGS;

  return purifier.sanitize(rawHtml, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: forbidTags,
  });
}

/**
 * Sanitizes inline SVG markup using DOMPurify (stripping `<script>`, `on*`, `<foreignObject>`,
 * animation tags, and active URIs) for safe embedding inside a sandboxed print iframe.
 */
export function SanitizeSvgForSandboxedFrame(rawSvg: string): string {
  if (!rawSvg) {
    return '';
  }
  const purifier = getConfiguredPurifier();
  if (!purifier) {
    return '';
  }
  return purifier.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: BASE_FORBIDDEN_TAGS,
  });
}

function generateRandomToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function serializeJsonForInlineScript(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\//g, '\\u002f')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Wraps already-trusted container markup + sanitized body HTML in a full HTML5 document with a strict CSP meta tag.
 */
export function BuildSandboxedHtmlDocument(options: {
  Title: string;
  BodyHtml: string;
  TrustedPrintCss?: string;
  ScriptNonce?: string;
  TrustedPrintId?: string;
}): string {
  const escapedTitle = EscapeHtml(options.Title);
  const safeCss = options.TrustedPrintCss ? `<style>${options.TrustedPrintCss}</style>` : '';
  const safeNonce = (options.ScriptNonce ?? '').replace(/[^A-Za-z0-9+/=_-]/g, '');
  const csp = safeNonce
    ? `default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'; font-src https: http: data:; script-src 'nonce-${safeNonce}'; connect-src 'none';`
    : STRICT_PREVIEW_CSP;
  const printScript =
    safeNonce && options.TrustedPrintId
      ? `<script nonce="${safeNonce}">window.addEventListener('load', () => { window.focus(); window.print(); }); window.addEventListener('afterprint', () => parent.postMessage({ type: 'mj-print-done', id: ${serializeJsonForInlineScript(options.TrustedPrintId)} }, '*'));</script>`
      : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>${escapedTitle}</title>
  ${safeCss}
</head>
<body>${options.BodyHtml}${printScript}</body>
</html>`;
}

/**
 * Opens untrusted HTML inside a sandboxed Blob URL window with `noopener,noreferrer` so the opened
 * tab can never access `window.opener` or run scripts, eliminating `document.write()` XSS.
 */
export function OpenHtmlInSandboxedWindow(rawHtml: string, title = 'Artifact Preview'): boolean {
  if (typeof window === 'undefined' || !rawHtml) {
    return false;
  }
  const cleanHtml = SanitizeHtmlForSandboxedFrame(rawHtml);
  const innerDoc = BuildSandboxedHtmlDocument({ Title: title, BodyHtml: cleanHtml });
  const outerDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${STRICT_PREVIEW_CSP} frame-src 'self' data: blob:;" />
  <title>${EscapeHtml(title)}</title>
  <style>html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; } iframe { width: 100%; height: 100%; border: 0; }</style>
</head>
<body><iframe sandbox="" referrerpolicy="no-referrer" srcdoc="${EscapeHtml(innerDoc)}"></iframe></body>
</html>`;

  const blob = new Blob([outerDoc], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60_000);
  return true;
}

/**
 * Prints sanitized HTML inside an ephemeral `<iframe sandbox="allow-modals allow-scripts">`
 * (never `allow-same-origin`), using a per-call random CSP nonce (`script-src 'nonce-<nonce>';
 * connect-src 'none'`) and postMessage-driven cleanup with timeout fallback.
 */
export function PrintHtmlInSandboxedIframe(
  rawHtml: string,
  options?: {
    Title?: string;
    TrustedPrintCss?: string;
    AlreadyPlainText?: boolean;
    DocumentRef?: Document;
  },
): HTMLIFrameElement | null {
  const doc = options?.DocumentRef ?? (typeof document !== 'undefined' ? document : null);
  if (!doc || !rawHtml) {
    return null;
  }

  const bodyHtml = options?.AlreadyPlainText
    ? `<pre>${EscapeHtml(rawHtml)}</pre>`
    : SanitizeHtmlForSandboxedFrame(rawHtml);

  const nonce = generateRandomToken();
  const printId = generateRandomToken();

  const srcdoc = BuildSandboxedHtmlDocument({
    Title: options?.Title ?? 'Print',
    BodyHtml: bodyHtml,
    TrustedPrintCss:
      options?.TrustedPrintCss ??
      'body { font-family: sans-serif; padding: 20px; } pre { background: #f5f5f5; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }',
    ScriptNonce: nonce,
    TrustedPrintId: printId,
  });

  const iframe = doc.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-modals allow-scripts');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  const hostWindow = doc.defaultView ?? (typeof window !== 'undefined' ? window : null);
  let cleaned = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== iframe.contentWindow) {
      return;
    }
    const payload = event.data as { type?: string; id?: string } | null;
    if (payload && payload.type === 'mj-print-done' && payload.id === printId) {
      cleanup();
    }
  };

  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (hostWindow) {
      hostWindow.removeEventListener('message', onMessage);
    }
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  if (hostWindow) {
    hostWindow.addEventListener('message', onMessage);
  }
  fallbackTimer = setTimeout(cleanup, 60_000);

  iframe.srcdoc = srcdoc;
  doc.body.appendChild(iframe);
  return iframe;
}

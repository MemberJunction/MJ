/**
 * Web-only DOM utilities that complement the SVG renderer marked extension.
 *
 * The framework-agnostic SVG tokenizer/renderer (`createSvgRendererExtension`,
 * `isSvgContent`) now lives in `@memberjunction/markdown-core`. This file keeps
 * the browser-only sanitization helper, which operates on a live DOM subtree
 * after the SVG has been inserted into the page.
 */

/** URL schemes that can execute script or smuggle markup when used as a link or resource target. */
const SCRIPT_URL_SCHEME = /^(javascript|vbscript|data):/;

/** Attributes whose value is a URL the browser will navigate to or load. */
const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

/**
 * True when an attribute value is a script-capable URL. Whitespace and control
 * characters are removed before the scheme check because browsers ignore them
 * (a tab inside `javascript:` still navigates), and the comparison is case-insensitive.
 *
 * `data:image/...` (other than SVG, which can carry script) is allowed on `<image>`
 * so embedded raster images inside an SVG keep working.
 */
function isScriptUrl(element: Element, attributeName: string, value: string): boolean {
  // eslint-disable-next-line no-control-regex
  const normalized = value.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  if (!SCRIPT_URL_SCHEME.test(normalized)) {
    return false;
  }
  const isImageData =
    element.tagName.toLowerCase() === 'image' &&
    (attributeName === 'href' || attributeName === 'xlink:href') &&
    normalized.startsWith('data:image/') &&
    !normalized.startsWith('data:image/svg');
  return !isImageData;
}

/**
 * Sanitize rendered SVG in place by removing the vectors that can run script.
 * Call this on the container element after rendering if you need additional security.
 *
 * Removes `<script>` and `<foreignObject>` elements, every `on*` event-handler
 * attribute (not a fixed list: any attribute whose name starts with `on`),
 * `javascript:` / `vbscript:` / `data:` URLs on link and resource attributes, and
 * `<use>` elements that reference an external document.
 *
 * @param container The DOM element containing rendered SVG
 */
export function sanitizeSvgContent(container: HTMLElement): void {
  container.querySelectorAll('script').forEach((script) => script.remove());
  container.querySelectorAll('foreignObject').forEach((fo) => fo.remove());

  container.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRIBUTES.has(name) && isScriptUrl(el, name, attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  container.querySelectorAll('use').forEach((use) => {
    // Same-document references only; anything that is not a fragment can load an external
    // document. Normalised the same way isScriptUrl normalises, so obfuscation does not help.
    const href = (use.getAttribute('href') || use.getAttribute('xlink:href') || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0020\u007f]/g, '');
    if (href !== '' && !href.startsWith('#')) {
      use.remove();
    }
  });
}

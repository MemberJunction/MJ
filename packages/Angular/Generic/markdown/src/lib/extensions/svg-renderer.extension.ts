/**
 * Web-only DOM utilities that complement the SVG renderer marked extension.
 *
 * The framework-agnostic SVG tokenizer/renderer (`createSvgRendererExtension`,
 * `isSvgContent`) now lives in `@memberjunction/markdown-core`. This file keeps
 * the browser-only sanitization helper, which operates on a live DOM subtree
 * after the SVG has been inserted into the page.
 */

/**
 * Helper function to sanitize SVG content by removing potentially dangerous elements.
 * Call this on the container element after rendering if you need additional security.
 *
 * @param container The DOM element containing rendered SVG
 */
export function sanitizeSvgContent(container: HTMLElement): void {
  // Remove script elements
  const scripts = container.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  // Remove event handlers from all elements
  const allElements = container.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove common event handler attributes
    const dangerousAttrs = [
      'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout',
      'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
      'onkeydown', 'onkeyup', 'onkeypress'
    ];

    dangerousAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr);
      }
    });

    // Remove javascript: URLs from href/xlink:href
    if (el.hasAttribute('href')) {
      const href = el.getAttribute('href') || '';
      if (href.toLowerCase().startsWith('javascript:')) {
        el.removeAttribute('href');
      }
    }
    if (el.hasAttribute('xlink:href')) {
      const href = el.getAttribute('xlink:href') || '';
      if (href.toLowerCase().startsWith('javascript:')) {
        el.removeAttribute('xlink:href');
      }
    }
  });

  // Remove foreignObject elements (can contain HTML/scripts)
  const foreignObjects = container.querySelectorAll('foreignObject');
  foreignObjects.forEach(fo => fo.remove());

  // Remove use elements pointing to external resources
  const useElements = container.querySelectorAll('use');
  useElements.forEach(use => {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      use.remove();
    }
  });
}

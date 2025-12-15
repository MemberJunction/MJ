import { MarkedExtension, Tokens } from 'marked';

/**
 * Creates a marked extension that renders SVG code blocks as actual SVG images.
 *
 * When encountering a code block with language "svg", this extension will
 * render it as an actual SVG element instead of showing the code.
 *
 * This is useful for:
 * - UX mockups and wireframes
 * - Diagrams and illustrations
 * - Icons and simple graphics
 * - Any visual content that can be expressed as SVG
 *
 * Usage in markdown:
 * ```svg
 * <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
 *   <circle cx="50" cy="50" r="40" fill="blue"/>
 * </svg>
 * ```
 *
 * The generated HTML structure:
 * ```html
 * <div class="svg-rendered">
 *   <svg ...>...</svg>
 * </div>
 * ```
 *
 * Security note: SVG content is rendered as-is. Make sure to only render
 * trusted SVG content or enable sanitization if rendering user-provided content.
 */
export function createSvgRendererExtension(): MarkedExtension {
  return {
    renderer: {
      code(token: Tokens.Code): string | false {
        const { text, lang } = token;

        // Only process svg code blocks
        if (lang !== 'svg') {
          return false; // Let the default renderer handle it
        }

        // Validate that it looks like SVG
        const trimmedText = text.trim();
        if (!isSvgContent(trimmedText)) {
          // If it doesn't look like valid SVG, fall back to code display
          return false;
        }

        // Render as actual SVG wrapped in a container
        return `<div class="svg-rendered">${trimmedText}</div>\n`;
      }
    }
  };
}

/**
 * Basic validation to check if content appears to be SVG.
 * This is a simple check - it doesn't fully validate SVG syntax.
 */
function isSvgContent(content: string): boolean {
  // Check if it starts with <svg and contains closing </svg>
  const startsWithSvg = content.toLowerCase().startsWith('<svg');
  const hasSvgClosing = content.toLowerCase().includes('</svg>');

  // Also accept self-closing SVG (rare but valid)
  const isSelfClosing = content.toLowerCase().match(/<svg[^>]*\/>/);

  return (startsWithSvg && hasSvgClosing) || !!isSelfClosing;
}

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

import { MarkedExtension, Tokens } from 'marked';

/**
 * The custom token emitted by the SVG renderer extension for a ```svg fence.
 *
 * This is the framework-agnostic hand-off: the web/HTML path renders it into a
 * `.svg-rendered` wrapper, while a native path (React Native + react-native-svg)
 * can consume {@link svgContent} directly.
 */
export interface SvgCodeBlockToken extends Tokens.Generic {
  /** Discriminant identifying this custom block token. */
  type: 'svgCodeBlock';
  /** The original matched markdown source (the full ```svg … ``` fence). */
  raw: string;
  /** The inner SVG markup, trimmed — everything between the fences. */
  svgContent: string;
}

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
 * The tokenizer is framework-agnostic — it emits an `svgCodeBlock` token whose
 * `svgContent` can be rendered to HTML (web) or to a native SVG component
 * (React Native via react-native-svg). The HTML `renderer` below is only used
 * by the web/HTML output path.
 *
 * Security note: SVG content is rendered as-is. Make sure to only render
 * trusted SVG content or sanitize it on the target platform when rendering
 * user-provided content.
 */
export function createSvgRendererExtension(): MarkedExtension {
  return {
    extensions: [{
      name: 'svgCodeBlock',
      level: 'block',
      start(src: string) {
        // Look for ```svg at the start of the source
        const match = src.match(/^```svg\b/);
        return match ? match.index : undefined;
      },
      tokenizer(src: string) {
        // Match ```svg code blocks
        const rule = /^```svg\n([\s\S]*?)```(?:\n|$)/;
        const match = rule.exec(src);

        if (match) {
          const svgContent = match[1].trim();

          // Only process if it looks like valid SVG
          if (isSvgContent(svgContent)) {
            const token: SvgCodeBlockToken = {
              type: 'svgCodeBlock',
              raw: match[0],
              svgContent
            };
            return token;
          }
        }
        return undefined;
      },
      renderer(token) {
        const svgToken = token as SvgCodeBlockToken;
        return `<div class="svg-rendered">${svgToken.svgContent}</div>\n`;
      }
    }]
  };
}

/**
 * Basic validation to check if content appears to be SVG.
 * This is a simple check - it doesn't fully validate SVG syntax.
 */
export function isSvgContent(content: string): boolean {
  // Check if it starts with <svg and contains closing </svg>
  const startsWithSvg = content.toLowerCase().startsWith('<svg');
  const hasSvgClosing = content.toLowerCase().includes('</svg>');

  // Also accept self-closing SVG (rare but valid)
  const isSelfClosing = content.toLowerCase().match(/<svg[^>]*\/>/);

  return (startsWithSvg && hasSvgClosing) || !!isSelfClosing;
}

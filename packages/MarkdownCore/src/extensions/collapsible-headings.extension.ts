import { MarkedExtension, Tokens } from 'marked';

/**
 * Options for the collapsible headings extension
 */
export interface CollapsibleHeadingsOptions {
  /**
   * The minimum heading level to make collapsible (1-6)
   * Headings at this level and below will be collapsible
   * @default 2
   */
  startLevel?: 1 | 2 | 3 | 4 | 5 | 6;

  /**
   * Whether sections should be expanded by default
   * @default true
   */
  defaultExpanded?: boolean;

  /**
   * Specify which heading levels should start expanded.
   * Takes precedence over defaultExpanded for specified levels.
   * @default undefined (uses defaultExpanded for all levels)
   */
  autoExpandLevels?: number[];

  /**
   * CSS class prefix for generated elements
   * @default 'collapsible'
   */
  classPrefix?: string;
}

interface ResolvedOptions {
  startLevel: 1 | 2 | 3 | 4 | 5 | 6;
  defaultExpanded: boolean;
  autoExpandLevels?: number[];
  classPrefix: string;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  startLevel: 2,
  defaultExpanded: true,
  autoExpandLevels: undefined,
  classPrefix: 'collapsible'
};

/**
 * Creates a marked extension that wraps heading sections in collapsible containers.
 *
 * This extension transforms headings into clickable toggles that can expand/collapse
 * the content that follows them (until the next heading of equal or higher level).
 *
 * The key innovation is that child sections are properly NESTED inside parent sections,
 * so collapsing a parent will hide all its children.
 *
 * NOTE: This extension targets the HTML output path. It produces the nested
 * `<div class="collapsible-section">` structure that the web renderer styles and
 * wires up. React Native does not use this extension — it derives collapsible
 * structure from the heading tokens directly.
 *
 * The generated HTML structure (properly nested):
 * ```html
 * <div class="collapsible-section" data-level="2">
 *   <div class="collapsible-heading-wrapper">
 *     <h2 class="collapsible-heading" id="...">Parent Heading</h2>
 *   </div>
 *   <div class="collapsible-content">
 *     <p>Content under parent...</p>
 *     <div class="collapsible-section" data-level="3">
 *       ...
 *     </div>
 *   </div>
 * </div>
 * ```
 *
 * Note: The toggle button is added dynamically by the host (e.g. the Angular
 * component) after rendering to avoid issues with HTML sanitizers.
 */
export function createCollapsibleHeadingsExtension(
  options?: CollapsibleHeadingsOptions
): MarkedExtension {
  const opts: ResolvedOptions = { ...DEFAULT_OPTIONS, ...options };

  return {
    renderer: {
      // Mark headings with a special marker that we'll process in postprocess
      heading(token: Tokens.Heading): string {
        const { depth, text } = token;
        const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
        const id = `heading-${escapedText}`;

        // Only make headings collapsible at or below the start level
        if (depth >= opts.startLevel) {
          // Use a marker format that we'll parse in postprocess
          // Format: <!--COLLAPSIBLE_HEADING:level:id:text-->
          const marker = `<!--COLLAPSIBLE_HEADING:${depth}:${id}:${encodeURIComponent(text)}-->`;
          return `${marker}<h${depth} id="${id}">${text}</h${depth}>\n`;
        }

        // Regular heading rendering for levels above startLevel
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      }
    },

    hooks: {
      postprocess(html: string): string {
        return restructureToNestedSections(html, opts);
      }
    }
  };
}

interface ContentPart {
  type: 'content' | 'heading';
  content: string;
  level?: number;
  id?: string;
  text?: string;
}

/**
 * Restructures flat HTML with heading markers into properly nested collapsible sections.
 * This is the key function that creates the hierarchical structure needed for
 * parent collapse to affect children.
 */
function restructureToNestedSections(
  html: string,
  opts: ResolvedOptions
): string {
  // Parse the HTML to find all content chunks and headings
  const markerRegex = /<!--COLLAPSIBLE_HEADING:(\d):([^:]+):([^>]+)-->/g;

  // Split HTML by markers while capturing the markers
  const parts: ContentPart[] = [];
  let lastIndex = 0;
  let match;

  while ((match = markerRegex.exec(html)) !== null) {
    // Add content before this marker
    if (match.index > lastIndex) {
      const content = html.slice(lastIndex, match.index);
      if (content.trim()) {
        parts.push({ type: 'content', content });
      }
    }

    // Add the heading marker info
    parts.push({
      type: 'heading',
      content: '', // Will be filled with the actual h tag
      level: parseInt(match[1], 10),
      id: match[2],
      text: decodeURIComponent(match[3])
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining content after last marker
  if (lastIndex < html.length) {
    const content = html.slice(lastIndex);
    if (content.trim()) {
      parts.push({ type: 'content', content });
    }
  }

  // If no collapsible headings, return original HTML
  if (!parts.some(p => p.type === 'heading')) {
    return html;
  }

  // Now build the nested structure
  return buildNestedStructure(parts, opts);
}

/**
 * Determine if a heading level should start expanded based on options
 */
function shouldLevelBeExpanded(level: number, opts: ResolvedOptions): boolean {
  // If autoExpandLevels is specified, use it
  if (opts.autoExpandLevels !== undefined) {
    return opts.autoExpandLevels.includes(level);
  }
  // Otherwise fall back to defaultExpanded
  return opts.defaultExpanded;
}

/**
 * Builds the nested HTML structure from the parsed parts.
 */
function buildNestedStructure(
  parts: ContentPart[],
  opts: ResolvedOptions
): string {
  const result: string[] = [];
  // Stack tracks open sections: { level }
  const sectionStack: Array<{ level: number }> = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.type === 'content') {
      // Regular content - just add it
      result.push(part.content);
    } else if (part.type === 'heading' && part.level !== undefined) {
      const level = part.level;

      // Close any sections at same or higher level (lower number = higher level)
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= level) {
        // Close the content div and section div
        result.push('</div></div>');
        sectionStack.pop();
      }

      // Determine expanded state for this specific level
      const isExpanded = shouldLevelBeExpanded(level, opts);
      const expandedClass = isExpanded ? '' : ' collapsed';

      // Extract the actual h tag from the next content piece if it starts with it
      let headingHtml = `<h${level} class="${opts.classPrefix}-heading" id="${part.id}">${part.text}</h${level}>`;

      // Look ahead to find and remove the actual h tag from content
      if (i + 1 < parts.length && parts[i + 1].type === 'content') {
        const nextContent = parts[i + 1].content;
        const hTagRegex = new RegExp(`<h${level}[^>]*id="${part.id}"[^>]*>[^<]*</h${level}>\\s*`);
        const hTagMatch = nextContent.match(hTagRegex);
        if (hTagMatch) {
          // Use the actual h tag and remove it from content
          headingHtml = hTagMatch[0].replace(`<h${level}`, `<h${level} class="${opts.classPrefix}-heading"`);
          parts[i + 1].content = nextContent.replace(hTagRegex, '');
        }
      }

      // Open new section
      result.push(`<div class="${opts.classPrefix}-section${expandedClass}" data-level="${level}">`);
      result.push(`<div class="${opts.classPrefix}-heading-wrapper">`);
      result.push(headingHtml);
      result.push('</div>');
      result.push(`<div class="${opts.classPrefix}-content">`);

      sectionStack.push({ level });
    }
  }

  // Close any remaining open sections
  while (sectionStack.length > 0) {
    result.push('</div></div>');
    sectionStack.pop();
  }

  return result.join('');
}

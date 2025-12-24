/**
 * Configuration options for the markdown component
 */
export interface MarkdownConfig {
  /**
   * Enable Prism.js syntax highlighting for code blocks
   * @default true
   */
  enableHighlight?: boolean;

  /**
   * Enable Mermaid diagram rendering
   * @default true
   */
  enableMermaid?: boolean;

  /**
   * Enable copy-to-clipboard button on code blocks
   * @default true
   */
  enableCodeCopy?: boolean;

  /**
   * Enable collapsible heading sections
   * @default false
   */
  enableCollapsibleHeadings?: boolean;

  /**
   * Heading level at which to start collapsing (1-6)
   * Only applies when enableCollapsibleHeadings is true
   * @default 2
   */
  collapsibleHeadingLevel?: 1 | 2 | 3 | 4 | 5 | 6;

  /**
   * Whether collapsible sections should be expanded by default
   * @default true
   */
  collapsibleDefaultExpanded?: boolean;

  /**
   * Specify which heading levels should start expanded.
   * Array of heading levels (2-6) that should be expanded by default.
   * Takes precedence over collapsibleDefaultExpanded for specified levels.
   *
   * Examples:
   * - [2] = Only h2 expanded, h3-h6 collapsed
   * - [2, 3] = h2 and h3 expanded, h4-h6 collapsed
   * - [] = All collapsed (same as collapsibleDefaultExpanded: false)
   * - undefined = Uses collapsibleDefaultExpanded for all levels
   *
   * @default undefined (uses collapsibleDefaultExpanded)
   */
  autoExpandLevels?: number[];

  /**
   * Enable GitHub-style alerts ([!NOTE], [!WARNING], etc.)
   * @default true
   */
  enableAlerts?: boolean;

  /**
   * Enable smartypants for typography (curly quotes, em/en dashes, ellipses)
   * Converts:
   * - "quotes" to "curly quotes"
   * - -- to en-dash (–)
   * - --- to em-dash (—)
   * - ... to ellipsis (…)
   * @default true
   */
  enableSmartypants?: boolean;

  /**
   * Enable SVG code block rendering
   * When enabled, ```svg code blocks are rendered as actual SVG images
   * @default true
   */
  enableSvgRenderer?: boolean;

  /**
   * Enable raw HTML passthrough in markdown content.
   * When enabled, HTML tags in the markdown are rendered as actual HTML
   * instead of being sanitized/stripped.
   *
   * Note: Even with enableHtml=true, scripts and event handlers are stripped
   * unless enableJavaScript is also true.
   *
   * @default false
   */
  enableHtml?: boolean;

  /**
   * Enable JavaScript execution in HTML content.
   * When enabled, <script> tags and on* event handlers are allowed.
   *
   * WARNING: This is a major security risk. Only enable for fully trusted content.
   * In most cases, you want enableHtml=true with enableJavaScript=false.
   *
   * @default false
   */
  enableJavaScript?: boolean;

  /**
   * Enable GitHub-style heading IDs for anchor links
   * @default true
   */
  enableHeadingIds?: boolean;

  /**
   * Prefix for heading IDs to avoid conflicts
   * @default ''
   */
  headingIdPrefix?: string;

  /**
   * Enable line numbers in code blocks
   * @default false
   */
  enableLineNumbers?: boolean;

  /**
   * Custom CSS class to apply to the markdown container
   */
  containerClass?: string;

  /**
   * Prism.js theme to use (must be loaded in angular.json or via CSS import)
   * Common themes: 'prism', 'prism-dark', 'prism-okaidia', 'prism-tomorrow', 'prism-coy'
   */
  prismTheme?: string;

  /**
   * Mermaid theme configuration
   * @default 'default'
   */
  mermaidTheme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base';

  /**
   * Whether to sanitize HTML output
   * Set to false only if you trust the markdown source completely
   * @default true
   */
  sanitize?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_MARKDOWN_CONFIG: Required<Omit<MarkdownConfig, 'autoExpandLevels'>> & { autoExpandLevels?: number[] } = {
  enableHighlight: true,
  enableMermaid: true,
  enableCodeCopy: true,
  enableCollapsibleHeadings: false,
  collapsibleHeadingLevel: 2,
  collapsibleDefaultExpanded: true,
  autoExpandLevels: undefined,
  enableAlerts: true,
  enableSmartypants: true,
  enableSvgRenderer: true,
  enableHtml: false,
  enableJavaScript: false,
  enableHeadingIds: true,
  headingIdPrefix: '',
  enableLineNumbers: false,
  containerClass: '',
  prismTheme: 'prism-okaidia',
  mermaidTheme: 'default',
  sanitize: true
};

/**
 * Event emitted when markdown rendering is complete
 */
export interface MarkdownRenderEvent {
  /**
   * The rendered HTML string
   */
  html: string;

  /**
   * Time taken to render in milliseconds
   */
  renderTime: number;

  /**
   * Whether mermaid diagrams were rendered
   */
  hasMermaid: boolean;

  /**
   * Whether code blocks were highlighted
   */
  hasCodeBlocks: boolean;

  /**
   * List of heading IDs generated (for TOC building)
   */
  headingIds: HeadingInfo[];
}

/**
 * Information about a heading in the document
 */
export interface HeadingInfo {
  /**
   * The heading ID (for anchor links)
   */
  id: string;

  /**
   * The heading text content
   */
  text: string;

  /**
   * The heading level (1-6)
   */
  level: number;

  /**
   * The raw markdown text
   */
  raw: string;
}

/**
 * Alert types supported by marked-alert
 */
export type AlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

/**
 * Configuration for a custom alert variant
 */
export interface AlertVariant {
  type: string;
  icon: string;
  titleClassName?: string;
}

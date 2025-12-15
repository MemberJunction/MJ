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
   * Enable GitHub-style alerts ([!NOTE], [!WARNING], etc.)
   * @default true
   */
  enableAlerts?: boolean;

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
export const DEFAULT_MARKDOWN_CONFIG: Required<MarkdownConfig> = {
  enableHighlight: true,
  enableMermaid: true,
  enableCodeCopy: true,
  enableCollapsibleHeadings: false,
  collapsibleHeadingLevel: 2,
  collapsibleDefaultExpanded: true,
  enableAlerts: true,
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

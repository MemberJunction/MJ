import { describe, it, expect } from 'vitest';
import { DEFAULT_MARKDOWN_CONFIG } from '../lib/types/markdown.types';
import type { MarkdownConfig, HeadingInfo, MarkdownRenderEvent, AlertType } from '../lib/types/markdown.types';

describe('DEFAULT_MARKDOWN_CONFIG', () => {
  it('should enable syntax highlighting', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableHighlight).toBe(true);
  });

  it('should enable mermaid', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableMermaid).toBe(true);
  });

  it('should enable code copy', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableCodeCopy).toBe(true);
  });

  it('should disable collapsible headings by default', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableCollapsibleHeadings).toBe(false);
  });

  it('should set collapsible heading level to 2', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.collapsibleHeadingLevel).toBe(2);
  });

  it('should have collapsible default expanded true', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.collapsibleDefaultExpanded).toBe(true);
  });

  it('should enable alerts', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableAlerts).toBe(true);
  });

  it('should enable smartypants', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableSmartypants).toBe(true);
  });

  it('should enable SVG renderer', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableSvgRenderer).toBe(true);
  });

  it('should disable HTML passthrough by default', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableHtml).toBe(false);
  });

  it('should disable JavaScript by default', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableJavaScript).toBe(false);
  });

  it('should enable heading IDs', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.enableHeadingIds).toBe(true);
  });

  it('should enable sanitization', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.sanitize).toBe(true);
  });

  it('should use default mermaid theme', () => {
    expect(DEFAULT_MARKDOWN_CONFIG.mermaidTheme).toBe('default');
  });
});

describe('HeadingInfo', () => {
  it('should construct heading info', () => {
    const heading: HeadingInfo = {
      id: 'introduction',
      text: 'Introduction',
      level: 1,
      raw: '# Introduction'
    };
    expect(heading.level).toBe(1);
    expect(heading.id).toBe('introduction');
  });
});

describe('MarkdownRenderEvent', () => {
  it('should construct render event', () => {
    const event: MarkdownRenderEvent = {
      html: '<h1>Hello</h1>',
      renderTime: 5.2,
      hasMermaid: false,
      hasCodeBlocks: true,
      headingIds: [{ id: 'hello', text: 'Hello', level: 1, raw: '# Hello' }]
    };
    expect(event.renderTime).toBeCloseTo(5.2);
    expect(event.headingIds).toHaveLength(1);
  });
});

describe('AlertType', () => {
  it('should support all alert types', () => {
    const types: AlertType[] = ['note', 'tip', 'important', 'warning', 'caution'];
    expect(types).toHaveLength(5);
  });
});

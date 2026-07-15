import { describe, it, expect } from 'vitest';
import { Marked } from 'marked';
import { createSvgRendererExtension, isSvgContent } from '../extensions/svg-renderer.extension.js';

describe('isSvgContent', () => {
  it('accepts a normal svg element', () => {
    expect(isSvgContent('<svg><circle/></svg>')).toBe(true);
  });

  it('accepts a self-closing svg', () => {
    expect(isSvgContent('<svg width="1" height="1"/>')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSvgContent('<SVG></SVG>')).toBe(true);
  });

  it('rejects non-svg content', () => {
    expect(isSvgContent('<div>not svg</div>')).toBe(false);
    expect(isSvgContent('console.log("svg")')).toBe(false);
  });

  it('rejects an unterminated svg', () => {
    expect(isSvgContent('<svg><circle/>')).toBe(false);
  });
});

describe('createSvgRendererExtension', () => {
  const marked = new Marked();
  marked.use(createSvgRendererExtension());

  it('renders an svg fence to a .svg-rendered wrapper', () => {
    const html = marked.parse('```svg\n<svg><rect/></svg>\n```') as string;
    expect(html).toContain('<div class="svg-rendered">');
    expect(html).toContain('<svg><rect/></svg>');
  });

  it('leaves a non-svg fence alone (falls through to a code block)', () => {
    const html = marked.parse('```svg\nnot actually svg\n```') as string;
    expect(html).not.toContain('svg-rendered');
    expect(html).toContain('<pre>');
  });

  it('emits a structured token via the lexer', () => {
    const tokens = marked.lexer('```svg\n<svg id="x"></svg>\n```');
    const svg = tokens.find(t => t.type === 'svgCodeBlock');
    expect(svg).toBeDefined();
  });
});

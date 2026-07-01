import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { MarkdownComponent } from './markdown.component';
import { MarkdownRenderEvent } from '../types/markdown.types';

/**
 * DOM-level spec for <mj-markdown>. The component is module-declared
 * (standalone:false), so we render it via `declarations` + `imports: [CommonModule]`
 * and configure it through `@Input`s.
 *
 * It uses the real (providedIn:'root') MarkdownService, which parses markdown
 * synchronously via marked.js. We assert on the rendered output that lands in the
 * `[innerHTML]`-bound container, plus the container-class binding and the `rendered`
 * @Output. Mermaid/Prism async post-processing is NOT asserted here (mermaid needs a
 * real browser; that's a live-test concern) — we only verify the deterministic,
 * media-free template surface.
 */
describe('MarkdownComponent (DOM)', () => {
  function render(inputs: Record<string, unknown>): ComponentFixture<MarkdownComponent> {
    return renderComponentFixture(MarkdownComponent, {
      imports: [CommonModule],
      declarations: [MarkdownComponent],
      inputs,
    });
  }

  const container = (f: ComponentFixture<MarkdownComponent>): HTMLElement => f.nativeElement.querySelector('.mj-markdown-container') as HTMLElement;

  it('renders the static container element', () => {
    const f = render({ data: '' });
    expect(query(f, '.mj-markdown-container')).not.toBeNull();
  });

  it('renders markdown content into the innerHTML-bound container', () => {
    const f = render({ data: '# Hello World' });
    const c = container(f);
    const heading = c.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toContain('Hello World');
  });

  it('renders inline markdown formatting (bold) as the corresponding HTML element', () => {
    const f = render({ data: 'This is **strong** text' });
    expect(container(f).querySelector('strong')?.textContent).toBe('strong');
  });

  it('renders a fenced code block as a <pre><code> structure', () => {
    const f = render({ data: '```\nconst x = 1;\n```' });
    const c = container(f);
    expect(c.querySelector('pre')).not.toBeNull();
    expect(c.querySelector('pre code')).not.toBeNull();
  });

  it('renders an empty container when data is empty', () => {
    const f = render({ data: '' });
    // No data => renderedContent stays '' => no rendered child markup.
    expect(container(f).children.length).toBe(0);
  });

  it('applies the containerClass input to the container element', () => {
    const f = render({ data: '# X', containerClass: 'my-custom-class' });
    expect(container(f).classList.contains('my-custom-class')).toBe(true);
  });

  it('emits the rendered @Output with hasCodeBlocks=true for code content', async () => {
    const f = render({ data: '' });
    const events = capture<MarkdownRenderEvent>(f.componentInstance.rendered);

    // Setting data after first render drives ngOnChanges -> render() -> postRenderProcessing
    // is scheduled on a microtask. Use setInput (zoneless-correct), then flush the microtask.
    f.componentRef.setInput('data', '```\nconst x = 1;\n```');
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1];
    expect(last.hasCodeBlocks).toBe(true);
    expect(last.hasMermaid).toBe(false);
  });

  it('emits the rendered @Output with hasCodeBlocks=false for prose-only content', async () => {
    const f = render({ data: '' });
    const events = capture<MarkdownRenderEvent>(f.componentInstance.rendered);

    f.componentRef.setInput('data', 'Just some plain prose.');
    f.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1].hasCodeBlocks).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJSafeRichHtmlPipe } from './safe-rich-html.pipe';

/**
 * The mjSafeRichHtml pipe sanitizes untrusted HTML (DOMPurify, HTML+SVG profiles)
 * and then bypasses Angular's sanitizer so the cleaned SVG/markup survives a second
 * pass. The DOM contract is: when used with [innerHTML], safe markup renders into the
 * DOM and dangerous vectors are stripped. We render through a host component that
 * imports the standalone pipe and binds its output to [innerHTML].
 */
@Component({
  standalone: true,
  imports: [MJSafeRichHtmlPipe],
  template: `<div class="sink" [innerHTML]="Html | mjSafeRichHtml"></div>`,
})
class PipeHostComponent {
  @Input() Html: string | null = null;
}

describe('MJSafeRichHtmlPipe (DOM)', () => {
  function render(html: string | null) {
    return renderComponentFixture(PipeHostComponent, { inputs: { Html: html } });
  }

  it('renders safe HTML into the DOM', () => {
    const fixture = render('<p>hello <strong>world</strong></p>');
    const sink = query(fixture, '.sink') as HTMLElement;
    expect(sink.querySelector('p')).not.toBeNull();
    expect(sink.querySelector('strong')?.textContent).toBe('world');
  });

  it('preserves inline SVG markup', () => {
    const fixture = render('<svg><rect width="10" height="10"></rect></svg>');
    const sink = query(fixture, '.sink') as HTMLElement;
    expect(sink.querySelector('svg')).not.toBeNull();
    expect(sink.querySelector('rect')).not.toBeNull();
  });

  it('strips <script> tags so they never enter the DOM', () => {
    const fixture = render('<p>ok</p><script>window.__pwned = 1;</script>');
    const sink = query(fixture, '.sink') as HTMLElement;
    expect(sink.querySelector('p')?.textContent).toBe('ok');
    expect(sink.querySelector('script')).toBeNull();
  });

  it('strips on* event-handler attributes from rendered elements', () => {
    const fixture = render('<img src="x" onerror="window.__pwned = 1;">');
    const sink = query(fixture, '.sink') as HTMLElement;
    const img = sink.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('onerror')).toBeNull();
  });

  it('renders nothing for null/undefined input', () => {
    const fixture = render(null);
    const sink = query(fixture, '.sink') as HTMLElement;
    expect(sink.innerHTML).toBe('');
  });
});

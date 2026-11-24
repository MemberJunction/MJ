import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { AITestHarnessComponent } from '../lib/ai-test-harness.component';

describe('AITestHarnessComponent.RenderMarkdown — link scheme allowlist', () => {
    function render(markdown: string): string {
        const harness = Object.create(AITestHarnessComponent.prototype) as AITestHarnessComponent;
        (harness as unknown as { sanitizer: { bypassSecurityTrustHtml: (v: string) => string } }).sanitizer = {
            bypassSecurityTrustHtml: (v: string) => v,
        };
        return String(harness.RenderMarkdown(markdown));
    }

    it.each([
        ['[evil](javascript:alert(1))'],
        ['[evil](JAVASCRIPT:alert(1))'],
        ['[evil](data:text/html,<script>alert(1)</script>)'],
        ['[evil](vbscript:msgbox(1))'],
    ])('neutralizes dangerous URL scheme in %s instead of emitting an anchor', (input) => {
        const html = render(input);
        expect(html).not.toContain('<a ');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('evil');
    });

    it('renders http, https, and mailto links with rel="noopener noreferrer"', () => {
        const html = render(
            '[Docs](https://docs.memberjunction.org) and [HTTP](http://example.com) and [Mail](mailto:test@example.com)'
        );
        expect(html).toContain(
            '<a href="https://docs.memberjunction.org" target="_blank" rel="noopener noreferrer" class="markdown-link">Docs</a>'
        );
        expect(html).toContain(
            '<a href="http://example.com" target="_blank" rel="noopener noreferrer" class="markdown-link">HTTP</a>'
        );
        expect(html).toContain(
            '<a href="mailto:test@example.com" target="_blank" rel="noopener noreferrer" class="markdown-link">Mail</a>'
        );
    });
});

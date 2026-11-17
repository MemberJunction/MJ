import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarkdownService } from '../lib/services/markdown.service';

describe('MarkdownService.RenderMermaid (S11 SVG sanitization & htmlLabels:false)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('configures mermaid with htmlLabels: false, preserves SVG flowchart text labels, and strips XSS payloads', async () => {
        const service = new MarkdownService();
        const container = document.createElement('div');
        container.innerHTML = '<pre><code class="language-mermaid">flowchart TD\nA[Start] --> B[End]</code></pre>';
        document.body.appendChild(container);

        const initSpy = vi.fn();
        const renderSpy = vi.fn(async () => ({
            svg:
                '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">' +
                '<g class="node"><rect width="80" height="30" onload="alert(1)"/>' +
                '<text x="40" y="20">Quarterly Revenue</text></g>' +
                '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(2)</script>UnsafeHtml</div></foreignObject>' +
                '<script>alert(3)</script>' +
                '</svg>',
        }));

        // Inject stub mermaid engine through internal cached property cleanly
        Reflect.set(service, 'mermaidEngine', {
            initialize: initSpy,
            render: renderSpy,
        });

        const rendered = await service.RenderMermaid(container);
        expect(rendered).toBe(true);
        expect(initSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                securityLevel: 'strict',
                htmlLabels: false,
                flowchart: { htmlLabels: false },
            }),
        );

        const renderedSvg = container.querySelector('.mermaid-diagram svg');
        expect(renderedSvg).not.toBeNull();
        expect(renderedSvg?.textContent).toContain('Quarterly Revenue');
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('foreignObject')).toBeNull();
        expect(renderedSvg?.querySelector('rect')?.hasAttribute('onload')).toBe(false);
    });
});

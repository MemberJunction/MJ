import { describe, it, expect } from 'vitest';
import { SVGUtils } from '../custom/visualization/shared/svg-utils';

const wrap = (inner: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">${inner}</svg>`;

describe('SVGUtils.SanitizeSVG (CodeQL js/bad-tag-filter, js/incomplete-multi-character-sanitization)', () => {
    it('removes scripts, including end tags the old regex missed', () => {
        const out = SVGUtils.SanitizeSVG(wrap('<script>alert(1)</script ><script>alert(2)</script foo="x"><rect/>'));
        expect(out).not.toMatch(/<script/i);
        expect(out).not.toContain('alert');
        expect(out).toContain('<rect');
    });

    it('removes event handlers, quoted or not', () => {
        const out = SVGUtils.SanitizeSVG(wrap('<rect onclick="a()" onload=b() onmouseover=\'c()\'/>'));
        expect(out).not.toMatch(/\son\w+=/i);
    });

    it('empties external and javascript: links but keeps anchors, mailto and data images', () => {
        const out = SVGUtils.SanitizeSVG(wrap(
            '<a href="javascript:alert(1)"><text>x</text></a>' +
            '<a href="https://evil.example.com"><text>y</text></a>' +
            '<a href="#node-1"><text>z</text></a>' +
            '<a href="mailto:a@example.com"><text>m</text></a>' +
            '<image xlink:href="https://evil.example.com/p.png"/>' +
            '<image xlink:href="data:image/png;base64,AAAA"/>'
        ));
        expect(out).not.toContain('javascript:');
        expect(out).not.toContain('evil.example.com');
        expect(out).toContain('href="#node-1"');
        expect(out).toContain('href="mailto:a@example.com"');
        expect(out).toContain('data:image/png;base64,AAAA');
    });

    it('keeps the SVG namespace and ordinary drawing content', () => {
        const out = SVGUtils.SanitizeSVG(wrap('<g id="n1" class="node"><rect width="5" height="5" fill="#fff"/><text x="1" y="1">Label</text></g>'));
        expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(out).toContain('<rect');
        expect(out).toContain('Label');
        expect(out).toContain('id="n1"');
    });

    it('keeps dominant-baseline and pointer-events', () => {
        const out = SVGUtils.SanitizeSVG(wrap('<text dominant-baseline="middle" pointer-events="none">T</text>'));
        expect(out).toContain('dominant-baseline="middle"');
        expect(out).toContain('pointer-events="none"');
    });

    it('keeps caller-supplied ids that match document properties', () => {
        const out = SVGUtils.SanitizeSVG(wrap('<g id="title"><rect/></g><g id="name"><rect/></g>'));
        expect(out).toContain('id="title"');
        expect(out).toContain('id="name"');
    });
});

describe('SVGUtils.GeneratePanZoomScriptBody', () => {
    it('returns the script without a <script> wrapper or CDATA', () => {
        const body = SVGUtils.GeneratePanZoomScriptBody('pan-zoom-container', 0.5, 3, true);
        expect(body).not.toMatch(/<\/?script/i);
        expect(body).not.toContain('CDATA');
        expect(body).toContain("getElementById('pan-zoom-container')");
    });

    it('is what GeneratePanZoomScript wraps', () => {
        const body = SVGUtils.GeneratePanZoomScriptBody('c', 1, 2, false);
        expect(SVGUtils.GeneratePanZoomScript('c', 1, 2, false)).toContain(body);
    });
});

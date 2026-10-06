import { describe, it, expect } from 'vitest';
import { MakeStandaloneSvg } from '../standalone-svg';

const TEMPLATE = `<html><head><style>
:root, [data-theme="dark"] { --text: #ffffff; --bg: #0b0b0b; }
[data-theme="light"] { --text: #111827; --bg: #f4f5f7; --edge: var(--text); }
[data-preset="ink"][data-theme="light"] { --text: #222222; }
svg { font-family: 'JetBrains Mono', Menlo, monospace; }
.t-primary { fill: var(--text); }
svg .a-default { stroke: var(--edge, red); fill: none; }
.unused-class { fill: blue; }
.page-chrome { content: "x"; }
html[data-embed="true"] .diagram-container svg { min-width: 0; }
@media (max-width: 600px) { .t-primary { fill: green; } }
</style></head></html>`;

const SVG = '<svg viewBox="0 0 200 100" role="img"><title>T</title><desc>D</desc><text class="t-primary">A</text><path class="a-default"/></svg>';

describe('MakeStandaloneSvg', () => {
    const out = MakeStandaloneSvg(SVG, TEMPLATE, 'archify-test');
    const style = /<style>([\s\S]*?)<\/style>/.exec(out)?.[1] ?? '';

    it('scopes every copied rule to the svg id and copies only the classes it uses', () => {
        expect(out.startsWith('<svg id="archify-test" viewBox')).toBe(true);
        expect(style).toContain('#archify-test .t-primary{fill:#111827}');
        expect(style).toContain('#archify-test .a-default{stroke:#111827;fill:none}');
        expect(style).not.toContain('unused-class');
        expect(style).not.toContain('page-chrome');
        expect(style).not.toContain('min-width');
    });

    it('ignores rules inside @media blocks', () => {
        expect(style).not.toContain('green');
    });

    it('writes font names without quotes so smartypants cannot break them', () => {
        expect(style).toContain('#archify-test{font-family:JetBrains Mono, Menlo, monospace}');
        expect(style).not.toMatch(/['"]|--/);
    });

    it('resolves the light theme, letting a matching preset override it', () => {
        const ink = MakeStandaloneSvg(SVG, TEMPLATE.replace('</style>', '/* ink */</style>'), 'x', 'ink');
        expect(ink).toContain('#x .t-primary{fill:#222222}');
    });

    it('adds a solid background, sized to the viewBox, after title and desc', () => {
        expect(out).toContain('<desc>D</desc><rect x="0" y="0" width="200" height="100" fill="#f4f5f7"/>');
    });
});

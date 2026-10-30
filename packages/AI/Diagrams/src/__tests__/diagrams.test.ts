import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import {
    ValidateDiagramSpec,
    RenderDiagramSvg,
    RenderDiagram,
    GetDiagramReference,
    MountInteractiveDiagram,
    type MJDiagramSpec,
} from '../index.js';

function loadFixture(name: string): unknown {
    const url = new URL(`./fixtures/${name}`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8'));
}

/** A DOM plus a DOMPurify instance configured like MarkdownService.SanitizeHtml (HTML + SVG profiles, `use`). */
function purifiedDom(body = '<div id="host"></div>'): { doc: Document; sanitize: (m: string) => string } {
    const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`);
    const purify = createDOMPurify(dom.window as unknown as Window & typeof globalThis);
    purify.setConfig({ USE_PROFILES: { html: true, svg: true, svgFilters: true }, ADD_TAGS: ['use'], SANITIZE_DOM: false });
    return { doc: dom.window.document, sanitize: (m) => purify.sanitize(m) };
}

function validSpec(file: string): MJDiagramSpec {
    const v = ValidateDiagramSpec(loadFixture(file));
    if (!v.Valid) throw new Error(`${file} failed validation`);
    return v.Spec;
}

describe('@memberjunction/ai-diagrams — Validator, Renderer, Contract & Viewer', () => {
    const fixtureNames = [
        'renewal.workflow.json',
        'dues.lifecycle.json',
        'abstract.sequence.json',
        'credits.dataflow.json',
        'accreditation-stress.workflow.json',
    ];

    it.each(fixtureNames)('validates, renders, and passes the SVG Data Contract v1 for %s', (file) => {
        const raw = loadFixture(file);
        const res = RenderDiagram(raw);
        expect(res.Success).toBe(true);
        if (!res.Success) return;

        const dom = new JSDOM(res.Svg);
        const doc = dom.window.document;
        const svg = doc.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('data-mj-diagram')).toBe('1');
        expect(svg?.getAttribute('data-mj-kind')).toBe(res.Kind);

        const spec = validSpec(file);

        const nodeEls = doc.querySelectorAll('[data-node-id]');
        expect(nodeEls.length).toBe(spec.nodes.length);
        for (const n of spec.nodes) {
            const el = doc.querySelector(`[data-node-id="${n.id}"]`);
            expect(el).not.toBeNull();
            expect(el?.getAttribute('data-label')).toBe(n.label);
            expect(el?.getAttribute('data-node-kind')).toBeTruthy();
            expect(el?.getAttribute('data-lane')).toBeTruthy();
            expect(el?.getAttribute('tabindex')).toBe('0');
            expect(el?.getAttribute('role')).toBe('button');
            expect(el?.getAttribute('aria-label')).toContain(n.label);
        }

        const edgeEls = doc.querySelectorAll('[data-edge-id]');
        expect(edgeEls.length).toBe(spec.edges.length);
        for (const e of spec.edges) {
            const el = doc.querySelector(`[data-edge-id="${e.id}"]`);
            expect(el).not.toBeNull();
            expect(el?.getAttribute('data-edge-from')).toBe(e.from);
            expect(el?.getAttribute('data-edge-to')).toBe(e.to);
            expect(el?.getAttribute('data-edge-role')).toBeTruthy();
            expect(el?.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
        }

        const cardEls = doc.querySelectorAll('[data-card-id]');
        expect(cardEls.length).toBe((spec.cards ?? []).length);
    });

    it('preserves the entire SVG Data Contract through DOMPurify (HTML + SVG profile) and mounts the viewer', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, RenderDiagramSvg(validSpec('renewal.workflow.json')), sanitize);
        expect(viewer).not.toBeNull();
        if (!viewer) return;

        viewer.Select('review');
        const reviewNode = viewer.Svg.querySelector('[data-node-id="review"]');
        const logNode = viewer.Svg.querySelector('[data-node-id="log"]');
        const submitNode = viewer.Svg.querySelector('[data-node-id="submit"]');
        expect(reviewNode?.classList.contains('sel')).toBe(true);
        expect(submitNode?.classList.contains('dim')).toBe(false);
        expect(logNode?.classList.contains('dim')).toBe(true);

        const panel = host.querySelector('.mjd-panel')!;
        expect(panel.textContent).toContain('Enough CE credits?');
        expect(panel.textContent).toContain('Submit renewal');
        expect(panel.textContent).toContain('Issue new certificate');
        expect(panel.textContent).toContain('Short on credits');

        viewer.Trace('short', 'up');
        expect(viewer.Svg.querySelector('[data-node-id="log"]')?.classList.contains('dim')).toBe(false);
        expect(viewer.Svg.querySelector('[data-node-id="issue"]')?.classList.contains('dim')).toBe(true);

        viewer.Clear();
        expect(viewer.Svg.querySelectorAll('.dim').length).toBe(0);
    });

    it('gives every render its own marker IDs so diagrams on one page never collide', () => {
        const r1 = RenderDiagram(loadFixture('renewal.workflow.json'));
        const r2 = RenderDiagram(loadFixture('renewal.workflow.json'));
        if (!r1.Success || !r2.Success) throw new Error('render failed');
        const ids = (svg: string) => [...svg.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
        expect(ids(r1.Svg).length).toBeGreaterThan(0);
        expect(ids(r1.Svg).filter((id) => ids(r2.Svg).includes(id))).toEqual([]);
    });

    it('returns actionable diagnostics with JSON paths and closest-ID suggestions when a spec is invalid', () => {
        const badSpec = {
            kind: 'workflow',
            title: 'Broken workflow',
            lanes: [{ id: 'member', label: 'Member' }],
            nodes: [
                { id: 'submit', lane: 'membre', label: 'Submit form' },
                { id: 'review', lane: 'member', label: 'Review form' },
            ],
            edges: [{ from: 'submit', to: 'revue' }],
        };

        const res = RenderDiagram(badSpec);
        expect(res.Success).toBe(false);
        if (res.Success !== false) return;

        expect(res.ErrorCode).toBe('VALIDATION_FAILED');
        expect(res.Diagnostics?.some((d) => d.Path === 'nodes[0].lane' && d.Fix.includes('"member"'))).toBe(true);
        expect(res.Diagnostics?.some((d) => d.Path === 'edges[0].to' && d.Fix.includes('"review"'))).toBe(true);
    });

    it('returns reference documentation for individual and all diagram kinds', () => {
        const all = GetDiagramReference();
        expect(all.Success).toBe(true);
        if (all.Success) {
            expect(all.Content).toContain('workflow');
            expect(all.Content).toContain('lifecycle');
            expect(all.Content).toContain('sequence');
            expect(all.Content).toContain('dataflow');
        }

        const bad = GetDiagramReference('piechart');
        expect(bad.Success).toBe(false);
    });

    it('always sanitizes untrusted markup: script-bearing links, SMIL rewrites and data: references do not survive', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const hostile =
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-mj-diagram="1" class="mjd">' +
            '<a href="javascript:alert(1)"><text>a</text></a>' +
            '<a xlink:href="javascript:alert(2)"><text>b</text></a>' +
            '<a href="https://example.com"><animate attributeName="href" to="javascript:alert(3)"/><set attributeName="href" to="javascript:alert(4)"/><text>c</text></a>' +
            '<use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/>' +
            '<g data-node-id="n1" onclick="alert(5)"><text class="lbl">n1</text></g></svg>';
        const viewer = MountInteractiveDiagram(host, hostile, sanitize);
        expect(viewer).not.toBeNull();
        const html = host.innerHTML.toLowerCase();
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('data:image');
        expect(host.querySelectorAll('animate, set').length).toBe(0);
        expect(host.querySelector('[onclick]')).toBeNull();
    });

    it('shows sanitized markup statically when it is not an MJ diagram', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>', sanitize);
        expect(viewer).toBeNull();
        expect(host.querySelector('svg circle')).not.toBeNull();
        expect(host.querySelector('.mjd-shell')).toBeNull();
    });

    it('takes every color from an --mj-* design token, with a light fallback only', () => {
        const res = RenderDiagram(loadFixture('renewal.workflow.json'));
        if (!res.Success) throw new Error('render failed');
        const css = res.Svg.slice(res.Svg.indexOf('<style>'), res.Svg.indexOf('</style>'));
        const bareHex = css.replace(/var\(--mj-[a-z-]+,#[0-9a-fA-F]{3,6}\)/g, '').match(/#[0-9a-fA-F]{3,6}\b/g);
        expect(bareHex).toBeNull();
        expect(res.Svg).not.toContain('data-theme');
    });

    it('renders the subtitle under the title', () => {
        const spec = { ...validSpec('renewal.workflow.json'), subtitle: 'For certified members' };
        expect(RenderDiagramSvg(spec)).toContain('<text class="subtitle"');
    });

    it('caps participants, clamps row and column hints, and refuses self-loops', () => {
        const participants = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, label: `P${i}` }));
        const tooMany = ValidateDiagramSpec({ kind: 'sequence', title: 'Big', participants, messages: [{ from: 'p0', to: 'p1' }] });
        expect(tooMany.Valid).toBe(false);
        if (!tooMany.Valid) expect(tooMany.Diagnostics.some((d) => d.Code === 'TOO_MANY_PARTICIPANTS')).toBe(true);

        const base = { kind: 'workflow', title: 'Hints', lanes: [{ id: 'l', label: 'L' }] };
        const huge = ValidateDiagramSpec({ ...base, nodes: [{ id: 'a', lane: 'l', label: 'A', row: 1e400, col: -5 }, { id: 'b', lane: 'l', label: 'B' }], edges: [{ from: 'a', to: 'b' }] });
        if (!huge.Valid) throw new Error('hint spec should validate');
        expect(huge.Spec.nodes[0].row).toBe(40);
        expect(huge.Spec.nodes[0].col).toBe(0);
        expect(RenderDiagramSvg(huge.Spec)).not.toMatch(/Infinity|NaN/);

        const loop = ValidateDiagramSpec({ ...base, nodes: [{ id: 'a', lane: 'l', label: 'A' }], edges: [{ from: 'a', to: 'a' }] });
        expect(loop.Valid).toBe(false);
        if (!loop.Valid) expect(loop.Diagnostics.some((d) => d.Code === 'SELF_LOOP_EDGE')).toBe(true);
    });

    it('offers connection rows as buttons, so the details panel works from the keyboard', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, RenderDiagramSvg(validSpec('renewal.workflow.json')), sanitize)!;
        viewer.Select('review');
        const rows = host.querySelectorAll<HTMLButtonElement>('.mjd-panel button.mjd-conn');
        expect(rows.length).toBeGreaterThan(0);
        const target = rows[0].dataset.jump!;
        rows[0].click();
        expect(viewer.Svg.querySelector(`[data-node-id="${target}"]`)?.classList.contains('sel')).toBe(true);
    });

    it('Destroy removes its listeners, highlight classes, hit paths and shell', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, RenderDiagramSvg(validSpec('renewal.workflow.json')), sanitize)!;
        const states: unknown[] = [];
        viewer.OnState((st) => states.push(st));
        viewer.Select('review');
        expect(viewer.Svg.querySelectorAll('path.mjd-hit').length).toBeGreaterThan(0);
        viewer.Destroy();
        states.length = 0;

        expect(host.querySelector('.mjd-shell')).toBeNull();
        expect(viewer.Svg.querySelectorAll('path.mjd-hit').length).toBe(0);
        expect(viewer.Svg.querySelectorAll('.sel, .lit, .dim').length).toBe(0);
        (viewer.Svg.querySelector('[data-node-id="review"]') as unknown as HTMLElement).dispatchEvent(new doc.defaultView!.Event('click', { bubbles: true }));
        expect(viewer.Svg.querySelectorAll('.sel').length).toBe(0);
        expect(states).toEqual([]);
    });
});

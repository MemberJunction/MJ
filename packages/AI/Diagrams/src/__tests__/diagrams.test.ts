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

/** The shadow root MountInteractiveDiagram renders into. */
function shadow(host: HTMLElement): ShadowRoot {
    return host.firstElementChild!.shadowRoot!;
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

        expect(shadow(host).getElementById('mj-diagram-viewer-styles')).not.toBeNull();
        const panel = shadow(host).querySelector('.mjd-panel')!;
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
        const html = shadow(host).innerHTML.toLowerCase();
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('data:image');
        expect(shadow(host).querySelectorAll('animate, set').length).toBe(0);
        expect(shadow(host).querySelector('[onclick]')).toBeNull();
    });

    it('shows sanitized markup statically when it is not an MJ diagram', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>', sanitize);
        expect(viewer).toBeNull();
        expect(shadow(host).querySelector('svg circle')).not.toBeNull();
        expect(shadow(host).querySelector('.mjd-shell')).toBeNull();
    });

    it("keeps an SVG's own <style> inside its preview, so it cannot restyle the page", () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        MountInteractiveDiagram(host, '<svg xmlns="http://www.w3.org/2000/svg"><style>body{display:none}</style><circle r="4"/></svg>', sanitize);
        expect([...doc.querySelectorAll('style')].map((el) => el.textContent).join('')).not.toContain('display:none');
        expect(shadow(host).querySelector('svg style')?.textContent).toContain('display:none');
        expect(host.style.contain).toBe('paint');
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

    it('caps phases and lets a sequence participant message itself', () => {
        const participants = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
        const messages = [{ from: 'a', to: 'b' }, { from: 'b', to: 'b', label: 'check' }];
        const phases = Array.from({ length: 81 }, (_, i) => ({ id: `ph${i}`, label: `P${i}`, fromMessage: 0, toMessage: 1 }));
        const many = ValidateDiagramSpec({ kind: 'sequence', title: 'S', participants, messages, phases });
        expect(many.Valid).toBe(false);
        if (!many.Valid) expect(many.Diagnostics.some((d) => d.Code === 'TOO_MANY_PHASES')).toBe(true);

        const self = ValidateDiagramSpec({ kind: 'sequence', title: 'S', participants, messages });
        if (!self.Valid) throw new Error('a sequence self-message should validate');
        expect(self.Spec.edges).toHaveLength(2);
        expect(RenderDiagramSvg(self.Spec)).toMatch(/d="M[\d.]+ [\d.]+H[\d.]+V[\d.]+H[\d.]+"/);
    });

    it('offers connection rows as buttons, so the details panel works from the keyboard', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, RenderDiagramSvg(validSpec('renewal.workflow.json')), sanitize)!;
        viewer.Select('review');
        const rows = shadow(host).querySelectorAll<HTMLButtonElement>('.mjd-panel button.mjd-conn');
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

        expect(shadow(host).querySelector('.mjd-shell')).toBeNull();
        expect(viewer.Svg.querySelectorAll('path.mjd-hit').length).toBe(0);
        expect(viewer.Svg.querySelectorAll('.sel, .lit, .dim').length).toBe(0);
        (viewer.Svg.querySelector('[data-node-id="review"]') as unknown as HTMLElement).dispatchEvent(new doc.defaultView!.Event('click', { bubbles: true }));
        expect(viewer.Svg.querySelectorAll('.sel').length).toBe(0);
        expect(states).toEqual([]);
    });
});

describe('@memberjunction/ai-diagrams — limits, layout and keyboard', () => {
    const lane = [{ id: 'l', label: 'L' }];

    it('refuses very long IDs and labels quickly instead of comparing them', () => {
        const long = 'a'.repeat(8000);
        const start = performance.now();
        const res = ValidateDiagramSpec({ kind: 'workflow', title: 'T', lanes: lane, nodes: [{ id: long, lane: 'l', label: 'x'.repeat(301) }], edges: [{ from: 'b'.repeat(8000), to: long }] });
        expect(performance.now() - start).toBeLessThan(250);
        expect(res.Valid ? [] : res.Diagnostics.map((d) => d.Code)).toEqual(expect.arrayContaining(['ID_TOO_LONG', 'TEXT_TOO_LONG']));
    });

    it('refuses IDs with whitespace, since card node lists are space-separated', () => {
        const res = ValidateDiagramSpec({ kind: 'workflow', title: 'T', lanes: lane, nodes: [{ id: 'a b', lane: 'l', label: 'A' }, { id: 'c', lane: 'l', label: 'C' }], edges: [{ from: 'a b', to: 'c' }] });
        expect(res.Valid ? [] : res.Diagnostics.map((d) => d.Code)).toContain('ID_HAS_WHITESPACE');
    });

    it('orders lifecycle steps numerically', () => {
        const nodes = Array.from({ length: 11 }, (_, i) => ({ id: `n${i + 1}`, lane: 'l', label: `S${i + 1}`, step: String(i + 1) }));
        const res = ValidateDiagramSpec({ kind: 'lifecycle', title: 'T', lanes: lane, nodes, edges: [{ from: 'n1', to: 'n2' }] });
        expect(res.Valid && res.Spec.mainPath).toEqual(nodes.map((n) => n.id));
    });

    it('never extends an inferred dataflow main path across error edges', () => {
        const nodes = ['x', 'a', 'b', 'c', 'err'].map((id) => ({ id, stage: 'l', label: id }));
        const flows = [{ from: 'x', to: 'a', role: 'error' }, { from: 'a', to: 'b', role: 'emphasis' }, { from: 'b', to: 'c' }, { from: 'c', to: 'err', role: 'error' }];
        const res = ValidateDiagramSpec({ kind: 'dataflow', title: 'T', stages: lane, nodes, flows });
        expect(res.Valid && res.Spec.mainPath).toEqual(['a', 'b', 'c']);
    });

    it("lets the spec's kind decide, treats an empty requested kind as missing, and refuses a conflicting one", () => {
        const spec = loadFixture('renewal.workflow.json') as Record<string, unknown>;
        expect(ValidateDiagramSpec({ ...spec, kind: '' }, 'workflow').Valid).toBe(true);
        expect(ValidateDiagramSpec(spec, '').Valid).toBe(true);
        const clash = RenderDiagram(spec, 'sequence');
        expect(clash.Success ? '' : `${clash.ErrorCode} ${clash.Message}`).toMatch(/^INVALID_INPUT \[KIND_CONFLICT\]/);
    });

    it('sizes sequence columns to the widest participant box', () => {
        const participants = [{ id: 'a', label: 'Association membership services desk' }, { id: 'b', label: 'Regional chapter volunteer coordinator' }];
        const res = ValidateDiagramSpec({ kind: 'sequence', title: 'T', participants, messages: [{ from: 'a', to: 'b' }] });
        if (!res.Valid) throw new Error('sequence spec should validate');
        const doc = new JSDOM(RenderDiagramSvg(res.Spec)).window.document;
        const box = (id: string) => doc.querySelector(`[data-node-id="${id}"] rect`)!;
        const aRight = Number(box('a').getAttribute('x')) + Number(box('a').getAttribute('width'));
        expect(aRight).toBeLessThan(Number(box('b').getAttribute('x')));
    });

    it('ellipsizes long card text and gives the full text to the details panel', () => {
        const body = 'Members must log continuing education credits before the renewal window closes or the renewal is held. '.repeat(2).trim();
        const spec = validSpec('renewal.workflow.json');
        spec.cards = [{ ...spec.cards![0], body }];
        const svg = RenderDiagramSvg(spec);
        expect(svg).toContain('…</text>');
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, svg, sanitize)!;
        viewer.Svg.querySelector('.card')!.dispatchEvent(new doc.defaultView!.Event('click', { bubbles: true }));
        expect(shadow(host).querySelector('.mjd-desc')?.textContent).toBe(body);
    });

    it('wraps many cards instead of widening the diagram, and never shrinks below the scale floor', () => {
        const plain = validSpec('renewal.workflow.json');
        const width = (svg: string) => Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
        const many = { ...plain, cards: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, title: `Card ${i}`, nodes: [] })) };
        const svg = RenderDiagramSvg(many);
        expect(width(svg)).toBe(width(RenderDiagramSvg({ ...plain, cards: [] })));
        const cardRects = [...new JSDOM(svg).window.document.querySelectorAll('.card > rect:not(.bar)')];
        expect(Math.max(...cardRects.map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width'))))).toBeLessThanOrEqual(width(svg));
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        MountInteractiveDiagram(host, svg, sanitize);
        const shell = shadow(host).querySelector<HTMLElement>('.mjd-shell')!;
        expect(shell.style.getPropertyValue('--mjd-min-w')).toBe(`${Math.round(width(svg) * 0.75)}px`);
    });

    it('keeps keyboard focus in the panel after a panel action, and returns it to the node on Escape', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, RenderDiagramSvg(validSpec('renewal.workflow.json')), sanitize)!;
        const root = shadow(host);
        viewer.Select('review');
        const row = root.querySelector<HTMLButtonElement>('.mjd-panel button.mjd-conn')!;
        const target = row.dataset.jump!;
        row.focus();
        row.click();
        expect(root.activeElement?.tagName).toBe('H3');
        root.activeElement!.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(root.querySelector('.mjd-panel')?.getAttribute('data-empty')).toBe('true');
        expect(root.activeElement).toBe(viewer.Svg.querySelector(`[data-node-id="${target}"]`));
    });

    it('shows a non-diagram SVG on a white canvas in both themes', () => {
        const { doc, sanitize } = purifiedDom();
        const host = doc.getElementById('host')!;
        MountInteractiveDiagram(host, '<svg xmlns="http://www.w3.org/2000/svg"><text>plain</text></svg>', sanitize);
        expect(shadow(host).querySelector('style')?.textContent).toContain('background:var(--mj-color-neutral-0');
    });
});

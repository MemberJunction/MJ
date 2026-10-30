import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import {
    ValidateDiagramSpec,
    RenderDiagramSvg,
    MJDiagramRenderer,
    GetDiagramReference,
    MountInteractiveDiagram,
    type MJDiagramSpec,
} from '../index.js';

function loadFixture(name: string): unknown {
    const url = new URL(`./fixtures/${name}`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8'));
}

describe('@memberjunction/ai-diagrams — Validator, Renderer, Contract & Viewer', () => {
    const fixtureNames = [
        'renewal.workflow.json',
        'dues.lifecycle.json',
        'abstract.sequence.json',
        'credits.dataflow.json',
        'accreditation-stress.workflow.json',
    ];

    it.each(fixtureNames)('validates, renders, and passes the SVG Data Contract v1 for %s', async (file) => {
        const raw = loadFixture(file);
        const res = await MJDiagramRenderer.Instance.Render(raw);
        expect(res.Success).toBe(true);
        if (!res.Success) return;

        const dom = new JSDOM(res.Svg);
        const doc = dom.window.document;
        const svg = doc.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('data-mj-diagram')).toBe('1');
        expect(svg?.getAttribute('data-mj-kind')).toBe(res.Kind);

        const validated = ValidateDiagramSpec(raw);
        expect(validated.valid).toBe(true);
        if (!validated.valid) return;
        const spec: MJDiagramSpec = validated.spec;

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
        const raw = loadFixture('renewal.workflow.json');
        const validated = ValidateDiagramSpec(raw);
        expect(validated.valid).toBe(true);
        if (!validated.valid) return;

        const svgMarkup = RenderDiagramSvg(validated.spec);
        const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>');
        const purify = createDOMPurify(dom.window as unknown as Window & typeof globalThis);
        purify.setConfig({
            USE_PROFILES: { html: true, svg: true, svgFilters: true },
            FORCE_BODY: true,
            SANITIZE_DOM: false,
        });

        const host = dom.window.document.getElementById('host')!;
        const viewer = MountInteractiveDiagram(host, svgMarkup, {
            Sanitize: (m) => purify.sanitize(m),
        });
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

    it('scopes viewer marker IDs per instance so multiple diagrams in one document never collide', () => {
        const raw1 = loadFixture('renewal.workflow.json');
        const raw2 = loadFixture('dues.lifecycle.json');
        const v1 = ValidateDiagramSpec(raw1);
        const v2 = ValidateDiagramSpec(raw2);
        if (!v1.valid || !v2.valid) throw new Error('Fixtures failed validation');

        const dom = new JSDOM('<!doctype html><html><body><div id="d1"></div><div id="d2"></div></body></html>');
        const doc = dom.window.document;
        const viewer1 = MountInteractiveDiagram(doc.getElementById('d1')!, RenderDiagramSvg(v1.spec, 'diag1'));
        const viewer2 = MountInteractiveDiagram(doc.getElementById('d2')!, RenderDiagramSvg(v2.spec, 'diag2'));
        expect(viewer1).not.toBeNull();
        expect(viewer2).not.toBeNull();

        const markers1 = Array.from(viewer1!.Svg.querySelectorAll('marker')).map((m) => m.id);
        const markers2 = Array.from(viewer2!.Svg.querySelectorAll('marker')).map((m) => m.id);
        const overlap = markers1.filter((id) => markers2.includes(id));
        expect(overlap).toEqual([]);
    });

    it('returns actionable diagnostics with JSON paths and closest-ID suggestions when a spec is invalid', async () => {
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

        const res = await MJDiagramRenderer.Instance.Render(badSpec);
        expect(res.Success).toBe(false);
        if (res.Success !== false) return;

        expect(res.ErrorCode).toBe('VALIDATION_FAILED');
        expect(res.Diagnostics?.some((d) => d.path === 'nodes[0].lane' && d.fix.includes('"member"'))).toBe(true);
        expect(res.Diagnostics?.some((d) => d.path === 'edges[0].to' && d.fix.includes('"review"'))).toBe(true);
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
});

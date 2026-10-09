/**
 * The renderer's own contract around archify: a bad spec comes back as archify's diagnostics (so an
 * agent can repair it), the server never fetches a URL a spec names, and nothing it returns can
 * restyle or break the page it is embedded in.
 */
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ArchitectureDiagramRenderer, type ArchitectureDiagramType } from '../ArchitectureDiagramRenderer';

const webApp = (): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(new URL('../../vendor/archify/examples/web-app.architecture.json', import.meta.url), 'utf8')) as Record<string, unknown>;

describe('ArchitectureDiagramRenderer', () => {
    it('returns archify diagnostics for a spec that fails validation', async () => {
        const result = await ArchitectureDiagramRenderer.Instance.Render('architecture', { meta: { title: 'x' }, components: [{ id: 'a' }] });

        expect(result.Success).toBe(false);
        if (result.Success === false) {
            expect(result.ErrorCode).toBe('VALIDATION_FAILED');
            expect(result.Failure?.schemaVersion).toBe(1);
            const codes = result.Failure?.diagnostics.map((d) => d.code) ?? [];
            expect(codes).toContain('schema/required');
            expect(result.Failure?.diagnostics[0].supportedFixes).toBeInstanceOf(Array);
        }
    });

    it.each([
        ['a URL string', 'https://example.com/logo.svg'],
        ['a pinned capture', { url: 'https://example.com/logo.svg', sha256: 'a'.repeat(64) }],
    ])('refuses a brand mark given as %s instead of fetching it', async (_label, brand) => {
        const spec = webApp();
        (spec.components as Array<Record<string, unknown>>)[0].brand = brand;

        const result = await ArchitectureDiagramRenderer.Instance.Render('architecture', spec);

        expect(result.Success).toBe(false);
        if (result.Success === false) {
            expect(result.Failure?.diagnostics.map((d) => d.code)).toContain('brand/remote-unavailable');
        }
    });

    it('rejects an unknown diagram type without starting a render', async () => {
        const result = await ArchitectureDiagramRenderer.Instance.Render('mindmap' as ArchitectureDiagramType, webApp());

        expect(result).toMatchObject({ Success: false, ErrorCode: 'INVALID_INPUT' });
    });

    it('returns an SVG that is safe to embed in markdown and in another page', async () => {
        const result = await ArchitectureDiagramRenderer.Instance.Render('architecture', webApp());

        expect(result.Success).toBe(true);
        if (result.Success) {
            const id = /^<svg id="([^"]+)"/.exec(result.Svg)?.[1];
            const style = /<style>([\s\S]*?)<\/style>/.exec(result.Svg)?.[1] ?? '';
            const selectors = Array.from(style.matchAll(/([^{}]+)\{/g), (m) => m[1]).flatMap((s) => s.split(','));
            expect(selectors.length).toBeGreaterThan(0);
            expect(selectors.every((s) => s.startsWith(`#${id}`))).toBe(true);
            // Smartypants rewrites these inside <style> in MJ's markdown views.
            expect(style).not.toMatch(/['"]|--|\.\.\./);
            expect(result.Svg).not.toMatch(/<script|<foreignObject/i);
            expect(result.Title).toBe('Sample Web App');
        }
    });
});

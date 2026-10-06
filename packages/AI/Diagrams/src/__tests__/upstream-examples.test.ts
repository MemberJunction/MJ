/**
 * The upstream regression suite (plan phase 3, step 3): every example archify ships must render
 * through the shimmed, in-process renderer. A sync that breaks a renderer, the shims or the template
 * fails here, on the example that broke.
 */
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ArchitectureDiagramRenderer, ARCHITECTURE_DIAGRAM_TYPES, type ArchitectureDiagramType } from '../ArchitectureDiagramRenderer';

const EXAMPLES = new URL('../../vendor/archify/examples/', import.meta.url);

const examples = fs.readdirSync(EXAMPLES)
    .map((file) => ({ file, type: file.split('.').at(-2) as ArchitectureDiagramType }))
    .filter(({ file, type }) => file.endsWith('.json') && ARCHITECTURE_DIAGRAM_TYPES.includes(type));

describe('upstream archify examples', () => {
    it('ships an example for every diagram type', () => {
        expect(new Set(examples.map((e) => e.type))).toEqual(new Set(ARCHITECTURE_DIAGRAM_TYPES));
    });

    it.each(examples)('renders $file', async ({ file, type }) => {
        const spec = JSON.parse(fs.readFileSync(new URL(file, EXAMPLES), 'utf8')) as Record<string, unknown>;

        const result = await ArchitectureDiagramRenderer.Instance.Render(type, spec);

        expect(result.Success, result.Success ? '' : `${result.ErrorCode}: ${result.Message}`).toBe(true);
        if (result.Success) {
            expect(result.Svg.startsWith('<svg id="archify-')).toBe(true);
            expect(result.Html).toContain('<html');
            expect(result.Html).toContain('<svg');
        }
    });
});

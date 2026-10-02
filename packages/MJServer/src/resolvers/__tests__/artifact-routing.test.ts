import { describe, it, expect, vi } from 'vitest';
import { RouteArtifact, type ArtifactRoutingInput } from '../artifact-routing';

const baseInput = (overrides: Partial<ArtifactRoutingInput> = {}): ArtifactRoutingInput => ({
    TypeDefault: 'Inline',
    ForceToolsOnly: false,
    mimeType: 'image/png',
    SizeBytes: 5_000,
    InlineSizeCap: 100 * 1024,
    ModelSupportsModality: () => true,
    ModelName: 'TestModel',
    ArtifactTypeName: 'Image',
    ...overrides,
});

describe('RouteArtifact', () => {
    it('routes Inline default + modality supported + under cap to inline', () => {
        const result = RouteArtifact(baseInput());
        expect(result).toEqual({ delivery: 'inline' });
    });

    it('routes ToolsOnly type default to tools', () => {
        const result = RouteArtifact(baseInput({ TypeDefault: 'ToolsOnly' }));
        expect(result).toEqual({ delivery: 'tools' });
    });

    it('routes ForceToolsOnly per-instance override to tools regardless of type default', () => {
        const result = RouteArtifact(baseInput({ ForceToolsOnly: true }));
        expect(result).toEqual({ delivery: 'tools' });
    });

    it('returns an error when the model lacks modality support for an Inline type', () => {
        const result = RouteArtifact(baseInput({
            ModelSupportsModality: () => false,
        }));
        expect(result.delivery).toBe('error');
        if (result.delivery !== 'error') return;
        expect(result.message).toContain('Image');
        expect(result.message).toContain('TestModel');
        expect(result.message).toContain('image/png');
        // The error message lists all three remediation paths.
        expect(result.message).toMatch(/ToolsOnly/);
        expect(result.message).toMatch(/ForceToolsOnly/);
        expect(result.message).toMatch(/switch to a model/);
    });

    it('falls back to tools with annotation when size exceeds the cap', () => {
        const result = RouteArtifact(baseInput({
            SizeBytes: 200 * 1024,
            InlineSizeCap: 100 * 1024,
        }));
        expect(result.delivery).toBe('tools');
        if (result.delivery !== 'tools') return;
        expect(result.Annotation).toBeDefined();
        expect(result.Annotation).toMatch(/exceeds the inline cap/);
        expect(result.Annotation).toContain('204800');
        expect(result.Annotation).toContain('102400');
    });

    it('checks ToolsOnly before modality (modality check is irrelevant when type is ToolsOnly)', () => {
        const modelSupportsModality = vi.fn(() => false);
        const result = RouteArtifact(baseInput({
            TypeDefault: 'ToolsOnly',
            ModelSupportsModality: modelSupportsModality,
        }));
        expect(result).toEqual({ delivery: 'tools' });
        expect(modelSupportsModality).not.toHaveBeenCalled();
    });

    it('checks modality before size (modality error wins over size fallback)', () => {
        const result = RouteArtifact(baseInput({
            ModelSupportsModality: () => false,
            SizeBytes: 200 * 1024,
        }));
        expect(result.delivery).toBe('error');
    });

    it('ForceToolsOnly bypasses both modality and size checks', () => {
        const modelSupportsModality = vi.fn(() => false);
        const result = RouteArtifact(baseInput({
            ForceToolsOnly: true,
            ModelSupportsModality: modelSupportsModality,
            SizeBytes: 200 * 1024,
        }));
        expect(result).toEqual({ delivery: 'tools' });
        expect(modelSupportsModality).not.toHaveBeenCalled();
    });
});

import { describe, it, expect, vi } from 'vitest';
import { RouteArtifact, type ArtifactRoutingInput } from '../artifact-routing';

const baseInput = (overrides: Partial<ArtifactRoutingInput> = {}): ArtifactRoutingInput => ({
    typeDefault: 'Inline',
    forceToolsOnly: false,
    mimeType: 'image/png',
    sizeBytes: 5_000,
    inlineSizeCap: 100 * 1024,
    modelSupportsModality: () => true,
    modelName: 'TestModel',
    artifactTypeName: 'Image',
    ...overrides,
});

describe('RouteArtifact', () => {
    it('routes Inline default + modality supported + under cap to inline', () => {
        const result = RouteArtifact(baseInput());
        expect(result).toEqual({ delivery: 'inline' });
    });

    it('routes ToolsOnly type default to tools', () => {
        const result = RouteArtifact(baseInput({ typeDefault: 'ToolsOnly' }));
        expect(result).toEqual({ delivery: 'tools' });
    });

    it('routes ForceToolsOnly per-instance override to tools regardless of type default', () => {
        const result = RouteArtifact(baseInput({ forceToolsOnly: true }));
        expect(result).toEqual({ delivery: 'tools' });
    });

    it('returns an error when the model lacks modality support for an Inline type', () => {
        const result = RouteArtifact(baseInput({
            modelSupportsModality: () => false,
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
            sizeBytes: 200 * 1024,
            inlineSizeCap: 100 * 1024,
        }));
        expect(result.delivery).toBe('tools');
        if (result.delivery !== 'tools') return;
        expect(result.annotation).toBeDefined();
        expect(result.annotation).toMatch(/exceeds the inline cap/);
        expect(result.annotation).toContain('204800');
        expect(result.annotation).toContain('102400');
    });

    it('checks ToolsOnly before modality (modality check is irrelevant when type is ToolsOnly)', () => {
        const modelSupportsModality = vi.fn(() => false);
        const result = RouteArtifact(baseInput({
            typeDefault: 'ToolsOnly',
            modelSupportsModality,
        }));
        expect(result).toEqual({ delivery: 'tools' });
        expect(modelSupportsModality).not.toHaveBeenCalled();
    });

    it('checks modality before size (modality error wins over size fallback)', () => {
        const result = RouteArtifact(baseInput({
            modelSupportsModality: () => false,
            sizeBytes: 200 * 1024,
        }));
        expect(result.delivery).toBe('error');
    });

    it('ForceToolsOnly bypasses both modality and size checks', () => {
        const modelSupportsModality = vi.fn(() => false);
        const result = RouteArtifact(baseInput({
            forceToolsOnly: true,
            modelSupportsModality,
            sizeBytes: 200 * 1024,
        }));
        expect(result).toEqual({ delivery: 'tools' });
        expect(modelSupportsModality).not.toHaveBeenCalled();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEmbedTextLocal, mockConfig } = vi.hoisted(() => ({
    mockEmbedTextLocal: vi.fn(),
    mockConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: mockConfig,
            EmbedTextLocal: mockEmbedTextLocal,
        },
    },
}));

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class {
        ContextCurrentUser = { ID: 'test-user' };
    },
    SimpleEmbeddingResult: class {},
}));

import { EmbedTextLocalHelper } from '../custom/util';

describe('EmbedTextLocalHelper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call AIEngine.Config with false and contextUser', async () => {
        mockEmbedTextLocal.mockResolvedValue({
            result: { vector: [0.1, 0.2, 0.3] },
            model: { ID: 'model-1' },
        });

        const mockEntity = { ContextCurrentUser: { ID: 'user-123' } };
        await EmbedTextLocalHelper(mockEntity as never, 'test text');

        expect(mockConfig).toHaveBeenCalledWith(false, { ID: 'user-123' });
    });

    it('should call EmbedTextLocal with the provided text', async () => {
        mockEmbedTextLocal.mockResolvedValue({
            result: { vector: [0.1, 0.2] },
            model: { ID: 'model-1' },
        });

        const mockEntity = { ContextCurrentUser: { ID: 'user-1' } };
        await EmbedTextLocalHelper(mockEntity as never, 'hello world');

        expect(mockEmbedTextLocal).toHaveBeenCalledWith('hello world');
    });

    it('should return vector and modelID on success', async () => {
        const expectedVector = [0.1, 0.2, 0.3, 0.4];
        mockEmbedTextLocal.mockResolvedValue({
            result: { vector: expectedVector },
            model: { ID: 'embed-model-42' },
        });

        const mockEntity = { ContextCurrentUser: { ID: 'user-1' } };
        const result = await EmbedTextLocalHelper(mockEntity as never, 'some text');

        expect(result).toEqual({
            vector: expectedVector,
            modelID: 'embed-model-42',
        });
    });

    it('should throw error when no vector returned', async () => {
        mockEmbedTextLocal.mockResolvedValue({
            result: { vector: null },
            model: { ID: 'model-1' },
        });

        const mockEntity = { ContextCurrentUser: { ID: 'user-1' } };
        await expect(EmbedTextLocalHelper(mockEntity as never, 'text')).rejects.toThrow(
            'Failed to generate embedding'
        );
    });

    it('should throw error when no model ID returned', async () => {
        mockEmbedTextLocal.mockResolvedValue({
            result: { vector: [0.1] },
            model: { ID: null },
        });

        const mockEntity = { ContextCurrentUser: { ID: 'user-1' } };
        await expect(EmbedTextLocalHelper(mockEntity as never, 'text')).rejects.toThrow(
            'Failed to generate embedding'
        );
    });

    it('should throw error when result is undefined', async () => {
        mockEmbedTextLocal.mockResolvedValue(undefined);

        const mockEntity = { ContextCurrentUser: { ID: 'user-1' } };
        await expect(EmbedTextLocalHelper(mockEntity as never, 'text')).rejects.toThrow();
    });

    it('should throw error when result has no result property', async () => {
        mockEmbedTextLocal.mockResolvedValue({
            model: { ID: 'model-1' },
        });

        const mockEntity = { ContextCurrentUser: { ID: 'user-1' } };
        await expect(EmbedTextLocalHelper(mockEntity as never, 'text')).rejects.toThrow(
            'Failed to generate embedding'
        );
    });
});

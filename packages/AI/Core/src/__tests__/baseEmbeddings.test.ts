import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEmbeddings, Embeddings } from '../generic/baseEmbeddings';
import { EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from '../generic/embed.types';

// Concrete test implementation
class TestEmbeddings extends BaseEmbeddings {
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        return { success: true, embedding: [0.1, 0.2, 0.3], object: 'embedding' };
    }

    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        return {
            success: true,
            embeddings: [
                { embedding: [0.1, 0.2], object: 'embedding' },
                { embedding: [0.3, 0.4], object: 'embedding' }
            ],
            model: 'test-model',
            object: 'list'
        };
    }

    public async GetEmbeddingModels(): Promise<string[]> {
        return ['model-a', 'model-b'];
    }
}

describe('BaseEmbeddings', () => {
    let embeddings: TestEmbeddings;

    beforeEach(() => {
        embeddings = new TestEmbeddings('test-api-key');
    });

    describe('constructor', () => {
        it('should inherit from BaseModel and set API key', () => {
            expect(embeddings).toBeInstanceOf(BaseEmbeddings);
        });
    });

    describe('AdditionalSettings', () => {
        it('should start with empty additional settings', () => {
            expect(embeddings.AdditionalSettings).toEqual({});
        });

        it('should merge additional settings', () => {
            embeddings.SetAdditionalSettings({ dim: 512 });
            embeddings.SetAdditionalSettings({ format: 'float' });

            expect(embeddings.AdditionalSettings).toEqual({ dim: 512, format: 'float' });
        });

        it('should clear additional settings', () => {
            embeddings.SetAdditionalSettings({ dim: 512 });
            embeddings.ClearAdditionalSettings();

            expect(embeddings.AdditionalSettings).toEqual({});
        });

        it('should override existing keys', () => {
            embeddings.SetAdditionalSettings({ dim: 512 });
            embeddings.SetAdditionalSettings({ dim: 1024 });

            expect(embeddings.AdditionalSettings.dim).toBe(1024);
        });
    });

    describe('EmbedText', () => {
        it('should return embedding for single text', async () => {
            const result = await embeddings.EmbedText({ text: 'Hello world', model: 'test' });

            expect(result.success).toBe(true);
            expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
        });
    });

    describe('EmbedTexts', () => {
        it('should return embeddings for multiple texts', async () => {
            const result = await embeddings.EmbedTexts({
                texts: ['Hello', 'World'],
                model: 'test'
            });

            expect(result.success).toBe(true);
            expect(result.embeddings).toHaveLength(2);
        });
    });

    describe('GetEmbeddingModels', () => {
        it('should return available models', async () => {
            const models = await embeddings.GetEmbeddingModels();

            expect(models).toEqual(['model-a', 'model-b']);
        });
    });
});

describe('Embeddings (deprecated)', () => {
    it('should be an alias for BaseEmbeddings', () => {
        class TestDeprecated extends Embeddings {
            async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
                return { success: true, embedding: [], object: 'embedding' };
            }
            async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
                return { success: true, embeddings: [], model: 'test', object: 'list' };
            }
            async GetEmbeddingModels(): Promise<string[]> { return []; }
        }
        const instance = new TestDeprecated('key');
        expect(instance).toBeInstanceOf(BaseEmbeddings);
    });
});

import { describe, it, expect } from 'vitest';
import { parseRerankerConfiguration } from '../config.types';

describe('parseRerankerConfiguration', () => {
    describe('null/empty/invalid input', () => {
        it('should return null for null input', () => {
            expect(parseRerankerConfiguration(null)).toBeNull();
        });

        it('should return null for undefined input', () => {
            expect(parseRerankerConfiguration(undefined)).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(parseRerankerConfiguration('')).toBeNull();
        });

        it('should return null for whitespace-only string', () => {
            expect(parseRerankerConfiguration('   ')).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            expect(parseRerankerConfiguration('not-json')).toBeNull();
        });

        it('should return null for JSON without rerankerModelId', () => {
            expect(parseRerankerConfiguration(JSON.stringify({ enabled: true }))).toBeNull();
        });
    });

    describe('disabled configuration', () => {
        it('should return null when enabled is false', () => {
            const config = JSON.stringify({
                enabled: false,
                rerankerModelId: 'model-1'
            });
            expect(parseRerankerConfiguration(config)).toBeNull();
        });
    });

    describe('valid configuration', () => {
        it('should parse minimal valid config with defaults', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-1'
            });
            const result = parseRerankerConfiguration(config);
            expect(result).toEqual({
                enabled: true,
                rerankerModelId: 'model-1',
                retrievalMultiplier: 3,
                minRelevanceThreshold: 0.5,
                rerankPromptID: undefined,
                contextFields: [],
                fallbackOnError: true
            });
        });

        it('should override defaults when values provided', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-2',
                retrievalMultiplier: 5,
                minRelevanceThreshold: 0.7,
                rerankPromptID: 'prompt-1',
                contextFields: ['Keywords', 'Type'],
                fallbackOnError: false
            });
            const result = parseRerankerConfiguration(config);
            expect(result).toEqual({
                enabled: true,
                rerankerModelId: 'model-2',
                retrievalMultiplier: 5,
                minRelevanceThreshold: 0.7,
                rerankPromptID: 'prompt-1',
                contextFields: ['Keywords', 'Type'],
                fallbackOnError: false
            });
        });

        it('should default enabled to true when not explicitly set', () => {
            const config = JSON.stringify({
                rerankerModelId: 'model-1'
            });
            const result = parseRerankerConfiguration(config);
            expect(result).not.toBeNull();
            expect(result!.enabled).toBe(true);
        });
    });
});

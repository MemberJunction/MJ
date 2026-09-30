import { describe, it, expect } from 'vitest';
import { ParseRerankerConfiguration } from '../config.types';

describe('parseRerankerConfiguration', () => {
    describe('null/empty/invalid input', () => {
        it('should return null for null input', () => {
            expect(ParseRerankerConfiguration(null)).toBeNull();
        });

        it('should return null for undefined input', () => {
            expect(ParseRerankerConfiguration(undefined)).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(ParseRerankerConfiguration('')).toBeNull();
        });

        it('should return null for whitespace-only string', () => {
            expect(ParseRerankerConfiguration('   ')).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            expect(ParseRerankerConfiguration('not-json')).toBeNull();
        });

        it('should return null for JSON without rerankerModelId', () => {
            expect(ParseRerankerConfiguration(JSON.stringify({ enabled: true }))).toBeNull();
        });
    });

    describe('disabled configuration', () => {
        it('should return null when enabled is false', () => {
            const config = JSON.stringify({
                enabled: false,
                rerankerModelId: 'model-1'
            });
            expect(ParseRerankerConfiguration(config)).toBeNull();
        });
    });

    describe('valid configuration', () => {
        it('should parse minimal valid config with defaults', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-1'
            });
            const result = ParseRerankerConfiguration(config);
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
            const result = ParseRerankerConfiguration(config);
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
            const result = ParseRerankerConfiguration(config);
            expect(result).not.toBeNull();
            expect(result!.enabled).toBe(true);
        });
    });

    describe('rerankExamples', () => {
        it('should leave rerankExamples unset, so examples are not reranked, when the config omits it', () => {
            const result = ParseRerankerConfiguration(JSON.stringify({ rerankerModelId: 'model-1' }));
            expect(result?.rerankExamples).toBeUndefined();
        });

        it('should pass rerankExamples through when it is set', () => {
            const result = ParseRerankerConfiguration(JSON.stringify({ rerankerModelId: 'model-1', rerankExamples: true }));
            expect(result?.rerankExamples).toBe(true);
        });
    });

    describe('DecisionReranker settings', () => {
        it('should leave decisionTimeoutMS unset, so the reranker applies its default, when the config omits it', () => {
            const result = ParseRerankerConfiguration(JSON.stringify({ rerankerModelId: 'model-1' }));
            expect(result?.decisionTimeoutMS).toBeUndefined();
        });

        it('should pass decisionTimeoutMS through when it is set', () => {
            const result = ParseRerankerConfiguration(JSON.stringify({ rerankerModelId: 'model-1', decisionTimeoutMS: 5000 }));
            expect(result?.decisionTimeoutMS).toBe(5000);
        });
    });
});

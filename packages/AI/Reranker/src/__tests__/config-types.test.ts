/**
 * Unit tests for RerankerConfiguration and parseRerankerConfiguration
 */

import { describe, it, expect } from 'vitest';
import { parseRerankerConfiguration, RerankerConfiguration } from '../config.types';

describe('parseRerankerConfiguration', () => {
    describe('null/undefined/empty input', () => {
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
    });

    describe('invalid JSON', () => {
        it('should return null for malformed JSON', () => {
            expect(parseRerankerConfiguration('not json')).toBeNull();
        });

        it('should return null for partial JSON', () => {
            expect(parseRerankerConfiguration('{"enabled": true')).toBeNull();
        });
    });

    describe('disabled configuration', () => {
        it('should return null when enabled is false', () => {
            const config = JSON.stringify({
                enabled: false,
                rerankerModelId: 'model-123'
            });
            expect(parseRerankerConfiguration(config)).toBeNull();
        });
    });

    describe('missing required fields', () => {
        it('should return null when rerankerModelId is missing', () => {
            const config = JSON.stringify({
                enabled: true
            });
            expect(parseRerankerConfiguration(config)).toBeNull();
        });

        it('should return null when rerankerModelId is empty string', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: ''
            });
            expect(parseRerankerConfiguration(config)).toBeNull();
        });
    });

    describe('valid configuration with defaults', () => {
        it('should apply default retrievalMultiplier of 3', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-123'
            });
            const result = parseRerankerConfiguration(config);
            expect(result).not.toBeNull();
            expect(result!.retrievalMultiplier).toBe(3);
        });

        it('should apply default minRelevanceThreshold of 0.5', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-123'
            });
            const result = parseRerankerConfiguration(config);
            expect(result!.minRelevanceThreshold).toBe(0.5);
        });

        it('should apply default fallbackOnError of true', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-123'
            });
            const result = parseRerankerConfiguration(config);
            expect(result!.fallbackOnError).toBe(true);
        });

        it('should apply default contextFields as empty array', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-123'
            });
            const result = parseRerankerConfiguration(config);
            expect(result!.contextFields).toEqual([]);
        });

        it('should leave rerankPromptID as undefined when not provided', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-123'
            });
            const result = parseRerankerConfiguration(config);
            expect(result!.rerankPromptID).toBeUndefined();
        });
    });

    describe('valid configuration with custom values', () => {
        it('should preserve all provided values', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-456',
                retrievalMultiplier: 5,
                minRelevanceThreshold: 0.7,
                rerankPromptID: 'prompt-789',
                contextFields: ['Keywords', 'Type'],
                fallbackOnError: false
            });
            const result = parseRerankerConfiguration(config);

            expect(result).toEqual({
                enabled: true,
                rerankerModelId: 'model-456',
                retrievalMultiplier: 5,
                minRelevanceThreshold: 0.7,
                rerankPromptID: 'prompt-789',
                contextFields: ['Keywords', 'Type'],
                fallbackOnError: false
            } satisfies RerankerConfiguration);
        });

        it('should always set enabled to true for valid configs', () => {
            const config = JSON.stringify({
                rerankerModelId: 'model-123'
                // enabled not explicitly set
            });
            const result = parseRerankerConfiguration(config);
            expect(result).not.toBeNull();
            expect(result!.enabled).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle zero retrievalMultiplier', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-123',
                retrievalMultiplier: 0
            });
            const result = parseRerankerConfiguration(config);
            // 0 is falsy but nullish coalescing (??) treats 0 as non-null
            expect(result!.retrievalMultiplier).toBe(0);
        });

        it('should handle zero minRelevanceThreshold', () => {
            const config = JSON.stringify({
                enabled: true,
                rerankerModelId: 'model-123',
                minRelevanceThreshold: 0
            });
            const result = parseRerankerConfiguration(config);
            expect(result!.minRelevanceThreshold).toBe(0);
        });
    });
});

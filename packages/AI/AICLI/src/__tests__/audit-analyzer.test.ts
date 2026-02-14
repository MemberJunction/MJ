/**
 * Unit tests for AuditAnalyzer utility class
 *
 * Tests pure functions: token estimation, cost estimation,
 * truncation, error pattern detection, fix suggestions,
 * duration formatting, and aggregate statistics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the core-entities dependency (AuditAnalyzer imports MJAIAgentRunStepEntity for type only)
vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentRunStepEntity: class {},
}));

import { AuditAnalyzer } from '../lib/audit-analyzer';

describe('AuditAnalyzer', () => {
    let analyzer: AuditAnalyzer;

    beforeEach(() => {
        analyzer = new AuditAnalyzer();
    });

    describe('estimateTokenCount', () => {
        it('should return 0 for empty string', () => {
            expect(analyzer.estimateTokenCount('')).toBe(0);
        });

        it('should return 0 for null-ish input', () => {
            expect(analyzer.estimateTokenCount(null as unknown as string)).toBe(0);
            expect(analyzer.estimateTokenCount(undefined as unknown as string)).toBe(0);
        });

        it('should estimate ~4 chars per token', () => {
            const text = 'a'.repeat(100);
            expect(analyzer.estimateTokenCount(text)).toBe(25);
        });

        it('should round up for non-divisible lengths', () => {
            expect(analyzer.estimateTokenCount('hello')).toBe(2);
        });

        it('should handle long text', () => {
            const text = 'x'.repeat(1000000);
            expect(analyzer.estimateTokenCount(text)).toBe(250000);
        });
    });

    describe('estimateCost', () => {
        it('should return 0 for 0 tokens', () => {
            expect(analyzer.estimateCost(0)).toBe(0);
        });

        it('should calculate cost at $0.01/1K tokens', () => {
            expect(analyzer.estimateCost(1000)).toBeCloseTo(0.01);
        });

        it('should calculate for large token counts', () => {
            expect(analyzer.estimateCost(1000000)).toBeCloseTo(10.0);
        });
    });

    describe('getTruncationRules', () => {
        it('should return minimal rules', () => {
            const rules = analyzer.getTruncationRules('minimal', 10000);
            expect(rules.inputMaxChars).toBe(500);
            expect(rules.outputMaxChars).toBe(500);
        });

        it('should return standard rules', () => {
            const rules = analyzer.getTruncationRules('standard', 10000);
            expect(rules.inputMaxChars).toBe(2000);
            expect(rules.outputMaxChars).toBe(2000);
        });

        it('should return detailed rules based on maxTokens', () => {
            const rules = analyzer.getTruncationRules('detailed', 5000);
            expect(rules.inputMaxChars).toBe(20000);
            expect(rules.outputMaxChars).toBe(20000);
        });

        it('should return Infinity for full detail level', () => {
            const rules = analyzer.getTruncationRules('full', 1000);
            expect(rules.inputMaxChars).toBe(Infinity);
            expect(rules.outputMaxChars).toBe(Infinity);
        });

        it('should default to standard for unknown detail level', () => {
            const rules = analyzer.getTruncationRules('unknown', 10000);
            expect(rules.inputMaxChars).toBe(2000);
            expect(rules.outputMaxChars).toBe(2000);
        });
    });

    describe('truncateField', () => {
        it('should return original text when under limit', () => {
            expect(analyzer.truncateField('short', 100)).toBe('short');
        });

        it('should return original text when limit is Infinity', () => {
            const longText = 'x'.repeat(10000);
            expect(analyzer.truncateField(longText, Infinity)).toBe(longText);
        });

        it('should return empty string for empty input', () => {
            expect(analyzer.truncateField('', 100)).toBe('');
        });

        it('should return empty string for null-ish input', () => {
            expect(analyzer.truncateField(null as unknown as string, 100)).toBe('');
            expect(analyzer.truncateField(undefined as unknown as string, 100)).toBe('');
        });

        it('should truncate long text with preview from beginning and end', () => {
            const text = 'A'.repeat(50) + 'B'.repeat(50);
            const result = analyzer.truncateField(text, 50);

            expect(result).toContain('TRUNCATED');
            expect(result.startsWith('A')).toBe(true);
            expect(result.endsWith('B')).toBe(true);
        });

        it('should include truncated count in message', () => {
            const text = 'x'.repeat(200);
            const result = analyzer.truncateField(text, 100);
            expect(result).toContain('TRUNCATED 100 characters');
        });
    });

    describe('detectErrorPattern', () => {
        it('should return undefined for empty array', () => {
            expect(analyzer.detectErrorPattern([])).toBeUndefined();
        });

        it('should return the single error for one-element array', () => {
            const errors = ['Connection timeout after 30s'];
            expect(analyzer.detectErrorPattern(errors)).toBe('Connection timeout after 30s');
        });

        it('should find common substring across errors', () => {
            const errors = [
                'Error: Connection timeout while running query A',
                'Error: Connection timeout while running query B',
                'Error: Connection timeout while running query C',
            ];
            const pattern = analyzer.detectErrorPattern(errors);
            expect(pattern).toBeDefined();
            expect(pattern).toContain('Connection timeout');
        });

        it('should return first error when no long common pattern exists', () => {
            const errors = [
                'Completely different error X',
                'Another unrelated error Y',
            ];
            const pattern = analyzer.detectErrorPattern(errors);
            expect(pattern).toBe('Completely different error X');
        });
    });

    describe('suggestFixes', () => {
        it('should return empty for undefined pattern', () => {
            expect(analyzer.suggestFixes(undefined, [])).toEqual([]);
        });

        it('should suggest timeout fixes', () => {
            const suggestions = analyzer.suggestFixes('Connection timeout after 30s', []);
            expect(suggestions.some(s => s.toLowerCase().includes('timeout'))).toBe(true);
        });

        it('should suggest entity-related fixes', () => {
            const suggestions = analyzer.suggestFixes('RunView failed for entity Users', []);
            expect(suggestions.some(s => s.includes('entity'))).toBe(true);
        });

        it('should suggest JSON parsing fixes', () => {
            const suggestions = analyzer.suggestFixes('Failed to parse JSON response', []);
            expect(suggestions.some(s => s.toLowerCase().includes('json'))).toBe(true);
        });

        it('should suggest null/undefined fixes', () => {
            const suggestions = analyzer.suggestFixes('Cannot read property of null', []);
            expect(suggestions.some(s => s.toLowerCase().includes('null'))).toBe(true);
        });

        it('should suggest permission fixes', () => {
            const suggestions = analyzer.suggestFixes('Permission denied for operation', []);
            expect(suggestions.some(s => s.toLowerCase().includes('permission'))).toBe(true);
        });

        it('should suggest model fixes', () => {
            const suggestions = analyzer.suggestFixes('LLM model not available', []);
            expect(suggestions.some(s => s.toLowerCase().includes('model'))).toBe(true);
        });

        it('should suggest prompt/template fixes', () => {
            const suggestions = analyzer.suggestFixes('Prompt template syntax error', []);
            expect(suggestions.some(s => s.toLowerCase().includes('prompt'))).toBe(true);
        });

        it('should suggest step-specific fixes for data_gather', () => {
            const suggestions = analyzer.suggestFixes('Generic error', [
                { errorMessage: 'error', stepType: 'data_gather' },
            ]);
            expect(suggestions.some(s => s.includes('entity filters'))).toBe(true);
        });

        it('should provide generic suggestions when no patterns match', () => {
            const suggestions = analyzer.suggestFixes('Totally unique error message xyz', []);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.includes('--step'))).toBe(true);
        });
    });

    describe('formatDuration', () => {
        it('should format milliseconds', () => {
            expect(analyzer.formatDuration(500)).toBe('500ms');
        });

        it('should format seconds', () => {
            expect(analyzer.formatDuration(5000)).toBe('5.00s');
        });

        it('should format minutes and seconds', () => {
            const result = analyzer.formatDuration(125000);
            expect(result).toBe('2m 5s');
        });

        it('should format hours and minutes', () => {
            const result = analyzer.formatDuration(3900000);
            expect(result).toBe('1h 5m');
        });

        it('should handle edge case at 1 second boundary', () => {
            expect(analyzer.formatDuration(999)).toBe('999ms');
            expect(analyzer.formatDuration(1000)).toBe('1.00s');
        });

        it('should handle edge case at 1 minute boundary', () => {
            expect(analyzer.formatDuration(59999)).toBe('60.00s');
            expect(analyzer.formatDuration(60000)).toBe('1m 0s');
        });

        it('should handle edge case at 1 hour boundary', () => {
            expect(analyzer.formatDuration(3599999)).toContain('m');
            expect(analyzer.formatDuration(3600000)).toBe('1h 0m');
        });
    });

    describe('calculateAggregateStats', () => {
        it('should handle empty array', () => {
            const stats = analyzer.calculateAggregateStats([]);
            expect(stats.totalRuns).toBe(0);
            expect(stats.successRate).toBe(0);
            expect(stats.avgDuration).toBe(0);
            expect(stats.totalTokens).toBe(0);
            expect(stats.avgTokens).toBe(0);
        });

        it('should calculate for single run', () => {
            const stats = analyzer.calculateAggregateStats([
                { duration: 1000, tokenCount: 500, success: true },
            ]);
            expect(stats.totalRuns).toBe(1);
            expect(stats.successRate).toBe(100);
            expect(stats.avgDuration).toBe(1000);
            expect(stats.totalTokens).toBe(500);
            expect(stats.avgTokens).toBe(500);
        });

        it('should calculate for multiple runs', () => {
            const stats = analyzer.calculateAggregateStats([
                { duration: 1000, tokenCount: 500, success: true },
                { duration: 2000, tokenCount: 1000, success: true },
                { duration: 3000, tokenCount: 1500, success: false },
            ]);
            expect(stats.totalRuns).toBe(3);
            expect(stats.successRate).toBeCloseTo(66.67, 1);
            expect(stats.avgDuration).toBe(2000);
            expect(stats.totalTokens).toBe(3000);
            expect(stats.avgTokens).toBe(1000);
        });

        it('should calculate 0% success rate when all fail', () => {
            const stats = analyzer.calculateAggregateStats([
                { duration: 100, tokenCount: 50, success: false },
                { duration: 200, tokenCount: 100, success: false },
            ]);
            expect(stats.successRate).toBe(0);
        });

        it('should calculate 100% success rate when all succeed', () => {
            const stats = analyzer.calculateAggregateStats([
                { duration: 100, tokenCount: 50, success: true },
                { duration: 200, tokenCount: 100, success: true },
            ]);
            expect(stats.successRate).toBe(100);
        });
    });
});

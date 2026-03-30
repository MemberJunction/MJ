/**
 * Tests for PayloadChangeAnalyzer — detects suspicious payload changes
 * (content truncation, key removal, type changes, pattern anomalies).
 *
 * Bug pattern focus:
 * - Silent data loss/truncation (git commit 3ea93c284c)
 * - Content reduction thresholds and severity levels
 * - Truncation pattern detection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PayloadChangeAnalyzer, PayloadWarningType } from '../PayloadChangeAnalyzer';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

describe('PayloadChangeAnalyzer', () => {
    let analyzer: PayloadChangeAnalyzer;

    beforeEach(() => {
        analyzer = new PayloadChangeAnalyzer();
    });

    // ════════════════════════════════════════════════════════════════════
    // Content Truncation Detection
    // ════════════════════════════════════════════════════════════════════

    describe('content truncation detection', () => {
        it('should detect significant string content reduction (>70%)', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(50) }; // 75% reduction
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const truncationWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            expect(truncationWarnings.length).toBeGreaterThan(0);
            expect(truncationWarnings[0].severity).toBe('high');
        });

        it('should flag >90% reduction as critical severity', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(10) }; // 95% reduction
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const truncationWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            expect(truncationWarnings.length).toBeGreaterThan(0);
            expect(truncationWarnings[0].severity).toBe('critical');
        });

        it('should NOT flag small content changes below threshold', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(150) }; // Only 25% reduction
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const truncationWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            expect(truncationWarnings).toHaveLength(0);
        });

        it('should skip analysis for short strings (below minContentLengthForAnalysis)', () => {
            const original = { text: 'Short text' }; // < 100 chars
            const result = { text: 'S' };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const truncationWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            expect(truncationWarnings).toHaveLength(0);
        });

        it('should include content preview in warning details', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'B'.repeat(20) };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const warning = analysis.warnings.find(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            expect(warning).toBeDefined();
            expect(warning!.details.contentPreview.before).toBeDefined();
            expect(warning!.details.contentPreview.after).toBeDefined();
            expect(warning!.details.originalLength).toBe(200);
            expect(warning!.details.newLength).toBe(20);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // Truncation Pattern Detection
    // ════════════════════════════════════════════════════════════════════

    describe('truncation pattern detection', () => {
        it('should detect "..." at end of result (not in original)', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(150) + '...' };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const patternWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.PatternAnomaly && w.message.includes('truncated'),
            );
            expect(patternWarnings.length).toBeGreaterThan(0);
        });

        it('should detect [truncated] marker in result', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(100) + ' [truncated]' };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const patternWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.PatternAnomaly,
            );
            expect(patternWarnings.length).toBeGreaterThan(0);
        });

        it('should NOT flag "..." when it existed in original', () => {
            const original = { text: 'A'.repeat(200) + '...' };
            const result = { text: 'A'.repeat(200) + '...' }; // Same pattern in both
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const patternWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.PatternAnomaly && w.message.includes('truncated'),
            );
            expect(patternWarnings).toHaveLength(0);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // Array Reduction Detection
    // ════════════════════════════════════════════════════════════════════

    describe('array reduction detection', () => {
        it('should detect significant array reduction (>50%)', () => {
            const original = { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
            const result = { items: [1, 2, 3] }; // 70% reduction
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const arrayWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.PatternAnomaly && w.message.includes('Array'),
            );
            expect(arrayWarnings.length).toBeGreaterThan(0);
        });

        it('should NOT flag empty original arrays', () => {
            const original = { items: [] };
            const result = { items: [] };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const arrayWarnings = analysis.warnings.filter(
                w => w.message.includes('Array'),
            );
            expect(arrayWarnings).toHaveLength(0);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // Type Change Detection
    // ════════════════════════════════════════════════════════════════════

    describe('type change detection', () => {
        it('should detect object-to-primitive type change', () => {
            const original = { data: { nested: true, value: 42 } };
            const result = { data: 'stringified' };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const typeWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.TypeChange,
            );
            expect(typeWarnings.length).toBeGreaterThan(0);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // Custom Configuration
    // ════════════════════════════════════════════════════════════════════

    describe('custom configuration', () => {
        it('should respect custom contentReductionThreshold', () => {
            const strict = new PayloadChangeAnalyzer({ contentReductionThreshold: 30 });
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(120) }; // 40% reduction

            const analysis = strict.analyzeChangeRequest(original, {}, result);
            const truncationWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            // With 30% threshold, a 40% reduction should trigger
            expect(truncationWarnings.length).toBeGreaterThan(0);
        });

        it('should respect custom minContentLengthForAnalysis', () => {
            const lenient = new PayloadChangeAnalyzer({ minContentLengthForAnalysis: 10 });
            const original = { text: 'A'.repeat(20) };
            const result = { text: 'A'.repeat(3) }; // 85% reduction on short string

            const analysis = lenient.analyzeChangeRequest(original, {}, result);
            const truncationWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            expect(truncationWarnings.length).toBeGreaterThan(0);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // Summary and Feedback
    // ════════════════════════════════════════════════════════════════════

    describe('analysis result structure', () => {
        it('should return proper summary with warning counts', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(10) }; // Critical truncation
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            expect(analysis.summary.totalWarnings).toBeGreaterThan(0);
            expect(analysis.summary.suspiciousChanges).toBeGreaterThan(0);
            expect(analysis.warnings.length).toBe(analysis.summary.totalWarnings);
            expect(analysis.criticalWarnings.length).toBe(analysis.summary.suspiciousChanges);
        });

        it('should flag requiresFeedback when critical changes detected', () => {
            const original = { text: 'A'.repeat(200) };
            const result = { text: 'A'.repeat(10) };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            expect(analysis.requiresFeedback).toBe(true);
        });

        it('should return clean result for no-change scenario', () => {
            const original = { status: 'active', count: 5 };
            const result = { status: 'active', count: 5 };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            expect(analysis.warnings).toHaveLength(0);
            expect(analysis.criticalWarnings).toHaveLength(0);
            expect(analysis.requiresFeedback).toBe(false);
            expect(analysis.summary.totalWarnings).toBe(0);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // Nested Analysis
    // ════════════════════════════════════════════════════════════════════

    describe('nested analysis', () => {
        it('should analyze nested string changes', () => {
            const original = { level1: { level2: { text: 'A'.repeat(200) } } };
            const result = { level1: { level2: { text: 'A'.repeat(20) } } };
            const analysis = analyzer.analyzeChangeRequest(original, {}, result);

            const truncationWarnings = analysis.warnings.filter(
                w => w.type === PayloadWarningType.ContentTruncation,
            );
            expect(truncationWarnings.length).toBeGreaterThan(0);
            expect(truncationWarnings[0].path).toContain('level2');
        });

        it('should respect maxAnalysisDepth', () => {
            const shallow = new PayloadChangeAnalyzer({ maxAnalysisDepth: 1 });
            const original = { l1: { l2: { l3: { text: 'A'.repeat(200) } } } };
            const result = { l1: { l2: { l3: { text: 'B' } } } };
            const analysis = shallow.analyzeChangeRequest(original, {}, result);

            // Deep truncation should NOT be detected with shallow depth limit
            const deepWarnings = analysis.warnings.filter(
                w => w.path.includes('l3'),
            );
            expect(deepWarnings).toHaveLength(0);
        });
    });
});

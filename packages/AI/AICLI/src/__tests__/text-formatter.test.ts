/**
 * Unit tests for TextFormatter
 */

import { describe, it, expect, vi } from 'vitest';

// Mock chalk to return plain text (no ANSI codes)
vi.mock('chalk', () => {
    const identity = (s: string) => s;
    const handler: ProxyHandler<Record<string, unknown>> = {
        get: (_target, prop) => {
            if (prop === 'default' || prop === '__esModule') return _target;
            return identity;
        }
    };
    return { default: new Proxy({}, handler) };
});

import { TextFormatter } from '../lib/text-formatter';

describe('TextFormatter', () => {
    describe('formatText()', () => {
        it('should return empty string for null/undefined/empty input', () => {
            expect(TextFormatter.formatText('')).toBe('');
            expect(TextFormatter.formatText(null as unknown as string)).toBe('');
            expect(TextFormatter.formatText(undefined as unknown as string)).toBe('');
        });

        it('should format simple text', () => {
            const result = TextFormatter.formatText('Hello world', { maxWidth: 80 });
            expect(result).toContain('Hello world');
        });

        it('should preserve paragraphs', () => {
            const text = 'First paragraph.\n\nSecond paragraph.';
            const result = TextFormatter.formatText(text, { preserveParagraphs: true, maxWidth: 80 });
            expect(result).toContain('First paragraph.');
            expect(result).toContain('Second paragraph.');
        });

        it('should trim excessive empty lines', () => {
            const text = 'Line 1\n\n\n\n\nLine 2';
            const result = TextFormatter.formatText(text, { trimEmptyLines: true, maxWidth: 80 });
            // Should reduce multiple newlines to double newline
            expect(result).not.toContain('\n\n\n');
        });
    });

    describe('formatJSON()', () => {
        it('should format a simple object', () => {
            const result = TextFormatter.formatJSON({ key: 'value' });
            expect(result).toContain('key');
            expect(result).toContain('value');
        });

        it('should handle nested objects', () => {
            const result = TextFormatter.formatJSON({ a: { b: 'c' } });
            expect(result).toContain('"a"');
            expect(result).toContain('"b"');
        });

        it('should handle arrays', () => {
            const result = TextFormatter.formatJSON([1, 2, 3]);
            expect(result).toContain('1');
            expect(result).toContain('2');
            expect(result).toContain('3');
        });

        it('should use custom indent', () => {
            const result = TextFormatter.formatJSON({ key: 'value' }, 4);
            // 4 spaces indent
            expect(result).toContain('    ');
        });
    });

    describe('divider()', () => {
        it('should create a divider line with default character', () => {
            const result = TextFormatter.divider('─', 10);
            expect(result).toBe('──────────');
        });

        it('should create a divider with custom character', () => {
            const result = TextFormatter.divider('=', 5);
            expect(result).toBe('=====');
        });
    });

    describe('box()', () => {
        it('should create a box around text', () => {
            const result = TextFormatter.box('Hello', { width: 10 });
            expect(result).toContain('┌');
            expect(result).toContain('┐');
            expect(result).toContain('└');
            expect(result).toContain('┘');
            expect(result).toContain('Hello');
        });
    });
});

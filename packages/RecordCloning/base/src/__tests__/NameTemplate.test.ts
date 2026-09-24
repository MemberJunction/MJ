import { describe, it, expect } from 'vitest';
import {
    RenderNameTemplate,
    IncrementName,
    FindNextAvailableName,
} from '../NameTemplate';

describe('NameTemplate', () => {
    describe('RenderNameTemplate', () => {
        it('inserts values containing $ literally instead of as replacement patterns', () => {
            const result = RenderNameTemplate('{Name} (Copy by {User})', {
                SourceRecordName: "Q3 $& $1 $$ Budget",
                UserName: "a$'b",
            });
            expect(result).toBe("Q3 $& $1 $$ Budget (Copy by a$'b)");
        });

        it('interpolates {Name}, {n}, {Date}, and {User} tokens', () => {
            const rendered = RenderNameTemplate('{User}: Copy #{n} of {Name} on {Date}', {
                SourceRecordName: 'Quarterly Report',
                Counter: 3,
                DateStr: '2026-09-21',
                UserName: 'Yuri Lee',
            });

            expect(rendered).toBe('Yuri Lee: Copy #3 of Quarterly Report on 2026-09-21');
        });

        it('defaults DateStr to current date when omitted', () => {
            const today = new Date().toISOString().slice(0, 10);
            const rendered = RenderNameTemplate('Archived {Name} on {Date}', {
                SourceRecordName: 'Project A',
            });

            expect(rendered).toBe(`Archived Project A on ${today}`);
        });
    });

    describe('IncrementName strategy', () => {
        it('bumps parenthesized numbers', () => {
            expect(IncrementName('Report (1)')).toBe('Report (2)');
            expect(IncrementName('Report (9)')).toBe('Report (10)');
        });

        it('bumps dotted version numbers', () => {
            expect(IncrementName('Workflow 1.0')).toBe('Workflow 1.1');
            expect(IncrementName('Workflow v2.4')).toBe('Workflow v2.5');
        });

        it('bumps trailing integers and version tags', () => {
            expect(IncrementName('Campaign v1')).toBe('Campaign v2');
            expect(IncrementName('Dataset 5')).toBe('Dataset 6');
        });

        it('appends " 2" when name has no number', () => {
            expect(IncrementName('Monthly Summary')).toBe('Monthly Summary 2');
        });

        it('keeps the word-boundary rule for trailing integers', () => {
            expect(IncrementName('Title5')).toBe('Title5 2');
            expect(IncrementName('v1')).toBe('v2');
            expect(IncrementName('Build-12')).toBe('Build-13');
            expect(IncrementName('Report  (3)')).toBe('Report (4)');
        });

        it('stays linear on long whitespace and digit runs', () => {
            const start = Date.now();
            IncrementName('\t'.repeat(50000) + 'x');
            IncrementName('0'.repeat(50000) + '.x');
            expect(Date.now() - start).toBeLessThan(250);
        });
    });

    describe('FindNextAvailableName deterministic collision counter', () => {
        it('returns raw template when no collision exists', () => {
            const existing = new Set<string>(['Some Other Record']);
            const result = FindNextAvailableName('Invoice Flow', existing, {
                Template: 'Copy of {Name}',
            });

            expect(result).toBe('Copy of Invoice Flow');
        });

        it('increments with (2), (3)... when raw template collides', () => {
            const existing = new Set<string>([
                'Copy of Invoice Flow',
                'Copy of Invoice Flow (2)',
            ]);
            const result = FindNextAvailableName('Invoice Flow', existing, {
                Template: 'Copy of {Name}',
            });

            expect(result).toBe('Copy of Invoice Flow (3)');
        });

        it('supports {n} directly in the template', () => {
            const existing = new Set<string>([
                'Invoice Flow - Clone 1',
                'Invoice Flow - Clone 2',
            ]);
            const result = FindNextAvailableName('Invoice Flow', existing, {
                Template: '{Name} - Clone {n}',
            });

            expect(result).toBe('Invoice Flow - Clone 3');
        });

        it('handles increment strategy with multiple existing versions', () => {
            const existing = new Set<string>([
                'Quarterly Goals 1.0',
                'Quarterly Goals 1.1',
                'Quarterly Goals 1.2',
            ]);
            const result = FindNextAvailableName('Quarterly Goals 1.0', existing, {
                Strategy: 'increment',
            });

            expect(result).toBe('Quarterly Goals 1.3');
        });

        it('respects strategy="none" and preserves original name', () => {
            const existing = new Set<string>();
            const result = FindNextAvailableName('Untouched Name', existing, {
                Strategy: 'none',
            });

            expect(result).toBe('Untouched Name');
        });
    });
});

import { describe, it, expect } from 'vitest';
import { FormResponseUtils } from '../lib/dynamic-form-response/form-response-utils';

// Minimal types matching the real FormQuestion / FormOption interfaces from @memberjunction/ai-core-plus.
// We only need the subset that FormResponseUtils actually reads.
interface MockFormOption {
    value: string | number | boolean;
    label: string;
}

interface MockFormQuestion {
    id: string;
    label: string;
    type: string | { type: string; options: MockFormOption[] };
    required?: boolean;
}

/** Helper to build a choice-type question (buttongroup / radio / dropdown / checkbox). */
function choiceQuestion(
    choiceType: 'buttongroup' | 'radio' | 'dropdown' | 'checkbox',
    options: MockFormOption[],
): MockFormQuestion {
    return { id: 'q1', label: 'Question 1', type: { type: choiceType, options } };
}

/** Helper to build a simple-type question (text, date, etc.). */
function simpleQuestion(type: string): MockFormQuestion {
    return { id: 'q1', label: 'Q', type };
}

// We cast through `unknown` so TypeScript accepts our minimal mock shapes.
const asQ = (q: MockFormQuestion) => q as unknown as Parameters<typeof FormResponseUtils.FormatValue>[1];

describe('FormResponseUtils', () => {
    // ------------------------------------------------------------------ FormatValue
    describe('FormatValue', () => {
        it('returns empty string for null value', () => {
            expect(FormResponseUtils.FormatValue(null, null, 'text')).toBe('');
        });

        it('returns empty string for undefined value', () => {
            expect(FormResponseUtils.FormatValue(undefined, null, 'text')).toBe('');
        });

        it('returns stringified value for plain text type', () => {
            expect(FormResponseUtils.FormatValue('hello', null, 'text')).toBe('hello');
        });

        it('returns stringified number for unknown type', () => {
            expect(FormResponseUtils.FormatValue(42, null, null)).toBe('42');
        });

        it('formats date type without time', () => {
            // Use an explicit UTC datetime to avoid local-timezone date shifting
            const result = FormResponseUtils.FormatValue('2025-06-15T12:00:00Z', null, 'date');
            expect(result).toContain('Jun');
            expect(result).toContain('2025');
        });

        it('formats datetime type with time', () => {
            const result = FormResponseUtils.FormatValue('2025-06-15T14:30:00Z', null, 'datetime');
            expect(result).toContain('Jun');
            expect(result).toContain('15');
            expect(result).toContain('2025');
            // Should include time portion
            expect(result).toMatch(/\d{1,2}:\d{2}/);
        });

        it('formats time type', () => {
            const result = FormResponseUtils.FormatValue('14:30', null, 'time');
            expect(result).toMatch(/2:30\s*PM/i);
        });

        it('formats daterange type', () => {
            // Use mid-month dates to avoid timezone boundary shifts
            const result = FormResponseUtils.FormatValue(
                { start: '2025-01-15', end: '2025-12-15' },
                null,
                'daterange',
            );
            expect(result).toContain('Jan');
            expect(result).toContain('Dec');
            expect(result).toContain('to');
        });

        it('resolves option label for buttongroup choice type', () => {
            const q = choiceQuestion('buttongroup', [
                { value: 'a', label: 'Alpha' },
                { value: 'b', label: 'Beta' },
            ]);
            expect(FormResponseUtils.FormatValue('b', asQ(q), 'buttongroup')).toBe('Beta');
        });

        it('resolves option label for dropdown choice type', () => {
            const q = choiceQuestion('dropdown', [
                { value: 1, label: 'One' },
                { value: 2, label: 'Two' },
            ]);
            // value comparison is done via String(), so numeric "1" matches
            expect(FormResponseUtils.FormatValue(1, asQ(q), 'dropdown')).toBe('One');
        });

        it('falls back to stringified value when no matching option', () => {
            const q = choiceQuestion('radio', [{ value: 'a', label: 'Alpha' }]);
            expect(FormResponseUtils.FormatValue('z', asQ(q), 'radio')).toBe('z');
        });

        it('auto-detects ISO datetime strings for default type', () => {
            const result = FormResponseUtils.FormatValue('2025-03-10T15:45:00Z', null, null);
            expect(result).toContain('Mar');
            expect(result).toContain('10');
            expect(result).toContain('2025');
        });

        it('auto-detects ISO midnight as date-only', () => {
            const result = FormResponseUtils.FormatValue('2025-03-15T00:00:00Z', null, null);
            // Midnight UTC should be treated as date-only (no time component)
            expect(result).toContain('Mar');
            expect(result).toContain('2025');
        });
    });

    // -------------------------------------------------------------- ResolveOptionLabel
    describe('ResolveOptionLabel', () => {
        it('returns matching label', () => {
            const q = choiceQuestion('radio', [
                { value: 'x', label: 'X Label' },
                { value: 'y', label: 'Y Label' },
            ]);
            expect(FormResponseUtils.ResolveOptionLabel(asQ(q)!, 'y')).toBe('Y Label');
        });

        it('returns null when no match found', () => {
            const q = choiceQuestion('radio', [{ value: 'x', label: 'X' }]);
            expect(FormResponseUtils.ResolveOptionLabel(asQ(q)!, 'missing')).toBeNull();
        });

        it('returns null when question type is a simple string (no options)', () => {
            const q = simpleQuestion('text');
            expect(FormResponseUtils.ResolveOptionLabel(asQ(q)!, 'anything')).toBeNull();
        });

        it('matches numeric value via string coercion', () => {
            const q = choiceQuestion('dropdown', [{ value: 42, label: 'Forty Two' }]);
            expect(FormResponseUtils.ResolveOptionLabel(asQ(q)!, 42)).toBe('Forty Two');
        });

        it('matches boolean value via string coercion', () => {
            const q = choiceQuestion('checkbox', [{ value: true, label: 'Yes' }]);
            expect(FormResponseUtils.ResolveOptionLabel(asQ(q)!, true)).toBe('Yes');
        });
    });

    // ------------------------------------------------------------------- FormatDate
    describe('FormatDate', () => {
        it('formats a valid date without time', () => {
            const result = FormResponseUtils.FormatDate('2025-12-25', false);
            expect(result).toContain('Dec');
            expect(result).toContain('25');
            expect(result).toContain('2025');
        });

        it('formats a valid date with time', () => {
            const result = FormResponseUtils.FormatDate('2025-12-25T08:30:00Z', true);
            expect(result).toContain('Dec');
            expect(result).toContain('25');
            expect(result).toMatch(/\d{1,2}:\d{2}/);
        });

        it('returns original string for invalid date', () => {
            expect(FormResponseUtils.FormatDate('not-a-date', false)).toBe('not-a-date');
        });

        it('returns original string for empty string', () => {
            expect(FormResponseUtils.FormatDate('', false)).toBe('');
        });
    });

    // ------------------------------------------------------------------- FormatTime
    describe('FormatTime', () => {
        it('formats 24h time to 12h', () => {
            const result = FormResponseUtils.FormatTime('14:30');
            expect(result).toMatch(/2:30\s*PM/i);
        });

        it('formats midnight', () => {
            const result = FormResponseUtils.FormatTime('00:00');
            expect(result).toMatch(/12:00\s*AM/i);
        });

        it('formats noon', () => {
            const result = FormResponseUtils.FormatTime('12:00');
            expect(result).toMatch(/12:00\s*PM/i);
        });

        it('returns locale string for malformed time (NaN hours produces Invalid Date)', () => {
            // 'bad'.split(':').map(Number) yields [NaN, NaN], which makes an invalid Date.
            // toLocaleTimeString on an invalid Date returns 'Invalid Date' in Node.
            const result = FormResponseUtils.FormatTime('bad');
            expect(result).toBe('Invalid Date');
        });
    });

    // --------------------------------------------------------------- FormatDateRange
    describe('FormatDateRange', () => {
        it('formats start and end dates', () => {
            // Use mid-month dates to avoid timezone boundary shifts
            const result = FormResponseUtils.FormatDateRange({ start: '2025-01-15', end: '2025-06-15' });
            expect(result).toContain('Jan');
            expect(result).toContain('Jun');
            expect(result).toContain('to');
        });

        it('returns JSON string for non-range values', () => {
            expect(FormResponseUtils.FormatDateRange('some string')).toBe('"some string"');
        });

        it('returns JSON string for null', () => {
            expect(FormResponseUtils.FormatDateRange(null)).toBe('null');
        });

        it('returns JSON string for object without start/end', () => {
            const result = FormResponseUtils.FormatDateRange({ foo: 'bar' });
            expect(result).toContain('foo');
        });
    });

    // ----------------------------------------------------------------- HumanizeKey
    describe('HumanizeKey', () => {
        it('converts camelCase to title case', () => {
            expect(FormResponseUtils.HumanizeKey('firstName')).toBe('First Name');
        });

        it('converts snake_case to title case', () => {
            expect(FormResponseUtils.HumanizeKey('first_name')).toBe('First Name');
        });

        it('converts PascalCase to title case', () => {
            expect(FormResponseUtils.HumanizeKey('FirstName')).toBe('First Name');
        });

        it('handles kebab-case', () => {
            expect(FormResponseUtils.HumanizeKey('first-name')).toBe('First Name');
        });

        it('handles single word', () => {
            expect(FormResponseUtils.HumanizeKey('name')).toBe('Name');
        });

        it('handles all-uppercase abbreviation (treated as individual letters)', () => {
            // Each uppercase letter gets a space before it
            const result = FormResponseUtils.HumanizeKey('XMLParser');
            // "XMLParser" -> " X M L Parser" -> trimmed -> "X M L Parser" -> title-cased
            expect(result).toBe('X M L Parser');
        });

        it('handles empty string', () => {
            expect(FormResponseUtils.HumanizeKey('')).toBe('');
        });
    });

    // ------------------------------------------------------------------ EscapeHtml
    describe('EscapeHtml', () => {
        it('escapes ampersands', () => {
            expect(FormResponseUtils.EscapeHtml('a&b')).toBe('a&amp;b');
        });

        it('escapes less-than', () => {
            expect(FormResponseUtils.EscapeHtml('<script>')).toBe('&lt;script&gt;');
        });

        it('escapes greater-than', () => {
            expect(FormResponseUtils.EscapeHtml('a>b')).toBe('a&gt;b');
        });

        it('escapes double quotes', () => {
            expect(FormResponseUtils.EscapeHtml('"hello"')).toBe('&quot;hello&quot;');
        });

        it('escapes single quotes', () => {
            expect(FormResponseUtils.EscapeHtml("it's")).toBe("it&#039;s");
        });

        it('handles all special chars together', () => {
            expect(FormResponseUtils.EscapeHtml('<a href="x">&\'</a>')).toBe(
                '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;',
            );
        });

        it('leaves safe strings unchanged', () => {
            expect(FormResponseUtils.EscapeHtml('Hello World 123')).toBe('Hello World 123');
        });

        it('handles empty string', () => {
            expect(FormResponseUtils.EscapeHtml('')).toBe('');
        });
    });

    // --------------------------------------------------------------- FormatValueHtml
    describe('FormatValueHtml', () => {
        it('formats and escapes HTML', () => {
            const result = FormResponseUtils.FormatValueHtml('<b>bold</b>', null, 'text');
            expect(result).toBe('&lt;b&gt;bold&lt;/b&gt;');
        });

        it('returns empty string for null', () => {
            expect(FormResponseUtils.FormatValueHtml(null, null, 'text')).toBe('');
        });
    });

    // --------------------------------------------------------- GetQuestionTypeString
    describe('GetQuestionTypeString', () => {
        it('returns string type directly', () => {
            const q = simpleQuestion('text');
            expect(FormResponseUtils.GetQuestionTypeString(asQ(q)!)).toBe('text');
        });

        it('returns type property from object type', () => {
            const q = choiceQuestion('dropdown', []);
            expect(FormResponseUtils.GetQuestionTypeString(asQ(q)!)).toBe('dropdown');
        });
    });
});

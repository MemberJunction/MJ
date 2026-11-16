import { describe, it, expect } from 'vitest';
import type { QueryDiagnosticLine } from '@memberjunction/core-entities';
import { EditorMarkersFor, ExtractionSeverityOf, HideUnreadableFieldRows, SaveRefusalOf } from '../lib/custom/Queries/query-form-logic';

const finding = (over: Partial<QueryDiagnosticLine> = {}): QueryDiagnosticLine =>
    ({ Code: 'MJQ_SYNTAX', Line: 2, Column: 5, Message: 'This expression does not parse.', FixHint: null, ...over });

describe('SaveRefusalOf', () => {
    it('reads a refusal by the query rules into its headline and findings', () => {
        const refusal = SaveRefusalOf('Query "Q" was not saved:\nMJQ_TAG_IN_STRING_LITERAL at line 3, column 16: A tag is inside a string. Fix: Use | sqlString.');
        expect(refusal?.Headline).toBe('Query "Q" was not saved:');
        expect(refusal?.Diagnostics).toEqual([{ Code: 'MJQ_TAG_IN_STRING_LITERAL', Line: 3, Column: 16, Message: 'A tag is inside a string.', FixHint: 'Use | sqlString.' }]);
    });

    it('is null for a failure that is not a rule refusal, so only the form\'s own message shows', () => {
        expect(SaveRefusalOf('Network request failed')).toBeNull();
        expect(SaveRefusalOf(undefined)).toBeNull();
    });
});

describe('EditorMarkersFor', () => {
    it('marks a refused save\'s located findings as errors, with the fix in the message', () => {
        const markers = EditorMarkersFor([finding({ FixHint: 'Remove it.' }), finding({ Line: null, Column: null })], [finding({ Line: 9 })], 'Warning');
        expect(markers).toEqual([{ Line: 2, Column: 5, Severity: 'error', Message: 'This expression does not parse. Remove it.' }]);
    });

    it('marks the extraction\'s findings at its severity when the save was not refused', () => {
        expect(EditorMarkersFor([], [finding()], 'Warning')).toEqual([{ Line: 2, Column: 5, Severity: 'warning', Message: 'This expression does not parse.' }]);
        expect(EditorMarkersFor([], [finding()], null)[0].Severity).toBe('info');
    });
});

describe('ExtractionSeverityOf', () => {
    it('maps the status to a severity', () => {
        expect(ExtractionSeverityOf('Error')).toBe('error');
        expect(ExtractionSeverityOf('Warning')).toBe('warning');
        expect(ExtractionSeverityOf('OK')).toBe('info');
        expect(ExtractionSeverityOf('Skipped')).toBe('info');
    });
});

describe('HideUnreadableFieldRows', () => {
    const row = (ID: string, IsSaved = true) => ({ ID, IsSaved, Name: ID });

    it('leaves out a stored row the user may not see, by ID ignoring case', () => {
        const rows = [row('A1'), row('B2'), row('C3')];
        const kept = HideUnreadableFieldRows(rows, [row('a1'), row('b2'), row('c3')], [row('A1'), row('C3')]);
        expect(kept.map(r => r.Name)).toEqual(['A1', 'C3']);
    });

    it('keeps the user\'s own unsaved rows and everything when nothing is hidden', () => {
        const rows = [row('NEW', false), row('B2')];
        expect(HideUnreadableFieldRows(rows, [row('B2')], [])).toEqual([row('NEW', false)]);
        expect(HideUnreadableFieldRows(rows, [row('B2')], [row('B2')])).toEqual(rows);
    });
});

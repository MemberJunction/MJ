/**
 * EditSet: edits as values over one text, overlap refusal, ordering at one point, back-to-front
 * application and the span map.
 */
import { describe, it, expect } from 'vitest';
import { EditConflictError, EditSet } from '../../edit/editSet.js';
import { ParseClean, TopSelect } from './helpers.js';

const TEXT = 'SELECT a, b FROM t';
const span = (start: number, end: number) => ({ Start: start, End: end });

describe('EditSet', () => {
    it('replaces, removes and inserts by span', () => {
        const edits = EditSet.For(TEXT).Replace(span(7, 8), 'x').Remove(span(8, 11)).InsertAfter(span(18, 18), ' WHERE 1 = 1');
        expect(edits.Apply().Text).toBe('SELECT x FROM t WHERE 1 = 1');
    });

    it('edits by node, using the node\'s span', () => {
        const doc = ParseClean(TEXT);
        const core = TopSelect(doc);
        const text = doc.Edit().Replace(core.SelectList[1], 'c AS d').InsertBefore(core.From ?? span(0, 0), '/* src */ ').Apply().Text;
        expect(text).toBe('SELECT a, c AS d /* src */ FROM t');
    });

    it('is a value: adding an edit leaves the original set unchanged', () => {
        const empty = EditSet.For(TEXT);
        const one = empty.Replace(span(0, 6), 'select');
        expect([empty.IsEmpty, one.Edits.length, empty.Apply().Text]).toEqual([true, 1, TEXT]);
    });

    it('refuses overlapping replacements with a clear error', () => {
        const edits = EditSet.For(TEXT).Replace(span(7, 11), 'x');
        expect(() => edits.Replace(span(10, 12), 'y')).toThrow(EditConflictError);
        expect(() => edits.Replace(span(7, 11), 'y')).toThrow(/overlaps the edit at 7-11/);
        expect(() => edits.InsertBefore(span(9, 9), 'y')).toThrow(EditConflictError);
    });

    it('accepts adjacent edits and insertions at a replacement\'s edges', () => {
        const text = EditSet.For(TEXT).Replace(span(7, 8), 'x').Replace(span(8, 9), ';').InsertBefore(span(7, 7), '[').InsertAfter(span(8, 8), ']').Apply().Text;
        expect(text).toBe('SELECT [x]; b FROM t');
    });

    it('orders text inserted at one point: after the previous node, then before the next, in the order added', () => {
        const text = EditSet.For('AB').InsertBefore(span(1, 1), '2').InsertAfter(span(0, 1), '1').InsertBefore(span(1, 1), '3').Apply().Text;
        expect(text).toBe('A123B');
    });

    it('refuses a span outside the text', () => {
        expect(() => EditSet.For(TEXT).Replace(span(10, 99), 'x')).toThrow(/outside the text/);
        expect(() => EditSet.For(TEXT).Replace(span(5, 2), 'x')).toThrow(/outside the text/);
    });

    it('applies a batch of replacements and refuses overlaps within it or with earlier edits', () => {
        const base = EditSet.For('a a a a');
        expect(base.ReplaceAll([span(0, 1), span(2, 3), span(6, 7)], 'b').Apply().Text).toBe('b b a b');
        expect(() => base.ReplaceAll([span(0, 3), span(2, 4)], 'b')).toThrow(EditConflictError);
        expect(() => base.Replace(span(1, 5), 'x').ReplaceAll([span(2, 3)], 'b')).toThrow(EditConflictError);
        expect(() => base.InsertBefore(span(3, 3), '!').ReplaceAll([span(2, 5)], 'b')).toThrow(EditConflictError);
    });

    it('merges edit sets over the same text, and refuses one over another text', () => {
        const merged = EditSet.For(TEXT).Replace(span(7, 8), 'x').Merge(EditSet.For(TEXT).Replace(span(10, 11), 'y'));
        expect(merged.Apply().Text).toBe('SELECT x, y FROM t');
        expect(() => EditSet.For(TEXT).Merge(EditSet.For('other'))).toThrow(/different texts/);
    });

    it('maps original offsets and spans to the edited text', () => {
        const { Text, SpanMap } = EditSet.For(TEXT).Replace(span(7, 8), 'xyz').InsertBefore(span(12, 12), '\n').Apply();
        expect(Text).toBe('SELECT xyz, b \nFROM t');
        const from = SpanMap.MapSpan(span(12, 16));
        expect(Text.substring(from?.Start ?? 0, from?.End ?? 0)).toBe('FROM');
        expect(SpanMap.MapSpan(span(7, 8))).toEqual(span(7, 10));
        expect(SpanMap.MapOffset(12, 'End')).toBe(14);
        expect(SpanMap.MapOffset(12, 'Start')).toBe(15);
        expect(EditSet.For(TEXT).Replace(span(7, 11), 'q').Apply().SpanMap.MapOffset(9)).toBeNull();
    });
});

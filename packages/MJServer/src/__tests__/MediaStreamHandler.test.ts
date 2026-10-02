import { describe, it, expect } from 'vitest';
import { ParseRangeHeaderLoose, ParseRange } from '../rest/mediaRange.js';

/**
 * Tests for the pure HTTP-Range parsing helpers behind the authenticated `/media/:fileId`
 * stream route. They decide whether a request gets a 206 partial body (and over which byte
 * window) or a 200/416 — the load-bearing logic for native `<audio>`/`<video>` seeking. Both
 * helpers are deliberately strict: anything malformed/multi-range yields `undefined` so the
 * handler falls back to a full read (streaming path) or a 416 (buffer path).
 *
 *  - `parseRangeHeaderLoose` — streaming path, NO known total: open-ended `bytes=start-` leaves
 *    `end` undefined so the driver streams to EOF.
 *  - `parseRange` — buffer path WITH a known total: clamps `end` to the last byte and rejects
 *    unsatisfiable ranges (start past EOF) so the caller returns 416.
 */

describe('parseRangeHeaderLoose (streaming path — no known total)', () => {
    it('parses a closed range bytes=start-end into inclusive offsets', () => {
        expect(ParseRangeHeaderLoose('bytes=0-499')).toEqual({ start: 0, end: 499 });
        expect(ParseRangeHeaderLoose('bytes=200-1023')).toEqual({ start: 200, end: 1023 });
    });

    it('leaves end undefined for an open-ended range bytes=start- (stream to EOF)', () => {
        expect(ParseRangeHeaderLoose('bytes=500-')).toEqual({ start: 500 });
        expect(ParseRangeHeaderLoose('bytes=0-')).toEqual({ start: 0 });
    });

    it('tolerates surrounding whitespace', () => {
        expect(ParseRangeHeaderLoose('  bytes=10-20  ')).toEqual({ start: 10, end: 20 });
    });

    it('returns undefined when end < start (nonsensical range)', () => {
        expect(ParseRangeHeaderLoose('bytes=500-100')).toBeUndefined();
    });

    it('returns undefined for malformed / multi-range / suffix-only headers', () => {
        expect(ParseRangeHeaderLoose('bytes=abc-def')).toBeUndefined();
        expect(ParseRangeHeaderLoose('bytes=-500')).toBeUndefined(); // suffix range — left to a full read
        expect(ParseRangeHeaderLoose('bytes=0-100,200-300')).toBeUndefined(); // multi-range
        expect(ParseRangeHeaderLoose('items=0-100')).toBeUndefined(); // wrong unit
        expect(ParseRangeHeaderLoose('bytes=')).toBeUndefined();
        expect(ParseRangeHeaderLoose('')).toBeUndefined();
    });

    it('accepts a zero-length point range bytes=N-N', () => {
        expect(ParseRangeHeaderLoose('bytes=42-42')).toEqual({ start: 42, end: 42 });
    });
});

describe('parseRange (buffer path — known total)', () => {
    const TOTAL = 1000;

    it('parses a closed range within bounds', () => {
        expect(ParseRange('bytes=0-499', TOTAL)).toEqual({ start: 0, end: 499 });
    });

    it('clamps end to the last byte when the requested end exceeds total', () => {
        // bytes=500-99999 against a 1000-byte file → end clamps to 999.
        expect(ParseRange('bytes=500-99999', TOTAL)).toEqual({ start: 500, end: 999 });
    });

    it('resolves an open-ended range to the last byte', () => {
        expect(ParseRange('bytes=200-', TOTAL)).toEqual({ start: 200, end: 999 });
    });

    it('returns undefined when start is at or past EOF (unsatisfiable → 416)', () => {
        expect(ParseRange('bytes=1000-1100', TOTAL)).toBeUndefined(); // start === total
        expect(ParseRange('bytes=2000-', TOTAL)).toBeUndefined(); // start > total
    });

    it('returns undefined when end < start after parsing', () => {
        expect(ParseRange('bytes=600-100', TOTAL)).toBeUndefined();
    });

    it('returns undefined for malformed / multi-range / suffix-only headers', () => {
        expect(ParseRange('bytes=abc-', TOTAL)).toBeUndefined();
        expect(ParseRange('bytes=-200', TOTAL)).toBeUndefined();
        expect(ParseRange('bytes=0-100,200-300', TOTAL)).toBeUndefined();
        expect(ParseRange('items=0-100', TOTAL)).toBeUndefined();
        expect(ParseRange('', TOTAL)).toBeUndefined();
    });

    it('handles the very first byte and the very last byte exactly', () => {
        expect(ParseRange('bytes=0-0', TOTAL)).toEqual({ start: 0, end: 0 });
        expect(ParseRange('bytes=999-999', TOTAL)).toEqual({ start: 999, end: 999 });
    });

    it('tolerates surrounding whitespace', () => {
        expect(ParseRange('  bytes=10-20  ', TOTAL)).toEqual({ start: 10, end: 20 });
    });
});

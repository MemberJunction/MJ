import { describe, it, expect } from 'vitest';
import { normalizeTraceUrl, traceUrlMatches, UUID_TOKEN } from '../engine/trace-url.js';

const UUID_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const UUID_B = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('normalizeTraceUrl (CU-C1/C4)', () => {
    it('replaces path UUIDs with a stable token so per-record URLs key equal', () => {
        const a = normalizeTraceUrl(`http://localhost:4200/app/record/${UUID_A}`);
        const b = normalizeTraceUrl(`http://localhost:4200/app/record/${UUID_B}`);
        expect(a).toBe(b);
        expect(a).toBe(`http://localhost:4200/app/record/${UUID_TOKEN}`);
    });

    it('normalizes UUID casing to the same token regardless of source case', () => {
        const lower = normalizeTraceUrl(`http://x/r/${UUID_A.toLowerCase()}`);
        const upper = normalizeTraceUrl(`http://x/r/${UUID_A.toUpperCase()}`);
        expect(lower).toBe(upper);
    });

    it('drops the hash fragment', () => {
        expect(normalizeTraceUrl('http://x/app/home#section-2')).toBe('http://x/app/home');
    });

    it('sorts query params by name for order-independence', () => {
        const a = normalizeTraceUrl('http://x/p?b=2&a=1&c=3');
        const b = normalizeTraceUrl('http://x/p?c=3&a=1&b=2');
        expect(a).toBe(b);
        expect(a).toBe('http://x/p?a=1&b=2&c=3');
    });

    it('drops volatile query params (case-insensitive) but keeps the rest', () => {
        const out = normalizeTraceUrl('http://x/p?keep=1&_ts=999&Token=abc', ['_ts', 'token']);
        expect(out).toBe('http://x/p?keep=1');
    });

    it('replaces UUIDs inside query values too', () => {
        const out = normalizeTraceUrl(`http://x/p?id=${UUID_A}`);
        expect(out).toBe(`http://x/p?id=${UUID_TOKEN}`);
    });

    it('returns empty string for empty/whitespace input', () => {
        expect(normalizeTraceUrl('')).toBe('');
        expect(normalizeTraceUrl('   ')).toBe('');
    });

    it('normalizes UUIDs in an unparseable path-only string without throwing', () => {
        expect(normalizeTraceUrl(`/app/record/${UUID_A}`)).toBe(`/app/record/${UUID_TOKEN}`);
    });
});

describe('traceUrlMatches (CU-C2 guards)', () => {
    it('matches a path-fragment pattern against a full URL', () => {
        expect(traceUrlMatches('/app/data', 'http://localhost:4200/app/data/list?x=1')).toBe(true);
    });

    it('is UUID-insensitive on both sides', () => {
        expect(traceUrlMatches(
            `http://x/r/${UUID_A}`,
            `http://x/r/${UUID_B}`,
        )).toBe(true);
    });

    it('fails when the path does not contain the pattern', () => {
        expect(traceUrlMatches('/app/data', 'http://localhost:4200/app/home')).toBe(false);
    });

    it('an empty pattern matches anything (no constraint recorded)', () => {
        expect(traceUrlMatches('', 'http://x/whatever')).toBe(true);
    });

    it('honors volatile params when comparing', () => {
        expect(traceUrlMatches(
            'http://x/p?a=1',
            'http://x/p?a=1&_ts=12345',
            ['_ts'],
        )).toBe(true);
    });
});

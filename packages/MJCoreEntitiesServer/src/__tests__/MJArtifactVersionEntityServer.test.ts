import { describe, it, expect } from 'vitest';
import { CalculateContentSizeBytes } from '../custom/MJArtifactVersionEntityServer.server';

describe('CalculateContentSizeBytes', () => {
    it('returns 0 for empty string', () => {
        expect(CalculateContentSizeBytes('')).toBe(0);
    });

    it('returns character count for ASCII-only content', () => {
        expect(CalculateContentSizeBytes('hello')).toBe(5);
        expect(CalculateContentSizeBytes('{"a":1}')).toBe(7);
    });

    it('returns UTF-8 byte count (not character count) for multi-byte content', () => {
        // "é" is 2 bytes in UTF-8, 1 character — total: 6 bytes, 5 chars
        expect(CalculateContentSizeBytes('héllo')).toBe(6);
        expect('héllo'.length).toBe(5);
    });

    it('handles 4-byte UTF-8 sequences (emoji)', () => {
        // 🎉 is a 4-byte UTF-8 sequence
        expect(CalculateContentSizeBytes('🎉')).toBe(4);
    });

    it('matches byte length of a stringified JSON payload', () => {
        const snapshot = { title: 'Q1 Revenue', rows: [{ id: 1, value: 100 }] };
        const json = JSON.stringify(snapshot);
        expect(CalculateContentSizeBytes(json)).toBe(Buffer.byteLength(json, 'utf8'));
    });
});

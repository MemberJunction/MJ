import { describe, it, expect } from 'vitest';
import { structureArtifactData } from '../providers/serialize';

describe('structureArtifactData (get_full envelope unwrap)', () => {
    it('unwraps a get_full envelope and parses JSON-array content', () => {
        const envelope = { content: JSON.stringify([{ a: 1 }, { a: 2 }]), encoding: 'utf8', sizeBytes: 20 };
        expect(structureArtifactData(envelope)).toEqual([{ a: 1 }, { a: 2 }]);
    });
    it('unwraps a get_full envelope with plain text → raw string', () => {
        const envelope = { content: 'hello world', encoding: 'utf8', sizeBytes: 11 };
        expect(structureArtifactData(envelope)).toBe('hello world');
    });
    it('leaves base64 (binary) get_full content as-is', () => {
        const envelope = { content: 'aGVsbG8=', encoding: 'base64', sizeBytes: 8 };
        expect(structureArtifactData(envelope)).toBe('aGVsbG8=');
    });
    it('parses a bare JSON string (non-envelope tool output)', () => {
        expect(structureArtifactData('[1,2,3]')).toEqual([1, 2, 3]);
    });
    it('passes a structured non-envelope object through', () => {
        expect(structureArtifactData({ matches: [1, 2] })).toEqual({ matches: [1, 2] });
    });
});

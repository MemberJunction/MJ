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

describe('structureArtifactData (get_rows envelope unwrap)', () => {
    it('unwraps a {rows} tabular envelope to the bare rows array', () => {
        const envelope = { start: 0, count: 2, total: 2, rows: [{ ID: '1' }, { ID: '2' }] };
        expect(structureArtifactData(envelope)).toEqual([{ ID: '1' }, { ID: '2' }]);
    });
    it('unwraps regardless of the surrounding pagination keys (rows is the signal)', () => {
        const envelope = { rows: [{ x: 1 }], totalRows: 1, truncated: false };
        expect(structureArtifactData(envelope)).toEqual([{ x: 1 }]);
    });
    it('does not unwrap when rows is absent or not an array', () => {
        expect(structureArtifactData({ rows: 'nope', total: 1 })).toEqual({ rows: 'nope', total: 1 });
        expect(structureArtifactData({ data: [1, 2] })).toEqual({ data: [1, 2] });
    });
});

describe('conservative JSON coercion (coerceMaybeJson)', () => {
    it('parses strings that are unambiguously a JSON container', () => {
        expect(structureArtifactData('{"a":1}')).toEqual({ a: 1 });
        expect(structureArtifactData('  [1, 2, 3]  ')).toEqual([1, 2, 3]);
    });
    it('leaves prose with a leading bracket as a string (no matching close / not valid JSON)', () => {
        expect(structureArtifactData('[Note: see attached]')).toBe('[Note: see attached]');
        expect(structureArtifactData('{See attached}')).toBe('{See attached}');
        expect(structureArtifactData('[TODO')).toBe('[TODO');
    });
    it('does not coerce bare JSON scalars to non-strings', () => {
        expect(structureArtifactData('42')).toBe('42');
        expect(structureArtifactData('true')).toBe('true');
        expect(structureArtifactData('plain text')).toBe('plain text');
    });
});

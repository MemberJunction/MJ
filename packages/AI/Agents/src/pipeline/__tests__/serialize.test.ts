import { describe, it, expect } from 'vitest';
import { StructureArtifactData } from '../providers/serialize';

describe('structureArtifactData (get_full envelope unwrap)', () => {
    it('unwraps a get_full envelope and parses JSON-array content', () => {
        const envelope = { content: JSON.stringify([{ a: 1 }, { a: 2 }]), encoding: 'utf8', sizeBytes: 20 };
        expect(StructureArtifactData(envelope)).toEqual([{ a: 1 }, { a: 2 }]);
    });
    it('unwraps a get_full envelope with plain text → raw string', () => {
        const envelope = { content: 'hello world', encoding: 'utf8', sizeBytes: 11 };
        expect(StructureArtifactData(envelope)).toBe('hello world');
    });
    it('leaves base64 (binary) get_full content as-is', () => {
        const envelope = { content: 'aGVsbG8=', encoding: 'base64', sizeBytes: 8 };
        expect(StructureArtifactData(envelope)).toBe('aGVsbG8=');
    });
    it('parses a bare JSON string (non-envelope tool output)', () => {
        expect(StructureArtifactData('[1,2,3]')).toEqual([1, 2, 3]);
    });
    it('passes a structured non-envelope object through', () => {
        expect(StructureArtifactData({ matches: [1, 2] })).toEqual({ matches: [1, 2] });
    });
});

describe('structureArtifactData (get_rows envelope unwrap)', () => {
    it('unwraps a {rows} tabular envelope to the bare rows array', () => {
        const envelope = { start: 0, count: 2, total: 2, rows: [{ ID: '1' }, { ID: '2' }] };
        expect(StructureArtifactData(envelope)).toEqual([{ ID: '1' }, { ID: '2' }]);
    });
    it('unwraps regardless of the surrounding pagination keys (rows is the signal)', () => {
        const envelope = { rows: [{ x: 1 }], totalRows: 1, truncated: false };
        expect(StructureArtifactData(envelope)).toEqual([{ x: 1 }]);
    });
    it('does not unwrap when rows is absent or not an array', () => {
        expect(StructureArtifactData({ rows: 'nope', total: 1 })).toEqual({ rows: 'nope', total: 1 });
        expect(StructureArtifactData({ data: [1, 2] })).toEqual({ data: [1, 2] });
    });
});

describe('conservative JSON coercion (coerceMaybeJson)', () => {
    it('parses strings that are unambiguously a JSON container', () => {
        expect(StructureArtifactData('{"a":1}')).toEqual({ a: 1 });
        expect(StructureArtifactData('  [1, 2, 3]  ')).toEqual([1, 2, 3]);
    });
    it('leaves prose with a leading bracket as a string (no matching close / not valid JSON)', () => {
        expect(StructureArtifactData('[Note: see attached]')).toBe('[Note: see attached]');
        expect(StructureArtifactData('{See attached}')).toBe('{See attached}');
        expect(StructureArtifactData('[TODO')).toBe('[TODO');
    });
    it('does not coerce bare JSON scalars to non-strings', () => {
        expect(StructureArtifactData('42')).toBe('42');
        expect(StructureArtifactData('true')).toBe('true');
        expect(StructureArtifactData('plain text')).toBe('plain text');
    });
});

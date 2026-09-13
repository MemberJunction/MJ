/**
 * ParseFileOutputRef — the shape an action's FileOutput must have, and the optional `visibility` an
 * action uses to say "this file is a download, not an artifact to browse" (`System Only`).
 */
import { describe, it, expect } from 'vitest';
import { ParseFileOutputRef } from '../agent-types';

describe('ParseFileOutputRef', () => {
    const base = { fileName: 'exam.csv', mimeType: 'text/csv', fileData: 'QUJD', sizeBytes: 3 };

    it('parses an object or its JSON string; needs fileName, mimeType and one of fileData / fileId', () => {
        expect(ParseFileOutputRef(base)?.fileName).toBe('exam.csv');
        expect(ParseFileOutputRef(JSON.stringify({ ...base, fileData: undefined, fileId: 'f-1' }))?.fileId).toBe('f-1');
        expect(ParseFileOutputRef({ fileName: 'x', mimeType: 'text/plain' })).toBeNull();
        expect(ParseFileOutputRef('not json')).toBeNull();
    });

    it('carries `visibility` when it is one of the two allowed values, and leaves it unset otherwise', () => {
        expect(ParseFileOutputRef({ ...base, visibility: 'System Only' })?.visibility).toBe('System Only');
        expect(ParseFileOutputRef({ ...base, visibility: 'Always' })?.visibility).toBe('Always');
        expect(ParseFileOutputRef(base)?.visibility).toBeUndefined();
        expect(ParseFileOutputRef({ ...base, visibility: 'Hidden' })?.visibility).toBeUndefined();
    });
});

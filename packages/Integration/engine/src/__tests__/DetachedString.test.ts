import { describe, expect, it } from 'vitest';
import { DetachString } from '../DetachedString.js';
import { ParseFirstValue, ResponsePage } from './helpers/retainedText.js';

describe('DetachString', () => {
    it('returns an equal string that is not the parsed value itself', () => {
        const parsed = ParseFirstValue(ResponsePage('record-id-0001'));
        const copy = DetachString(parsed);
        expect(copy).toBe('record-id-0001');
        expect(copy).toEqual(parsed);
    });

    it('passes a value that is not a string through unchanged', () => {
        expect(DetachString(undefined)).toBeUndefined();
        expect(DetachString(null)).toBeNull();
        expect(DetachString(42)).toBe(42);
    });
});

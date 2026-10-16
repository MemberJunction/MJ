import { describe, it, expect } from 'vitest';
import { ResolveMJAPIURL } from '../generic/mjapiUrl';

describe('ResolveMJAPIURL', () => {
    it('uses the configured MJAPI URL as given, minus trailing slashes', () => {
        expect(ResolveMJAPIURL('https://host/api/')).toBe('https://host/api');
        expect(ResolveMJAPIURL('http://localhost:4000')).toBe('http://localhost:4000');
        expect(ResolveMJAPIURL(' https://host/api/v2/ ')).toBe('https://host/api/v2');
    });

    it('returns undefined when nothing is configured, so callers keep their legacy behaviour', () => {
        expect(ResolveMJAPIURL(undefined)).toBeUndefined();
        expect(ResolveMJAPIURL(null)).toBeUndefined();
        expect(ResolveMJAPIURL('  ')).toBeUndefined();
    });

    it('trims a long run of slashes linearly (no polynomial regex)', () => {
        expect(ResolveMJAPIURL(`https://host/api${'/'.repeat(100_000)}`)).toBe('https://host/api');
    });
});

import { describe, expect, it } from 'vitest';
import {
    ResolveCurrentVersionKeyName,
    ResolveHistoricalVersionKeyName
} from '../providers/version-suffixed-key-names';

describe('ResolveCurrentVersionKeyName', () => {
    it('uses the bare name for version 1 or no version', () => {
        expect(ResolveCurrentVersionKeyName('MJ_KEY', undefined, '_V')).toBe('MJ_KEY');
        expect(ResolveCurrentVersionKeyName('MJ_KEY', '1', '_V')).toBe('MJ_KEY');
    });

    it('appends the suffix for later versions of an unsuffixed name', () => {
        expect(ResolveCurrentVersionKeyName('MJ_KEY', '2', '_V')).toBe('MJ_KEY_V2');
        expect(ResolveCurrentVersionKeyName('pii_key', '3', '_v')).toBe('pii_key_v3');
    });

    it('uses a name that already names the version as-is, which is how rotation leaves a key', () => {
        expect(ResolveCurrentVersionKeyName('MJ_KEY_V2', '2', '_V')).toBe('MJ_KEY_V2');
        expect(ResolveCurrentVersionKeyName('pii_key_v3', '3', '_v')).toBe('pii_key_v3');
    });

    it('never redirects a suffixed name configured at a different version to a sibling', () => {
        // A key whose variable happens to be named MJ_KEY_V2 but is still at version 1 must keep
        // reading MJ_KEY_V2, even when an unrelated MJ_KEY exists.
        expect(ResolveCurrentVersionKeyName('MJ_KEY_V2', '1', '_V')).toBe('MJ_KEY_V2');
        expect(ResolveCurrentVersionKeyName('MJ_KEY_V2', '3', '_V')).toBe('MJ_KEY_V2_V3');
    });
});

describe('ResolveHistoricalVersionKeyName', () => {
    const exists = (names: string[]) => (name: string) => names.includes(name);

    it('derives an older version from the current name\'s suffix', () => {
        expect(ResolveHistoricalVersionKeyName('MJ_KEY_V3', '2', exists([]))).toBe('MJ_KEY_V2');
        expect(ResolveHistoricalVersionKeyName('pii_key_v3', '2', exists([]))).toBe('pii_key_v2');
    });

    it('resolves version 1 to the bare name, or to an explicit _V1 only when the bare name is absent', () => {
        expect(ResolveHistoricalVersionKeyName('MJ_KEY_V2', '1', exists(['MJ_KEY', 'MJ_KEY_V1']))).toBe('MJ_KEY');
        expect(ResolveHistoricalVersionKeyName('MJ_KEY_V2', '1', exists(['MJ_KEY_V1']))).toBe('MJ_KEY_V1');
        expect(ResolveHistoricalVersionKeyName('MJ_KEY_V2', '1', exists([]))).toBe('MJ_KEY');
    });

    it('returns null when the current name carries no suffix, so the caller falls back', () => {
        expect(ResolveHistoricalVersionKeyName('MJ_KEY', '1', exists(['MJ_KEY']))).toBeNull();
    });

    it('returns null for a version that is not a plain number', () => {
        expect(ResolveHistoricalVersionKeyName('MJ_KEY_V2', 'abc', exists([]))).toBeNull();
        expect(ResolveHistoricalVersionKeyName('MJ_KEY_V2', '1_EVIL', exists([]))).toBeNull();
    });
});

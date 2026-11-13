import { describe, it, expect } from 'vitest';
import {
    LowestActiveById,
    NormalizePrincipalValue,
    ResolveServerPrincipalFrom,
    type ServerPrincipalCandidate,
} from '../serverPrincipal.js';

const SYSTEM_USER_ID = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';

/** Seeded rows: `Type` is NCHAR(15), so values arrive space-padded. */
const SYSTEM: ServerPrincipalCandidate = { ID: SYSTEM_USER_ID, Type: 'Owner          ', IsActive: true };
const ANONYMOUS: ServerPrincipalCandidate = { ID: '273910DF-28F1-45C1-A8F8-6E9AD8E5F008', Type: 'User           ', IsActive: true };
const OWNER_B: ServerPrincipalCandidate = { ID: 'BBBB0000-0000-0000-0000-000000000001', Type: 'Owner          ', IsActive: true };
const OWNER_A: ServerPrincipalCandidate = { ID: 'AAAA0000-0000-0000-0000-000000000001', Type: 'Owner          ', IsActive: true };
const INACTIVE_OWNER: ServerPrincipalCandidate = { ID: '00000000-0000-0000-0000-000000000009', Type: 'Owner          ', IsActive: false };

describe('ResolveServerPrincipalFrom', () => {
    it('returns the active system user first, whatever its position in the cache', () => {
        const result = ResolveServerPrincipalFrom([ANONYMOUS, OWNER_A, SYSTEM], SYSTEM_USER_ID.toLowerCase());
        expect(result).toEqual({ User: SYSTEM, Reason: 'system' });
    });

    it('matches a space-padded Owner Type when the system user is missing', () => {
        const result = ResolveServerPrincipalFrom([ANONYMOUS, OWNER_B], SYSTEM_USER_ID);
        expect(result).toEqual({ User: OWNER_B, Reason: 'owner' });
    });

    it('picks the lowest-ID active Owner, not the first one in the cache', () => {
        const result = ResolveServerPrincipalFrom([OWNER_B, INACTIVE_OWNER, OWNER_A], SYSTEM_USER_ID);
        expect(result.User).toBe(OWNER_A);
    });

    it('skips an inactive system user', () => {
        const result = ResolveServerPrincipalFrom([{ ...SYSTEM, IsActive: false }, OWNER_B], SYSTEM_USER_ID);
        expect(result.User).toBe(OWNER_B);
    });

    it('returns null rather than an arbitrary user when there is no system user and no active Owner', () => {
        const result = ResolveServerPrincipalFrom([ANONYMOUS, INACTIVE_OWNER], SYSTEM_USER_ID);
        expect(result).toEqual({ User: null, Reason: 'none' });
    });
});

describe('LowestActiveById / NormalizePrincipalValue', () => {
    it('ignores inactive rows and compares IDs case-insensitively', () => {
        const lower = { ...OWNER_A, ID: OWNER_A.ID.toLowerCase() };
        expect(LowestActiveById([OWNER_B, INACTIVE_OWNER, lower])).toBe(lower);
        expect(LowestActiveById([INACTIVE_OWNER])).toBeUndefined();
    });

    it('trims padding and lowercases', () => {
        expect(NormalizePrincipalValue('Owner          ')).toBe('owner');
        expect(NormalizePrincipalValue(undefined)).toBe('');
    });
});

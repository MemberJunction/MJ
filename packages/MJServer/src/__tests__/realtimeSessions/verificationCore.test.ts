import { describe, it, expect, vi } from 'vitest';

// Wrap crypto.timingSafeEqual in a spy (keeping its behaviour) so the constant-time requirement is asserted, not assumed.
vi.mock('node:crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:crypto')>();
    return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

import { timingSafeEqual } from 'node:crypto';
import {
    ComputeVerifiedDeadline,
    EmptyIdentityVerificationState,
    EvaluateRedemption,
    GenerateVerificationCode,
    GenerateVerificationToken,
    HashVerificationCode,
    HashVerificationToken,
    HashesEqual,
    IssueVerification,
    NormalizeVerificationCode,
    ParseVerificationToken,
    ReadIdentityVerificationState,
    SanitizeVerificationName,
    VERIFICATION_CODE_LENGTH,
    VERIFICATION_TOKEN_PREFIX,
    WriteIdentityVerificationState,
    type IdentityVerificationState,
} from '../../realtimeSessions/verificationCore.js';
import { ReadIdentityVerificationPolicyLayer } from '../../realtimeSessions/verificationPolicy.js';

const SESSION_ID = 'A1B2C3D4-0000-4000-8000-00000000A001';
const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const POLICY = { maxCodeAttempts: 3 };

const KEY = 'unit-test-code-hash-key-0123456789';

function issue(overrides: Partial<Parameters<typeof IssueVerification>[0]> = {}) {
    return IssueVerification({ AgentSessionID: SESSION_ID, Email: 'pat@example.com', Name: 'Pat', TtlMinutes: 30, NowMs: NOW, CodeHashKey: KEY, ...overrides });
}

function pendingState(issued = issue()): IdentityVerificationState {
    return { SendCount: 1, Pending: issued.Pending };
}

describe('GenerateVerificationToken / ParseVerificationToken', () => {
    it('embeds the session id and 256 bits of randomness', () => {
        const token = GenerateVerificationToken(SESSION_ID);
        expect(token).toMatch(new RegExp(`^${VERIFICATION_TOKEN_PREFIX}[0-9a-f]{32}_[0-9a-f]{64}$`));
        expect(ParseVerificationToken(token)).toEqual({ AgentSessionID: SESSION_ID.toLowerCase() });
    });

    it('produces unique tokens', () => {
        expect(new Set(Array.from({ length: 200 }, () => GenerateVerificationToken(SESSION_ID))).size).toBe(200);
    });

    it('rejects a non-UUID session id at generation (a programming error)', () => {
        expect(() => GenerateVerificationToken('not-a-uuid')).toThrow();
    });

    it.each([
        ['empty', ''],
        ['wrong prefix', 'mj_ml_' + 'a'.repeat(32) + '_' + 'b'.repeat(64)],
        ['short randomness', `${VERIFICATION_TOKEN_PREFIX}${'a'.repeat(32)}_${'b'.repeat(63)}`],
        ['uppercase hex', `${VERIFICATION_TOKEN_PREFIX}${'A'.repeat(32)}_${'b'.repeat(64)}`],
        ['trailing junk', `${VERIFICATION_TOKEN_PREFIX}${'a'.repeat(32)}_${'b'.repeat(64)}x`],
        ['missing separator', `${VERIFICATION_TOKEN_PREFIX}${'a'.repeat(96)}`],
    ])('rejects a malformed token (%s)', (_label, token) => {
        expect(ParseVerificationToken(token)).toBeNull();
    });

    it('rejects non-string input', () => {
        expect(ParseVerificationToken(undefined as unknown as string)).toBeNull();
    });
});

describe('verification code', () => {
    it('is always exactly the configured number of digits, including leading zeros', () => {
        for (let i = 0; i < 500; i++) {
            expect(GenerateVerificationCode()).toMatch(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`));
        }
    });

    it('normalises spaces and dashes and rejects everything else', () => {
        expect(NormalizeVerificationCode('123 456')).toBe('123456');
        expect(NormalizeVerificationCode(' 123-456 ')).toBe('123456');
        expect(NormalizeVerificationCode('12345')).toBeNull();
        expect(NormalizeVerificationCode('1234567')).toBeNull();
        expect(NormalizeVerificationCode('12345a')).toBeNull();
        expect(NormalizeVerificationCode('')).toBeNull();
    });
});

describe('hashing', () => {
    it('hashes tokens deterministically into base64url and never equals the token', () => {
        const token = GenerateVerificationToken(SESSION_ID);
        expect(HashVerificationToken(token)).toBe(HashVerificationToken(token));
        expect(HashVerificationToken(token)).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(HashVerificationToken(token)).not.toBe(token);
    });

    it('salts and session-binds code hashes', () => {
        const a = HashVerificationCode('123456', 'salt-a', SESSION_ID, KEY);
        expect(a).toBe(HashVerificationCode('123456', 'salt-a', SESSION_ID, KEY));
        expect(a).not.toBe(HashVerificationCode('123456', 'salt-b', SESSION_ID, KEY));
        expect(a).not.toBe(HashVerificationCode('123456', 'salt-a', 'A1B2C3D4-0000-4000-8000-00000000A002', KEY));
        expect(a).not.toBe(HashVerificationCode('654321', 'salt-a', SESSION_ID, KEY));
    });

    it('keys the code hash: without the server key the stored value cannot be reversed by enumeration', () => {
        const stored = HashVerificationCode('123456', 'salt', SESSION_ID, KEY);
        // What a session owner who can read Config (salt + hash) could try: every code under a different key.
        expect(HashVerificationCode('123456', 'salt', SESSION_ID, 'some-other-key-0123456789abcdef')).not.toBe(stored);
        const recovered = Array.from({ length: 1000 }, (_, i) => String(i).padStart(6, '0')).filter(
            (guess) => HashVerificationCode(guess, 'salt', SESSION_ID, 'attacker-guess-key-0123456789ab') === stored,
        );
        expect(recovered).toEqual([]);
    });

    it('refuses to hash without a key (fail closed, never an unkeyed hash)', () => {
        expect(() => HashVerificationCode('123456', 'salt', SESSION_ID, '')).toThrow(/key/i);
    });

    it('a code issued under one key is not redeemable under another', () => {
        const issued = issue();
        const credential = { Kind: 'code' as const, Code: issued.Code, AgentSessionID: SESSION_ID };
        const other = EvaluateRedemption(pendingState(issued), credential, NOW, POLICY, 'rotated-key-0123456789abcdefgh');
        expect(other.Outcome).toBe('rejected');
    });

    it('treats the session id case-insensitively when binding a code', () => {
        expect(HashVerificationCode('123456', 's', SESSION_ID, KEY)).toBe(HashVerificationCode('123456', 's', SESSION_ID.toLowerCase(), KEY));
    });
});

describe('HashesEqual', () => {
    it('is true for equal and false for unequal hashes, including different lengths', () => {
        expect(HashesEqual('abc', 'abc')).toBe(true);
        expect(HashesEqual('abc', 'abd')).toBe(false);
        expect(HashesEqual('abc', 'abcd')).toBe(false);
        expect(HashesEqual('', '')).toBe(true);
    });

    it('compares through crypto.timingSafeEqual on fixed-length digests (constant time)', () => {
        vi.mocked(timingSafeEqual).mockClear();
        HashesEqual('short', 'a-much-longer-value-than-the-other');
        expect(timingSafeEqual).toHaveBeenCalledTimes(1);
        const [a, b] = vi.mocked(timingSafeEqual).mock.calls[0] as [Buffer, Buffer];
        expect(a.length).toBe(32);
        expect(b.length).toBe(32);
    });
});

describe('SanitizeVerificationName', () => {
    it('collapses whitespace and trims', () => {
        expect(SanitizeVerificationName('  Pat   Smith ')).toBe('Pat Smith');
    });

    it('strips control characters and markup characters', () => {
        expect(SanitizeVerificationName('Pat\u0000 <b>"Smith"</b>\r\nBcc: x')).toBe('Pat b Smith /b Bcc: x');
    });

    it('caps the length', () => {
        expect(SanitizeVerificationName('x'.repeat(500))).toHaveLength(100);
    });

    it('returns null when nothing usable is left', () => {
        expect(SanitizeVerificationName('   ')).toBeNull();
        expect(SanitizeVerificationName('<>"')).toBeNull();
        expect(SanitizeVerificationName(undefined as unknown as string)).toBeNull();
    });
});

describe('IssueVerification', () => {
    it('stores hashes only — neither the token nor the code appear in the pending state', () => {
        const issued = issue();
        const serialized = JSON.stringify(issued.Pending);
        expect(serialized).not.toContain(issued.Token);
        expect(serialized).not.toContain(issued.Code);
        expect(issued.Pending.TokenHash).toBe(HashVerificationToken(issued.Token));
        expect(issued.Pending.CodeHash).toBe(HashVerificationCode(issued.Code, issued.Pending.CodeSalt, SESSION_ID, KEY));
    });

    it('sets the expiry from the TTL and starts with zero attempts', () => {
        const { Pending } = issue({ TtlMinutes: 15 });
        expect(Pending.RequestedAt).toBe('2026-10-02T12:00:00.000Z');
        expect(Pending.ExpiresAt).toBe('2026-10-02T12:15:00.000Z');
        expect(Pending.CodeAttempts).toBe(0);
    });

    it('uses a fresh salt each time', () => {
        expect(issue().Pending.CodeSalt).not.toBe(issue().Pending.CodeSalt);
    });
});

describe('EvaluateRedemption — link token', () => {
    it('verifies with the right token, records the identity and clears the pending verification', () => {
        const issued = issue();
        const result = EvaluateRedemption(pendingState(issued), { Kind: 'token', Token: issued.Token }, NOW + 1000, POLICY, KEY);
        expect(result.Outcome).toBe('verified');
        if (result.Outcome !== 'verified') return;
        expect(result.Verified).toEqual({ Email: 'pat@example.com', Name: 'Pat', VerifiedAt: '2026-10-02T12:00:01.000Z', Method: 'link' });
        expect(result.Next.Pending).toBeUndefined();
        expect(result.Next.Verified).toEqual(result.Verified);
        expect(result.Next.SendCount).toBe(1);
    });

    it('is single-use: after success the same token no longer redeems', () => {
        const issued = issue();
        const first = EvaluateRedemption(pendingState(issued), { Kind: 'token', Token: issued.Token }, NOW, POLICY, KEY);
        if (first.Outcome !== 'verified') throw new Error('expected verified');
        const second = EvaluateRedemption(first.Next, { Kind: 'token', Token: issued.Token }, NOW + 1, POLICY, KEY);
        expect(second).toMatchObject({ Outcome: 'rejected', Reason: 'already_verified' });
    });

    it('rejects a wrong token without changing state (a stranger cannot burn a pending link)', () => {
        const state = pendingState();
        const result = EvaluateRedemption(state, { Kind: 'token', Token: GenerateVerificationToken(SESSION_ID) }, NOW, POLICY, KEY);
        expect(result).toMatchObject({ Outcome: 'rejected', Reason: 'invalid' });
        expect(result.Next).toBe(state);
        expect(result.Next.Pending?.CodeAttempts).toBe(0);
    });

    it('rejects an expired token and clears the stale pending verification', () => {
        const issued = issue({ TtlMinutes: 5 });
        const result = EvaluateRedemption(pendingState(issued), { Kind: 'token', Token: issued.Token }, NOW + 5 * 60_000, POLICY, KEY);
        expect(result).toMatchObject({ Outcome: 'rejected', Reason: 'expired' });
        expect(result.Next.Pending).toBeUndefined();
    });

    it('is still valid the instant before expiry', () => {
        const issued = issue({ TtlMinutes: 5 });
        expect(EvaluateRedemption(pendingState(issued), { Kind: 'token', Token: issued.Token }, NOW + 5 * 60_000 - 1, POLICY, KEY).Outcome).toBe('verified');
    });

    it('treats an unparseable expiry as expired (fail closed)', () => {
        const issued = issue();
        const state: IdentityVerificationState = { SendCount: 1, Pending: { ...issued.Pending, ExpiresAt: 'garbage' } };
        expect(EvaluateRedemption(state, { Kind: 'token', Token: issued.Token }, NOW, POLICY, KEY)).toMatchObject({ Outcome: 'rejected', Reason: 'expired' });
    });

    it('rejects when nothing is pending', () => {
        expect(EvaluateRedemption(EmptyIdentityVerificationState(), { Kind: 'token', Token: 'x' }, NOW, POLICY, KEY)).toMatchObject({ Outcome: 'rejected', Reason: 'no_pending' });
    });
});

describe('EvaluateRedemption — typed code', () => {
    const codeCredential = (code: string) => ({ Kind: 'code' as const, Code: code, AgentSessionID: SESSION_ID });

    it('verifies with the right code', () => {
        const issued = issue();
        const result = EvaluateRedemption(pendingState(issued), codeCredential(issued.Code), NOW, POLICY, KEY);
        expect(result.Outcome).toBe('verified');
        if (result.Outcome === 'verified') {
            expect(result.Verified.Method).toBe('code');
        }
    });

    it('counts wrong codes and reports the attempts left', () => {
        const issued = issue();
        const wrong = issued.Code === '000000' ? '111111' : '000000';
        const first = EvaluateRedemption(pendingState(issued), codeCredential(wrong), NOW, POLICY, KEY);
        expect(first).toMatchObject({ Outcome: 'rejected', Reason: 'invalid', AttemptsRemaining: 2 });
        expect(first.Next.Pending?.CodeAttempts).toBe(1);
        const second = EvaluateRedemption(first.Next, codeCredential(wrong), NOW, POLICY, KEY);
        expect(second).toMatchObject({ Reason: 'invalid', AttemptsRemaining: 1 });
    });

    it('voids the pending verification at the attempt cap — even for the right code afterwards', () => {
        const issued = issue();
        const wrong = issued.Code === '000000' ? '111111' : '000000';
        let state = pendingState(issued);
        for (let i = 0; i < 2; i++) {
            state = EvaluateRedemption(state, codeCredential(wrong), NOW, POLICY, KEY).Next;
        }
        const last = EvaluateRedemption(state, codeCredential(wrong), NOW, POLICY, KEY);
        expect(last).toMatchObject({ Outcome: 'rejected', Reason: 'attempts_exhausted', AttemptsRemaining: 0 });
        expect(last.Next.Pending).toBeUndefined();
        expect(EvaluateRedemption(last.Next, codeCredential(issued.Code), NOW, POLICY, KEY)).toMatchObject({ Reason: 'no_pending' });
    });

    it('does not accept a code issued for a different session', () => {
        const issued = issue();
        const result = EvaluateRedemption(pendingState(issued), { Kind: 'code', Code: issued.Code, AgentSessionID: 'A1B2C3D4-0000-4000-8000-00000000A002' }, NOW, POLICY, KEY);
        expect(result).toMatchObject({ Outcome: 'rejected', Reason: 'invalid' });
    });

    it('is single-use and expires like the link', () => {
        const issued = issue({ TtlMinutes: 1 });
        expect(EvaluateRedemption(pendingState(issued), codeCredential(issued.Code), NOW + 60_000, POLICY, KEY)).toMatchObject({ Reason: 'expired' });
        const ok = EvaluateRedemption(pendingState(issued), codeCredential(issued.Code), NOW, POLICY, KEY);
        if (ok.Outcome !== 'verified') throw new Error('expected verified');
        expect(EvaluateRedemption(ok.Next, codeCredential(issued.Code), NOW, POLICY, KEY)).toMatchObject({ Reason: 'already_verified' });
    });

    it('lets a successful link redemption invalidate the code too (one pending verification, two secrets)', () => {
        const issued = issue();
        const viaLink = EvaluateRedemption(pendingState(issued), { Kind: 'token', Token: issued.Token }, NOW, POLICY, KEY);
        if (viaLink.Outcome !== 'verified') throw new Error('expected verified');
        expect(viaLink.Next.Pending).toBeUndefined();
    });
});

describe('state persistence', () => {
    it('round-trips through the Config JSON, preserving every other key', () => {
        const issued = issue();
        const state: IdentityVerificationState = { Policy: { requireBusinessDomain: true }, SendCount: 2, Pending: issued.Pending };
        const raw = WriteIdentityVerificationState('{"targetAgentID":"t","maxSessionDeadlineIso":"2026-10-02T13:00:00.000Z"}', state);
        expect(JSON.parse(raw)).toMatchObject({ targetAgentID: 't', maxSessionDeadlineIso: '2026-10-02T13:00:00.000Z' });
        expect(ReadIdentityVerificationState(raw, ReadIdentityVerificationPolicyLayer)).toEqual(state);
    });

    it('writes a new deadline only when asked', () => {
        const base = '{"maxSessionDeadlineIso":"2026-10-02T13:00:00.000Z"}';
        expect(JSON.parse(WriteIdentityVerificationState(base, EmptyIdentityVerificationState())).maxSessionDeadlineIso).toBe('2026-10-02T13:00:00.000Z');
        expect(JSON.parse(WriteIdentityVerificationState(base, EmptyIdentityVerificationState(), '2026-10-02T14:00:00.000Z')).maxSessionDeadlineIso).toBe('2026-10-02T14:00:00.000Z');
    });

    it('reads garbage and partial values as an empty/partial state, never throwing', () => {
        const read = (raw: string | null) => ReadIdentityVerificationState(raw, ReadIdentityVerificationPolicyLayer);
        expect(read(null)).toEqual(EmptyIdentityVerificationState());
        expect(read('{not json')).toEqual(EmptyIdentityVerificationState());
        expect(read('{"identityVerification":"x"}')).toEqual(EmptyIdentityVerificationState());
        expect(read('{"identityVerification":{"SendCount":"many","Pending":{"TokenHash":"x"},"Verified":{"Email":"a@b.c","Method":"sms"}}}')).toEqual({ SendCount: 0 });
        expect(read('{"identityVerification":{"SendCount":-4}}')).toEqual({ SendCount: 0 });
    });
});

describe('ComputeVerifiedDeadline', () => {
    const start = NOW;

    it('extends an existing deadline out to start + verifiedMaxSeconds', () => {
        expect(
            ComputeVerifiedDeadline({ CurrentDeadlineIso: '2026-10-02T12:05:00.000Z', SessionStartedAtMs: start, VerifiedMaxSeconds: 1800 }),
        ).toBe('2026-10-02T12:30:00.000Z');
    });

    it('never pulls a deadline in', () => {
        expect(
            ComputeVerifiedDeadline({ CurrentDeadlineIso: '2026-10-02T13:00:00.000Z', SessionStartedAtMs: start, VerifiedMaxSeconds: 1800 }),
        ).toBeUndefined();
    });

    it('leaves an uncapped session uncapped', () => {
        expect(ComputeVerifiedDeadline({ CurrentDeadlineIso: undefined, SessionStartedAtMs: start, VerifiedMaxSeconds: 1800 })).toBeUndefined();
    });

    it('does nothing without a verified cap', () => {
        expect(ComputeVerifiedDeadline({ CurrentDeadlineIso: '2026-10-02T12:05:00.000Z', SessionStartedAtMs: start, VerifiedMaxSeconds: undefined })).toBeUndefined();
        expect(ComputeVerifiedDeadline({ CurrentDeadlineIso: '2026-10-02T12:05:00.000Z', SessionStartedAtMs: start, VerifiedMaxSeconds: 0 })).toBeUndefined();
    });

    it('does nothing when the current deadline is unparseable', () => {
        expect(ComputeVerifiedDeadline({ CurrentDeadlineIso: 'garbage', SessionStartedAtMs: start, VerifiedMaxSeconds: 1800 })).toBeUndefined();
    });
});

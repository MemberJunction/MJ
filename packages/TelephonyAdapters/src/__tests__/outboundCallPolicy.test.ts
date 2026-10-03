import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

import { LogError } from '@memberjunction/core';
import {
    AuthorizeOutboundCall,
    CheckTransferDestination,
    IsValidE164,
    MaskNumber,
    OutboundCallRefusedError,
    OutboundRateLimiter,
    ResolveOutboundPolicy,
    type OutboundCallRequest,
    type OutboundGuardDeps,
} from '../telephony/outboundCallPolicy.js';

const USER = { ID: 'AAAAAAAA-0000-0000-0000-000000000001' } as unknown as UserInfo;
const CARRIER = 'BBBBBBBB-0000-0000-0000-000000000002';

function request(overrides: Partial<OutboundCallRequest> = {}): OutboundCallRequest {
    return {
        User: USER,
        AgentIdentity: { ID: 'ident-1', AgentID: 'agent-1', ProviderID: CARRIER.toLowerCase(), IsActive: true },
        CarrierProviderID: CARRIER,
        ToNumber: '+14155550123',
        ...overrides,
    };
}

function deps(overrides: Partial<OutboundGuardDeps> = {}): OutboundGuardDeps {
    const policy = ResolveOutboundPolicy();
    return {
        Policy: policy,
        Limiter: new OutboundRateLimiter(policy.MaxCallsPerUserPerHour),
        CanRunAgent: async () => true,
        ...overrides,
    };
}

describe('IsValidE164', () => {
    it.each(['+14155550123', '+442071838750', '+61412345678'])('accepts %s', (n) => expect(IsValidE164(n)).toBe(true));
    it.each(['4155550123', '+0123456789', '+1 415 555 0123', '+1415-555-0123', '+1', '+1234567890123456', '', 'tel:+14155550123', "+1415555012'; DROP"])('rejects %j', (n) =>
        expect(IsValidE164(n)).toBe(false),
    );
});

describe('MaskNumber', () => {
    it('keeps only the last four characters', () => {
        expect(MaskNumber('+14155550123')).toBe('********0123');
    });

    it('masks everything when there are four or fewer characters', () => {
        expect(MaskNumber('1234')).toBe('****');
        expect(MaskNumber('12')).toBe('**');
    });

    it('tolerates empty input', () => {
        expect(MaskNumber('')).toBe('');
    });
});

describe('ResolveOutboundPolicy', () => {
    beforeEach(() => vi.mocked(LogError).mockClear());

    it('defaults to NANP-only with premium and Caribbean toll-fraud ranges blocked, 20 calls/hour', () => {
        const policy = ResolveOutboundPolicy();
        expect(policy.AllowedPrefixes).toEqual(['+1']);
        expect(policy.MaxCallsPerUserPerHour).toBe(20);
        expect(policy.BlockedPrefixes).toEqual(expect.arrayContaining(['+1900', '+1976', '+1876', '+1658', '+1809', '+1829', '+1849', '+1242', '+1869']));
        expect(policy.BlockedPrefixes).toHaveLength(23);
    });

    it('does NOT block US territories, which bill as domestic', () => {
        const { BlockedPrefixes } = ResolveOutboundPolicy();
        for (const territory of ['+1340', '+1670', '+1671', '+1684', '+1787', '+1939']) {
            expect(BlockedPrefixes).not.toContain(territory);
        }
    });

    it('applies configured values', () => {
        const policy = ResolveOutboundPolicy({ allowedPrefixes: ['+44', ' +61 '], blockedPrefixes: ['+4470'], maxCallsPerUserPerHour: 5 });
        expect(policy).toEqual({ AllowedPrefixes: ['+44', '+61'], BlockedPrefixes: ['+4470'], MaxCallsPerUserPerHour: 5 });
    });

    it('drops (and logs) a malformed prefix instead of silently widening or narrowing the lists', () => {
        const policy = ResolveOutboundPolicy({ allowedPrefixes: ['+1', '1', 'abc'] });
        expect(policy.AllowedPrefixes).toEqual(['+1']);
        expect(LogError).toHaveBeenCalledTimes(2);
    });

    it('an empty allow-list is kept empty (it refuses every destination)', () => {
        expect(ResolveOutboundPolicy({ allowedPrefixes: [] }).AllowedPrefixes).toEqual([]);
    });

    it.each([0, -3, NaN, Infinity])('falls back to the default limit for %s rather than disabling the limiter', (n) => {
        expect(ResolveOutboundPolicy({ maxCallsPerUserPerHour: n }).MaxCallsPerUserPerHour).toBe(20);
    });
});

describe('OutboundRateLimiter', () => {
    it('allows up to the budget then refuses', () => {
        const limiter = new OutboundRateLimiter(2, 1000, () => 0);
        expect(limiter.TryConsume('u1')).toBe(true);
        expect(limiter.TryConsume('u1')).toBe(true);
        expect(limiter.TryConsume('u1')).toBe(false);
    });

    it('slides: budget returns as old calls age out of the window', () => {
        let now = 0;
        const limiter = new OutboundRateLimiter(2, 1000, () => now);
        limiter.TryConsume('u1'); // t=0
        now = 600;
        limiter.TryConsume('u1'); // t=600
        now = 900;
        expect(limiter.TryConsume('u1')).toBe(false);
        now = 1001; // the t=0 call has aged out, t=600 has not
        expect(limiter.TryConsume('u1')).toBe(true);
        expect(limiter.TryConsume('u1')).toBe(false);
    });

    it('forgets users whose window emptied, even if they never call again (no unbounded growth)', () => {
        let now = 0;
        const limiter = new OutboundRateLimiter(2, 1000, () => now);
        for (const id of ['a', 'b', 'c']) {
            limiter.TryConsume(id);
        }
        expect(limiter.TrackedUserCount).toBe(3);

        now = 5000; // everyone's window has emptied; only a NEW user calls
        limiter.TryConsume('d');

        expect(limiter.TrackedUserCount).toBe(1);
    });

    it('keeps users who are still inside their window when sweeping, with unchanged budgets', () => {
        let now = 0;
        const limiter = new OutboundRateLimiter(1, 100_000, () => now);
        limiter.TryConsume('a');
        now = 70_000; // past a sweep interval but inside a's window
        limiter.TryConsume('b');
        expect(limiter.TrackedUserCount).toBe(2);
        expect(limiter.TryConsume('a')).toBe(false);
    });

    it('budgets are per user and case-insensitive on the id', () => {
        const limiter = new OutboundRateLimiter(1, 1000, () => 0);
        expect(limiter.TryConsume('USER-A')).toBe(true);
        expect(limiter.TryConsume('user-a')).toBe(false);
        expect(limiter.TryConsume('user-b')).toBe(true);
    });
});

describe('AuthorizeOutboundCall', () => {
    beforeEach(() => vi.mocked(LogError).mockClear());

    it('allows a permitted, well-formed, in-range call', async () => {
        expect(await AuthorizeOutboundCall(request(), deps())).toEqual({ Allowed: true });
    });

    it('refuses when the caller may not run the agent, and checks the identity\'s agent for that caller', async () => {
        const canRun = vi.fn(async () => false);
        const verdict = await AuthorizeOutboundCall(request(), deps({ CanRunAgent: canRun }));
        expect(verdict).toMatchObject({ Allowed: false, Code: 'agent-not-permitted' });
        expect(canRun).toHaveBeenCalledWith('agent-1', USER);
    });

    it.each([
        ['not E.164', '4155550123', 'invalid-number'],
        ['has spaces', '+1 415 555 0123', 'invalid-number'],
        ['outside the allow-list', '+442071838750', 'prefix-not-allowed'],
        ['premium 900 range', '+19005551234', 'prefix-blocked'],
        ['pay-per-call 976 range', '+19765551234', 'prefix-blocked'],
        ['Jamaica (+1876)', '+18765551234', 'prefix-blocked'],
        ['Jamaica (+1658)', '+16585551234', 'prefix-blocked'],
        ['Dominican Republic (+1809)', '+18095551234', 'prefix-blocked'],
        ['Bahamas (+1242)', '+12425551234', 'prefix-blocked'],
    ])('refuses a destination that is %s', async (_label, to, code) => {
        const verdict = await AuthorizeOutboundCall(request({ ToNumber: to }), deps());
        expect(verdict).toMatchObject({ Allowed: false, Code: code });
    });

    it.each([
        ['Puerto Rico +1787', '+17875551234'],
        ['Puerto Rico +1939', '+19395551234'],
        ['US Virgin Islands +1340', '+13405551234'],
        ['Guam +1671', '+16715551234'],
        ['Canada/US mainland +1416', '+14165551234'],
    ])('allows %s (US territories and mainland are not blocked)', async (_label, to) => {
        expect((await AuthorizeOutboundCall(request({ ToNumber: to }), deps())).Allowed).toBe(true);
    });

    it('a blocked prefix wins over a matching allowed prefix', async () => {
        const policy = ResolveOutboundPolicy({ allowedPrefixes: ['+1'], blockedPrefixes: ['+1415'] });
        const verdict = await AuthorizeOutboundCall(request(), deps({ Policy: policy }));
        expect(verdict).toMatchObject({ Allowed: false, Code: 'prefix-blocked' });
    });

    it('refuses every destination under an empty allow-list', async () => {
        const policy = ResolveOutboundPolicy({ allowedPrefixes: [] });
        const verdict = await AuthorizeOutboundCall(request(), deps({ Policy: policy }));
        expect(verdict).toMatchObject({ Allowed: false, Code: 'prefix-not-allowed' });
    });

    it('rate-limits after the hourly budget is spent', async () => {
        const policy = ResolveOutboundPolicy({ maxCallsPerUserPerHour: 2 });
        const shared = deps({ Policy: policy, Limiter: new OutboundRateLimiter(2) });
        expect((await AuthorizeOutboundCall(request(), shared)).Allowed).toBe(true);
        expect((await AuthorizeOutboundCall(request(), shared)).Allowed).toBe(true);
        expect(await AuthorizeOutboundCall(request(), shared)).toMatchObject({ Allowed: false, Code: 'rate-limited' });
    });

    it('a refused request never consumes rate budget', async () => {
        const policy = ResolveOutboundPolicy({ maxCallsPerUserPerHour: 1 });
        const shared = deps({ Policy: policy, Limiter: new OutboundRateLimiter(1) });
        await AuthorizeOutboundCall(request({ ToNumber: '+19005551234' }), shared); // blocked
        await AuthorizeOutboundCall(request({ ToNumber: 'garbage' }), shared); // malformed
        expect((await AuthorizeOutboundCall(request(), shared)).Allowed).toBe(true);
    });

    it('refuses an inactive identity', async () => {
        const verdict = await AuthorizeOutboundCall(request({ AgentIdentity: { ...request().AgentIdentity, IsActive: false } }), deps());
        expect(verdict).toMatchObject({ Allowed: false, Code: 'identity-inactive' });
    });

    it('refuses an identity that belongs to a different carrier (ids compared case-insensitively)', async () => {
        const other = { ...request().AgentIdentity, ProviderID: 'CCCCCCCC-0000-0000-0000-000000000003' };
        expect(await AuthorizeOutboundCall(request({ AgentIdentity: other }), deps())).toMatchObject({ Allowed: false, Code: 'wrong-carrier' });
        // the same id in a different case is the SAME carrier
        expect((await AuthorizeOutboundCall(request(), deps())).Allowed).toBe(true);
    });

    it('does not consult the agent permission for a call that is already refused on destination', async () => {
        const canRun = vi.fn(async () => true);
        await AuthorizeOutboundCall(request({ ToNumber: '+19005551234' }), deps({ CanRunAgent: canRun }));
        expect(canRun).not.toHaveBeenCalled();
    });

    it('logs every refusal with user, identity, reason and ONLY the last four digits of the destination', async () => {
        await AuthorizeOutboundCall(request({ ToNumber: '+19005551234' }), deps());
        expect(LogError).toHaveBeenCalledTimes(1);
        const line = String(vi.mocked(LogError).mock.calls[0][0]);
        expect(line).toContain(USER.ID);
        expect(line).toContain('ident-1');
        expect(line).toContain('prefix-blocked');
        expect(line).toContain('1234');
        expect(line).not.toContain('9005551234');
        expect(line).not.toContain('+19005551234');
    });

    it('does not log anything for an allowed call', async () => {
        await AuthorizeOutboundCall(request(), deps());
        expect(LogError).not.toHaveBeenCalled();
    });

    it('trims the supplied number before validating it', async () => {
        expect((await AuthorizeOutboundCall(request({ ToNumber: '  +14155550123 ' }), deps())).Allowed).toBe(true);
    });
});

describe('OutboundCallRefusedError', () => {
    it('carries a caller-safe message and a machine-readable code', () => {
        const err = new OutboundCallRefusedError('nope', 'rate-limited');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('nope');
        expect(err.Code).toBe('rate-limited');
    });
});

describe('CheckTransferDestination', () => {
    const policy = ResolveOutboundPolicy();

    it('allows a well-formed number inside the allowed ranges and returns it trimmed', () => {
        expect(CheckTransferDestination(policy, ' +14155550123 ')).toEqual({ Allowed: true, Number: '+14155550123' });
    });

    it.each([
        ['+19005551234', 'prefix-blocked'],
        ['+18765550123', 'prefix-blocked'],
        ['+442071838750', 'prefix-not-allowed'],
        ['4155550123', 'invalid-number'],
        ['', 'invalid-number'],
        ['+1415 555 0123', 'invalid-number'],
    ])('refuses %j (%s) exactly as an outbound dial would', (to, code) => {
        const verdict = CheckTransferDestination(policy, to);
        expect(verdict.Allowed).toBe(false);
        if (!verdict.Allowed) {
            expect(verdict.Code).toBe(code);
        }
    });

    it('honours an operator-configured allow-list', () => {
        const custom = ResolveOutboundPolicy({ allowedPrefixes: ['+44'], blockedPrefixes: [] });
        expect(CheckTransferDestination(custom, '+442071838750').Allowed).toBe(true);
        expect(CheckTransferDestination(custom, '+14155550123').Allowed).toBe(false);
    });

    it('treats a missing destination as invalid rather than throwing', () => {
        expect(CheckTransferDestination(policy, undefined as unknown as string).Allowed).toBe(false);
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogStatus: vi.fn(),
}));

import { LogStatus } from '@memberjunction/core';
import { ResolveInboundContext, ResolveInboundRunAsUser, type RunAsUserDirectory } from '../telephony/runAsIdentity.js';

const user = (id: string, email: string, isActive = true, type = 'User'): UserInfo => ({ ID: id, Email: email, IsActive: isActive, Type: type }) as unknown as UserInfo;

const SYSTEM = user('11111111-1111-1111-1111-111111111111', 'system@mj.local');
const PHONE_BOT = user('22222222-2222-2222-2222-222222222222', 'phone-bot@acme.com');
const DORMANT = user('33333333-3333-3333-3333-333333333333', 'old@acme.com', false);

function directory(users: UserInfo[], system: UserInfo | undefined = SYSTEM): RunAsUserDirectory {
    return {
        FindByEmail: (email) => users.find((u) => u.Email.toLowerCase() === email.trim().toLowerCase()),
        GetSystemUser: () => system,
    };
}

describe('ResolveInboundRunAsUser', () => {
    const dir = directory([SYSTEM, PHONE_BOT, DORMANT]);

    it('resolves the configured active user (case/whitespace-insensitive)', () => {
        const result = ResolveInboundRunAsUser('  Phone-Bot@ACME.com ', dir);
        expect(result).toEqual({ Ok: true, User: PHONE_BOT });
    });

    it.each([undefined, '', '   '])('rejects an unset setting (%j) — there is no fallback to a privileged user', (value) => {
        const result = ResolveInboundRunAsUser(value, dir);
        expect(result.Ok).toBe(false);
        expect(!result.Ok && result.Reason).toContain('not configured');
    });

    it('rejects an email that matches no user', () => {
        const result = ResolveInboundRunAsUser('ghost@acme.com', dir);
        expect(result.Ok).toBe(false);
        expect(!result.Ok && result.Reason).toContain('does not match any user');
    });

    it('rejects an inactive user', () => {
        const result = ResolveInboundRunAsUser('old@acme.com', dir);
        expect(result.Ok).toBe(false);
        expect(!result.Ok && result.Reason).toContain('inactive');
    });

    it('rejects the system user, comparing ids case-insensitively (SQL Server vs PostgreSQL)', () => {
        const upperCaseSystem = user('11111111-1111-1111-1111-111111111111'.toUpperCase(), 'system@mj.local');
        const result = ResolveInboundRunAsUser('system@mj.local', directory([upperCaseSystem], SYSTEM));
        expect(result.Ok).toBe(false);
        expect(!result.Ok && result.Reason).toContain('system user');
    });

    it('still resolves a normal user when no system user is loaded', () => {
        expect(ResolveInboundRunAsUser('phone-bot@acme.com', directory([PHONE_BOT], undefined)).Ok).toBe(true);
    });
});

describe('Owner run-as warning', () => {
    beforeEach(() => vi.mocked(LogStatus).mockClear());

    it('still allows an Owner but warns that callers will run with Owner privileges', () => {
        const owner = user('44444444-4444-4444-4444-444444444441', 'boss@acme.com', true, 'Owner');
        const result = ResolveInboundRunAsUser('boss@acme.com', directory([owner]));
        expect(result).toEqual({ Ok: true, User: owner });
        expect(LogStatus).toHaveBeenCalledTimes(1);
        const line = String(vi.mocked(LogStatus).mock.calls[0][0]);
        expect(line).toContain('Owner privileges');
        expect(line).toContain('least-privilege');
    });

    it('warns only once per process for the same Owner, however many calls resolve it', () => {
        const owner = user('44444444-4444-4444-4444-444444444442', 'boss2@acme.com', true, ' owner ');
        const dir = directory([owner]);
        ResolveInboundRunAsUser('boss2@acme.com', dir);
        ResolveInboundRunAsUser('boss2@acme.com', dir);
        ResolveInboundRunAsUser('BOSS2@acme.com', dir);
        expect(LogStatus).toHaveBeenCalledTimes(1);
    });

    it('does not warn for a regular user', () => {
        ResolveInboundRunAsUser('phone-bot@acme.com', directory([PHONE_BOT]));
        expect(LogStatus).not.toHaveBeenCalled();
    });

    it('does not warn when the Owner is rejected (inactive)', () => {
        const owner = user('44444444-4444-4444-4444-444444444443', 'gone@acme.com', false, 'Owner');
        ResolveInboundRunAsUser('gone@acme.com', directory([owner]));
        expect(LogStatus).not.toHaveBeenCalled();
    });
});

describe('ResolveInboundContext', () => {
    const provider = { Entities: [] } as unknown as IMetadataProvider;

    it('returns the user and provider when both are available', () => {
        const result = ResolveInboundContext('phone-bot@acme.com', directory([PHONE_BOT]), provider);
        expect(result).toEqual({ Ok: true, User: PHONE_BOT, Provider: provider });
    });

    it('rejects when there is no metadata provider', () => {
        const result = ResolveInboundContext('phone-bot@acme.com', directory([PHONE_BOT]), null);
        expect(result.Ok).toBe(false);
    });

    it('propagates the user rejection reason', () => {
        const result = ResolveInboundContext(undefined, directory([PHONE_BOT]), provider);
        expect(result.Ok).toBe(false);
        expect(!result.Ok && result.Reason).toContain('inboundRunAsUserEmail');
    });
});

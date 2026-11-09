import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

import {
    AnonymousCallerIdentityResolver,
    BaseCallerIdentityResolver,
    CALLER_IDENTITY_RESOLVER_KEY,
    CreateCallerIdentityResolver,
    ResolveCallerSafely,
    type CallerIdentity,
} from '../telephony/callerIdentity.js';

const USER = { ID: 'u1' } as unknown as UserInfo;

describe('the default caller-identity resolver', () => {
    it('knows nothing about the caller and verifies nothing', async () => {
        expect(await new AnonymousCallerIdentityResolver().ResolveCaller()).toEqual({ Verified: false });
    });

    it('is what CreateCallerIdentityResolver returns when no host has registered its own', () => {
        expect(CreateCallerIdentityResolver()).toBeInstanceOf(AnonymousCallerIdentityResolver);
    });
});

describe('a host-registered resolver', () => {
    it('replaces the default for the same key (later registration wins)', async () => {
        class HostResolver extends BaseCallerIdentityResolver {
            public async ResolveCaller(from: string): Promise<CallerIdentity> {
                return { DisplayName: `Member ${from}`, Verified: true, ContextNotes: 'Gold member' };
            }
        }
        MJGlobal.Instance.ClassFactory.Register(BaseCallerIdentityResolver, HostResolver, CALLER_IDENTITY_RESOLVER_KEY, 1000);

        const resolver = CreateCallerIdentityResolver();
        expect(resolver).toBeInstanceOf(HostResolver);
        expect(await resolver.ResolveCaller('+1415', '+1800', USER)).toMatchObject({ Verified: true, DisplayName: 'Member +1415' });
    });
});

describe('ResolveCallerSafely', () => {
    it('treats the caller as anonymous when the resolver throws (a CRM outage must not stop the phone being answered)', async () => {
        const failing = { ResolveCaller: vi.fn(async () => { throw new Error('crm down'); }) };
        expect(await ResolveCallerSafely(failing, '+1415', '+1800', USER)).toEqual({ Verified: false });
    });

    it('only passes on Verified when it is exactly true', async () => {
        const sloppy = { ResolveCaller: vi.fn(async () => ({ DisplayName: 'Pat', Verified: 'yes' as unknown as boolean })) };
        expect((await ResolveCallerSafely(sloppy, '+1415', '+1800', USER)).Verified).toBe(false);
    });
});

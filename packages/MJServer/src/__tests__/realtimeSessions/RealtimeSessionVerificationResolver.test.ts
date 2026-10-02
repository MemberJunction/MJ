import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { AppContext, ProviderInfo, UserPayload } from '../../types.js';

const service = vi.hoisted(() => ({
    RequestVerification: vi.fn(),
    SubmitCode: vi.fn(),
    GetStatus: vi.fn(),
}));
vi.mock('../../realtimeSessions/RealtimeSessionVerificationService.js', () => ({ RealtimeSessionVerificationService: { Instance: service } }));

import { RealtimeSessionVerificationResolver } from '../../resolvers/RealtimeSessionVerificationResolver.js';
import { HasNoLogParameter } from '../../logging/NoLog.js';

const SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000001';
const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
const PROVIDER = { id: 'rw' } as unknown as IMetadataProvider;

function context(over: { userRecord?: Partial<UserInfo> | null; email?: string; providers?: ProviderInfo[]; clientIp?: string } = {}): AppContext {
    const userPayload = {
        email: over.email ?? 'owner@example.com',
        sessionId: 's',
        userRecord: over.userRecord === null ? undefined : (over.userRecord ?? { ID: OWNER }),
    } as UserPayload;
    return {
        userPayload,
        providers: over.providers ?? ([{ provider: PROVIDER, type: 'Read-Write' }] as unknown as ProviderInfo[]),
        ClientIp: over.clientIp ?? '203.0.113.7',
    } as unknown as AppContext;
}

const OK = { Success: true, VerificationState: 'pending', Message: 'We emailed you a link and a code.', SendsRemaining: 2 };

describe('RealtimeSessionVerificationResolver', () => {
    const resolver = new RealtimeSessionVerificationResolver();

    beforeEach(() => {
        service.RequestVerification.mockReset().mockResolvedValue(OK);
        service.SubmitCode.mockReset().mockResolvedValue({ Success: true, VerificationState: 'verified' });
        service.GetStatus.mockReset().mockResolvedValue({ Success: true, VerificationState: 'unverified' });
    });

    describe('RequestRealtimeSessionVerification', () => {
        it('calls the service as the authenticated principal with the request provider and client IP', async () => {
            const result = await resolver.RequestRealtimeSessionVerification(SESSION_ID, 'Pat', 'pat@acme.com', context());
            expect(result).toEqual(OK);
            expect(service.RequestVerification).toHaveBeenCalledWith(
                { AgentSessionID: SESSION_ID, Name: 'Pat', Email: 'pat@acme.com' },
                { Kind: 'principal', ContextUser: { ID: OWNER }, Provider: PROVIDER, ClientIp: '203.0.113.7' },
            );
        });

        it('refuses a caller with no authenticated userRecord — it does NOT fall back to an email lookup that would drop an anonymous guest\'s scope', async () => {
            const result = await resolver.RequestRealtimeSessionVerification(SESSION_ID, 'Pat', 'pat@acme.com', context({ userRecord: null, email: 'anonymous@magic-link.local' }));
            expect(result).toMatchObject({ Success: false, ErrorCode: 'session_not_found' });
            expect(service.RequestVerification).not.toHaveBeenCalled();
        });

        it('refuses when there is no read-write provider', async () => {
            const result = await resolver.RequestRealtimeSessionVerification(SESSION_ID, 'Pat', 'pat@acme.com', context({ providers: [] }));
            expect(result.Success).toBe(false);
            expect(service.RequestVerification).not.toHaveBeenCalled();
        });

        it('passes a failure result straight through', async () => {
            service.RequestVerification.mockResolvedValue({ Success: false, VerificationState: 'unverified', ErrorCode: 'consumer_domain', Message: 'Please use your work email address.' });
            expect(await resolver.RequestRealtimeSessionVerification(SESSION_ID, 'Pat', 'pat@gmail.com', context())).toMatchObject({ Success: false, ErrorCode: 'consumer_domain' });
        });
    });

    describe('SubmitRealtimeSessionVerificationCode', () => {
        it('calls the service with the code and the same principal', async () => {
            await resolver.SubmitRealtimeSessionVerificationCode(SESSION_ID, '123456', context());
            expect(service.SubmitCode).toHaveBeenCalledWith({ AgentSessionID: SESSION_ID, Code: '123456' }, expect.objectContaining({ Kind: 'principal', ContextUser: { ID: OWNER } }));
        });

        it('refuses an unauthenticated caller', async () => {
            expect(await resolver.SubmitRealtimeSessionVerificationCode(SESSION_ID, '123456', context({ userRecord: null }))).toMatchObject({ Success: false });
            expect(service.SubmitCode).not.toHaveBeenCalled();
        });
    });

    describe('RealtimeSessionVerificationStatus', () => {
        it('reads the status as the principal', async () => {
            expect(await resolver.RealtimeSessionVerificationStatus(SESSION_ID, context())).toEqual({ Success: true, VerificationState: 'unverified' });
            expect(service.GetStatus).toHaveBeenCalledWith({ AgentSessionID: SESSION_ID }, expect.objectContaining({ ContextUser: { ID: OWNER } }));
        });

        it('refuses an unauthenticated caller', async () => {
            expect(await resolver.RealtimeSessionVerificationStatus(SESSION_ID, context({ userRecord: null }))).toMatchObject({ Success: false });
            expect(service.GetStatus).not.toHaveBeenCalled();
        });
    });

    it('marks the email and the code @NoLog so they never reach variable logging', () => {
        // Parameter index 2 of the request (email) and index 1 of the code submission.
        expect(HasNoLogParameter(RealtimeSessionVerificationResolver, 'RequestRealtimeSessionVerification', 2)).toBe(true);
        expect(HasNoLogParameter(RealtimeSessionVerificationResolver, 'SubmitRealtimeSessionVerificationCode', 1)).toBe(true);
        expect(HasNoLogParameter(RealtimeSessionVerificationResolver, 'RequestRealtimeSessionVerification', 0)).toBe(false);
    });
});

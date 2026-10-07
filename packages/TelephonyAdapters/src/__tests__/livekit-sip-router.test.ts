import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { LiveKitRoomWebhookEvent } from '@memberjunction/livekit-room-server';

const resolveContext = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));
vi.mock('../telephony/runAsIdentity.js', () => ({ ResolveInboundContext: resolveContext }));

import { HandleLiveKitWebhook, LIVEKIT_SIP_MOUNT_PATH } from '../telephony/LiveKitSipRouter.js';

const USER = { ID: 'run-as' } as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;

const EVENT: LiveKitRoomWebhookEvent = {
    Event: 'participant_joined',
    RoomName: 'call-abc',
    ParticipantIdentity: 'sip_1',
    IsSipParticipant: true,
    CallerNumber: '+14155550123',
    DialedNumber: '+18005550100',
};

function fakeRes() {
    const res = { status: vi.fn(), end: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
}

function fakeReq(body: unknown, authorization: string | undefined = 'jwt'): Request {
    return { body, get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) } as unknown as Request;
}

function harness(parse: () => Promise<LiveKitRoomWebhookEvent> = async () => EVENT) {
    const service = { HandleWebhookEvent: vi.fn(async () => ({ accepted: true })), RefuseInboundCall: vi.fn(async () => undefined) };
    const parser = { Parse: vi.fn(parse) };
    return { service, parser };
}

beforeEach(() => {
    resolveContext.mockReset();
    resolveContext.mockReturnValue({ Ok: true, User: USER, Provider: PROVIDER });
});

describe('HandleLiveKitWebhook', () => {
    it('mounts under the LiveKit SIP path', () => {
        expect(LIVEKIT_SIP_MOUNT_PATH).toBe('/telephony/livekit-sip');
    });

    it('verifies the raw body against the Authorization header, acknowledges, then hands the event to the service as the run-as user', async () => {
        const { service, parser } = harness();
        const res = fakeRes();
        await HandleLiveKitWebhook(service, parser, { inboundRunAsUserEmail: 'bot@example.com' }, fakeReq(Buffer.from('{"event":"participant_joined"}'), 'Bearer abc'), res as unknown as Response);
        expect(parser.Parse).toHaveBeenCalledWith('{"event":"participant_joined"}', 'Bearer abc');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(resolveContext).toHaveBeenCalledWith('bot@example.com');
        expect(service.HandleWebhookEvent).toHaveBeenCalledWith(EVENT, USER, PROVIDER);
    });

    it('rejects a webhook that does not verify, before reading anything from it', async () => {
        const { service, parser } = harness(async () => {
            throw new Error('invalid token');
        });
        const res = fakeRes();
        await HandleLiveKitWebhook(service, parser, {}, fakeReq(Buffer.from('{}')), res as unknown as Response);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(service.HandleWebhookEvent).not.toHaveBeenCalled();
        expect(resolveContext).not.toHaveBeenCalled();
    });

    it('refuses a body that was not read as raw bytes, because the signature cannot be checked', async () => {
        const { service, parser } = harness();
        const res = fakeRes();
        await HandleLiveKitWebhook(service, parser, {}, fakeReq({ already: 'parsed' }), res as unknown as Response);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(parser.Parse).not.toHaveBeenCalled();
    });

    it('hangs up a new phone call it cannot admit when there is no run-as user, and does not call it admitted', async () => {
        resolveContext.mockReturnValue({ Ok: false, Reason: 'telephony.inboundRunAsUserEmail is not configured' });
        const { service, parser } = harness();
        await HandleLiveKitWebhook(service, parser, {}, fakeReq(Buffer.from('{}')), fakeRes() as unknown as Response);
        expect(service.RefuseInboundCall).toHaveBeenCalledWith(EVENT);
        expect(service.HandleWebhookEvent).not.toHaveBeenCalled();
    });

    it('does not hang anything up for an event that is not a new phone call when there is no run-as user', async () => {
        resolveContext.mockReturnValue({ Ok: false, Reason: 'no user' });
        const { service, parser } = harness(async () => ({ ...EVENT, Event: 'room_finished', IsSipParticipant: false }));
        await HandleLiveKitWebhook(service, parser, {}, fakeReq(Buffer.from('{}')), fakeRes() as unknown as Response);
        expect(service.RefuseInboundCall).not.toHaveBeenCalled();
    });

    it('swallows a failure in the service (the webhook was already acknowledged)', async () => {
        const { service, parser } = harness();
        service.HandleWebhookEvent.mockRejectedValueOnce(new Error('boom'));
        await expect(HandleLiveKitWebhook(service, parser, {}, fakeReq(Buffer.from('{}')), fakeRes() as unknown as Response)).resolves.toBeUndefined();
    });
});

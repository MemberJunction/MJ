import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'crypto';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import {
    OpenAISipBridge,
    VerifyOpenAISipWebhook,
    IOpenAISipRestClient,
} from '../openai-sip-bridge';

class MockOpenAISipRestClient implements IOpenAISipRestClient {
    public accepted: Array<{ sessionId: string; config: Record<string, unknown> }> = [];
    public rejected: Array<{ sessionId: string; statusCode: number }> = [];
    public referred: Array<{ sessionId: string; targetUri: string }> = [];
    public hungUp: string[] = [];

    public async accept(sessionId: string, sessionConfig: Record<string, unknown>): Promise<void> {
        this.accepted.push({ sessionId, config: sessionConfig });
    }

    public async reject(sessionId: string, statusCode: number): Promise<void> {
        this.rejected.push({ sessionId, statusCode });
    }

    public async refer(sessionId: string, targetUri: string): Promise<void> {
        this.referred.push({ sessionId, targetUri });
    }

    public async hangup(sessionId: string): Promise<void> {
        this.hungUp.push(sessionId);
    }
}

describe('VerifyOpenAISipWebhook (Standard-Webhooks HMAC)', () => {
    const rawSecret = 'test_secret_key_12345';
    const base64Secret = Buffer.from(rawSecret).toString('base64');
    const whsecSecret = `whsec_${base64Secret}`;

    it('verifies a valid signature with whsec_ secret', () => {
        const payload = JSON.stringify({ type: 'live.transport.incoming', data: { session_id: 'sess_123' } });
        const id = 'msg_abc123';
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const signedPayload = `${id}.${timestamp}.${payload}`;
        const sig = createHmac('sha256', Buffer.from(base64Secret, 'base64')).update(signedPayload).digest('base64');

        const isValid = VerifyOpenAISipWebhook({
            rawPayload: payload,
            headers: {
                'webhook-id': id,
                'webhook-timestamp': timestamp,
                'webhook-signature': `v1,${sig}`,
            },
            secret: whsecSecret,
        });

        expect(isValid).toBe(true);
    });

    it('rejects an invalid signature', () => {
        const payload = '{"data":1}';
        const id = 'msg_xyz';
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const isValid = VerifyOpenAISipWebhook({
            rawPayload: payload,
            headers: {
                'webhook-id': id,
                'webhook-timestamp': timestamp,
                'webhook-signature': 'v1,invalid_signature_hash',
            },
            secret: whsecSecret,
        });

        expect(isValid).toBe(false);
    });

    it('rejects an expired timestamp beyond skew tolerance', () => {
        const payload = '{"data":1}';
        const id = 'msg_xyz';
        const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // > 300s skew

        const signedPayload = `${id}.${oldTimestamp}.${payload}`;
        const sig = createHmac('sha256', Buffer.from(base64Secret, 'base64')).update(signedPayload).digest('base64');

        const isValid = VerifyOpenAISipWebhook({
            rawPayload: payload,
            headers: {
                'webhook-id': id,
                'webhook-timestamp': oldTimestamp,
                'webhook-signature': `v1,${sig}`,
            },
            secret: whsecSecret,
        });

        expect(isValid).toBe(false);
    });

    it('enforces replay prevention with replay cache', () => {
        const payload = '{"data":1}';
        const id = 'msg_replay_test';
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const signedPayload = `${id}.${timestamp}.${payload}`;
        const sig = createHmac('sha256', Buffer.from(base64Secret, 'base64')).update(signedPayload).digest('base64');

        const replayCache = new Set<string>();

        const first = VerifyOpenAISipWebhook({
            rawPayload: payload,
            headers: {
                'webhook-id': id,
                'webhook-timestamp': timestamp,
                'webhook-signature': `v1,${sig}`,
            },
            secret: whsecSecret,
            replayCache,
        });
        expect(first).toBe(true);

        const replay = VerifyOpenAISipWebhook({
            rawPayload: payload,
            headers: {
                'webhook-id': id,
                'webhook-timestamp': timestamp,
                'webhook-signature': `v1,${sig}`,
            },
            secret: whsecSecret,
            replayCache,
        });
        expect(replay).toBe(false);
    });
});

describe('OpenAISipBridge', () => {
    it('is registered in ClassFactory under BaseRealtimeBridge', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeBridge>(
            BaseRealtimeBridge,
            'OpenAISipBridge'
        );
        expect(instance).toBeInstanceOf(OpenAISipBridge);
    });

    it('throws if Connect is missing session ID', async () => {
        const mockRest = new MockOpenAISipRestClient();
        const bridge = new OpenAISipBridge(mockRest);

        await expect(
            bridge.Connect({
                Features: { InboundRouting: true },
                ProviderName: 'OpenAISIP',
                Address: '+15551234567',
                Configuration: {},
            })
        ).rejects.toThrow(/missing required session id/i);
    });

    it('connects, sets DetachedMediaPlane, and accepts session if accept config is supplied', async () => {
        const mockRest = new MockOpenAISipRestClient();
        const bridge = new OpenAISipBridge(mockRest);

        const result = await bridge.Connect({
            Features: { InboundRouting: true, DTMF: true, CallTransfer: true },
            ProviderName: 'OpenAISIP',
            Address: '+15551234567',
            Configuration: {
                session_id: 'live_sip_sess_999',
                fromNumber: '+15551112222',
                session: {
                    model: 'gpt-live-1',
                    instructions: 'Answer clearly',
                },
            },
        });

        expect(result.BotParticipantId).toBe('bot');
        expect(result.ExternalConnectionId).toBe('live_sip_sess_999');
        expect(bridge.Features.DetachedMediaPlane).toBe(true);

        expect(mockRest.accepted).toHaveLength(1);
        expect(mockRest.accepted[0].sessionId).toBe('live_sip_sess_999');
        expect(mockRest.accepted[0].config['model']).toBe('gpt-live-1');
    });

    it('handles DTMF events via HandleDTMF', async () => {
        const mockRest = new MockOpenAISipRestClient();
        const bridge = new OpenAISipBridge(mockRest);

        await bridge.Connect({
            Features: { InboundRouting: true, DTMF: true },
            ProviderName: 'OpenAISIP',
            Address: '+15551234567',
            Configuration: { session_id: 'sess_1' },
        });

        const digits: string[] = [];
        bridge.OnDTMF((d) => digits.push(d));

        bridge.HandleDTMF('4');
        bridge.HandleDTMF('*');

        expect(digits).toEqual(['4', '*']);
    });

    it('supports TransferCall using SIP refer', async () => {
        const mockRest = new MockOpenAISipRestClient();
        const bridge = new OpenAISipBridge(mockRest);

        await bridge.Connect({
            Features: { InboundRouting: true, CallTransfer: true },
            ProviderName: 'OpenAISIP',
            Address: '+15551234567',
            Configuration: { session_id: 'sess_transfer_1' },
        });

        await bridge.TransferCall('sip:+15558889999@sip.carrier.com');
        expect(mockRest.referred).toEqual([
            { sessionId: 'sess_transfer_1', targetUri: 'sip:+15558889999@sip.carrier.com' },
        ]);
    });

    it('supports Disconnect and fires OnCallEnded', async () => {
        const mockRest = new MockOpenAISipRestClient();
        const bridge = new OpenAISipBridge(mockRest);

        await bridge.Connect({
            Features: { InboundRouting: true },
            ProviderName: 'OpenAISIP',
            Address: '+15551234567',
            Configuration: { session_id: 'sess_hangup_1' },
        });

        let ended = false;
        bridge.OnCallEnded(() => {
            ended = true;
        });

        await bridge.Disconnect('Completed');
        expect(mockRest.hungUp).toEqual(['sess_hangup_1']);
        expect(ended).toBe(true);
    });
});

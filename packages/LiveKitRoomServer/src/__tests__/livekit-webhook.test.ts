import { describe, it, expect, vi } from 'vitest';
import { LiveKitWebhookParser, type WebhookReceiverLike } from '../livekit-webhook';
import { LIVEKIT_PARTICIPANT_KIND_SIP, LIVEKIT_SIP_ATTRIBUTES } from '../livekit-sip-service';

function receiver(event: Awaited<ReturnType<WebhookReceiverLike['receive']>>): WebhookReceiverLike {
  return { receive: vi.fn(async () => event) };
}

describe('LiveKitWebhookParser', () => {
  it('reduces a SIP participant_joined event to the caller, the dialed number and the call id', async () => {
    const parser = new LiveKitWebhookParser(undefined, receiver({
      event: 'participant_joined',
      room: { name: 'call-abc' },
      participant: {
        identity: 'sip_+14155550123',
        kind: LIVEKIT_PARTICIPANT_KIND_SIP,
        attributes: {
          [LIVEKIT_SIP_ATTRIBUTES.CallerNumber]: '+14155550123',
          [LIVEKIT_SIP_ATTRIBUTES.DialedNumber]: '+16505550000',
          [LIVEKIT_SIP_ATTRIBUTES.CallID]: 'SCL_1',
        },
      },
    }));
    expect(await parser.Parse('{}', 'jwt')).toEqual({
      Event: 'participant_joined',
      RoomName: 'call-abc',
      ParticipantIdentity: 'sip_+14155550123',
      IsSipParticipant: true,
      CallerNumber: '+14155550123',
      DialedNumber: '+16505550000',
      SipCallID: 'SCL_1',
    });
  });

  it('does not read phone attributes off a participant that is not a phone call', async () => {
    const parser = new LiveKitWebhookParser(undefined, receiver({
      event: 'participant_joined',
      room: { name: 'room' },
      participant: { identity: 'user-1', kind: 0, attributes: { [LIVEKIT_SIP_ATTRIBUTES.CallerNumber]: '+1999' } },
    }));
    const event = await parser.Parse('{}');
    expect(event.IsSipParticipant).toBe(false);
    expect(event.CallerNumber).toBeUndefined();
  });

  it('handles room events that carry no participant', async () => {
    const parser = new LiveKitWebhookParser(undefined, receiver({ event: 'room_started', room: { name: 'r' } }));
    expect(await parser.Parse('{}')).toMatchObject({ Event: 'room_started', RoomName: 'r', ParticipantIdentity: '', IsSipParticipant: false });
  });

  it('passes the raw body and the Authorization header to the signature check, and lets a failed check throw', async () => {
    const rejecting: WebhookReceiverLike = { receive: vi.fn(async () => Promise.reject(new Error('invalid token'))) };
    const parser = new LiveKitWebhookParser(undefined, rejecting);
    await expect(parser.Parse('raw-body', 'Bearer x')).rejects.toThrow('invalid token');
    expect(rejecting.receive).toHaveBeenCalledWith('raw-body', 'Bearer x');
  });

  it('refuses to build an unverifiable parser when credentials are missing', () => {
    expect(() => new LiveKitWebhookParser({ ServerUrl: '', ApiKey: '', ApiSecret: '' })).toThrow(/cannot be verified/);
  });
});

import { describe, it, expect } from 'vitest';
import {
    REALTIME_SESSION_EVENT_TYPES,
    IsIdentityVerifiedEventPayload,
    IsRealtimeSessionEventOfType,
    ParseRealtimeSessionEvent,
    SerializeRealtimeSessionEvent,
    type IdentityVerifiedEventPayload,
    type RealtimeSessionEvent,
    type RealtimeSessionEventWire,
} from '../realtime-session-events';

const VERIFIED_PAYLOAD: IdentityVerifiedEventPayload = {
    VerifiedEmail: 'pat@example.com',
    VerifiedName: 'Pat',
    VerifiedAt: '2026-10-02T12:00:00.000Z',
    Method: 'link',
    MaxSessionDeadlineIso: '2026-10-02T12:30:00.000Z',
};

function wire(overrides: Partial<RealtimeSessionEventWire> = {}): RealtimeSessionEventWire {
    return {
        Type: 'identity.verified',
        AgentSessionID: 'A1B2C3D4-0000-0000-0000-000000000001',
        OccurredAt: '2026-10-02T12:00:00.000Z',
        PayloadJson: JSON.stringify(VERIFIED_PAYLOAD),
        ...overrides,
    };
}

describe('REALTIME_SESSION_EVENT_TYPES', () => {
    it('names the core identity.verified event', () => {
        expect(REALTIME_SESSION_EVENT_TYPES.IdentityVerified).toBe('identity.verified');
    });
});

describe('IsIdentityVerifiedEventPayload', () => {
    it('accepts a complete payload, with and without the optional deadline', () => {
        expect(IsIdentityVerifiedEventPayload(VERIFIED_PAYLOAD)).toBe(true);
        const { MaxSessionDeadlineIso: _omitted, ...withoutDeadline } = VERIFIED_PAYLOAD;
        expect(IsIdentityVerifiedEventPayload(withoutDeadline)).toBe(true);
    });

    it('rejects non-objects', () => {
        expect(IsIdentityVerifiedEventPayload(null)).toBe(false);
        expect(IsIdentityVerifiedEventPayload('x')).toBe(false);
        expect(IsIdentityVerifiedEventPayload([VERIFIED_PAYLOAD])).toBe(false);
    });

    it('rejects a payload missing the email or with an empty email', () => {
        expect(IsIdentityVerifiedEventPayload({ ...VERIFIED_PAYLOAD, VerifiedEmail: undefined })).toBe(false);
        expect(IsIdentityVerifiedEventPayload({ ...VERIFIED_PAYLOAD, VerifiedEmail: '' })).toBe(false);
    });

    it('rejects an unknown Method and a non-string deadline', () => {
        expect(IsIdentityVerifiedEventPayload({ ...VERIFIED_PAYLOAD, Method: 'sms' })).toBe(false);
        expect(IsIdentityVerifiedEventPayload({ ...VERIFIED_PAYLOAD, MaxSessionDeadlineIso: 5 })).toBe(false);
    });

    it('accepts the client-set Recovered marker as a boolean only', () => {
        expect(IsIdentityVerifiedEventPayload({ ...VERIFIED_PAYLOAD, Recovered: true })).toBe(true);
        expect(IsIdentityVerifiedEventPayload({ ...VERIFIED_PAYLOAD, Recovered: 'yes' })).toBe(false);
    });
});

describe('SerializeRealtimeSessionEvent / ParseRealtimeSessionEvent', () => {
    it('round-trips an identity.verified event', () => {
        const event: RealtimeSessionEvent<'identity.verified'> = {
            Type: 'identity.verified',
            AgentSessionID: 'S1',
            OccurredAt: '2026-10-02T12:00:00.000Z',
            Payload: VERIFIED_PAYLOAD,
        };
        const parsed = ParseRealtimeSessionEvent(SerializeRealtimeSessionEvent(event));
        expect(parsed).toEqual(event);
    });

    it('narrows by type with IsRealtimeSessionEventOfType', () => {
        const parsed = ParseRealtimeSessionEvent(wire());
        expect(parsed).not.toBeNull();
        if (parsed && IsRealtimeSessionEventOfType(parsed, 'identity.verified')) {
            expect(parsed.Payload.VerifiedEmail).toBe('pat@example.com');
        } else {
            throw new Error('expected an identity.verified event');
        }
    });

    it('returns an unknown-type event verbatim so callers can log and ignore it', () => {
        const parsed = ParseRealtimeSessionEvent(wire({ Type: 'acme.quote.ready', PayloadJson: '{"QuoteID":"Q1"}' }));
        expect(parsed).toEqual({
            Type: 'acme.quote.ready',
            AgentSessionID: 'A1B2C3D4-0000-0000-0000-000000000001',
            OccurredAt: '2026-10-02T12:00:00.000Z',
            Payload: { QuoteID: 'Q1' },
        });
        expect(IsRealtimeSessionEventOfType(parsed!, 'identity.verified')).toBe(false);
    });

    it('drops a known type whose payload fails its guard', () => {
        expect(ParseRealtimeSessionEvent(wire({ PayloadJson: '{"VerifiedEmail":"x@y.z"}' }))).toBeNull();
    });

    it('drops structurally broken events', () => {
        expect(ParseRealtimeSessionEvent(wire({ Type: '' }))).toBeNull();
        expect(ParseRealtimeSessionEvent(wire({ AgentSessionID: '' }))).toBeNull();
        expect(ParseRealtimeSessionEvent(wire({ OccurredAt: '' }))).toBeNull();
        expect(ParseRealtimeSessionEvent(wire({ PayloadJson: '{not json' }))).toBeNull();
        expect(ParseRealtimeSessionEvent(wire({ PayloadJson: '[1,2]' }))).toBeNull();
        expect(ParseRealtimeSessionEvent(wire({ PayloadJson: 'null' }))).toBeNull();
    });
});

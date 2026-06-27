import { describe, it, expect } from 'vitest';
import {
    validateGraphNotification,
    parseCallNotification,
    buildJoinByUrlRequest,
    GraphChangeNotification,
} from '../teams-ingress';

const CLIENT_STATE = 'shared-secret-xyz';

// ──────────────────────────────────────────────────────────────────────────────
// validateGraphNotification — the validation-token handshake + clientState gate.
// ──────────────────────────────────────────────────────────────────────────────

describe('validateGraphNotification', () => {
    it('returns a validation handshake echoing a present validationToken', () => {
        const result = validateGraphNotification('echo-me-please', CLIENT_STATE, []);
        expect(result).toEqual({ Kind: 'validation', ValidationToken: 'echo-me-please' });
    });

    it('rejects an empty validationToken on the handshake', () => {
        expect(validateGraphNotification('', CLIENT_STATE, [])).toEqual({
            Kind: 'reject',
            Reason: 'empty-validation-token',
        });
    });

    it('accepts a real notification when every clientState matches', () => {
        const result = validateGraphNotification(undefined, CLIENT_STATE, [CLIENT_STATE, CLIENT_STATE]);
        expect(result).toEqual({ Kind: 'notification' });
    });

    it('rejects when any clientState mismatches', () => {
        const result = validateGraphNotification(undefined, CLIENT_STATE, [CLIENT_STATE, 'wrong']);
        expect(result).toEqual({ Kind: 'reject', Reason: 'client-state-mismatch' });
    });

    it('rejects a missing clientState (undefined) on a notification', () => {
        const result = validateGraphNotification(undefined, CLIENT_STATE, [undefined]);
        expect(result).toEqual({ Kind: 'reject', Reason: 'client-state-mismatch' });
    });

    it('accepts an empty notification batch (nothing to verify)', () => {
        expect(validateGraphNotification(undefined, CLIENT_STATE, [])).toEqual({ Kind: 'notification' });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// parseCallNotification — Graph call/participant notification → normalized state.
// ──────────────────────────────────────────────────────────────────────────────

describe('parseCallNotification', () => {
    it('maps a call notification with resourceData.id + state + participants', () => {
        const notification: GraphChangeNotification = {
            resource: 'communications/calls/call-9',
            clientState: CLIENT_STATE,
            resourceData: {
                id: 'call-9',
                state: 'established',
                participants: [{ id: 'p-alice', role: 'organizer' }],
            },
        };
        const result = parseCallNotification(notification);
        expect(result.callId).toBe('call-9');
        expect(result.state).toBe('established');
        expect(result.participants).toEqual([{ id: 'p-alice', role: 'organizer' }]);
    });

    it('resolves the call id from the resource path when resourceData.id is absent', () => {
        const result = parseCallNotification({
            resource: 'communications/calls/call-77/participants',
            resourceData: { state: 'establishing' },
        });
        expect(result.callId).toBe('call-77');
        expect(result.state).toBe('establishing');
        expect(result.participants).toEqual([]);
    });

    it('normalizes an unknown/absent state', () => {
        expect(parseCallNotification({ resourceData: { id: 'c1' } }).state).toBe('unknown');
        expect(parseCallNotification({ resourceData: { id: 'c2', state: 'WeirdState' } }).state).toBe('unknown');
    });

    it('maps the terminated lifecycle state', () => {
        expect(parseCallNotification({ resourceData: { id: 'c3', state: 'terminated' } }).state).toBe('terminated');
    });

    it('throws when no call id can be resolved', () => {
        expect(() => parseCallNotification({ resource: 'communications/presences/x' })).toThrow(
            /could not resolve a call id/i,
        );
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildJoinByUrlRequest — the on-demand join trigger payload.
// ──────────────────────────────────────────────────────────────────────────────

describe('buildJoinByUrlRequest', () => {
    const JOIN_URL = 'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_ABC%40thread.v2/0';

    it('builds an application-hosted-media join request from a URL + bot name', () => {
        const req = buildJoinByUrlRequest(JOIN_URL, 'Sage', 'tenant-123');
        expect(req.CallType).toBe('meeting');
        expect(req.AppHostedMedia).toBe(true);
        expect(req.BotDisplayName).toBe('Sage');
        expect(req.ThreadId).toBe('19:meeting_ABC@thread.v2');
        expect(req.TenantId).toBe('tenant-123');
    });

    it('defaults the bot display name to "AI Agent"', () => {
        expect(buildJoinByUrlRequest(JOIN_URL).BotDisplayName).toBe('AI Agent');
    });

    it('throws on a join URL with no resolvable thread id', () => {
        expect(() => buildJoinByUrlRequest('https://teams.microsoft.com/nope')).toThrow(
            /could not resolve a meeting thread id/i,
        );
    });
});

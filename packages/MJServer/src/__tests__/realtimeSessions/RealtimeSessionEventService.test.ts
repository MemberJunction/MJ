import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';
import { PubSubManager } from '../../generic/PubSubManager.js';
import {
    ParseReplicatedRealtimeSessionEvent,
    REALTIME_SESSION_EVENTS_TOPIC,
    RealtimeSessionEventService,
    type RealtimeSessionEventTopicPayload,
} from '../../realtimeSessions/RealtimeSessionEventService.js';

const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
const SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000001';
const CONVERSATION_ID = 'CCCCCCCC-0000-4000-8000-000000000001';
const USER = { ID: OWNER } as UserInfo;

const VERIFIED = { VerifiedEmail: 'pat@example.com', VerifiedName: 'Pat', VerifiedAt: '2026-10-02T12:00:00.000Z', Method: 'link' as const };

/** A provider that serves one session (+ conversation) — or nothing. */
function provider(found = true, externalId: string | null = 'scope-1'): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (name: string) => {
            if (name === 'MJ: AI Agent Sessions') {
                return found
                    ? { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID, Load: vi.fn(async () => true) }
                    : { Load: vi.fn(async () => false) };
            }
            return { ExternalID: externalId, Load: vi.fn(async () => true) };
        }),
    } as unknown as IMetadataProvider;
}

describe('RealtimeSessionEventService', () => {
    const published: Array<{ topic: string; payload: RealtimeSessionEventTopicPayload }> = [];

    beforeEach(() => {
        published.length = 0;
        const engine = { publish: vi.fn(async (topic: string, payload: RealtimeSessionEventTopicPayload) => void published.push({ topic, payload })) };
        PubSubManager.Instance.SetPubSubEngine(engine as unknown as PubSubEngine);
        RealtimeSessionEventService.Instance.SetReplicationHook(undefined);
    });

    describe('Publish', () => {
        it('publishes on the shared topic with the session routing snapshot', async () => {
            const result = await RealtimeSessionEventService.Instance.Publish({
                AgentSessionID: SESSION_ID,
                Type: 'identity.verified',
                Payload: VERIFIED,
                ContextUser: USER,
                Provider: provider(),
            });
            expect(result).toEqual({ Success: true });
            expect(published).toHaveLength(1);
            expect(published[0].topic).toBe(REALTIME_SESSION_EVENTS_TOPIC);
            expect(published[0].payload).toMatchObject({
                Type: 'identity.verified',
                AgentSessionID: SESSION_ID,
                OwnerUserID: OWNER,
                ScopeKey: 'scope-1',
                SourceServerId: MJGlobal.Instance.ProcessUUID,
            });
            expect(JSON.parse(published[0].payload.PayloadJson)).toEqual(VERIFIED);
            expect(Date.parse(published[0].payload.OccurredAt)).not.toBeNaN();
        });

        it('snapshots a null scope for a session whose conversation carries none', async () => {
            await RealtimeSessionEventService.Instance.Publish({
                AgentSessionID: SESSION_ID,
                Type: 'identity.verified',
                Payload: VERIFIED,
                ContextUser: USER,
                Provider: provider(true, null),
            });
            expect(published[0].payload.ScopeKey).toBeNull();
        });

        it('fails (and publishes nothing) when the session cannot be found', async () => {
            const result = await RealtimeSessionEventService.Instance.Publish({
                AgentSessionID: SESSION_ID,
                Type: 'identity.verified',
                Payload: VERIFIED,
                ContextUser: USER,
                Provider: provider(false),
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not found');
            expect(published).toHaveLength(0);
        });

        it('returns a failure instead of throwing when reading the session throws', async () => {
            const broken = { GetEntityObject: vi.fn(async () => { throw new Error('db down'); }) } as unknown as IMetadataProvider;
            const result = await RealtimeSessionEventService.Instance.Publish({
                AgentSessionID: SESSION_ID,
                Type: 'identity.verified',
                Payload: VERIFIED,
                ContextUser: USER,
                Provider: broken,
            });
            expect(result).toMatchObject({ Success: false });
            expect(result.ErrorMessage).toContain('db down');
        });
    });

    describe('PublishRouted', () => {
        it('fails loudly when PubSub is not configured', () => {
            PubSubManager.Instance.SetPubSubEngine(null as unknown as PubSubEngine);
            const result = RealtimeSessionEventService.Instance.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: null }, 'identity.verified', VERIFIED);
            expect(result).toMatchObject({ Success: false });
            expect(result.ErrorMessage).toContain('PubSub is not configured');
        });

        it('hands every locally published event to the replication hook', () => {
            const hook = vi.fn();
            RealtimeSessionEventService.Instance.SetReplicationHook(hook);
            RealtimeSessionEventService.Instance.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: null }, 'identity.verified', VERIFIED);
            expect(hook).toHaveBeenCalledTimes(1);
            expect(hook.mock.calls[0][0]).toMatchObject({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, Type: 'identity.verified' });
        });

        it('never lets a failing replication hook break local delivery', () => {
            RealtimeSessionEventService.Instance.SetReplicationHook(() => {
                throw new Error('redis down');
            });
            const result = RealtimeSessionEventService.Instance.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: null }, 'identity.verified', VERIFIED);
            expect(result).toEqual({ Success: true });
            expect(published).toHaveLength(1);
        });
    });

    describe('PublishReplicated', () => {
        it('republishes locally and never back through the replication hook (no loop)', () => {
            const hook = vi.fn();
            RealtimeSessionEventService.Instance.SetReplicationHook(hook);
            const payload: RealtimeSessionEventTopicPayload = {
                Type: 'identity.verified',
                AgentSessionID: SESSION_ID,
                OccurredAt: '2026-10-02T12:00:00.000Z',
                PayloadJson: JSON.stringify(VERIFIED),
                OwnerUserID: OWNER,
                ScopeKey: null,
                SourceServerId: 'other-instance',
            };
            RealtimeSessionEventService.Instance.PublishReplicated(payload);
            expect(published).toEqual([{ topic: REALTIME_SESSION_EVENTS_TOPIC, payload }]);
            expect(hook).not.toHaveBeenCalled();
        });
    });
});

describe('ParseReplicatedRealtimeSessionEvent', () => {
    const wire = (over: Record<string, unknown> = {}) =>
        JSON.stringify({
            Type: 'identity.verified',
            AgentSessionID: SESSION_ID,
            OccurredAt: '2026-10-02T12:00:00.000Z',
            PayloadJson: '{}',
            OwnerUserID: OWNER,
            ScopeKey: 'scope-1',
            SourceServerId: 'other-instance',
            ...over,
        });

    it('accepts a well-formed event from another instance', () => {
        expect(ParseReplicatedRealtimeSessionEvent(wire(), 'this-instance')).toEqual({
            Type: 'identity.verified',
            AgentSessionID: SESSION_ID,
            OccurredAt: '2026-10-02T12:00:00.000Z',
            PayloadJson: '{}',
            OwnerUserID: OWNER,
            ScopeKey: 'scope-1',
            SourceServerId: 'other-instance',
        });
    });

    it('drops our own echo', () => {
        expect(ParseReplicatedRealtimeSessionEvent(wire({ SourceServerId: 'this-instance' }), 'this-instance')).toBeNull();
    });

    it('fails closed when the routing identity is missing or malformed', () => {
        expect(ParseReplicatedRealtimeSessionEvent(wire({ OwnerUserID: undefined }), 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent(wire({ OwnerUserID: '' }), 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent(wire({ OwnerUserID: 5 }), 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent(wire({ ScopeKey: 5 }), 'x')).toBeNull();
    });

    it('normalises an absent scope to null and tolerates an absent source', () => {
        const parsed = ParseReplicatedRealtimeSessionEvent(wire({ ScopeKey: undefined, SourceServerId: undefined }), 'x');
        expect(parsed?.ScopeKey).toBeNull();
        expect(parsed?.SourceServerId).toBeUndefined();
    });

    it('drops non-JSON, non-objects and events missing required strings', () => {
        expect(ParseReplicatedRealtimeSessionEvent('{nope', 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent('"text"', 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent('null', 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent(wire({ Type: undefined }), 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent(wire({ PayloadJson: undefined }), 'x')).toBeNull();
        expect(ParseReplicatedRealtimeSessionEvent(wire({ SourceServerId: 7 }), 'x')).toBeNull();
    });
});

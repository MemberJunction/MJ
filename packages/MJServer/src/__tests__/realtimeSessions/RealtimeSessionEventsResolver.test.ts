import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PubSub } from 'graphql-subscriptions';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { PubSubManager } from '../../generic/PubSubManager.js';
import type { UserPayload } from '../../types.js';
import { RealtimeSessionEventService, type RealtimeSessionEventTopicPayload } from '../../realtimeSessions/RealtimeSessionEventService.js';
import type { LoadedSessionForAccess } from '../../realtimeSessions/sessionAccess.js';
import { AuthorizeAndSubscribeToRealtimeSessionEvents, RealtimeSessionEventsResolver } from '../../resolvers/RealtimeSessionEventsResolver.js';
import {
    AuthorizeRealtimeSessionSubscription,
    RealtimeSessionEventsFilter,
    type RealtimeSessionEventsContext,
    type SubscriptionAuthorizationDeps,
} from '../../realtimeSessions/subscriptionAuthorization.js';

const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
const STRANGER = 'AAAAAAAA-0000-4000-8000-000000000002';
const SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000001';
const OTHER_SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000002';

/** A connection context for a principal. */
function contextFor(user: Partial<UserInfo> & { ID: string }): RealtimeSessionEventsContext {
    return { userPayload: { email: 'x@y.z', sessionId: 's', userRecord: user } as UserPayload };
}

const named = (id: string) => contextFor({ ID: id });
const guest = (id: string, scope?: string) =>
    contextFor({ ID: id, IsMagicLinkAnonymous: true, MagicLinkScope: scope ? { ResourceID: scope } : undefined } as Partial<UserInfo> & { ID: string });

function event(over: Partial<RealtimeSessionEventTopicPayload> = {}): RealtimeSessionEventTopicPayload {
    return {
        Type: 'identity.verified',
        AgentSessionID: SESSION_ID,
        OccurredAt: '2026-10-02T12:00:00.000Z',
        PayloadJson: '{"VerifiedEmail":"pat@example.com"}',
        OwnerUserID: OWNER,
        ScopeKey: null,
        ...over,
    };
}

describe('RealtimeSessionEventsFilter (per-event gate)', () => {
    const filter = (payload: RealtimeSessionEventTopicPayload, agentSessionId: string | undefined, context: RealtimeSessionEventsContext | undefined) =>
        RealtimeSessionEventsFilter({ payload, args: { agentSessionId }, context });

    it('delivers an event for the requested session to its owner', () => {
        expect(filter(event(), SESSION_ID, named(OWNER))).toBe(true);
    });

    it('does not deliver an event addressed to a different session', () => {
        expect(filter(event({ AgentSessionID: OTHER_SESSION_ID }), SESSION_ID, named(OWNER))).toBe(false);
    });

    it('does not deliver to a non-owner who guessed the session id', () => {
        expect(filter(event(), SESSION_ID, named(STRANGER))).toBe(false);
    });

    it('compares session and user ids case-insensitively', () => {
        expect(filter(event({ AgentSessionID: SESSION_ID.toLowerCase(), OwnerUserID: OWNER.toLowerCase() }), SESSION_ID, named(OWNER))).toBe(true);
    });

    describe('anonymous guests share one Anonymous user — only the signed scope tells them apart', () => {
        it('delivers to the guest whose scope matches', () => {
            expect(filter(event({ ScopeKey: 'scope-1' }), SESSION_ID, guest(OWNER, 'scope-1'))).toBe(true);
        });

        it('does not deliver to another guest (same user id, different scope)', () => {
            expect(filter(event({ ScopeKey: 'scope-1' }), SESSION_ID, guest(OWNER, 'scope-2'))).toBe(false);
        });

        it('does not deliver to an anonymous connection with no scope', () => {
            expect(filter(event({ ScopeKey: 'scope-1' }), SESSION_ID, guest(OWNER))).toBe(false);
        });
    });

    it('fails closed on a missing connection identity, owner or argument', () => {
        expect(filter(event(), SESSION_ID, undefined)).toBe(false);
        expect(filter(event(), SESSION_ID, { userPayload: undefined })).toBe(false);
        expect(filter(event({ OwnerUserID: '' }), SESSION_ID, named(OWNER))).toBe(false);
        expect(filter(event(), undefined, named(OWNER))).toBe(false);
    });
});

describe('AuthorizeRealtimeSessionSubscription (subscribe-time gate)', () => {
    /** Deps whose session load returns the given owner/scope (or nothing). */
    const deps = (loaded: { UserID: string; ExternalID: string | null } | null): SubscriptionAuthorizationDeps & { LoadSession: ReturnType<typeof vi.fn> } => ({
        LoadSession: vi.fn(async () =>
            loaded ? ({ Session: { ID: SESSION_ID, UserID: loaded.UserID }, ConversationExternalID: loaded.ExternalID } as unknown as LoadedSessionForAccess) : null,
        ),
        GetProvider: () => ({}) as IMetadataProvider,
    });

    it('lets the owner subscribe and returns the validated id', async () => {
        const d = deps({ UserID: OWNER, ExternalID: null });
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, named(OWNER), d)).resolves.toBe(SESSION_ID);
        expect(d.LoadSession).toHaveBeenCalledWith(SESSION_ID, expect.objectContaining({ ID: OWNER }), expect.anything());
    });

    it('refuses a non-owner with the uniform not-found message', async () => {
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, named(STRANGER), deps({ UserID: OWNER, ExternalID: null }))).rejects.toThrow('Realtime session not found.');
    });

    it('gives the SAME message when the session does not exist, so ids cannot be probed', async () => {
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, named(OWNER), deps(null))).rejects.toThrow('Realtime session not found.');
    });

    it('refuses an anonymous guest whose scope does not match the session conversation', async () => {
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, guest(OWNER, 'scope-2'), deps({ UserID: OWNER, ExternalID: 'scope-1' }))).rejects.toThrow('Realtime session not found.');
    });

    it('accepts an anonymous guest whose scope matches', async () => {
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, guest(OWNER, 'scope-1'), deps({ UserID: OWNER, ExternalID: 'scope-1' }))).resolves.toBe(SESSION_ID);
    });

    it('refuses an anonymous connection with no scope', async () => {
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, guest(OWNER), deps({ UserID: OWNER, ExternalID: 'scope-1' }))).rejects.toThrow('Realtime session not found.');
    });

    it('refuses without touching the database when there is no identity or the id is malformed', async () => {
        const d = deps({ UserID: OWNER, ExternalID: null });
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, undefined, d)).rejects.toThrow('Realtime session not found.');
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: SESSION_ID }, { userPayload: undefined }, d)).rejects.toThrow();
        await expect(AuthorizeRealtimeSessionSubscription({ agentSessionId: 'not-a-uuid' }, named(OWNER), d)).rejects.toThrow();
        await expect(AuthorizeRealtimeSessionSubscription({}, named(OWNER), d)).rejects.toThrow();
        expect(d.LoadSession).not.toHaveBeenCalled();
    });
});

describe('RealtimeSessionEvents subscription, end to end over a real PubSub', () => {
    let engine: PubSub;
    const info = {};

    beforeEach(() => {
        engine = new PubSub();
        PubSubManager.Instance.SetPubSubEngine(engine as unknown as PubSubEngine);
        RealtimeSessionEventService.Instance.SetReplicationHook(undefined);
    });

    const allow = (loaded: { UserID: string; ExternalID: string | null }): SubscriptionAuthorizationDeps => ({
        LoadSession: async () => ({ Session: { ID: SESSION_ID, UserID: loaded.UserID }, ConversationExternalID: loaded.ExternalID }) as unknown as LoadedSessionForAccess,
        GetProvider: () => ({}) as IMetadataProvider,
    });

    const VERIFIED = { VerifiedEmail: 'pat@example.com', VerifiedName: 'Pat', VerifiedAt: '2026-10-02T12:00:00.000Z', Method: 'code' as const };

    /** graphql-subscriptions registers its PubSub listener lazily, on the first `next()`; let that settle before publishing. */
    const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

    it('refuses a non-owner before any stream is opened', async () => {
        await expect(
            AuthorizeAndSubscribeToRealtimeSessionEvents({}, { agentSessionId: SESSION_ID }, named(STRANGER), info, allow({ UserID: OWNER, ExternalID: null })),
        ).rejects.toThrow('Realtime session not found.');
    });

    it('delivers only the owner\'s events for the requested session, in order, and nothing else', async () => {
        const stream = await AuthorizeAndSubscribeToRealtimeSessionEvents({}, { agentSessionId: SESSION_ID }, named(OWNER), info, allow({ UserID: OWNER, ExternalID: null }));
        const service = RealtimeSessionEventService.Instance;
        const firstPull = stream.next(); // starts the subscription
        await settled();

        // Noise that must NOT arrive: another session of the same owner, and another owner's event for the same id.
        service.PublishRouted({ AgentSessionID: OTHER_SESSION_ID, OwnerUserID: OWNER, ScopeKey: null }, 'identity.verified', VERIFIED);
        service.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: STRANGER, ScopeKey: null }, 'identity.verified', { ...VERIFIED, VerifiedEmail: 'leak@example.com' });
        // The two that must.
        service.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: null }, 'identity.verified', VERIFIED);
        service.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: null }, 'identity.verified', { ...VERIFIED, Method: 'link' });

        const first = await firstPull;
        const second = await stream.next();
        expect(JSON.parse(first.value.PayloadJson)).toMatchObject({ VerifiedEmail: 'pat@example.com', Method: 'code' });
        expect(JSON.parse(second.value.PayloadJson)).toMatchObject({ Method: 'link' });
        expect(first.value.AgentSessionID).toBe(SESSION_ID);

        // Nothing else is queued: a third event never arrives until one is published.
        const pending = stream.next();
        const raced = await Promise.race([pending.then(() => 'delivered'), new Promise((resolve) => setTimeout(() => resolve('quiet'), 30))]);
        expect(raced).toBe('quiet');
        await stream.return?.();
    });

    it('does not deliver a guest\'s event to a different guest sharing the Anonymous user', async () => {
        const guestB = await AuthorizeAndSubscribeToRealtimeSessionEvents({}, { agentSessionId: SESSION_ID }, guest(OWNER, 'scope-B'), info, allow({ UserID: OWNER, ExternalID: 'scope-B' }));
        const pull = guestB.next();
        await settled();
        // An event for guest A's session id would never reach B (the id differs); simulate the worst case: same id, A's scope.
        RealtimeSessionEventService.Instance.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: 'scope-A' }, 'identity.verified', VERIFIED);
        RealtimeSessionEventService.Instance.PublishRouted({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: 'scope-B' }, 'identity.verified', { ...VERIFIED, VerifiedEmail: 'b@example.com' });
        const got = await pull;
        expect(JSON.parse(got.value.PayloadJson).VerifiedEmail).toBe('b@example.com');
        await guestB.return?.();
    });

    it('fails when PubSub is not configured', async () => {
        PubSubManager.Instance.SetPubSubEngine(null as unknown as PubSubEngine);
        await expect(
            AuthorizeAndSubscribeToRealtimeSessionEvents({}, { agentSessionId: SESSION_ID }, named(OWNER), info, allow({ UserID: OWNER, ExternalID: null })),
        ).rejects.toThrow('PubSub is not configured');
    });
});

describe('RealtimeSessionEventsResolver.RealtimeSessionEvents (resolve)', () => {
    it('returns the wire event and never exposes the routing snapshot', () => {
        const out = new RealtimeSessionEventsResolver().RealtimeSessionEvents(event({ ScopeKey: 'scope-1' }), SESSION_ID);
        expect(out).toEqual({
            Type: 'identity.verified',
            AgentSessionID: SESSION_ID,
            OccurredAt: '2026-10-02T12:00:00.000Z',
            PayloadJson: '{"VerifiedEmail":"pat@example.com"}',
        });
        expect(Object.keys(out)).not.toContain('OwnerUserID');
        expect(Object.keys(out)).not.toContain('ScopeKey');
    });
});

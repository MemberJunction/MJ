/**
 * pushStatusResolver.filter.test.ts — locks the security-critical subscription filter for B49.
 *
 * `statusUpdatesFilter` is the gate that fixes the `statusUpdates` session-hijack: a push is
 * delivered only when the push's `sessionId` matches the subscriber's requested session AND the
 * push's `ownerUserId` matches the subscriber CONNECTION's server-authenticated identity. Knowing
 * a victim's client-chosen `sessionId` must no longer be sufficient to receive their pushes.
 *
 * The filter is a pure function (no DB / config / transport), so these are plain unit tests.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { StatusUpdatesFilter, StatusUpdateOwnerID, type PushStatusNotificationPayload, type StatusUpdatesFilterContext } from '../generic/PushStatusResolver';
import type { UserPayload } from '../types';

const OWNER = 'AA11BB22-0000-4000-8000-000000000001';
const ATTACKER = 'CC33DD44-0000-4000-8000-000000000002';
const SESSION = 'session-abc-123';

function ctxFor(userId: string | undefined): StatusUpdatesFilterContext {
  // userRecord is `any` in UserPayload; a minimal shape with ID is all the filter reads.
  return { userPayload: (userId ? { userRecord: { ID: userId } } : {}) as unknown as UserPayload };
}

function push(overrides: Partial<PushStatusNotificationPayload> = {}): PushStatusNotificationPayload {
  return { sessionId: SESSION, ownerUserId: OWNER, message: 'progress', ...overrides };
}

describe('statusUpdatesFilter (B49 session-hijack gate)', () => {
  it('delivers when sessionId matches AND the connection identity owns the push', () => {
    expect(StatusUpdatesFilter({ payload: push(), args: { sessionId: SESSION }, context: ctxFor(OWNER) })).toBe(true);
  });

  it('THE FIX: rejects a matching sessionId when the connection identity is a DIFFERENT user (hijack)', () => {
    // Attacker lifted the victim's sessionId and subscribes with it — but their authenticated
    // connection identity is their own, so delivery must be denied.
    expect(StatusUpdatesFilter({ payload: push({ ownerUserId: OWNER }), args: { sessionId: SESSION }, context: ctxFor(ATTACKER) })).toBe(false);
  });

  it('rejects when the requested sessionId does not match the push', () => {
    expect(StatusUpdatesFilter({ payload: push(), args: { sessionId: 'some-other-session' }, context: ctxFor(OWNER) })).toBe(false);
  });

  it('fails closed when the push carries no ownerUserId', () => {
    expect(StatusUpdatesFilter({ payload: push({ ownerUserId: '' }), args: { sessionId: SESSION }, context: ctxFor(OWNER) })).toBe(false);
  });

  it('fails closed when the connection has no authenticated identity', () => {
    expect(StatusUpdatesFilter({ payload: push(), args: { sessionId: SESSION }, context: ctxFor(undefined) })).toBe(false);
    expect(StatusUpdatesFilter({ payload: push(), args: { sessionId: SESSION }, context: undefined })).toBe(false);
  });

  it('matches identity case-insensitively (SQL Server upper vs PostgreSQL lower UUIDs)', () => {
    expect(StatusUpdatesFilter({ payload: push({ ownerUserId: OWNER.toUpperCase() }), args: { sessionId: SESSION }, context: ctxFor(OWNER.toLowerCase()) })).toBe(true);
  });

  it('delivers server-originated wildcard sessionId ("*") pushes ONLY when ownerUserId matches the connection user', () => {
    expect(StatusUpdatesFilter({ payload: push({ sessionId: '*', ownerUserId: OWNER }), args: { sessionId: SESSION }, context: ctxFor(OWNER) })).toBe(true);
    expect(StatusUpdatesFilter({ payload: push({ sessionId: '*', ownerUserId: OWNER }), args: { sessionId: SESSION }, context: ctxFor(ATTACKER) })).toBe(false);
    expect(StatusUpdatesFilter({ payload: push({ sessionId: '*', ownerUserId: '' }), args: { sessionId: SESSION }, context: ctxFor(OWNER) })).toBe(false);
  });
});


describe('StatusUpdateOwnerID (#4931)', () => {
    it('is the request user, or the user an elevated payload stands in for', () => {
        expect(StatusUpdateOwnerID({ sessionId: 's', email: 'e', userRecord: { ID: 'user-1' } } as UserPayload)).toBe('user-1');
        expect(StatusUpdateOwnerID({ sessionId: 's', email: 'e', userRecord: { ID: 'system' }, ElevatedFrom: { ID: 'guest' } } as unknown as UserPayload)).toBe('guest');
        expect(StatusUpdateOwnerID(undefined)).toBe('');
    });
});

describe('statusUpdatesFilter — anonymous visitors share one user id (#4931)', () => {
    const ANON = 'AAAAAAAA-0000-4000-8000-0000000000A0';
    const visitor = (sid: string) => ({ ID: ANON, IsMagicLinkAnonymous: true, AnonymousVisitorID: sid, MagicLinkScope: { ResourceID: sid } });
    const connection = (user: object): StatusUpdatesFilterContext => ({ userPayload: { sessionId: 'same-session', email: 'anonymous@magic-link.local', userRecord: user } as unknown as UserPayload });
    // Visitor A's run, elevated to the system user: the event's owner comes from ElevatedFrom.
    const aRun = { sessionId: 'same-session', email: 'system@example.com', userRecord: { ID: 'system' }, ElevatedFrom: visitor('sid-a') } as unknown as UserPayload;
    const event = (): PushStatusNotificationPayload => ({ sessionId: 'same-session', ownerUserId: StatusUpdateOwnerID(aRun), message: 'complete' });

    it("delivers visitor A's run events to visitor A's connection", () => {
        expect(StatusUpdatesFilter({ payload: event(), args: { sessionId: 'same-session' }, context: connection(visitor('sid-a')) })).toBe(true);
    });

    it('does not deliver them to visitor B, even with the same (client-chosen) session id', () => {
        expect(StatusUpdatesFilter({ payload: event(), args: { sessionId: 'same-session' }, context: connection(visitor('sid-b')) })).toBe(false);
    });

    it('does not deliver them to an anonymous connection with no scope identity (fail closed)', () => {
        expect(StatusUpdatesFilter({ payload: event(), args: { sessionId: 'same-session' }, context: connection({ ID: ANON, IsMagicLinkAnonymous: true }) })).toBe(false);
    });
});

describe('statusUpdatesFilter — an anonymous owner key matches exactly', () => {
    // The scope part is a signed, case-significant identity (an mj_sid or a resource scope), so the anonymous key is
    // compared exactly. A UUID comparison (case- and whitespace-insensitive) would let a visitor whose scope differs
    // only in case or padding receive another visitor's run events.
    const ANON = 'AAAAAAAA-0000-4000-8000-0000000000A0';
    const visitor = (sid: string) => ({ ID: ANON, IsMagicLinkAnonymous: true, AnonymousVisitorID: sid, MagicLinkScope: { ResourceID: sid } });
    const connection = (user: object): StatusUpdatesFilterContext => ({ userPayload: { sessionId: 's', email: 'anonymous@magic-link.local', userRecord: user } as UserPayload });
    const eventOwnedBy = (sid: string): PushStatusNotificationPayload => ({
        sessionId: 's',
        ownerUserId: `${ANON.toLowerCase()}|${sid}`,
        message: 'complete',
    });

    it('delivers to the visitor whose scope is identical', () => {
        expect(StatusUpdatesFilter({ payload: eventOwnedBy('sid-a'), args: { sessionId: 's' }, context: connection(visitor('sid-a')) })).toBe(true);
    });

    it('does not deliver when the scopes differ only by case', () => {
        expect(StatusUpdatesFilter({ payload: eventOwnedBy('SID-A'), args: { sessionId: 's' }, context: connection(visitor('sid-a')) })).toBe(false);
    });

    it('does not deliver when the scopes differ only by surrounding whitespace', () => {
        expect(StatusUpdatesFilter({ payload: eventOwnedBy('sid-a '), args: { sessionId: 's' }, context: connection(visitor('sid-a')) })).toBe(false);
        expect(StatusUpdatesFilter({ payload: eventOwnedBy('sid-a'), args: { sessionId: 's' }, context: connection(visitor(' sid-a')) })).toBe(false);
    });
});

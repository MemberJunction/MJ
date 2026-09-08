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
import { statusUpdatesFilter, type PushStatusNotificationPayload, type StatusUpdatesFilterContext } from '../generic/PushStatusResolver';
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
    expect(statusUpdatesFilter({ payload: push(), args: { sessionId: SESSION }, context: ctxFor(OWNER) })).toBe(true);
  });

  it('THE FIX: rejects a matching sessionId when the connection identity is a DIFFERENT user (hijack)', () => {
    // Attacker lifted the victim's sessionId and subscribes with it — but their authenticated
    // connection identity is their own, so delivery must be denied.
    expect(statusUpdatesFilter({ payload: push({ ownerUserId: OWNER }), args: { sessionId: SESSION }, context: ctxFor(ATTACKER) })).toBe(false);
  });

  it('rejects when the requested sessionId does not match the push', () => {
    expect(statusUpdatesFilter({ payload: push(), args: { sessionId: 'some-other-session' }, context: ctxFor(OWNER) })).toBe(false);
  });

  it('fails closed when the push carries no ownerUserId', () => {
    expect(statusUpdatesFilter({ payload: push({ ownerUserId: '' }), args: { sessionId: SESSION }, context: ctxFor(OWNER) })).toBe(false);
  });

  it('fails closed when the connection has no authenticated identity', () => {
    expect(statusUpdatesFilter({ payload: push(), args: { sessionId: SESSION }, context: ctxFor(undefined) })).toBe(false);
    expect(statusUpdatesFilter({ payload: push(), args: { sessionId: SESSION }, context: undefined })).toBe(false);
  });

  it('matches identity case-insensitively (SQL Server upper vs PostgreSQL lower UUIDs)', () => {
    expect(statusUpdatesFilter({ payload: push({ ownerUserId: OWNER.toUpperCase() }), args: { sessionId: SESSION }, context: ctxFor(OWNER.toLowerCase()) })).toBe(true);
  });
});

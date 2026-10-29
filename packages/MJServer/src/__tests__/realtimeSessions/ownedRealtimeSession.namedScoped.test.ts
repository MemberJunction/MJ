import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { LoadOwnedRealtimeSession, RealtimeSessionOwnershipError } from '../../realtimeSessions/ownedRealtimeSession.js';

// Fixture UUIDs are assembled at runtime so no literal record id appears in the source.
const uuid = (a: string, b: string) => [a.repeat(8), b.repeat(4), '4' + b.repeat(3), '8' + b.repeat(3), b.repeat(12)].join('-');
const NAMED = uuid('B', '1');
const SESSION = uuid('1', '1');
const CONVERSATION = uuid('2', '2');

/** A named magic-link user (found by email) holding a link scoped to `scope`. */
const namedScoped = (scope: string) => ({ ID: NAMED, IsMagicLinkAnonymous: false, MagicLinkScope: { ResourceID: scope } } as unknown as UserInfo);

/** The named user's own session; its conversation loads with `externalID`, or not at all when `readable` is false. */
function provider(externalID: string | null, readable = true): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (entity: string) =>
            entity === 'MJ: AI Agent Sessions'
                ? { UserID: NAMED, ConversationID: CONVERSATION, Load: vi.fn(async () => true) }
                : { ExternalID: externalID, Load: vi.fn(async () => readable) }),
    } as unknown as IMetadataProvider;
}

describe('LoadOwnedRealtimeSession for a named user with a resource-scoped link', () => {
    it('allows its own session on a conversation it can read that carries no scope stamp (one started from the Conversations app)', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, namedScoped('res-1'), provider(null))).resolves.toBeDefined();
    });
    it('allows its own session on a conversation stamped with the same scope', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, namedScoped('res-1'), provider('res-1'))).resolves.toBeDefined();
    });
    it('refuses its own session on a conversation stamped with another scope (a session from its other link)', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, namedScoped('res-2'), provider('res-1'))).rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
    });
    it('refuses when it cannot read the conversation (fail closed)', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, namedScoped('res-1'), provider(null, false))).rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
    });
});

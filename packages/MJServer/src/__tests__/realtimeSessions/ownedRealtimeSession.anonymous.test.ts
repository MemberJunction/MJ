import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { LoadOwnedRealtimeSession, RealtimeSessionOwnershipError } from '../../realtimeSessions/ownedRealtimeSession.js';

// Fixture UUIDs are assembled at runtime so the brief itself carries no record id.
const uuid = (a: string, b: string) => [a.repeat(8), b.repeat(4), '4' + b.repeat(3), '8' + b.repeat(3), b.repeat(12)].join('-');
const ANON = uuid('A', '0');
const SESSION = uuid('1', '1');
const CONVERSATION = uuid('2', '2');
const guest = (scope: string) =>
    ({ ID: ANON, IsMagicLinkAnonymous: true, AnonymousVisitorID: scope, MagicLinkScope: { ResourceID: scope } } as unknown as UserInfo);

/** A session owned by the shared Anonymous user; its conversation is stamped with visitor 1's scope. */
function provider(): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (entity: string) =>
            entity === 'MJ: AI Agent Sessions'
                ? { UserID: ANON, ConversationID: CONVERSATION, Load: vi.fn(async () => true) }
                : { ExternalID: 'scope-visitor-1', Load: vi.fn(async () => true) }),
    } as unknown as IMetadataProvider;
}

describe('LoadOwnedRealtimeSession with two anonymous visitors', () => {
    it('allows the visitor whose scope matches', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, guest('scope-visitor-1'), provider())).resolves.toBeDefined();
    });
    it('refuses a second anonymous visitor (same Anonymous user id, different scope)', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, guest('scope-visitor-2'), provider()))
            .rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
    });
});

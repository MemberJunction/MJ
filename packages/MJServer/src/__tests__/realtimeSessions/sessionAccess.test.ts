import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AuthorizeSessionAccess, LoadSessionForAccess } from '../../realtimeSessions/sessionAccess.js';

const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
const OTHER = 'AAAAAAAA-0000-4000-8000-000000000002';
const SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000001';
const CONVERSATION_ID = 'CCCCCCCC-0000-4000-8000-000000000001';

describe('AuthorizeSessionAccess', () => {
    it('allows the named owner', () => {
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, { ID: OWNER })).toEqual({ Allowed: true });
    });

    it('compares user ids case-insensitively (SQL Server uppercases, PostgreSQL lowercases)', () => {
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, { ID: OWNER.toLowerCase() })).toEqual({ Allowed: true });
    });

    it('refuses a non-owner', () => {
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, { ID: OTHER })).toEqual({ Allowed: false, Reason: 'not_owner' });
    });

    it('refuses a missing principal and a missing owner (fail closed)', () => {
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, null)).toEqual({ Allowed: false, Reason: 'not_owner' });
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, undefined)).toEqual({ Allowed: false, Reason: 'not_owner' });
        expect(AuthorizeSessionAccess({ SessionUserID: '', ConversationExternalID: null }, { ID: OWNER })).toEqual({ Allowed: false, Reason: 'not_owner' });
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, { ID: '' })).toEqual({ Allowed: false, Reason: 'not_owner' });
    });

    describe('anonymous widget guests (one shared Anonymous user)', () => {
        const guest = (scope?: string) => ({ ID: OWNER, IsMagicLinkAnonymous: true, MagicLinkScope: scope ? { ResourceID: scope } : undefined });

        it('allows a guest whose signed scope matches the conversation ExternalID', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'scope-1' }, guest('scope-1'))).toEqual({ Allowed: true });
        });

        it('refuses a different guest (same Anonymous user id, different scope) — the cross-guest leak', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'scope-1' }, guest('scope-2'))).toEqual({
                Allowed: false,
                Reason: 'scope_mismatch',
            });
        });

        it('refuses an anonymous principal with no scope at all', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'scope-1' }, guest())).toEqual({
                Allowed: false,
                Reason: 'scope_missing',
            });
        });

        it('refuses when the conversation carries no scope id (unreadable or unscoped)', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, guest('scope-1'))).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: undefined }, guest('scope-1'))).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
        });

        it('compares scope ids exactly — they are case-significant opaque strings, not UUIDs', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'AbC' }, guest('abc'))).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
        });

        it('still requires the owner to match', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OTHER, ConversationExternalID: 'scope-1' }, guest('scope-1'))).toEqual({ Allowed: false, Reason: 'not_owner' });
        });
    });

    it('requires a scope match for a NAMED principal that carries a resource scope', () => {
        const scoped = { ID: OWNER, MagicLinkScope: { ResourceID: 'share-1' } };
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'share-1' }, scoped)).toEqual({ Allowed: true });
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'other' }, scoped)).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
    });

    it('does not require a scope of a named principal without one, whatever the conversation says', () => {
        expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'scope-1' }, { ID: OWNER })).toEqual({ Allowed: true });
    });
});

/** Builds a fake provider whose entities load from the given rows. */
function fakeProvider(rows: { session?: Record<string, unknown> | null; conversation?: Record<string, unknown> | null; conversationThrows?: boolean }): IMetadataProvider {
    const entity = (row: Record<string, unknown> | null | undefined, throws = false) => ({
        ...(row ?? {}),
        Load: vi.fn(async () => {
            if (throws) throw new Error('db down');
            return row != null;
        }),
    });
    return {
        GetEntityObject: vi.fn(async (name: string) => {
            if (name === 'MJ: AI Agent Sessions') return entity(rows.session);
            if (name === 'MJ: Conversations') return entity(rows.conversation, rows.conversationThrows);
            throw new Error(`unexpected entity ${name}`);
        }),
    } as unknown as IMetadataProvider;
}

const USER = { ID: OWNER } as UserInfo;

describe('LoadSessionForAccess', () => {
    it('loads the session and its conversation scope id', async () => {
        const provider = fakeProvider({ session: { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID }, conversation: { ExternalID: 'scope-1' } });
        const loaded = await LoadSessionForAccess(SESSION_ID, USER, provider);
        expect(loaded?.Session.ID).toBe(SESSION_ID);
        expect(loaded?.ConversationExternalID).toBe('scope-1');
    });

    it('returns null for a malformed id without touching the database', async () => {
        const provider = fakeProvider({});
        expect(await LoadSessionForAccess("x'; DROP TABLE y;--", USER, provider)).toBeNull();
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
    });

    it('returns null when the session does not exist (or the caller cannot read it)', async () => {
        expect(await LoadSessionForAccess(SESSION_ID, USER, fakeProvider({ session: null }))).toBeNull();
    });

    it('reports a null scope id when the session has no conversation', async () => {
        const loaded = await LoadSessionForAccess(SESSION_ID, USER, fakeProvider({ session: { ID: SESSION_ID, UserID: OWNER, ConversationID: null } }));
        expect(loaded?.ConversationExternalID).toBeNull();
    });

    it('reports a null scope id when the conversation is unreadable, so a scoped caller is refused downstream', async () => {
        const unreadable = await LoadSessionForAccess(SESSION_ID, USER, fakeProvider({ session: { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID }, conversation: null }));
        expect(unreadable?.ConversationExternalID).toBeNull();
        const throwing = await LoadSessionForAccess(
            SESSION_ID,
            USER,
            fakeProvider({ session: { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID }, conversation: {}, conversationThrows: true }),
        );
        expect(throwing?.ConversationExternalID).toBeNull();
    });
});

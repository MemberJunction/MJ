import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { AuthorizeSessionAccess, AuthorizeConversationTurn, AuthorizeAnonymousRoomSessions, LoadSessionForAccess, LoadSessionConversationScope, LoadConversationScope, AuthorizeLoadedSession } from '../../realtimeSessions/sessionAccess.js';

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

    describe('anonymous visitors (one shared Anonymous user, per-visitor AnonymousVisitorID)', () => {
        const guest = (visitorId?: string, resourceScope?: string) => ({
            ID: OWNER,
            IsMagicLinkAnonymous: true,
            AnonymousVisitorID: visitorId,
            MagicLinkScope: resourceScope ? { ResourceID: resourceScope } : visitorId ? { ResourceID: visitorId } : undefined,
        });

        it('allows a visitor whose AnonymousVisitorID matches the conversation ExternalID', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'scope-1' }, guest('scope-1'))).toEqual({ Allowed: true });
        });

        it('refuses a different widget guest (same Anonymous user id, different visitor id) — the cross-guest leak', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'scope-1' }, guest('scope-2'))).toEqual({
                Allowed: false,
                Reason: 'scope_mismatch',
            });
        });

        it('refuses an anonymous principal with neither a resource scope nor an AnonymousVisitorID', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'scope-1' }, guest(undefined))).toEqual({
                Allowed: false,
                Reason: 'scope_missing',
            });
        });

        describe('identity per token kind: MagicLinkScope.ResourceID when the token carries one, else mj_sid', () => {
            it('widget guest (ResourceID == mj_sid): matches its own sessionId', () => {
                expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'sid-w' }, guest('sid-w', 'sid-w'))).toEqual({ Allowed: true });
            });

            it('anonymous invite WITH a ResourceID: identity is the ResourceID, not its per-redemption mj_sid', () => {
                const visitor = guest('sid-redemption-1', 'invite-scope-R');
                expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'invite-scope-R' }, visitor)).toEqual({ Allowed: true });
                expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'sid-redemption-1' }, visitor)).toEqual({
                    Allowed: false,
                    Reason: 'scope_mismatch',
                });
            });

            it('anonymous invite WITHOUT a ResourceID: identity is mj_sid, so two redemptions are told apart', () => {
                const first = { ID: OWNER, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'sid-r1' };
                const second = { ID: OWNER, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'sid-r2' };
                expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'sid-r1' }, first)).toEqual({ Allowed: true });
                expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'sid-r1' }, second)).toEqual({
                    Allowed: false,
                    Reason: 'scope_mismatch',
                });
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

    describe('a NAMED principal with a resource scope on a conversation with no scope stamp', () => {
        const scoped = { ID: OWNER, MagicLinkScope: { ResourceID: 'share-1' } };

        it('is allowed when it could read the conversation (e.g. one started from the Conversations app)', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null, ConversationReadable: true }, scoped)).toEqual({ Allowed: true });
        });

        it('is refused when it could not read the conversation, or readability is unknown (fail closed)', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null, ConversationReadable: false }, scoped)).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null }, scoped)).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
        });

        it('still refuses a conversation stamped with another scope, readable or not', () => {
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: 'share-2', ConversationReadable: true }, scoped)).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
        });

        it('does not extend to an anonymous visitor, which an unstamped conversation cannot identify', () => {
            const visitor = { ID: OWNER, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'sid-1' };
            expect(AuthorizeSessionAccess({ SessionUserID: OWNER, ConversationExternalID: null, ConversationReadable: true }, visitor)).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
        });
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
        expect(loaded?.ConversationReadable).toBe(true);
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
        expect(loaded?.ConversationReadable).toBe(false);
    });

    it('reports a null scope id when the conversation is unreadable, so a scoped caller is refused downstream', async () => {
        const unreadable = await LoadSessionForAccess(SESSION_ID, USER, fakeProvider({ session: { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID }, conversation: null }));
        expect(unreadable?.ConversationExternalID).toBeNull();
        expect(unreadable?.ConversationReadable).toBe(false);
        const throwing = await LoadSessionForAccess(
            SESSION_ID,
            USER,
            fakeProvider({ session: { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID }, conversation: {}, conversationThrows: true }),
        );
        expect(throwing?.ConversationExternalID).toBeNull();
        expect(throwing?.ConversationReadable).toBe(false);
    });

    it('reports a readable conversation that carries no scope stamp', async () => {
        const loaded = await LoadSessionForAccess(SESSION_ID, USER, fakeProvider({ session: { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID }, conversation: { ExternalID: null } }));
        expect(loaded?.ConversationExternalID).toBeNull();
        expect(loaded?.ConversationReadable).toBe(true);
    });
});

describe('LoadSessionConversationScope', () => {
    const sessionWithConversation = { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID } as unknown as MJAIAgentSessionEntity;

    it('reads the conversation for an unscoped named user too, so its result is the conversation as that user sees it', async () => {
        const provider = fakeProvider({ conversation: { ExternalID: 'scope-1' } });
        const scope = await LoadSessionConversationScope(sessionWithConversation, USER, provider);
        expect(scope).toEqual({ ExternalID: 'scope-1', Readable: true });
        expect(provider.GetEntityObject).toHaveBeenCalledTimes(1);
    });

    it('reads the conversation when the caller carries a scope identity', async () => {
        const scopedUser = { ID: OWNER, MagicLinkScope: { ResourceID: 'scope-1' } } as unknown as UserInfo;
        const provider = fakeProvider({ conversation: { ExternalID: 'scope-1' } });
        const scope = await LoadSessionConversationScope(sessionWithConversation, scopedUser, provider);
        expect(scope).toEqual({ ExternalID: 'scope-1', Readable: true });
        expect(provider.GetEntityObject).toHaveBeenCalledTimes(1);
    });
});

describe('LoadConversationScope (a conversation addressed directly, e.g. by a text agent turn)', () => {
    it('reports the owner and scope id of a readable conversation', async () => {
        const scope = await LoadConversationScope(CONVERSATION_ID, USER, fakeProvider({ conversation: { UserID: OWNER, ExternalID: 'scope-1' } }));
        expect(scope).toEqual({ UserID: OWNER, ExternalID: 'scope-1', Readable: true });
    });

    it('reports an unreadable conversation (missing, refused by RLS, or a failed read) without an owner', async () => {
        expect(await LoadConversationScope(CONVERSATION_ID, USER, fakeProvider({ conversation: null }))).toEqual({ UserID: null, ExternalID: null, Readable: false });
        expect(await LoadConversationScope(CONVERSATION_ID, USER, fakeProvider({ conversation: {}, conversationThrows: true }))).toEqual({ UserID: null, ExternalID: null, Readable: false });
    });

    it('reports a null scope id for a readable conversation with no stamp', async () => {
        const scope = await LoadConversationScope(CONVERSATION_ID, USER, fakeProvider({ conversation: { UserID: OWNER, ExternalID: null } }));
        expect(scope).toEqual({ UserID: OWNER, ExternalID: null, Readable: true });
    });

    it('does not touch the database for an empty id', async () => {
        const provider = fakeProvider({});
        expect(await LoadConversationScope('', USER, provider)).toEqual({ UserID: null, ExternalID: null, Readable: false });
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
    });
});

describe('AuthorizeConversationTurn (a text agent turn addressed by a message in the conversation, MJ#6032)', () => {
    const ANON = 'AAAAAAAA-0000-4000-8000-00000000A0A0';
    const visitor = (sid: string) => ({ ID: ANON, IsMagicLinkAnonymous: true, AnonymousVisitorID: sid, MagicLinkScope: { ResourceID: sid } }) as unknown as UserInfo;

    it('allows a named principal without reading the conversation (its permissions already decided the turn)', async () => {
        const provider = fakeProvider({});
        expect(await AuthorizeConversationTurn(CONVERSATION_ID, { ID: OWNER } as UserInfo, provider)).toEqual({ Allowed: true });
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
    });

    it('allows the anonymous visitor whose scope id the conversation carries', async () => {
        const provider = fakeProvider({ conversation: { UserID: ANON, ExternalID: 'sid-1' } });
        expect(await AuthorizeConversationTurn(CONVERSATION_ID, visitor('sid-1'), provider)).toEqual({ Allowed: true });
    });

    it('refuses a second anonymous visitor — same shared user, different scope id (the UI-guest-role leak)', async () => {
        const provider = fakeProvider({ conversation: { UserID: ANON, ExternalID: 'sid-1' } });
        expect(await AuthorizeConversationTurn(CONVERSATION_ID, visitor('sid-2'), provider)).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
    });

    it('refuses an anonymous visitor when the conversation cannot be read or carries no scope id', async () => {
        expect(await AuthorizeConversationTurn(CONVERSATION_ID, visitor('sid-1'), fakeProvider({ conversation: null }))).toEqual({ Allowed: false, Reason: 'not_owner' });
        expect(await AuthorizeConversationTurn(CONVERSATION_ID, visitor('sid-1'), fakeProvider({ conversation: { UserID: ANON, ExternalID: null } }))).toEqual({ Allowed: false, Reason: 'scope_mismatch' });
    });
});

describe('AuthorizeAnonymousRoomSessions (who of the anonymous visitors owns a LiveKit room\'s agent session, MJ#6044)', () => {
    const ANON = 'AAAAAAAA-0000-4000-8000-00000000A0A0';
    const visitor = (sid: string) => ({ ID: ANON, IsMagicLinkAnonymous: true, AnonymousVisitorID: sid, MagicLinkScope: { ResourceID: sid } }) as unknown as UserInfo;
    const roomSession = { ID: SESSION_ID, UserID: ANON, ConversationID: CONVERSATION_ID };

    it("admits the visitor whose scope id the session's conversation carries", async () => {
        const provider = fakeProvider({ session: roomSession, conversation: { UserID: ANON, ExternalID: 'sid-1' } });
        expect(await AuthorizeAnonymousRoomSessions([SESSION_ID], visitor('sid-1'), provider)).toBe(true);
    });

    it('refuses another visitor — same shared user, different scope id', async () => {
        const provider = fakeProvider({ session: roomSession, conversation: { UserID: ANON, ExternalID: 'sid-1' } });
        expect(await AuthorizeAnonymousRoomSessions([SESSION_ID], visitor('sid-2'), provider)).toBe(false);
    });

    it('refuses when the session cannot be read as the caller', async () => {
        expect(await AuthorizeAnonymousRoomSessions([SESSION_ID], visitor('sid-1'), fakeProvider({ session: null }))).toBe(false);
    });

    it('refuses without reading anything when there is no session or no provider', async () => {
        const provider = fakeProvider({});
        expect(await AuthorizeAnonymousRoomSessions([], visitor('sid-1'), provider)).toBe(false);
        expect(await AuthorizeAnonymousRoomSessions([SESSION_ID], visitor('sid-1'), undefined)).toBe(false);
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
    });
});


describe('AuthorizeLoadedSession', () => {
    const principals: Array<[string, UserInfo]> = [
        ['named owner, no scope', { ID: OWNER } as UserInfo],
        ['named owner, scope-1', { ID: OWNER, MagicLinkScope: { ResourceID: 'scope-1' } } as unknown as UserInfo],
        ['named owner, scope-2', { ID: OWNER, MagicLinkScope: { ResourceID: 'scope-2' } } as unknown as UserInfo],
        ['anonymous, scope-1', { ID: OWNER, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'scope-1', MagicLinkScope: { ResourceID: 'scope-1' } } as unknown as UserInfo],
        ['anonymous, scope-2', { ID: OWNER, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'scope-2', MagicLinkScope: { ResourceID: 'scope-2' } } as unknown as UserInfo],
        ['anonymous, visitor id only', { ID: OWNER, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'scope-1' } as unknown as UserInfo],
        ['anonymous, no scope', { ID: OWNER, IsMagicLinkAnonymous: true } as unknown as UserInfo],
        ['named non-owner', { ID: OTHER } as UserInfo],
    ];
    const conversations: Array<[string, { conversationId: string | null; rows: Parameters<typeof fakeProvider>[0] }]> = [
        ['no conversation', { conversationId: null, rows: {} }],
        ['missing or refused', { conversationId: CONVERSATION_ID, rows: { conversation: null } }],
        ['read fails', { conversationId: CONVERSATION_ID, rows: { conversation: {}, conversationThrows: true } }],
        ['unstamped', { conversationId: CONVERSATION_ID, rows: { conversation: { ExternalID: null } } }],
        ['stamped scope-1', { conversationId: CONVERSATION_ID, rows: { conversation: { ExternalID: 'scope-1' } } }],
        ['stamped scope-2', { conversationId: CONVERSATION_ID, rows: { conversation: { ExternalID: 'scope-2' } } }],
    ];

    for (const [principalName, principal] of principals) {
        for (const [conversationName, { conversationId, rows }] of conversations) {
            it(`decides as if it always read the conversation: ${principalName} × ${conversationName}`, async () => {
                const session = { ID: SESSION_ID, UserID: OWNER, ConversationID: conversationId } as unknown as MJAIAgentSessionEntity;
                const scope = await LoadConversationScope(conversationId, principal, fakeProvider(rows));
                const alwaysRead = AuthorizeSessionAccess(
                    { SessionUserID: session.UserID, ConversationExternalID: scope.ExternalID, ConversationReadable: scope.Readable },
                    principal,
                );
                expect(await AuthorizeLoadedSession(session, principal, fakeProvider(rows))).toEqual(alwaysRead);
            });
        }
    }

    const sessionWithConversation = { ID: SESSION_ID, UserID: OWNER, ConversationID: CONVERSATION_ID } as unknown as MJAIAgentSessionEntity;
    const conversationReads = (provider: IMetadataProvider) =>
        vi.mocked(provider.GetEntityObject).mock.calls.filter(([name]) => name === 'MJ: Conversations').length;

    it('does not read the conversation for a named owner without a scope, the usual signed-in caller', async () => {
        const provider = fakeProvider({ conversation: { ExternalID: 'scope-1' } });
        expect(await AuthorizeLoadedSession(sessionWithConversation, USER, provider)).toEqual({ Allowed: true });
        expect(conversationReads(provider)).toBe(0);
    });

    it('does not read the conversation for a caller who does not own the session', async () => {
        const provider = fakeProvider({ conversation: { ExternalID: 'scope-1' } });
        expect(await AuthorizeLoadedSession(sessionWithConversation, { ID: OTHER } as UserInfo, provider)).toEqual({ Allowed: false, Reason: 'not_owner' });
        expect(conversationReads(provider)).toBe(0);
    });

    it('reads the conversation once for a caller with a scope identity', async () => {
        const provider = fakeProvider({ conversation: { ExternalID: 'scope-1' } });
        const guest = { ID: OWNER, IsMagicLinkAnonymous: true, AnonymousVisitorID: 'scope-1', MagicLinkScope: { ResourceID: 'scope-1' } } as unknown as UserInfo;
        expect(await AuthorizeLoadedSession(sessionWithConversation, guest, provider)).toEqual({ Allowed: true });
        expect(conversationReads(provider)).toBe(1);
    });
});

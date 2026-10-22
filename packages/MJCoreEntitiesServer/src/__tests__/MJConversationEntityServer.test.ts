/**
 * Unit tests for the anonymous-ownership-key guard on `MJ: Conversations` (#4931).
 *
 * `Conversation.ExternalID` is the scope identity an anonymous visitor's realtime session is keyed on
 * (`AuthorizeSessionAccess`). Every anonymous visitor shares one Anonymous user, so under a role whose
 * RLS filters by `UserID` (the stock `UI` role) one visitor can load another visitor's conversation; this
 * guard is what stops it from rewriting `ExternalID` to its own identity and passing the ownership gate.
 *
 * The generated base (`MJConversationEntity`) is mocked to a settable stub, matching
 * MJAIAgentSessionEntityServer.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for the generated MJConversationEntity. */
    class StubConversationEntity {
        public IsSaved = true;
        public ContextCurrentUser: unknown = null;
        public Fields = new Map<string, { Dirty: boolean }>();
        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }
        public GetFieldByName(name: string): unknown {
            return this.Fields.get(name) ?? null;
        }
    }
    return { MJConversationEntity: StubConversationEntity };
});

import { MJConversationEntityServer } from '../custom/MJConversationEntityServer.server';

type Stub = { IsSaved: boolean; ContextCurrentUser: unknown; Fields: Map<string, { Dirty: boolean }> };

function conversation(opts: { saved: boolean; externalIdDirty: boolean; anonymous: boolean }): MJConversationEntityServer {
    const entity = new MJConversationEntityServer();
    const stub = entity as unknown as Stub;
    stub.IsSaved = opts.saved;
    stub.ContextCurrentUser = { ID: 'anon-user', IsMagicLinkAnonymous: opts.anonymous };
    stub.Fields.set('ExternalID', { Dirty: opts.externalIdDirty });
    return entity;
}

describe('MJConversationEntityServer — ExternalID is not rewritable by an anonymous caller', () => {
    it('refuses an anonymous caller changing ExternalID on an existing conversation', () => {
        const result = conversation({ saved: true, externalIdDirty: true, anonymous: true }).Validate();
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('ExternalID');
    });

    it('allows an anonymous caller to set ExternalID when it creates the conversation (the session/widget create path)', () => {
        expect(conversation({ saved: false, externalIdDirty: true, anonymous: true }).Validate().Success).toBe(true);
    });

    it('allows an anonymous caller saving other fields of its conversation', () => {
        expect(conversation({ saved: true, externalIdDirty: false, anonymous: true }).Validate().Success).toBe(true);
    });

    it('allows a named caller changing ExternalID', () => {
        expect(conversation({ saved: true, externalIdDirty: true, anonymous: false }).Validate().Success).toBe(true);
    });
});

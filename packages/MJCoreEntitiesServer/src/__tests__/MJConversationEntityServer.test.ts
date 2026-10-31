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

vi.mock('@memberjunction/core-entities', async () => {
    // The real helper, so the guard reads AdditionalData exactly as the client does.
    const { IsInheritingFolderAccess, IsInheritingFolderAccessInSQL, CanonicalizeConversationAdditionalData } =
        await vi.importActual<typeof import('@memberjunction/core-entities')>('@memberjunction/core-entities');
    /** Minimal stand-in for the generated MJConversationEntity. */
    class StubConversationEntity {
        public IsSaved = true;
        public ContextCurrentUser: unknown = null;
        public Fields = new Map<string, { Dirty: boolean; OldValue?: unknown; Value?: unknown }>();
        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }
        public GetFieldByName(name: string): unknown {
            return this.Fields.get(name) ?? null;
        }
        public async Save(): Promise<boolean> {
            return true;
        }
    }
    return {
        MJConversationEntity: StubConversationEntity,
        IsInheritingFolderAccess,
        IsInheritingFolderAccessInSQL,
        CanonicalizeConversationAdditionalData,
    };
});

import { MJConversationEntityServer } from '../custom/MJConversationEntityServer.server';

type Field = { Dirty: boolean; OldValue?: unknown; Value?: unknown };
type Stub = { IsSaved: boolean; ContextCurrentUser: unknown; Fields: Map<string, Field>; TransactionGroup?: unknown };

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

describe('MJConversationEntityServer — a transaction variable cannot set ExternalID after the check (#4931)', () => {
    /** An anonymous caller's untouched, saved conversation enrolled in a group with these variables. */
    function inGroup(variables: (self: unknown) => Array<{ EntityObject: unknown; Type: 'Define' | 'Use'; FieldName: string }>): MJConversationEntityServer {
        const entity = conversation({ saved: true, externalIdDirty: false, anonymous: true });
        (entity as unknown as Stub).TransactionGroup = { Variables: variables(entity) };
        return entity;
    }

    it("refuses when a 'Use' variable will set ExternalID at submit (a Validate-time Dirty check cannot see it)", () => {
        const result = inGroup((self) => [{ EntityObject: self, Type: 'Use', FieldName: 'externalid' }]).Validate();
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('ExternalID');
    });

    it("refuses when a 'Use' variable will set ID, which re-points the update at another row", () => {
        expect(inGroup((self) => [{ EntityObject: self, Type: 'Use', FieldName: 'ID' }]).Validate().Success).toBe(false);
    });

    it("allows a 'Define' variable on this row, and a 'Use' variable on another row", () => {
        expect(inGroup((self) => [{ EntityObject: self, Type: 'Define', FieldName: 'ExternalID' }]).Validate().Success).toBe(true);
        expect(inGroup(() => [{ EntityObject: {}, Type: 'Use', FieldName: 'ExternalID' }]).Validate().Success).toBe(true);
    });
});

describe("MJConversationEntityServer — only the owner moves, re-owns or re-shares a conversation", () => {
    const OWNER = 'owner-1';
    /** A saved conversation owned by OWNER, saved by `savedBy`, with these fields changed. */
    function owned(savedBy: unknown, fields: Record<string, Field> = {}, saved = true): MJConversationEntityServer {
        const entity = new MJConversationEntityServer();
        const stub = entity as unknown as Stub;
        stub.IsSaved = saved;
        stub.ContextCurrentUser = savedBy;
        stub.Fields.set('UserID', { Dirty: false, OldValue: OWNER, Value: OWNER });
        for (const [name, field] of Object.entries(fields)) stub.Fields.set(name, field);
        return entity;
    }
    const colleague = { ID: 'colleague-2', IsMagicLinkAnonymous: false };
    const restricted = '{"inheritFolderAccess":false}';

    it('refuses a non-owner moving the conversation to another folder', () => {
        const result = owned(colleague, { ProjectID: { Dirty: true, OldValue: 'p1', Value: 'p-public' } }).Validate();
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('ProjectID');
    });

    it('refuses a non-owner changing the owner', () => {
        const entity = owned(colleague);
        (entity as unknown as Stub).Fields.set('UserID', { Dirty: true, OldValue: OWNER, Value: colleague.ID });
        expect(entity.Validate().Success).toBe(false);
    });

    it('refuses a non-owner turning folder inheritance back on', () => {
        const result = owned(colleague, { AdditionalData: { Dirty: true, OldValue: restricted, Value: null } }).Validate();
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('AdditionalData');
    });

    it('refuses a non-owner whose transaction variable will set ProjectID at submit', () => {
        const entity = owned(colleague);
        (entity as unknown as Stub).TransactionGroup = { Variables: [{ EntityObject: entity, Type: 'Use', FieldName: 'ProjectID' }] };
        expect(entity.Validate().Success).toBe(false);
    });

    it('allows a non-owner changing other AdditionalData keys without touching inheritance', () => {
        const fields = { AdditionalData: { Dirty: true, OldValue: restricted, Value: '{"inheritFolderAccess": false,"pinnedBy":"x"}' } };
        expect(owned(colleague, fields).Validate().Success).toBe(true);
    });

    it('allows the owner to move, re-own and re-share', () => {
        const fields = {
            ProjectID: { Dirty: true, OldValue: 'p1', Value: 'p2' },
            AdditionalData: { Dirty: true, OldValue: restricted, Value: null },
        };
        expect(owned({ ID: OWNER }, fields).Validate().Success).toBe(true);
    });

    it('allows the server itself (no context user) and a new conversation', () => {
        const move = { ProjectID: { Dirty: true, OldValue: 'p1', Value: 'p2' } };
        expect(owned(null, move).Validate().Success).toBe(true);
        expect(owned(colleague, move, false).Validate().Success).toBe(true);
    });
});

describe('MJConversationEntityServer — AdditionalData is stored in the spelling the SQL filter matches', () => {
    /** A saved conversation whose AdditionalData is being written as `value`. */
    function writing(value: string): MJConversationEntityServer {
        const entity = new MJConversationEntityServer();
        (entity as unknown as Stub).Fields.set('AdditionalData', { Dirty: true, OldValue: null, Value: value });
        return entity;
    }
    const stored = (entity: MJConversationEntityServer) => (entity as unknown as Stub).Fields.get('AdditionalData')?.Value;

    it.each([
        ['a space before the colon', '{"inheritFolderAccess" :false}'],
        ['two spaces', '{"inheritFolderAccess":  false}'],
        ['a tab', '{"inheritFolderAccess":\tfalse}'],
        ['a newline', '{\n  "inheritFolderAccess": false\n}'],
    ])('rewrites %s compactly on save', async (_label, value) => {
        const entity = writing(value);
        await entity.Save();
        expect(stored(entity)).toBe('{"inheritFolderAccess":false}');
    });

    it('keeps other keys, and leaves text that is not a JSON object alone', async () => {
        const object = writing('{ "pinnedBy": "x", "inheritFolderAccess" : false }');
        await object.Save();
        expect(stored(object)).toBe('{"pinnedBy":"x","inheritFolderAccess":false}');
        const notJson = writing('not json');
        await notJson.Save();
        expect(stored(notJson)).toBe('not json');
    });

    it('refuses a non-owner rewriting AdditionalData so the SQL filter reads it differently', () => {
        const entity = new MJConversationEntityServer();
        const stub = entity as unknown as Stub;
        stub.ContextCurrentUser = { ID: 'colleague-2' };
        stub.Fields.set('UserID', { Dirty: false, OldValue: 'owner-1', Value: 'owner-1' });
        // Not valid JSON, so the save cannot canonicalize it. The parser's fallback still reads false;
        // the SQL LIKE no longer matches, which would list the conversation to folder members.
        stub.Fields.set('AdditionalData', {
            Dirty: true,
            OldValue: '{"inheritFolderAccess":false}',
            Value: '{"inheritFolderAccess" :false, broken',
        });
        const result = entity.Validate();
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('AdditionalData');
    });
});

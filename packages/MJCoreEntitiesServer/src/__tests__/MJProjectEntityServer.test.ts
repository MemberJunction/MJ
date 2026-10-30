/**
 * Unit tests for the owner-only guard on `MJ: Projects` (conversation folders).
 *
 * A folder's `OwnerUserID` decides who sees it: clearing it makes the folder Public (listing its owner's
 * conversations to everyone) and setting it to yourself lets you share it. The generated base is mocked to a
 * settable stub, matching MJConversationEntityServer.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for MJProjectEntityExtended. */
    class StubProjectEntity {
        public IsSaved = true;
        public ContextCurrentUser: unknown = null;
        public TransactionGroup: unknown = null;
        public Fields = new Map<string, { Dirty: boolean; OldValue?: unknown; Value?: unknown }>();
        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }
        public GetFieldByName(name: string): unknown {
            return this.Fields.get(name) ?? null;
        }
    }
    return { MJProjectEntityExtended: StubProjectEntity };
});

import { MJProjectEntityServer } from '../custom/MJProjectEntityServer.server';

type Field = { Dirty: boolean; OldValue?: unknown; Value?: unknown };
type Stub = { IsSaved: boolean; ContextCurrentUser: unknown; TransactionGroup: unknown; Fields: Map<string, Field> };

const OWNER = 'owner-1';
const colleague = { ID: 'colleague-2' };

/** A saved folder whose stored owner is `owner`, saved by `savedBy`, with these fields changed. */
function folder(owner: string | null, savedBy: unknown, fields: Record<string, Field> = {}, saved = true): MJProjectEntityServer {
    const entity = new MJProjectEntityServer();
    const stub = entity as unknown as Stub;
    stub.IsSaved = saved;
    stub.ContextCurrentUser = savedBy;
    stub.Fields.set('OwnerUserID', { Dirty: false, OldValue: owner, Value: owner });
    stub.Fields.set('ParentID', { Dirty: false, OldValue: null, Value: null });
    for (const [name, field] of Object.entries(fields)) stub.Fields.set(name, field);
    return entity;
}

describe("MJProjectEntityServer — only the owner changes a folder's owner or parent", () => {
    it('refuses a non-owner making the folder Public (OwnerUserID -> null)', () => {
        const result = folder(OWNER, colleague, { OwnerUserID: { Dirty: true, OldValue: OWNER, Value: null } }).Validate();
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('OwnerUserID');
    });

    it('refuses a non-owner taking the folder over', () => {
        const fields = { OwnerUserID: { Dirty: true, OldValue: OWNER, Value: colleague.ID } };
        expect(folder(OWNER, colleague, fields).Validate().Success).toBe(false);
    });

    it('refuses a non-owner moving the folder under another folder', () => {
        const result = folder(OWNER, colleague, { ParentID: { Dirty: true, OldValue: null, Value: 'p2' } }).Validate();
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('ParentID');
    });

    it('refuses a non-owner whose transaction variable will set OwnerUserID at submit', () => {
        const entity = folder(OWNER, colleague);
        (entity as unknown as Stub).TransactionGroup = { Variables: [{ EntityObject: entity, Type: 'Use', FieldName: 'OwnerUserID' }] };
        expect(entity.Validate().Success).toBe(false);
    });

    it('lets the owner make the folder Public, hand it over, or move it', () => {
        expect(folder(OWNER, { ID: OWNER }, { OwnerUserID: { Dirty: true, OldValue: OWNER, Value: null } }).Validate().Success).toBe(true);
        expect(folder(OWNER, { ID: OWNER }, { OwnerUserID: { Dirty: true, OldValue: OWNER, Value: colleague.ID } }).Validate().Success).toBe(true);
        expect(folder(OWNER, { ID: OWNER }, { ParentID: { Dirty: true, OldValue: null, Value: 'p2' } }).Validate().Success).toBe(true);
    });

    it('refuses anyone claiming a Public folder, but lets its parent change', () => {
        expect(folder(null, colleague, { OwnerUserID: { Dirty: true, OldValue: null, Value: colleague.ID } }).Validate().Success).toBe(false);
        expect(folder(null, colleague, { ParentID: { Dirty: true, OldValue: null, Value: 'p2' } }).Validate().Success).toBe(true);
    });

    it('allows a non-owner saving other fields, the server itself, and a new folder', () => {
        expect(folder(OWNER, colleague, { Name: { Dirty: true, OldValue: 'a', Value: 'b' } }).Validate().Success).toBe(true);
        expect(folder(OWNER, null, { OwnerUserID: { Dirty: true, OldValue: OWNER, Value: null } }).Validate().Success).toBe(true);
        expect(folder(OWNER, colleague, { OwnerUserID: { Dirty: true, OldValue: OWNER, Value: null } }, false).Validate().Success).toBe(true);
    });
});

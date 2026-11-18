/**
 * Unit tests for the owner-only guard on `MJ: Projects` (conversation folders).
 *
 * A folder's `OwnerUserID` decides who sees it: clearing it makes the folder Public (listing its owner's
 * conversations to everyone) and setting it to yourself lets you share it. The generated base is mocked to a
 * settable stub, matching MJConversationEntityServer.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

/** The stored folders the cycle check reads, by ID: each one's ParentID. */
const storedParents = new Map<string, string | null>();

/** What the delete tests' reads return. */
const deleteReads = {
    /** Folder IDs that pass the caller's Delete row filter. */
    Deletable: new Set<string>(),
    /** The folder's direct subfolders and conversations. */
    Folders: [] as Array<{ ID: string }>,
    Conversations: [] as Array<{ ID: string }>,
    /** Every ExtraFilter read, for asserting what was asked. */
    Filters: [] as string[],
};

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        public async RunView(params: { ExtraFilter: string }) {
            deleteReads.Filters.push(params.ExtraFilter);
            const id = /ID='([^']+)'/.exec(params.ExtraFilter)?.[1] ?? '';
            if (params.ExtraFilter.includes(' AND (')) {
                return { Success: true, Results: deleteReads.Deletable.has(id) ? [{ ID: id }] : [] };
            }
            return { Success: true, Results: storedParents.has(id) ? [{ ParentID: storedParents.get(id) }] : [] };
        }
        public async RunViews(params: Array<{ EntityName: string }>) {
            return params.map((p) => ({
                Success: true,
                Results: p.EntityName === 'MJ: Projects' ? deleteReads.Folders : deleteReads.Conversations,
            }));
        }
    }
    return { ...actual, RunView: StubRunView };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system' }) } },
}));

vi.mock('@memberjunction/core-entities', () => {
    /** Minimal stand-in for MJProjectEntityExtended. */
    class StubProjectEntity {
        public ID = 'folder-a';
        public IsSaved = true;
        public ContextCurrentUser: unknown = null;
        public TransactionGroup: unknown = null;
        public RunViewProviderToUse: unknown = null;
        public Fields = new Map<string, { Dirty: boolean; OldValue?: unknown; Value?: unknown }>();
        public get ParentID(): string | null {
            return (this.Fields.get('ParentID')?.Value as string | null) ?? null;
        }
        public Validate(): { Success: boolean; Errors: unknown[] } {
            return { Success: true, Errors: [] };
        }
        public async ValidateAsync(): Promise<{ Success: boolean; Errors: unknown[] }> {
            return { Success: true, Errors: [] };
        }
        public GetFieldByName(name: string): unknown {
            return this.Fields.get(name) ?? null;
        }
        // ---- delete support
        public EntityInfo: unknown = null;
        public ProviderToUse: unknown = null;
        public Results: Array<{ Success: boolean; Message: string }> = [];
        /** The transaction group the base Delete saw, and how often it ran. */
        public DeleteCalls: unknown[] = [];
        public get LatestResult(): { Success: boolean; Message: string } | undefined {
            return this.Results[this.Results.length - 1];
        }
        public RegisterResultHistoryEntry(result: { Success: boolean; Message: string }): void {
            this.Results.push(result);
        }
        public async Delete(): Promise<boolean> {
            this.DeleteCalls.push(this.TransactionGroup);
            return true;
        }
    }
    return { MJProjectEntityExtended: StubProjectEntity, MAX_BRANCH_DEPTH: 32 };
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

describe('MJProjectEntityServer — refuses a parent that makes a cycle', () => {
    /** folder-a, saved by its owner, moved under `parent`. */
    const moveA = (parent: string, saved = true) =>
        folder(OWNER, { ID: OWNER }, { ParentID: { Dirty: true, OldValue: null, Value: parent } }, saved).ValidateAsync();

    it('refuses A under B when B is already under A', async () => {
        storedParents.clear();
        storedParents.set('folder-b', 'folder-a');
        storedParents.set('folder-a', null);
        const result = await moveA('folder-b');
        expect(result.Success).toBe(false);
        expect(JSON.stringify(result.Errors)).toContain('ParentID');
    });

    it('refuses a deeper cycle, and A under itself even as a new folder', async () => {
        storedParents.clear();
        storedParents.set('folder-c', 'folder-b');
        storedParents.set('folder-b', 'folder-a');
        storedParents.set('folder-a', null);
        expect((await moveA('folder-c')).Success).toBe(false);
        expect((await moveA('folder-a', false)).Success).toBe(false);
    });

    it('allows a normal reparent', async () => {
        storedParents.clear();
        storedParents.set('folder-c', 'folder-b');
        storedParents.set('folder-b', null);
        storedParents.set('folder-a', null);
        expect((await moveA('folder-c')).Success).toBe(true);
    });
});

describe('MJProjectEntityServer — Delete moves what the folder holds, in the delete\'s transaction', () => {
    /** A row the delete loads as the system user and moves; records what it was saved with. */
    class MovedRow {
        public ID = '';
        public ParentID: string | null = 'folder-a';
        public ProjectID: string | null = 'folder-a';
        public TransactionGroup: unknown = null;
        public LatestResult = { CompleteMessage: '' };
        public SavedWith: { ParentID: string | null; ProjectID: string | null; Group: unknown } | null = null;
        constructor(public EntityName: string, public LoadedAs: unknown) {}
        public async Load(id: string): Promise<boolean> {
            this.ID = id;
            return true;
        }
        public async Save(): Promise<boolean> {
            this.SavedWith = { ParentID: this.ParentID, ProjectID: this.ProjectID, Group: this.TransactionGroup };
            return true;
        }
    }

    const caller = { ID: OWNER };
    let moved: MovedRow[];
    let group: { Submit: ReturnType<typeof vi.fn> };
    let getEntityObject: ReturnType<typeof vi.fn>;

    /** folder-a under `parent-p`, deleted by `caller`, whose Delete permission and filter are as given. */
    function deletable(opts: { canDelete: boolean; filter: string }): MJProjectEntityServer {
        const entity = folder(OWNER, caller, { ParentID: { Dirty: false, OldValue: 'parent-p', Value: 'parent-p' } });
        const stub = entity as unknown as Stub & { EntityInfo: unknown; ProviderToUse: unknown };
        stub.EntityInfo = {
            GetUserPermisions: () => ({ CanDelete: opts.canDelete }),
            GetEffectiveRowFilterWhereClause: () => opts.filter,
        };
        stub.ProviderToUse = { CreateTransactionGroup: async () => group, GetEntityObject: getEntityObject };
        return entity;
    }
    const deleteCalls = (e: MJProjectEntityServer): unknown[] => (e as unknown as { DeleteCalls: unknown[] }).DeleteCalls;

    beforeEach(() => {
        moved = [];
        group = { Submit: vi.fn(async () => true) };
        getEntityObject = vi.fn(async (name: string, user: unknown) => {
            const row = new MovedRow(name, user);
            moved.push(row);
            return row;
        });
        deleteReads.Deletable = new Set(['folder-a']);
        deleteReads.Folders = [{ ID: 'others-subfolder' }];
        deleteReads.Conversations = [{ ID: 'others-conversation' }];
        deleteReads.Filters = [];
    });

    it('moves subfolders up and takes conversations out as the system user, then deletes, in one group', async () => {
        const entity = deletable({ canDelete: true, filter: "OwnerUserID='owner-1'" });

        expect(await entity.Delete()).toBe(true);

        const child = moved.find((r) => r.EntityName === 'MJ: Projects');
        const conversation = moved.find((r) => r.EntityName === 'MJ: Conversations');
        expect(child?.LoadedAs).toEqual({ ID: 'system' });
        expect(child?.SavedWith).toEqual({ ParentID: 'parent-p', ProjectID: 'folder-a', Group: group });
        expect(conversation?.SavedWith?.ProjectID).toBeNull();
        expect(conversation?.SavedWith?.Group).toBe(group);
        expect(deleteCalls(entity)).toEqual([group]);
        expect(group.Submit).toHaveBeenCalledTimes(1);
        // The caller's own Delete filter decided, against this folder.
        expect(deleteReads.Filters).toContain("ID='folder-a' AND (OwnerUserID='owner-1')");
        expect((entity as unknown as Stub).TransactionGroup).toBeNull();
    });

    it('moves nothing for a caller whose Delete filter refuses the folder, and leaves the refusal to the provider', async () => {
        deleteReads.Deletable = new Set();
        const entity = deletable({ canDelete: true, filter: "OwnerUserID='owner-1'" });

        await entity.Delete();

        expect(getEntityObject).not.toHaveBeenCalled();
        expect(deleteCalls(entity)).toEqual([null]);
    });

    it('moves nothing for a caller without Delete permission', async () => {
        const entity = deletable({ canDelete: false, filter: '' });

        await entity.Delete();

        expect(getEntityObject).not.toHaveBeenCalled();
        expect(deleteReads.Filters).toEqual([]);
        expect(deleteCalls(entity)).toEqual([null]);
    });

    it('deletes an empty folder directly', async () => {
        deleteReads.Folders = [];
        deleteReads.Conversations = [];
        const entity = deletable({ canDelete: true, filter: '' });

        expect(await entity.Delete()).toBe(true);

        expect(getEntityObject).not.toHaveBeenCalled();
        expect(deleteCalls(entity)).toEqual([null]);
    });

    it('reports a failed submit as a failed delete', async () => {
        group.Submit.mockResolvedValue(false);
        const entity = deletable({ canDelete: true, filter: '' });

        expect(await entity.Delete()).toBe(false);
    });

    it('leaves a delete already inside a transaction group to that group', async () => {
        const entity = deletable({ canDelete: true, filter: '' });
        const outer = { Variables: [] };
        (entity as unknown as Stub).TransactionGroup = outer;

        await entity.Delete();

        expect(getEntityObject).not.toHaveBeenCalled();
        expect(deleteCalls(entity)).toEqual([outer]);
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for the share-create gate on the Collection / Artifact
 * permission entities (PR #3266):
 *
 *  1. The gate's RunViews MUST run against the entity's own provider with the
 *     caller passed as contextUser — the server's global provider has no
 *     CurrentUser, so an unscoped RunView fails there and every share was
 *     rejected (even for the resource owner).
 *  2. When the gate blocks BEFORE super.Save(), failSave must still record the
 *     reason (LatestResult is null until a save attempt exists) so the client
 *     sees the real message instead of "Unknown error creating record".
 */

const mocks = vi.hoisted(() => ({
    superSave: vi.fn(),
    runViews: vi.fn(),
    runView: vi.fn(),
    fromProvider: vi.fn(),
    logError: vi.fn(),
    createShareNotification: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/core', () => {
    class MockBaseEntityResult {
        Success: boolean;
        Type: 'create' | 'update' | 'delete';
        Message: string;
        Error: unknown = null;
        Errors: unknown[] = [];
        StartedAt = new Date();
        EndedAt = new Date();
        constructor(success?: boolean, message?: string, type?: 'create' | 'update' | 'delete') {
            this.Success = success ?? false;
            this.Message = message ?? '';
            this.Type = type ?? 'create';
        }
        get CompleteMessage(): string {
            return this.Message;
        }
    }
    class MockRunView {
        static FromMetadataProvider(provider: unknown): MockRunView {
            mocks.fromProvider(provider);
            return new MockRunView();
        }
        RunViews(...args: unknown[]): unknown {
            return mocks.runViews(...args);
        }
        RunView(...args: unknown[]): unknown {
            return mocks.runView(...args);
        }
    }
    return {
        BaseEntity: class MockBaseEntity {},
        BaseEntityResult: MockBaseEntityResult,
        RunView: MockRunView,
        LogError: mocks.logError,
        EntityPermissionType: { Read: 'Read', Create: 'Create', Update: 'Update', Delete: 'Delete' },
        EntitySaveOptions: class MockEntitySaveOptions {},
    };
});

vi.mock('../generated/entity_subclasses', () => {
    class MockPermissionEntityBase {
        ID = 'PERM-1';
        CollectionID = '';
        ArtifactID = '';
        UserID = '';
        SharedByUserID: string | null = null;
        CanRead = true;
        CanShare = false;
        CanEdit = false;
        CanDelete = false;
        Collection: string | null = null;
        IsSaved = false;
        ContextCurrentUser: { ID: string; Email?: string; Name?: string } | null = null;
        ProviderToUse: { ProviderType: string } = { ProviderType: 'Database' };
        private _resultHistory: unknown[] = [];
        get ResultHistory(): unknown[] {
            return this._resultHistory;
        }
        get LatestResult(): unknown {
            return this._resultHistory.length > 0 ? this._resultHistory[this._resultHistory.length - 1] : null;
        }
        async Save(options?: unknown): Promise<boolean> {
            return mocks.superSave(options) as Promise<boolean>;
        }
    }
    return {
        MJCollectionPermissionEntity: class extends MockPermissionEntityBase {},
        MJArtifactPermissionEntity: class extends MockPermissionEntityBase {},
    };
});

vi.mock('../custom/Permissions/shareNotification', () => ({
    CreateShareNotification: mocks.createShareNotification,
}));

import { MJCollectionPermissionEntityExtended } from '../custom/Permissions/MJCollectionPermissionEntityExtended';
import { MJArtifactPermissionEntityExtended } from '../custom/Permissions/MJArtifactPermissionEntityExtended';

/** Writable view of the mocked entity surface the tests interact with. */
interface MutableShareEntity {
    CollectionID: string;
    ArtifactID: string;
    UserID: string;
    SharedByUserID: string | null;
    ContextCurrentUser: { ID: string; Email?: string; Name?: string } | null;
    ProviderToUse: { ProviderType: string };
    IsSaved: boolean;
    Save(options?: unknown): Promise<boolean>;
    readonly LatestResult: { Success: boolean; Message: string; CompleteMessage: string } | null;
    readonly ResultHistory: unknown[];
}

function ownerRow(ownerId: string): { Success: boolean; Results: Array<{ ID: string; OwnerID: string }> } {
    return { Success: true, Results: [{ ID: 'COLL-1', OwnerID: ownerId }] };
}

function grantRows(rows: Array<{ ID: string }>): { Success: boolean; Results: Array<{ ID: string }> } {
    return { Success: true, Results: rows };
}

describe('MJCollectionPermissionEntityExtended — share-create gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.runView.mockResolvedValue({ Success: true, Results: [] });
        mocks.createShareNotification.mockResolvedValue(undefined);
    });

    function makeEntity(): MutableShareEntity {
        const entity = new MJCollectionPermissionEntityExtended() as unknown as MutableShareEntity;
        entity.CollectionID = 'COLL-1';
        entity.UserID = 'GRANTEE-1';
        entity.SharedByUserID = 'USER-1';
        entity.ContextCurrentUser = { ID: 'USER-1', Email: 'owner@test.com' };
        return entity;
    }

    it('allows the collection owner to create a share', async () => {
        mocks.runViews.mockResolvedValue([ownerRow('USER-1'), grantRows([])]);
        const entity = makeEntity();

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('runs the gate queries against the entity provider with the caller as contextUser', async () => {
        mocks.runViews.mockResolvedValue([ownerRow('USER-1'), grantRows([])]);
        const entity = makeEntity();

        await entity.Save();

        // The original bug: gate queries ran on the global provider with no
        // contextUser, which always fails server-side.
        expect(mocks.fromProvider).toHaveBeenCalledWith(entity.ProviderToUse);
        expect(mocks.runViews).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ ID: 'USER-1' })
        );
    });

    it('blocks a non-owner without a Share grant and records the reason on LatestResult', async () => {
        mocks.runViews.mockResolvedValue([ownerRow('USER-2'), grantRows([])]);
        const entity = makeEntity();

        await expect(entity.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();

        // failSave else-branch: LatestResult was null (no save attempt yet), so a
        // result must be pushed — otherwise the client sees "Unknown error creating record"
        expect(entity.LatestResult).not.toBeNull();
        expect(entity.LatestResult!.Success).toBe(false);
        expect(entity.LatestResult!.CompleteMessage).toContain('Only the collection owner');
    });

    it('allows a non-owner who holds an existing CanShare grant', async () => {
        mocks.runViews.mockResolvedValue([ownerRow('USER-2'), grantRows([{ ID: 'GRANT-1' }])]);
        const entity = makeEntity();

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('still records the reason when the gate queries themselves fail', async () => {
        mocks.runViews.mockResolvedValue([
            { Success: false, Results: [] },
            { Success: false, Results: [] },
        ]);
        const entity = makeEntity();

        await expect(entity.Save()).resolves.toBe(false);
        expect(entity.LatestResult?.CompleteMessage).toContain('Only the collection owner');
    });

    it('skips the gate for updates to already-saved rows', async () => {
        const entity = makeEntity();
        entity.IsSaved = true;

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.runViews).not.toHaveBeenCalled();
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('skips the gate on non-Database (client-side) providers', async () => {
        const entity = makeEntity();
        entity.ProviderToUse = { ProviderType: 'Network' };

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.runViews).not.toHaveBeenCalled();
    });
});

describe('MJArtifactPermissionEntityExtended — share-create gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.runView.mockResolvedValue({ Success: true, Results: [{ ID: 'ART-1', Name: 'Test Artifact' }] });
        mocks.createShareNotification.mockResolvedValue(undefined);
    });

    function makeEntity(): MutableShareEntity {
        const entity = new MJArtifactPermissionEntityExtended() as unknown as MutableShareEntity;
        entity.ArtifactID = 'ART-1';
        entity.UserID = 'GRANTEE-1';
        entity.SharedByUserID = 'USER-1';
        entity.ContextCurrentUser = { ID: 'USER-1', Email: 'owner@test.com' };
        return entity;
    }

    it('allows the artifact owner to create a share, passing the caller as contextUser', async () => {
        mocks.runViews.mockResolvedValue([
            { Success: true, Results: [{ ID: 'ART-1', UserID: 'USER-1' }] },
            grantRows([]),
        ]);
        const entity = makeEntity();

        await expect(entity.Save()).resolves.toBe(true);
        expect(mocks.fromProvider).toHaveBeenCalledWith(entity.ProviderToUse);
        expect(mocks.runViews).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ ID: 'USER-1' })
        );
    });

    it('blocks a non-owner without a Share grant and records the reason', async () => {
        mocks.runViews.mockResolvedValue([
            { Success: true, Results: [{ ID: 'ART-1', UserID: 'USER-2' }] },
            grantRows([]),
        ]);
        const entity = makeEntity();

        await expect(entity.Save()).resolves.toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(entity.LatestResult).not.toBeNull();
        expect(entity.LatestResult!.CompleteMessage).toContain('Only the artifact owner');
    });
});

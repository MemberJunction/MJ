/**
 * Unit tests for the update and delete authorization of `MJResourcePermissionEntityExtended`.
 * The generated base entity, the permission engines and the share notification are replaced
 * with small fakes; the code under test is the real subclass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { UUID_OWNER, UUID_CALLER, UUID_GRANTEE, UUID_RESOURCE_TYPE, UUID_RESOURCE, mocks, fakeProvider } = vi.hoisted(() => {
    const owner = '10000000-0000-4000-8000-000000000001';
    /** Resource record returned by the fake provider: its owner is always `owner`. */
    const resourceRecord = {
        InnerLoad: async (): Promise<boolean> => true,
        Get: (fieldName: string): string => (fieldName === 'OwnerUserID' ? owner : 'Shared resource'),
    };
    return {
        UUID_OWNER: owner,
        UUID_CALLER: '10000000-0000-4000-8000-000000000002',
        UUID_GRANTEE: '10000000-0000-4000-8000-000000000003',
        UUID_RESOURCE_TYPE: '20000000-0000-4000-8000-000000000001',
        UUID_RESOURCE: '30000000-0000-4000-8000-000000000001',
        mocks: {
            superSave: vi.fn(),
            superDelete: vi.fn(),
            createShareNotification: vi.fn(),
        },
        fakeProvider: {
            ProviderType: 'Database',
            GetEntityObject: async (): Promise<typeof resourceRecord> => resourceRecord,
        },
    };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => <T extends object>(target: T) => target,
    };
});

type FieldValue = string | null;

interface FakeUser {
    ID: string;
    Type: string | null;
}

interface FakeField {
    Name: string;
    Dirty: boolean;
    OldValue: FieldValue;
}

vi.mock('../generated/entity_subclasses', () => {
    const fieldNames = [
        'ID', 'ResourceTypeID', 'ResourceRecordID', 'Type', 'UserID', 'RoleID',
        'PermissionLevel', 'Status', 'SharedByUserID',
    ] as const;
    type FieldName = typeof fieldNames[number];

    class MockResourcePermissionEntity {
        ID: FieldValue = '90000000-0000-4000-8000-000000000001';
        ResourceTypeID: FieldValue = UUID_RESOURCE_TYPE;
        ResourceRecordID: FieldValue = UUID_RESOURCE;
        Type: FieldValue = 'User';
        UserID: FieldValue = null;
        RoleID: FieldValue = null;
        PermissionLevel: FieldValue = 'View';
        Status: FieldValue = 'Approved';
        SharedByUserID: FieldValue = null;
        ResourceType = 'Projects';
        IsSaved = false;
        ContextCurrentUser: FakeUser | null = null;
        ProviderToUse = fakeProvider;
        ResultHistory: Array<{ Success: boolean; Message: string }> = [];
        private stored: Partial<Record<FieldName, FieldValue>> = {};

        /** Marks the current values as the stored row. */
        MarkStored(): void {
            for (const name of fieldNames) {
                this.stored[name] = this[name];
            }
            this.IsSaved = true;
        }
        get Fields(): FakeField[] {
            return fieldNames.map((name) => this.GetFieldByName(name));
        }
        GetFieldByName(name: string): FakeField {
            const key = name as FieldName;
            const old = key in this.stored ? (this.stored[key] ?? null) : this[key];
            return { Name: name, Dirty: old !== this[key], OldValue: old };
        }
        get ActiveUser(): FakeUser | null {
            return this.ContextCurrentUser;
        }
        get LatestResult(): { Success: boolean; Message: string } | undefined {
            return this.ResultHistory[this.ResultHistory.length - 1];
        }
        RegisterResultHistoryEntry(result: { Success: boolean; Message: string }): void {
            this.ResultHistory.push(result);
        }
        CheckPermissions(): boolean {
            return true;
        }
        async Save(): Promise<boolean> {
            return mocks.superSave();
        }
        async Delete(): Promise<boolean> {
            return mocks.superDelete();
        }
    }
    return {
        MJResourcePermissionEntity: MockResourcePermissionEntity,
        MJUserEntity: class MockUserEntity {},
    };
});

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => {
    const engine = {
        Config: async (): Promise<void> => undefined,
        ResourceTypes: [{ ID: UUID_RESOURCE_TYPE, Name: 'Projects', Entity: 'MJ: Projects' }],
        GetResourceTypeInfoFields: () => ({
            NameFieldName: 'Name',
            OwnerIDFieldName: 'OwnerUserID',
            PrimaryKeyFieldName: 'ID',
        }),
        GetUserAvailableResources: (): [] => [],
        Permissions: [],
    };
    return {
        ResourcePermissionEngine: {
            GetProviderInstance: () => engine,
            Instance: engine,
        },
    };
});

vi.mock('../engines/conversations', () => ({
    ConversationEngine: { Instance: { Conversations: [], Projects: [] } },
}));

vi.mock('../custom/Permissions/shareNotification', () => ({
    CreateShareNotification: mocks.createShareNotification,
}));

import { EntityInfo, UserInfo } from '@memberjunction/core';
import { MJResourcePermissionEntity } from '../generated/entity_subclasses';
import { MJResourcePermissionEntityExtended } from '../custom/ResourcePermissions/MJResourcePermissionEntityExtended';

/** The fake base's test hook, layered over the subclass's typed surface. */
interface FakeHooks {
    MarkStored(): void;
}

type TestEntity = MJResourcePermissionEntityExtended & FakeHooks;

function makeUser(id: string, type: string): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Type = type;
    return user;
}

/** A stored grant row for `granteeId`, with `caller` as the context user. */
function storedGrant(granteeId: string, status: MJResourcePermissionEntity['Status'], caller: UserInfo): TestEntity {
    const entity = new MJResourcePermissionEntityExtended(new EntityInfo()) as TestEntity;
    entity.Type = 'User';
    entity.UserID = granteeId;
    entity.Status = status;
    entity.PermissionLevel = 'View';
    entity.MarkStored();
    entity.ContextCurrentUser = caller;
    return entity;
}

const regularCaller = makeUser(UUID_CALLER, 'User');

describe('MJResourcePermissionEntityExtended update and delete authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.superSave.mockResolvedValue(true);
        mocks.superDelete.mockResolvedValue(true);
    });

    it('refuses a requester who approves their own access request', async () => {
        const entity = storedGrant(UUID_CALLER, 'Requested', regularCaller);
        entity.Status = 'Approved';
        entity.PermissionLevel = 'Owner';

        const saved = await entity.Save();

        expect(saved).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('refuses a user who is not the owner moving another user\'s grant to themselves', async () => {
        const entity = storedGrant(UUID_GRANTEE, 'Approved', regularCaller);
        entity.UserID = UUID_CALLER;

        const saved = await entity.Save();

        expect(saved).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it('refuses a user who is not the owner deleting another user\'s grant', async () => {
        const entity = storedGrant(UUID_GRANTEE, 'Approved', regularCaller);

        const deleted = await entity.Delete();

        expect(deleted).toBe(false);
        expect(mocks.superDelete).not.toHaveBeenCalled();
    });
});

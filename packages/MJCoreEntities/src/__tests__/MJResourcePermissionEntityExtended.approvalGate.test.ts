import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The approval gate on `MJ: Resource Permissions` saves. Creating an access request
 * (Status='Requested') is open to anyone, so approving it, or changing what an
 * Approved row grants, must be limited to the resource's owner, an Owner-level
 * grantee, a sysadmin or the system user. Otherwise a requester approves their own
 * request.
 */

const { OWNER, REQUESTER, SYSTEM, RESOURCE_TYPE, mocks } = vi.hoisted(() => ({
    OWNER: 'OWNER-USER',
    REQUESTER: 'REQUESTER-USER',
    SYSTEM: 'SYSTEM-USER',
    RESOURCE_TYPE: 'RT-DASHBOARDS',
    mocks: { superSave: vi.fn(), available: vi.fn() },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class MockBaseEntity {},
    CompositeKey: class MockCompositeKey { constructor(public KeyValuePairs: unknown[]) {} },
    EntityPermissionType: { Read: 'Read', Create: 'Create', Update: 'Update', Delete: 'Delete' },
    LogError: () => undefined,
    WellKnownUserSource: { Instance: { IsSystemUser: (u: { ID: string }) => u?.ID === SYSTEM } },
}));

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => {
    const engine = {
        Config: async () => undefined,
        ResourceTypes: [{ ID: RESOURCE_TYPE, Entity: 'MJ: Dashboards', Name: 'Dashboards' }],
        GetResourceTypeInfoFields: () => ({ NameFieldName: 'Name', OwnerIDFieldName: 'UserID', PrimaryKeyFieldName: 'ID' }),
        GetUserAvailableResources: (...args: unknown[]) => mocks.available(...args),
    };
    return { ResourcePermissionEngine: { GetProviderInstance: () => engine, Instance: { Permissions: [] } } };
});

vi.mock('../engines/conversations', () => ({ ConversationEngine: { Instance: { Conversations: [] } } }));
vi.mock('../custom/Permissions/shareNotification', () => ({ CreateShareNotification: vi.fn() }));
vi.mock('../custom/Permissions/BaseShareEntityExtended', () => ({ CheckShareManagePermission: () => false }));

vi.mock('../generated/entity_subclasses', () => {
    type Field = { Name: string; Value: unknown; OldValue: unknown; Dirty: boolean };
    class MockResourcePermissionEntity {
        IsSaved = false;
        ResourceType = 'Dashboards';
        ContextCurrentUser: { ID: string; Type?: string } | null = null;
        ProviderToUse = {
            ProviderType: 'Database',
            GetEntityObject: async () => ({
                InnerLoad: async () => true,
                Get: (name: string) => (name === 'UserID' ? OWNER : 'Q3 Dashboard'),
            }),
        };
        LatestResult: { Success: boolean; Message?: string } = { Success: true };
        private fields = new Map<string, Field>();
        get Fields(): Field[] {
            return [...this.fields.values()];
        }
        GetFieldByName(name: string): Field | undefined {
            return this.fields.get(name);
        }
        /** Loads a saved row: every field clean, OldValue equal to Value. */
        Load(values: Record<string, unknown>): void {
            for (const [Name, Value] of Object.entries(values)) this.fields.set(Name, { Name, Value, OldValue: Value, Dirty: false });
            this.IsSaved = true;
        }
        Change(name: string, value: unknown): void {
            const f = this.fields.get(name)!;
            f.Value = value;
            f.Dirty = f.OldValue !== value;
        }
        get Status(): unknown { return this.fields.get('Status')?.Value; }
        get ResourceTypeID(): unknown { return this.fields.get('ResourceTypeID')?.Value; }
        get ResourceRecordID(): unknown { return this.fields.get('ResourceRecordID')?.Value; }
        get UserID(): unknown { return this.fields.get('UserID')?.Value; }
        get Type(): unknown { return this.fields.get('Type')?.Value; }
        get PermissionLevel(): unknown { return this.fields.get('PermissionLevel')?.Value; }
        SharedByUserID: string | null = null;
        async Save(): Promise<boolean> {
            return mocks.superSave() as Promise<boolean>;
        }
    }
    return { MJResourcePermissionEntity: MockResourcePermissionEntity, MJUserEntity: class {} };
});

import { MJResourcePermissionEntityExtended } from '../custom/ResourcePermissions/MJResourcePermissionEntityExtended';

type TestRow = MJResourcePermissionEntityExtended & {
    Load(values: Record<string, unknown>): void;
    Change(name: string, value: unknown): void;
    ContextCurrentUser: { ID: string; Type?: string } | null;
    LatestResult: { Success: boolean; Message?: string };
};

/** A saved request by REQUESTER for View on the owner's dashboard. */
function requestRow(status = 'Requested', level = 'View'): TestRow {
    const row = new MJResourcePermissionEntityExtended() as unknown as TestRow;
    row.Load({
        Status: status,
        PermissionLevel: level,
        Type: 'User',
        UserID: REQUESTER,
        RoleID: null,
        ResourceTypeID: RESOURCE_TYPE,
        ResourceRecordID: 'DASHBOARD-1',
    });
    return row;
}

describe('MJ: Resource Permissions approval gate', () => {
    beforeEach(() => {
        mocks.superSave.mockReset().mockResolvedValue(true);
        mocks.available.mockReset().mockReturnValue([]);
    });

    it('refuses a requester approving their own request', async () => {
        const row = requestRow();
        row.ContextCurrentUser = { ID: REQUESTER, Type: 'User' };
        row.Change('Status', 'Approved');
        row.Change('PermissionLevel', 'Owner');

        expect(await row.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
        expect(row.LatestResult.Message).toBe('Only the owner can share this resource.');
    });

    it('refuses a grantee raising the level of an Approved row', async () => {
        const row = requestRow('Approved', 'View');
        row.ContextCurrentUser = { ID: REQUESTER, Type: 'User' };
        row.Change('PermissionLevel', 'Owner');

        expect(await row.Save()).toBe(false);
        expect(mocks.superSave).not.toHaveBeenCalled();
    });

    it("refuses repointing an Approved row at another resource", async () => {
        const row = requestRow('Approved', 'View');
        row.ContextCurrentUser = { ID: REQUESTER, Type: 'User' };
        row.Change('ResourceRecordID', 'SOMEONE-ELSES-DASHBOARD');

        expect(await row.Save()).toBe(false);
    });

    it('lets the resource owner approve a request', async () => {
        const row = requestRow();
        row.ContextCurrentUser = { ID: OWNER, Type: 'User' };
        row.Change('Status', 'Approved');

        expect(await row.Save()).toBe(true);
        expect(mocks.superSave).toHaveBeenCalledTimes(1);
    });

    it('lets an Owner-level grantee approve a request', async () => {
        mocks.available.mockReturnValue([{ ResourceRecordID: 'DASHBOARD-1', PermissionLevel: 'Owner', Status: 'Approved' }]);
        const row = requestRow();
        row.ContextCurrentUser = { ID: 'CO-OWNER', Type: 'User' };
        row.Change('Status', 'Approved');

        expect(await row.Save()).toBe(true);
    });

    it('lets the system user and a sysadmin approve a request', async () => {
        for (const user of [{ ID: SYSTEM, Type: 'User' }, { ID: 'ADMIN', Type: 'Owner' }]) {
            const row = requestRow();
            row.ContextCurrentUser = user;
            row.Change('Status', 'Approved');
            expect(await row.Save()).toBe(true);
        }
    });

    it('still lets anyone file a request, and lets a requester edit it while it is pending', async () => {
        const pending = requestRow();
        pending.ContextCurrentUser = { ID: REQUESTER, Type: 'User' };
        pending.Change('PermissionLevel', 'Edit');
        expect(await pending.Save()).toBe(true);
    });
});

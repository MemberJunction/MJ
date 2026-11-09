import { describe, it, expect } from 'vitest';
import {
    BaseEntity,
    EntityInfo,
    IMetadataProvider,
    ProviderBase,
    TransformSimpleObjectToEntityObject,
    UserInfo,
} from '@memberjunction/core';
import type { MJDashboardEntityType } from '../generated/entity_subclasses';
import { MJDashboardEntityExtended } from '../custom/MJDashboardEntityExtended';

/**
 * Old values of `MJ: Dashboards` records built the way DashboardEngine builds its copies:
 * `GetEntityObject()` (which calls `NewRecord()`), then `LoadFromData(row)`.
 *
 * Uses the real `BaseEntity`, `MJDashboardEntityExtended` and `DashboardEngine`. Only the metadata
 * provider and the entity metadata are test doubles.
 */

const DASHBOARDS = 'MJ: Dashboards';
const DASHBOARDS_ENTITY_ID = 'E0000000-0000-4000-8000-00000000DA5B';
const DASHBOARD_ID = 'D0000000-0000-4000-8000-000000000001';
const SECOND_DASHBOARD_ID = 'D0000000-0000-4000-8000-000000000002';
const OWNER_ID = 'AAAAAAAA-0000-4000-8000-000000000001';
const EDITOR_ID = 'BBBBBBBB-0000-4000-8000-000000000002';

/** The UIConfigDetails value that NewRecord() gives a new dashboard. */
const NEW_RECORD_LAYOUT = '{"columns":4,"rowHeight":150,"resizable":true,"reorderable":true,"items":[]}';
const SAVED_LAYOUT = '{"layout":{"root":{"type":"row","content":[]}},"settings":{"theme":"light"}}';
const EDITED_LAYOUT = '{"layout":{"root":{"type":"column","content":[]}},"settings":{"theme":"light"}}';

const OWNER = new UserInfo(null, { ID: OWNER_ID, Name: 'Dashboard Owner', Email: 'owner@example.com', UserRoles: [] });
const EDITOR = new UserInfo(null, { ID: EDITOR_ID, Name: 'Shared Editor', Email: 'editor@example.com', UserRoles: [] });

/** Field metadata as the generated MJDashboardEntity describes it. */
interface FieldSpec {
    Type: string;
    Length: number;
    AllowsNull: boolean;
    DefaultValue?: string;
    IsPrimaryKey?: boolean;
    IsNameField?: boolean;
    /** A joined display field from the view, so read-only. */
    IsVirtual?: boolean;
    /** The value list of a field with a CHECK constraint. */
    Values?: string[];
}

const DASHBOARD_FIELDS: Array<[keyof MJDashboardEntityType, FieldSpec]> = [
    ['ID', { Type: 'uniqueidentifier', Length: 16, AllowsNull: false, DefaultValue: 'newsequentialid()', IsPrimaryKey: true }],
    ['Name', { Type: 'nvarchar', Length: 510, AllowsNull: false, IsNameField: true }],
    ['Description', { Type: 'nvarchar', Length: -1, AllowsNull: true }],
    ['UserID', { Type: 'uniqueidentifier', Length: 16, AllowsNull: false }],
    ['CategoryID', { Type: 'uniqueidentifier', Length: 16, AllowsNull: true }],
    ['UIConfigDetails', { Type: 'nvarchar', Length: -1, AllowsNull: false }],
    ['__mj_CreatedAt', { Type: 'datetimeoffset', Length: 10, AllowsNull: false, DefaultValue: 'getutcdate()' }],
    ['__mj_UpdatedAt', { Type: 'datetimeoffset', Length: 10, AllowsNull: false, DefaultValue: 'getutcdate()' }],
    ['Type', { Type: 'nvarchar', Length: 40, AllowsNull: false, DefaultValue: 'Config', Values: ['Code', 'Config', 'Dynamic Code'] }],
    ['Thumbnail', { Type: 'nvarchar', Length: -1, AllowsNull: true }],
    ['Scope', { Type: 'nvarchar', Length: 40, AllowsNull: false, DefaultValue: 'Global', Values: ['App', 'Global'] }],
    ['ApplicationID', { Type: 'uniqueidentifier', Length: 16, AllowsNull: true }],
    ['DriverClass', { Type: 'nvarchar', Length: 510, AllowsNull: true }],
    ['Code', { Type: 'nvarchar', Length: 510, AllowsNull: true }],
    ['EnvironmentID', { Type: 'uniqueidentifier', Length: 16, AllowsNull: false, DefaultValue: 'F51358F3-9447-4176-B313-BF8025FD8D09' }],
    ['User', { Type: 'nvarchar', Length: 200, AllowsNull: false, IsVirtual: true }],
    ['Category', { Type: 'nvarchar', Length: 200, AllowsNull: true, IsVirtual: true }],
    ['Application', { Type: 'nvarchar', Length: 200, AllowsNull: true, IsVirtual: true }],
    ['Environment', { Type: 'nvarchar', Length: 510, AllowsNull: false, IsVirtual: true }],
];

function dashboardsEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: DASHBOARDS_ENTITY_ID,
        Name: DASHBOARDS,
        BaseTable: 'Dashboard',
        BaseView: 'vwDashboards',
        SchemaName: '__mj',
        Status: 'Active',
        VirtualEntity: false,
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        CascadeDeletes: true,
        TrackRecordChanges: true,
        ParentID: null,
        EntityFields: DASHBOARD_FIELDS.map(([name, spec], index) => ({
            ID: `dashboard-field-${name}`,
            EntityID: DASHBOARDS_ENTITY_ID,
            Entity: DASHBOARDS,
            Name: name,
            Sequence: index + 1,
            Status: 'Active',
            Type: spec.Type,
            Length: spec.Length,
            AllowsNull: spec.AllowsNull,
            DefaultValue: spec.DefaultValue ?? null,
            IsPrimaryKey: spec.IsPrimaryKey ?? false,
            IsNameField: spec.IsNameField ?? false,
            IsVirtual: spec.IsVirtual ?? false,
            AllowUpdateAPI: !spec.IsVirtual,
            AutoIncrement: false,
            IsSoftPrimaryKey: false,
            IsSoftForeignKey: false,
            ValueListType: spec.Values ? 'List' : 'None',
            EntityFieldValues: (spec.Values ?? []).map((value, valueIndex) => ({
                ID: `dashboard-field-${name}-value-${valueIndex + 1}`,
                EntityFieldID: `dashboard-field-${name}`,
                Sequence: valueIndex + 1,
                Value: value,
                Code: value,
            })),
        })),
        EntityPermissions: [],
        EntityRelationships: [],
        EntitySettings: [],
    });
}

/** A complete saved dashboard row, as a RunView or an invalidation message delivers it. */
function savedRow(overrides: Partial<MJDashboardEntityType> = {}): MJDashboardEntityType {
    return {
        ID: DASHBOARD_ID,
        Name: 'Exec Summary',
        Description: 'Two panels',
        UserID: OWNER_ID,
        CategoryID: null,
        UIConfigDetails: SAVED_LAYOUT,
        __mj_CreatedAt: new Date('2026-09-20T10:00:00.000Z'),
        __mj_UpdatedAt: new Date('2026-09-25T16:14:37.000Z'),
        Type: 'Config',
        Thumbnail: null,
        Scope: 'Global',
        ApplicationID: null,
        DriverClass: null,
        Code: null,
        EnvironmentID: 'F51358F3-9447-4176-B313-BF8025FD8D09',
        User: 'Dashboard Owner',
        Category: null,
        Application: null,
        Environment: 'Default',
        ...overrides,
    };
}

/** ProviderBase's real GetEntityObject(): builds the registered class, binds the provider, calls NewRecord(). */
const realGetEntityObject = ProviderBase.prototype.GetEntityObject as (
    this: ProviderBase,
    entityName: string,
    contextUser?: UserInfo
) => Promise<BaseEntity>;

/** The provider members that GetEntityObject() and these entity paths read. */
interface DashboardTestProvider {
    Entities: EntityInfo[];
    CurrentUser: UserInfo;
    EntityByName(entityName: string): EntityInfo | undefined;
    SetCachedRecordName(): void;
    GetCachedRecordName(): string | null;
    GetEntityObject(entityName: string, contextUser?: UserInfo): Promise<BaseEntity>;
}

function makeProvider(currentUser: UserInfo): IMetadataProvider {
    const entityInfo = dashboardsEntityInfo();
    const provider: DashboardTestProvider = {
        Entities: [entityInfo],
        CurrentUser: currentUser,
        EntityByName: (entityName) => (entityName.trim().toLowerCase() === DASHBOARDS.toLowerCase() ? entityInfo : undefined),
        SetCachedRecordName: () => { /* no record-name cache in this test */ },
        GetCachedRecordName: () => null,
        GetEntityObject: (entityName, contextUser) =>
            realGetEntityObject.call(provider as unknown as ProviderBase, entityName, contextUser),
    };
    return provider as unknown as IMetadataProvider;
}

async function newDashboard(currentUser: UserInfo): Promise<MJDashboardEntityExtended> {
    const dashboard = await makeProvider(currentUser).GetEntityObject<MJDashboardEntityExtended>(DASHBOARDS);
    if (!(dashboard instanceof MJDashboardEntityExtended)) {
        throw new Error(`GetEntityObject('${DASHBOARDS}') did not build an MJDashboardEntityExtended`);
    }
    return dashboard;
}

/** A dashboard built as DashboardEngine builds its copies: GetEntityObject(), then LoadFromData(row). */
async function loadedCopy(currentUser: UserInfo): Promise<MJDashboardEntityExtended> {
    const dashboard = await newDashboard(currentUser);
    await dashboard.LoadFromData(savedRow());
    return dashboard;
}

function oldValueOf(dashboard: MJDashboardEntityExtended, fieldName: keyof MJDashboardEntityType): unknown {
    return dashboard.GetFieldByName(fieldName)?.OldValue;
}

describe('MJDashboardEntityExtended old values', () => {
    describe('a copy built with GetEntityObject() then LoadFromData()', () => {
        it('takes the loaded UIConfigDetails and UserID as their old values', async () => {
            const copy = await loadedCopy(EDITOR);

            expect({
                UIConfigDetails: oldValueOf(copy, 'UIConfigDetails'),
                UserID: oldValueOf(copy, 'UserID'),
            }).toEqual({ UIConfigDetails: SAVED_LAYOUT, UserID: OWNER_ID });
        });

        it('is not Dirty when nothing changed after the load', async () => {
            const copy = await loadedCopy(EDITOR);

            expect(copy.Dirty).toBe(false);
        });

        it('Revert() after a layout edit puts back the loaded layout, not the new-dashboard default', async () => {
            const copy = await loadedCopy(EDITOR);
            copy.UIConfigDetails = EDITED_LAYOUT;

            copy.Revert();

            expect(copy.UIConfigDetails).toBe(SAVED_LAYOUT);
        });

        it('Revert() after a layout edit keeps the loaded owner, not the current user', async () => {
            const copy = await loadedCopy(EDITOR);
            copy.UIConfigDetails = EDITED_LAYOUT;

            copy.Revert();

            expect(copy.UserID).toBe(OWNER_ID);
        });

        it('Validate() reads the owner from the loaded row, so a shared editor without a grant is refused', async () => {
            // DashboardEngine is not loaded, so it grants the editor nothing.
            const copy = await loadedCopy(EDITOR);

            const result = copy.Validate();

            expect(result.Errors.map((error) => error.Source)).toEqual(['Permission']);
        });

        it("Validate() accepts the owner's own copy without an engine grant", async () => {
            const copy = await loadedCopy(OWNER);

            expect(copy.Validate().Success).toBe(true);
        });

        it('a second LoadFromData() keeps the first load as the old values', async () => {
            const copy = await loadedCopy(EDITOR);

            await copy.LoadFromData(savedRow({ UIConfigDetails: EDITED_LAYOUT }));

            expect(copy.UIConfigDetails).toBe(EDITED_LAYOUT);
            expect(oldValueOf(copy, 'UIConfigDetails')).toBe(SAVED_LAYOUT);
            expect(copy.Dirty).toBe(true);
        });
    });

    describe('a new dashboard', () => {
        it('starts with the default layout and the current user as owner', async () => {
            const dashboard = await newDashboard(EDITOR);

            expect(dashboard.IsSaved).toBe(false);
            expect(dashboard.UIConfigDetails).toBe(NEW_RECORD_LAYOUT);
            expect(dashboard.UserID).toBe(EDITOR_ID);
        });
    });

    describe('RunView entity_object results', () => {
        it('builds the first row, which comes from GetEntityObject(), as clean as the other rows', async () => {
            const rows = await TransformSimpleObjectToEntityObject<MJDashboardEntityExtended>(makeProvider(EDITOR), DASHBOARDS, [
                savedRow(),
                savedRow({ ID: SECOND_DASHBOARD_ID, Name: 'Ops Summary' }),
            ]);

            expect(rows.map((row) => row.Dirty)).toEqual([false, false]);
        });
    });
});

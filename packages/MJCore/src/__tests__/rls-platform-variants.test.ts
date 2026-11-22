import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EntityInfo, EntityPermissionType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { RowLevelSecurityFilterInfo, UserInfo } from '../generic/securityInfo';

const ENTITY_ID = 'E1000000-0000-0000-0000-000000000001';
const ROLE_UI_ID = 'R1000000-0000-0000-0000-000000000001';
const FILTER_ID = 'F1000000-0000-0000-0000-000000000001';
const USER_ID = 'U1000000-0000-0000-0000-000000000001';

function buildUser(): UserInfo {
    return new UserInfo(null, {
        ID: USER_ID,
        Name: 'Alice UI',
        Email: 'alice@example.com',
        Type: 'User',
        IsActive: true,
        UserRoles: [{ UserID: USER_ID, RoleID: ROLE_UI_ID, Role: 'UI' }],
    });
}

function buildFilter(withPgVariant: boolean): RowLevelSecurityFilterInfo {
    const platformVariants = withPgVariant
        ? JSON.stringify({
              FilterText: {
                  postgresql: `("UserID" = '{{UserID}}' AND BTRIM("Status") <> 'Deleted')`,
              },
              _meta: { translatedBy: 'manual', sourceDialect: 'sqlserver', verified: true },
          })
        : null;

    return new RowLevelSecurityFilterInfo({
        ID: FILTER_ID,
        Name: 'UI: Own Rows',
        Description: 'Restrict to caller rows',
        FilterText: `([UserID] = '{{UserID}}' AND LTRIM(RTRIM([Status])) <> 'Deleted')`,
        PlatformVariants: platformVariants,
    });
}

function buildEntity(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Test Scoped Entity',
        SchemaName: '__mj',
        BaseTable: 'TestScoped',
        BaseView: 'vwTestScoped',
        Permissions: [
            {
                ID: 'perm-1',
                EntityID: ENTITY_ID,
                RoleID: ROLE_UI_ID,
                CanRead: true,
                CanCreate: false,
                CanUpdate: false,
                CanDelete: false,
                ReadRLSFilterID: FILTER_ID,
                CreateRLSFilterID: null,
                UpdateRLSFilterID: null,
                DeleteRLSFilterID: null,
                Type: 'Allow',
            },
        ],
        Fields: [],
    });
}

describe('RowLevelSecurityFilterInfo & EntityInfo — PostgreSQL PlatformVariants', () => {
    let savedProvider: typeof Metadata.Provider;

    beforeEach(() => {
        savedProvider = Metadata.Provider;
    });

    afterEach(() => {
        Metadata.Provider = savedProvider;
    });

    it('MarkupFilterText resolves PostgreSQL PlatformVariants when platform is postgresql and falls back to base FilterText for sqlserver', () => {
        const filter = buildFilter(true);
        const user = buildUser();

        const pgClause = filter.MarkupFilterText(user, { platform: 'postgresql' });
        expect(pgClause).toBe(`("UserID" = '${USER_ID}' AND BTRIM("Status") <> 'Deleted')`);

        const sqlServerClause = filter.MarkupFilterText(user, { platform: 'sqlserver' });
        expect(sqlServerClause).toBe(`([UserID] = '${USER_ID}' AND LTRIM(RTRIM([Status])) <> 'Deleted')`);
    });

    it('EntityInfo.GetUserRowLevelSecurityWhereClause automatically honors Provider.PlatformKey', () => {
        const filter = buildFilter(true);
        const entity = buildEntity();
        const user = buildUser();

        Metadata.Provider = {
            PlatformKey: 'postgresql',
            RowLevelSecurityFilters: [filter],
            Entities: [entity],
        } as unknown as ProviderBase;

        const pgWhere = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read);
        expect(pgWhere).toContain(`"UserID" = '${USER_ID}'`);
        expect(pgWhere).toContain('BTRIM("Status")');
        expect(pgWhere).not.toContain('LTRIM(RTRIM');

        Metadata.Provider = {
            PlatformKey: 'sqlserver',
            RowLevelSecurityFilters: [filter],
            Entities: [entity],
        } as unknown as ProviderBase;

        const tsqlWhere = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read);
        expect(tsqlWhere).toContain(`[UserID] = '${USER_ID}'`);
        expect(tsqlWhere).toContain('LTRIM(RTRIM([Status]))');
    });

    it('falls back cleanly to base FilterText when no postgresql PlatformVariants entry exists', () => {
        const filter = buildFilter(false);
        const user = buildUser();

        const pgClause = filter.MarkupFilterText(user, { platform: 'postgresql' });
        expect(pgClause).toBe(`([UserID] = '${USER_ID}' AND LTRIM(RTRIM([Status])) <> 'Deleted')`);
    });
});

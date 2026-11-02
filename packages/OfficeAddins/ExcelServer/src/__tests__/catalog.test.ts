import { describe, it, expect } from 'vitest';
import {
    ApplicationEntityInfo,
    ApplicationInfo,
    EntityInfo,
    EntityPermissions,
    IMetadataProvider,
    QueryCategoryInfo,
    QueryInfo,
    QueryParameterInfo,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { BuildExcelCatalog, ExcelViewRunner, LoadExcelEntityViews } from '../catalog';
import { ExcelSourceError } from '../sources';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_USER_ID = '99999999-2222-4333-8444-555555555555';
const ENT_PEOPLE_ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const ENT_SECRET_ID = 'bbbbbbbb-1111-4222-8333-444444444444';
const APP_CRM_ID = 'cccccccc-1111-4222-8333-444444444444';
const APP_EMPTY_ID = 'dddddddd-1111-4222-8333-444444444444';
const CAT_ROOT_ID = 'eeeeeeee-1111-4222-8333-444444444444';
const CAT_CHILD_ID = 'ffffffff-1111-4222-8333-444444444444';
const CAT_UNUSED_ID = '12121212-1111-4222-8333-444444444444';

function makeUser(): UserInfo {
    const u = Object.create(UserInfo.prototype) as UserInfo;
    Object.assign(u, { ID: USER_ID, Name: 'Ada', Email: 'ada@example.org' });
    return u;
}

function makeEntity(id: string, name: string, displayName: string, canRead: boolean): EntityInfo {
    const e = Object.create(EntityInfo.prototype) as EntityInfo;
    const perms = { CanRead: canRead } as EntityPermissions;
    Object.assign(e, {
        ID: id,
        Name: name,
        DisplayName: displayName,
        Description: `${displayName} description`,
        IncludeInAPI: true,
        Status: 'Active',
        GetUserPermisions: () => perms,
    });
    return e;
}

function makeApp(id: string, name: string, entityIds: string[]): ApplicationInfo {
    const app = Object.create(ApplicationInfo.prototype) as ApplicationInfo;
    const appEntities = entityIds.map((entityId, idx) => {
        const ae = new ApplicationEntityInfo({ EntityID: entityId, Sequence: idx + 1 });
        return ae;
    });
    Object.assign(app, {
        ID: id,
        Name: name,
        Description: `${name} app`,
        Status: 'Active',
        DefaultSequence: 10,
        _applicationEntities: appEntities,
    });
    return app;
}

function makeCategory(id: string, name: string, parentId: string | null): QueryCategoryInfo {
    const c = Object.create(QueryCategoryInfo.prototype) as QueryCategoryInfo;
    Object.assign(c, { ID: id, Name: name, ParentID: parentId });
    return c;
}

function makeQuery(
    id: string,
    name: string,
    categoryId: string | null,
    canRun: boolean,
    status: QueryInfo['Status'] = 'Approved',
): QueryInfo {
    const q = Object.create(QueryInfo.prototype) as QueryInfo;
    const yearParam = Object.create(QueryParameterInfo.prototype) as QueryParameterInfo;
    Object.assign(yearParam, {
        Name: 'Year',
        Type: 'number',
        IsRequired: true,
        DefaultValue: '2026',
        Description: 'Fiscal year',
        SampleValue: '2026',
        IsServerSet: false,
    });
    const tenantParam = Object.create(QueryParameterInfo.prototype) as QueryParameterInfo;
    Object.assign(tenantParam, {
        Name: 'TenantID',
        Type: 'string',
        IsRequired: true,
        IsServerSet: true,
    });
    const params = [yearParam, tenantParam];
    Object.assign(q, {
        ID: id,
        Name: name,
        Description: `${name} query`,
        CategoryID: categoryId,
        Status: status,
        UserCanRun: () => canRun,
    });
    Object.defineProperty(q, 'Parameters', { get: () => params });
    return q;
}

function makeView(
    id: string,
    name: string,
    ownerId: string,
    options: { IsShared?: boolean; IsDefault?: boolean; CanView?: boolean } = {},
): MJUserViewEntityExtended {
    const v = Object.create(MJUserViewEntityExtended.prototype) as MJUserViewEntityExtended;
    Object.defineProperty(v, 'ID', { get: () => id });
    Object.defineProperty(v, 'Name', { get: () => name });
    Object.defineProperty(v, 'Description', { get: () => `${name} view` });
    Object.defineProperty(v, 'UserID', { get: () => ownerId });
    Object.defineProperty(v, 'IsShared', { get: () => options.IsShared ?? false });
    Object.defineProperty(v, 'IsDefault', { get: () => options.IsDefault ?? false });
    Object.defineProperty(v, 'UserCanView', { get: () => options.CanView ?? true });
    return v;
}

describe('BuildExcelCatalog', () => {
    it('filters applications, entities, categories, queries, and server-set parameters to caller permissions', () => {
        const user = makeUser();
        const provider = {
            Entities: [
                makeEntity(ENT_PEOPLE_ID, 'MJ: People', 'People', true),
                makeEntity(ENT_SECRET_ID, 'SecretAudit', 'Secret Audit', false),
            ],
            Applications: [
                makeApp(APP_CRM_ID, 'CRM', [ENT_PEOPLE_ID.toUpperCase(), ENT_SECRET_ID]),
                makeApp(APP_EMPTY_ID, 'Admin Only', [ENT_SECRET_ID]),
            ],
            QueryCategories: [
                makeCategory(CAT_ROOT_ID, 'Membership', null),
                makeCategory(CAT_CHILD_ID, 'Renewals', CAT_ROOT_ID),
                makeCategory(CAT_UNUSED_ID, 'Empty Folder', null),
            ],
            Queries: [
                makeQuery('q-allowed', 'Active Members', CAT_CHILD_ID, true, 'Approved'),
                makeQuery('q-denied', 'Executive Compensation', CAT_CHILD_ID, false, 'Approved'),
                makeQuery('q-rejected', 'Broken Draft', CAT_ROOT_ID, true, 'Rejected'),
            ],
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const catalog = BuildExcelCatalog(provider, user);
        expect(catalog.Entities.map(e => e.ID)).toEqual([ENT_PEOPLE_ID]);
        expect(catalog.Applications).toEqual([
            {
                ID: APP_CRM_ID,
                Name: 'CRM',
                Description: 'CRM app',
                EntityIDs: [ENT_PEOPLE_ID],
            },
        ]);
        expect(catalog.QueryCategories.map(c => c.Path)).toEqual(['Membership', 'Membership / Renewals']);
        expect(catalog.Queries).toHaveLength(1);
        expect(catalog.Queries[0].Name).toBe('Active Members');
        expect(catalog.Queries[0].CategoryPath).toBe('Membership / Renewals');
        expect(catalog.Queries[0].Parameters.map(p => p.Name)).toEqual(['Year']);
    });
});

describe('LoadExcelEntityViews', () => {
    const user = makeUser();
    const provider = {
        Entities: [
            makeEntity(ENT_PEOPLE_ID, 'MJ: People', 'People', true),
            makeEntity(ENT_SECRET_ID, 'SecretAudit', 'Secret Audit', false),
        ],
    } as Partial<IMetadataProvider> as IMetadataProvider;

    it('orders owned default view first, then owned views, then accessible shared views', async () => {
        let capturedParams: RunViewParams | null = null;
        const runner: ExcelViewRunner = {
            async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
                capturedParams = params;
                const views = [
                    makeView('v-shared-allowed', 'Regional Leads', OTHER_USER_ID, { IsShared: true, CanView: true }),
                    makeView('v-shared-denied', 'Board Only', OTHER_USER_ID, { IsShared: true, CanView: false }),
                    makeView('v-my-alpha', 'Alpha Contacts', USER_ID, { IsDefault: false }),
                    makeView('v-my-default', 'My Default Contacts', USER_ID, { IsDefault: true }),
                ] as T[];
                return {
                    Success: true,
                    Results: views,
                    RowCount: views.length,
                    TotalRowCount: views.length,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
        };

        const output = await LoadExcelEntityViews(ENT_PEOPLE_ID, provider, user, runner);
        expect(capturedParams?.ExtraFilter).toContain(ENT_PEOPLE_ID);
        expect(output.Views.map(v => v.Name)).toEqual([
            'My Default Contacts',
            'Alpha Contacts',
            'Regional Leads',
        ]);
        expect(output.Views[0].IsDefault).toBe(true);
        expect(output.Views[2].IsOwned).toBe(false);
        expect(output.Views[2].IsShared).toBe(true);
    });

    it('refuses invalid IDs and unreadable entities', async () => {
        await expect(LoadExcelEntityViews('bad-id', provider, user)).rejects.toBeInstanceOf(ExcelSourceError);
        await expect(LoadExcelEntityViews(ENT_SECRET_ID, provider, user)).rejects.toBeInstanceOf(ExcelSourceError);
    });
});

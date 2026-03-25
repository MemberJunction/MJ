/**
 * ProviderBase AlternateViewName Validation Tests
 *
 * Tests that PreRunView correctly validates AlternateViewName:
 * - Throws error for unregistered view names
 * - Passes through for valid registered view names
 * - Passes through when AlternateViewName is not set
 * - Error message lists available views
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEST_ROLE_ID = 'role-altview-001';

const additionalViews = JSON.stringify([
    { Name: 'vwTestAlternate', Description: 'An alternate view', SchemaName: 'dbo', UserSearchable: true },
    { Name: 'vwTestSummary', Description: 'A summary view', UserSearchable: false },
]);

const MOCK_METADATA = {
    Applications: [],
    Entities: [
        {
            ID: 'entity-with-views',
            Name: 'Items With Views',
            SchemaName: '__mj',
            BaseView: 'vwItemsWithViews',
            BaseTable: 'ItemsWithViews',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            AllowAllRowsAPI: true,
            AdditionalBaseViews: additionalViews,
            Status: 'Active',
            EntityFields: [
                { ID: 'f-iwv-1', EntityID: 'entity-with-views', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-iwv-2', EntityID: 'entity-with-views', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
            ],
            EntityPermissions: [
                { EntityID: 'entity-with-views', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
        {
            ID: 'entity-no-views',
            Name: 'Items No Views',
            SchemaName: '__mj',
            BaseView: 'vwItemsNoViews',
            BaseTable: 'ItemsNoViews',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            AllowAllRowsAPI: true,
            AdditionalBaseViews: null,
            Status: 'Active',
            EntityFields: [
                { ID: 'f-inv-1', EntityID: 'entity-no-views', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-inv-2', EntityID: 'entity-no-views', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
            ],
            EntityPermissions: [
                { EntityID: 'entity-no-views', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
    ],
    get EntityFields() {
        return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []);
    },
    get EntityPermissions() {
        return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []);
    },
    EntityFieldValues: [],
    EntityRelationships: [],
    EntitySettings: [],
    ApplicationEntities: [],
    ApplicationSettings: [],
    Roles: [{ ID: TEST_ROLE_ID, Name: 'TestRole' }],
    RowLevelSecurityFilters: [],
    AuditLogTypes: [],
    Authorizations: [],
    QueryCategories: [],
    Queries: [],
    QueryFields: [],
    QueryPermissions: [],
    QueryEntities: [],
    QueryParameters: [],
    EntityDocumentTypes: [],
    Libraries: [],
    ExplorerNavigationItems: [],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRunViewResult<T>(rows: T[]): RunViewResult<T> {
    return {
        Success: true,
        Results: rows,
        RowCount: rows.length,
        TotalRowCount: rows.length,
        ExecutionTime: 1,
        ErrorMessage: '',
        UserViewRunID: '',
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProviderBase AlternateViewName validation', () => {
    let provider: TestMetadataProvider;

    beforeEach(async () => {
        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(MOCK_METADATA);

        const config = new ProviderConfigDataBase({}, '__mj', [], [], true);
        await provider.Config(config);
    });

    it('should pass through when AlternateViewName is not set', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([])] as never);

        await provider.RunView({
            EntityName: 'Items With Views',
            ResultType: 'simple',
        });

        expect(spy).toHaveBeenCalled();
    });

    it('should pass through for a valid registered AlternateViewName', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([])] as never);

        await provider.RunView({
            EntityName: 'Items With Views',
            AlternateViewName: 'vwTestAlternate',
            ResultType: 'simple',
        });

        expect(spy).toHaveBeenCalled();
    });

    it('should pass through for a valid AlternateViewName (case-insensitive)', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([])] as never);

        await provider.RunView({
            EntityName: 'Items With Views',
            AlternateViewName: 'VWTESTALTERNATE',
            ResultType: 'simple',
        });

        expect(spy).toHaveBeenCalled();
    });

    it('should throw error for unregistered AlternateViewName', async () => {
        await expect(provider.RunView({
            EntityName: 'Items With Views',
            AlternateViewName: 'vwDoesNotExist',
            ResultType: 'simple',
        })).rejects.toThrow(/not registered in AdditionalBaseViews/);
    });

    it('should include entity name in error message', async () => {
        await expect(provider.RunView({
            EntityName: 'Items With Views',
            AlternateViewName: 'vwDoesNotExist',
            ResultType: 'simple',
        })).rejects.toThrow(/Items With Views/);
    });

    it('should list available views in error message', async () => {
        await expect(provider.RunView({
            EntityName: 'Items With Views',
            AlternateViewName: 'vwDoesNotExist',
            ResultType: 'simple',
        })).rejects.toThrow(/vwTestAlternate/);
    });

    it('should throw error when entity has no AdditionalBaseViews', async () => {
        await expect(provider.RunView({
            EntityName: 'Items No Views',
            AlternateViewName: 'vwAnything',
            ResultType: 'simple',
        })).rejects.toThrow(/not registered in AdditionalBaseViews/);
    });

    it('should show (none) in error when entity has no additional views', async () => {
        await expect(provider.RunView({
            EntityName: 'Items No Views',
            AlternateViewName: 'vwAnything',
            ResultType: 'simple',
        })).rejects.toThrow(/\(none\)/);
    });
});

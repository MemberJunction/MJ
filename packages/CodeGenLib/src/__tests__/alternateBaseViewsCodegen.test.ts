import { describe, it, expect, beforeEach } from 'vitest';
import { EntityInfo, EntityAlternateBaseViewInfo } from '@memberjunction/core';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { OrderAlternateBaseViewsTopologically } from '../Database/codeGenDatabaseProvider';
import {
    SQLCodeGenBase,
    EvaluateAlternateBaseViewParityAndSafety,
} from '../Database/sql_codegen';

function createMockEntityWithAlternateViews(): EntityInfo {
    const entity = new EntityInfo({
        ID: '11111111-1111-1111-1111-111111111111',
        Name: 'Members',
        SchemaName: 'crm',
        BaseTable: 'Member',
        BaseView: 'vwMembers',
        BaseViewGenerated: true,
        IncludeInAPI: true,
        EnableFieldLevelSecurity: true,
        EntityFields: [
            {
                ID: 'f1',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                Sequence: 1,
            },
            {
                ID: 'f2',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: 'Status',
                Type: 'nvarchar',
                Length: 50,
                IsPrimaryKey: false,
                AllowsNull: false,
                Sequence: 2,
            },
            {
                ID: 'f3',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: 'SSN',
                Type: 'nvarchar',
                Length: 20,
                IsPrimaryKey: false,
                AllowsNull: true,
                Sequence: 3,
                EntityFieldPermissions: [
                    {
                        ID: 'fp1',
                        EntityFieldID: 'f3',
                        RoleID: 'role-custom-1',
                        ReadAccess: 'Deny',
                        UpdateAccess: 'No Access',
                        CreateAccess: 'No Access',
                    },
                ],
            },
        ],
        EntityPermissions: [
            {
                ID: 'ep1',
                EntityID: '11111111-1111-1111-1111-111111111111',
                RoleID: 'role-ui',
                Role: 'UI',
                RoleSQLName: 'cdp_UI',
                CanRead: true,
                CanCreate: false,
                CanUpdate: false,
                CanDelete: false,
            },
            {
                ID: 'ep2',
                EntityID: '11111111-1111-1111-1111-111111111111',
                RoleID: 'role-custom-1',
                Role: 'RestrictedAnalyst',
                RoleSQLName: 'role_RestrictedAnalyst',
                CanRead: true,
                CanCreate: false,
                CanUpdate: false,
                CanDelete: false,
            },
        ],
        EntityAlternateBaseViews: [
            // Listed child first (Sequence 1) and parent second (Sequence 2) to verify topological sort
            {
                ID: 'abv-child',
                EntityID: '11111111-1111-1111-1111-111111111111',
                ParentID: 'abv-parent',
                Name: 'ActiveAutoRenew',
                DisplayName: 'Active Auto-Renew Members',
                Description: 'Active members with AutoRenew enabled',
                SchemaName: null,
                ViewName: 'vwMembersActiveAutoRenew',
                CachePolicy: 'Default',
                Status: 'Active',
                Sequence: 1,
            },
            {
                ID: 'abv-parent',
                EntityID: '11111111-1111-1111-1111-111111111111',
                ParentID: null,
                Name: 'Active',
                DisplayName: 'Active Members',
                Description: 'Members with Status = Active',
                SchemaName: null,
                ViewName: 'vwMembersActive',
                CachePolicy: 'Default',
                Status: 'Active',
                Sequence: 2,
            },
            {
                ID: 'abv-disabled',
                EntityID: '11111111-1111-1111-1111-111111111111',
                ParentID: null,
                Name: 'Legacy',
                DisplayName: 'Legacy Members',
                Description: 'Disabled view',
                SchemaName: null,
                ViewName: 'vwMembersLegacy',
                CachePolicy: 'Default',
                Status: 'Disabled',
                Sequence: 3,
            },
        ],
    });
    return entity;
}

describe('Phase 4 — CodeGen Alternate Base Views Upkeep', () => {
    describe('OrderAlternateBaseViewsTopologically', () => {
        it('orders parent alternate base views before derived child alternate base views', () => {
            const entity = createMockEntityWithAlternateViews();
            const usable = entity.AlternateBaseViews.filter((v) => v.Status !== 'Disabled');
            // Input order has child first (Sequence 1) and parent second (Sequence 2)
            expect(usable.map((v) => v.Name)).toEqual(['ActiveAutoRenew', 'Active']);

            const sorted = OrderAlternateBaseViewsTopologically(usable);
            expect(sorted.map((v) => v.Name)).toEqual(['Active', 'ActiveAutoRenew']);
        });

        it('terminates safely if a cycle exists in raw metadata', () => {
            const v1 = new EntityAlternateBaseViewInfo({
                ID: 'v1',
                EntityID: 'e1',
                ParentID: 'v2',
                Name: 'V1',
                ViewName: 'vwV1',
                Status: 'Active',
            });
            const v2 = new EntityAlternateBaseViewInfo({
                ID: 'v2',
                EntityID: 'e1',
                ParentID: 'v1',
                Name: 'V2',
                ViewName: 'vwV2',
                Status: 'Active',
            });
            const sorted = OrderAlternateBaseViewsTopologically([v1, v2]);
            expect(sorted).toHaveLength(2);
        });
    });

    describe('SQL Server refresh and permissions (including FLS DENYs)', () => {
        let provider: SQLServerCodeGenProvider;
        let codegen: SQLCodeGenBase;

        beforeEach(() => {
            provider = new SQLServerCodeGenProvider();
            provider.SetFieldSecurityRunContext({
                RoleSQLNameByID: new Map([['role-custom-1', 'role_RestrictedAnalyst']]),
                ServiceProtectedRoleSQLNames: new Set(),
                CatalogPermissions: new Map([
                    [
                        'crm.vwmembersactive',
                        [
                            {
                                RoleName: 'cdp_UI',
                                PermissionName: 'SELECT',
                                StateDesc: 'GRANT',
                                ColumnName: null,
                            },
                        ],
                    ],
                ]),
            });
            codegen = Object.create(SQLCodeGenBase.prototype) as SQLCodeGenBase;
            codegen.DBProvider = provider;
        });

        it('emits topological sp_refreshview guarded by IF OBJECT_ID for all registered alternate views (including Disabled)', () => {
            const entity = createMockEntityWithAlternateViews();
            const statements = (
                codegen as unknown as { getAlternateBaseViewRefreshStatements(e: EntityInfo): string[] }
            ).getAlternateBaseViewRefreshStatements(entity);

            expect(statements).toHaveLength(3);
            // Parent ('vwMembersActive') must be refreshed before child ('vwMembersActiveAutoRenew')
            expect(statements[0]).toContain("IF OBJECT_ID('[crm].[vwMembersActive]', 'V') IS NOT NULL");
            expect(statements[0]).toContain("sp_refreshview ''crm.vwMembersActive''");
            expect(statements[1]).toContain("IF OBJECT_ID('[crm].[vwMembersActiveAutoRenew]', 'V') IS NOT NULL");
            expect(statements[1]).toContain("sp_refreshview ''crm.vwMembersActiveAutoRenew''");
            expect(statements[2]).toContain("IF OBJECT_ID('[crm].[vwMembersLegacy]', 'V') IS NOT NULL");
            expect(statements[2]).toContain("sp_refreshview ''crm.vwMembersLegacy''");
        });

        it('emits REVOKE, GRANT SELECT, and column-level FLS DENY SELECT on usable alternate views and REVOKE on Disabled views', () => {
            const entity = createMockEntityWithAlternateViews();
            const permSQL = (
                codegen as unknown as { generateAlternateBaseViewsPermissionsSQL(e: EntityInfo): string }
            ).generateAlternateBaseViewsPermissionsSQL(entity);

            expect(permSQL).toContain("IF OBJECT_ID('[crm].[vwMembersActive]', 'V') IS NOT NULL");
            expect(permSQL).toContain('REVOKE SELECT ON [crm].[vwMembersActive] FROM [cdp_UI]');
            expect(permSQL).toContain('GRANT SELECT ON [crm].[vwMembersActive] TO [cdp_UI], [role_RestrictedAnalyst]');
            expect(permSQL).toContain('DENY SELECT ([SSN]) ON [crm].[vwMembersActive] TO [role_RestrictedAnalyst]');
            expect(permSQL).toContain('DENY SELECT ([SSN]) ON [crm].[vwMembersActiveAutoRenew] TO [role_RestrictedAnalyst]');
            expect(permSQL).toContain('REVOKE SELECT ON [crm].[vwMembersLegacy] FROM [cdp_UI], [role_RestrictedAnalyst]');
            expect(permSQL).not.toContain('GRANT SELECT ON [crm].[vwMembersLegacy]');
        });

        it('skips alternate base views whose SchemaName or ViewName is not a valid SQL identifier', () => {
            const entity = new EntityInfo({
                ...createMockEntityWithAlternateViews().InitData,
                EntityAlternateBaseViews: [
                    {
                        ID: 'abv-bad',
                        EntityID: '11111111-1111-1111-1111-111111111111',
                        ParentID: null,
                        Name: 'BadView',
                        SchemaName: 'crm',
                        ViewName: "vwBad']; DROP TABLE [crm].[Member]; --",
                        CachePolicy: 'Default',
                        Status: 'Active',
                        Sequence: 1,
                    },
                ],
            });
            const statements = (
                codegen as unknown as { getAlternateBaseViewRefreshStatements(e: EntityInfo): string[] }
            ).getAlternateBaseViewRefreshStatements(entity);
            const permSQL = (
                codegen as unknown as { generateAlternateBaseViewsPermissionsSQL(e: EntityInfo): string }
            ).generateAlternateBaseViewsPermissionsSQL(entity);

            expect(statements).toEqual([]);
            expect(permSQL).toBe('');
        });
    });

    describe('PostgreSQL rebind and permissions', () => {
        let provider: PostgreSQLCodeGenProvider;
        let codegen: SQLCodeGenBase;

        beforeEach(() => {
            provider = new PostgreSQLCodeGenProvider();
            codegen = Object.create(SQLCodeGenBase.prototype) as SQLCodeGenBase;
            codegen.DBProvider = provider;
        });

        it('emits spRebindLayeredOuterView targeting BaseView for root alternate views and ParentView for child views', () => {
            const entity = createMockEntityWithAlternateViews();
            const statements = (
                codegen as unknown as { getAlternateBaseViewRefreshStatements(e: EntityInfo): string[] }
            ).getAlternateBaseViewRefreshStatements(entity);

            expect(statements).toHaveLength(3);
            // Parent ('vwMembersActive') rebinds against BaseView ('vwMembers')
            expect(statements[0]).toContain('spRebindLayeredOuterView');
            expect(statements[0]).toContain("''crm'', ''vwMembersActive'', ''vwMembers''");
            // Child ('vwMembersActiveAutoRenew') rebinds against parent ('vwMembersActive')
            expect(statements[1]).toContain("''crm'', ''vwMembersActiveAutoRenew'', ''vwMembersActive''");
            // Disabled ('vwMembersLegacy') is also rebound so re-enabling does not leave stale expansion
            expect(statements[2]).toContain("''crm'', ''vwMembersLegacy'', ''vwMembers''");
        });

        it('emits guarded GRANT SELECT for each usable alternate view and REVOKE SELECT for Disabled views on PostgreSQL', () => {
            const entity = createMockEntityWithAlternateViews();
            const permSQL = (
                codegen as unknown as { generateAlternateBaseViewsPermissionsSQL(e: EntityInfo): string }
            ).generateAlternateBaseViewsPermissionsSQL(entity);

            expect(permSQL).toContain('GRANT SELECT ON "crm"."vwMembersActive" TO "cdp_UI"');
            expect(permSQL).toContain('GRANT SELECT ON "crm"."vwMembersActiveAutoRenew" TO "role_RestrictedAnalyst"');
            expect(permSQL).toContain('REVOKE SELECT ON "crm"."vwMembersLegacy" FROM "cdp_UI"');
            expect(permSQL).not.toContain('GRANT SELECT ON "crm"."vwMembersLegacy"');
        });
    });

    describe('EvaluateAlternateBaseViewParityAndSafety', () => {
        const baseAuditInput = {
            entityName: 'Members',
            entitySchemaName: 'crm',
            baseViewName: 'vwMembers',
            baseViewColumns: ['ID', 'Name', 'Status', 'RenewalDate'],
            registeredAlternateViewNames: new Set(['crm.vwmembersactive', 'crm.vwmembersactiveautorenew']),
            alternateView: {
                Name: 'Active',
                EffectiveSchemaName: 'crm',
                ViewName: 'vwMembersActive',
                CachePolicy: 'Default' as const,
            },
            viewExists: true,
            viewColumns: ['ID', 'Name', 'Status', 'RenewalDate'],
            viewDefinition: "CREATE VIEW [crm].[vwMembersActive] AS SELECT * FROM [crm].[vwMembers] WHERE [Status] = 'Active'",
            dependencies: [{ ReferencedSchema: 'crm', ReferencedObject: 'vwMembers', ReferencedType: 'VIEW' }],
        };

        it('returns no warnings for a compliant alternate base view', () => {
            expect(EvaluateAlternateBaseViewParityAndSafety(baseAuditInput)).toEqual([]);
        });

        it('warns when the view is absent in the database', () => {
            const warnings = EvaluateAlternateBaseViewParityAndSafety({
                ...baseAuditInput,
                viewExists: false,
                viewColumns: [],
            });
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain('does not exist in the database');
        });

        it('warns when BaseView columns are missing on the alternate view', () => {
            const warnings = EvaluateAlternateBaseViewParityAndSafety({
                ...baseAuditInput,
                viewColumns: ['ID', 'Name'],
            });
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain('missing column(s) from BaseView');
            expect(warnings[0]).toContain('Status, RenewalDate');
        });

        it('warns when the view does not depend on BaseView (or its ParentView)', () => {
            const warnings = EvaluateAlternateBaseViewParityAndSafety({
                ...baseAuditInput,
                dependencies: [{ ReferencedSchema: 'crm', ReferencedObject: 'Member', ReferencedType: 'USER_TABLE' }],
                alternateView: {
                    ...baseAuditInput.alternateView,
                    CachePolicy: 'Bypass',
                },
            });
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain("does not depend on BaseView 'crm.vwMembers'");
        });

        it('warns when a Default-cached view references clock functions or external tables, and suppresses when Bypass', () => {
            const warningsDefault = EvaluateAlternateBaseViewParityAndSafety({
                ...baseAuditInput,
                viewDefinition:
                    "CREATE VIEW [crm].[vwMembersActive] AS SELECT m.* FROM [crm].[vwMembers] m JOIN [crm].[Subscription] s ON s.MemberID = m.ID WHERE m.RenewalDate >= GETDATE() AND s.ExpiresAt > CURRENT_TIMESTAMP",
                dependencies: [
                    { ReferencedSchema: 'crm', ReferencedObject: 'vwMembers', ReferencedType: 'VIEW' },
                    { ReferencedSchema: 'crm', ReferencedObject: 'Subscription', ReferencedType: 'USER_TABLE' },
                ],
            });
            expect(warningsDefault).toHaveLength(2);
            expect(warningsDefault[0]).toContain('GETDATE()');
            expect(warningsDefault[0]).toContain('CURRENT_TIMESTAMP');
            expect(warningsDefault[1]).toContain('crm.Subscription');

            const warningsBypass = EvaluateAlternateBaseViewParityAndSafety({
                ...baseAuditInput,
                alternateView: {
                    ...baseAuditInput.alternateView,
                    CachePolicy: 'Bypass',
                },
                viewDefinition:
                    "CREATE VIEW [crm].[vwMembersActive] AS SELECT m.* FROM [crm].[vwMembers] m JOIN [crm].[Subscription] s ON s.MemberID = m.ID WHERE m.RenewalDate >= GETDATE()",
                dependencies: [
                    { ReferencedSchema: 'crm', ReferencedObject: 'vwMembers', ReferencedType: 'VIEW' },
                    { ReferencedSchema: 'crm', ReferencedObject: 'Subscription', ReferencedType: 'USER_TABLE' },
                ],
            });
            expect(warningsBypass).toEqual([]);
        });
    });
});

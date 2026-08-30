import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, EntityFieldInfo, EntityRelationshipInfo } from '../generic/entityInfo';
import {
    ParseEntityConfiguration,
    ParseEntityFieldConfiguration,
    ParseEntityRelationshipConfiguration,
    ReadRelationshipInclusion,
    ReadRelationshipSortKey,
    ReadRelationshipJoinFields,
    ResolveFormLayout,
    ResolveRelatedFormRoles,
    type IEntityConfiguration,
    type IEntityFieldConfiguration,
    type IEntityRelationshipConfiguration,
    type RelatedFormRoleCandidate,
} from '../generic/entityConfiguration';
import { ProviderBase } from '../generic/providerBase';
import { BaseEntity } from '../generic/baseEntity';
import { Metadata } from '../generic/metadata';
import type {
    EntityMetadataRow,
    EntityFieldMetadataRow,
    EntityFieldValueMetadataRow,
    EntityChildMetadataRow,
} from '../generic/providerBase';

// Minimal test concrete provider to test PostProcessEntityMetadata pipeline
class TestProvider extends ProviderBase {
    public override async Config(): Promise<boolean> {
        return true;
    }
    public override async Refresh(): Promise<boolean> {
        return true;
    }
    public runPostProcess(
        entities: EntityMetadataRow[],
        fields: EntityFieldMetadataRow[],
        fieldValues: EntityFieldValueMetadataRow[],
        permissions: EntityChildMetadataRow[],
        relationships: EntityChildMetadataRow[],
        settings: EntityChildMetadataRow[]
    ): EntityInfo[] {
        return this.PostProcessEntityMetadata(
            entities,
            fields,
            fieldValues,
            permissions,
            relationships,
            settings
        );
    }
}

describe('Metadata Info Classes Configuration — Unit & Integration Tests', () => {

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. EntityInfo.Configuration
    // ─────────────────────────────────────────────────────────────────────────────
    describe('EntityInfo Configuration', () => {
        const sampleRealWorldEntityRow = {
            ID: 'E1000000-0000-0000-0000-000000000001',
            Name: 'PurchaseOrders',
            DisplayName: 'Purchase Orders',
            Description: 'Tracks purchasing orders placed with external vendors.',
            AutoUpdateDescription: true,
            BaseTable: 'PurchaseOrder',
            BaseView: 'vwPurchaseOrders',
            SchemaName: 'purchasing',
            IncludeInAPI: true,
            AllowAllRowsAPI: true,
            UserSearchAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            CustomResolverPath: null,
            AuditRecordAccess: false,
            AuditRecordChanges: true,
            TrackRecordChanges: true,
            UserFormGenerated: true,
            RelationshipDefaultDisplayType: 'Search' as const,
            Configuration: JSON.stringify({
                UI: {
                    Form: {
                        Layout: 'left-nav',
                        AutoLeftNavAt: 8,
                        RelatedRolePolicy: 'smart',
                        PrimaryRelatedBudget: 6,
                    },
                },
            }),
            CreatedAt: new Date('2026-01-01T00:00:00Z'),
            UpdatedAt: new Date('2026-01-02T00:00:00Z'),
        };

        it('populates _configuration string from real-world DB row without immediate JSON parsing', () => {
            const entity = new EntityInfo(sampleRealWorldEntityRow);
            // Verify raw string was stored in backing field
            expect((entity as unknown as { _configuration: string })._configuration).toBe(sampleRealWorldEntityRow.Configuration);
        });

        it('lazily parses and memoizes the strongly-typed IEntityConfiguration object', () => {
            const entity = new EntityInfo(sampleRealWorldEntityRow);

            const config1 = entity.Configuration;
            const config2 = entity.Configuration;
            const configObj = entity.ConfigurationObject;

            expect(config1).toEqual({
                UI: {
                    Form: {
                        Layout: 'left-nav',
                        AutoLeftNavAt: 8,
                        RelatedRolePolicy: 'smart',
                        PrimaryRelatedBudget: 6,
                    },
                },
            });
            // Verify referential memoization
            expect(config1).toBe(config2);
            expect(config1).toBe(configObj);
        });

        it('handles null, undefined, empty, and whitespace Configuration strings gracefully', () => {
            const nullEntity = new EntityInfo({ ID: 'e-1', Name: 'Test', Configuration: null });
            expect(nullEntity.Configuration).toBeNull();
            expect(nullEntity.ConfigurationObject).toBeNull();

            const undefEntity = new EntityInfo({ ID: 'e-2', Name: 'Test' });
            expect(undefEntity.Configuration).toBeNull();

            const emptyEntity = new EntityInfo({ ID: 'e-3', Name: 'Test', Configuration: '' });
            expect(emptyEntity.Configuration).toBeNull();

            const spaceEntity = new EntityInfo({ ID: 'e-4', Name: 'Test', Configuration: '   ' });
            expect(spaceEntity.Configuration).toBeNull();
        });

        it('handles invalid JSON string without throwing and returns null', () => {
            const malformedEntity = new EntityInfo({
                ID: 'e-bad',
                Name: 'Test',
                Configuration: '{ broken json: true, missing quotes }',
            });
            expect(malformedEntity.Configuration).toBeNull();
            expect(malformedEntity.ConfigurationObject).toBeNull();
        });

        it('re-parses lazily when Configuration is updated with a new string', () => {
            const entity = new EntityInfo(sampleRealWorldEntityRow);
            expect(entity.Configuration?.UI?.Form?.Layout).toBe('left-nav');

            entity.Configuration = JSON.stringify({
                UI: { Form: { Layout: 'accordion', AutoLeftNavAt: 12 } },
            });
            expect(entity.Configuration?.UI?.Form?.Layout).toBe('accordion');
            expect(entity.Configuration?.UI?.Form?.AutoLeftNavAt).toBe(12);
        });

        it('supports setting a typed object directly and serializes backing string', () => {
            const entity = new EntityInfo({ ID: 'e-obj', Name: 'DirectObj' });
            const directConfig: IEntityConfiguration = {
                UI: { Form: { Layout: 'accordion', PrimaryRelatedBudget: 3 } },
            };

            entity.Configuration = directConfig;
            expect(entity.Configuration).toBe(directConfig);
            expect(entity.ConfigurationObject).toBe(directConfig);
            expect((entity as unknown as { _configuration: string })._configuration).toBe(JSON.stringify(directConfig));
        });

        it('clears backing string and cache when Configuration is set to null', () => {
            const entity = new EntityInfo(sampleRealWorldEntityRow);
            expect(entity.Configuration).not.toBeNull();

            entity.Configuration = null;
            expect(entity.Configuration).toBeNull();
            expect((entity as unknown as { _configuration: string })._configuration).toBeNull();
        });

        it('integrates seamlessly with ResolveFormLayout', () => {
            const entity = new EntityInfo(sampleRealWorldEntityRow);
            const layout = ResolveFormLayout(entity.Configuration?.UI?.Form, 10);
            expect(layout).toBe('left-nav');

            const accordionEntity = new EntityInfo({
                ID: 'e-acc',
                Name: 'Acc',
                Configuration: JSON.stringify({ UI: { Form: { Layout: 'accordion' } } }),
            });
            expect(ResolveFormLayout(accordionEntity.Configuration?.UI?.Form, 10)).toBe('accordion');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. EntityFieldInfo.Configuration & Hierarchy
    // ─────────────────────────────────────────────────────────────────────────────
    describe('EntityFieldInfo Configuration & Hierarchy Properties', () => {
        const sampleRealWorldHierarchyFieldRow = {
            ID: 'F1000000-0000-0000-0000-000000000001',
            EntityID: 'E1000000-0000-0000-0000-000000000001',
            Sequence: 5,
            Name: 'ParentCategoryID',
            DisplayName: 'Parent Category',
            Description: 'Self-referencing recursive parent pointer for Category hierarchy tree.',
            AutoUpdateDescription: true,
            Type: 'uniqueidentifier',
            Length: 16,
            Precision: 0,
            Scale: 0,
            AllowsNull: true,
            DefaultValue: null,
            AutoIncrement: false,
            ValueListType: 'None' as const,
            ExtendedType: null,
            DefaultInView: true,
            IncludeInGeneratedForm: true,
            GeneratedFormSection: 'Details' as const,
            IsVirtual: false,
            IsNameField: false,
            RelatedEntityID: 'E1000000-0000-0000-0000-000000000001',
            RelatedEntityFieldName: 'ID',
            Configuration: JSON.stringify({
                Hierarchy: {
                    IsHierarchy: true,
                    MaxDepth: 30,
                },
                CustomProps: {
                    enableBreadcrumbs: true,
                },
            }),
            CreatedAt: new Date('2026-01-01T00:00:00Z'),
            UpdatedAt: new Date('2026-01-02T00:00:00Z'),
        };

        it('lazily parses hierarchy configuration and computes IsHierarchy and HierarchyMaxDepth', () => {
            const field = new EntityFieldInfo(sampleRealWorldHierarchyFieldRow);

            expect(field.IsHierarchy).toBe(true);
            expect(field.HierarchyMaxDepth).toBe(30);
            expect(field.Configuration?.Hierarchy?.IsHierarchy).toBe(true);
            expect(field.Configuration?.Hierarchy?.MaxDepth).toBe(30);
            expect((field.Configuration as { CustomProps?: { enableBreadcrumbs: boolean } })?.CustomProps?.enableBreadcrumbs).toBe(true);
            expect(field.Configuration).toBe(field.ConfigurationObject);
        });

        it('defaults HierarchyMaxDepth to 100 when MaxDepth is not specified in JSON', () => {
            const field = new EntityFieldInfo({
                ID: 'f-h-default',
                EntityID: 'e-1',
                Name: 'ParentID',
                Configuration: JSON.stringify({
                    Hierarchy: {
                        IsHierarchy: true,
                    },
                }),
            });

            expect(field.IsHierarchy).toBe(true);
            expect(field.HierarchyMaxDepth).toBe(100);
        });

        it('returns false for IsHierarchy when Configuration is absent or Hierarchy.IsHierarchy is false', () => {
            const plainField = new EntityFieldInfo({
                ID: 'f-plain',
                EntityID: 'e-1',
                Name: 'Description',
                Configuration: null,
            });
            expect(plainField.IsHierarchy).toBe(false);
            expect(plainField.HierarchyMaxDepth).toBe(100);

            const disabledHierarchyField = new EntityFieldInfo({
                ID: 'f-h-false',
                EntityID: 'e-1',
                Name: 'ReportsToID',
                Configuration: JSON.stringify({ Hierarchy: { IsHierarchy: false, MaxDepth: 50 } }),
            });
            expect(disabledHierarchyField.IsHierarchy).toBe(false);
            expect(disabledHierarchyField.HierarchyMaxDepth).toBe(50);
        });

        it('re-evaluates IsHierarchy and HierarchyMaxDepth dynamically on setter invocation', () => {
            const field = new EntityFieldInfo({
                ID: 'f-dyn',
                EntityID: 'e-1',
                Name: 'ParentID',
            });
            expect(field.IsHierarchy).toBe(false);
            expect(field.HierarchyMaxDepth).toBe(100);

            field.Configuration = JSON.stringify({ Hierarchy: { IsHierarchy: true, MaxDepth: 15 } });
            expect(field.IsHierarchy).toBe(true);
            expect(field.HierarchyMaxDepth).toBe(15);

            field.Configuration = { Hierarchy: { IsHierarchy: true, MaxDepth: 45 } };
            expect(field.IsHierarchy).toBe(true);
            expect(field.HierarchyMaxDepth).toBe(45);

            field.Configuration = null;
            expect(field.IsHierarchy).toBe(false);
            expect(field.HierarchyMaxDepth).toBe(100);
        });

        it('handles malformed JSON on EntityFieldInfo gracefully', () => {
            const field = new EntityFieldInfo({
                ID: 'f-bad',
                EntityID: 'e-1',
                Name: 'ParentID',
                Configuration: '{ bad json ',
            });
            expect(field.Configuration).toBeNull();
            expect(field.IsHierarchy).toBe(false);
            expect(field.HierarchyMaxDepth).toBe(100);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. EntityRelationshipInfo.Configuration
    // ─────────────────────────────────────────────────────────────────────────────
    describe('EntityRelationshipInfo Configuration', () => {
        const sampleRealWorldRelationshipRow = {
            ID: 'R1000000-0000-0000-0000-000000000001',
            EntityID: 'E1000000-0000-0000-0000-000000000001',
            RelatedEntityID: 'E1000000-0000-0000-0000-000000000002',
            BundleInAPI: true,
            DisplayInForm: true,
            DisplayName: 'Order Addresses',
            DisplayLocation: 'After Field Tabs' as const,
            Type: 'One To Many',
            EntityKeyField: 'ID',
            RelatedEntityJoinField: 'OrderID',
            JoinView: null,
            JoinEntityJoinField: null,
            Configuration: JSON.stringify({
                UI: {
                    inclusion: 'Primary',
                    sortKey: 25,
                    join: {
                        mode: 'any',
                        fields: ['BillToAddressID', 'ShipToAddressID'],
                    },
                },
            }),
            CreatedAt: new Date('2026-01-01T00:00:00Z'),
            UpdatedAt: new Date('2026-01-02T00:00:00Z'),
        };

        it('lazily parses relationship UI configuration and integrates with helper functions', () => {
            const rel = new EntityRelationshipInfo(sampleRealWorldRelationshipRow);

            expect(rel.Configuration).toEqual({
                UI: {
                    inclusion: 'Primary',
                    sortKey: 25,
                    join: {
                        mode: 'any',
                        fields: ['BillToAddressID', 'ShipToAddressID'],
                    },
                },
            });
            expect(rel.Configuration).toBe(rel.ConfigurationObject);

            expect(ReadRelationshipInclusion(rel.Configuration)).toBe('Primary');
            expect(ReadRelationshipSortKey(rel.Configuration)).toBe(25);
            expect(ReadRelationshipJoinFields(rel.Configuration)).toEqual(['BillToAddressID', 'ShipToAddressID']);
        });

        it('supports legacy FormRole alias in helper functions', () => {
            const relPrimary = new EntityRelationshipInfo({
                ID: 'r-legacy-1',
                EntityID: 'e-1',
                RelatedEntityID: 'e-2',
                Configuration: JSON.stringify({ UI: { FormRole: 'Primary' } }),
            });
            expect(ReadRelationshipInclusion(relPrimary.Configuration)).toBe('Primary');

            const relDetail = new EntityRelationshipInfo({
                ID: 'r-legacy-2',
                EntityID: 'e-1',
                RelatedEntityID: 'e-2',
                Configuration: JSON.stringify({ UI: { FormRole: 'Detail' } }),
            });
            expect(ReadRelationshipInclusion(relDetail.Configuration)).toBe('More');
        });

        it('returns null for helpers when Configuration is empty or invalid', () => {
            const emptyRel = new EntityRelationshipInfo({ ID: 'r-emp', EntityID: 'e-1', RelatedEntityID: 'e-2' });
            expect(ReadRelationshipInclusion(emptyRel.Configuration)).toBeNull();
            expect(ReadRelationshipSortKey(emptyRel.Configuration)).toBeNull();
            expect(ReadRelationshipJoinFields(emptyRel.Configuration)).toBeNull();

            const badRel = new EntityRelationshipInfo({
                ID: 'r-bad',
                EntityID: 'e-1',
                RelatedEntityID: 'e-2',
                Configuration: '{ bad json ',
            });
            expect(ReadRelationshipInclusion(badRel.Configuration)).toBeNull();
            expect(ReadRelationshipSortKey(badRel.Configuration)).toBeNull();
            expect(ReadRelationshipJoinFields(badRel.Configuration)).toBeNull();
        });

        it('re-evaluates helper values when Configuration is updated dynamically', () => {
            const rel = new EntityRelationshipInfo(sampleRealWorldRelationshipRow);
            expect(ReadRelationshipInclusion(rel.Configuration)).toBe('Primary');

            rel.Configuration = JSON.stringify({ UI: { inclusion: 'None', sortKey: 99 } });
            expect(ReadRelationshipInclusion(rel.Configuration)).toBe('None');
            expect(ReadRelationshipSortKey(rel.Configuration)).toBe(99);

            rel.Configuration = { UI: { inclusion: 'More' } };
            expect(ReadRelationshipInclusion(rel.Configuration)).toBe('More');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. JSON Serialization & toJSON() Round-Trip
    // ─────────────────────────────────────────────────────────────────────────────
    describe('JSON Serialization & toJSON() Round-Trip', () => {
        it('serializes EntityInfo, EntityFieldInfo, and EntityRelationshipInfo with typed Configuration objects', () => {
            const entity = new EntityInfo({
                ID: 'e-ser-1',
                Name: 'Customers',
                Configuration: JSON.stringify({ UI: { Form: { Layout: 'left-nav' } } }),
            });
            const field = new EntityFieldInfo({
                ID: 'f-ser-1',
                EntityID: 'e-ser-1',
                Name: 'ParentCustomerID',
                Configuration: JSON.stringify({ Hierarchy: { IsHierarchy: true, MaxDepth: 10 } }),
            });
            const rel = new EntityRelationshipInfo({
                ID: 'r-ser-1',
                EntityID: 'e-ser-1',
                RelatedEntityID: 'e-ser-2',
                Configuration: JSON.stringify({ UI: { inclusion: 'Primary' } }),
            });

            const serializedEntity = JSON.parse(JSON.stringify(entity));
            const serializedField = JSON.parse(JSON.stringify(field));
            const serializedRel = JSON.parse(JSON.stringify(rel));

            expect(serializedEntity.Configuration).toEqual({ UI: { Form: { Layout: 'left-nav' } } });
            expect(serializedField.Configuration).toEqual({ Hierarchy: { IsHierarchy: true, MaxDepth: 10 } });
            expect(serializedRel.Configuration).toEqual({ UI: { inclusion: 'Primary' } });
        });

        it('supports round-tripping serialized objects back into new Info class instances', () => {
            const originalEntity = new EntityInfo({
                ID: 'e-rt-1',
                Name: 'Invoices',
                Configuration: JSON.stringify({
                    UI: { Form: { Layout: 'left-nav', AutoLeftNavAt: 12, PrimaryRelatedBudget: 8 } },
                }),
            });

            const serialized = JSON.parse(JSON.stringify(originalEntity));
            // When rehydrating from serialized object, Configuration is an object:
            const rehydratedEntity = new EntityInfo({
                ...serialized,
                Configuration: JSON.stringify(serialized.Configuration),
            });

            expect(rehydratedEntity.Configuration).toEqual(originalEntity.Configuration);
            expect(rehydratedEntity.Configuration?.UI?.Form?.PrimaryRelatedBudget).toBe(8);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. Full Provider Integration via PostProcessEntityMetadata
    // ─────────────────────────────────────────────────────────────────────────────
    describe('ProviderBase Metadata Pipeline Integration', () => {
        it('processes raw metadata query records into fully wired entities, fields, and relationships with lazy Configuration', () => {
            const provider = new TestProvider();

            const rawEntities: EntityMetadataRow[] = [
                {
                    ID: '10000000-0000-0000-0000-000000000001',
                    Name: 'Companies',
                    BaseTable: 'Company',
                    BaseView: 'vwCompanies',
                    SchemaName: 'crm',
                    Configuration: JSON.stringify({
                        UI: {
                            Form: {
                                Layout: 'left-nav',
                                AutoLeftNavAt: 6,
                                RelatedRolePolicy: 'smart',
                                PrimaryRelatedBudget: 4,
                            },
                        },
                    }),
                } as EntityMetadataRow,
                {
                    ID: '10000000-0000-0000-0000-000000000002',
                    Name: 'Employees',
                    BaseTable: 'Employee',
                    BaseView: 'vwEmployees',
                    SchemaName: 'crm',
                    Configuration: null,
                } as EntityMetadataRow,
            ];

            const rawFields: EntityFieldMetadataRow[] = [
                {
                    ID: '20000000-0000-0000-0000-000000000001',
                    EntityID: '10000000-0000-0000-0000-000000000001',
                    Sequence: 1,
                    Name: 'ID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: true,
                    AllowsNull: false,
                    Configuration: null,
                } as EntityFieldMetadataRow,
                {
                    ID: '20000000-0000-0000-0000-000000000002',
                    EntityID: '10000000-0000-0000-0000-000000000001',
                    Sequence: 2,
                    Name: 'ParentCompanyID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: false,
                    AllowsNull: true,
                    RelatedEntityID: '10000000-0000-0000-0000-000000000001',
                    Configuration: JSON.stringify({
                        Hierarchy: {
                            IsHierarchy: true,
                            MaxDepth: 20,
                        },
                    }),
                } as EntityFieldMetadataRow,
                {
                    ID: '20000000-0000-0000-0000-000000000003',
                    EntityID: '10000000-0000-0000-0000-000000000002',
                    Sequence: 1,
                    Name: 'ID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: true,
                    AllowsNull: false,
                    Configuration: null,
                } as EntityFieldMetadataRow,
                {
                    ID: '20000000-0000-0000-0000-000000000004',
                    EntityID: '10000000-0000-0000-0000-000000000002',
                    Sequence: 2,
                    Name: 'CompanyID',
                    Type: 'uniqueidentifier',
                    IsPrimaryKey: false,
                    AllowsNull: false,
                    RelatedEntityID: '10000000-0000-0000-0000-000000000001',
                    Configuration: null,
                } as EntityFieldMetadataRow,
            ];

            const rawRelationships: EntityChildMetadataRow[] = [
                {
                    ID: '30000000-0000-0000-0000-000000000001',
                    EntityID: '10000000-0000-0000-0000-000000000001',
                    RelatedEntityID: '10000000-0000-0000-0000-000000000002',
                    DisplayInForm: true,
                    DisplayName: 'Company Employees',
                    RelatedEntity: 'Employees',
                    RelatedEntityJoinField: 'CompanyID',
                    Type: 'One To Many',
                    Configuration: JSON.stringify({
                        UI: {
                            inclusion: 'Primary',
                            sortKey: 10,
                        },
                    }),
                } as unknown as EntityChildMetadataRow,
            ];

            const entities = provider.runPostProcess(
                rawEntities,
                rawFields,
                [],
                [],
                rawRelationships,
                []
            );

            expect(entities).toHaveLength(2);

            const companies = entities.find(e => e.Name === 'Companies')!;
            expect(companies).toBeDefined();
            expect(companies.Configuration?.UI?.Form?.Layout).toBe('left-nav');
            expect(companies.Configuration?.UI?.Form?.PrimaryRelatedBudget).toBe(4);

            // Verify Fields
            expect(companies.Fields).toHaveLength(2);
            const parentField = companies.Fields.find(f => f.Name === 'ParentCompanyID')!;
            expect(parentField).toBeDefined();
            expect(parentField.IsHierarchy).toBe(true);
            expect(parentField.HierarchyMaxDepth).toBe(20);
            expect(parentField.Configuration?.Hierarchy?.IsHierarchy).toBe(true);

            // Verify Relationships
            expect(companies.RelatedEntities).toHaveLength(1);
            const empRel = companies.RelatedEntities[0];
            expect(empRel.DisplayName).toBe('Company Employees');
            expect(empRel.Configuration?.UI?.inclusion).toBe('Primary');
            expect(empRel.Configuration?.UI?.sortKey).toBe(10);
            expect(ReadRelationshipInclusion(empRel.Configuration)).toBe('Primary');

            // Verify Employees
            const employees = entities.find(e => e.Name === 'Employees')!;
            expect(employees).toBeDefined();
            expect(employees.Configuration).toBeNull();
        });

        it('integrates with ResolveRelatedFormRoles using candidate configurations', () => {
            const candidates: RelatedFormRoleCandidate[] = [
                {
                    ID: 'rel-c-1',
                    RelatedEntity: 'Contacts',
                    RelatedEntityID: 'ent-contacts',
                    RelatedEntityJoinField: 'CompanyID',
                    RelatedEntitySchemaName: 'crm',
                    DisplayInForm: true,
                    Configuration: JSON.stringify({ UI: { inclusion: 'Primary' } }),
                },
                {
                    ID: 'rel-c-2',
                    RelatedEntity: 'Invoices',
                    RelatedEntityID: 'ent-invoices',
                    RelatedEntityJoinField: 'CompanyID',
                    RelatedEntitySchemaName: 'billing',
                    DisplayInForm: true,
                    Configuration: JSON.stringify({ UI: { inclusion: 'More' } }),
                },
                {
                    ID: 'rel-c-3',
                    RelatedEntity: 'AuditLogs',
                    RelatedEntityID: 'ent-audit',
                    RelatedEntityJoinField: 'CompanyID',
                    RelatedEntitySchemaName: '__mj',
                    DisplayInForm: true,
                    Configuration: JSON.stringify({ UI: { inclusion: 'None' } }),
                },
            ];

            const formConfig: IEntityConfiguration['UI'] = {
                Form: {
                    Layout: 'left-nav',
                    RelatedRolePolicy: 'smart',
                    PrimaryRelatedBudget: 2,
                },
            };

            const resolution = ResolveRelatedFormRoles('crm', formConfig.Form, candidates);
            expect(resolution.Assignments).toHaveLength(3);

            const contactsAssign = resolution.Assignments.find(a => a.RelationshipID === 'rel-c-1')!;
            expect(contactsAssign.Inclusion).toBe('Primary');
            expect(contactsAssign.Role).toBe('Primary');

            const invoicesAssign = resolution.Assignments.find(a => a.RelationshipID === 'rel-c-2')!;
            expect(invoicesAssign.Inclusion).toBe('More');
            expect(invoicesAssign.Role).toBe('Detail');

            const auditAssign = resolution.Assignments.find(a => a.RelationshipID === 'rel-c-3')!;
            expect(auditAssign.Inclusion).toBe('None');
            expect(auditAssign.Reason).toBe('explicit-none');
        });
    });
});

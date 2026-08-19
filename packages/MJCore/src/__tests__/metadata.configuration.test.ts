import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo, EntityRelationshipInfo } from '../generic/entityInfo';
import type { IEntityConfiguration, IEntityFieldConfiguration, IEntityRelationshipConfiguration } from '../generic/entityConfiguration';

describe('Metadata Info Classes Configuration Lazy JSON Parsing', () => {
    describe('EntityInfo Configuration', () => {
        it('returns null when Configuration is not set or empty', () => {
            const entity = new EntityInfo();
            expect(entity.Configuration).toBeNull();
            expect(entity.ConfigurationObject).toBeNull();
        });

        it('lazily parses Configuration from initData and caches result', () => {
            const configJson: IEntityConfiguration = {
                UI: {
                    Form: {
                        Layout: 'left-nav',
                        AutoLeftNavAt: 10,
                        RelatedRolePolicy: 'smart',
                        PrimaryRelatedBudget: 5,
                    },
                },
            };
            const entity = new EntityInfo({
                ID: 'ent-1',
                Name: 'Orders',
                Configuration: JSON.stringify(configJson),
            });

            expect(entity.Configuration).toEqual(configJson);
            expect(entity.ConfigurationObject).toEqual(configJson);
            // Verify reference equality for cached instance
            expect(entity.Configuration).toBe(entity.ConfigurationObject);
        });

        it('re-parses when Configuration setter is called with a new string', () => {
            const entity = new EntityInfo();
            entity.Configuration = JSON.stringify({ UI: { Form: { Layout: 'accordion' } } });
            expect(entity.Configuration?.UI?.Form?.Layout).toBe('accordion');

            entity.Configuration = JSON.stringify({ UI: { Form: { Layout: 'left-nav' } } });
            expect(entity.Configuration?.UI?.Form?.Layout).toBe('left-nav');
        });

        it('accepts an object passed to Configuration setter directly', () => {
            const entity = new EntityInfo();
            entity.Configuration = { UI: { Form: { Layout: 'left-nav', AutoLeftNavAt: 12 } } };
            expect(entity.Configuration.UI?.Form?.AutoLeftNavAt).toBe(12);
        });
    });

    describe('EntityFieldInfo Configuration & Hierarchy', () => {
        it('returns null when Configuration is not set', () => {
            const field = new EntityFieldInfo();
            expect(field.Configuration).toBeNull();
            expect(field.ConfigurationObject).toBeNull();
            expect(field.IsHierarchy).toBe(false);
            expect(field.HierarchyMaxDepth).toBe(100);
        });

        it('lazily parses hierarchy configuration from initData', () => {
            const configJson: IEntityFieldConfiguration = {
                Hierarchy: {
                    IsHierarchy: true,
                    MaxDepth: 25,
                },
            };
            const field = new EntityFieldInfo({
                ID: 'f-1',
                Name: 'ParentCategoryID',
                Configuration: JSON.stringify(configJson),
            });

            expect(field.Configuration).toEqual(configJson);
            expect(field.ConfigurationObject).toEqual(configJson);
            expect(field.IsHierarchy).toBe(true);
            expect(field.HierarchyMaxDepth).toBe(25);
        });

        it('handles invalid JSON gracefully without throwing', () => {
            const field = new EntityFieldInfo({
                ID: 'f-2',
                Name: 'InvalidField',
                Configuration: '{ not valid json }',
            });
            expect(field.Configuration).toBeNull();
            expect(field.IsHierarchy).toBe(false);
            expect(field.HierarchyMaxDepth).toBe(100);
        });
    });

    describe('EntityRelationshipInfo Configuration', () => {
        it('returns null when Configuration is not set', () => {
            const rel = new EntityRelationshipInfo();
            expect(rel.Configuration).toBeNull();
            expect(rel.ConfigurationObject).toBeNull();
        });

        it('lazily parses relationship configuration from initData', () => {
            const configJson: IEntityRelationshipConfiguration = {
                UI: {
                    inclusion: 'Primary',
                    sortKey: 10,
                    join: {
                        mode: 'any',
                        fields: ['BillToAddressID', 'ShipToAddressID'],
                    },
                },
            };
            const rel = new EntityRelationshipInfo({
                ID: 'rel-1',
                EntityID: 'ent-1',
                RelatedEntityID: 'ent-2',
                Configuration: JSON.stringify(configJson),
            });

            expect(rel.Configuration).toEqual(configJson);
            expect(rel.ConfigurationObject).toEqual(configJson);
            expect(rel.Configuration?.UI?.inclusion).toBe('Primary');
            expect(rel.Configuration?.UI?.join?.fields).toEqual(['BillToAddressID', 'ShipToAddressID']);
        });
    });
});

/**
 * EntityInfo AdditionalBaseViews Tests
 *
 * Tests the AdditionalBaseViews functionality on EntityInfo:
 * - AdditionalBaseViewsParsed getter (lazy parse + cache)
 * - GetAdditionalBaseView() case-insensitive lookup
 * - IsValidAdditionalBaseView() boolean check
 *
 * Also tests EntityFieldInfo JSONType properties have correct defaults.
 */

import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo, IAdditionalBaseView } from '../generic/entityInfo';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEntityData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'ent-test-001',
        Name: 'Test Entity',
        BaseTable: 'TestEntity',
        BaseView: 'vwTestEntities',
        SchemaName: 'dbo',
        VirtualEntity: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        Status: 'Active',
        EntityFields: [
            {
                ID: 'f-test-id',
                EntityID: 'ent-test-001',
                Name: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                AutoIncrement: false,
                IsVirtual: false,
                IsNameField: false,
                Sequence: 1,
                Status: 'Active',
                Entity: 'Test Entity',
                EntityFieldValues: [],
            },
        ],
        EntityPermissions: [],
        EntityRelationships: [],
        EntitySettings: [],
        ...overrides,
    };
}

function makeValidAdditionalBaseViewsJSON(): string {
    const views: IAdditionalBaseView[] = [
        {
            Name: 'vwTestEntitiesWithPermissions',
            Description: 'Test entities with their permission data joined',
            SchemaName: 'dbo',
            UserSearchable: true,
        },
        {
            Name: 'vwTestEntitiesSummary',
            Description: 'Summarized view of test entities',
            UserSearchable: false,
        },
    ];
    return JSON.stringify(views);
}

// ─── EntityFieldInfo JSONType Defaults ──────────────────────────────────────

describe('EntityFieldInfo JSONType properties', () => {
    it('should have null default for JSONType', () => {
        const field = new EntityFieldInfo();
        expect(field.JSONType).toBeNull();
    });

    it('should have false default for JSONTypeIsArray', () => {
        const field = new EntityFieldInfo();
        expect(field.JSONTypeIsArray).toBe(false);
    });

    it('should have null default for JSONTypeDefinition', () => {
        const field = new EntityFieldInfo();
        expect(field.JSONTypeDefinition).toBeNull();
    });

    it('should populate JSONType properties from init data', () => {
        const field = new EntityFieldInfo({
            ID: 'f-test',
            EntityID: 'ent-test-001',
            Name: 'Config',
            Type: 'nvarchar',
            JSONType: 'IMyConfig',
            JSONTypeIsArray: true,
            JSONTypeDefinition: 'export interface IMyConfig { key: string; }',
            Sequence: 1,
            Status: 'Active',
        });
        expect(field.JSONType).toBe('IMyConfig');
        expect(field.JSONTypeIsArray).toBe(true);
        expect(field.JSONTypeDefinition).toBe('export interface IMyConfig { key: string; }');
    });
});

// ─── EntityInfo AdditionalBaseViews ─────────────────────────────────────────

describe('EntityInfo AdditionalBaseViews', () => {
    describe('AdditionalBaseViewsParsed', () => {
        it('should return null when AdditionalBaseViews is null', () => {
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: null }));
            expect(entity.AdditionalBaseViewsParsed).toBeNull();
        });

        it('should return null when AdditionalBaseViews is empty string', () => {
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: '' }));
            expect(entity.AdditionalBaseViewsParsed).toBeNull();
        });

        it('should return null when AdditionalBaseViews is not set', () => {
            const entity = new EntityInfo(makeEntityData());
            expect(entity.AdditionalBaseViewsParsed).toBeNull();
        });

        it('should correctly parse valid JSON array', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            const parsed = entity.AdditionalBaseViewsParsed;
            expect(parsed).not.toBeNull();
            expect(parsed).toHaveLength(2);
            expect(parsed![0].Name).toBe('vwTestEntitiesWithPermissions');
            expect(parsed![0].Description).toBe('Test entities with their permission data joined');
            expect(parsed![0].SchemaName).toBe('dbo');
            expect(parsed![0].UserSearchable).toBe(true);
            expect(parsed![1].Name).toBe('vwTestEntitiesSummary');
            expect(parsed![1].UserSearchable).toBe(false);
        });

        it('should cache parsed result on subsequent accesses', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            const first = entity.AdditionalBaseViewsParsed;
            const second = entity.AdditionalBaseViewsParsed;
            // Same reference means caching is working
            expect(first).toBe(second);
        });

        it('should return null and set failed flag on invalid JSON', () => {
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: 'not valid json {{{' }));

            const result = entity.AdditionalBaseViewsParsed;
            expect(result).toBeNull();

            // Subsequent call should still return null (failed flag prevents re-parse)
            const result2 = entity.AdditionalBaseViewsParsed;
            expect(result2).toBeNull();
        });

        it('should handle a single-element array', () => {
            const views: IAdditionalBaseView[] = [{ Name: 'vwSingle' }];
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: JSON.stringify(views) }));

            const parsed = entity.AdditionalBaseViewsParsed;
            expect(parsed).toHaveLength(1);
            expect(parsed![0].Name).toBe('vwSingle');
        });

        it('should handle views with only required fields', () => {
            const views: IAdditionalBaseView[] = [{ Name: 'vwMinimal' }];
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: JSON.stringify(views) }));

            const parsed = entity.AdditionalBaseViewsParsed;
            expect(parsed![0].Name).toBe('vwMinimal');
            expect(parsed![0].Description).toBeUndefined();
            expect(parsed![0].SchemaName).toBeUndefined();
            expect(parsed![0].UserSearchable).toBeUndefined();
        });
    });

    describe('GetAdditionalBaseView', () => {
        it('should find view by exact name', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            const view = entity.GetAdditionalBaseView('vwTestEntitiesWithPermissions');
            expect(view).not.toBeNull();
            expect(view!.Name).toBe('vwTestEntitiesWithPermissions');
        });

        it('should find view case-insensitively', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            const view = entity.GetAdditionalBaseView('VWTESTENTITIESWITHPERMISSIONS');
            expect(view).not.toBeNull();
            expect(view!.Name).toBe('vwTestEntitiesWithPermissions');
        });

        it('should find view with leading/trailing whitespace in query', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            const view = entity.GetAdditionalBaseView('  vwTestEntitiesSummary  ');
            expect(view).not.toBeNull();
            expect(view!.Name).toBe('vwTestEntitiesSummary');
        });

        it('should return null for unknown view name', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            const view = entity.GetAdditionalBaseView('vwNonExistent');
            expect(view).toBeNull();
        });

        it('should return null when AdditionalBaseViews is null', () => {
            const entity = new EntityInfo(makeEntityData());

            const view = entity.GetAdditionalBaseView('vwAnything');
            expect(view).toBeNull();
        });

        it('should return null when AdditionalBaseViews is invalid JSON', () => {
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: '{{bad' }));

            const view = entity.GetAdditionalBaseView('vwAnything');
            expect(view).toBeNull();
        });
    });

    describe('IsValidAdditionalBaseView', () => {
        it('should return true for a registered view', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            expect(entity.IsValidAdditionalBaseView('vwTestEntitiesWithPermissions')).toBe(true);
        });

        it('should return true case-insensitively', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            expect(entity.IsValidAdditionalBaseView('vwtestentitiessummary')).toBe(true);
        });

        it('should return false for an unregistered view', () => {
            const json = makeValidAdditionalBaseViewsJSON();
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: json }));

            expect(entity.IsValidAdditionalBaseView('vwDoesNotExist')).toBe(false);
        });

        it('should return false when AdditionalBaseViews is null', () => {
            const entity = new EntityInfo(makeEntityData());

            expect(entity.IsValidAdditionalBaseView('vwAnything')).toBe(false);
        });

        it('should return false when AdditionalBaseViews is invalid JSON', () => {
            const entity = new EntityInfo(makeEntityData({ AdditionalBaseViews: 'not json' }));

            expect(entity.IsValidAdditionalBaseView('vwAnything')).toBe(false);
        });
    });
});

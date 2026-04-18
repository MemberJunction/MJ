import { describe, it, expect } from 'vitest';
import { SaveContext, SaveContextField } from '../generic/databaseProviderBase';
import type { EntityFieldInfo } from '../generic/entityInfo';

describe('SaveContext', () => {
    function createMockFieldInfo(overrides: Partial<EntityFieldInfo> = {}): EntityFieldInfo {
        return {
            Name: 'TestField',
            ExtendedType: null,
            TSType: 'string',
            ...overrides,
        } as EntityFieldInfo;
    }

    describe('SaveContextField', () => {
        it('should hold FieldInfo reference, WasDirty, and OldValue', () => {
            const fieldInfo = createMockFieldInfo({ Name: 'City', ExtendedType: 'GeoCity' });
            const field: SaveContextField = {
                FieldInfo: fieldInfo,
                WasDirty: true,
                OldValue: 'Denver',
            };

            expect(field.FieldInfo.Name).toBe('City');
            expect(field.FieldInfo.ExtendedType).toBe('GeoCity');
            expect(field.WasDirty).toBe(true);
            expect(field.OldValue).toBe('Denver');
        });

        it('should handle null OldValue for new records', () => {
            const field: SaveContextField = {
                FieldInfo: createMockFieldInfo(),
                WasDirty: false,
                OldValue: null,
            };
            expect(field.OldValue).toBeNull();
        });
    });

    describe('SaveContext', () => {
        it('should have IsNew, Fields, and State', () => {
            const context: SaveContext = {
                IsNew: true,
                Fields: [],
                State: {},
            };

            expect(context.IsNew).toBe(true);
            expect(context.Fields).toEqual([]);
            expect(context.State).toEqual({});
        });

        it('should support State bag for cross-hook communication', () => {
            const context: SaveContext = {
                IsNew: false,
                Fields: [],
                State: {},
            };

            // Simulate OnBeforeSaveExecute setting geo flag
            context.State['geoSyncNeeded'] = true;

            // Simulate OnSaveCompleted reading it
            expect(context.State['geoSyncNeeded']).toBe(true);
        });

        it('should snapshot field state for geo detection', () => {
            const fields: SaveContextField[] = [
                {
                    FieldInfo: createMockFieldInfo({ Name: 'City', ExtendedType: 'GeoCity' }),
                    WasDirty: true,
                    OldValue: 'Denver',
                },
                {
                    FieldInfo: createMockFieldInfo({ Name: 'State', ExtendedType: 'GeoStateProvince' }),
                    WasDirty: false,
                    OldValue: 'CO',
                },
                {
                    FieldInfo: createMockFieldInfo({ Name: 'Email', ExtendedType: 'Email' }),
                    WasDirty: true,
                    OldValue: 'old@test.com',
                },
            ];

            const context: SaveContext = {
                IsNew: false,
                Fields: fields,
                State: {},
            };

            // Geo detection: find dirty fields with Geo* ExtendedType
            const GEO_TYPES = new Set(['GeoCity', 'GeoStateProvince', 'GeoCountry', 'GeoPostalCode', 'GeoAddress']);
            const hasGeoFieldDirty = context.Fields.some(
                f => f.WasDirty && f.FieldInfo.ExtendedType != null && GEO_TYPES.has(f.FieldInfo.ExtendedType)
            );

            expect(hasGeoFieldDirty).toBe(true); // City was dirty
        });

        it('should detect no geo change when only non-geo fields are dirty', () => {
            const fields: SaveContextField[] = [
                {
                    FieldInfo: createMockFieldInfo({ Name: 'City', ExtendedType: 'GeoCity' }),
                    WasDirty: false,
                    OldValue: 'Denver',
                },
                {
                    FieldInfo: createMockFieldInfo({ Name: 'Email', ExtendedType: 'Email' }),
                    WasDirty: true,
                    OldValue: 'old@test.com',
                },
            ];

            const context: SaveContext = {
                IsNew: false,
                Fields: fields,
                State: {},
            };

            const GEO_TYPES = new Set(['GeoCity', 'GeoStateProvince', 'GeoCountry', 'GeoPostalCode', 'GeoAddress']);
            const hasGeoFieldDirty = context.Fields.some(
                f => f.WasDirty && f.FieldInfo.ExtendedType != null && GEO_TYPES.has(f.FieldInfo.ExtendedType)
            );

            expect(hasGeoFieldDirty).toBe(false);
        });

        it('should treat all fields as needing geo sync for new records', () => {
            const context: SaveContext = {
                IsNew: true,
                Fields: [
                    {
                        FieldInfo: createMockFieldInfo({ Name: 'City', ExtendedType: 'GeoCity' }),
                        WasDirty: false, // Not technically dirty on new record but IsNew is true
                        OldValue: null,
                    },
                ],
                State: {},
            };

            // For new records, we check IsNew regardless of dirty flags
            const hasGeoFields = context.Fields.some(
                f => f.FieldInfo.ExtendedType != null && f.FieldInfo.ExtendedType.startsWith('Geo')
            );
            const needsGeoSync = context.IsNew && hasGeoFields;

            expect(needsGeoSync).toBe(true);
        });

        it('should support multiple State entries without interference', () => {
            const context: SaveContext = {
                IsNew: false,
                Fields: [],
                State: {},
            };

            // Multiple hooks writing to State
            context.State['geoSyncNeeded'] = true;
            context.State['auditLogged'] = false;
            context.State['customData'] = { key: 'value' };

            expect(context.State['geoSyncNeeded']).toBe(true);
            expect(context.State['auditLogged']).toBe(false);
            expect(context.State['customData']).toEqual({ key: 'value' });
        });
    });
});

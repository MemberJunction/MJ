import { describe, it, expect } from 'vitest';
import { EntityFieldInfo, EntityInfo } from '../generic/entityInfo';
import {
    ShouldJoinRecordGeoCodes,
    EmbeddedGeoVirtualNames,
    ListEmbeddedGeoSpecs,
    ResolveMapLatitudeField,
    EntityHasMapCoordinates,
    HasNativeLatLngFields,
} from '../generic/geoFields';

function field(partial: Partial<EntityFieldInfo> & { Name: string }): EntityFieldInfo {
    const f = new EntityFieldInfo();
    Object.assign(f, {
        IsVirtual: false,
        AllowUpdateAPI: true,
        AllowsNull: true,
        ExtendedType: null,
        ...partial,
    });
    return f;
}

function entity(name: string, fields: EntityFieldInfo[], supports = true): EntityInfo {
    const e = new EntityInfo();
    e.Name = name;
    e.SupportsGeoCoding = supports;
    (e as unknown as { _Fields: EntityFieldInfo[] })._Fields = fields;
    // EntityInfo.Fields getter — set via Init if needed
    Object.defineProperty(e, 'Fields', { get: () => fields, configurable: true });
    return e;
}

describe('writable vs display Geo*', () => {
    it('virtual PrimaryAddressLatitude is Geo but not writable', () => {
        const f = field({ Name: 'PrimaryAddressLatitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false });
        expect(f.IsGeoExtendedType).toBe(true);
        expect(f.IsWritableGeoField).toBe(false);
        expect(f.IsNativeLatitudeField).toBe(false);
    });

    it('Address.Latitude ExtendedType=Geo is native writable lat', () => {
        const f = field({ Name: 'Latitude', ExtendedType: 'Geo', IsVirtual: false, AllowUpdateAPI: true });
        expect(f.IsWritableGeoField).toBe(true);
        expect(f.IsNativeLatitudeField).toBe(true);
    });

    it('HasWritableGeoSourceFields is false for Person-like entities', () => {
        const e = entity('MJ_BizApps_Common: People', [
            field({ Name: 'FirstName', ExtendedType: null }),
            field({ Name: 'PrimaryAddressLatitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false }),
            field({ Name: '__mj_Latitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false }),
        ]);
        expect(e.HasWritableGeoSourceFields).toBe(false);
    });
});

describe('ShouldJoinRecordGeoCodes', () => {
    it('is false for Person-like (no writable geo)', () => {
        expect(ShouldJoinRecordGeoCodes(entity('People', [
            field({ Name: 'PrimaryAddressLatitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false }),
        ]))).toBe(false);
    });

    it('is false when native lat/lng exist', () => {
        expect(ShouldJoinRecordGeoCodes(entity('Addresses', [
            field({ Name: 'Latitude', ExtendedType: 'GeoLatitude' }),
            field({ Name: 'Longitude', ExtendedType: 'GeoLongitude' }),
            field({ Name: 'Line1', ExtendedType: 'GeoAddress' }),
        ]))).toBe(false);
        expect(HasNativeLatLngFields(entity('Addresses', [
            field({ Name: 'Latitude', ExtendedType: 'GeoLatitude' }),
            field({ Name: 'Longitude', ExtendedType: 'GeoLongitude' }),
        ]).Fields)).toBe(true);
    });

    it('is true when writable street exists without native lat/lng', () => {
        expect(ShouldJoinRecordGeoCodes(entity('Sites', [
            field({ Name: 'Street', ExtendedType: 'GeoAddress' }),
        ]))).toBe(true);
    });
});

describe('embedded geo names', () => {
    it('ShipToAddressID → __mj_Latitude_ShipToAddressID', () => {
        expect(EmbeddedGeoVirtualNames('ShipToAddressID')).toEqual({
            lat: '__mj_Latitude_ShipToAddressID',
            lng: '__mj_Longitude_ShipToAddressID',
        });
    });

    it('lists specs from EmbeddedRecord FKs', () => {
        const specs = ListEmbeddedGeoSpecs([
            field({
                Name: 'ShipToAddressID',
                EmbeddedRecord: '{}',
                RelatedEntityID: 'addr-id',
                RelatedEntity: 'MJ_BizApps_Common: Addresses',
                RelatedEntitySchemaName: '__mj_BizAppsCommon',
                RelatedEntityBaseTable: 'Address',
            }),
        ]);
        expect(specs).toHaveLength(1);
        expect(specs[0].lat).toBe('__mj_Latitude_ShipToAddressID');
    });
});

describe('map field resolution', () => {
    it('prefers PrimaryAddressLatitude over __mj_Latitude', () => {
        const e = entity('People', [
            field({ Name: '__mj_Latitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false }),
            field({ Name: 'PrimaryAddressLatitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false }),
        ]);
        expect(ResolveMapLatitudeField(e)).toBe('PrimaryAddressLatitude');
    });

    it('prefers writable native over PrimaryAddress', () => {
        const e = entity('Addresses', [
            field({ Name: 'Latitude', ExtendedType: 'GeoLatitude' }),
            field({ Name: 'PrimaryAddressLatitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false }),
        ]);
        expect(ResolveMapLatitudeField(e)).toBe('Latitude');
    });

    it('EntityHasMapCoordinates is true with only virtual GeoLatitude', () => {
        const e = entity('People', [
            field({ Name: 'PrimaryAddressLatitude', ExtendedType: 'GeoLatitude', IsVirtual: true, AllowUpdateAPI: false }),
        ], false);
        expect(EntityHasMapCoordinates(e)).toBe(true);
    });
});

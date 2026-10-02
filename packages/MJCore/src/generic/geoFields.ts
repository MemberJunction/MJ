/**
 * Geo field helpers shared by GeoCodeSyncService (write), maps/distance (read),
 * and CodeGen (view SQL).
 *
 * **Write vs read:** `SupportsGeoCoding` means the entity can show a map and
 * participate in geo calcs. GeoCodeSyncService only runs when there is at least
 * one **writable** Geo* field. Virtual display fields (PrimaryAddressLatitude,
 * `__mj_Latitude`, `__mj_Latitude_{FK}`) never invoke the provider.
 *
 * **Anti-patterns:** do not author RecordGeoCode JSON + SHA to skip import
 * geocoding; do not treat Person/Org primary address as EmbeddedRecord (that is
 * AddressLink + layered view → PrimaryAddressLatitude).
 */
import { EntityFieldInfo, EntityInfo } from './entityInfo';

/**
 * True when the entity has a native (table) latitude **and** longitude column.
 * Virtual `__mj_Latitude` / PrimaryAddress* do not count.
 */
export function HasNativeLatLngFields(fields: EntityFieldInfo[]): boolean {
    return fields.some(f => f.IsNativeLatitudeField) && fields.some(f => f.IsNativeLongitudeField);
}

/** First native latitude column, or undefined. */
export function NativeLatitudeField(fields: EntityFieldInfo[]): EntityFieldInfo | undefined {
    return fields.find(f => f.IsNativeLatitudeField);
}

/** First native longitude column, or undefined. */
export function NativeLongitudeField(fields: EntityFieldInfo[]): EntityFieldInfo | undefined {
    return fields.find(f => f.IsNativeLongitudeField);
}

/**
 * RecordGeoCode JOIN belongs on entities that are geo **sources** without native
 * lat/lng columns. Display-only entities (Person/Org with virtual PrimaryAddress*)
 * must not join vwRecordGeoCodes on their own ID.
 */
export function ShouldJoinRecordGeoCodes(entity: Pick<EntityInfo, 'SupportsGeoCoding' | 'Name'> & { Fields: EntityFieldInfo[] }): boolean {
    if (!entity.SupportsGeoCoding) return false;
    if (entity.Name.trim().toLowerCase() === 'mj: record geo codes') return false;
    if (HasNativeLatLngFields(entity.Fields)) return false;
    return entity.Fields.some(f => f.IsWritableGeoField);
}

/** Embedded bubble virtuals: `__mj_Latitude_ShipToAddressID`. */
export function EmbeddedGeoVirtualNames(foreignKeyField: string): { lat: string; lng: string } {
    return {
        lat: `__mj_Latitude_${foreignKeyField}`,
        lng: `__mj_Longitude_${foreignKeyField}`,
    };
}

/** One EmbeddedRecord FK that should bubble lat/lng onto the parent view. */
export type EmbeddedGeoSpec = {
    foreignKeyField: string;
    relatedEntityID: string;
    relatedEntityName: string | null;
    relatedSchemaName: string | null;
    relatedBaseTable: string | null;
    relatedBaseView: string | null;
    lat: string;
    lng: string;
    allowsNull: boolean;
};

/**
 * EmbeddedRecord foreign keys on `fields` that CodeGen should JOIN for
 * `__mj_Latitude_{FK}` / `__mj_Longitude_{FK}` display columns.
 */
export function ListEmbeddedGeoSpecs(fields: EntityFieldInfo[]): EmbeddedGeoSpec[] {
    const out: EmbeddedGeoSpec[] = [];
    for (const f of fields) {
        if (!f.EmbeddedRecord || !f.RelatedEntityID) continue;
        const names = EmbeddedGeoVirtualNames(f.Name);
        out.push({
            foreignKeyField: f.Name,
            relatedEntityID: f.RelatedEntityID,
            relatedEntityName: f.RelatedEntity ?? null,
            relatedSchemaName: f.RelatedEntitySchemaName ?? null,
            relatedBaseTable: f.RelatedEntityBaseTable ?? null,
            relatedBaseView: f.RelatedEntityBaseView ?? null,
            lat: names.lat,
            lng: names.lng,
            allowsNull: !!f.AllowsNull,
        });
    }
    return out;
}

/**
 * Map / distance lat field. Override wins; otherwise:
 * writable native → PrimaryAddressLatitude → `__mj_Latitude_{FK}` → `__mj_Latitude`
 * → first GeoLatitude / Geo-named Latitude.
 */
export function ResolveMapLatitudeField(entity: EntityInfo, override?: string | null): string {
    return resolveCoordField(entity, override, '__mj_Latitude', 'PrimaryAddressLatitude', f => f.IsNativeLatitudeField || f.ExtendedType === 'GeoLatitude' || (f.ExtendedType === 'Geo' && /^lat/i.test(f.Name)));
}

/** Same resolution order as {@link ResolveMapLatitudeField} for longitude. */
export function ResolveMapLongitudeField(entity: EntityInfo, override?: string | null): string {
    return resolveCoordField(entity, override, '__mj_Longitude', 'PrimaryAddressLongitude', f => f.IsNativeLongitudeField || f.ExtendedType === 'GeoLongitude' || (f.ExtendedType === 'Geo' && /^(lng|lon|long)/i.test(f.Name)));
}

/**
 * Shared lat/lng picker. `override` wins when it is not the MJ default name;
 * otherwise prefers writable native, then PrimaryAddress*, then `__mj_*_{FK}`,
 * then `__mj_*`, then any matching Geo* field.
 */
function resolveCoordField(
    entity: EntityInfo,
    override: string | null | undefined,
    mjDefault: string,
    primaryAddress: string,
    isCoord: (f: EntityFieldInfo) => boolean,
): string {
    if (override && override !== mjDefault) return override;
    const fields = entity.Fields ?? [];
    const writable = fields.find(f => isCoord(f) && f.IsWritableGeoField);
    if (writable) return writable.Name;
    const primary = fields.find(f => f.Name === primaryAddress && isCoord(f));
    if (primary) return primary.Name;
    const embedded = fields.find(f => f.Name.startsWith(mjDefault + '_') && isCoord(f));
    if (embedded) return embedded.Name;
    const mj = fields.find(f => f.Name === mjDefault);
    if (mj) return mj.Name;
    const tagged = fields.find(isCoord);
    if (tagged) return tagged.Name;
    return mjDefault;
}

/** Map toggle: SupportsGeoCoding OR any coordinate Geo* field (including virtual display). */
export function EntityHasMapCoordinates(entity: EntityInfo): boolean {
    if (entity.SupportsGeoCoding) return true;
    return (entity.Fields ?? []).some(f =>
        f.ExtendedType === 'GeoLatitude' ||
        f.ExtendedType === 'GeoLongitude' ||
        f.IsNativeLatitudeField ||
        f.IsNativeLongitudeField
    );
}

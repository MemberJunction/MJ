/**
 * Per-save side-effect suppression at the provider layer.
 *
 * Two gates are pinned here:
 *  - geocoding: `OnBeforeSaveExecute` must not flag `geoSyncNeeded` when the save carries
 *    `SkipGeoCoding` — and MUST still flag it for an identical save without the option, so the
 *    suppression is provably per-save, not per-entity.
 *  - record changes (delete path is exercised in the PG provider's own test; the save path
 *    shares the same `ShouldTrackRecordChanges(...) && options?.SkipRecordChanges !== true`
 *    gate in GenerateSaveSQL).
 */
import { describe, it, expect } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider.js';
import { EntityFieldInfo, EntityInfo, type BaseEntity, type UserInfo, type EntitySaveOptions } from '@memberjunction/core';

type SaveContextLike = { IsNew: boolean; Fields: unknown[]; State: Record<string, unknown> };
type Host = {
    OnBeforeSaveExecute: (e: BaseEntity, u: UserInfo, o: EntitySaveOptions, c: SaveContextLike) => Promise<void>;
};

function makeHost(): Host {
    const host = Object.create(GenericDatabaseProvider.prototype) as Record<string, unknown>;
    // Entity/AI actions are separate machinery with their own Skip options — inert here.
    host.HandleEntityActions = async () => undefined;
    host.HandleEntityAIActions = async () => undefined;
    return host as unknown as Host;
}

function geoEntity(opts: {
    writable?: boolean;
    lat?: number | null;
    lng?: number | null;
    virtualOnly?: boolean;
}): BaseEntity {
    const lat = new EntityFieldInfo();
    Object.assign(lat, {
        Name: opts.virtualOnly ? 'PrimaryAddressLatitude' : 'Latitude',
        ExtendedType: 'GeoLatitude',
        IsVirtual: !!opts.virtualOnly,
        AllowUpdateAPI: !opts.virtualOnly,
    });
    const lng = new EntityFieldInfo();
    Object.assign(lng, {
        Name: opts.virtualOnly ? 'PrimaryAddressLongitude' : 'Longitude',
        ExtendedType: 'GeoLongitude',
        IsVirtual: !!opts.virtualOnly,
        AllowUpdateAPI: !opts.virtualOnly,
    });
    const info = new EntityInfo();
    info.Name = opts.virtualOnly ? 'People' : 'Addresses';
    info.SupportsGeoCoding = true;
    Object.defineProperty(info, 'Fields', { get: () => [lat, lng], configurable: true });
    const values: Record<string, unknown> = { Latitude: opts.lat ?? null, Longitude: opts.lng ?? null };
    return {
        EntityInfo: info,
        Get: (n: string) => values[n],
    } as unknown as BaseEntity;
}

const user = {} as UserInfo;
const newRecordCtx = (): SaveContextLike => ({ IsNew: true, Fields: [], State: {} });

describe('geocoding is suppressed per SAVE, not per entity', () => {
    it('a normal save on a writable-geo entity without coords flags the geo sync', async () => {
        const ctx = newRecordCtx();
        await makeHost().OnBeforeSaveExecute(geoEntity({}), user, {} as EntitySaveOptions, ctx);
        expect(ctx.State['geoSyncNeeded']).toBe(true);
    });

    it('the SAME save with SkipGeoCoding does not — entity flag untouched, other writers unaffected', async () => {
        const ctx = newRecordCtx();
        await makeHost().OnBeforeSaveExecute(geoEntity({}), user, { SkipGeoCoding: true } as EntitySaveOptions, ctx);
        expect(ctx.State['geoSyncNeeded']).toBeUndefined();
    });

    it('virtual-only Geo* (Person PrimaryAddress) never flags geo sync', async () => {
        const ctx = newRecordCtx();
        await makeHost().OnBeforeSaveExecute(geoEntity({ virtualOnly: true }), user, {} as EntitySaveOptions, ctx);
        expect(ctx.State['geoSyncNeeded']).toBeUndefined();
    });

    it('native lat/lng already set does not call the provider', async () => {
        const ctx = newRecordCtx();
        await makeHost().OnBeforeSaveExecute(geoEntity({ lat: 38.2, lng: -122.6 }), user, {} as EntitySaveOptions, ctx);
        expect(ctx.State['geoSyncNeeded']).toBeUndefined();
    });
});

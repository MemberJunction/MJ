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
import type { BaseEntity, UserInfo, EntitySaveOptions } from '@memberjunction/core';

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

const geoEntity = { EntityInfo: { SupportsGeoCoding: true } } as unknown as BaseEntity;
const user = {} as UserInfo;
const newRecordCtx = (): SaveContextLike => ({ IsNew: true, Fields: [], State: {} });

describe('geocoding is suppressed per SAVE, not per entity', () => {
    it('a normal save on a geo entity flags the geo sync', async () => {
        const ctx = newRecordCtx();
        await makeHost().OnBeforeSaveExecute(geoEntity, user, {} as EntitySaveOptions, ctx);
        expect(ctx.State['geoSyncNeeded']).toBe(true);
    });

    it('the SAME save with SkipGeoCoding does not — entity flag untouched, other writers unaffected', async () => {
        const ctx = newRecordCtx();
        await makeHost().OnBeforeSaveExecute(geoEntity, user, { SkipGeoCoding: true } as EntitySaveOptions, ctx);
        expect(ctx.State['geoSyncNeeded']).toBeUndefined();
    });
});

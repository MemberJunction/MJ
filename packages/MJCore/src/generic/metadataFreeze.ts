import { DeepFreezeInfoValue } from "./baseInfo";
import type { AllMetadata } from "./interfaces";

/**
 * Environment variable that turns the shared-metadata freeze on (`1`/`true`/`on`/`yes`) or off
 * (`0`/`false`/`off`/`no`). Unset, the freeze is on unless `NODE_ENV` is `production` (#3095).
 */
export const FREEZE_METADATA_ENV_VAR = 'MJ_FREEZE_METADATA';

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);
const DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);

/**
 * Whether metadata graphs shared across providers are frozen (#3095).
 *
 * `MJ_FREEZE_METADATA` wins when set to a recognized value. Otherwise the freeze is on when
 * `NODE_ENV` is anything but `production`, so development catches new writers while deployed
 * apps keep today's behavior. Where `process` does not exist (a browser bundle) the freeze is off:
 * there is no reliable way to tell a development build from a production one there.
 */
export function IsMetadataFreezeEnabled(): boolean {
    if (typeof process === 'undefined' || !process.env) {
        return false;
    }
    const raw = process.env[FREEZE_METADATA_ENV_VAR];
    const normalized = raw?.trim().toLowerCase();
    if (normalized && ENABLED_VALUES.has(normalized)) {
        return true;
    }
    if (normalized && DISABLED_VALUES.has(normalized)) {
        return false;
    }
    return process.env.NODE_ENV !== 'production';
}

/** Metadata snapshots already frozen; a per-request provider adopting one again costs one lookup. */
const frozenSnapshots = new WeakSet<AllMetadata>();

/**
 * Freezes the Info objects of a metadata snapshot that providers share, so a write from any
 * resolver or app throws a `TypeError` instead of silently changing metadata for every request.
 *
 * Frozen: every top-level collection (`AllEntities`, `AllApplications`, ...), every Info object in
 * them, every array they own (`entity.Fields`, `entity.RelatedEntities`, ...) and every plain object
 * they hold (parsed configuration and similar) — no property writes, no push, sort or splice.
 *
 * Left as is, on purpose:
 * - the `AllMetadata` object itself, because per-request shells are `Object.create(snapshot)` and
 *   assign their own `CurrentUser`; a read-only inherited property would make that assignment throw;
 * - `CurrentUser`, which is per provider and not part of the shared graph;
 * - `Map`/`Set` and class instances other than Info objects (a provider, a user).
 *
 * The Info classes cache derived values in `_` fields after construction; those registered with
 * `RegisterInfoMemoFields` move to a side `WeakMap` so their getters keep working (see
 * {@link DeepFreezeInfoValue}).
 *
 * Idempotent: a snapshot is frozen once, and objects kept across a partial refresh are not walked again.
 * @param snapshot - the shared metadata snapshot
 * @param collectionKeys - the snapshot's collection property names (`AllMetadataArrays` keys)
 */
export function FreezeSharedMetadata(snapshot: AllMetadata, collectionKeys: readonly string[]): void {
    if (!snapshot || frozenSnapshots.has(snapshot)) {
        return;
    }
    const collections = snapshot as unknown as Record<string, unknown>;
    for (const key of collectionKeys) {
        DeepFreezeInfoValue(collections[key]);
    }
    frozenSnapshots.add(snapshot);
}

/** Whether a metadata snapshot has been frozen by {@link FreezeSharedMetadata}. */
export function IsMetadataSnapshotFrozen(snapshot: AllMetadata): boolean {
    return !!snapshot && frozenSnapshots.has(snapshot);
}

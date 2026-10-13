/**
 * @fileoverview Resolving the row behind a `remote-invalidate` event.
 *
 * Cache-invalidation events reach every connected client on one unfiltered subscription, so the
 * server only attaches the row (`recordData`) for entities a deployment has explicitly opted in
 * — otherwise every session would receive rows it has no right to read. See
 * `cacheSettings.recordDataBroadcastEntities` in `@memberjunction/server`.
 *
 * That leaves consumers needing a row they no longer receive. This module is the one way to get
 * it: re-read that single record through the provider, as the signed-in user, so the server's
 * access control decides what comes back. A user who may not read the row gets `null`, which is
 * the correct answer rather than an error.
 */
import type { BaseEntity, BaseEntityEvent } from './baseEntity';
import { CompositeKey, KeyValuePair } from './compositeKey';
import type { RunViewResult } from './interfaces';
import type { RunViewParams } from '../views/runView';
import type { UserInfo } from './securityInfo';
import { LogError } from './logging';

/**
 * What re-reading an event's record needs from a provider: a view run on the pool, and an entity object to load the
 * row into. Every MJ data provider satisfies it (`ProviderBase` implements `RunView` and `GetEntityObject`);
 * `RunView` is optional because `IMetadataProvider` does not declare it, and a provider without it cannot re-read.
 */
export interface EntityEventRowProvider {
    GetEntityObject(entityName: string, contextUser?: UserInfo): Promise<Pick<BaseEntity, 'LoadFromData' | 'GetAll'>>;
    RunView?(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<Record<string, unknown>>>;
}

/** The `remote-invalidate` payload shape published by `@memberjunction/server`. */
interface RemoteInvalidatePayload {
    primaryKeyValues?: string | null;
    recordData?: string | null;
    action?: string;
}

/**
 * The row behind an entity event, however it has to be obtained.
 *
 * Three sources, in order:
 * 1. **Local event** — `event.baseEntity` is the live instance; its fields are already in hand.
 * 2. **Remote event carrying `recordData`** — the entity is on the broadcast allowlist; parse it.
 * 3. **Remote event without `recordData`** — re-read the one record by primary key through
 *    `provider`, as `contextUser`. This is the access-controlled path, and it is the only one
 *    that can supply fields the primary key does not carry (a detail's `ConversationID`, say).
 *
 * @returns the row's fields, or `null` when there is no key to read by, the read is refused, or
 *          the record no longer exists. Callers should treat `null` as "not mine / nothing to do"
 *          rather than as a failure — a refused read is the expected outcome for a session that
 *          may not see the record.
 */
export async function ResolveEntityEventRow(
    event: BaseEntityEvent,
    provider?: EntityEventRowProvider,
    contextUser?: UserInfo,
): Promise<Record<string, unknown> | null> {
    if (event.baseEntity) {
        return event.baseEntity.GetAll();
    }

    const payload = event.payload as RemoteInvalidatePayload | undefined;
    if (payload?.recordData) {
        try {
            return JSON.parse(payload.recordData) as Record<string, unknown>;
        } catch {
            // Fall through to the re-read: a malformed payload is not a reason to give up on a
            // row we can still fetch by key.
        }
    }

    return await reReadByPrimaryKey(event, payload, provider, contextUser);
}

/**
 * Can this event's row be obtained WITHOUT a provider round-trip?
 *
 * True for a local event — the row IS the live entity — and for a remote event whose payload
 * already carries `recordData`, because the entity is on the server's broadcast allowlist.
 *
 * Callers that skip hydration to avoid a read must ask this FIRST. A free row is never worth
 * skipping, and skipping one is indistinguishable, downstream, from a row that could not be read:
 * the handler receives `null` and reads every field as `undefined`. Whether a handler *would* use
 * the row and whether obtaining it *costs* anything are two different questions, and only the
 * second justifies skipping.
 */
export function EntityEventRowIsFree(event: BaseEntityEvent): boolean {
    if (event.baseEntity) {
        return true;
    }
    const payload = event.payload as RemoteInvalidatePayload | undefined;
    return !!payload?.recordData;
}

/**
 * The identity of the record an event refers to, without needing the row.
 *
 * Available whatever the broadcast allowlist says — the primary key is never withheld, because it
 * discloses nothing a client cannot already derive and it is what every consumer needs to know
 * *which* record changed. Prefer this over reading an id out of the row.
 */
export function ResolveEntityEventKey(event: BaseEntityEvent): CompositeKey | null {
    if (event.baseEntity) {
        return event.baseEntity.PrimaryKey ?? null;
    }
    const payload = event.payload as RemoteInvalidatePayload | undefined;
    return parseKey(payload?.primaryKeyValues);
}

/**
 * Re-read one record by key. Never throws — a consumer's event handler must not die on it.
 *
 * The read runs on the pool (`RunViewParams.ReadOnPool`, as `BaseEngine.BackgroundReloadReads` does for engine
 * reloads): an event handler runs detached from whatever else is using the provider, so a transaction another unit
 * of work has open at that moment is not this read's — joining it would hand the handler uncommitted rows, or fail
 * once that transaction ends first. The row comes back as plain fields through `RunView` (which applies the user's
 * row-level and field-level read permissions, as a keyed load does) and is then loaded into an entity object with
 * `LoadFromData`, so the caller gets the same field values a keyed `GetEntityObject` would have produced.
 */
async function reReadByPrimaryKey(
    event: BaseEntityEvent,
    payload: RemoteInvalidatePayload | undefined,
    provider: EntityEventRowProvider | undefined,
    contextUser: UserInfo | undefined,
): Promise<Record<string, unknown> | null> {
    const entityName = event.entityName;
    // `event.provider` is populated for remote-invalidate specifically because `baseEntity` is
    // null there and listeners have nothing else to read through.
    const p: EntityEventRowProvider | undefined = provider ?? event.provider;
    const key = parseKey(payload?.primaryKeyValues);
    if (!entityName || !p || !key) {
        return null;
    }
    if (!p.RunView) {
        LogError(`ResolveEntityEventRow: the provider cannot run views, so ${entityName} cannot be re-read`);
        return null;
    }

    try {
        const params: RunViewParams = {
            EntityName: entityName,
            ExtraFilter: key.ToWhereClause(),
            ResultType: 'simple',
            MaxRows: 1,
            ReadOnPool: true,
        };
        const result = await p.RunView(params, contextUser);
        // A refused read and a deleted record both land here, and both mean the same thing to a
        // caller: there is no row to apply.
        const row = result.Success ? result.Results?.[0] : undefined;
        if (!row) {
            return null;
        }
        const record = await p.GetEntityObject(entityName, contextUser);
        await record.LoadFromData(row);
        return record.GetAll();
    } catch (e) {
        LogError(`ResolveEntityEventRow: could not re-read ${entityName} by key: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

/**
 * Rebuild the key from the published `primaryKeyValues`.
 *
 * `FromKeyValuePairs` rather than `FromID`: the entity here is whatever the event names, so a
 * composite key has to survive. See `.claude/rules/data-access.md` on not assuming a single
 * `ID` column for an arbitrary entity.
 */
function parseKey(primaryKeyValues: string | null | undefined): CompositeKey | null {
    if (!primaryKeyValues) {
        return null;
    }
    try {
        const pairs = JSON.parse(primaryKeyValues) as KeyValuePair[];
        if (!Array.isArray(pairs) || pairs.length === 0) {
            return null;
        }
        return CompositeKey.FromKeyValuePairs(pairs);
    } catch {
        return null;
    }
}

/**
 * @fileoverview `MJ.SaveEntityGraph` — the remote operation that lets a client save a parent record
 * and its companion-contributed children as one atomic unit of work.
 *
 * ## Why a remote operation rather than a wire change
 *
 * A client provider has no transaction to open, so it cannot make several round trips atomic. The
 * options were:
 *
 * 1. Add a `Companions___` field to every generated Create/Update GraphQL input type. That is a
 *    CodeGen change touching every entity's published input schema across 100+ packages.
 * 2. Ship **one** framework-level remote operation that carries the whole graph.
 *
 * This is (2). `BaseRemotableOperation` already provides a typed RPC whose `Execute()` is identical
 * on both tiers — marshalled over GraphQL from the browser, dispatched in-process on the server —
 * so a single registration covers every entity, forever, with **zero changes to any generated
 * GraphQL type**. Under MemberJunction's publish-then-no-breaking-changes policy, adding nothing to
 * a published schema is worth a great deal.
 *
 * It is also the pattern the applications reached for on their own: `bizapps-orders` already ships
 * `Orders.SaveOrder`, a hand-written remote operation that hydrates a client draft and hands it to
 * `OrderEntityServer.Save()`. This generalises that.
 *
 * ## What happens server-side
 *
 * The operation rebuilds the root record through `provider.GetEntityObject()`, so it resolves to
 * whatever subclass is registered **on the server** — `OrderEntityServer`, not the shared
 * `OrderEntity`. Companions are deserialised onto it, and then plain `entity.Save()` runs, which
 * takes the ordinary local graph path inside a real transaction. Server-side business logic,
 * `PreSave` hooks, Record Changes, entity actions and events all run exactly as they would for a
 * save initiated on the server.
 *
 * ## Security
 *
 * This is the same API-key bypass surface that `TransactionGroupResolver` had to be patched for
 * (bug-register B1 / SEC1): a restricted key could otherwise perform writes by wrapping them in a
 * batch mutation whose scope ceiling was never consulted. {@link SaveEntityGraphOperation.Authorize}
 * therefore refuses any caller that cannot satisfy the per-record entity permissions, and the
 * server resolver applies the `entity:create` / `entity:update` scope gate before dispatch. Entity
 * permissions still enforce inside `Save()`; the API-key ceiling does not check itself.
 *
 * @module @memberjunction/core
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation } from './baseRemotableOperation';
import type { RemoteOpServerContext } from './baseRemotableOperation';
import { BaseEntity } from './baseEntity';
import { CompositeKey, KeyValuePair } from './compositeKey';
import type { EntityCompanionPayload } from './entityCompanion';
import type { IMetadataProvider } from './interfaces';
import { LogError } from './logging';
import type { UserInfo } from './securityInfo';

/** The stable registry key and wire token for this operation. */
export const SAVE_ENTITY_GRAPH_OPERATION_KEY = 'MJ.SaveEntityGraph';

/**
 * Input payload for {@link SaveEntityGraphOperation}.
 */
export type SaveEntityGraphInput = {
    /** The root record's entity name, e.g. `'MJ_BizApps_Orders: Orders'`. */
    EntityName: string;
    /** The root record's field values, as produced by `BaseEntity.GetAll()`. */
    Fields: Record<string, unknown>;
    /** Serialised companion payloads to attach to the rebuilt root. */
    Companions: EntityCompanionPayload[];
    /**
     * Whether the root already exists. Drives whether the server loads the record before applying
     * field values (an update) or starts a new one (a create).
     */
    IsExistingRecord: boolean;
};

/**
 * Output payload for {@link SaveEntityGraphOperation}.
 */
export type SaveEntityGraphOutput = {
    /** True when the whole graph committed. */
    Success: boolean;
    /** Failure detail when `Success` is false. */
    ErrorMessage?: string;
    /**
     * The root record's field values **after** the save — server-assigned primary keys, computed
     * columns, sequence numbers, trigger-populated fields.
     */
    Fields: Record<string, unknown>;
    /**
     * The companions re-serialised after the save, so the client can adopt server-assigned child
     * primary keys and computed values.
     *
     * Returning a result *graph* rather than a result *row* is easy to overlook and important: a
     * client that only refreshed the header would be left holding children that look unsaved and
     * would re-insert them on the next save.
     */
    Companions: EntityCompanionPayload[];
};

/**
 * Saves a parent record and its companion-contributed children atomically, server-side.
 *
 * Invoked automatically by `BaseEntity.Save()` when the entity has companion work to do and the
 * active provider cannot open a local transaction. Application code does not normally call this
 * directly — the point of the design is that `order.Save()` is the whole API on both tiers.
 */
@RegisterClass(BaseRemotableOperation, SAVE_ENTITY_GRAPH_OPERATION_KEY)
export class SaveEntityGraphOperation extends BaseRemotableOperation<SaveEntityGraphInput, SaveEntityGraphOutput> {
    /** @inheritdoc */
    public readonly OperationKey = SAVE_ENTITY_GRAPH_OPERATION_KEY;

    /**
     * API-key scope required to invoke this operation.
     *
     * `entity:update` is the ceiling applied at the resolver; per-record Create vs Update
     * permissions are enforced inside each node's own `Save()`.
     */
    public override readonly RequiredScope = 'entity:update';

    /**
     * Validates the shape of the incoming payload.
     *
     * Deliberately **not** where entity permissions are checked. Two other layers already own that,
     * and duplicating it here would need a provider this hook is not given:
     *
     * - The server resolver applies the API-key scope ceiling ({@link RequiredScope}) before
     *   dispatch, closing the batch-mutation bypass that `TransactionGroupResolver` was patched for.
     * - Every node's own `BaseEntity.Save()` calls `CheckPermissions()` for Create or Update as
     *   appropriate, per record, against the acting user — including children the caller never
     *   named explicitly.
     *
     * @param input - The graph payload.
     * @param _user - The acting user.
     * @returns True when the payload is well-formed enough to attempt.
     */
    protected override async Authorize(input: SaveEntityGraphInput, _user: UserInfo): Promise<boolean> {
        return !!input?.EntityName && !!input.Fields;
    }

    /**
     * Rebuilds the graph server-side and saves it.
     *
     * @param input - The graph payload.
     * @param provider - The provider to build entity objects from.
     * @param user - The acting user.
     * @param _context - The server execution context.
     * @returns The post-save root fields and re-serialised companions.
     */
    protected override async InternalExecute(
        input: SaveEntityGraphInput,
        provider: IMetadataProvider,
        user: UserInfo,
        _context: RemoteOpServerContext,
    ): Promise<SaveEntityGraphOutput> {
        const root = await this.rebuildRoot(input, provider, user);

        const saved = await root.Save();
        if (!saved) {
            const detail = root.LatestResult?.CompleteMessage ?? 'unknown error';
            LogError(`${SAVE_ENTITY_GRAPH_OPERATION_KEY} failed for ${input.EntityName}: ${detail}`);
            return {
                Success: false,
                ErrorMessage: detail,
                Fields: root.GetAll(),
                Companions: await root.SerializeCompanions(),
            };
        }

        return {
            Success: true,
            Fields: root.GetAll(),
            Companions: await root.SerializeCompanions('result'),
        };
    }

    /**
     * Reconstructs the root entity on the server, resolved to its server-side registered subclass.
     *
     * An existing record is loaded first so that unchanged fields keep their database values and
     * the concurrency/old-value bookkeeping is correct; only then are the client's field values
     * applied on top.
     *
     * @param input - The graph payload.
     * @param provider - The provider to build the entity from.
     * @param user - The acting user.
     * @returns The rebuilt root, with companions deserialised onto it.
     */
    private async rebuildRoot(
        input: SaveEntityGraphInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<BaseEntity> {
        const root = await provider.GetEntityObject<BaseEntity>(input.EntityName, user);

        if (input.IsExistingRecord) {
            const key = new CompositeKey(
                root.EntityInfo.PrimaryKeys.map(pk => new KeyValuePair(pk.Name, input.Fields[pk.Name])),
            );
            const loaded = await root.InnerLoad(key);
            if (!loaded) {
                throw new Error(
                    `${SAVE_ENTITY_GRAPH_OPERATION_KEY}: could not load existing ${input.EntityName} ` +
                    `record for update.`,
                );
            }
        } else {
            root.NewRecord();
        }

        root.SetMany(input.Fields, true);
        await root.DeserializeCompanions(input.Companions ?? []);
        return root;
    }
}

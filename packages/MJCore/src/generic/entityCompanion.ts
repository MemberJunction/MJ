/**
 * @fileoverview Entity Companions — named, serialisable side-channels attached to a `BaseEntity`.
 *
 * ## What a companion is
 *
 * A companion is a piece of state that belongs to a record but is **not one of its fields**, and
 * that needs to travel with the record across the client/server boundary, participate in its
 * validation, and contribute work to its save.
 *
 * The canonical example is a child collection — an order's lines, a journal entry's lines, a
 * payment's allocations — but the abstraction is deliberately not about children. It is about
 * "extra state that rides with the record", because MemberJunction has grown that concept ad hoc
 * three times already:
 *
 * - `OldValues___` on the generated GraphQL save input (concurrency check payload)
 * - `RestoreContext___` on the same input (restore lineage for the RecordChange row)
 * - `EntityObjectJSON` in the TransactionGroup wire format (a whole record as opaque JSON)
 *
 * Each solved its own problem with its own bespoke slot, resolver branch and hand-written
 * serialisation. Companions give the next such need — and the ones already in flight — one
 * mechanism instead of a fourth bespoke field.
 *
 * ## What a companion is not
 *
 * A companion is **not** a way to smuggle arbitrary untyped data through the platform. Every
 * companion has a stable {@link EntityCompanion.Name}, a typed wire shape, and explicit control
 * over what it contributes to validation and save. Data with no owner and no contract belongs in a
 * field, not here.
 *
 * ## Lifecycle
 *
 * ```text
 * declare  →  subclass constructor calls RegisterCompanion() (usually via DeclareRelatedRecords())
 * load     →  BaseEntity.Load()/LoadFromData() gives eager companions a chance to populate
 * mutate   →  application code works with the typed companion API
 * validate →  BaseEntity.Validate()/ValidateAsync() fans out to every companion
 * save     →  companions contribute nodes to the EntitySavePlan; the graph executes atomically
 * transport→  Serialize() on the way out, Deserialize() on the way in
 * ```
 *
 * @module @memberjunction/core
 */

import { BaseEntity } from './baseEntity';
import { ValidationResult } from './entityInfo';
import type { EntitySavePlan } from './entitySavePlan';

/**
 * The serialised form of a single companion as it crosses the wire.
 *
 * Deliberately minimal: a stable name plus an opaque JSON payload. Keeping the payload opaque is
 * what lets a new companion type ship without touching the transport, the resolvers, or CodeGen.
 */
export type EntityCompanionPayload = {
    /** The companion's stable {@link EntityCompanion.Name}. */
    Name: string;
    /** The companion's own serialised state, JSON-safe. */
    Data: unknown;
};

/**
 * The property name under which companion payloads are carried inside the plain object produced by
 * `BaseEntity.GetDataObject()` and consumed by `BaseEntity.LoadFromData()`.
 *
 * The trailing triple underscore follows the convention already set by `OldValues___` and
 * `RestoreContext___`: it marks a reserved, non-field slot and makes accidental collision with a
 * real column name effectively impossible.
 */
export const COMPANION_PAYLOAD_KEY = 'Companions___';

/**
 * Base class for all entity companions.
 *
 * Subclass this only when you need a genuinely new *kind* of companion. For the common case of a
 * parent/child collection, use `RelatedRecordCollection<T>` via `BaseEntity.DeclareRelatedRecords()` rather than
 * writing a companion by hand.
 *
 * @typeParam TWire - The JSON-safe shape this companion serialises to and from.
 *
 * @example Declaring a custom companion on a shared (client + server) entity subclass
 * ```typescript
 * class ApprovalTrailCompanion extends EntityCompanion<ApprovalWire> {
 *     public readonly Name = 'ApprovalTrail';
 *
 *     public async Serialize(): Promise<ApprovalWire | null> {
 *         return this.entries.length ? { Entries: this.entries } : null;
 *     }
 *
 *     public async Deserialize(data: ApprovalWire): Promise<void> {
 *         this.entries = data.Entries ?? [];
 *     }
 * }
 * ```
 */
export abstract class EntityCompanion<TWire = unknown> {
    /**
     * The entity this companion is attached to. Set by {@link BaseEntity.RegisterCompanion}.
     */
    public readonly Owner: BaseEntity;

    /**
     * @param owner - The entity this companion belongs to.
     */
    constructor(owner: BaseEntity) {
        this.Owner = owner;
    }

    /**
     * Stable identifier for this companion, unique within its owning entity.
     *
     * This is the wire key: it appears in serialised payloads and is how the receiving tier finds
     * the companion to deserialise into. **Treat it as a published contract** — renaming it breaks
     * in-flight payloads and any persisted snapshot that captured them.
     */
    public abstract readonly Name: string;

    /**
     * Produces this companion's JSON-safe state for transport, or `null` when it has nothing to
     * send.
     *
     * Returning `null` keeps the companion out of the payload entirely, which matters: a save that
     * touches only header fields should not ship an empty children array and pay for it on every
     * request.
     *
     * @returns The wire payload, or `null` to omit this companion.
     */
    public abstract Serialize(): Promise<TWire | null>;

    /**
     * Restores this companion's state from a wire payload produced by {@link Serialize} on the
     * other tier.
     *
     * Implementations must be tolerant of payloads written by an older version of themselves —
     * a companion is a wire contract, and rolling deploys mean both versions run at once.
     *
     * @param data - The payload previously produced by {@link Serialize}.
     */
    public abstract Deserialize(data: TWire): Promise<void>;

    /**
     * Whether this companion holds unsaved changes.
     *
     * Rolled up into `BaseEntity.Dirty`, which is what makes a save actually happen when only the
     * companion changed. Before companions existed, a clean parent with three new children returned
     * early from `Save()` and silently persisted nothing.
     *
     * @returns True when saving would produce work.
     */
    public get Dirty(): boolean {
        return false;
    }

    /**
     * Synchronous, in-memory validation contributed by this companion.
     *
     * Runs as part of the owner's `Validate()`, **before any write**, over the companion's complete
     * state — including pending removals. That ordering is what lets cross-child invariants such as
     * "debits must equal credits" be enforced correctly rather than after half the graph has landed.
     *
     * Push errors onto `result.Errors` and set `result.Success = false` to fail the save.
     *
     * @param _result - The accumulating validation result to contribute to.
     */
    public Validate(_result: ValidationResult): void {
        /* no-op by default */
    }

    /**
     * Asynchronous validation contributed by this companion — anything that needs a round trip.
     *
     * @remarks
     * Unlike an entity's own `ValidateAsync()`, this is **not** governed by
     * `BaseEntity.DefaultSkipAsyncValidation`. That flag exists so an entity can opt out of its own
     * expensive async rules; applying it to companions silently skipped cross-child invariants,
     * which is how `OrderEntityServer.ValidateAsync` came to be dead code on every save. Companion
     * validation runs whenever the companion is dirty.
     *
     * @param _result - The accumulating validation result to contribute to.
     */
    public async ValidateAsync(_result: ValidationResult): Promise<void> {
        /* no-op by default */
    }

    /**
     * Contributes this companion's work to the owner's save plan.
     *
     * Called after the owner's own node has been added, so implementations may assume the parent
     * node exists and order their nodes relative to it. Add nothing when there is no work — an
     * empty contribution keeps the save on the fast single-row path.
     *
     * @param _plan - The plan being assembled for this unit of work.
     */
    public ContributeSaveWork(_plan: EntitySavePlan): void {
        /* no-op by default */
    }

    /**
     * Contributes this companion's work to the owner's delete plan.
     *
     * Called before the owner's own node, because children must generally be removed before the
     * parent row they point at. Implementations that rely on database-level cascade delete should
     * contribute nothing.
     *
     * @param _plan - The plan being assembled for this unit of work.
     */
    public ContributeDeleteWork(_plan: EntitySavePlan): void {
        /* no-op by default */
    }

    /**
     * Populates this companion from the database, when it is configured to load eagerly.
     *
     * Called by `BaseEntity.Load()` after the record's own fields are populated. **Never** called
     * from `LoadFromData()` — that is the row-materialisation path for
     * `RunView(ResultType:'entity_object')`, so loading children there turns one view into an N+1
     * storm. Set-oriented eager loading is handled by `RunView`'s batched child loading instead.
     */
    public async LoadEager(): Promise<void> {
        /* no-op by default */
    }

    /**
     * Resets the companion to its post-save state — clearing pending removals, rebasing dirty
     * tracking, and so on. Called after the graph commits successfully.
     */
    public AcceptChanges(): void {
        /* no-op by default */
    }
}

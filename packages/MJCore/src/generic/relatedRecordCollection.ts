/**
 * @fileoverview `RelatedRecordCollection<T>` — a typed, transportable collection of child records that
 * loads, validates and persists as one unit with its parent.
 *
 * ## The problem it replaces
 *
 * Three MemberJunction applications independently hand-rolled this same pattern, and each got a
 * different subset of it right:
 *
 * | | Order | PaymentHeader | JournalEntry |
 * |---|---|---|---|
 * | Typed | ✓ | ✗ (`BaseEntity[]`) | ✓ |
 * | Loads children | ✗ | ✗ | ✓ |
 * | Tracks removals | ✗ | ✗ | ✓ |
 * | Add/remove API | raw setter | raw setter | ✓ |
 * | Re-sequences | ✗ | ✗ | ✓ |
 *
 * All three were server-only classes, because each cast the provider to `DatabaseProviderBase` to
 * reach `BeginTransaction()`. `RelatedRecordCollection` is tier-neutral: it never touches a provider
 * transaction itself, it only contributes nodes to an {@link EntitySavePlan}, and `BaseEntity`
 * decides where that plan runs.
 *
 * @module @memberjunction/core
 */

import { UUIDsEqual } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';
import { BaseEngineRegistry } from './baseEngineRegistry';
import { IsVerboseLoggingEnabled, LogStatus } from './logging';
import { CompositeKey, KeyValuePair } from './compositeKey';
import { EntityCompanion, EntityCompanionDeserializeMode } from './entityCompanion';
import type { EntitySavePlan } from './entitySavePlan';
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from './entityInfo';
import type { IMetadataProvider, IRunViewProvider } from './interfaces';
import { LogError } from './logging';

/**
 * When a child collection populates itself from the database.
 *
 * - `'explicit'` — **the default.** Nothing loads until the caller awaits `Load()`. Chosen as the
 *   default because the alternative is a performance trap: an eager collection on a widely-listed
 *   entity turns every grid into an N+1 storm.
 * - `'immediate'` — populated automatically by `BaseEntity.Load()`. **Never** by `LoadFromData()`,
 *   which is the per-row materialisation path for `RunView(ResultType:'entity_object')`. That
 *   exclusion is deliberate and is the structural fix for a live N+1 in production accounting code,
 *   where a `LoadFromData` override issued one child query per row of every view.
 * - `'lazy'` — populated on first read of {@link RelatedRecordCollection.Items}. Requires
 *   {@link RelatedRecordSource} `'cache'`: a property getter cannot await, so a lazy *database*
 *   load could only ever silently fail to fill, and CodeGen refuses that combination. A cache
 *   lookup is synchronous, so lazy works there — reproducing exactly the hand-written memoised
 *   getters this mechanism replaces.
 * - `'never'` — the collection is a write-only staging buffer; `Load()` is a no-op. Matches how
 *   order lines are actually used: built up in memory and pushed down, never read back through the
 *   collection.
 */
export type RelatedRecordLoadMode = 'explicit' | 'immediate' | 'lazy' | 'never';

/**
 * Where a collection's records come from.
 *
 * - `'database'` — a `RunView` filtered by the join field. Always fresh, costs a query. Correct for
 *   transactional data where staleness is unacceptable.
 * - `'cache'` — taken from whichever loaded `BaseEngine` already holds the entity, discovered
 *   generically via `BaseEngineRegistry.FindCachedEntity()`. Costs **zero queries**, and falls back
 *   to `'database'` when no loaded engine offers it, so a miss degrades rather than fails.
 *
 * Deliberately not `'query'`: in MemberJunction a *Query* is a stored, named artifact
 * (`MJ: Queries`, `RunQuery`), so that word already means something else.
 */
export type RelatedRecordSource = 'database' | 'cache';

/**
 * What happens to a child that is removed from the collection.
 *
 * - `'delete'` — the row is deleted when the parent saves. Correct for true composition, where a
 *   child has no meaning without its parent (order lines, journal entry lines).
 * - `'orphan'` — the row is left in place, foreign key untouched. Correct for aggregation, where
 *   the child outlives the relationship.
 * - `'refuse'` — removal throws. For collections where detaching a child is always a bug.
 */
export type RelatedRecordRemovalMode = 'delete' | 'orphan' | 'refuse';

/**
 * Automatic sequence numbering for a child collection.
 */
export type RelatedRecordSequence = {
    /** The child field holding the sequence number (e.g. `'LineNumber'`). */
    Field: string;
    /** The value assigned to the first child. Defaults to 1. */
    From?: number;
};

/**
 * Declaration for a {@link RelatedRecordCollection}, supplied to `BaseEntity.DeclareRelatedRecords()`.
 *
 * @remarks
 * **This shape deliberately mirrors `EntityRelationship` metadata**, so a declaration can be
 * hand-written today and code-generated tomorrow from exactly the same information:
 *
 * | Option | Metadata source |
 * |---|---|
 * | {@link RelatedEntity} | `EntityRelationship.RelatedEntity` (column) |
 * | {@link RelatedEntityJoinField} | `EntityRelationship.RelatedEntityJoinField` (column) |
 * | everything else | `EntityRelationship.RelatedRecordCollection` (JSONType, `IRelatedRecordCollectionConfig`) |
 *
 * The two column-backed options are **not** repeated inside the JSON blob — one source of truth
 * each. Keep this type and `metadata/entities/JSONType-interfaces/IRelatedRecordCollectionConfig.ts`
 * in step when adding an option.
 */
export type RelatedRecordCollectionOptions = {
    /**
     * The companion's stable name, and the property name callers will use. Also the wire key —
     * see {@link EntityCompanion.Name}.
     */
    Name: string;
    /**
     * The related entity's name in MJ metadata, e.g. `'MJ_BizApps_Orders: Order Lines'`.
     * Mirrors `EntityRelationship.RelatedEntity`.
     */
    RelatedEntity: string;
    /**
     * The related entity's field holding the foreign key back to this record, e.g.
     * `'OrderHeaderID'`. Mirrors `EntityRelationship.RelatedEntityJoinField`.
     */
    RelatedEntityJoinField: string;
    /** `OrderBy` clause used when loading. Strongly recommended for sequenced collections. */
    OrderBy?: string;
    /** When the collection populates itself. Defaults to `'explicit'`. */
    Load?: RelatedRecordLoadMode;
    /** Where records come from. Defaults to `'database'`. */
    Source?: RelatedRecordSource;
    /**
     * Whether the collection refuses mutation. Defaults to `false` — but to `true` when
     * {@link Source} is `'cache'`, because a cache-sourced collection hands out the engine's own
     * entity instances.
     */
    ReadOnly?: boolean;
    /** What removal means. Defaults to `'delete'`. */
    OnRemove?: RelatedRecordRemovalMode;
    /** Automatic sequence numbering, if the child has a sequence field. */
    Sequence?: RelatedRecordSequence;
    /**
     * Whether the collection clears itself after a successful save.
     *
     * `true` matches the order-line staging pattern, where the collection is a buffer for pending
     * inserts rather than a live view of persisted rows. Defaults to `false`, which keeps the
     * saved children in memory with fresh primary keys — the behaviour most callers expect.
     */
    ClearAfterSave?: boolean;
};

/**
 * One retained child on the wire.
 */
export type RelatedRecordCollectionWireItem = {
    /** The child's field values, as produced by `GetAll()`. */
    Fields: Record<string, unknown>;
    /**
     * Whether this child is a pending insert rather than an edit of an existing row.
     *
     * Carried **explicitly** rather than inferred from primary-key presence, because `NewRecord()`
     * generates a UUID for `uniqueidentifier` keys — so a brand-new child already has a populated
     * primary key and is indistinguishable from an existing one by inspection. Inferring would make
     * the server try to load a row that does not exist for every client-created child.
     */
    IsNew: boolean;
};

/**
 * The wire shape of a serialised child collection.
 */
export type RelatedRecordCollectionWire = {
    /** Each retained child. */
    Items: RelatedRecordCollectionWireItem[];
    /** Primary-key field maps for children removed since load, when removal means deletion. */
    Removed: Record<string, unknown>[];
};

/**
 * A typed collection of child records that travels, validates and persists with its parent.
 *
 * Obtain one via `BaseEntity.DeclareRelatedRecords()` in a subclass constructor or field initialiser —
 * do not construct it directly, or it will not be registered as a companion and will be silently
 * ignored by load, validation and save.
 *
 * @typeParam T - The child entity type.
 *
 * @example Declaring a collection on a shared (client + server) entity subclass
 * ```typescript
 * @RegisterClass(BaseEntity, 'MJ_BizApps_Accounting: Journal Entries')
 * export class JournalEntryEntity extends mjBizAppsAccountingJournalEntryEntity {
 *     public readonly Lines = this.DeclareRelatedRecords<JournalEntryLineEntity>({
 *         Name: 'Lines',
 *         RelatedEntity: 'MJ_BizApps_Accounting: Journal Entry Lines',
 *         RelatedEntityJoinField: 'JournalEntryID',
 *         OrderBy: 'LineNumber ASC',
 *         Load: 'explicit',
 *         OnRemove: 'delete',
 *         Sequence: { Field: 'LineNumber', From: 1 },
 *     });
 *
 *     public override Validate(): ValidationResult {
 *         const result = super.Validate();          // fans out to companions
 *         assertBalanced(this.Lines.Items, result); // runs on BOTH tiers
 *         return result;
 *     }
 * }
 * ```
 */
export class RelatedRecordCollection<T extends BaseEntity = BaseEntity> extends EntityCompanion<RelatedRecordCollectionWire> {
    private items: T[] = [];
    private removed: T[] = [];
    private loaded = false;
    private readonly options: RelatedRecordCollectionOptions;

    /**
     * @param owner - The parent entity.
     * @param options - The collection declaration.
     */
    constructor(owner: BaseEntity, options: RelatedRecordCollectionOptions) {
        super(owner);
        this.options = options;
    }

    /** @inheritdoc */
    public get Name(): string {
        return this.options.Name;
    }

    /** The child entity's name in MJ metadata. */
    public get RelatedEntityName(): string {
        return this.options.RelatedEntity;
    }

    /** The child field holding the foreign key back to the parent. */
    public get RelatedEntityJoinField(): string {
        return this.options.RelatedEntityJoinField;
    }

    /** The `OrderBy` clause applied when loading, if declared. */
    public get OrderByClause(): string | undefined {
        return this.options.OrderBy;
    }

    /** When this collection populates itself. */
    public get LoadMode(): RelatedRecordLoadMode {
        return this.options.Load ?? 'explicit';
    }

    /** What removal means for this collection. */
    public get RemovalMode(): RelatedRecordRemovalMode {
        return this.options.OnRemove ?? 'delete';
    }

    /** Where this collection's records come from. Defaults to `'database'`. */
    public get Source(): RelatedRecordSource {
        return this.options.Source ?? 'database';
    }

    /**
     * Whether this collection refuses mutation.
     *
     * Defaults to `false`, **except for a cache-sourced collection**, which defaults to `true`
     * because its records are the engine's own shared instances. An explicit `ReadOnly: false`
     * still wins — and switches the cache path to copying, so the engine's objects stay untouched.
     */
    public get IsReadOnly(): boolean {
        return this.options.ReadOnly ?? this.Source === 'cache';
    }

    /**
     * The retained children, in order.
     *
     * Read-only by design — mutate through {@link Add}, {@link Create} and {@link Remove} so that
     * removals are tracked, sequence numbers stay correct, and the parent's `Dirty` flag reflects
     * reality. Handing out a mutable array would make all three impossible to guarantee.
     */
    public get Items(): readonly T[] {
        // `'lazy'` populates on first read. This is a side-effecting getter, deliberately: it is
        // exactly what the hand-written memoised getters it replaces did, and it is only reachable
        // for cache-sourced collections, where filling is synchronous. A database-sourced lazy
        // collection cannot exist — CodeGen refuses the combination — because a getter cannot await.
        if (!this.loaded && this.LoadMode === 'lazy') {
            this.populateLazyOrThrow();
        }
        this.refreshCacheViewIfStale();
        return this.items;
    }

    /**
     * Children removed since the last load or save, awaiting deletion on the next save.
     *
     * Always empty when {@link RemovalMode} is `'orphan'`.
     */
    public get Removed(): readonly T[] {
        return this.removed;
    }

    /**
     * Number of retained related records.
     *
     * Deliberately delegates to {@link Items} rather than reading the backing array: for a `'lazy'`
     * collection `Items` is what triggers population, so reading the raw array here would report 0
     * for a collection that has simply not been touched yet — and `Count === 0` while
     * `Items.length === 2` is the kind of inconsistency nobody debugs quickly. Same reason it picks
     * up a live cache view's refresh.
     */
    public get Count(): number {
        return this.Items.length;
    }

    /** Whether this collection has been populated from the database. */
    public get IsLoaded(): boolean {
        return this.loaded;
    }

    /**
     * True when saving would produce work: any retained child is dirty or unsaved, or any removal
     * is pending.
     */
    public override get Dirty(): boolean {
        // A read-only collection never reports dirty, and that is load-bearing rather than tidy:
        // a cache-sourced collection holds the ENGINE's entity instances, so a record dirtied by
        // some unrelated code path would otherwise make every parent holding it claim it needs
        // saving. Read-only collections contribute no save work either — see ContributeSaveWork.
        if (this.IsReadOnly) {
            return false;
        }
        if (this.removed.length > 0) {
            return true;
        }
        return this.items.some(i => i.Dirty || !i.IsSaved);
    }

    /**
     * Appends an existing child entity to the collection.
     *
     * The foreign key is *not* set here — it is stamped at save time, because when the parent is
     * itself new its primary key does not exist yet. See {@link ContributeSaveWork}.
     *
     * @param item - The child to append.
     * @returns The same child, for chaining.
     */
    public Add(item: T): T {
        this.assertMutable('Add');
        if (!item) {
            throw new Error(`RelatedRecordCollection '${this.Name}': cannot add a null related record.`);
        }
        this.items.push(item);
        this.applySequence();
        this.stampParentKey();
        return item;
    }

    /**
     * Creates a new, empty child entity, appends it, and returns it.
     *
     * Uses the owner's provider so the child resolves to the right registered subclass on whichever
     * tier this runs — the server subclass on the server, the shared subclass in the browser.
     *
     * @returns The newly created child.
     */
    public async Create(): Promise<T> {
        this.assertMutable('Create');
        const provider = this.Owner.ProviderToUse as unknown as IMetadataProvider;
        if (!provider) {
            throw new Error(`RelatedRecordCollection '${this.Name}': owner has no provider; cannot create a child.`);
        }
        const child = await provider.GetEntityObject<T>(this.RelatedEntityName, this.Owner.ContextCurrentUser);
        child.NewRecord();
        return this.Add(child);
    }

    /**
     * Removes a child by instance or index.
     *
     * A child that was already persisted is queued for deletion when {@link RemovalMode} is
     * `'delete'`; an unsaved child is simply dropped, since there is nothing to delete.
     *
     * @param itemOrIndex - The child instance, or its index in {@link Items}.
     * @throws When {@link RemovalMode} is `'refuse'`.
     */
    public Remove(itemOrIndex: T | number): void {
        this.assertMutable('Remove');
        if (this.RemovalMode === 'refuse') {
            throw new Error(
                `RelatedRecordCollection '${this.Name}' is declared OnRemove:'refuse' — children cannot be detached.`,
            );
        }

        const index = typeof itemOrIndex === 'number' ? itemOrIndex : this.items.indexOf(itemOrIndex);
        if (index < 0 || index >= this.items.length) {
            return; // not present — removing something absent is a no-op, not an error
        }

        const [child] = this.items.splice(index, 1);
        // Only a persisted child needs a delete. An unsaved one never reached the database, so
        // queueing it would produce a delete against a primary key that does not exist.
        if (child.IsSaved && this.RemovalMode === 'delete') {
            this.removed.push(child);
        }
        this.applySequence();
    }

    /** Removes every child. */
    public Clear(): void {
        this.assertMutable('Clear');
        for (let i = this.items.length - 1; i >= 0; i--) {
            this.Remove(i);
        }
    }

    /**
     * Populates the collection from the database.
     *
     * A no-op when the parent is unsaved (there is nothing to be a child of) or when
     * {@link LoadMode} is `'never'`.
     *
     * @remarks
     * A failed load **throws** rather than yielding an empty collection. Silently returning no
     * children makes a populated parent look empty, and anything derived from that — a reversal, a
     * total, a validation decision — is then wrong in a way nothing downstream can detect. Only
     * saves use the boolean-return convention.
     *
     * @param force - Reload even if already loaded.
     */
    public async Load(force = false): Promise<void> {
        if (this.LoadMode === 'never') {
            return;
        }
        if (!this.Owner.IsSaved) {
            return;
        }
        if (this.loaded && !force) {
            return;
        }

        // Cache first when declared. A hit costs zero queries; a miss falls straight through to the
        // database load below, so a collection whose donor engine is not loaded yet still works.
        if (this.Source === 'cache') {
            const cached = this.findCachedRecords();
            if (cached) {
                this.SetLoadedItems(this.IsReadOnly ? cached : await this.copyRecords(cached));
                return;
            }
        }

        const provider = this.Owner.ProviderToUse as unknown as IRunViewProvider;
        if (!provider) {
            throw new Error(`RelatedRecordCollection '${this.Name}': owner has no provider; cannot load.`);
        }

        const parentKey = this.Owner.FirstPrimaryKey?.Value;
        const result = await provider.RunView<T>(
            {
                EntityName: this.RelatedEntityName,
                ExtraFilter: `${this.options.RelatedEntityJoinField} = '${String(parentKey).replace(/'/g, "''")}'`,
                OrderBy: this.options.OrderBy,
                ResultType: 'entity_object',
            },
            this.Owner.ContextCurrentUser,
        );

        if (!result.Success) {
            throw new Error(
                `RelatedRecordCollection '${this.Name}': failed to load ${this.RelatedEntityName} for ` +
                `${this.Owner.EntityInfo?.Name} ${String(parentKey)}: ${result.ErrorMessage ?? 'unknown error'}`,
            );
        }

        this.items = result.Results ?? [];
        this.removed = [];
        this.loaded = true;
    }

    /** @inheritdoc */
    public override async LoadEager(): Promise<void> {
        if (this.LoadMode === 'immediate') {
            await this.Load();
        }
    }

    /**
     * Replaces the collection's contents with rows already fetched elsewhere.
     *
     * Used by `RunView`'s batched child loading, which issues one `WHERE fk IN (...)` for an entire
     * result set and distributes the rows — turning what would be N+1 queries into 1 + K.
     *
     * @param items - The children belonging to this parent.
     */
    public SetLoadedItems(items: T[]): void {
        this.items = items ?? [];
        this.removed = [];
        this.loaded = true;
    }

    /**
     * Throws when the collection is read-only. Called by every mutating entry point.
     *
     * @param operation - The attempted operation, named in the error.
     */
    private assertMutable(operation: string): void {
        if (this.IsReadOnly) {
            throw new Error(
                `RelatedRecordCollection '${this.Name}' is read-only; ${operation} is not allowed. ` +
                    (this.Source === 'cache'
                        ? `It is sourced from a BaseEngine cache, so its records are shared instances owned by that ` +
                          `engine. Declare ReadOnly: false to get copies you can safely modify, or Source: 'database'.`
                        : `Declare ReadOnly: false to allow mutation.`),
            );
        }
    }

    /**
     * Attempts to populate this collection from a `BaseEngine` cache without touching the database.
     *
     * Used by `BaseEntity.LoadRelatedRecords()` to resolve the free collections before batching
     * whatever is left into a database round trip.
     *
     * @returns True when the collection was populated from a cache; false when the caller must load
     *          it from the database.
     */
    public async TryLoadFromCache(): Promise<boolean> {
        if (this.Source !== 'cache' || (this.loaded && this.LoadMode !== 'never')) {
            return this.Source === 'cache' && this.loaded;
        }
        const cached = this.findCachedRecords();
        if (!cached) {
            return false;
        }
        this.SetLoadedItems(this.IsReadOnly ? cached : await this.copyRecords(cached));
        return true;
    }

    /**
     * Fills the collection from whichever loaded engine already caches the related entity.
     *
     * Synchronous by nature — a registry walk plus a `filter` — which is what makes `'lazy'`
     * possible at all. Returns `false` when no loaded engine offers the entity, leaving the
     * collection unloaded so `Load()` can fall back to a query.
     *
     * @returns True when the collection was populated from a cache.
     */
    /**
     * Re-reads a live cache view when the donor engine has moved on.
     *
     * Only applies to a read-only cache-sourced collection — the case where the records belong to
     * the engine rather than to this collection. A writable cache collection holds COPIES the caller
     * owns, so silently replacing them would discard their edits; and a database-sourced collection
     * is a point-in-time load by definition, which is what callers expect of one.
     *
     * The check is two reference comparisons in the common case, so this stays cheap enough to run
     * on every read.
     */
    private refreshCacheViewIfStale(): void {
        if (!this.cacheDonor || this.Source !== 'cache' || !this.IsReadOnly) {
            return;
        }
        const current = this.cacheDonor.engine[this.cacheDonor.propertyName];
        if (!Array.isArray(current)) {
            return;
        }
        if (current === this.cacheDonor.array && current.length === this.cacheDonor.length) {
            return; // unchanged
        }

        // Re-filter from the donor we already hold rather than re-walking the registry. The
        // engine + property name IS the durable handle: reading the property fresh each time
        // survives the engine reassigning it wholesale, which is the case a captured array
        // reference misses. Re-running discovery here would also risk silently binding to a
        // DIFFERENT engine mid-life if two happened to cache the same entity.
        const parentKey = this.Owner.FirstPrimaryKey?.Value;
        if (parentKey === null || parentKey === undefined || parentKey === '') {
            return;
        }
        const joinField = this.RelatedEntityJoinField;
        const records = current as T[];
        const mine = records.filter(r => UUIDsEqual(String(r.Get(joinField) ?? ''), String(parentKey)));
        this.cacheDonor.array = records as unknown[];
        this.cacheDonor.length = records.length;
        this.SetLoadedItems(this.sortLikeOrderBy(mine));
    }

    /**
     * Populates a `'lazy'` collection from cache, or throws explaining why it could not.
     *
     * **A lazy declaration is an assertion.** Writing `Load: 'lazy'` says "an engine caches this
     * entity"; there is no async fallback available from a getter, so if the assertion is wrong the
     * only alternatives are a hard error or a silently empty array. Silence is how
     * `MJAIAgentEntityExtended.Actions` returned `[]` to three call sites indefinitely without
     * anyone noticing — exactly the failure this mechanism exists to end.
     *
     * A donor holding **zero rows** is a perfectly good answer and does not throw; the collection is
     * simply empty. Only the absence of a donor is an error, and the message distinguishes the two
     * ways that happens, because they need opposite fixes.
     */
    private populateLazyOrThrow(): void {
        if (this.populateFromCache()) {
            return;
        }
        if (!this.Owner.IsSaved) {
            return; // an unsaved parent owns no persisted related records; not an error
        }

        const declaringEngines = BaseEngineRegistry.Instance.FindEnginesDeclaringEntity(this.RelatedEntityName);
        const prefix = `RelatedRecordCollection '${this.Name}' on ${this.Owner.EntityInfo?.Name} is declared Load: 'lazy'`;

        if (declaringEngines.length > 0) {
            // The cache exists — it just has not been populated yet. An ordering problem, and the
            // caller can fix it by configuring the engine before reading the collection.
            throw new Error(
                `${prefix}, but ${declaringEngines.join(' / ')} — which caches '${this.RelatedEntityName}' — ` +
                    `is not loaded yet. Await that engine's Config() before reading '${this.Name}', or declare ` +
                    `Load: 'explicit' and call LoadRelatedRecords() so it can fall back to the database.`,
            );
        }

        // Nothing anywhere caches this entity, so lazy can never work for it. A design error.
        throw new Error(
            `${prefix}, but no registered BaseEngine caches '${this.RelatedEntityName}'. Lazy loading reads ` +
                `exclusively from engine caches. Declare Source: 'database' with Load: 'explicit', or add an ` +
                `entity config for '${this.RelatedEntityName}' to an engine.`,
        );
    }

    /**
     * The engine and property this collection last read from, plus enough about that array to tell
     * cheaply whether it has moved on.
     *
     * A cache-sourced read-only collection is a **live view**, not a snapshot. `.claude/rules/data-access.md`
     * spells out why: an engine responds to entity events either by mutating its array in place or —
     * for ordered configs — by REASSIGNING the property wholesale, so a captured reference silently
     * goes stale. The documented remedy is to resolve per-access from the engine plus the config's
     * property name, which is what this records.
     *
     * Revalidation is deliberately cheap: identity catches a reassignment, length catches an
     * in-place push or splice, and field-level edits need no detection at all because a read-only
     * collection hands out the engine's own instances — the caller is already looking at them.
     */
    private cacheDonor: { engine: Record<string, unknown>; propertyName: string; array: unknown[]; length: number } | null = null;

    private populateFromCache(): boolean {
        // Sharing is the only synchronous option: copying needs `GetEntityObject`, which is async.
        // So the sync path is read-only-only, and a writable cache-backed collection must go through
        // the async `Load()`. CodeGen enforces the matching rule that `lazy` implies read-only.
        if (!this.IsReadOnly) {
            return false;
        }
        const cached = this.findCachedRecords();
        if (!cached) {
            return false;
        }
        this.SetLoadedItems(cached);
        return true;
    }

    /**
     * Finds this record's related rows in whichever loaded engine already caches the related entity.
     *
     * @returns The matching records in declared order, or `null` when no loaded engine offers the
     *          entity — in which case the caller falls back to a database load.
     */
    private findCachedRecords(): T[] | null {
        const parentKey = this.Owner.FirstPrimaryKey?.Value;
        if (parentKey === null || parentKey === undefined || parentKey === '') {
            return null; // an unsaved parent owns no persisted related records
        }

        // `unfilteredOnly` matters: a donor whose config carries a Filter holds a SUBSET, which
        // would silently give us an incomplete collection. `simple` donors are excluded because
        // these records must be real BaseEntity instances.
        const matches = BaseEngineRegistry.Instance.FindCachedEntity<T>(this.RelatedEntityName, { unfilteredOnly: true });
        const donor = matches.find(m => (m.config.ResultType ?? 'entity_object') !== 'simple');
        if (!donor) {
            if (IsVerboseLoggingEnabled()) {
                LogStatus(
                    `RelatedRecordCollection '${this.Name}': no loaded engine caches '${this.RelatedEntityName}' — ` +
                        `falling back to a database load.`,
                );
            }
            return null;
        }

        // Remember where this came from so the collection can stay live rather than snapshotting.
        const propertyName = donor.config.PropertyName;
        if (propertyName) {
            this.cacheDonor = {
                engine: donor.engine as Record<string, unknown>,
                propertyName,
                array: donor.records as unknown[],
                length: donor.records.length,
            };
        }

        const joinField = this.RelatedEntityJoinField;
        const mine = donor.records.filter(r => UUIDsEqual(String(r.Get(joinField) ?? ''), String(parentKey)));
        return this.sortLikeOrderBy(mine);
    }

    /**
     * Applies the declared `OrderBy` to cache-sourced records.
     *
     * Only single-field `FIELD [ASC|DESC]` clauses are honoured — the common case, and all that can
     * be done in memory without reimplementing SQL. Anything more complex is left in donor order
     * rather than half-applied, because a silently mis-ordered sequenced collection would renumber
     * itself into that wrong order on the next mutation.
     *
     * @param records - The filtered records.
     * @returns A new, ordered array.
     */
    private sortLikeOrderBy(records: T[]): T[] {
        const terms = this.parseOrderBy();
        if (terms.length === 0) {
            return [...records];
        }
        return [...records].sort((a, b) => {
            // Compare term by term, stopping at the first that discriminates — the ordinary
            // multi-key sort, so 'Priority ASC, Name ASC' means what it says rather than being
            // silently reduced to the first field.
            for (const { field, sign } of terms) {
                const av = a.Get(field);
                const bv = b.Get(field);
                if (av === bv) {
                    continue;
                }
                if (av === null || av === undefined) return -sign;
                if (bv === null || bv === undefined) return sign;
                return (av < bv ? -1 : 1) * sign;
            }
            return 0;
        });
    }

    /**
     * Parses the declared `OrderBy` into comparable terms.
     *
     * Handles `FIELD [ASC|DESC]` lists — `'Priority ASC, Name DESC'`. Anything beyond that (an
     * expression, a function call, a CASE) is refused wholesale rather than partially applied,
     * because a *silently* mis-ordered sequenced collection renumbers itself into that wrong order
     * on the next mutation. This is in-memory ordering for cache-sourced collections only; a
     * database-sourced load passes the clause to SQL untouched.
     *
     * @returns One term per field, or an empty array when the clause cannot be honoured in memory.
     */
    private parseOrderBy(): { field: string; sign: number }[] {
        const clause = this.OrderByClause?.trim();
        if (!clause) {
            return [];
        }
        const terms: { field: string; sign: number }[] = [];
        for (const raw of clause.split(',')) {
            const parts = raw.trim().split(/\s+/).filter(Boolean);
            if (parts.length === 0 || parts.length > 2) {
                return []; // not a plain field list — do not half-apply it
            }
            const [field, direction] = parts;
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
                return []; // an expression rather than a column
            }
            if (direction && !['ASC', 'DESC'].includes(direction.toUpperCase())) {
                return [];
            }
            terms.push({ field, sign: (direction ?? 'ASC').toUpperCase() === 'DESC' ? -1 : 1 });
        }
        return terms;
    }

    /**
     * Copies cached records into fresh entity instances, so a writable collection never hands out —
     * or mutates — the engine's own objects. Saving a copy fires the ordinary `BaseEntity` save
     * event that the engines already subscribe to, so their caches refresh themselves.
     *
     * @param records - The engine's cached records.
     * @returns Detached copies carrying the same field values.
     */
    private async copyRecords(records: T[]): Promise<T[]> {
        const provider = this.Owner.ProviderToUse as unknown as IMetadataProvider;
        const copies: T[] = [];
        for (const source of records) {
            const copy = await provider?.GetEntityObject<T>(this.RelatedEntityName, this.Owner.ContextCurrentUser);
            if (!copy) {
                // Silently sharing here would defeat the entire reason this collection is writable:
                // the caller asked for records it can modify WITHOUT touching the engine's cache,
                // and handing back shared instances would let it corrupt that cache invisibly.
                throw new Error(
                    `RelatedRecordCollection '${this.Name}': cannot materialise copies of ` +
                        `'${this.RelatedEntityName}' because no entity factory is available on the provider. ` +
                        `A writable cache-sourced collection must copy; declare ReadOnly: true to share the ` +
                        `engine's instances instead, or Source: 'database' to load fresh ones.`,
                );
            }
            copy.LoadFromData(source.GetAll(), true);
            copies.push(copy);
        }
        return copies;
    }

    /** @inheritdoc */
    public override Validate(result: ValidationResult): void {
        // Stamp the foreign key BEFORE validating. Most MJ primary keys are UUIDs generated by
        // NewRecord(), so the parent's key exists well before its row does — but the related record
        // has not been told about it yet. Validating first would fail every `NOT NULL` foreign key
        // on a create, reporting "OrderHeaderID cannot be null" for a graph that is perfectly valid
        // and about to be saved correctly.
        this.stampParentKey();
        for (const [index, child] of this.items.entries()) {
            const childResult = child.Validate();
            if (!childResult.Success) {
                result.Success = false;
                result.Errors.push(...this.prefixErrors(childResult.Errors, index));
            }
        }
    }

    /** @inheritdoc */
    public override async ValidateAsync(result: ValidationResult): Promise<void> {
        this.stampParentKey(); // see the note in Validate()
        for (const [index, child] of this.items.entries()) {
            const childResult = await child.ValidateAsync();
            if (!childResult.Success) {
                result.Success = false;
                result.Errors.push(...this.prefixErrors(childResult.Errors, index));
            }
        }
    }

    /**
     * Prefixes child validation errors with the collection and index they came from.
     *
     * Without this a failing order line reports "Quantity is required" with no indication of *which*
     * line, which is close to useless on a twenty-line order.
     *
     * @param errors - The child's raw validation errors.
     * @param index - The child's position in the collection.
     * @returns Re-labelled errors.
     */
    private prefixErrors(errors: ValidationErrorInfo[], index: number): ValidationErrorInfo[] {
        return errors.map(
            e =>
                new ValidationErrorInfo(
                    `${this.Name}[${index}].${e.Source ?? ''}`.replace(/\.$/, ''),
                    e.Message,
                    e.Value,
                    e.Type ?? ValidationErrorType.Failure,
                ),
        );
    }

    /** @inheritdoc */
    public override ContributeSaveWork(plan: EntitySavePlan): void {
        // A read-only collection is a projection, not a unit of work. Contributing nothing is what
        // makes it safe to point one at an engine's shared cache.
        if (this.IsReadOnly) {
            return;
        }
        // Deletions first: a removed child may hold a unique key that a retained one is about to
        // take (a re-sequenced LineNumber, most commonly). Freeing it before the inserts run avoids
        // a spurious constraint violation on what is a perfectly legal edit.
        for (const [index, child] of this.removed.entries()) {
            plan.AddDelete(child, `${this.Name}.Removed[${index}]`);
        }

        for (const [index, child] of this.items.entries()) {
            // Re-stamp at EXECUTION time as well as at add/validate time. For UUID keys the value
            // is already there; for identity/auto-increment keys the parent's key does not exist
            // until its own node has run, and this is the first moment it does.
            plan.AddSave(child, `${this.Name}[${index}]`, () => this.stampParentKey());
        }
    }

    /** @inheritdoc */
    public override ContributeDeleteWork(plan: EntitySavePlan): void {
        if (this.IsReadOnly) {
            return; // a projection never cascades a delete
        }
        if (this.RemovalMode !== 'delete') {
            return; // aggregation, or refusal — the parent's removal does not imply the child's
        }
        // Children before the parent: the foreign key points at the row about to disappear.
        for (const [index, child] of this.items.entries()) {
            plan.AddDelete(child, `${this.Name}[${index}]`);
        }
        for (const [index, child] of this.removed.entries()) {
            plan.AddDelete(child, `${this.Name}.Removed[${index}]`);
        }
    }

    /** @inheritdoc */
    public override AcceptChanges(): void {
        this.removed = [];
        if (this.options.ClearAfterSave) {
            this.items = [];
            this.loaded = false;
        }
    }

    /** @inheritdoc */
    public override async Serialize(): Promise<RelatedRecordCollectionWire | null> {
        // Nothing pending means nothing to ship. Sending an empty collection on every header-only
        // save would be pure overhead on the hot path.
        if (this.items.length === 0 && this.removed.length === 0) {
            return null;
        }

        return {
            Items: this.items.map(i => ({ Fields: i.GetAll(), IsNew: !i.IsSaved })),
            Removed: this.removed.map(r => this.primaryKeyOf(r)),
        };
    }

    /** @inheritdoc */
    public override async Deserialize(
        data: RelatedRecordCollectionWire,
        mode: EntityCompanionDeserializeMode = 'request',
    ): Promise<void> {
        const provider = this.Owner.ProviderToUse as unknown as IMetadataProvider;
        if (!provider) {
            throw new Error(`RelatedRecordCollection '${this.Name}': owner has no provider; cannot deserialize.`);
        }

        this.items = await this.rehydrateItems(provider, data?.Items ?? [], mode);
        // Removals only exist in a request — a result describes what survived, and anything deleted
        // is simply absent from it.
        this.removed = mode === 'request' ? await this.rehydrateRemovals(provider, data?.Removed ?? []) : [];
        this.loaded = true;
    }

    /**
     * Rebuilds retained child entity objects from the wire.
     *
     * Each child is created through the provider, so it resolves to whatever subclass is registered
     * on **this** tier. That is what makes a graph assembled in the browser execute server-side
     * business logic: the server rebuilds the same records as their server subclasses.
     *
     * @param provider - The provider to create entity objects from.
     * @param rows - Wire items.
     * @returns Rehydrated child entities.
     */
    private async rehydrateItems(
        provider: IMetadataProvider,
        rows: RelatedRecordCollectionWireItem[],
        mode: EntityCompanionDeserializeMode,
    ): Promise<T[]> {
        const out: T[] = [];
        for (const row of rows) {
            const child = await provider.GetEntityObject<T>(this.RelatedEntityName, this.Owner.ContextCurrentUser);

            if (mode === 'result') {
                // Authoritative post-save state: adopt it verbatim and land clean. No query — the
                // sender just persisted these rows and is telling us what they now contain.
                await child.LoadFromData(row.Fields, true);
                out.push(child);
                continue;
            }

            if (row.IsNew) {
                child.NewRecord();
                child.SetMany(row.Fields, true);
            } else {
                // AN EXISTING CHILD MUST BE LOADED BEFORE THE WIRE VALUES ARE APPLIED.
                //
                // The tempting shortcut — LoadFromData(row, replaceOldValues: true) — sets each
                // field's OLD value to the value that arrived over the wire. The record then reports
                // Dirty === false, its Save() takes the not-dirty early return, and the caller's edit
                // is silently discarded while every layer reports success.
                //
                // Loading first gives genuine old values, so dirty tracking is accurate and the
                // old-values concurrency check has something real to compare against. It costs one
                // query per edited child; correctness first, and a batched variant can follow.
                const key = new CompositeKey(
                    child.EntityInfo.PrimaryKeys.map(pk => new KeyValuePair(pk.Name, row.Fields[pk.Name])),
                );
                const loaded = await child.InnerLoad(key);
                if (!loaded) {
                    throw new Error(
                        `RelatedRecordCollection '${this.Name}': cannot load existing ${this.RelatedEntityName} ` +
                        `record ${key.ToString()} referenced by the incoming payload.`,
                    );
                }
                child.SetMany(row.Fields, true);
            }
            out.push(child);
        }
        return out;
    }

    /**
     * Rebuilds the children queued for deletion. Only identity is carried, so these are loaded from
     * their primary keys — a delete needs the real row, not the sender's view of its fields.
     *
     * A removal whose row has already vanished is skipped rather than failing the graph: the intent
     * ("this should not exist") is already satisfied.
     *
     * @param provider - The provider to create entity objects from.
     * @param rows - Primary-key maps.
     * @returns Loaded child entities to delete.
     */
    private async rehydrateRemovals(provider: IMetadataProvider, rows: Record<string, unknown>[]): Promise<T[]> {
        const out: T[] = [];
        for (const row of rows) {
            const child = await provider.GetEntityObject<T>(this.RelatedEntityName, this.Owner.ContextCurrentUser);
            const key = new CompositeKey(
                child.EntityInfo.PrimaryKeys.map(pk => new KeyValuePair(pk.Name, row[pk.Name])),
            );
            if (await child.InnerLoad(key)) {
                out.push(child);
            }
        }
        return out;
    }

    /**
     * Extracts just the primary-key fields of a child, for the `Removed` payload.
     *
     * Removals only need identity — shipping the whole row would waste bandwidth and invite the
     * server to act on stale field values for a record it is about to delete.
     *
     * @param child - The removed child.
     * @returns A map of primary-key field names to values.
     */
    private primaryKeyOf(child: T): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const pk of child.EntityInfo?.PrimaryKeys ?? []) {
            out[pk.Name] = child.Get(pk.Name);
        }
        return out;
    }

    /**
     * Copies the parent's primary key into every retained record's foreign-key field.
     *
     * Called at add time, at validation time and again immediately before each record is written.
     * Doing it early keeps the in-memory graph coherent — `line.OrderHeaderID` is populated as soon
     * as the line is added, which is what a caller inspecting the object expects, and what lets a
     * `NOT NULL` foreign key pass validation on a create. Doing it again at execution time covers
     * identity/auto-increment parents, whose key genuinely does not exist until their row is
     * inserted.
     *
     * A parent with no key yet is skipped rather than stamping `undefined` over a value that may
     * already be correct.
     */
    private stampParentKey(): void {
        const parentKey = this.Owner.FirstPrimaryKey?.Value;
        if (parentKey === null || parentKey === undefined || parentKey === '') {
            return;
        }
        for (const child of this.items) {
            child.Set(this.options.RelatedEntityJoinField, parentKey);
        }
    }

    /**
     * Renumbers retained children when the collection declares a sequence field.
     *
     * Runs on every add and remove so the sequence is always contiguous and gap-free, which is what
     * callers assume when they display or reference "line 3".
     */
    private applySequence(): void {
        const seq = this.options.Sequence;
        if (!seq) {
            return;
        }
        const from = seq.From ?? 1;
        this.items.forEach((child, index) => {
            try {
                child.Set(seq.Field, from + index);
            } catch (e) {
                // A misdeclared sequence field must not take the whole save down; surface it loudly
                // and let validation report the real problem.
                LogError(
                    `RelatedRecordCollection '${this.Name}': cannot set sequence field '${seq.Field}' on ` +
                    `${this.RelatedEntityName}: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        });
    }
}

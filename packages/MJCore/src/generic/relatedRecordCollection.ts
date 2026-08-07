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

import type { BaseEntity } from './baseEntity';
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
 * - `'eager'` — populated automatically by `BaseEntity.Load()`. **Never** by `LoadFromData()`,
 *   which is the per-row materialisation path for `RunView(ResultType:'entity_object')`. That
 *   exclusion is deliberate and is the structural fix for a live N+1 in production accounting code,
 *   where a `LoadFromData` override issued one child query per row of every view.
 * - `'never'` — the collection is a write-only staging buffer; `Load()` is a no-op. Matches how
 *   order lines are actually used: built up in memory and pushed down, never read back through the
 *   collection.
 */
export type RelatedRecordLoadMode = 'explicit' | 'eager' | 'never';

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

    /**
     * The retained children, in order.
     *
     * Read-only by design — mutate through {@link Add}, {@link Create} and {@link Remove} so that
     * removals are tracked, sequence numbers stay correct, and the parent's `Dirty` flag reflects
     * reality. Handing out a mutable array would make all three impossible to guarantee.
     */
    public get Items(): readonly T[] {
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

    /** Number of retained children. */
    public get Count(): number {
        return this.items.length;
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
        if (this.LoadMode === 'eager') {
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

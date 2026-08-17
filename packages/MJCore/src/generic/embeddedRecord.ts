/**
 * @fileoverview `EmbeddedRecord<T>` — a 1:1 peer `BaseEntity` that loads, validates
 * and persists as one unit with its owner, joined by an **owner-held** foreign key.
 *
 * This is the third composition axis on `BaseEntity`, next to IS-A (shared PK) and
 * related-record collections (FK on the related row). The FK lives on the owner
 * (`Deal.OrderID`), so the save order inverts: the peer persists first, the owner
 * stamps the FK, then the owner persists.
 *
 * Callers never hold this class. They see `owner.OrderID_Object` (the entity) and
 * `owner.OrderID_EnsureObject()` (sync provision for a nullable FK).
 *
 * @module @memberjunction/core
 */

import type { BaseEntity } from './baseEntity';
import { CompositeKey, KeyValuePair } from './compositeKey';
import { EntityCompanion, EntityCompanionDeserializeMode, EntityCompanionPayload } from './entityCompanion';
import type { EntitySavePlan } from './entitySavePlan';
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from './entityInfo';
import type { EntitySaveOptions } from './interfaces';

/** What clearing the relationship does to the embedded row. */
export type EmbeddedRecordClearMode = 'delete' | 'orphan' | 'refuse';

/** How far `owner.Load()` walks into the embedded record. */
export type EmbeddedRecordLoadNested = 'inherit' | 'related';

/**
 * Declaration for an {@link EmbeddedRecord}, supplied to `BaseEntity.DeclareEmbeddedRecord()`.
 *
 * `RelatedEntity` and `ForeignKeyField` are the only required values — they are the
 * join. Everything else has a default that matches the Deal → Order case.
 */
export type EmbeddedRecordOptions = {
    /**
     * The owner's field holding the foreign key, e.g. `'OrderID'`.
     * The generated property names are derived from this: `{Field}_Object`,
     * `{Field}_EnsureObject`.
     */
    ForeignKeyField: string;
    /** The related entity's name in MJ metadata, e.g. `'MJ_BizApps_Orders: Order Headers'`. */
    RelatedEntity: string;
    /** Defaults to `'orphan'`. */
    OnClear?: EmbeddedRecordClearMode;
    /** Defaults to `'inherit'`. */
    LoadNested?: EmbeddedRecordLoadNested;
};

/** Wire shape. Nested companions travel so a browser save does not drop the peer's graph. */
export type EmbeddedRecordWire = {
    Fields: Record<string, unknown>;
    IsNew: boolean;
    Cleared: boolean;
    Companions: EntityCompanionPayload[] | null;
};

/**
 * Internal companion for one owner-held 1:1 peer.
 *
 * @typeParam T - The embedded entity type.
 */
export class EmbeddedRecord<T extends BaseEntity = BaseEntity> extends EntityCompanion<EmbeddedRecordWire> {
    public readonly Name: string;
    public readonly ForeignKeyField: string;
    public readonly RelatedEntityName: string;
    public readonly ClearMode: EmbeddedRecordClearMode;
    public readonly LoadNested: EmbeddedRecordLoadNested;

    private instance: T | null = null;
    private exposed = false;
    private cleared = false;
    private constructing = false;

    constructor(owner: BaseEntity, options: EmbeddedRecordOptions) {
        super(owner);
        this.ForeignKeyField = options.ForeignKeyField;
        this.RelatedEntityName = options.RelatedEntity;
        this.Name = `${options.ForeignKeyField}_Object`;
        this.ClearMode = options.OnClear ?? 'orphan';
        this.LoadNested = options.LoadNested ?? 'inherit';
    }

    /** The live peer, or `null` when a nullable FK is not yet provisioned. */
    public get Value(): T | null {
        return this.exposed ? this.instance : null;
    }

    /** True when the getter will return an object. */
    public get IsProvisioned(): boolean {
        return this.exposed && this.instance !== null;
    }

    /** True when the owner's FK column refuses null. */
    public get IsRequired(): boolean {
        const field = this.Owner.GetFieldByName(this.ForeignKeyField);
        return field?.EntityFieldInfo.AllowsNull === false;
    }

    /**
     * Constructs the related entity instance without `NewRecord` / `Load`.
     * Called from `BaseEntity.InitializeEmbeddedRecords` during `GetEntityObject`.
     *
     * @param visited - Entity names already being constructed, for cycle detection.
     */
    public async InitializeInstance(visited: Set<string>): Promise<void> {
        if (this.instance || this.constructing) {
            return;
        }
        // Sibling embeds targeting the same entity (BillToAddress + ShipToAddress)
        // are not a cycle. ConstructUninitializedEntity does not recurse into
        // InitializeEmbeddedRecords, so a true construction cycle cannot form here.
        // The per-companion `constructing` flag still collapses a re-entrant call
        // on the same companion.
        this.constructing = true;
        visited.add(this.RelatedEntityName);
        try {
            this.instance = await this.Owner.ConstructUninitializedEntity<T>(
                this.RelatedEntityName,
                visited,
            );
        } finally {
            visited.delete(this.RelatedEntityName);
            this.constructing = false;
        }
    }

    /**
     * Sync provision. Idempotent. For a required FK this is a no-op after `NewRecord`.
     */
    public Ensure(): T {
        if (!this.instance) {
            throw new Error(
                `EmbeddedRecord '${this.Name}' on ${this.Owner.EntityInfo?.Name}: the related ` +
                `'${this.RelatedEntityName}' instance was not constructed. GetEntityObject must ` +
                `run InitializeEmbeddedRecords before Ensure().`,
            );
        }
        if (this.exposed) {
            return this.instance;
        }
        // After GetEntityObject the instance is constructed but not NewRecord()'d.
        // NewRecord() is what assigns a client UUID PK, fires the new_record event,
        // and runs subclass overrides — without it stampOwnerKey has nothing to write.
        if (!this.instance.IsSaved) {
            this.instance.NewRecord();
        }
        this.stampOwnerKey();
        this.exposed = true;
        this.cleared = false;
        return this.instance;
    }

    /**
     * Marks the relationship for removal on the next save. Does not persist by itself.
     */
    public Clear(): void {
        if (this.ClearMode === 'refuse') {
            throw new Error(
                `EmbeddedRecord '${this.Name}' on ${this.Owner.EntityInfo?.Name}: Clear() is refused ` +
                `(OnClear: 'refuse'). Detaching this relationship is not allowed.`,
            );
        }
        this.exposed = false;
        this.cleared = true;
        this.Owner.Set(this.ForeignKeyField, null);
    }

    /**
     * Called from the owner's `NewRecord()`. Required FKs are provisioned here so
     * `owner.OrderID_Object` is usable immediately after `GetEntityObject`.
     */
    public OnOwnerNewRecord(): void {
        this.cleared = false;
        if (!this.instance) {
            return;
        }
        if (this.IsRequired) {
            const existingFk = this.Owner.Get(this.ForeignKeyField);
            if (existingFk !== null && existingFk !== undefined && existingFk !== '') {
                // Caller passed NewRecord({ [FK]: existingId }). Do not mint a
                // new peer and overwrite that FK. The owner points at an existing
                // row; Load() will hydrate it.
                this.exposed = false;
            } else {
                this.instance.NewRecord();
                this.stampOwnerKey();
                this.exposed = true;
            }
        } else {
            this.exposed = false;
        }
    }

    /** @inheritdoc */
    public override get Dirty(): boolean {
        if (this.cleared) {
            return true;
        }
        if (!this.exposed || !this.instance) {
            return false;
        }
        return this.instance.Dirty;
    }

    /** @inheritdoc */
    public override Validate(result: ValidationResult): void {
        if (!this.exposed || !this.instance) {
            return;
        }
        const inner = this.instance.Validate();
        if (!inner.Success) {
            result.Success = false;
            for (const err of inner.Errors) {
                result.Errors.push(this.prefixError(err));
            }
        }
    }

    /** @inheritdoc */
    public override async ValidateAsync(result: ValidationResult): Promise<void> {
        if (!this.exposed || !this.instance) {
            return;
        }
        const inner = await this.instance.ValidateAsync();
        if (!inner.Success) {
            result.Success = false;
            for (const err of inner.Errors) {
                result.Errors.push(this.prefixError(err));
            }
        }
    }

    /** @inheritdoc */
    public override ContributeSaveWork(plan: EntitySavePlan, options?: EntitySaveOptions): void {
        if (this.cleared) {
            this.contributeClearWork(plan);
            return;
        }
        if (!this.exposed || !this.instance) {
            return;
        }
        if (this.instance.IsSaved && !this.instance.Dirty && !options?.IgnoreDirtyState) {
            return;
        }
        plan.AddSaveBeforeRoot(this.instance, this.Name);
        plan.AddRootPrepare(() => this.stampOwnerKey());
    }

    /** @inheritdoc */
    public override ContributePostDeleteWork(plan: EntitySavePlan): void {
        if (this.ClearMode !== 'delete') {
            return;
        }
        if (!this.instance || !this.instance.IsSaved) {
            return;
        }
        plan.AddDelete(this.instance, `${this.Name}.OnOwnerDelete`);
    }

    /** @inheritdoc */
    public override async LoadEager(): Promise<void> {
        if (!this.instance) {
            return;
        }
        const fk = this.Owner.Get(this.ForeignKeyField);
        if (fk === null || fk === undefined || fk === '') {
            this.exposed = false;
            this.cleared = false;
            // A reused owner instance can still hold the previous record's
            // saved peer. Reset it so Ensure() does not restamp that PK and
            // OnClear:'delete' does not delete the previous peer.
            if (this.instance.IsSaved) {
                this.instance.NewRecord();
            }
            return;
        }
        // Nested embeds are not constructed with the owner (ConstructUninitializedEntity
        // does not recurse). Initialise them now so InnerLoad's loadEagerCompanions
        // walks the inherit tree instead of no-opping on a null instance.
        await this.instance.InitializeEmbeddedRecords();
        const loaded = await this.instance.InnerLoad(this.keyFromForeignKey(fk));
        if (!loaded) {
            if (this.IsRequired) {
                throw new Error(
                    `EmbeddedRecord '${this.Name}' on ${this.Owner.EntityInfo?.Name}: required ` +
                    `FK ${this.ForeignKeyField}='${fk}' does not resolve to a ${this.RelatedEntityName} row.`,
                );
            }
            this.exposed = false;
            return;
        }
        this.exposed = true;
        this.cleared = false;
        if (this.LoadNested === 'related') {
            await this.instance.LoadRelatedRecords();
        }
    }

    /** @inheritdoc */
    public override AcceptChanges(): void {
        this.cleared = false;
    }

    /** @inheritdoc */
    public override async Serialize(mode: EntityCompanionDeserializeMode = 'request'): Promise<EmbeddedRecordWire | null> {
        if (this.cleared) {
            return { Fields: {}, IsNew: false, Cleared: true, Companions: null };
        }
        if (!this.exposed || !this.instance) {
            return null;
        }
        // Request: omit a clean saved peer so a header-only edit does not ship it.
        // Result: always ship an exposed peer so the client can mark it saved.
        // Skipping result-serialize left the client IsSaved=false; the next Save
        // re-sent IsNew:true and the server re-INSERTed the same UUID.
        if (mode !== 'result' && this.instance.IsSaved && !this.instance.Dirty) {
            return null;
        }
        const companions = await this.instance.SerializeCompanions(mode);
        return {
            Fields: this.instance.GetAll(),
            IsNew: !this.instance.IsSaved,
            Cleared: false,
            Companions: companions.length > 0 ? companions : null,
        };
    }

    /** @inheritdoc */
    public override async Deserialize(
        data: EmbeddedRecordWire,
        mode: EntityCompanionDeserializeMode = 'request',
    ): Promise<void> {
        if (!data) {
            return;
        }
        if (data.Cleared) {
            this.exposed = false;
            this.cleared = true;
            this.Owner.Set(this.ForeignKeyField, null);
            return;
        }
        if (!this.instance) {
            await this.InitializeInstance(new Set<string>());
        }
        if (!this.instance) {
            throw new Error(
                `EmbeddedRecord '${this.Name}': cannot deserialize — no instance of ${this.RelatedEntityName}.`,
            );
        }
        await this.applyWire(data, mode);
        this.exposed = true;
        this.cleared = false;
    }

    private async applyWire(data: EmbeddedRecordWire, mode: EntityCompanionDeserializeMode): Promise<void> {
        const target = this.instance!;
        if (mode === 'result') {
            await target.LoadFromData(data.Fields, true);
            if (data.Companions && data.Companions.length > 0) {
                await target.DeserializeCompanions(data.Companions, 'result');
            }
            return;
        }
        if (data.IsNew) {
            target.NewRecord();
            target.SetMany(data.Fields, true);
        } else {
            await this.loadExistingThenApply(target, data.Fields);
        }
        if (data.Companions && data.Companions.length > 0) {
            await target.DeserializeCompanions(data.Companions, mode);
        }
    }

    private async loadExistingThenApply(target: T, fields: Record<string, unknown>): Promise<void> {
        const key = new CompositeKey(
            target.EntityInfo.PrimaryKeys.map(pk => new KeyValuePair(pk.Name, fields[pk.Name])),
        );
        const loaded = await target.InnerLoad(key);
        if (!loaded) {
            throw new Error(
                `EmbeddedRecord '${this.Name}': cannot load existing ${this.RelatedEntityName} ` +
                `record ${key.ToString()} referenced by the incoming payload.`,
            );
        }
        target.SetMany(fields, true);
    }

    private contributeClearWork(plan: EntitySavePlan): void {
        plan.AddRootPrepare(() => this.Owner.Set(this.ForeignKeyField, null));
        if (this.ClearMode === 'delete' && this.instance?.IsSaved) {
            plan.AddDelete(this.instance, `${this.Name}.Cleared`);
        }
    }

    private stampOwnerKey(): void {
        const key = this.instance?.FirstPrimaryKey?.Value;
        if (key === null || key === undefined || key === '') {
            return;
        }
        this.Owner.Set(this.ForeignKeyField, key);
    }

    private keyFromForeignKey(fk: unknown): CompositeKey {
        const pks = this.instance!.EntityInfo.PrimaryKeys;
        if (pks.length === 1) {
            return CompositeKey.FromID(fk);
        }
        return new CompositeKey(pks.map(pk => new KeyValuePair(pk.Name, fk)));
    }

    private prefixError(err: ValidationErrorInfo): ValidationErrorInfo {
        return new ValidationErrorInfo(
            `${this.Name}.${err.Source ?? ''}`.replace(/\.$/, ''),
            err.Message,
            err.Value,
            err.Type ?? ValidationErrorType.Failure,
        );
    }
}
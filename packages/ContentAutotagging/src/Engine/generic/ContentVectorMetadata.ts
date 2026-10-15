/**
 * @fileoverview The metadata a content vector carries, built one way for every writer.
 *
 * Two things write content vectors: the autotagger and the content pipeline's Embed stage. Search
 * reads what they wrote and cannot tell them apart, so they must write the same thing — the same
 * identity keys, the same `VectorMetadata` field strategy, truncation and coercion, the same rule for
 * when the `Entity` key may be omitted. Two implementations would drift the moment either changed.
 * This module is the one implementation; both writers call it.
 *
 * Everything that shapes the result is metadata: `Configuration.VectorMetadata` (and
 * `VectorIDStrategy`, `ChunkTextStorage`, `VectorEntityName`) on the Content Source, falling back to
 * its Content Type. Changing what a vector carries is an edit to one of those rows.
 *
 * Self-contained by design: no engine state, only the provider it is handed — so a writer that is
 * not the autotagger depends on this, not on `AutotagBaseEngine`.
 *
 * @module @memberjunction/content-autotagging
 */

import { EntityFieldInfo, EntityInfo, IMetadataProvider, LogError, LogStatus } from '@memberjunction/core';
import { IsValidUUID, NormalizeUUID } from '@memberjunction/global';
import {
    MJContentItemEntity,
    MJContentSourceEntity,
    MJContentSourceEntity_IContentSourceConfiguration,
    MJContentTypeEntity,
} from '@memberjunction/core-entities';

/**
 * How a chunk's vector-DB record id is derived — `'recordId'` (the chunk's own PK, purge-safe) or
 * `'hash'` (deterministic, EntityDocument-parity). Derived from the generated JSONType interface so
 * it tracks the metadata definition.
 */
export type VectorIDStrategy = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['VectorIDStrategy']>;
/**
 * Whether an item always embeds as chunk rows (`'alwaysChunk'`) or embeds as a single item-level
 * vector when it fits in one chunk (`'mixed'`). Derived from the generated JSONType interface.
 */
export type ChunkTextStorage = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['ChunkTextStorage']>;
/** Vector-metadata shaping config (field strategy, per-field rules, curated toggles). Derived from the generated JSONType interface. */
export type VectorMetadataConfig = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['VectorMetadata']>;
/** Per-field vector-metadata rule (inclusion, truncation, StoreAs coercion). Derived from {@link VectorMetadataConfig}. */
export type VectorMetadataFieldConfig = NonNullable<VectorMetadataConfig['Fields']>[string];
/** The entity a source declares its vectors to be. Derived from the generated JSONType interface. */
export type VectorEntityName = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['VectorEntityName']>;

/**
 * Vector-storage behavior resolved for a single content item, from its ContentSource configuration
 * falling back to its ContentType defaults, then the documented defaults. Produced by
 * {@link ResolveContentVectorStorageConfig}.
 */
export interface ResolvedVectorStorageConfig {
    vectorIDStrategy: VectorIDStrategy;
    chunkTextStorage: ChunkTextStorage;
    /** How vector metadata is shaped (undefined ⇒ the curated default set). */
    metadata?: VectorMetadataConfig;
    /**
     * The entity this source declares its vectors to be, from `ContentSource.Configuration`. Read only
     * to decide whether the per-vector `Entity` key can be omitted; the value itself is never written
     * to metadata, and search validates it at attribution time.
     */
    vectorEntityName?: VectorEntityName;
}

/** A value vector metadata can hold. */
export type ContentVectorMetadata = Record<string, string | number | boolean | string[]>;

/** The vector being described: which item, and whether it is the item's own or one of its chunks. */
export interface ContentVectorTarget {
    /** The content item the vector belongs to. */
    Item: MJContentItemEntity;
    /** True for a vector stored at the item level; false for a chunk's vector. */
    IsItemLevel: boolean;
    /** The chunk's id — its row's primary key, and its vector id under `'recordId'`. Chunk vectors only. */
    ChunkID?: string;
    /** The chunk's position within its item. Chunk vectors only. */
    ChunkIndex?: number;
    /** The text that was embedded, for the optional `IncludeText` copy. */
    Text?: string;
}

/** Column types that cannot be stored in vector metadata at all (binary/rowversion). */
const UNSTORABLE_METADATA_TYPES = new Set(['varbinary', 'image', 'binary', 'timestamp', 'rowversion']);
/** SQL column types stored as JS numbers in vector metadata without an explicit StoreAs. */
const NUMERIC_SQL_TYPES = new Set(['int', 'bigint', 'smallint', 'tinyint', 'float', 'real', 'decimal', 'numeric', 'money', 'smallmoney']);
/**
 * The truncation limit when `VectorMetadata.DefaultTruncationLimit` sets none — the default the
 * JSONType documents. Set `DefaultTruncationLimit`, or a field's `TruncationLimit`, to change it.
 */
const DOCUMENTED_DEFAULT_TRUNCATION = 1000;

/** The documented defaults when neither the ContentSource nor its ContentType configures storage. */
const DEFAULT_VECTOR_ID_STRATEGY: VectorIDStrategy = 'recordId';
const DEFAULT_CHUNK_TEXT_STORAGE: ChunkTextStorage = 'alwaysChunk';

/** The entity whose rows chunk-level vectors actually are. */
const CHUNK_ENTITY_NAME = 'MJ: Content Item Chunks';

/**
 * Resolve the vector-storage behavior for a content item using the cascade: ContentSource override
 * → ContentType default → documented default. Reads the typed `ConfigurationObject` accessors
 * CodeGen emits for each entity's Configuration JSONType.
 */
export function ResolveContentVectorStorageConfig(
    source: MJContentSourceEntity | undefined,
    contentType: MJContentTypeEntity | undefined,
): ResolvedVectorStorageConfig {
    const srcCfg = source?.ConfigurationObject;
    const typeCfg = contentType?.ConfigurationObject;
    return {
        vectorIDStrategy: srcCfg?.VectorIDStrategy ?? typeCfg?.VectorIDStrategy ?? DEFAULT_VECTOR_ID_STRATEGY,
        chunkTextStorage: srcCfg?.ChunkTextStorage ?? typeCfg?.ChunkTextStorage ?? DEFAULT_CHUNK_TEXT_STORAGE,
        metadata: srcCfg?.VectorMetadata ?? typeCfg?.VectorMetadata ?? undefined,
        // Source only — deliberately NOT part of the ContentType cascade the other knobs use. The
        // others describe HOW to store a vector, which a content type can sensibly default for every
        // source that adopts it. This one asserts WHAT the vectors are, and it decides which entity's
        // permissions search evaluates, so a type-level default would make that assertion on behalf of
        // sources the type's author never saw — including ones storing their vectors at a different
        // level, where the declaration would be wrong.
        vectorEntityName: srcCfg?.VectorEntityName,
    };
}

/**
 * Builds the metadata stored alongside a content vector. Mirrors the entity-vectorization pipeline's
 * decomposed shape, so each concern can be overridden independently by a subclass.
 *
 * `VectorMetadata.FieldStrategy` selects the field set:
 * - unset ⇒ the curated content default (source ids + Title / Description / URL);
 * - 'all' / 'include' / 'exclude' / 'explicit' ⇒ ContentItem fields resolved by
 *   {@link getContentDisplayFields}, with per-field StoreAs coercion + truncation.
 *
 * The identity keys are chunk-aware; under 'explicit' only `Entity` is kept so content search results
 * stay labeled — unless the source declares its vector entity, in which case `Entity` gives way to
 * `ContentSourceID` and search resolves the name from the declaration. See
 * {@link canOmitEntityMetadataKey} for the conditions and why each one exists.
 *
 * One instance per pass: it remembers which declarations it has already reported, so a refusal is
 * logged once rather than per vector.
 */
export class ContentVectorMetadataBuilder {
    /** Declarations already reported as unresolvable, so the warning is once per pass, not per vector. */
    private readonly unresolvableDeclarations = new Set<string>();

    constructor(protected readonly provider: IMetadataProvider) {}

    /** The metadata for one vector. */
    public Build(
        target: ContentVectorTarget,
        tags: readonly string[] | undefined,
        config: ResolvedVectorStorageConfig,
        contentItemEntity: EntityInfo | undefined,
    ): ContentVectorMetadata {
        const item = target.Item;
        const metaCfg = config.metadata;
        const strategy = metaCfg?.FieldStrategy;
        const explicit = strategy === 'explicit';
        const meta: ContentVectorMetadata = {};

        this.addContentSystemMetadata(meta, target, explicit, config);

        if (!strategy) {
            this.addCuratedMetadata(meta, item, metaCfg);
        } else {
            const all = item.GetAll() as Record<string, unknown>;
            this.addEntityIconMetadata(meta, contentItemEntity, metaCfg, explicit);
            this.addUpdatedAtMetadata(meta, all, metaCfg, explicit);
            // Display fields LAST so an explicitly-configured field (e.g. __mj_UpdatedAt with a
            // StoreAs override) wins over the toggle-driven default value — matches the entity side.
            this.addStrategyDisplayFields(meta, all, contentItemEntity, metaCfg);
        }

        this.addTagsMetadata(meta, tags, metaCfg, explicit);

        // Optional embedded-text copy (surfaces as the search snippet). Off by default — external
        // hydrators read the authoritative text from the row. Honored under every strategy.
        if (metaCfg?.IncludeText && target.Text) {
            meta['Text'] = target.Text.substring(0, this.defaultTruncation(metaCfg));
        }

        this.enforceAttributionKey(meta, target, explicit, config);
        return meta;
    }

    /**
     * Add the identity/system keys. `Entity` is present unless the source declares its vector entity
     * and {@link canOmitEntityMetadataKey} allows dropping it, in which case `ContentSourceID` takes
     * its place as the key search attributes through. Under 'explicit' the rest are omitted (minimal
     * metadata); otherwise `RecordID` — plus `ContentItemID` / `Sequence` for chunk vectors — are
     * included so an external hydrator can fetch the row(s).
     */
    protected addContentSystemMetadata(
        meta: ContentVectorMetadata,
        target: ContentVectorTarget,
        explicit: boolean,
        config: ResolvedVectorStorageConfig,
    ): void {
        if (this.canOmitEntityMetadataKey(config, explicit, target.IsItemLevel)) {
            // The invariant that makes omission safe: a vector with no `Entity` key must still carry
            // the key attribution resolves THROUGH, or the match reaches search with nothing to resolve
            // and is discarded without being shown. Written unconditionally — a source configuring
            // `ContentSourceID` in its own field list is applied later and so still wins.
            meta['ContentSourceID'] = target.Item.ContentSourceID;
            return;
        }
        meta['Entity'] = target.IsItemLevel ? 'MJ: Content Items' : CHUNK_ENTITY_NAME;
        if (explicit) return;
        if (target.IsItemLevel) {
            meta['RecordID'] = target.Item.ID;
        } else {
            if (target.ChunkID) meta['RecordID'] = target.ChunkID;
            meta['ContentItemID'] = target.Item.ID;
            if (typeof target.ChunkIndex === 'number') meta['Sequence'] = target.ChunkIndex;
        }
    }

    /**
     * Last line of defence for the omission invariant: when `Entity` was dropped, the vector MUST leave
     * here carrying a `ContentSourceID` search can actually resolve — a non-empty **string**.
     *
     * The promoted key is written before the strategy's own display fields, deliberately, so a source
     * that configures `ContentSourceID` with its own rules wins — up to the point where a rule would
     * break attribution (`StoreAs: 'boolean'` turns the id into `true`), and no further.
     */
    protected enforceAttributionKey(
        meta: ContentVectorMetadata,
        target: ContentVectorTarget,
        explicit: boolean,
        config: ResolvedVectorStorageConfig,
    ): void {
        if (!this.canOmitEntityMetadataKey(config, explicit, target.IsItemLevel)) {
            return;
        }
        const current = meta['ContentSourceID'];
        if (typeof current === 'string' && current.trim().length > 0) {
            return;
        }
        LogStatus(
            `[ContentVectorMetadata] Content source ${target.Item.ContentSourceID} configures ContentSourceID in a way ` +
                `that leaves no resolvable value (${JSON.stringify(current)}), and its vectors omit the Entity ` +
                `key — restoring the id so search can still attribute them. Remove the StoreAs override on ` +
                `ContentSourceID, or set VectorEntityName aside and let Entity be written instead.`,
        );
        meta['ContentSourceID'] = target.Item.ContentSourceID;
    }

    /**
     * Whether this vector may omit the `Entity` metadata key and let search resolve the entity from the
     * source's declaration instead.
     *
     * Each condition closes a way attribution could otherwise fail, and attribution failure is not
     * cosmetic: a match search cannot name is discarded by the permission filter, not returned unlabelled.
     *
     * - **`explicit` only.** The other strategies document a populated metadata set.
     * - **A declaration must exist** and resolve to the chunk entity or a subtype of it.
     * - **`'alwaysChunk'` only**, and **a chunk-level vector**: one declaration names one entity, and an
     *   item-level vector is a row of a different one. (`'mixed'` emits both levels from one source.)
     * - **`'recordId'` only.** Under `explicit` the `RecordID` key is dropped too, leaving the vector's
     *   own id as the only pointer back to a row — the chunk id under `'recordId'`, a digest under
     *   `'hash'` that resolves against no row.
     */
    protected canOmitEntityMetadataKey(config: ResolvedVectorStorageConfig, explicit: boolean, isItemLevel: boolean): boolean {
        // Trimmed, because the reader trims before deciding whether a declaration exists.
        const declared = config.vectorEntityName?.trim();
        if (
            !explicit ||
            isItemLevel ||
            !declared ||
            config.chunkTextStorage !== 'alwaysChunk' ||
            config.vectorIDStrategy !== 'recordId'
        ) {
            return false;
        }
        return this.declarationWillResolve(declared);
    }

    /**
     * Whether a declared entity name resolves in metadata — checked HERE, before the `Entity` key is
     * dropped, and not left to the reader. Vectors written without `Entity` cannot be recovered by
     * correcting the name later, only by a re-embed; keeping the key costs one redundant field. So this
     * deliberately fails SAFE.
     *
     * It checks resolution and level only, not family membership — that refusal is the reader's
     * security decision, which the write side must not be able to pre-approve.
     */
    protected declarationWillResolve(declared: string): boolean {
        const entity = this.provider.EntityByName(declared);
        if (!entity) {
            this.refuseDeclarationOnce(declared, `does not resolve in metadata (core entities carry the \`MJ: \` prefix)`);
            return false;
        }
        if (!this.isChunkLevelEntity(entity)) {
            this.refuseDeclarationOnce(
                declared,
                `is not "${CHUNK_ENTITY_NAME}" or a subtype of it, but this source stores chunk-level ` +
                    `vectors (ChunkTextStorage 'alwaysChunk'), so their ids are chunk keys`,
            );
            return false;
        }
        return true;
    }

    /**
     * Whether an entity IS-A {@link CHUNK_ENTITY_NAME} — itself, or a subtype somewhere up its IS-A
     * chain. Walks `ParentID` through this builder's provider rather than `EntityInfo.ParentChain`,
     * which resolves against the process-global provider.
     */
    protected isChunkLevelEntity(entity: EntityInfo): boolean {
        const visited = new Set<string>();
        let current: EntityInfo | undefined = entity;
        while (current) {
            if (current.Name === CHUNK_ENTITY_NAME) {
                return true;
            }
            if (!current.ParentID || visited.has(current.ID)) {
                return false; // root reached, or a cycle in the metadata
            }
            visited.add(current.ID);
            current = this.provider.EntityByID(current.ParentID) ?? undefined;
        }
        return false;
    }

    /** Report a refused declaration once per pass — this is evaluated per vector. */
    private refuseDeclarationOnce(declared: string, because: string): void {
        if (this.unresolvableDeclarations.has(declared)) {
            return;
        }
        this.unresolvableDeclarations.add(declared);
        LogStatus(
            `[ContentVectorMetadata] Vector entity declaration "${declared}" ${because}. Keeping the \`Entity\` key ` +
                `rather than omitting it — search would otherwise have no way to attribute these vectors, ` +
                `and because the key would never have been written, correcting the configuration later would ` +
                `not recover them without a re-embed.`,
        );
    }

    /** The curated default content metadata set (when no FieldStrategy is set). */
    protected addCuratedMetadata(meta: ContentVectorMetadata, item: MJContentItemEntity, metaCfg: VectorMetadataConfig | undefined): void {
        const limit = this.defaultTruncation(metaCfg);
        meta['ContentSourceID'] = item.ContentSourceID;
        meta['ContentSourceTypeID'] = item.ContentSourceTypeID;
        if (item.Name) meta['Title'] = item.Name.substring(0, limit);
        if (item.Description) meta['Description'] = item.Description.substring(0, limit);
        if (item.URL) meta['URL'] = item.URL;
    }

    /** Add the strategy-selected ContentItem fields, with per-field StoreAs coercion + truncation. */
    protected addStrategyDisplayFields(
        meta: ContentVectorMetadata,
        all: Record<string, unknown>,
        contentItemEntity: EntityInfo | undefined,
        metaCfg: VectorMetadataConfig | undefined,
    ): void {
        for (const field of this.getContentDisplayFields(contentItemEntity, metaCfg)) {
            const value = all[field.Name];
            if (value == null) continue;
            this.setCoercedFieldValue(meta, field, value, metaCfg);
        }
    }

    /**
     * Resolve which ContentItem fields go into metadata for the configured strategy. 'include' /
     * 'explicit' take only fields explicitly marked Included (only unstorable binary types are
     * refused); 'all' / 'exclude' take the conservative eligible set (no PKs, uniqueidentifiers,
     * binary, or __mj_* fields) minus any marked Included:false.
     */
    protected getContentDisplayFields(entityInfo: EntityInfo | undefined, metaCfg: VectorMetadataConfig | undefined): EntityFieldInfo[] {
        if (!entityInfo) return [];
        const strategy = metaCfg?.FieldStrategy;
        const overrides = metaCfg?.Fields ?? {};

        if (strategy === 'include' || strategy === 'explicit') {
            return entityInfo.Fields.filter((f) => {
                if (overrides[f.Name]?.Included !== true) return false;
                if (UNSTORABLE_METADATA_TYPES.has(f.Type.toLowerCase())) {
                    LogError(`Field "${f.Name}" is a binary type (${f.Type}) and cannot be stored in vector metadata — ignoring its explicit inclusion`);
                    return false;
                }
                return true;
            });
        }

        const skip = new Set(['uniqueidentifier', ...UNSTORABLE_METADATA_TYPES]);
        return entityInfo.Fields.filter(
            (f) => !f.IsPrimaryKey && !f.Name.startsWith('__mj_') && !skip.has(f.Type.toLowerCase()) && overrides[f.Name]?.Included !== false,
        );
    }

    /** Store one field's value with its configured/typed coercion (epoch/number/boolean/UUID/string). */
    protected setCoercedFieldValue(
        meta: ContentVectorMetadata,
        field: EntityFieldInfo,
        value: unknown,
        metaCfg: VectorMetadataConfig | undefined,
    ): void {
        const storeAs = metaCfg?.Fields?.[field.Name]?.StoreAs;
        const fieldType = field.Type?.toLowerCase() ?? '';

        if (storeAs === 'epochSeconds' || storeAs === 'epochMilliseconds') {
            const ms = new Date(String(value)).getTime();
            if (!Number.isNaN(ms)) meta[field.Name] = storeAs === 'epochSeconds' ? Math.floor(ms / 1000) : ms;
        } else if (storeAs === 'number' || (storeAs == null && NUMERIC_SQL_TYPES.has(fieldType))) {
            const n = Number(value);
            if (!Number.isNaN(n)) meta[field.Name] = n;
        } else if (storeAs === 'boolean') {
            meta[field.Name] = Boolean(value);
        } else if (fieldType === 'uniqueidentifier' && typeof value === 'string' && IsValidUUID(value)) {
            meta[field.Name] = NormalizeUUID(value);
        } else {
            meta[field.Name] = String(value).substring(0, this.resolveMetadataTruncationLimit(field, metaCfg));
        }
    }

    /** Per-field truncation: explicit override → field MaxLength (if small) → configured default. */
    protected resolveMetadataTruncationLimit(field: EntityFieldInfo, metaCfg: VectorMetadataConfig | undefined): number {
        const fieldCfg = metaCfg?.Fields?.[field.Name];
        if (fieldCfg?.TruncationLimit != null && fieldCfg.TruncationLimit > 0) return fieldCfg.TruncationLimit;
        if (field.MaxLength && field.MaxLength > 0 && field.MaxLength <= 5000) return field.MaxLength;
        return this.defaultTruncation(metaCfg);
    }

    /** `VectorMetadata.DefaultTruncationLimit`, or the default the JSONType documents. */
    protected defaultTruncation(metaCfg: VectorMetadataConfig | undefined): number {
        const configured = metaCfg?.DefaultTruncationLimit;
        return configured != null && configured > 0 ? configured : DOCUMENTED_DEFAULT_TRUNCATION;
    }

    /** Add the content entity's icon: default on under a set strategy, opt-in under 'explicit'. */
    protected addEntityIconMetadata(
        meta: ContentVectorMetadata,
        entityInfo: EntityInfo | undefined,
        metaCfg: VectorMetadataConfig | undefined,
        explicit: boolean,
    ): void {
        const include = explicit ? metaCfg?.IncludeEntityIcon === true : metaCfg?.IncludeEntityIcon !== false;
        if (entityInfo?.Icon && include) meta['EntityIcon'] = entityInfo.Icon;
    }

    /** Add __mj_UpdatedAt for recency: default on under a set strategy, opt-in under 'explicit'. */
    protected addUpdatedAtMetadata(
        meta: ContentVectorMetadata,
        all: Record<string, unknown>,
        metaCfg: VectorMetadataConfig | undefined,
        explicit: boolean,
    ): void {
        const include = explicit ? metaCfg?.IncludeUpdatedAt === true : metaCfg?.IncludeUpdatedAt !== false;
        if (all['__mj_UpdatedAt'] && include) meta['__mj_UpdatedAt'] = String(all['__mj_UpdatedAt']);
    }

    /**
     * Add the item's Tags array. Tags aren't a ContentItem field (they're derived), so they're a toggle
     * like icon/updatedAt: on by default (and under the curated default), opt-in under 'explicit'.
     */
    protected addTagsMetadata(
        meta: ContentVectorMetadata,
        tags: readonly string[] | undefined,
        metaCfg: VectorMetadataConfig | undefined,
        explicit: boolean,
    ): void {
        if (!tags || tags.length === 0) return;
        const include = explicit ? metaCfg?.IncludeTags === true : metaCfg?.IncludeTags !== false;
        if (include) meta['Tags'] = [...tags];
    }
}

/**
 * @fileoverview Builds the metadata stored on a content vector. The autotagger and the content
 * pipeline's Embed stage both call it, so search sees one shape from either writer.
 *
 * @module @memberjunction/content-autotagging
 */

import crypto from 'crypto';
import { EntityFieldInfo, EntityInfo, IMetadataProvider, LogError, LogStatus } from '@memberjunction/core';
import { IsValidUUID, NormalizeUUID } from '@memberjunction/global';
import {
    MJContentItemEntity,
    MJContentSourceEntity,
    MJContentSourceEntity_IContentSourceConfiguration,
    MJContentTypeEntity,
} from '@memberjunction/core-entities';

/** How a chunk's vector id is derived: `'recordId'` (the chunk's PK) or `'hash'` (deterministic). */
export type VectorIDStrategy = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['VectorIDStrategy']>;
/** `'alwaysChunk'` embeds chunk rows only; `'mixed'` embeds a one-chunk item as one item-level vector. */
export type ChunkTextStorage = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['ChunkTextStorage']>;
/** Vector-metadata shaping config (field strategy, per-field rules, toggles). */
export type VectorMetadataConfig = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['VectorMetadata']>;
/** Per-field vector-metadata rule (inclusion, truncation, StoreAs). */
export type VectorMetadataFieldConfig = NonNullable<VectorMetadataConfig['Fields']>[string];
/** The entity a source declares its vectors to be. */
export type VectorEntityName = NonNullable<MJContentSourceEntity_IContentSourceConfiguration['VectorEntityName']>;

/** Vector-storage settings for one item, from {@link ResolveContentVectorStorageConfig}. */
export interface ResolvedVectorStorageConfig {
    vectorIDStrategy: VectorIDStrategy;
    chunkTextStorage: ChunkTextStorage;
    /** How vector metadata is shaped (undefined ⇒ the curated default set). */
    metadata?: VectorMetadataConfig;
    /** Used only to decide whether the `Entity` key can be omitted; never written to metadata. */
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
/** Truncation limit when `VectorMetadata.DefaultTruncationLimit` is unset (the JSONType's documented default). */
const DOCUMENTED_DEFAULT_TRUNCATION = 1000;

/** The documented defaults when neither the ContentSource nor its ContentType configures storage. */
const DEFAULT_VECTOR_ID_STRATEGY: VectorIDStrategy = 'recordId';
const DEFAULT_CHUNK_TEXT_STORAGE: ChunkTextStorage = 'alwaysChunk';

/** The entity whose rows chunk-level vectors actually are. */
const CHUNK_ENTITY_NAME = 'MJ: Content Item Chunks';

/** Resolves an item's vector-storage settings: ContentSource → ContentType → documented default. */
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
        // Source only, no ContentType fallback: it picks which entity's permissions search checks.
        vectorEntityName: srcCfg?.VectorEntityName,
    };
}

/** A content vector's id: the record id under `'recordId'`, a SHA-1 of item (+ chunk index) under `'hash'`. */
export function ResolveContentVectorID(
    config: ResolvedVectorStorageConfig,
    itemID: string,
    isItemLevel: boolean,
    chunkIndex: number,
    recordID: string,
): string {
    if (config.vectorIDStrategy !== 'hash') {
        return recordID;
    }
    const seed = isItemLevel ? `content-item_${itemID}` : `content-item-chunk_${itemID}_${chunkIndex}`;
    return crypto.createHash('sha1').update(seed).digest('hex');
}

/**
 * Builds the metadata stored alongside a content vector; `VectorMetadata.FieldStrategy` picks the
 * field set (unset ⇒ curated default). Use one instance per pass so refusals are logged once.
 */
export class ContentVectorMetadataBuilder {
    /** Declarations already reported as unresolvable. */
    private readonly unresolvableDeclarations = new Set<string>();

    constructor(protected readonly Provider: IMetadataProvider) {}

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

        this.AddContentSystemMetadata(meta, target, explicit, config);

        if (!strategy) {
            this.AddCuratedMetadata(meta, item, metaCfg);
        } else {
            const all = item.GetAll() as Record<string, unknown>;
            this.AddEntityIconMetadata(meta, contentItemEntity, metaCfg, explicit);
            this.AddUpdatedAtMetadata(meta, all, metaCfg, explicit);
            // Display fields last so an explicitly configured field wins over the toggle default.
            this.AddStrategyDisplayFields(meta, all, contentItemEntity, metaCfg);
        }

        this.AddTagsMetadata(meta, tags, metaCfg, explicit);

        if (metaCfg?.IncludeText && target.Text) {
            meta['Text'] = target.Text.substring(0, this.DefaultTruncation(metaCfg));
        }

        this.EnforceAttributionKey(meta, target, explicit, config);
        return meta;
    }

    /**
     * Adds the identity keys: `Entity` (or `ContentSourceID` when {@link CanOmitEntityMetadataKey}
     * allows), plus `RecordID` / `ContentItemID` / `Sequence` except under 'explicit'.
     */
    protected AddContentSystemMetadata(
        meta: ContentVectorMetadata,
        target: ContentVectorTarget,
        explicit: boolean,
        config: ResolvedVectorStorageConfig,
    ): void {
        if (this.CanOmitEntityMetadataKey(config, explicit, target.IsItemLevel)) {
            // Without Entity, search attributes through this key; a match it cannot attribute is dropped.
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
     * When `Entity` was omitted, ensures `ContentSourceID` is still a non-empty string; a configured
     * rule such as `StoreAs: 'boolean'` would otherwise break attribution.
     */
    protected EnforceAttributionKey(
        meta: ContentVectorMetadata,
        target: ContentVectorTarget,
        explicit: boolean,
        config: ResolvedVectorStorageConfig,
    ): void {
        if (!this.CanOmitEntityMetadataKey(config, explicit, target.IsItemLevel)) {
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
     * Whether this vector may omit `Entity` and let search resolve it from the source's declaration.
     * Every condition must hold: a match search cannot attribute is dropped, not shown unlabelled.
     */
    protected CanOmitEntityMetadataKey(config: ResolvedVectorStorageConfig, explicit: boolean, isItemLevel: boolean): boolean {
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
        return this.DeclarationWillResolve(declared);
    }

    /**
     * Whether a declared entity resolves and is chunk-level. Fails safe: vectors written without
     * `Entity` can only be fixed by a re-embed. Family membership is left to the reader's security check.
     */
    protected DeclarationWillResolve(declared: string): boolean {
        const entity = this.Provider.EntityByName(declared);
        if (!entity) {
            this.refuseDeclarationOnce(declared, `does not resolve in metadata (core entities carry the \`MJ: \` prefix)`);
            return false;
        }
        if (!this.IsChunkLevelEntity(entity)) {
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
     * Whether an entity is {@link CHUNK_ENTITY_NAME} or a subtype. Walks `ParentID` through this
     * builder's provider, not `EntityInfo.ParentChain`, which uses the global provider.
     */
    protected IsChunkLevelEntity(entity: EntityInfo): boolean {
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
            current = this.Provider.EntityByID(current.ParentID) ?? undefined;
        }
        return false;
    }

    /** Logs a refused declaration once per pass. */
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
    protected AddCuratedMetadata(meta: ContentVectorMetadata, item: MJContentItemEntity, metaCfg: VectorMetadataConfig | undefined): void {
        const limit = this.DefaultTruncation(metaCfg);
        meta['ContentSourceID'] = item.ContentSourceID;
        meta['ContentSourceTypeID'] = item.ContentSourceTypeID;
        if (item.Name) meta['Title'] = item.Name.substring(0, limit);
        if (item.Description) meta['Description'] = item.Description.substring(0, limit);
        if (item.URL) meta['URL'] = item.URL;
    }

    /** Add the strategy-selected ContentItem fields, with per-field StoreAs coercion + truncation. */
    protected AddStrategyDisplayFields(
        meta: ContentVectorMetadata,
        all: Record<string, unknown>,
        contentItemEntity: EntityInfo | undefined,
        metaCfg: VectorMetadataConfig | undefined,
    ): void {
        for (const field of this.GetContentDisplayFields(contentItemEntity, metaCfg)) {
            const value = all[field.Name];
            if (value == null) continue;
            this.SetCoercedFieldValue(meta, field, value, metaCfg);
        }
    }

    /**
     * The ContentItem fields for the strategy: 'include'/'explicit' take fields marked Included;
     * 'all'/'exclude' take the eligible set (no PKs, UUIDs, binary, __mj_*) minus Included:false.
     */
    protected GetContentDisplayFields(entityInfo: EntityInfo | undefined, metaCfg: VectorMetadataConfig | undefined): EntityFieldInfo[] {
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
    protected SetCoercedFieldValue(
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
            meta[field.Name] = String(value).substring(0, this.ResolveMetadataTruncationLimit(field, metaCfg));
        }
    }

    /** Per-field truncation: explicit override → field MaxLength (if small) → configured default. */
    protected ResolveMetadataTruncationLimit(field: EntityFieldInfo, metaCfg: VectorMetadataConfig | undefined): number {
        const fieldCfg = metaCfg?.Fields?.[field.Name];
        if (fieldCfg?.TruncationLimit != null && fieldCfg.TruncationLimit > 0) return fieldCfg.TruncationLimit;
        if (field.MaxLength && field.MaxLength > 0 && field.MaxLength <= 5000) return field.MaxLength;
        return this.DefaultTruncation(metaCfg);
    }

    /** `VectorMetadata.DefaultTruncationLimit`, or the default the JSONType documents. */
    protected DefaultTruncation(metaCfg: VectorMetadataConfig | undefined): number {
        const configured = metaCfg?.DefaultTruncationLimit;
        return configured != null && configured > 0 ? configured : DOCUMENTED_DEFAULT_TRUNCATION;
    }

    /** Add the content entity's icon: default on under a set strategy, opt-in under 'explicit'. */
    protected AddEntityIconMetadata(
        meta: ContentVectorMetadata,
        entityInfo: EntityInfo | undefined,
        metaCfg: VectorMetadataConfig | undefined,
        explicit: boolean,
    ): void {
        const include = explicit ? metaCfg?.IncludeEntityIcon === true : metaCfg?.IncludeEntityIcon !== false;
        if (entityInfo?.Icon && include) meta['EntityIcon'] = entityInfo.Icon;
    }

    /** Add __mj_UpdatedAt for recency: default on under a set strategy, opt-in under 'explicit'. */
    protected AddUpdatedAtMetadata(
        meta: ContentVectorMetadata,
        all: Record<string, unknown>,
        metaCfg: VectorMetadataConfig | undefined,
        explicit: boolean,
    ): void {
        const include = explicit ? metaCfg?.IncludeUpdatedAt === true : metaCfg?.IncludeUpdatedAt !== false;
        if (all['__mj_UpdatedAt'] && include) meta['__mj_UpdatedAt'] = String(all['__mj_UpdatedAt']);
    }

    /** Add the item's tags: default on, opt-in under 'explicit'. */
    protected AddTagsMetadata(
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

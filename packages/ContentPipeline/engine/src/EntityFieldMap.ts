/**
 * @fileoverview The one place the well-known field set is mapped onto real entity columns.
 *
 * Declared once, here, rather than in any stage — which is what lets a stage read `Title` without
 * knowing it lands in `Name` on Content Item. A stage needing a field beyond this set uses the
 * working record's extension space; if it needs that value to persist, the answer is a real column
 * plus one line in this map, which is additive and local to the stage that needed it.
 *
 * @module @memberjunction/content-pipeline
 */

import { WellKnownField, WorkingRecordEntity } from '@memberjunction/content-pipeline-base';

/** How one well-known field maps onto a column. */
export interface FieldMapping {
    /** The column on the entity. */
    Column: string;
    /**
     * How the value is carried.
     *
     * `Date` round-trips through a real `Date`. **`Lookup` means the entity stores a foreign key
     * while the working record carries the related row's name** — a stage asks for `FileType` and
     * expects `'html'`, not a GUID. Such a field hydrates from the base view's denormalized name
     * column, and commits through {@link LookupResolver}, which turns the name back into a row id
     * under an explicit policy for a name that matches nothing.
     */
    Kind: 'Text' | 'Date' | 'Lookup';
    /** For `Lookup`: the denormalized name column on the base view. Defaults to `Column` minus `ID`. */
    ReadColumn?: string;
    /** For `Lookup`: the entity whose rows the name resolves against. */
    LookupEntity?: string;
}

/** The well-known-field map for one entity. A field absent here is not persistable on it. */
export type EntityFieldMap = Partial<Record<WellKnownField, FieldMapping>>;

/**
 * Content Item carries the full set: it is the entity most stages work over.
 *
 * `Title` maps to `Name` because that is the column MemberJunction already uses for an item's
 * display name, and adding a second one would leave two sources of truth.
 */
const ContentItemMap: EntityFieldMap = {
    Text: { Column: 'Text', Kind: 'Text' },
    Title: { Column: 'Name', Kind: 'Text' },
    Date: { Column: 'Date', Kind: 'Date' },
    Modality: { Column: 'Modality', Kind: 'Text' },
    Decorator: { Column: 'Decorator', Kind: 'Text' },
    FileType: { Column: 'ContentFileTypeID', Kind: 'Lookup', ReadColumn: 'ContentFileType', LookupEntity: 'MJ: Content File Types' },
    ContentType: { Column: 'ContentTypeID', Kind: 'Lookup', ReadColumn: 'ContentType', LookupEntity: 'MJ: Content Types' },
};

/** Content Source carries only what a Discover driver can meaningfully resolve about a source. */
const ContentSourceMap: EntityFieldMap = {
    Title: { Column: 'Name', Kind: 'Text' },
    FileType: { Column: 'ContentFileTypeID', Kind: 'Lookup' },
    ContentType: { Column: 'ContentTypeID', Kind: 'Lookup' },
};

/** Content Item Chunk carries the text a segmenter produced and the modality it is in. */
const ContentItemChunkMap: EntityFieldMap = {
    Text: { Column: 'Text', Kind: 'Text' },
    Modality: { Column: 'Modality', Kind: 'Text' },
    Decorator: { Column: 'Decorator', Kind: 'Text' },
};

const Maps: Record<WorkingRecordEntity, EntityFieldMap> = {
    'Content Item': ContentItemMap,
    'Content Source': ContentSourceMap,
    'Content Item Chunk': ContentItemChunkMap,
};

/** The well-known-field map for an entity. */
export function GetEntityFieldMap(entity: WorkingRecordEntity): EntityFieldMap {
    return Maps[entity];
}

/**
 * Every status field the pipeline advances, per entity, in pipeline order.
 *
 * The committer uses this for the completion signal: marking a record complete sets every status
 * here that has not already finished, so no later stage treats it as ready.
 */
const StatusFields: Record<WorkingRecordEntity, readonly string[]> = {
    'Content Item': ['ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus'],
    // Discover advances no status column — see BasePipelineStage.StatusField.
    'Content Source': [],
    'Content Item Chunk': ['TaggingStatus', 'EmbeddingStatus'],
};

/** The status fields the pipeline advances on an entity, in pipeline order. */
export function GetStatusFields(entity: WorkingRecordEntity): readonly string[] {
    return StatusFields[entity];
}

/**
 * The MemberJunction entity names the pipeline operates on.
 *
 * All three are MJ core entities with a single-column `ID` primary key, which is what lets the
 * pipeline key records with {@link CompositeKey.FromID}. Keeping the set a literal union rather
 * than `string` makes that assumption true by construction instead of by convention.
 */
export type PipelineEntityName = 'MJ: Content Sources' | 'MJ: Content Items' | 'MJ: Content Item Chunks';

/** The MemberJunction entity name backing each working-record entity. */
const EntityNames: Record<WorkingRecordEntity, PipelineEntityName> = {
    'Content Source': 'MJ: Content Sources',
    'Content Item': 'MJ: Content Items',
    'Content Item Chunk': 'MJ: Content Item Chunks',
};

/** The `MJ: `-prefixed entity name to load through `Metadata`. */
export function GetEntityName(entity: WorkingRecordEntity): PipelineEntityName {
    return EntityNames[entity];
}

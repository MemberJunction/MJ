/**
 * @fileoverview Where the well-known fields map onto real columns, so a stage can read `Title` without knowing
 * it lands in `Name`. Persisting a new field is a real column plus one line here.
 *
 * @module @memberjunction/content-pipeline
 */

import { WellKnownField, WorkingRecordEntity } from '@memberjunction/content-pipeline-base';

/** How one well-known field maps onto a column. */
export interface FieldMapping {
    Column: string;
    /**
     * `Lookup`: the column is a foreign key but the working record carries the related row's name (a stage
     * sees `'html'`, not a GUID). It hydrates from the view's name column and commits by name lookup.
     */
    Kind: 'Text' | 'Date' | 'Lookup';
    /** For `Lookup`: the view's denormalized name column. */
    ReadColumn?: string;
    /** For `Lookup`: the entity the name resolves against. */
    LookupEntity?: 'MJ: Content File Types' | 'MJ: Content Types';
}

/** The field map for one entity. A field absent here does not persist on it. */
export type EntityFieldMap = Partial<Record<WellKnownField, FieldMapping>>;

const FileTypeLookup: FieldMapping = { Column: 'ContentFileTypeID', Kind: 'Lookup', ReadColumn: 'ContentFileType', LookupEntity: 'MJ: Content File Types' };
const ContentTypeLookup: FieldMapping = { Column: 'ContentTypeID', Kind: 'Lookup', ReadColumn: 'ContentType', LookupEntity: 'MJ: Content Types' };

const Maps: Record<WorkingRecordEntity, EntityFieldMap> = {
    'Content Item': {
        Text: { Column: 'Text', Kind: 'Text' },
        Title: { Column: 'Name', Kind: 'Text' },
        Date: { Column: 'Date', Kind: 'Date' },
        Modality: { Column: 'Modality', Kind: 'Text' },
        Decorator: { Column: 'Decorator', Kind: 'Text' },
        FileType: FileTypeLookup,
        ContentType: ContentTypeLookup,
    },
    'Content Source': {
        Title: { Column: 'Name', Kind: 'Text' },
        FileType: FileTypeLookup,
        ContentType: ContentTypeLookup,
    },
    'Content Item Chunk': {
        Text: { Column: 'Text', Kind: 'Text' },
        Modality: { Column: 'Modality', Kind: 'Text' },
        Decorator: { Column: 'Decorator', Kind: 'Text' },
    },
};

/** The field map for an entity. */
export function GetEntityFieldMap(entity: WorkingRecordEntity): EntityFieldMap {
    return Maps[entity];
}

/** The status columns the pipeline advances, in pipeline order. Discover advances none. */
const StatusFields: Record<WorkingRecordEntity, readonly string[]> = {
    'Content Item': ['ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus'],
    'Content Source': [],
    'Content Item Chunk': ['TaggingStatus', 'EmbeddingStatus'],
};

export function GetStatusFields(entity: WorkingRecordEntity): readonly string[] {
    return StatusFields[entity];
}

/** The entities the pipeline operates on — all MJ core entities with a single-column `ID` key. */
export type PipelineEntityName = 'MJ: Content Sources' | 'MJ: Content Items' | 'MJ: Content Item Chunks';

const EntityNames: Record<WorkingRecordEntity, PipelineEntityName> = {
    'Content Source': 'MJ: Content Sources',
    'Content Item': 'MJ: Content Items',
    'Content Item Chunk': 'MJ: Content Item Chunks',
};

export function GetEntityName(entity: WorkingRecordEntity): PipelineEntityName {
    return EntityNames[entity];
}

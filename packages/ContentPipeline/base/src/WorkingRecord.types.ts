/**
 * @fileoverview Types for the working record — the one structure passed from stage to stage: an identity,
 * well-known fields that map onto real columns, and an open extension space.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** The entities a working record can stand for. */
export type WorkingRecordEntity = 'Content Source' | 'Content Item' | 'Content Item Chunk';

/**
 * The fields that map onto real columns. Anything a stage wants persisted is one of these; anything only a
 * later stage in the same run needs goes in the extension space.
 */
export type WellKnownField = 'Text' | 'FileType' | 'ContentType' | 'Title' | 'Date' | 'Modality' | 'Decorator';

/** Every well-known field name, for iteration. */
export const WellKnownFields: readonly WellKnownField[] = ['Text', 'FileType', 'ContentType', 'Title', 'Date', 'Modality', 'Decorator'] as const;

/** `Date` is kept as a real `Date` so stages never have to agree on a string format. */
export type WellKnownFieldValue = string | Date | null;

/**
 * One well-known field: its value, how much the stage that set it trusts it, and which stage that was.
 * Confidence is an integer, higher wins, no ceiling; it is set in stage code, not configuration.
 */
export class WorkingRecordField {
    constructor(
        public Value: WellKnownFieldValue,
        public Confidence: number,
        /** `<StageName>` or `<StageName>.<Variant>`, e.g. `Discover.RSS`. */
        public SetBy: string,
    ) {}
}

/** One entry of the `FieldConfidence` column, e.g. `{"Title":{"Score":4,"SetBy":"Discover.RSS"}}`. */
export type FieldConfidenceEntry = {
    Score: number;
    SetBy: string;
};

/** The whole `FieldConfidence` column. */
export type FieldConfidenceMap = Partial<Record<WellKnownField, FieldConfidenceEntry>>;

/**
 * Which record a stage is working on. Before it is persisted the identity is its URL (Discover's stable
 * identity for what it found); once a primary key exists, that is used instead. The URL is kept so a
 * re-discovery can match the existing row.
 */
export class WorkingRecordIdentity {
    constructor(
        public readonly Entity: WorkingRecordEntity,
        public readonly EphemeralID: string,
        /** The durable primary key once committed; `null` before. */
        public RecordID: string | null = null,
    ) {}

    /** True once this record has a durable primary key. */
    public get IsPersisted(): boolean {
        return this.RecordID !== null;
    }

    /** The real key when there is one, the URL otherwise. */
    public get Key(): string {
        return this.RecordID ?? this.EphemeralID;
    }
}

/**
 * @fileoverview The working record — the one structure passed from stage to stage.
 *
 * A working record has three parts: an identity, a set of well-known fields that map onto real
 * entity columns, and an open extension space. Stages read and write the record; only
 * `WorkingRecordHydrator` and `WorkingRecordCommitter` touch storage. That separation is what lets
 * the same stage code run live or as a test, alone or chained, without knowing which.
 *
 * @module @memberjunction/content-pipeline-base
 */

/**
 * The entities a working record can stand for. A stage declares which one it runs over, and the
 * hydrator/committer pair for that entity is the only code that maps between these names and real
 * rows.
 */
export type WorkingRecordEntity = 'Content Source' | 'Content Item' | 'Content Item Chunk';

/**
 * The fixed set of fields that map directly onto real entity columns.
 *
 * Anything a stage wants to persist is one of these. Anything a stage wants only to hand to a later
 * stage in the same run belongs in the extension space instead.
 */
export type WellKnownField =
    | 'Text'
    | 'FileType'
    | 'ContentType'
    | 'Title'
    | 'Date'
    | 'Modality'
    | 'Decorator';

/** Every well-known field name, for iteration. Keep in step with {@link WellKnownField}. */
export const WellKnownFields: readonly WellKnownField[] = [
    'Text',
    'FileType',
    'ContentType',
    'Title',
    'Date',
    'Modality',
    'Decorator',
] as const;

/**
 * The value types a well-known field may carry. `Date` is the only non-string, and it is kept as a
 * real `Date` in memory so a stage never has to agree with another stage on a string format.
 */
export type WellKnownFieldValue = string | Date | null;

/**
 * One well-known field: its value, how much the stage that set it trusts it, and which stage that
 * was.
 *
 * Confidence is an integer, higher meaning more trusted, with no fixed ceiling. It is set in stage
 * code and deliberately not exposed as configuration — nobody adjusting the number directly is what
 * makes it trustworthy as a record of what actually happened.
 */
export class WorkingRecordField {
    /** The field's current value. */
    public Value: WellKnownFieldValue;

    /** How much the stage that set this value trusts it. Higher wins; see {@link WorkingRecord.Propose}. */
    public Confidence: number;

    /**
     * Which stage set the current value, as `<StageName>` or `<StageName>.<Variant>` — e.g.
     * `Discover.RSS`. Recorded so the provenance of every resolved field survives into storage.
     */
    public SetBy: string;

    constructor(value: WellKnownFieldValue, confidence: number, setBy: string) {
        this.Value = value;
        this.Confidence = confidence;
        this.SetBy = setBy;
    }
}

/**
 * The persisted form of a field's confidence, as it appears in the `FieldConfidence` JSON column on
 * Content Source / Content Item / Content Item Chunk — e.g. `{"Title":{"Score":4,"SetBy":"Discover.RSS"}}`.
 */
export type FieldConfidenceEntry = {
    /** The confidence score of the stored value. */
    Score: number;
    /** The stage that set the stored value. */
    SetBy: string;
};

/** The whole `FieldConfidence` column: one entry per well-known field that has ever been set. */
export type FieldConfidenceMap = Partial<Record<WellKnownField, FieldConfidenceEntry>>;

/**
 * A reference to the record a stage is working on.
 *
 * Before anything is persisted this is an ephemeral, run-scoped identity — in practice the URL,
 * which is already Discover's stable identity for what it found. Once a real primary key exists it
 * becomes the identity for every stage from that point on. No stage needs to know which kind it is
 * currently holding.
 */
export class WorkingRecordIdentity {
    /** Which entity this record stands for. */
    public readonly Entity: WorkingRecordEntity;

    /** The durable primary key, once the record has been committed. `null` before that. */
    public RecordID: string | null;

    /**
     * The run-scoped stand-in used until a primary key exists — the record's URL. Retained after
     * persistence so a re-discovery can match an existing record by it (phase F11).
     */
    public readonly EphemeralID: string;

    constructor(entity: WorkingRecordEntity, ephemeralID: string, recordID: string | null = null) {
        this.Entity = entity;
        this.EphemeralID = ephemeralID;
        this.RecordID = recordID;
    }

    /** True once this record has a durable primary key. */
    public get IsPersisted(): boolean {
        return this.RecordID !== null;
    }

    /** The identity to log or key a map by: the real key when there is one, the URL otherwise. */
    public get Key(): string {
        return this.RecordID ?? this.EphemeralID;
    }
}

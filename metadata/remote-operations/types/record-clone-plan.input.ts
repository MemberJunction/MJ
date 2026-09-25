/** A single primary-key field/value pair identifying a record. */
export interface RecordCloneKeyValuePair {
    /** Primary-key field name (e.g. "ID"). */
    FieldName: string;
    /** Primary-key value as a string. */
    Value: string;
}

/** Record key expressed as composite key-value pairs. */
export interface RecordCloneKey {
    KeyValuePairs: RecordCloneKeyValuePair[];
}

/** Options controlling plan generation. */
export interface RecordClonePlanOptions {
    DryRun?: boolean;
    Preset?: string;
    MaxDepth?: number;
    MaxRecords?: number;
    Subtypes?: 'include' | 'exclude';
    Hierarchy?: 'subtree' | 'node';
    SoftLinks?: 'skip' | 'include';
    /** Whether Entity Actions run on the cloned rows. Default from the entity's `Hooks` (else 'fire'); changing it needs `Clone Records: Fire Hooks`. */
    EntityActions?: 'suppress' | 'fire';
    /** Whether Entity AI Actions run. Default from the entity's `Hooks` (else 'suppress'); changing it needs `Clone Records: Fire Hooks`. */
    AIActions?: 'suppress' | 'fire';
    Embeddings?: 'copy' | 'regenerate';
    FieldOverrides?: Record<string, string | number | boolean | null>;
    PromptedValues?: Record<string, string | number | boolean | null>;
    /** Point foreign keys on the root at other records. Only fields listed in the entity's `Clone.UI.RetargetFields` apply. */
    Retarget?: Array<{ EntityName: string; Field: string; Value: string }>;
    NamingTemplate?: string;
    NamingStrategy?: 'suffix' | 'increment' | 'prompt' | 'none';
    Naming?: {
        Template?: string;
        Strategy?: 'suffix' | 'increment' | 'prompt' | 'none';
    };
    Reason?: string;
}

/** Per-node action override. */
export interface RecordCloneNodeOverride {
    Key: string;
    Action?: 'Create' | 'Reference' | 'Skip' | 'Blocked';
    FieldOverrides?: Record<string, string | number | boolean | null>;
}

/** Per-edge policy override. */
export interface RecordCloneEdgeOverride {
    RelationshipID?: string;
    Policy: 'Deep' | 'Reference' | 'Skip';
}

/** Input for `RecordClone.Plan`. */
export interface RecordClonePlanInput {
    EntityName?: string;
    SourceRecordKey?: RecordCloneKey;
    Roots?: Array<{ EntityName: string; Key: RecordCloneKey }>;
    Options?: RecordClonePlanOptions;
    NodeOverrides?: RecordCloneNodeOverride[];
    EdgeOverrides?: RecordCloneEdgeOverride[];
    ExpectedPlanHash?: string;
}

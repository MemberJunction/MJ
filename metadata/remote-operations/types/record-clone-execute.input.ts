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

/** Options controlling clone execution. */
export interface RecordCloneExecuteOptions {
    DryRun?: boolean;
    Preset?: string;
    MaxDepth?: number;
    MaxRecords?: number;
    Subtypes?: 'include' | 'exclude';
    Hierarchy?: 'subtree' | 'node';
    SoftLinks?: 'skip' | 'include';
    EntityActions?: 'suppress' | 'fire';
    AIActions?: 'suppress' | 'fire';
    Embeddings?: 'copy' | 'regenerate';
    FieldOverrides?: Record<string, string | number | boolean | null>;
    PromptedValues?: Record<string, string | number | boolean | null>;
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

/** Input for `RecordClone.Execute`. */
export interface RecordCloneExecuteInput {
    EntityName?: string;
    SourceRecordKey?: RecordCloneKey;
    Roots?: Array<{ EntityName: string; Key: RecordCloneKey }>;
    Options?: RecordCloneExecuteOptions;
    NodeOverrides?: RecordCloneNodeOverride[];
    EdgeOverrides?: RecordCloneEdgeOverride[];
    ExpectedPlanHash?: string;
}

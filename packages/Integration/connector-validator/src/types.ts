/**
 * Shared types for the four-invariant validator.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.17.1
 */
export type InvariantResult = 'Pass' | 'Fail' | 'NotApplicable';

export interface FailureDetail {
    InvariantNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    Severity: 'Error' | 'Warning';
    Failure: string;
    Location: string;
    SuggestedFix: string;
}

export interface InvariantValidationResult {
    ConnectorName: string;
    Invariant1_ProvableOnly: InvariantResult;
    /**
     * Invariant 1b — script-source inspection. Closes the self-citation
     * fraud loophole that allowed Run 1 of HubSpot to commit 852
     * CODE_EVIDENCE entries citing URLs the script never fetched.
     */
    Invariant1b_ScriptInspection: InvariantResult;
    Invariant2_ThreeWayNameMatch: InvariantResult;
    Invariant3_FKMetadataCorrectness: InvariantResult;
    Invariant4_CapabilityMethodMatch: InvariantResult;
    /**
     * Invariant 5 — Hierarchy validity. Every IO.ParentObjectName resolves
     * to an existing IO; every IO.ParentObjectIDFieldName resolves to an
     * IOF whose RelatedIntegrationObjectID points to the parent IO;
     * HierarchyPath consistent with ParentObjectName chain; TraversalOrder
     * is a valid topological sort.
     */
    Invariant5_HierarchyValidity: InvariantResult;
    /**
     * Invariant 6 — Incremental sync consistency. For every IO where
     * SupportsIncrementalSync=true: IncrementalCursorFieldName is set;
     * the named IOF exists on this IO; that IOF's Type is compatible
     * with the declared IncrementalWatermarkType
     * (Timestamp → date/datetime, Version → integer/string,
     *  Cursor/ChangeToken → string).
     */
    Invariant6_IncrementalConsistency: InvariantResult;
    /**
     * Invariant 7 — CRUD bodies are structurally real. Inspects method
     * bodies via ts-morph; rejects bodies consisting solely of 501-stubs,
     * "not implemented" throws, or empty returns when the capability
     * flag is true. Catches the failure mode where Invariant 4 (existence)
     * passes but methods do no runtime work.
     */
    Invariant7_CRUDBodiesReal: InvariantResult;
    FailureDetails: FailureDetail[];
    WarningDetails: FailureDetail[];
    Overall: 'Pass' | 'Fail';
    /** ISO 8601 timestamp */
    ValidatedAt: string;
}

export interface MetadataFile {
    fields: {
        Name: string;
        ClassName: string;
        // Other root fields are tolerated but not enforced here.
        [key: string]: unknown;
    };
    relatedEntities?: {
        'MJ: Integration Objects'?: Array<{
            fields: {
                Name: string;
                Source?: string;
                SupportsWrite?: boolean;
                IncludeInActionGeneration?: boolean;
                // Bidirectional / hierarchy / incremental / custom-object expansion (framework A.1):
                IsBidirectional?: boolean;
                ParentObjectName?: string | null;
                ParentObjectIDFieldName?: string | null;
                SupportsIncrementalSync?: boolean;
                IncrementalCursorFieldName?: string | null;
                IncrementalWatermarkType?: 'Timestamp' | 'Version' | 'Cursor' | 'ChangeToken' | null;
                IsStandardObject?: boolean;
                IsCustomObject?: boolean;
                BulkAPIPath?: string | null;
                BulkAPIMethod?: string | null;
                // CRUD routing (Phase 0):
                CreateAPIPath?: string | null;
                CreateMethod?: string | null;
                UpdateAPIPath?: string | null;
                UpdateMethod?: string | null;
                DeleteAPIPath?: string | null;
                GetAPIPath?: string | null;
                GetMethod?: string | null;
                SearchAPIPath?: string | null;
                SearchMethod?: string | null;
                ListAPIPath?: string | null;
                ListMethod?: string | null;
                [key: string]: unknown;
            };
            relatedEntities?: {
                'MJ: Integration Object Fields'?: Array<{
                    fields: {
                        Name: string;
                        IsPrimaryKey?: boolean;
                        IsRequired?: boolean;
                        IsReadOnly?: boolean;
                        RelatedIntegrationObjectID?: string;
                        RelatedIntegrationObjectFieldName?: string;
                        // IOF expansion (framework A.1):
                        IsAPIWritable?: boolean;
                        IsComputed?: boolean;
                        IsImmutableAfterCreate?: boolean;
                        IsCustomField?: boolean;
                        IsIncrementalCursorCandidate?: boolean;
                        IsForeignKey?: boolean;
                        FKDetectionMethod?: 'openapi-ref' | 'sdk-relationship-annotation' | 'name-pattern-suffix' | 'url-path-parent' | 'vendor-specific' | 'unknown' | null;
                        IsDeprecated?: boolean;
                        Type?: string;
                        [key: string]: unknown;
                    };
                }>;
            };
        }>;
    };
}

export interface ProvenanceFile {
    Entries: Array<{
        URL: string;
        AccessedAt: string;
        UsedFor: string;
        SourceTier: 1 | 2 | 3;
        SourceCategory: string;
        EvidenceStrength: string;
        TargetField: string;
    }>;
}

export interface CodeEvidenceFile {
    Entries: Array<{
        ScriptPath: string;
        ScriptRunAt: string;
        /** URL the script claims it fetched to produce this entry. Inspector verifies. */
        SourceURL?: string;
        SourceBlob?: string;
        StructuredOutput: unknown;
        SchemaValidationStatus: 'Passed' | 'Failed';
        TargetField: string;
    }>;
}

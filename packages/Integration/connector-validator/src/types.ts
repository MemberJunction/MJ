/**
 * Shared types for the five-invariant validator.
 *
 * Invariants per `INTEGRATION-REDESIGN-V1.md` §12: original 5 only
 * (1, 1b, 2, 3, 4). Invariants 5/6/7 were reverted in the validator
 * cleanup because they checked for columns that Phase 0 dropped or
 * imposed heuristics beyond the redesign discipline.
 */
export type InvariantResult = 'Pass' | 'Fail' | 'NotApplicable';

export interface FailureDetail {
    InvariantNumber: 1 | 2 | 3 | 4;
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

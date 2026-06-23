/**
 * @fileoverview Shared contract types for the duplicate-detection reasoning seam.
 *
 * These types are the pluggable boundary between the {@link DuplicateRecordDetector}
 * pipeline and whichever {@link DuplicateReasoningProvider} (Prompt or Agent) actually
 * reasons over a matched set. The input is a structural description of the entity plus
 * the field-level deltas for one source record's candidate set; the output is a single
 * structured verdict for that set. Both shipped providers emit the identical contract so
 * promoting an entity from `Prompt` to `Agent` mode is a config change, not a rewrite.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJEntityDocumentEntity } from '@memberjunction/core-entities';

/** One record's value for a single differing field, addressed by record id. */
export interface ReasoningFieldValue {
    /** The candidate/source record id (URL-segment composite key) this value belongs to. */
    RecordID: string;
    /** The field value held by that record (already stringified for the prompt; null when empty). */
    Value: string | null;
}

/**
 * The per-field delta passed to the reasoner. Only fields that differ across the set are
 * included — identical fields are omitted so the reasoner focuses on what matters.
 */
export interface ReasoningFieldDelta {
    /** The field name. */
    FieldName: string;
    /** Per-record values for this field. */
    Values: ReasoningFieldValue[];
}

/** Description of the source record (the current default survivor) being reasoned over. */
export interface ReasoningSourceRecord {
    /** The source record id (URL-segment composite key). */
    RecordID: string;
    /** Human-readable label (name-field value, falling back to the key). */
    Label: string;
    /** Provenance hint (e.g. "Local"); free-form, surfaced in the instructions. */
    Provenance: string;
    /** Approximate count of dependent records, for the "cheapest to retain" heuristic. */
    DependentCount: number;
}

/** Description of one vector-surfaced candidate match. */
export interface ReasoningCandidate {
    /** The candidate record id (URL-segment composite key). */
    RecordID: string;
    /** Human-readable label. */
    Label: string;
    /** The raw vector similarity score (0–1) that surfaced this candidate. */
    VectorScore: number;
    /** Provenance hint. */
    Provenance: string;
    /** Approximate dependent-record count. */
    DependentCount: number;
}

/**
 * The complete input to a single reasoning call — one source record's matched set.
 * This is assembled once per set by the detector (after all filtering) and is identical
 * regardless of which provider runs.
 */
export interface DuplicateReasoningInput {
    /** Registered entity name (e.g. "Accounts"). */
    EntityName: string;
    /** Optional entity description for context. */
    EntityDescription: string | null;
    /** The entity document driving this run (carries the reasoning prompt/agent ids + mode). */
    EntityDocument: MJEntityDocumentEntity;
    /** The source record under review. */
    SourceRecord: ReasoningSourceRecord;
    /** The candidate matches for the source record. */
    Candidates: ReasoningCandidate[];
    /** The field-level deltas across the whole set (differing fields only). */
    FieldDeltas: ReasoningFieldDelta[];
}

/** The recommendation verdict. */
export type DuplicateReasoningRecommendation = 'Merge' | 'NotDuplicate' | 'Uncertain';

/**
 * One per-field survivor choice from the reasoner: keep this field's value from the
 * record identified by {@link SourceRecordID}. Resolved to a literal `{FieldName, Value}`
 * for `Metadata.MergeRecords` at merge time.
 */
export interface DuplicateReasoningFieldChoice {
    /** The field whose surviving value is being chosen. */
    FieldName: string;
    /** The record id whose value should be kept for this field. */
    SourceRecordID: string;
}

/**
 * The structured verdict for a matched set. Persisted onto each match row's LLM* columns
 * along with the run id of whichever provider ran.
 */
export interface DuplicateReasoningOutput {
    /** Whether the reasoning call itself succeeded (not whether it recommended a merge). */
    Success: boolean;
    /** Populated when {@link Success} is false. */
    ErrorMessage?: string;
    /** The verdict for the set. */
    Recommendation: DuplicateReasoningRecommendation;
    /** Reasoning-adjusted confidence (0–1), distinct from the vector score. */
    Confidence: number;
    /** Human-readable rationale a reviewer can trust. */
    Reasoning: string;
    /** The record id the reasoner proposes should survive (null when NotDuplicate). */
    SurvivorRecordID: string | null;
    /** Per-field survivor choices (only fields whose value comes from a non-survivor). */
    FieldChoices: DuplicateReasoningFieldChoice[];
    /**
     * The AI Prompt Run id, when a {@link DuplicateReasoningProvider} ran via a single-shot
     * prompt. Mutually exclusive with {@link AIAgentRunID}.
     */
    AIPromptRunID?: string | null;
    /**
     * The AI Agent Run id, when a {@link DuplicateReasoningProvider} ran via an agent.
     * Mutually exclusive with {@link AIPromptRunID}.
     */
    AIAgentRunID?: string | null;
}

/**
 * Per-call context threaded from the detector into the reasoning provider so the provider
 * runs on the same request-scoped provider/user as the rest of the pipeline (multi-provider
 * safety) rather than reaching for the global default.
 */
export interface DuplicateReasoningContext {
    /** The request-scoped metadata provider (server-side). */
    Provider?: IMetadataProvider;
    /** The context user for the run. */
    ContextUser?: UserInfo;
}

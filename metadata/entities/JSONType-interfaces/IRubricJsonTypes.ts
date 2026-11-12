/**
 * JSON shapes for the rubric columns that store structured bags.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 *
 * @see plans/rubrics/RUBRICS_PLAN.md §4.1
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
    [key: string]: JsonValue;
}

export interface IRubricDeterministicRule {
    /** JSON path into the subject content. */
    Path: string;
    Operator: 'equals' | 'notEquals' | 'in' | 'notIn' | 'contains' | 'exists' | 'between' | 'gte' | 'lte' | 'matches';
    Values: JsonValue[];
    /** Level label or numeric value when the rule matches. */
    LevelWhenTrue: string;
    LevelWhenFalse: string;
    NotApplicableWhenMissing?: boolean;
}

/** RubricCriterion.EvaluatorConfig */
export interface IRubricCriterionEvaluatorConfig {
    Deterministic?: IRubricDeterministicRule;
    AI?: { Hints?: string; RequireQuote?: boolean };
    /** Keyed by consuming app, for example "Caliber". Changing it is a major bump. */
    Extensions?: Record<string, JsonObject>;
}

export interface IRubricEvidenceQuote {
    Type: 'Quote';
    Text: string;
    Start?: number;
    End?: number;
    Verified?: boolean;
}

export interface IRubricEvidenceTurn {
    Type: 'Turn';
    ConversationDetailID?: string;
    TurnIndex: number;
    Quote?: string;
}

export interface IRubricEvidenceFile {
    Type: 'File';
    FileID: string;
    Page?: number;
    Note?: string;
}

export interface IRubricEvidenceUrl {
    Type: 'Url';
    Url: string;
    Title?: string;
}

export interface IRubricEvidenceRecord {
    Type: 'Record';
    EntityName: string;
    RecordID: string;
    Note?: string;
}

export interface IRubricEvidenceMedia {
    Type: 'Media';
    FileID: string;
    StartMs: number;
    EndMs: number;
}

/** RubricEvaluationScore.Evidence */
export type IRubricEvidence =
    | IRubricEvidenceQuote
    | IRubricEvidenceTurn
    | IRubricEvidenceFile
    | IRubricEvidenceUrl
    | IRubricEvidenceRecord
    | IRubricEvidenceMedia;

/** RubricEvaluation.Metadata */
export interface IRubricEvaluationMetadata {
    Evaluator?: { Name?: string; Settings?: JsonObject };
    Samples?: { Count?: number; Spread?: string };
    Timings?: JsonObject;
    RequestedBy?: { EntityName: string; RecordID: string };
    DroppedEvidenceCount?: number;
    Warnings?: string[];
}

export interface IRubricVersionChange {
    Path: string;
    Property: string;
    From: JsonValue;
    To: JsonValue;
    Bump: 'Major' | 'Minor' | 'Patch';
}

/** RubricVersion.ChangeDetails */
export interface IRubricVersionChangeDetails {
    BaseVersionID: string | null;
    Changes: IRubricVersionChange[];
}

/**
 * AIAgentRubric.EvaluatorConfig — which evaluator scores the link, and with which prompts.
 *
 * For the LLM evaluator three prompts compose one call: the evaluator prompt (the parent, which owns
 * the JSON reply contract), the judge prompt rendered into its `judgePrompt` slot, and the criterion
 * prompt that renders each criterion. PromptID/PromptName name the judge; for the Decision evaluator
 * they name the decision prompt instead. DecisionThenLLM runs the decision first (DecisionPromptID/Name,
 * DecisionModelID) and the LLM judge (PromptID/Name, ModelID) only for the criteria the decision did not settle.
 */
export interface IRubricEvaluatorSelection {
    EvaluatorType: 'AIPrompt' | 'Agent' | 'Deterministic' | 'External' | 'Human' | 'Self';
    /** A registered evaluator name (LLM, Decision, DecisionThenLLM, Agent, Deterministic, or a custom one). Wins over EvaluatorType. */
    EvaluatorName?: string;
    /** LLM: the judge prompt. Decision: the decision prompt. */
    PromptID?: string;
    /** The same prompt by name, when no PromptID is set. For example `Rubric Judge - Sage`. */
    PromptName?: string;
    /** LLM: the parent evaluator prompt. Default `Rubric Evaluator`. Must return the same JSON. */
    SystemPromptID?: string;
    SystemPromptName?: string;
    /** LLM and Decision: the prompt that renders one criterion. Default `Rubric Criterion`. */
    CriterionPromptID?: string;
    CriterionPromptName?: string;
    /** LLM: which prompt's model bindings choose the model. System (default) or Judge. */
    ModelSelection?: 'System' | 'Judge';
    AgentID?: string;
    /** Pins the model. */
    ModelID?: string;
    /** LLM: runs the rubric this many times and keeps each criterion's median level. */
    Samples?: number;
    Mode?: 'SinglePass' | 'PerCriterion';
    /** DecisionThenLLM: the decision prompt for its decision pass. Default `Default Decision`. PromptID/PromptName stay the LLM judge. */
    DecisionPromptID?: string;
    DecisionPromptName?: string;
    /** DecisionThenLLM: pins the decision model. ModelID stays the LLM's model. */
    DecisionModelID?: string;
    /**
     * DecisionThenLLM: a criterion whose calibrated decision confidence is below this (0..1, default 0.7)
     * goes to the LLM. Applies only where a calibration for use `rubric-evaluation` and the criterion's key exists.
     */
    DecisionConfidenceThreshold?: number;
    /** Settings for a custom evaluator, keyed by its evaluator name. */
    Extensions?: Record<string, JsonValue>;
}

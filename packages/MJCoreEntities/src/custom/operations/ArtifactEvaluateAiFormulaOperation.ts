import { BaseRemotableOperation } from '@memberjunction/core';

/**
 * Operation key for opt-in spreadsheet `=MJ.AI(...)` batch evaluation (`H3 §5.2b`).
 */
export const ARTIFACT_EVALUATE_AI_FORMULA_KEY = 'Artifact.EvaluateAiFormula';

/** Maximum number of `=MJ.AI(...)` cells allowed in a single explicit batch evaluation. */
export const MAX_AI_FORMULA_BATCH_CELLS = 50;

/**
 * Single `=MJ.AI(...)` cell evaluation request entry.
 */
export interface ArtifactAiFormulaCellRequest {
    /** Worksheet identifier. */
    SheetID: string;
    /** Canonical A1 cell coordinate (e.g. `'C4'`). */
    Address: string;
    /** Prompt string extracted from `=MJ.AI(prompt, ...)`. */
    Prompt: string;
    /** Serialized resolved values of referenced cells/ranges. */
    ContextValuesJSON: string;
    /** Deterministic SHA/FNV input hash for cache deduplication. */
    InputHash: string;
}

/**
 * Input payload for {@link ArtifactEvaluateAiFormulaOperation}.
 */
export interface ArtifactEvaluateAiFormulaInput {
    /** Optional hosting `MJ: Artifacts` ID for permission & audit attribution. */
    ArtifactID?: string | null;
    /** Batch of up to 50 `=MJ.AI(...)` cells explicitly triggered for evaluation. */
    Cells: ArtifactAiFormulaCellRequest[];
    /** Optional explicit AI model override name. */
    ModelOverride?: string | null;
}

/**
 * Result for a single evaluated `=MJ.AI(...)` cell.
 */
export interface ArtifactAiFormulaCellResult {
    /** Worksheet identifier. */
    SheetID: string;
    /** Canonical A1 coordinate. */
    Address: string;
    /** Input hash corresponding to this evaluated output. */
    InputHash: string;
    /** Evaluated text/scalar value from the LLM. */
    Value: string;
    /** Non-fatal cell-level error message if evaluation failed. */
    ErrorMessage?: string | null;
    /** True when permission or quota check refused execution. */
    AccessDenied?: boolean;
}

/**
 * Output payload for {@link ArtifactEvaluateAiFormulaOperation}.
 */
export interface ArtifactEvaluateAiFormulaOutput {
    /** Evaluated cell results matching requested `Cells`. */
    Results: ArtifactAiFormulaCellResult[];
}

/**
 * Typed client-safe Remote Operation contract for explicit opt-in evaluation of
 * `=MJ.AI(prompt, [cellOrRange...])` spreadsheet formulas (`§5.2b`).
 */
export class ArtifactEvaluateAiFormulaOperation extends BaseRemotableOperation<
    ArtifactEvaluateAiFormulaInput,
    ArtifactEvaluateAiFormulaOutput
> {
    public readonly OperationKey = ARTIFACT_EVALUATE_AI_FORMULA_KEY;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'artifact:edit';
    public readonly RequiresSystemUser = false;
}
